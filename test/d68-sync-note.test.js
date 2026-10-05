// D68: 쓰기가 서버에 가지 못하고 대기열로만 들어가면 안내를 띄우고(정상 저장은 안내 없음), 설정에 동기화 진단 한 줄을 보인다. 입력 순서·대기열 동작은 그대로.
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const HS = require("../js/household-sync.js");
const HV = require("../js/household-view.js");
let passed = 0;
async function test(name, fn) { try { await fn(); passed++; console.log("  ok  - " + name); } catch (e) { console.log("  FAIL - " + name + "\n" + e.stack); process.exitCode = 1; } }

const mkStore = () => { const m = {}; return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: (k) => { delete m[k]; } }; };
function make(denyParts) {
  const server = {};
  const deny = (path) => denyParts.some((p) => path.includes(p));
  const err = () => Object.assign(new Error("denied"), { code: "permission-denied" });
  const adapter = {
    async set(p, d, o) { if (deny(p)) throw err(); server[p] = o && o.merge ? { ...(server[p] || {}), ...d } : { ...d }; },
    async update(p, d) { if (deny(p)) throw err(); server[p] = { ...(server[p] || {}), ...d }; },
    async get() { return { exists: false }; }, async list() { return []; }, listen() { return () => {}; },
  };
  return { S: HS.create({ adapter, storage: mkStore(), features: () => ({ household: true }) }), server };
}
const doc = { v: 1, sourceType: "MANUAL", title: "옛", category: "ETC", scope: "FAMILY", dateKind: "FIXED", allDay: true, createdAt: 1, updatedAt: 1, eventDate: "2026-10-06" };

(async () => {
  await test("정상 쓰기: pending 아님 → 안내 없음, 진단 줄 없음", async () => {
    const { S, server } = make([]);
    const c = await S.createSchedule("h1", doc);
    const r = await S.patchSchedule("h1", c.scheduleId, { title: "새", updatedAt: 2 });
    assert.strictEqual(r.pending, false);
    assert.strictEqual(HV.syncNoteText(r, S.getStatus("h1"), true), "");
    assert.strictEqual(Object.values(server)[0].title, "새");
    const st = S.getStatus("h1");
    assert.strictEqual(st.head, null);
    assert.strictEqual(HV.diagLine({ enabled: true, pending: st.pending, permissionDenied: st.permissionDenied, head: st.head }), "");
  });
  await test("참여자 기기(앞선 members 쓰기가 거부된 상태): 일정 patch가 대기열로만 들어가면 안내가 나온다(권한 거부 문구), 입력 순서는 그대로 대기열에 쌓인다", async () => {
    const { S, server } = make(["/members/"]);
    await S.upsertMember("h1", { memberId: "m9", role: "DAD", label: "아빠", order: 2 });
    const c = await S.createSchedule("h1", doc);
    const r = await S.patchSchedule("h1", c.scheduleId, { title: "새", updatedAt: 2 });
    assert.strictEqual(r.ok, true); assert.strictEqual(r.pending, true);
    const st = S.getStatus("h1");
    assert.strictEqual(st.permissionDenied, true); assert.strictEqual(st.pending, 3);
    assert.strictEqual(HV.syncNoteText(r, st, true), HV.MSG.saveDenied);
    assert.ok(HV.MSG.saveDenied.startsWith("서버에 저장하지 못했어요"));
    assert.deepStrictEqual(Object.keys(server), []);
    assert.deepStrictEqual(st.head, { collection: "members", op: "set", id: "m9" });
  });
  await test("오프라인 일시 대기(권한 거부 아님, online=false)는 '연결되면 저장돼요' 문구로 구분", () => {
    assert.strictEqual(HV.syncNoteText({ ok: true, pending: true }, { permissionDenied: false }, false), HV.MSG.saveOffline);
    assert.strictEqual(HV.syncNoteText({ ok: true, pending: true }, { permissionDenied: true }, false), HV.MSG.saveDenied);
    assert.strictEqual(HV.syncNoteText({ ok: false }, { permissionDenied: true }, true), "");
    assert.strictEqual(HV.syncNoteText({ ok: true, pending: false }, { permissionDenied: false }, true), "");
  });
  await test("진단 한 줄 형식: 대기 건수·거부 여부·첫 항목 컬렉션/문서 id 앞 6자·오류 코드만(내용 없음), 대기열 없고 거부 아님이면 줄 없음", () => {
    const line = HV.diagLine({ enabled: true, pending: 3, permissionDenied: true, head: { collection: "members", op: "set", id: "m9abcd" }, lastError: "permission-denied" });
    assert.strictEqual(line, "동기화 점검: 대기 3건 · 서버 거부됨 · 첫 항목 members/m9abcd… · permission-denied");
    assert.strictEqual(HV.diagLine({ enabled: true, pending: 0, permissionDenied: false }), "");
    assert.strictEqual(HV.diagLine({ enabled: false, pending: 2, permissionDenied: true }), "");
    const html = HV.renderSection({ enabled: true, view: "active", childName: "수아", code: "ABCD1234", pending: 3, permissionDenied: true, head: { collection: "schedules", op: "update", id: "sabc12" }, lastError: "permission-denied" });
    assert.ok(html.includes('class="hh-note hh-diag"') && html.includes("schedules/sabc12…") && !html.includes("제목") && !html.includes("sabc12abc"));
  });
  await test("앱 연결: 일정·할 일·구성원·아이 쓰기 함수를 감싸 pending 결과를 안내하고, 대기열·flush 코드는 그대로", () => {
    const app = fs.readFileSync(path.join(__dirname, "..", "js/app.js"), "utf8");
    assert.ok(app.includes('["createSchedule", "patchSchedule", "createTodo", "patchTodo", "upsertMember", "removeMember", "addChild", "updateChild", "removeChild"]') && app.includes("HouseholdView.syncNoteText(res, st"));
    const sync = fs.readFileSync(path.join(__dirname, "..", "js/household-sync.js"), "utf8");
    assert.ok(sync.includes("if (q.length === 0 && !state.permissionDenied)") && sync.includes("break;"), "(b) 대기열·순서 동작 미변경");
  });
  console.log(`\n${passed}개 통과`);
})();
