/*
 * H4: 구성원 편입·칩 대표색·아이 삭제·안내 문구 조건·'직접 입력' 표시 제거.
 * 실행: node test/h4-chips-members-delete.test.js
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const HS = require("../js/household-sync.js");
const AS = require("../js/account-sync.js");
const V = require("../js/user-schedule-view.js");
const HV = require("../js/household-view.js");
const US = require("../js/user-schedule.js");
const CT = require("../js/child-todos.js");
const ROOT = path.join(__dirname, "..");
const APP = fs.readFileSync(path.join(ROOT, "js", "app.js"), "utf8");
const CSS = fs.readFileSync(path.join(ROOT, "css", "style.css"), "utf8");

let passed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log("  ok  - " + name); } catch (e) { process.exitCode = 1; console.log("  FAIL- " + name + "\n      " + (e.stack || e).split("\n").slice(0, 4).join("\n      ")); }
}
const memStorage = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
function adapter() {
  const docs = new Map();
  return { docs,
    async get(p) { return docs.has(p) ? { exists: true, data: JSON.parse(JSON.stringify(docs.get(p))) } : { exists: false, data: null }; },
    async set(p, d, o) { docs.set(p, o && o.merge ? { ...(docs.get(p) || {}), ...d } : { ...d }); },
    async update(p, d) { docs.set(p, { ...docs.get(p), ...d }); },
    async list() { return []; }, listen() { return () => {}; } };
}
const membersOf = (a, hid) => [...a.docs.entries()].filter(([k]) => k.startsWith(`households/${hid}/members/`)).map(([, v]) => v);
const fnSrc = (name, async) => { const i = APP.indexOf(`  ${async ? "async " : ""}function ${name}(`); assert.ok(i >= 0, name); let j = APP.indexOf("\n  }\n", i); return APP.slice(i, j + 4); };

(async () => {
  console.log("2. 구성원 편입 규칙");
  await test("createHousehold: members:[] 면 시드 구성원 0명, 옵션이 없으면 예전처럼 엄마·아빠 시드(기존 경로 호환)", async () => {
    const mk = () => { const a = adapter(); return { a, hs: HS.create({ adapter: a, storage: memStorage(), features: () => ({ household: true }), now: () => 1 }) }; };
    const x = mk(); const r0 = await x.hs.createHousehold({ members: [] });
    assert.ok(r0.ok); assert.strictEqual(membersOf(x.a, r0.householdId).length, 0);
    const y = mk(); const r1 = await y.hs.createHousehold({});
    assert.deepStrictEqual(membersOf(y.a, r1.householdId).map((m) => m.label).sort(), ["아빠", "엄마"]);
  });
  await test("계정 가입 경로(AccountSync)는 createHousehold 에 members:[] 를 넘긴다 / 앱의 가구 직접 생성 2곳도 계정 모드면 []", () => {
    assert.ok(/createHousehold\(\{ members: \[\] \}\)/.test(fs.readFileSync(path.join(ROOT, "js", "account-sync.js"), "utf8")));
    assert.strictEqual((APP.match(/\.\.\.\(acctEnabled\(\) \? \{ members: \[\] \} : \{\}\)/g) || []).length, 2);
  });
  await test("기존 가족 호환: 이미 '아빠' 시드가 들어 있는 가구도 그대로 — 아빠가 가입하면 그 자리를 확보, 시드(uid 없음)도 칩으로 보인다", () => {
    const seeded = { m1: { role: "MOM", label: "엄마", order: 1, uid: "u1" }, m2: { role: "DAD", label: "아빠", order: 2 } };
    const pick = AS.chooseMember(seeded, { role: "DAD", uid: "u2", displayName: "민수" });
    assert.deepStrictEqual([pick.memberId, pick.claimed], ["m2", true]);
    const list = Object.entries(seeded).map(([memberId, m]) => ({ memberId, ...m }));
    const ids = V.filterChips([], [], list, { memberMode: true, meId: "m1", noFamily: true }).map((c) => c.id);
    assert.deepStrictEqual(ids, ["MEMBER:m1", "MEMBER:m2"]);
  });

  console.log("4. 칩 대표색·'전체' 없음");
  await test("칩: '전체' 버튼 없음, 모든 칩에 대표색, 마크업에 --us-color, 선택·해제는 칩 토글 그대로", () => {
    const links = [{ childKey: "a", order: 1, displayName: "수아" }, { childKey: "b", order: 2, displayName: "루피" }];
    const mem = [{ memberId: "m1", role: "MOM", label: "지은", order: 1 }];
    const o = { memberMode: true, meId: "m1", noFamily: true };
    const chips = V.filterChips(links, [], mem, o);
    assert.deepStrictEqual(chips.map((c) => c.id), ["MEMBER:m1", "CHILD:a", "CHILD:b"]);
    assert.ok(chips.every((c) => /^#[0-9a-f]{6}$/i.test(c.color)));
    const html = V.renderFilterChips(chips, { mode: "all" });
    assert.strictEqual((html.match(/--us-color:#/g) || []).length, 3);
    assert.ok(!html.includes("data-us-filter=\"ALL\"") && !html.includes(">전체<"));
    assert.deepStrictEqual(V.toggleSelection([], "CHILD:a", links, mem, o), ["CHILD:a"]);
    assert.deepStrictEqual(V.toggleSelection(["CHILD:a"], "CHILD:a", links, mem, o), []);
  });
  await test("CSS: 선택하지 않은 칩에도 대표색(점+테두리)이 보인다", () => {
    assert.ok(/\.us-chip\[style\*="--us-color"\]::before \{[^}]*background: var\(--us-color\)/.test(CSS));
    assert.ok(/\.us-chip\[style\*="--us-color"\] \{[^}]*border-color: var\(--us-color\)/.test(CSS));
  });

  console.log("5. 달력 아래 안내 문구");
  const legendEnv = (o) => {
    const box = { hidden: null, classList: { toggle: (c, on) => (box.hidden = on) } };
    const sb = {
      acctEnabled: () => o.acct !== false, visibleSchedule: () => o.visible || [], ChildTimeline: { OVER36_FROM_MONTHS: 36 }, usActive: () => o.active !== false, profile: o.profile === undefined ? {} : o.profile, acct36Active: () => !!o.is36,
      usLinks: () => o.links || [], usMembers: () => [], usSel: () => o.sel || [], usSelOpts: () => ({ memberMode: false, noFamily: true }),
      usChildAge: (k) => o.ages[k], us: { onlyUser: !!o.onlyUser }, UserScheduleView: V, el: () => box,
    };
    vm.createContext(sb);
    vm.runInContext(fnSrc("calAutoLegendOn") + fnSrc("calUpdateKindLegend") + ";globalThis.run=calUpdateKindLegend", sb);
    return { run: () => { sb.run(); return box.hidden; } };
  };
  const L = (...ks) => ks.map((k, i) => ({ childKey: k, order: i + 1, displayName: k }));
  await test("36개월 미만 아이가 있고 자동 일정이 켜져 있으면 보인다(숨김=false)", () => {
    assert.strictEqual(legendEnv({ links: L("a"), ages: { a: 10 } }).run(), false);
    assert.strictEqual(legendEnv({ links: L("a", "b"), ages: { a: 40, b: 10 } }).run(), false, "한 명이라도 미만이면 보임");
    assert.strictEqual(legendEnv({ links: L("a"), ages: { a: "PREGNANT" } }).run(), false, "임신 중은 미만");
  });
  await test("36개월 이상만 있거나 · 아이가 없거나 · '직접 등록한 일정만 보기'(자동 끔)이면 숨긴다", () => {
    assert.strictEqual(legendEnv({ links: L("a"), ages: { a: 40 } }).run(), true);
    assert.strictEqual(legendEnv({ links: [], ages: {} }).run(), true);
    assert.strictEqual(legendEnv({ links: L("a", "b"), ages: { a: 10, b: 10 }, sel: ["CHILD:a"], onlyUser: true }).run(), true);
    assert.strictEqual(legendEnv({ links: L("a", "b"), ages: { a: 10, b: 10 }, sel: ["CHILD:a"], onlyUser: false }).run(), false);
    assert.strictEqual(legendEnv({ links: L("a", "b"), ages: { a: 40, b: 10 }, sel: ["CHILD:a"] }).run(), true, "36개월 이상 아이 칩만 고르면 숨김");
    assert.strictEqual(legendEnv({ links: L("a", "b"), ages: { a: 40, b: 10 }, sel: ["CHILD:b"] }).run(), false);
  });
  await test("계정 모드가 아니면 예전처럼 항상 보인다 / 가구가 없으면 지금 아이 기준", () => {
    assert.strictEqual(legendEnv({ acct: false, links: L("a"), ages: { a: 40 } }).run(), false);
    assert.strictEqual(legendEnv({ active: false, is36: true }).run(), true);
    assert.strictEqual(legendEnv({ active: false, is36: false }).run(), false);
  });
  await test("연결: renderCalendar 와 칩 슬롯 갱신에서 안내 문구를 갱신한다", () => {
    assert.ok(/renderCalLegend\(\);\n\s+calUpdateKindLegend\(\);/.test(APP));
    assert.ok(/function usRenderCalendarSlots\(model\) \{\n\s+calUpdateKindLegend\(\);/.test(APP));
  });

  console.log("1. 아이 삭제(서버에서 진짜 삭제)");
  const delEnv = (o = {}) => {
    const calls = [];
    const store = { hannun_created_children: JSON.stringify(o.created || []), hannun_children: JSON.stringify([{ code: "CODE_A", name: "수아" }, { code: "CODE_B", name: "루피" }]), hannun_child_births: JSON.stringify({ CODE_A: "2026-01-01", CODE_B: "2025-01-01" }) };
    const links = o.links || [
      { childKey: "a", familyCode: "CODE_A", displayName: "수아", order: 1, createdByUid: "me" },
      { childKey: "b", familyCode: "CODE_B", displayName: "루피", order: 2, createdByUid: "other" },
      { childKey: "a0", familyCode: "CODE_A", displayName: "수아(옛 링크)", order: 3, removedAt: 7 },
    ];
    const docs = [
      { id: "s1", scope: "CHILD", childKeys: ["a"], title: "수아 병원" },
      { id: "s2", scope: "CHILD", childKeys: ["a", "b"], title: "둘 다" },
      { id: "s3", scope: "CHILD", childKeys: ["b"], title: "루피만" },
      { id: "s4", scope: "FAMILY", title: "가족" },
      { id: "s5", scope: "CHILD", childKeys: ["a"], title: "지운 것", deletedAt: 5 },
    ].map((d) => ({ v: 1, sourceType: "MANUAL", category: "MEDICAL", dateKind: "FIXED", allDay: true, eventDate: "2026-10-10", createdAt: 1, updatedAt: 1, ...d }));
    const todos = [{ id: "t1", childKey: "a", title: "x" }, { id: "t2", childKey: "CODE_A", title: "y" }, { id: "t3", childKey: "b", title: "z" }, { id: "t4", childKey: "a", title: "w", deletedAt: 3 }];
    const fail = { ...(o.fail || {}) };
    const sb = {
      localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = v; } },
      CREATED_KEY: "hannun_created_children", CHILDREN_KEY: "hannun_children", CHILD_BIRTHS_KEY: "hannun_child_births", Date, JSON,
      acctEnabled: () => true, acct: { user: o.noUser ? null : { uid: "me" } }, familyCode: o.current ? "CODE_A" : "CODE_B",
      hh: { hid: "H1" }, usLinks: () => links, usDocs: () => docs, usActiveChildKey: () => o.current || "b",
      UserSchedule: US, UserScheduleView: V, ChildTodos: CT,
      unsubscribeFamily: () => calls.push(["unsub"]),
      startListeningFamily: () => calls.push(["listen"]),
      switchToChild: async (code) => { calls.push(["switch", code]); },
      applyNewChildReset: () => calls.push(["reset"]), showEmptyHome: () => calls.push(["empty"]), el: () => ({ classList: { add: () => calls.push(["hide-landing"]) } }),
      HouseholdSync: {
        getTodos: () => todos,
        patchSchedule: async (h, id, p) => { calls.push(["patch", id, p]); return { ok: true }; },
        hardDelete: async (h, path) => { calls.push(["del", path]); if (fail.reason && (!fail.path || path.includes(fail.path))) { const r = fail.reason; if (!fail.keep) delete fail.reason; return { ok: false, reason: r }; } return { ok: true }; },
      },
      FamilySync: { deleteFamily: async (code) => { calls.push(["family", code]); if (fail.family) { const e = new Error("x"); e.code = fail.family; if (!fail.keep) fail.family = null; throw e; } } },
      loadChildren: () => JSON.parse(store.hannun_children),
      usChipDelShow() {}, us: {},
    };
    vm.createContext(sb);
    vm.runInContext(fnSrc("usCreatorField") + fnSrc("usIsOwnChild") + fnSrc("loadCreatedCodes") + fnSrc("removeCreatedCode") + fnSrc("usChildDeleteWork") + fnSrc("usChildDeleteRun", true) + fnSrc("usChildDeleteCurrent", true) + fnSrc("usChipDelAsk")
      + ";const usDeleteFail = (reason) => Object.assign(new Error('child-delete-' + reason), { reason });globalThis.t={usIsOwnChild,usCreatorField,loadCreatedCodes,usChildDeleteWork,usChildDeleteRun,usChildDeleteCurrent,usChipDelAsk}", sb);
    return { sb, calls, store };
  };
  await test("'내가 만든 아이'는 링크의 createdByUid 가 내 uid 인 아이 — 남이 만든 아이는 아님, 필드가 없는 옛 링크만 이 기기 표식으로 보조 판정", () => {
    const e = delEnv({ created: ["CODE_LEGACY"] });
    const t = e.sb.t;
    assert.strictEqual(t.usIsOwnChild({ familyCode: "X", createdByUid: "me" }), true);
    assert.strictEqual(t.usIsOwnChild({ familyCode: "X", createdByUid: "other" }), false);
    assert.strictEqual(t.usIsOwnChild({ familyCode: "CODE_LEGACY" }), true, "옛 링크는 기기 표식");
    assert.strictEqual(t.usIsOwnChild({ familyCode: "CODE_LEGACY", createdByUid: "other" }), false, "필드가 있으면 localStorage 는 보지 않는다");
    assert.strictEqual(t.usIsOwnChild({ familyCode: "NOPE" }), false);
    assert.deepStrictEqual(JSON.parse(JSON.stringify(t.usCreatorField())), { createdByUid: "me" });
    assert.deepStrictEqual(JSON.parse(JSON.stringify(delEnv({ noUser: true }).sb.t.usCreatorField())), {}, "로그인 전에는 붙이지 않는다");
  });
  await test("삭제 확인 시트: 내가 만든 아이에게만, 지금 보는 아이도 열린다(current 표시), 일정·할 일 개수는 살아 있는 것만", () => {
    const e = delEnv({ current: "a" });
    e.sb.t.usChipDelAsk("CHILD_DELETE:b"); assert.strictEqual(e.sb.us.chipDel, undefined, "남이 만든 아이는 대상 아님");
    e.sb.t.usChipDelAsk("CHILD_DELETE:zz"); assert.strictEqual(e.sb.us.chipDel, undefined);
    e.sb.t.usChipDelAsk("CHILD_DELETE:a");
    const d = e.sb.us.chipDel;
    assert.deepStrictEqual([d.kind, d.eventCount, d.todoCount, d.current, d.blocked], ["CHILD_DELETE", 1, 2, true, undefined]);
    assert.ok(V.renderChipDeleteConfirm(d).includes("지금 보고 있는 아이") && V.renderChipDeleteConfirm(d).includes("data-us-chipdel-act=\"confirm\""));
  });
  await test("삭제 실행: 공동 일정은 이 아이만 빼고 → 이 아이 일정·할 일(소프트 삭제된 것 포함) 서버 삭제 → 아이 문서 삭제 → 링크(옛 링크 포함)는 맨 마지막, 이 기기 목록 정리", async () => {
    const e = delEnv({ created: ["CODE_A"] });
    await e.sb.t.usChildDeleteRun("a");
    assert.deepStrictEqual(e.calls.map((c) => c[0] === "patch" ? ["patch", c[1], c[2].childKeys] : c), [
      ["patch", "s2", ["b"]],
      ["del", "households/H1/schedules/s1"], ["del", "households/H1/schedules/s5"],
      ["del", "households/H1/todos/t1"], ["del", "households/H1/todos/t2"], ["del", "households/H1/todos/t4"],
      ["family", "CODE_A"],
      ["del", "households/H1/children/a"], ["del", "households/H1/children/a0"],
    ]);
    assert.deepStrictEqual(JSON.parse(e.store.hannun_children).map((c) => c.code), ["CODE_B"]);
    assert.deepStrictEqual(JSON.parse(e.store.hannun_created_children), []);
    assert.deepStrictEqual(Object.keys(JSON.parse(e.store.hannun_child_births)), ["CODE_B"]);
  });
  await test("같은 아이 코드를 쓰는 다른 살아 있는 링크가 있으면 아이 문서는 지우지 않는다", async () => {
    const links = [{ childKey: "a", familyCode: "CODE_A", displayName: "수아", order: 1, createdByUid: "me" }, { childKey: "a2", familyCode: "CODE_A", displayName: "수아", order: 2, createdByUid: "me" }];
    const e = delEnv({ links });
    await e.sb.t.usChildDeleteRun("a");
    assert.ok(!e.calls.some((c) => c[0] === "family") && e.calls.some((c) => c[1] === "households/H1/children/a"));
  });
  await test("규칙 미배포·권한 없음(permission-denied): 던지고 링크는 남아 있다 → 사용자 문구(서버 적용 중) → 다시 시도하면 이어서 끝난다", async () => {
    const e = delEnv({ fail: { reason: "permission-denied", path: "todos/t2" } });
    await assert.rejects(() => e.sb.t.usChildDeleteRun("a"), (err) => err.reason === "permission-denied");
    assert.ok(!e.calls.some((c) => c[0] === "family") && !e.calls.some((c) => String(c[1]).includes("/children/")));
    assert.strictEqual(JSON.parse(e.store.hannun_children).length, 2, "기기 목록은 그대로");
    assert.ok(V.MSG.chipDelDeniedNote.includes("아직 삭제할 수 없어요") && V.MSG.chipDelNetworkNote.includes("인터넷 연결"));
    await e.sb.t.usChildDeleteRun("a"); // 두 번째는 실패 조건이 풀려 끝까지 간다
    assert.ok(e.calls.some((c) => c[1] === "households/H1/children/a"));
  });
  await test("아이 문서 삭제가 거부돼도(permission-denied / 네트워크) 사유가 달린 오류로 던지고 링크는 지우지 않는다", async () => {
    for (const code of ["permission-denied", "unavailable"]) {
      const e = delEnv({ fail: { family: code } });
      await assert.rejects(() => e.sb.t.usChildDeleteRun("a"), (err) => err.reason === (code === "permission-denied" ? "permission-denied" : "network"));
      assert.ok(!e.calls.some((c) => String(c[1]).includes("/children/")));
    }
  });
  await test("지금 보는 아이 삭제: 구독을 먼저 멈추고, 남은 아이(order 순 첫째)로 전환 / 마지막 아이면 빈 화면 / 실패하면 구독을 되살린다", async () => {
    const e1 = delEnv({ current: "a" });
    await e1.sb.t.usChildDeleteCurrent("a");
    assert.strictEqual(e1.calls[0][0], "unsub");
    assert.deepStrictEqual(e1.calls.filter((c) => c[0] === "switch" || c[0] === "reset"), [["switch", "CODE_B"]]);
    const links = [{ childKey: "a", familyCode: "CODE_A", displayName: "수아", order: 1, createdByUid: "me" }];
    const e2 = delEnv({ current: "a", links });
    await e2.sb.t.usChildDeleteCurrent("a");
    assert.deepStrictEqual(e2.calls.filter((c) => ["switch", "reset", "empty"].includes(c[0])), [["reset"], ["empty"]]);
    const e3 = delEnv({ current: "a", fail: { reason: "network" } });
    await assert.rejects(() => e3.sb.t.usChildDeleteCurrent("a"));
    assert.deepStrictEqual(e3.calls.filter((c) => ["unsub", "listen", "switch", "reset"].includes(c[0])), [["unsub"], ["listen"]]);
    const e4 = delEnv({ current: "b" }); // 보고 있지 않은 아이를 지울 땐 구독·화면을 건드리지 않는다
    e4.sb.t.usChipDelAsk && await e4.sb.t.usChildDeleteCurrent("a");
    assert.ok(!e4.calls.some((c) => ["unsub", "switch", "reset", "empty"].includes(c[0])));
  });
  await test("HouseholdSync.hardDelete: 대기열에 넣지 않는다 — 성공하면 미러에서 빼고 그 문서의 대기 쓰기를 버림, 거부(권한·네트워크)는 사유만 돌려주고 막힘 상태를 켜지 않는다", async () => {
    let T = 1;
    const a = adapter(); const st = memStorage();
    const hs = HS.create({ adapter: a, storage: st, features: () => ({ household: true }), now: () => ++T, rand: () => 0.5 });
    a.delete = async (p) => { if (a.reject) { const e = new Error("x"); e.code = a.reject; throw e; } a.docs.delete(p); };
    const c = await hs.createHousehold({ members: [], firstChild: { familyCode: "ABC123", displayName: "수아" } });
    const hid = c.householdId, path = `households/${hid}/children/${c.childKey}`;
    const sid = (await hs.createSchedule(hid, { v: 1, title: "x", scope: "FAMILY" })).scheduleId;
    assert.ok(a.docs.has(path) && hs.getMirror(hid).children[c.childKey]);
    a.reject = "permission-denied";
    assert.deepStrictEqual(await hs.hardDelete(hid, path), { ok: false, reason: "permission-denied" });
    a.reject = "unavailable";
    assert.deepStrictEqual(await hs.hardDelete(hid, path), { ok: false, reason: "network" });
    assert.ok(a.docs.has(path) && hs.getMirror(hid).children[c.childKey], "실패하면 그대로");
    assert.strictEqual(hs.getStatus(hid).permissionDenied, false, "삭제 거부가 다른 쓰기를 막지 않는다");
    a.reject = null;
    st.setItem(`hannun_household_pending:${hid}`, JSON.stringify([{ op: "set", path, payload: { v: 1 }, merge: false, ts: 1 }, { op: "set", path: `households/${hid}/schedules/${sid}`, payload: {}, merge: false, ts: 2 }]));
    assert.deepStrictEqual(await hs.hardDelete(hid, path), { ok: true });
    assert.ok(!a.docs.has(path) && !hs.getMirror(hid).children[c.childKey]);
    assert.deepStrictEqual(JSON.parse(st.getItem(`hannun_household_pending:${hid}`)).map((e) => e.path), [`households/${hid}/schedules/${sid}`], "그 문서를 향한 대기 쓰기만 버린다");
    await assert.rejects(() => hs.hardDelete(hid, "familyCodes/XYZ"), /쓸 수 없다/);
    assert.deepStrictEqual(await HS.create({ adapter: a, storage: memStorage(), features: () => ({ household: false }) }).hardDelete(hid, path), { ok: false, reason: "disabled" });
  });
  await test("구성원 관리: 삭제 버튼은 내가 만든 아이에게만(ownChildKeys), '빼기'는 모두에게 그대로 / 확인 시트 문구와 위험 버튼", () => {
    const st = { enabled: true, hasHousehold: true, acctMode: true, meId: "m1", members: [{ memberId: "m1", role: "MOM", label: "지은", order: 1 }], children: [{ childKey: "a", displayName: "수아" }, { childKey: "b", displayName: "루피" }], ownChildKeys: ["a"], view: "list" };
    const h = HV.renderMembers(st);
    assert.strictEqual((h.match(/data-mem-action="ask-delete-child"/g) || []).length, 1);
    assert.ok(h.includes('data-mem-action="ask-delete-child" data-member-id="a"'));
    assert.strictEqual((h.match(/data-mem-action="ask-remove-child"/g) || []).length, 2);
    assert.ok(!HV.renderMembers({ ...st, ownChildKeys: undefined }).includes("ask-delete-child"));
    const sheet = V.renderChipDeleteConfirm({ kind: "CHILD_DELETE", id: "a", name: "수아", eventCount: 3, todoCount: 2 });
    assert.ok(sheet.includes("되돌릴 수 없어요") && sheet.includes("일정 3건과 할 일 2건") && sheet.includes("성장·접종 기록과 프로필") && sheet.includes("us-chipdel-danger") && sheet.includes('data-us-chipdel-act="confirm"'));
    assert.ok(V.renderChipDeleteConfirm({ kind: "CHILD", name: "수아" }).includes("가족 캘린더에서"), "빼기 시트는 그대로");
    assert.ok(V.renderChipDeleteConfirm({ kind: "CHILD_DELETE", name: "수아", error: V.MSG.chipDelDeniedNote }).includes("아직 삭제할 수 없어요"));
  });
  await test("연결: 삭제 클릭은 ask-delete-child → usChipDelAsk('CHILD_DELETE:…'), 확인은 usChildDeleteCurrent, 실패는 사유별 문구, 아이 만들 때 createdByUid 를 기록", () => {
    assert.ok(APP.includes('action === "ask-delete-child"') && APP.includes("usChipDelAsk(`CHILD_DELETE:${id}`)"));
    assert.ok(APP.includes('if (d.kind === "CHILD_DELETE") await usChildDeleteCurrent(d.id);'));
    assert.ok(APP.includes('d.error = d.kind === "CHILD_DELETE" ? usDeleteFailNote(e && e.reason)'));
    assert.strictEqual((APP.match(/usCreatorField\(\)/g) || []).length, 6, "정의 1 + addChild·firstChild 5곳");
    assert.ok(!/removeChild\(hh\.hid, key\)/.test(fnSrc("usChildDeleteRun", true)), "삭제는 소프트 분리(removedAt)가 아니라 문서 삭제");
  });

  console.log("2·4. 색(colorKey)");
  await test("HouseholdSync: 아이·구성원을 만들 때 가장 덜 쓰인 색 키(p1~p10)를 정해 남기고, 이미 있는 색은 바꾸지 않는다 / createdByUid 기록", async () => {
    let T = 1;
    const a = adapter();
    const hs = HS.create({ adapter: a, storage: memStorage(), features: () => ({ household: true }), now: () => ++T, rand: () => 0.5 });
    const c = await hs.createHousehold({ members: [] });
    const hid = c.householdId;
    const kid = (n) => hs.addChild(hid, { familyCode: "C" + n, displayName: "k" + n, order: n, createdByUid: "u1" });
    const k1 = await kid(1), k2 = await kid(2);
    const m1 = await hs.upsertMember(hid, { role: "MOM", label: "엄마", order: 1, uid: "u1" });
    const m2 = await hs.upsertMember(hid, { role: "OTHER", label: "할머니", order: 2 });
    const doc = (p) => a.docs.get(p);
    assert.deepStrictEqual([k1, k2].map((k) => doc(`households/${hid}/children/${k.childKey}`).colorKey), ["p1", "p2"]);
    assert.deepStrictEqual([m1, m2].map((m) => doc(`households/${hid}/members/${m.memberId}`).colorKey), ["p3", "p4"]);
    assert.strictEqual(doc(`households/${hid}/children/${k1.childKey}`).createdByUid, "u1");
    await hs.upsertMember(hid, { memberId: m1.memberId, role: "MOM", label: "엄마2", order: 1, uid: "u1" });
    assert.strictEqual(doc(`households/${hid}/members/${m1.memberId}`).colorKey, "p3", "고친다고 색이 바뀌지 않는다");
    await hs.removeMember(hid, m1.memberId);
    const m3 = await hs.upsertMember(hid, { role: "OTHER", label: "이모", order: 3 });
    assert.strictEqual(doc(`households/${hid}/members/${m3.memberId}`).colorKey, "p3", "지운 사람의 색은 새 사람에게 돌아간다(남아 있는 사람 색은 그대로)");
    assert.strictEqual(doc(`households/${hid}/members/${m2.memberId}`).colorKey, "p4");
    for (let i = 0; i < 12; i++) await hs.upsertMember(hid, { role: "OTHER", label: "x" + i, order: 10 + i });
    const used = [...a.docs.entries()].filter(([k]) => k.includes("/members/")).map(([, v]) => v.colorKey);
    assert.ok(used.every((k) => HS.COLOR_KEYS.includes(k)), "10색을 넘으면 가장 덜 쓰인 색을 다시 쓴다");
  });
  await test("팔레트 10색: 키 기반 고정(순서·인원이 바뀌어도 같은 색), 서로 구분(Lab ΔE≥20), 글자색 대비 4.5:1 이상", () => {
    assert.strictEqual(V.PALETTE.length, 10);
    assert.deepStrictEqual(V.COLOR_KEYS, HS.COLOR_KEYS, "view 와 sync 의 색 키가 같다");
    const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
    const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    const lum = (h) => { const [r, g, b] = rgb(h).map(lin); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
    const cr = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
    const lab = (h) => { const [r, g, b] = rgb(h).map(lin); const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116); const X = f((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047), Y = f(0.2126 * r + 0.7152 * g + 0.0722 * b), Z = f((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883); return [116 * Y - 16, 500 * (X - Y), 200 * (Y - Z)]; };
    const de = (a, b) => Math.hypot(...lab(a).map((v, i) => v - lab(b)[i]));
    V.PALETTE.forEach((c) => assert.ok(cr(c, "#3a2e2a") >= 4.5, `${c} 글자 대비 ${cr(c, "#3a2e2a").toFixed(1)}`));
    for (let i = 0; i < 10; i++) for (let j = i + 1; j < 10; j++) assert.ok(de(V.PALETTE[i], V.PALETTE[j]) >= 20, `${V.PALETTE[i]} / ${V.PALETTE[j]} ΔE ${de(V.PALETTE[i], V.PALETTE[j]).toFixed(1)}`);
    assert.strictEqual(new Set(V.COLOR_KEYS.map((k) => V.keyColor("x", k))).size, 10);
    const ms = [{ memberId: "m1", role: "MOM", label: "엄마", colorKey: "p5" }, { memberId: "m2", role: "MOM", label: "새엄마", colorKey: "p6" }, { memberId: "m3", role: "DAD", label: "아빠" }];
    const color = (list, id) => V.filterChips([], [], list, { memberMode: true, meId: "m1", noFamily: true }).find((c) => c.id === "MEMBER:" + id).color;
    assert.notStrictEqual(color(ms, "m1"), color(ms, "m2"), "같은 역할도 다른 색");
    assert.strictEqual(color(ms, "m3"), color([ms[2]], "m3"), "colorKey 가 없는 옛 구성원도 인원이 바뀌어도 같은 색(키 해시)");
    assert.strictEqual(color(ms, "m1"), color([ms[0]], "m1"));
    const kids = (list) => V.childColors(list);
    const K = [{ childKey: "a", colorKey: "p1" }, { childKey: "b", colorKey: "p2" }, { childKey: "c", colorKey: "p3" }];
    assert.strictEqual(kids(K).b, kids([K[1]]).b);
    assert.strictEqual(kids(K).b, kids([K[2], K[1], K[0]]).b);
  });
  await test("칩 5명+구성원이 10색 안에서 서로 다른 색으로 보인다(만든 순서대로 p1~)", () => {
    const keys = ["p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8", "p9", "p10"];
    const links = keys.slice(0, 5).map((k, i) => ({ childKey: "c" + i, displayName: "k" + i, order: i + 1, colorKey: k }));
    const mem = keys.slice(5).map((k, i) => ({ memberId: "m" + i, role: i % 2 ? "DAD" : "MOM", label: "m" + i, order: i + 1, colorKey: k }));
    const chips = V.filterChips(links, [], mem, { memberMode: true, meId: "m0", noFamily: true });
    assert.strictEqual(chips.length, 10);
    assert.strictEqual(new Set(chips.map((c) => c.color)).size, 10);
  });

  console.log("3·6. 아이 등록 폼 · 직접 입력 표시");
  await test("'직접 입력' 표시는 어디에도 그리지 않고, 자동 항목의 '자동' 표시만 남는다", () => {
    assert.strictEqual(V.sourceLabeled('<strong class="us-title">a</strong>', "user"), '<strong class="us-title">a</strong>');
    assert.ok(V.sourceLabeled('<p class="title">DTaP</p>', "auto").includes("us-src-auto"));
  });
  console.log(`\n${passed}개 통과`);
})();
