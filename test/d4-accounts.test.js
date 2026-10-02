/*
 * D4 계정: 기존 기기 데이터 이전(가구 귀속·아이 연결·선택 시트)·로그아웃 정리·두 가족코드 라벨·이전 칩 선택 복원·복구 시트 재노출. 가짜 Auth/Firestore, 서버 호출 없음.
 * 실행: node test/d4-accounts.test.js
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const HS = require("../js/household-sync.js");
const AS = require("../js/auth-service.js");
const AV = require("../js/account-view.js");
const ASYNC = require("../js/account-sync.js");
const HV = require("../js/household-view.js");
const V = require("../js/user-schedule-view.js");
const read = (f) => fs.readFileSync(path.join(__dirname, "..", f), "utf8");
const APP = read("js/app.js");

let passed = 0;
const pending = [];
function test(name, fn) {
  const p = Promise.resolve().then(fn).then(() => { passed++; console.log("  ok  - " + name); }, (e) => { process.exitCode = 1; console.log("  FAIL- " + name + "\n      " + (e.stack || e).split("\n").slice(0, 6).join("\n      ")); });
  pending.push(p);
  return p;
}
function memDb() {
  const docs = new Map();
  return { docs,
    async get(p) { return docs.has(p) ? { exists: true, data: JSON.parse(JSON.stringify(docs.get(p))) } : { exists: false, data: null }; },
    async set(p, d, o) { docs.set(p, o && o.merge ? { ...(docs.get(p) || {}), ...d } : { ...d }); },
    async update(p, d) { docs.set(p, { ...docs.get(p), ...d }); },
    async list(p) { return [...docs.entries()].filter(([k]) => k.startsWith(p + "/") && k.split("/").length === p.split("/").length + 1).map(([k, v]) => ({ id: k.split("/").pop(), data: { ...v } })); },
    listen() { return () => {}; } };
}
const memStorage = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
let T = 1;
function world(db) {
  db = db || memDb();
  const storage = memStorage();
  const hs = HS.create({ adapter: db, storage, features: () => ({ household: true }), now: () => ++T, rand: (() => { let i = 7; return () => ((i = (i * 7919 + 13) % 1000) / 1000); })() });
  return { db, storage, hs, sync: ASYNC.create({ adapter: db, household: hs, now: () => ++T }) };
}
const KIDS = [{ code: "KID111", name: "수아", stage: "born" }];

function appEnv({ w, local = {}, hhHid = null, hhCode = null, profile = null, familyCode = null, pendingN = 0, uid = "uNew" } = {}) {
  w = w || world();
  const authAd = (() => { const calls = []; let cb = null; let cur = null;
    return { calls, createUser: async (e) => { calls.push("createUser"); cur = { uid, email: e, displayName: "" }; return cur; },
      signIn: async (e) => { calls.push("signIn"); cur = { uid, email: e, displayName: "지은" }; return cur; }, signOut: async () => { calls.push("signOut"); }, sendReset: async () => {},
      deleteUser: async () => { calls.push("deleteUser"); }, updateDisplayName: async (u, n) => ({ ...u, displayName: n }), onChange: (f) => { cb = f; return () => {}; } }; })();
  const store = { hannun_children: JSON.stringify(KIDS), ...local };
  const sheet = { innerHTML: "", querySelector: () => null, classList: { remove() {}, add() {} } };
  const log = { setJoined: [], left: 0, flushed: 0, closed: 0, loaded: [], sheets: [] };
  const hhObj = { hid: hhHid, code: hhCode };
  const els = { "modal-content": sheet, "detail-modal": sheet, childName: { value: "" }, familyCodeInput: { value: "" }, "view-landing": { querySelector: () => null } };
  const HSX = Object.assign(Object.create(w.hs), { firestoreAdapter: () => w.db,
    getStatus: (h) => ({ pending: pendingN, permissionDenied: false, ...(h ? {} : {}) }),
    flush: async (h) => { log.flushed++; return w.hs.flush(h); } });
  const sb = { console, Date, JSON, Promise, firebase: { firestore: () => ({}) }, AccountView: AV, AccountSync: ASYNC, HouseholdView: HV, window: { FEATURES: { accounts: true } },
    AuthService: { create: () => AS.create({ features: () => ({ accounts: true }), adapter: authAd }), MSG: AS.MSG },
    HouseholdSync: HSX, el: (id) => els[id] || null, closeDetail: () => { log.closed++; }, hh: hhObj,
    hhSetJoined: (hid, code) => { log.setJoined.push([hid, code]); hhObj.hid = hid; hhObj.code = code; },
    hhLeaveLocal: () => { log.left++; hhObj.hid = null; hhObj.code = null; }, hhRender() {},
    showLandingView() {}, setLandingStage() {}, setBirthDatePicker() {}, handleLoadCode: async () => { log.loaded.push(els.familyCodeInput.value); },
    localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = v; }, removeItem: (k) => { delete store[k]; } },
    document: { createElement: () => ({ addEventListener() {} }) } };
  vm.createContext(sb);
  const a = APP.indexOf("// ── D1 계정"), b = APP.indexOf("async function init()");
  vm.runInContext(`let modalMode = null; let profile = ${JSON.stringify(profile)}; let familyCode = ${JSON.stringify(familyCode)}; const isPregnant = () => false; const childDisplayName = () => "수아"; const CHILDREN_KEY = "hannun_children";
    const loadChildren = () => { try { return JSON.parse(localStorage.getItem(CHILDREN_KEY) || "[]"); } catch (e) { return []; } }; const us = { selection: ["CHILD:x"], selTouched: true }; function usRefreshCalendar() {}\n` + APP.slice(a, b) + "\n;globalThis.__t = { acct, acctOnClick, acctInit, acctRestore };", sb);
  const click = (action) => sb.__t.acctOnClick({ target: { closest: (sel) => (sel === "[data-acct-radio]" ? null : { getAttribute: () => action }) } });
  return { sb, w, authAd, store, sheet, log, hhObj, acct: sb.__t.acct, click, init: () => sb.__t.acctInit(), restore: (u) => sb.__t.acctRestore(u) };
}
const form = (x) => ({ email: "m@x.co", password: "12345678", displayName: "지은", role: "MOM", situation: "HAS_CHILD", institution: "DAYCARE", childName: "수아", birthDate: "2026-01-02", ...x });
const childrenOf = (w, hid) => [...w.db.docs.entries()].filter(([k]) => k.startsWith(`households/${hid}/children/`)).map(([, v]) => v);
const householdsOf = (w) => [...w.db.docs.keys()].filter((k) => /^households\/[^/]+$/.test(k));
async function mkHousehold(w) { const r = await w.hs.createHousehold({}); assert.ok(r.ok); return r; }

(async () => {
  console.log("마이그레이션: 가입");
  await test("이 기기에 가구가 있으면 새 가구를 만들지 않고 계정에 귀속(accounts 가 기기 가구를 가리킴), 아이 로컬 데이터 불변", async () => {
    const w = world();
    const dev = await mkHousehold(w);
    const e = appEnv({ w, hhHid: dev.householdId, hhCode: dev.code, profile: {}, familyCode: "KID111" });
    e.init();
    e.acct.mode = "signup"; e.acct.form = form();
    await e.click("submit-signup");
    assert.strictEqual(householdsOf(w).length, 1, "새 가구 없음");
    const acc = w.db.docs.get("accounts/uNew");
    assert.deepStrictEqual([acc.householdId, acc.householdCode], [dev.householdId, dev.code]);
    assert.deepStrictEqual(JSON.parse(e.store.hannun_children), KIDS);
    assert.ok(!e.acct.migrate || e.acct.migrate.kids.length >= 0);
  });
  await test("이 기기에 아이만 있고 가구가 없으면 새 가구를 만들고 이 기기 아이를 바로 연결(addChild), 아이 목록 불변", async () => {
    const w = world();
    const e = appEnv({ w, profile: {}, familyCode: "KID111" });
    e.init();
    e.acct.mode = "signup"; e.acct.form = form();
    await e.click("submit-signup");
    const hid = w.db.docs.get("accounts/uNew").householdId;
    assert.deepStrictEqual(childrenOf(w, hid).map((c) => [c.familyCode, c.displayName]), [["KID111", "수아"]]);
    assert.strictEqual(e.acct.migrate, null);
    assert.deepStrictEqual(JSON.parse(e.store.hannun_children), KIDS);
  });
  await test("기기 가구 B 와 합류 코드 A 가 다르면 바꾸기 전에 선택 시트: 아무것도 바꾸지 않고(hhSetJoined·leave 0), 시트는 닫힌 직후 열린다", async () => {
    const w = world();
    const a = await mkHousehold(w), b = await mkHousehold(w);
    const e = appEnv({ w, hhHid: b.householdId, hhCode: b.code, profile: {}, familyCode: "KID111" });
    e.init();
    e.acct.mode = "signup"; e.acct.form = form({ role: "DAD", familyCode: a.code });
    await e.click("submit-signup");
    assert.deepStrictEqual([e.log.setJoined.length, e.log.left, e.hhObj.code], [0, 0, b.code]);
    assert.strictEqual(e.acct.migrate.switchTo, a.code);
    assert.ok(e.sheet.innerHTML.includes('data-acct-form="migrate"') && e.sheet.innerHTML.includes("가족 캘린더를 바꿀까요?") && e.sheet.innerHTML.includes("내 계정 가족 쓰기") && e.sheet.innerHTML.includes("이 기기 아이를 가족에 추가") && e.sheet.innerHTML.includes("지워지지 않아요"));
    assert.ok(!("hannun_account_intent" in e.store), "계정 연결은 끝났으므로 의도 정리");
    e.w.__a = a;
  });
  await test("선택 '이 기기 아이를 가족에 추가': 대기열 비우고 이 기기 가구 정리 → 계정 가구 합류 → 아이 addChild(중복 없이), 기기 아이 목록 불변", async () => {
    const w = world();
    const a = await mkHousehold(w), b = await mkHousehold(w);
    const e = appEnv({ w, hhHid: b.householdId, hhCode: b.code, profile: {}, familyCode: "KID111" });
    e.init(); e.acct.mode = "signup"; e.acct.form = form({ role: "DAD", familyCode: a.code });
    await e.click("submit-signup");
    await e.click("migrate-add");
    assert.deepStrictEqual([e.log.flushed >= 1, e.log.left, e.log.setJoined.map((x) => x[1])], [true, 1, [a.code]]);
    assert.deepStrictEqual(childrenOf(w, a.householdId).map((c) => c.familyCode), ["KID111"]);
    assert.strictEqual(e.acct.migrate, null);
    assert.deepStrictEqual(JSON.parse(e.store.hannun_children), KIDS);
    assert.strictEqual(e.acct.notice, AV.MSG.migrateAdded);
  });
  await test("선택 '내 계정 가족 쓰기': 가구만 바꾸고 아이는 추가하지 않으며 기기 아이 기록은 그대로, 같은 선택을 기억(다시 묻지 않음)", async () => {
    const w = world();
    const a = await mkHousehold(w), b = await mkHousehold(w);
    const e = appEnv({ w, hhHid: b.householdId, hhCode: b.code, profile: {}, familyCode: "KID111" });
    e.init(); e.acct.mode = "signup"; e.acct.form = form({ role: "DAD", familyCode: a.code });
    await e.click("submit-signup");
    await e.click("migrate-keep");
    assert.deepStrictEqual([e.log.left, e.log.setJoined.map((x) => x[1]), childrenOf(w, a.householdId).length], [1, [a.code], 0]);
    assert.deepStrictEqual(JSON.parse(e.store.hannun_migrate_kept), ["KID111"]);
    assert.deepStrictEqual(JSON.parse(e.store.hannun_children), KIDS);
  });
  await test("보내지 못한 변경이 남아 있으면 가구를 바꾸지 않는다(유실 방지): 오류 문구·기기 가구 그대로·시트 유지", async () => {
    const w = world();
    const a = await mkHousehold(w), b = await mkHousehold(w);
    const e = appEnv({ w, hhHid: b.householdId, hhCode: b.code, profile: {}, familyCode: "KID111", pendingN: 2 });
    e.init(); e.acct.mode = "signup"; e.acct.form = form({ role: "DAD", familyCode: a.code });
    await e.click("submit-signup");
    await e.click("migrate-add");
    assert.deepStrictEqual([e.log.left, e.log.setJoined.length, e.hhObj.code], [0, 0, b.code]);
    assert.ok(e.acct.migrate && e.sheet.innerHTML.includes(AV.MSG.migrateFail.slice(0, 12)) && !e.acct.busy);
  });
  console.log("마이그레이션: 로그인·복원");
  await test("로그인: 기기에 가구가 없고 계정 가구에 없는 아이가 있으면 합류 후 선택 시트, 이미 연결된 아이만 있으면 묻지 않는다", async () => {
    const w = world();
    const a = await mkHousehold(w);
    await w.sync.completeSignup({ user: { uid: "uOld" }, intent: { email: "m@x.co", displayName: "지은", role: "MOM", joiningCode: a.code } });
    const e = appEnv({ w, uid: "uOld", profile: {}, familyCode: "KID111" });
    e.init(); e.acct.mode = "login"; e.acct.form = { email: "m@x.co", password: "12345678" };
    await e.click("submit-login");
    for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 5));
    assert.deepStrictEqual([e.log.setJoined.map((x) => x[1]), !!e.acct.migrate, e.acct.migrate && e.acct.migrate.switchTo], [[a.code], true, null]);
    assert.ok(e.sheet.innerHTML.includes('data-acct-form="migrate"') && e.sheet.innerHTML.includes("수아"));
    await w.hs.addChild(a.householdId, { familyCode: "KID111", displayName: "수아", order: 1 });
    const e2 = appEnv({ w, uid: "uOld", profile: {}, familyCode: "KID111" });
    e2.init(); e2.acct.mode = "login"; e2.acct.form = { email: "m@x.co", password: "12345678" };
    await e2.click("submit-login");
    for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 5));
    assert.strictEqual(e2.acct.migrate, null);
    assert.ok(!e2.sheet.innerHTML.includes("migrate"));
  });
  await test("복원 시 기기 가구와 계정 가구가 다르면 자동으로 바꾸지 않고 선택 시트만 준비(앱 시작마다 재확인)", async () => {
    const w = world();
    const a = await mkHousehold(w), b = await mkHousehold(w);
    await w.sync.completeSignup({ user: { uid: "uOld" }, intent: { email: "m@x.co", displayName: "지은", role: "MOM", joiningCode: a.code } });
    const e = appEnv({ w, uid: "uOld", hhHid: b.householdId, hhCode: b.code, profile: {}, familyCode: "KID111" });
    e.init();
    e.acct.user = { uid: "uOld", email: "m@x.co" };
    await e.restore(e.acct.user);
    assert.deepStrictEqual([e.log.left, e.log.setJoined.length, e.hhObj.code, e.acct.migrate.switchTo], [0, 0, b.code, a.code]);
    assert.ok(e.sheet.innerHTML.includes("가족 캘린더를 바꿀까요?"));
  });
  console.log("로그아웃 정리");
  await test("로그아웃: 이 계정의 가구면 대기열을 보내 본 뒤 가구 연결만 정리(hhLeaveLocal), 아이·완료 데이터 불변, 선택·계정 상태 초기화 → 다른 계정은 새로 시작", async () => {
    const w = world();
    const a = await mkHousehold(w);
    const e = appEnv({ w, uid: "uOld", hhHid: a.householdId, hhCode: a.code, profile: {}, familyCode: "KID111", local: { hannun_completed: "{\"x\":1}" } });
    e.init();
    e.acct.user = { uid: "uOld", email: "m@x.co" };
    e.acct.account = { householdCode: a.code, householdId: a.householdId, memberId: "m1" };
    await e.click("logout");
    await e.click("confirm-logout");
    assert.deepStrictEqual([e.log.flushed, e.log.left, e.hhObj.code, e.authAd.calls.includes("signOut")], [1, 1, null, true]);
    assert.deepStrictEqual([JSON.parse(e.store.hannun_children), e.store.hannun_completed], [KIDS, "{\"x\":1}"]);
    assert.deepStrictEqual([e.acct.user, e.acct.account, e.acct.migrate], [null, null, null]);
    assert.ok(w.db.docs.has("households/" + a.householdId), "서버 데이터 삭제 없음");
  });
  await test("로그아웃: 계정과 무관한 기기 가구(다른 코드)는 건드리지 않는다 / 가구가 없으면 아무 정리도 하지 않는다", async () => {
    const w = world();
    const a = await mkHousehold(w), b = await mkHousehold(w);
    const e = appEnv({ w, uid: "uOld", hhHid: b.householdId, hhCode: b.code });
    e.init();
    e.acct.user = { uid: "uOld" }; e.acct.account = { householdCode: a.code };
    await e.click("confirm-logout");
    assert.deepStrictEqual([e.log.left, e.log.flushed, e.hhObj.code], [0, 0, b.code]);
  });
  await test("로그아웃 후 다른 계정 로그인: 이전 계정 가구가 섞이지 않고 새 계정 가구만 복원되며, 남은 이 기기 아이는 자동 연결 없이 물어본다", async () => {
    const w = world();
    const a = await mkHousehold(w), c = await mkHousehold(w);
    await w.sync.completeSignup({ user: { uid: "uA" }, intent: { email: "a@x.co", displayName: "지은", role: "MOM", joiningCode: a.code } });
    await w.sync.completeSignup({ user: { uid: "uC" }, intent: { email: "c@x.co", displayName: "민수", role: "DAD", joiningCode: c.code } });
    const e = appEnv({ w, uid: "uA", hhHid: a.householdId, hhCode: a.code });
    e.init(); e.acct.user = { uid: "uA" }; e.acct.account = { householdCode: a.code };
    await e.click("confirm-logout");
    e.acct.user = { uid: "uC", email: "c@x.co" };
    await e.restore(e.acct.user);
    // 이전 계정 가구(A)는 정리돼 있어 C 만 합류하고, 이 기기 아이(남아 있음)는 새 계정에서 새로 '추가할지' 묻는다(자동 연결 아님).
    assert.deepStrictEqual([e.log.setJoined.map((x) => x[1]), e.acct.migrate.switchTo, childrenOf(w, c.householdId).length, childrenOf(w, a.householdId).length], [[c.code], null, 0, 0]);
  });
  console.log("복구 시트 재노출 · 칩 복원 · 라벨 · OFF");
  await test("복구 시트 '나중에'(닫기)는 같은 실행 중에는 다시 띄우지 않고, 로그아웃 후 다시 로그인하면(또는 앱 재시작) 다시 보인다", async () => {
    const w = world();
    const e = appEnv({ w, uid: "uZ" });
    e.init();
    const u = { uid: "uZ", email: "z@x.co", displayName: "지은" };
    await e.restore(u);
    assert.ok(e.sheet.innerHTML.includes("data-acct-form=\"recover\""));
    await e.click("close");
    e.sheet.innerHTML = "";
    await e.restore(u);
    assert.strictEqual(e.sheet.innerHTML, "", "같은 실행 중 재노출 없음");
    e.acct.user = u;
    await e.click("confirm-logout");
    await e.restore(u);
    assert.ok(e.sheet.innerHTML.includes("data-acct-form=\"recover\""), "로그아웃 후 다시 로그인하면 다시 보인다");
    assert.ok(/recoverShown: false/.test(APP) || /recoverShown = false/.test(APP));
  });
  await test("이전 저장 선택값(MOM/DAD 역할 칩)은 계정 모드에서 같은 역할의 구성원 칩으로 복원되고, 옵션이 없으면 기존 동작 그대로", () => {
    const L = [{ childKey: "c1", displayName: "수아", order: 1 }];
    const M = [{ memberId: "m1", role: "MOM", label: "엄마", order: 1 }, { memberId: "m2", role: "DAD", label: "아빠", order: 2 }];
    const ME = { memberMode: true, meId: "m1" };
    assert.deepStrictEqual(V.normalizeSelection(["MOM"], L, M, ME), ["MEMBER:m1"]);
    assert.deepStrictEqual(V.normalizeSelection(["DAD", "CHILD:c1"], L, M, ME), ["MEMBER:m2", "CHILD:c1"]);
    assert.deepStrictEqual(V.normalizeSelection(["MOM", "DAD", "CHILD:c1", "FAMILY"], L, M, ME), [], "전부 고르면 전체");
    assert.deepStrictEqual(V.normalizeSelection(["MOM"], L, M), ["MOM"]);
    assert.deepStrictEqual(V.filterChips(L, ["MOM"], M, ME).filter((c) => c.selected).map((c) => c.id), ["MEMBER:m1"]);
  });
  await test("두 가족코드 구분: 계정 로그인 상태에서는 가구 코드를 '가족 캘린더 코드(8자리)'로 강조하고 아이 코드는 '아이 기록 코드(6자리)' 접힘 영역으로, 로그아웃·OFF 는 기존 라벨", () => {
    const st = { enabled: true, view: "active", code: "ABCD2345", pending: 0 };
    assert.ok(HV.renderSection({ ...st, acctMode: true }).includes("가족 캘린더 코드(8자리)"));
    const off = HV.renderSection(st);
    assert.ok(off.includes("가족 코드") && !off.includes("8자리"));
    assert.ok(APP.includes("acctMode: acctEnabled() && !!acct.user"));
    assert.ok(/acctEnabled\(\) && acct\.user && hh\.code\s*\n\s*\? `<details class="detail-row acct-child-code"><summary class="label">\$\{esc\(AccountView\.MSG\.childCodeLabel\)\}<\/summary>/.test(APP));
    assert.ok(APP.includes('<div class="label">가족코드</div>') && AV.MSG.childCodeLabel === "아이 기록 코드(6자리)" && AV.MSG.childCodeHint.includes("8자리"));
  });
  await test("플래그 OFF: 이전 관련 새 동작은 어떤 것도 실행되지 않는다(마이그레이션 클릭·로그아웃 정리 모두 acctOnClick 가드 뒤, 서버 호출 0)", async () => {
    const w = world();
    const e = appEnv({ w, hhHid: "h", hhCode: "ABCD2345" });
    e.sb.window.FEATURES.accounts = false;
    e.init();
    e.acct.migrate = { switchTo: "ZZ", kids: KIDS };
    for (const act of ["migrate-add", "migrate-keep", "confirm-logout"]) await e.click(act);
    assert.deepStrictEqual([e.log.left, e.log.flushed, e.log.setJoined.length, e.authAd.calls], [0, 0, 0, []]);
    assert.ok(/function acctMaybeShowMigrate\(\) \{\n\s*if \(acct\.user && acct\.migrate && !acct\.busy\)/.test(APP));
  });
  await test("가입 직후 안내('가입했어요…')는 내 정보 시트에서 한 번 보이고 이후 사라진다", () => {
    const m = APP.match(/function acctOpenSlot\(\) \{[\s\S]*?\n  \}/)[0];
    assert.ok(/acctRenderSlot\(\);\n\s*acct\.notice = null;/.test(m));
  });
  await Promise.all(pending);
  console.log(`\n${passed}개 통과${process.exitCode ? ", 일부 실패" : ""}`);
})();
