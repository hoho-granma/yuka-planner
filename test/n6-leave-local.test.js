/*
 * N6(1단계): household-sync leaveLocal — 이 기기에서만 가구를 나간다. 서버 쓰기 0건·로컬 키 정리·재참여 가능.
 * (화면 연결·MSG 문구는 N4 커밋 이후 app.js·household-view.js 단계에서 추가)
 * 실행: node test/n6-leave-local.test.js
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const HS = require("../js/household-sync.js");
const HV = require("../js/household-view.js");
const APP = fs.readFileSync(path.join(__dirname, "..", "js", "app.js"), "utf8");

let passed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log("  ok  - " + name); } catch (e) { process.exitCode = 1; console.log("  FAIL- " + name + "\n      " + (e.stack || e).split("\n").slice(0, 4).join("\n      ")); }
}
const memStorage = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), keys: () => [...m.keys()] }; };
function adapter() {
  const docs = new Map(), calls = [], ls = [];
  const a = { calls, docs, ls,
    async get(p) { calls.push(["get", p]); return docs.has(p) ? { exists: true, data: JSON.parse(JSON.stringify(docs.get(p))) } : { exists: false, data: null }; },
    async set(p, d, o) { calls.push(["set", p]); docs.set(p, o && o.merge ? { ...(docs.get(p) || {}), ...d } : { ...d }); },
    async update(p, d) { calls.push(["update", p]); docs.set(p, { ...docs.get(p), ...d }); },
    async list() { return []; },
    listen(p) { const l = { p, off: false }; ls.push(l); return () => (l.off = true); },
    writes: () => calls.filter((c) => c[0] === "set" || c[0] === "update") };
  return a;
}
let T = 1;
const mk = (flag) => { const ad = adapter(), st = memStorage(); const hs = HS.create({ adapter: ad, storage: st, features: () => ({ household: flag }), now: () => ++T, rand: () => 0.5 }); return { hs, ad, st }; };

(async () => {
  await test("OFF: leaveLocal 은 아무것도 지우거나 부르지 않는다(disabled)", async () => {
    const { hs, ad, st } = mk(false);
    st.setItem("hannun_household_code", "ABCD2345");
    const r = hs.leaveLocal("h1");
    assert.deepStrictEqual({ ok: r.ok, reason: r.reason }, { ok: false, reason: "disabled" });
    assert.strictEqual(st.getItem("hannun_household_code"), "ABCD2345");
    assert.strictEqual(ad.calls.length, 0);
  });

  await test("ON: 이 기기의 코드·미러·대기열·리스너만 정리하고 서버 쓰기는 0건", async () => {
    const { hs, ad, st } = mk(true);
    const c = await hs.createHousehold({ name: "우리집", firstChild: { familyCode: "ABC123", displayName: "은찬" } });
    const hid = c.householdId;
    hs.startListening(hid);
    st.setItem("other_key", "keep");
    const writesBefore = ad.writes().length;
    ad.set = async () => { throw Object.assign(new Error("offline"), { code: "unavailable" }); };
    await hs.upsertMember(hid, { role: "DAD", label: "아빠" }); // 서버 실패 → 대기열에 쌓임
    assert.ok(hs.getStatus(hid).pending >= 1);
    const pend = hs.getStatus(hid).pending;
    const r = hs.leaveLocal(hid);
    assert.deepStrictEqual({ ok: r.ok, discarded: r.discarded }, { ok: true, discarded: pend });
    assert.strictEqual(ad.ls.every((l) => l.off), true);
    assert.strictEqual(hs.getSavedCode(), null);
    assert.deepStrictEqual(st.keys().filter((k) => k.startsWith("hannun_household")), []);
    assert.strictEqual(st.getItem("other_key"), "keep");
    assert.strictEqual(ad.writes().length, writesBefore); // 나가기 자체는 서버에 쓰지 않음
    assert.ok(ad.docs.has("households/" + hid), "가구 문서는 서버에 그대로");
  });

  await test("나간 뒤 같은 코드로 다시 참여할 수 있다", async () => {
    const { hs, st } = mk(true);
    const c = await hs.createHousehold({ name: "우리집", firstChild: { familyCode: "ABC123", displayName: "은찬" } });
    hs.leaveLocal(c.householdId);
    const j = await hs.joinHousehold(c.code);
    assert.strictEqual(j.ok, true);
    assert.strictEqual(hs.getSavedCode(), c.code);
    assert.strictEqual(st.getItem("hannun_household_code"), c.code);
  });

  await test("hid 없이 호출해도 코드 키·리스너는 정리하고 discarded 0", async () => {
    const { hs, st } = mk(true);
    st.setItem("hannun_household_code", "ABCD2345");
    const r = hs.leaveLocal(null);
    assert.deepStrictEqual({ ok: r.ok, discarded: r.discarded }, { ok: true, discarded: 0 });
    assert.strictEqual(st.getItem("hannun_household_code"), null);
  });

  const st = (o) => ({ enabled: true, view: "active", code: "ABCD2345", pending: 0, ...o });
  await test("화면: active 에 위험색 나가기 버튼(재발급 아래), 확인 시트 문구·대기열 경고·버튼 라벨", () => {
    const act = HV.renderSection(st({}));
    assert.ok(act.includes('data-hh-action="leave"') && act.includes("이 기기에서 가족 캘린더 나가기") && act.includes("hh-danger"));
    assert.ok(act.indexOf('data-hh-action="reissue"') < act.indexOf('data-hh-action="leave"'));
    const c0 = HV.renderSection(st({ view: "leave-confirm" }));
    assert.ok(c0.includes("이 기기에서 가족 캘린더를 나갈까요?") && c0.includes("가족 코드로 다시 참여할 수 있어요") && !c0.includes("사라져요") && />나가기</.test(c0) && c0.includes('data-hh-action="cancel-leave"'));
    const c3 = HV.renderSection(st({ view: "leave-confirm", pending: 3 }));
    assert.ok(c3.includes("아직 서버에 보내지 못한 변경 3건은 나가면 사라져요.") && c3.includes(">그래도 나가기<") && c3.includes('data-hh-action="confirm-leave"'));
    assert.ok(HV.renderSection(st({ view: "none", notice: { kind: "left" } })).includes("이 기기에서 가족 캘린더를 나왔어요."));
  });
  await test("화면: 플래그 OFF 이면 섹션 자체가 비어 나가기 UI 도 없다", () => {
    assert.strictEqual(HV.renderSection({ enabled: false, view: "active", code: "X" }), "");
  });
  await test("app.js hhLeaveLocal: leaveLocal 호출·키 정리·상태 초기화, 서버 쓰기 API 호출 없음", () => {
    const m = APP.match(/function hhLeaveLocal\(\) \{[\s\S]*?\n  \}\n/);
    assert.ok(m, "함수 없음");
    const body = m[0];
    assert.ok(!/HouseholdSync\.(create|join|add|update|remove|upsert|patch|reissue|flush)/.test(body));
    const removed = [], calls = [];
    const ctx = { HH_ID_KEY: "id", ACTIVE_MEMBER_KEY: "am", localStorage: { removeItem: (k) => removed.push(k) }, HouseholdSync: { leaveLocal: (h) => (calls.push(h), { ok: true, discarded: 2 }) }, hh: { hid: "h1", code: "C", view: "active", notice: null }, mem: { view: "x", form: 1, deleteId: 2 } };
    vm.runInNewContext(body + "\nhhLeaveLocal();", ctx);
    assert.deepStrictEqual(calls, ["h1"]);
    assert.deepStrictEqual(removed, ["id", "am"]);
    assert.deepStrictEqual({ hid: ctx.hh.hid, code: ctx.hh.code, view: ctx.hh.view, n: ctx.hh.notice.kind }, { hid: null, code: null, view: "none", n: "left" });
    assert.deepStrictEqual({ v: ctx.mem.view, f: ctx.mem.form, d: ctx.mem.deleteId }, { v: "list", f: null, d: null });
    assert.ok(/leave-confirm|confirm-leave/.test(APP) && /action === "confirm-leave"/.test(APP));
  });
  await test("hhLeaveLocal 이 아이·완료·기록 저장소 키를 건드리지 않는다", () => {
    const body = APP.match(/function hhLeaveLocal\(\) \{[\s\S]*?\n  \}\n/)[0];
    assert.ok(!/completed|profile|children|record|familyCode|FamilySync/i.test(body.replace(/\/\*\*[\s\S]*?\*\//, "")));
  });

  console.log(`\n${passed}개 통과${process.exitCode ? ", 일부 실패" : ""}`);
})();
