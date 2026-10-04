/* 삭제한 아이가 남는 버그(W4 후속): 링크 없는 아이 · 다른 기기에서 삭제·빼기 · 빼기한 아이 일정 숨김 · 마지막 아이 삭제 직후 칩 · 미러 로딩 전 오탐 방지.
 * app.js 의 실제 함수 본문을 vm 에 올려 가짜 가구·저장소로 실행한다. 실행: node --test test/k2-child-gone.test.js */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const HS = require("../js/household-sync.js");
const HV = require("../js/household-view.js");
const ROOT = path.join(__dirname, "..");
const APP = fs.readFileSync(path.join(ROOT, "js/app.js"), "utf8");
const fnSrc = (name, async) => { const i = APP.indexOf(`  ${async ? "async " : ""}function ${name}(`); assert.ok(i >= 0, name); return APP.slice(i, APP.indexOf("\n  }\n", i) + 4); };
const lineSrc = (re) => { const m = APP.match(re); assert.ok(m, String(re)); return m[0]; };

function env(o = {}) {
  const calls = [];
  const store = { hannun_children: JSON.stringify(o.children || []), hannun_child_births: "{}", hannun_created_children: JSON.stringify(o.created || []), hannun_linked_codes: JSON.stringify(o.known || []) };
  const sb = {
    localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } },
    JSON, Date, console, Set, Promise, CREATED_KEY: "hannun_created_children", CHILDREN_KEY: "hannun_children", CHILD_BIRTHS_KEY: "hannun_child_births", LINKED_KEY: "hannun_linked_codes",
    acctEnabled: () => o.acct !== false, hh: { hid: o.noHousehold ? null : "H1" }, familyCode: o.current === undefined ? null : o.current, profile: o.current ? { name: "x" } : null,
    usLinks: () => (o.links || []), usDocs: () => (o.docs || []), childDisplayName: () => "현재 아이",
    unsubscribeFamily: () => calls.push("unsub"), startListeningFamily() {}, hhRender: () => calls.push("hhRender"), usRefreshCalendar: () => calls.push("refresh"),
    switchToChild: async (c) => { calls.push("switch:" + c); }, applyNewChildReset: () => calls.push("reset"), showEmptyHome: () => calls.push("empty"),
    el: () => ({ classList: { add() {} } }),
    usCreatorField: () => ({}), usDeleteFail: (r) => Object.assign(new Error(r), { reason: r }),
    HouseholdSync: {
      getStatus: () => ({ childrenLoaded: o.ready !== false }),
      getTodos: () => o.todos || [],
      hardDelete: async (h, p) => { calls.push("del:" + p); return { ok: true }; },
      addChild: async (h, x) => { calls.push("addChild:" + x.familyCode); return { ok: true, childKey: "new" }; },
    },
    FamilySync: { deleteFamily: async (c) => { calls.push("family:" + c); } },
    loadChildren: () => JSON.parse(store.hannun_children),
  };
  vm.createContext(sb);
  vm.runInContext([
    "var unsubscribeFamily = () => calls.push('unsub');", // unsubscribeFamily 는 앱에서 let — 가짜 하나
  ].join("\n").replace("calls.push", "__calls.push"), Object.assign(sb, { __calls: calls }));
  vm.runInContext(lineSrc(/  const usGone = [^\n]+/) + "\n" + lineSrc(/  const loadLinkedCodes = [^\n]+/) + "\n" + lineSrc(/  const usMirrorReady = [^\n]+/) + "\n" +
    ["loadCreatedCodes", "removeCreatedCode", "noteLinkedCodes", "usForgetChildLocal", "usOrphanChildren", "usReconcileLocalChildren", "usVisibleDocs"].map((n) => fnSrc(n)).join("") +
    fnSrc("usSwitchAwayFromCurrent", true) + fnSrc("usOrphanDelete", true) + fnSrc("usOrphanLink", true) + ";globalThis.T = { usOrphanChildren, usReconcileLocalChildren, usOrphanLink, usOrphanDelete, usVisibleDocs, noteLinkedCodes, usForgetChildLocal, usGone, loadLinkedCodes };", sb);
  return { sb, calls, store, T: sb.T, set: (k, v) => { sb[k] = v; } };
}
const L = (childKey, familyCode, extra) => ({ childKey, familyCode, displayName: familyCode, order: 1, ...(extra || {}) });
const flush = () => new Promise((r) => setTimeout(r, 20));

test("(a) 링크 없는 아이: 미러를 받은 뒤 '이 기기에만 있는 아이'로 나오고(현재 아이 포함), 자동으로 지워지지 않는다", async () => {
  const e = env({ children: [{ code: "CODE_A", name: "다은" }, { code: "CODE_B", name: "하준" }], current: "CODE_A", links: [L("b", "CODE_B")], known: ["CODE_B"] });
  assert.deepStrictEqual(JSON.parse(JSON.stringify(e.T.usOrphanChildren())), [{ code: "CODE_A", name: "다은", current: true }]);
  e.T.usReconcileLocalChildren(); await flush();
  assert.ok(!e.calls.some((c) => /switch|reset|empty/.test(c)), "링크를 본 적 없는 아이는 정리하지 않는다: " + e.calls);
  assert.ok(JSON.parse(e.store.hannun_children).some((c) => c.code === "CODE_A"));
});

test("미러 로딩 전(오프라인·첫 로드)에는 목록도 정리도 없다 / 계정 모드 밖·가구 없음도 건드리지 않는다", async () => {
  for (const o of [{ ready: false }, { acct: false }, { noHousehold: true }]) {
    const e = env({ children: [{ code: "CODE_A", name: "다은" }], current: "CODE_A", links: [], known: ["CODE_A"], ...o });
    assert.deepStrictEqual(e.T.usOrphanChildren().length, 0, JSON.stringify(o));
    e.T.usReconcileLocalChildren(); await flush();
    assert.ok(!e.calls.some((c) => /switch|reset|empty/.test(c)), JSON.stringify(o) + " " + e.calls);
    assert.strictEqual(JSON.parse(e.store.hannun_children).length, 1);
  }
});

test("다른 기기에서 삭제(링크 문서 사라짐, 이 기기는 링크를 본 적 있음): 현재 아이면 남은 아이로 전환, 마지막이면 빈 상태 — 서버는 건드리지 않는다", async () => {
  let e = env({ children: [{ code: "CODE_A", name: "다은" }, { code: "CODE_B", name: "하준" }], current: "CODE_A", links: [L("b", "CODE_B")], known: ["CODE_A", "CODE_B"] });
  e.T.usReconcileLocalChildren(); await flush();
  assert.ok(e.calls.includes("switch:CODE_B"), "남은 아이로 전환: " + e.calls);
  assert.deepStrictEqual(JSON.parse(e.store.hannun_children).map((c) => c.code), ["CODE_B"], "목록에서 정리");
  assert.ok(!e.calls.some((c) => /^(del|family):/.test(c)), "서버 쓰기 없음");
  e = env({ children: [{ code: "CODE_A", name: "다은" }], current: "CODE_A", links: [], known: ["CODE_A"] });
  e.T.usReconcileLocalChildren(); await flush();
  assert.ok(e.calls.includes("reset") && e.calls.includes("empty"), "마지막 아이: 빈 상태 " + e.calls);
  assert.ok(e.calls.includes("hhRender") && e.calls.includes("refresh"), "칩·달력을 다시 그린다(마지막 아이 삭제 직후 칩 즉시 갱신)");
  // 현재 아이가 아닌 아이가 사라진 경우: 목록만 정리
  e = env({ children: [{ code: "CODE_A", name: "다은" }, { code: "CODE_B", name: "하준" }], current: "CODE_A", links: [L("a", "CODE_A")], known: ["CODE_A", "CODE_B"] });
  e.T.usReconcileLocalChildren(); await flush();
  assert.deepStrictEqual(JSON.parse(e.store.hannun_children).map((c) => c.code), ["CODE_A"]);
  assert.ok(!e.calls.some((c) => /switch|reset|empty/.test(c)), "보던 아이는 그대로");
});

test("다른 기기에서 보던 아이를 빼기(removedAt): 이 기기는 다른 아이로 전환하되 아이 목록 항목('분리됨')은 남긴다", async () => {
  const e = env({ children: [{ code: "CODE_A", name: "다은" }, { code: "CODE_B", name: "하준" }], current: "CODE_A", links: [L("a", "CODE_A", { removedAt: 5 }), L("b", "CODE_B")], known: ["CODE_A", "CODE_B"] });
  e.T.usReconcileLocalChildren(); await flush();
  assert.ok(e.calls.includes("switch:CODE_B"));
  assert.deepStrictEqual(JSON.parse(e.store.hannun_children).map((c) => c.code), ["CODE_A", "CODE_B"], "분리된 아이 항목은 유지");
});

test("정리 중(usGone.busy, 이 기기에서 삭제 실행 중)에는 변경 알림이 같은 정리를 또 하지 않는다 / 링크를 보면 기록한다", async () => {
  const e = env({ children: [{ code: "CODE_A", name: "다은" }], current: "CODE_A", links: [], known: ["CODE_A"] });
  e.T.usGone.busy = true;
  e.T.usReconcileLocalChildren(); await flush();
  assert.ok(e.calls.length === 0);
  const f = env({ links: [L("a", "CODE_A"), L("b", "CODE_B", { removedAt: 1 })] });
  f.T.noteLinkedCodes();
  assert.deepStrictEqual(JSON.parse(f.store.hannun_linked_codes), ["CODE_A"], "살아 있는 링크만 기록");
});

test("(a) 연결 안 된 아이 [삭제]: 이 기기에서 만든 아이면 아이 문서·할 일을 지우고 이 기기를 정리, 아니면 문서는 지우지 않는다 / [연결]은 가구에 링크를 만든다", async () => {
  let e = env({ children: [{ code: "CODE_A", name: "다은" }], current: "CODE_A", links: [], created: ["CODE_A"], todos: [{ id: "t1", childKey: "CODE_A" }, { id: "t2", childKey: "other" }] });
  await e.T.usOrphanDelete("CODE_A");
  assert.deepStrictEqual(e.calls.filter((c) => /^(del|family)/.test(c)), ["del:households/H1/todos/t1", "family:CODE_A"]);
  assert.strictEqual(JSON.parse(e.store.hannun_children).length, 0);
  assert.ok(e.calls.includes("reset") && e.calls.includes("empty"), "마지막 아이: 빈 상태");
  e = env({ children: [{ code: "CODE_A", name: "다은" }, { code: "CODE_Z", name: "남의" }], current: "CODE_A", links: [], created: ["CODE_A"] });
  await e.T.usOrphanDelete("CODE_Z");
  assert.ok(!e.calls.some((c) => /^family:/.test(c)), "내가 만들지 않은 코드의 문서는 지우지 않는다");
  assert.deepStrictEqual(JSON.parse(e.store.hannun_children).map((c) => c.code), ["CODE_A"]);
  e = env({ children: [{ code: "CODE_A", name: "다은" }], current: "CODE_A", links: [] });
  await e.T.usOrphanLink("CODE_A");
  assert.ok(e.calls.includes("addChild:CODE_A"));
});

test("(b) 빼기한 아이만 대상인 일정은 캘린더·홈에서 숨기고(데이터는 그대로), 공동 일정·가족 일정·다른 아이 일정은 남는다 — 다시 연결(removedAt 해제)하면 보인다", () => {
  const docs = [{ id: "s1", scope: "CHILD", childKeys: ["a"] }, { id: "s2", scope: "CHILD", childKeys: ["a", "b"] }, { id: "s3", scope: "CHILD", childKeys: ["b"] }, { id: "s4", scope: "FAMILY" }];
  const e = env({ links: [L("a", "CODE_A", { removedAt: 3 }), L("b", "CODE_B")], docs });
  assert.deepStrictEqual(e.T.usVisibleDocs().map((d) => d.id), ["s2", "s3", "s4"]);
  const f = env({ links: [L("a", "CODE_A"), L("b", "CODE_B")], docs });
  assert.strictEqual(f.T.usVisibleDocs().length, 4, "다시 연결하면 복원");
  assert.ok(/user: \{ schedules: usVisibleDocs\(\)/.test(APP), "월 모델은 보이는 일정만 쓴다");
});

test("(c) 마지막 아이 삭제 직후: 계정 모드는 아이가 없어도 칩·달력을 다시 그린다(usRefreshCalendar 조건)", () => {
  assert.ok(/if \(\(!profile && !acctEnabled\(\)\) \|\| !hhEnabled\(\)/.test(fnSrc("usRefreshCalendar")));
  assert.ok(/await usSwitchAwayFromCurrent\(key\)/.test(APP) && /hhRender\(\);\n\s+usRefreshCalendar\(\);\n\s+\} catch \(e\) \{\n\s+console\.error\("칩 지우기 실패"/.test(APP));
});

test("HouseholdSync: 아이 링크 목록을 한 번 받기 전에는 childrenLoaded=false, 받으면 true(재구독하면 다시 false)", async () => {
  const handlers = {};
  const adapter = { get: async () => ({ exists: false }), set: async () => {}, update: async () => {}, delete: async () => {}, list: async () => [], listen: (p, on) => { handlers[p] = on; return () => {}; } };
  const mem = new Map(); const storage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
  const hs = HS.create({ adapter, storage, features: () => ({ household: true }) });
  hs.startListening("H1", () => {});
  assert.strictEqual(hs.getStatus("H1").childrenLoaded, false);
  handlers["households/H1/members"]([]);
  assert.strictEqual(hs.getStatus("H1").childrenLoaded, false, "다른 컬렉션 응답으로는 true 가 되지 않는다");
  handlers["households/H1/children"]([]);
  assert.strictEqual(hs.getStatus("H1").childrenLoaded, true);
  hs.startListening("H1", () => {});
  assert.strictEqual(hs.getStatus("H1").childrenLoaded, false);
  assert.strictEqual(hs.getStatus(null).childrenLoaded, false);
});

test("구성원 관리: 연결 안 된 아이 구역(삭제·연결 버튼)은 계정 모드에서 목록이 있을 때만 그려진다", () => {
  const base = { acctMode: true, enabled: true, hasHousehold: true, members: [{ memberId: "m1", role: "MOM", label: "엄마", order: 1 }], children: [], view: "list" };
  const h = HV.renderMembers({ ...base, orphanChildren: [{ code: "CODE_A", name: "다은찡", current: true }] });
  assert.ok(h.includes("이 기기에만 있는 아이") && h.includes("다은찡") && h.includes('data-mem-action="ask-delete-orphan"') && h.includes('data-mem-action="link-orphan"') && h.includes('data-child-code="CODE_A"'));
  assert.ok(!HV.renderMembers({ ...base, orphanChildren: [] }).includes("이 기기에만 있는 아이"));
  assert.ok(!HV.renderMembers({ ...base, acctMode: false, orphanChildren: [{ code: "X", name: "x" }] }).includes("이 기기에만 있는 아이"));
});
