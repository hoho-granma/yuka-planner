/*
 * D2 계정: AccountSync(가짜 Firestore + 실제 HouseholdSync) · 규칙(accounts/members.uid) · app.js 가입/복원 흐름(가짜 Auth). 실제 서버 호출 없음.
 * 실행: node test/d2-accounts.test.js
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
const read = (f) => fs.readFileSync(path.join(__dirname, "..", f), "utf8");
const APP = read("js/app.js");

let passed = 0;
const pending = [];
function test(name, fn) {
  const p = Promise.resolve().then(fn).then(() => { passed++; console.log("  ok  - " + name); }, (e) => { process.exitCode = 1; console.log("  FAIL- " + name + "\n      " + (e.stack || e).split("\n").slice(0, 5).join("\n      ")); });
  pending.push(p);
  return p;
}

// ── 메모리 Firestore(어댑터 계약) ──
function memDb({ rules = true } = {}) {
  const docs = new Map(), calls = [];
  const denied = () => Object.assign(new Error("denied"), { code: "permission-denied" });
  const a = { docs, calls, rules,
    async get(p) { calls.push(["get", p]); return docs.has(p) ? { exists: true, data: JSON.parse(JSON.stringify(docs.get(p))) } : { exists: false, data: null }; },
    async set(p, d, o) { calls.push(["set", p]); if (p.startsWith("accounts/") && !a.rules) throw denied(); docs.set(p, o && o.merge ? { ...(docs.get(p) || {}), ...d } : { ...d }); },
    async update(p, d) { calls.push(["update", p]); docs.set(p, { ...docs.get(p), ...d }); },
    async list(p) { return [...docs.entries()].filter(([k]) => k.startsWith(p + "/") && k.split("/").length === p.split("/").length + 1).map(([k, v]) => ({ id: k.split("/").pop(), data: { ...v } })); },
    listen() { return () => {}; } };
  return a;
}
const memStorage = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
let T = 1;
function world(opts) {
  const db = memDb(opts);
  const storage = memStorage();
  const hs = HS.create({ adapter: db, storage, features: () => ({ household: true }), now: () => ++T, rand: (() => { let i = 3; return () => ((i = (i * 7919 + 13) % 1000) / 1000); })() });
  const sync = ASYNC.create({ adapter: db, household: hs, now: () => ++T });
  return { db, storage, hs, sync };
}
const intentNew = { email: "m@x.co", displayName: "지은", role: "MOM", joiningCode: null, situation: "HAS_CHILD", province: "서울특별시", district: "구로구" };

(async () => {
  console.log("chooseMember");
  await test("내 uid 구성원 > 같은 role 시드(uid 없음) 확보 > 새 구성원(이모님·자녀·이미 확보된 role)", () => {
    const members = { m1: { role: "MOM", label: "엄마", order: 1 }, m2: { role: "DAD", label: "아빠", order: 2 } };
    assert.deepStrictEqual(ASYNC.chooseMember(members, { role: "DAD", uid: "u", displayName: "민수" }), { memberId: "m2", role: "DAD", label: "아빠", order: 2, claimed: true });
    assert.strictEqual(ASYNC.chooseMember({ ...members, m2: { ...members.m2, uid: "u" } }, { role: "MOM", uid: "u", displayName: "x" }).memberId, "m2", "이미 내 구성원이면 그대로");
    const care = ASYNC.chooseMember(members, { role: "CAREGIVER", uid: "u", displayName: "  이모님 이름이 아주아주아주아주 길어요 길어요  " });
    assert.deepStrictEqual([care.memberId, care.role, care.order, care.label.length <= 20, care.claimed], [null, "CAREGIVER", 3, true, false]);
    const taken = ASYNC.chooseMember({ ...members, m1: { ...members.m1, uid: "other" } }, { role: "MOM", uid: "u", displayName: "새엄마" });
    assert.deepStrictEqual([taken.memberId, taken.label, taken.order], [null, "새엄마", 3]);
    assert.strictEqual(ASYNC.chooseMember({ ...members, m1: { ...members.m1, deletedAt: 1 } }, { role: "MOM", uid: "u", displayName: "a" }).memberId, null, "삭제된 시드는 확보하지 않는다");
    assert.strictEqual(ASYNC.chooseMember(members, { role: "CHILD", uid: "u", displayName: "큰애" }).role, "CHILD");
  });

  console.log("AccountSync 흐름");
  await test("신규 가족: accounts 문서 → 가구 생성(코드·시드 구성원) → 엄마 시드 확보(uid) → accounts 에 가구·코드·구성원 기록", async () => {
    const w = world();
    const r = await w.sync.completeSignup({ user: { uid: "u1" }, intent: intentNew });
    assert.ok(r.ok && r.created && r.claimedSeed && r.householdCode.length === 8, JSON.stringify(r));
    const acc = w.db.docs.get("accounts/u1");
    assert.deepStrictEqual(Object.keys(acc).sort(), ["createdAt", "displayName", "district", "householdCode", "householdId", "memberId", "province", "role", "situation", "updatedAt", "v"]);
    assert.deepStrictEqual([acc.v, acc.displayName, acc.role, acc.situation, acc.householdId, acc.householdCode, acc.memberId], [1, "지은", "MOM", "HAS_CHILD", r.householdId, r.householdCode, r.memberId]);
    const members = [...w.db.docs.entries()].filter(([k]) => k.startsWith(`households/${r.householdId}/members/`)).map(([k, v]) => ({ id: k.split("/").pop(), ...v }));
    assert.strictEqual(members.length, 2, "시드 2명 그대로(새 구성원 안 늘림)");
    const mom = members.find((m) => m.role === "MOM"), dad = members.find((m) => m.role === "DAD");
    assert.deepStrictEqual([mom.id, mom.uid, mom.label, dad.uid], [r.memberId, "u1", "엄마", undefined]);
    assert.ok(w.db.docs.has("householdCodes/" + r.householdCode));
  });
  await test("합류: 코드로 가구 합류, 아빠 시드 확보 / 같은 role 이 이미 확보됐으면 새 구성원 / 이모님은 새 구성원(라벨=표시 이름)", async () => {
    const w = world();
    const first = await w.sync.completeSignup({ user: { uid: "u1" }, intent: intentNew });
    const dad = await w.sync.completeSignup({ user: { uid: "u2" }, intent: { email: "d@x.co", displayName: "민수", role: "DAD", joiningCode: first.householdCode } });
    assert.ok(dad.ok && !dad.created && dad.householdId === first.householdId && dad.claimedSeed);
    assert.strictEqual(w.db.docs.get(`households/${first.householdId}/members/${dad.memberId}`).uid, "u2");
    const mom2 = await w.sync.completeSignup({ user: { uid: "u3" }, intent: { email: "m2@x.co", displayName: "새엄마", role: "MOM", joiningCode: first.householdCode } });
    const m2 = w.db.docs.get(`households/${first.householdId}/members/${mom2.memberId}`);
    assert.deepStrictEqual([mom2.claimedSeed, m2.role, m2.label, m2.uid, m2.order], [false, "MOM", "새엄마", "u3", 3]);
    const aunt = await w.sync.completeSignup({ user: { uid: "u4" }, intent: { email: "a@x.co", displayName: "이모님", role: "CAREGIVER", joiningCode: first.householdCode } });
    assert.strictEqual(w.db.docs.get(`households/${first.householdId}/members/${aunt.memberId}`).role, "CAREGIVER");
    assert.strictEqual(w.db.docs.get("accounts/u4").householdCode, first.householdCode);
  });
  await test("없는 코드: 계정 문서도 가구도 만들지 않고 not-found", async () => {
    const w = world();
    const r = await w.sync.completeSignup({ user: { uid: "u9" }, intent: { email: "x@x.co", displayName: "a", role: "DAD", joiningCode: "ZZZZ2222" } });
    assert.deepStrictEqual([r.ok, r.reason], [false, "not-found"]);
    assert.ok(!w.db.docs.has("accounts/u9") && ![...w.db.docs.keys()].some((k) => k.startsWith("households/")));
  });
  await test("규칙 미배포(accounts 쓰기 permission-denied): rules-unavailable, 가구는 만들지 않는다 / 일시 오류는 network", async () => {
    const w = world({ rules: false });
    const r = await w.sync.completeSignup({ user: { uid: "u1" }, intent: intentNew });
    assert.deepStrictEqual([r.ok, r.reason], [false, "rules-unavailable"]);
    assert.ok(![...w.db.docs.keys()].some((k) => k.startsWith("households/") || k.startsWith("householdCodes/")));
    const w2 = world();
    w2.db.get = async () => { throw Object.assign(new Error("off"), { code: "unavailable" }); };
    const r2 = await w2.sync.completeSignup({ user: { uid: "u1" }, intent: intentNew });
    assert.deepStrictEqual([r2.ok, r2.reason, r2.step], [false, "network", "account"]);
  });
  await test("재실행 안전: 이미 가구가 기록된 계정은 그대로(구성원·가구 중복 생성 없음), restore 는 계정 문서를 돌려준다", async () => {
    const w = world();
    const a = await w.sync.completeSignup({ user: { uid: "u1" }, intent: intentNew });
    const n = w.db.docs.size;
    const b = await w.sync.completeSignup({ user: { uid: "u1" }, intent: intentNew });
    assert.ok(b.ok && b.resumed && b.householdId === a.householdId && w.db.docs.size === n);
    assert.strictEqual((await w.sync.restore("u1")).account.householdCode, a.householdCode);
    assert.strictEqual((await w.sync.restore("nobody")).account, null);
    const off = world({ rules: false });
    off.db.get = async () => { throw Object.assign(new Error("d"), { code: "permission-denied" }); };
    assert.deepStrictEqual([(await off.sync.restore("u1")).ok, (await off.sync.restore("u1")).reason], [false, "rules-unavailable"]);
  });
  await test("household-sync: lookupHousehold 는 읽기 전용(저장소·쓰기 없음), upsertMember 는 uid 를 실을 수 있다, OFF 는 disabled", async () => {
    const w = world();
    const c = await w.hs.createHousehold({});
    w.db.calls.length = 0;
    w.storage.removeItem(HS.CODE_KEY);
    const l = await w.hs.lookupHousehold(c.code.toLowerCase());
    assert.deepStrictEqual([l.ok, l.householdId], [true, c.householdId]);
    assert.strictEqual(w.storage.getItem(HS.CODE_KEY), null, "저장소 불변");
    assert.ok(w.db.calls.every((x) => x[0] === "get"));
    assert.strictEqual((await w.hs.lookupHousehold("NOPE2222")).reason, "not-found");
    const off = HS.create({ adapter: memDb(), storage: memStorage(), features: () => ({ household: false }) });
    assert.strictEqual((await off.lookupHousehold("ABCD2345")).reason, "disabled");
    const u = await w.hs.upsertMember(c.householdId, { role: "CAREGIVER", label: "이모", order: 3, uid: "uX" });
    assert.strictEqual(w.db.docs.get(`households/${c.householdId}/members/${u.memberId}`).uid, "uX");
    const nu = await w.hs.upsertMember(c.householdId, { role: "CAREGIVER", label: "이모2", order: 4 });
    assert.ok(!("uid" in w.db.docs.get(`households/${c.householdId}/members/${nu.memberId}`)));
  });

  console.log("규칙(firestore.rules)");
  const RULES = read("firestore.rules");
  // 규칙 조건을 JS 로 옮긴 것(텍스트 일치는 아래 테스트가 확인한다)
  const ROLES_M = ["MOM", "DAD", "GRANDPARENT", "CAREGIVER", "OTHER", "CHILD"];
  const has = (d, k) => Object.prototype.hasOwnProperty.call(d, k);
  const memberOk = (nd, old, auth) => {
    const allowed = ["v", "role", "label", "order", "colorKey", "uid", "createdAt", "updatedAt", "deletedAt"];
    if (!Object.keys(nd).every((k) => allowed.includes(k)) || !["v", "role", "label", "order", "createdAt", "updatedAt"].every((k) => has(nd, k))) return false;
    if (nd.v !== 1 || !ROLES_M.includes(nd.role) || typeof nd.label !== "string" || nd.label.length > 20) return false;
    const uidOk = old && has(old, "uid") ? has(nd, "uid") && nd.uid === old.uid : !has(nd, "uid") || (!!auth && nd.uid === auth.uid);
    return !!uidOk;
  };
  const accountOk = (d) => {
    const allowed = ["v", "displayName", "role", "institution", "situation", "province", "district", "householdId", "householdCode", "memberId", "createdAt", "updatedAt"];
    if (!Object.keys(d).every((k) => allowed.includes(k)) || !["v", "displayName", "role", "createdAt", "updatedAt"].every((k) => has(d, k))) return false;
    const strOrNull = (k, max) => !has(d, k) || d[k] === null || (typeof d[k] === "string" && d[k].length <= max);
    return d.v === 1 && typeof d.displayName === "string" && d.displayName.length >= 1 && d.displayName.length <= 20 && ["MOM", "DAD", "CHILD", "CAREGIVER"].includes(d.role)
      && (!has(d, "institution") || d.institution === null || ["DAYCARE", "KINDERGARTEN", "ELEMENTARY", "NONE"].includes(d.institution)) && (!has(d, "situation") || d.situation === null || ["HAS_CHILD", "EXPECTING"].includes(d.situation)) && strOrNull("province", 30) && strOrNull("district", 30) && strOrNull("householdId", 60) && strOrNull("householdCode", 8) && strOrNull("memberId", 60);
  };
  const accWrite = (uid, auth, nd, old) => !!auth && auth.uid === uid && accountOk(nd) && (!old || (nd.v === old.v && nd.createdAt === old.createdAt));
  await test("규칙 텍스트: accounts 블록(본인 uid만 get/create/update, list·delete 금지, v·createdAt 불변)과 members(uid·CHILD) 가 정의돼 있다", () => {
    assert.ok(/match \/accounts\/\{uid\} \{/.test(RULES) && /allow get: if request\.auth != null && request\.auth\.uid == uid;/.test(RULES) && /allow list: if false;/.test(RULES.slice(RULES.indexOf("match /accounts/"))));
    const acc = RULES.slice(RULES.indexOf("match /accounts/"), RULES.indexOf("// 그 외 모든 경로"));
    assert.ok(/allow create: if request\.auth != null && request\.auth\.uid == uid && accountOk\(request\.resource\.data\);/.test(acc) && /request\.resource\.data\.createdAt == resource\.data\.createdAt/.test(acc) && /allow delete: if false;/.test(acc));
    assert.deepStrictEqual([...acc.match(/hasOnly\(\[([^\]]+)\]/)[1].matchAll(/'([^']+)'/g)].map((m) => m[1]), ["v", "displayName", "role", "institution", "situation", "province", "district", "householdId", "householdCode", "memberId", "createdAt", "updatedAt"]);
    const mem = RULES.slice(RULES.indexOf("match /members/{memberId}"), RULES.indexOf("// [B2]"));
    assert.ok(mem.includes("'uid'") && mem.includes("'CHILD'") && /function uidOk\(\)/.test(mem) && /&& uidOk\(\);/.test(mem));
    assert.ok(/\(resource != null && \('uid' in resource\.data\)\)\s*\n\s*\? \(\('uid' in request\.resource\.data\) && request\.resource\.data\.uid == resource\.data\.uid\)/.test(mem), "uid 가 달린 문서는 결과에도 같은 uid 필수");
  });
  await test("규칙 동작(JS 재현): 계정 문서는 본인만·키 제한·불변, 구성원 uid 는 본인만 새로 달고 가로채기·위조 불가, 비인증 기존 쓰기는 그대로", async () => {
    const w = world();
    const r = await w.sync.completeSignup({ user: { uid: "u1" }, intent: intentNew });
    const acc = w.db.docs.get("accounts/u1");
    assert.ok(accWrite("u1", { uid: "u1" }, acc, null), "AccountSync 가 만든 실제 문서가 규칙을 통과");
    assert.ok(!accWrite("u1", { uid: "u2" }, acc, null) && !accWrite("u1", null, acc, null), "남·비인증 불가");
    assert.ok(!accWrite("u1", { uid: "u1" }, { ...acc, extra: 1 }, null) && !accWrite("u1", { uid: "u1" }, { ...acc, role: "BOSS" }, null) && !accWrite("u1", { uid: "u1" }, { ...acc, displayName: "" }, null));
    assert.ok(!accWrite("u1", { uid: "u1" }, { ...acc, createdAt: 1 }, acc) && accWrite("u1", { uid: "u1" }, { ...acc, updatedAt: 99 }, acc));
    const mem = w.db.docs.get(`households/${r.householdId}/members/${r.memberId}`);
    assert.ok(memberOk(mem, null, { uid: "u1" }), "실제 구성원 문서(uid 포함)가 통과");
    const seed = { v: 1, role: "DAD", label: "아빠", order: 2, createdAt: 1, updatedAt: 1 };
    assert.ok(memberOk(seed, null, null), "uid 없는 기존 쓰기는 인증 없이도 그대로");
    // 2단계 가로채기: ① uid 가 달린 문서를 uid 없이 전체 교체 ② 이어서 다른 계정이 uid 를 단다
    const claimed = { ...seed, uid: "u2" };
    assert.ok(!memberOk(seed, claimed, null), "① 비인증이 uid 를 지우는 전체 교체 → 거부");
    assert.ok(!memberOk(seed, claimed, { uid: "u3" }), "① 다른 계정이 uid 를 지우는 전체 교체 → 거부");
    assert.ok(!memberOk(seed, claimed, { uid: "u2" }), "① 본인도 uid 를 지울 수 없다(제거 금지)");
    assert.ok(memberOk({ ...seed, label: "수정", uid: "u2" }, claimed, null), "uid 를 그대로 둔 수정은 허용");
    assert.ok(memberOk({ ...seed, uid: "u2" }, seed, { uid: "u2" }), "본인 확보");
    assert.ok(!memberOk({ ...seed, uid: "u2" }, seed, { uid: "u3" }) && !memberOk({ ...seed, uid: "u2" }, seed, null), "남의 uid 를 달 수 없다");
    const taken = { ...seed, uid: "u2" };
    assert.ok(!memberOk({ ...taken, uid: "u3" }, taken, { uid: "u3" }), "이미 확보된 구성원 가로채기 불가");
    assert.ok(memberOk({ ...taken, label: "새 이름" }, taken, null), "라벨 수정은 비인증도 가능(uid 불변)");
    assert.ok(!memberOk({ ...taken, uid: "u9" }, taken, null));
    assert.ok(memberOk({ ...seed, role: "CHILD" }, null, null) && !memberOk({ ...seed, role: "BOSS" }, null, null));
  });

  console.log("app.js 가입·복원 흐름(소스 추출 + 가짜 Auth/Firestore)");
  function appEnv({ rules = true, local = {}, flag = true, profile = null, hhCode = null, shared = null, familyCode = null } = {}) {
    const w = shared || world({ rules });
    const authAd = (() => {
      const calls = []; let cb = null; let cur = null;
      return { calls, emit: (u) => { cur = u; cb && cb(u); }, createUser: async (e) => { calls.push("createUser"); cur = { uid: "uNew", email: e, displayName: "" }; return cur; },
        signIn: async (e) => { calls.push("signIn"); cur = { uid: "uOld", email: e, displayName: "지은" }; return cur; }, signOut: async () => { calls.push("signOut"); }, sendReset: async () => {},
        deleteUser: async () => { calls.push("deleteUser"); }, updateDisplayName: async (u, n) => ({ ...u, displayName: n }), onChange: (f) => { cb = f; return () => {}; } };
    })();
    const store = { ...local };
    const sheet = { innerHTML: "", querySelector: () => null, classList: { remove() {}, add() {} } };
    const log = { setJoined: [], stage: null, name: null, date: null, loaded: [], landing: 0, closed: 0 };
    const hhObj = { hid: null, code: hhCode };
    const cl = () => ({ add() {}, remove() {} });
    const els = { "modal-content": sheet, "detail-modal": sheet, childName: { value: "" }, familyCodeInput: { value: "" }, "view-landing": { querySelector: () => null, classList: cl() }, "view-calendar": { classList: cl() }, "new-child-bar": { classList: cl() }, "empty-panel": { innerHTML: "", classList: cl(), addEventListener() {} } };
    ["home", "calendar", "record", "subsidy", "checklist"].forEach((t) => { els["tab-" + t] = { classList: cl() }; });
    const sb = {
      console, Date, JSON, Promise, firebase: { firestore: () => ({}) }, AccountView: AV, AccountSync: ASYNC, HouseholdView: HV,
      window: { FEATURES: { accounts: flag }, scrollTo() {} },
      AuthService: { create: () => AS.create({ features: () => ({ accounts: flag }), adapter: authAd }), MSG: AS.MSG },
      HouseholdSync: Object.assign(Object.create(w.hs), { firestoreAdapter: () => w.db, lookupHousehold: w.hs.lookupHousehold, joinHousehold: w.hs.joinHousehold, getMirror: w.hs.getMirror, getStatus: w.hs.getStatus }),
      el: (id) => els[id] || null, closeDetail: () => { log.closed++; }, hh: hhObj,
      hhSetJoined: (hid, code) => { log.setJoined.push([hid, code]); hhObj.hid = hid; hhObj.code = code; },
      showLandingView: () => { log.landing++; }, setLandingStage: (s) => { log.stage = s; }, setBirthDatePicker: (d) => { log.date = d && `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; },
      handleLoadCode: async () => { log.loaded.push(els.familyCodeInput.value); },
      localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = v; }, removeItem: (k) => { delete store[k]; } },
      document: { createElement: () => ({ addEventListener() {} }), querySelectorAll: () => [] }, scrollTo() {},
    };
    vm.createContext(sb);
    const a = APP.indexOf("// ── D1 계정"), b = APP.indexOf("async function init()");
    vm.runInContext(`let modalMode = null; let profile = ${JSON.stringify(profile)}; let familyCode = ${JSON.stringify(familyCode)}; let regionsData = null; let currentTab = "home"; let newChildMode = false; const TAB_NAMES = ["home", "calendar", "record", "subsidy", "checklist"]; const isPregnant = () => false; const childDisplayName = () => "수아"; const loadChildren = () => { try { return JSON.parse(localStorage.getItem("hannun_children") || "[]"); } catch (e) { return []; } }; const us = { selection: [], selTouched: false }; function hhRender() {} function hhLeaveLocal() { hh.hid = null; hh.code = null; }\n` + APP.slice(a, b) + "\n;globalThis.__t = { acct, acctOnClick, acctInit, acctRestore };", sb);
    const click = (attrs) => sb.__t.acctOnClick({ target: { closest: (sel) => (sel === "[data-acct-radio]" ? null : { getAttribute: () => attrs.action }) } });
    return { sb, w, authAd, store, sheet, log, hhObj, acct: sb.__t.acct, click, init: () => sb.__t.acctInit(), restore: (u) => sb.__t.acctRestore(u) };
  }
  const signupForm = (extra) => ({ email: "m@x.co", password: "12345678", displayName: "지은", role: "MOM", situation: "HAS_CHILD", province: "서울특별시", district: "구로구", ...extra });
  await test("신규 가족 가입(D5): Auth → accounts(situation·지역)·가구·엄마 구성원 → 가구 연결 → 아이 입력 화면 없이 곧바로 홈(아이가 없는 홈), 가입 의도 정리", async () => {
    const e = appEnv();
    e.init();
    e.acct.mode = "signup";
    e.acct.form = signupForm();
    await e.click({ action: "submit-signup" });
    assert.ok(e.acct.user && e.acct.user.uid === "uNew" && !e.acct.busy);
    assert.strictEqual(e.log.setJoined.length, 1);
    const acc = e.w.db.docs.get("accounts/uNew");
    assert.deepStrictEqual([acc.householdId, acc.situation, acc.province, acc.district], [e.log.setJoined[0][0], "HAS_CHILD", "서울특별시", "구로구"]);
    assert.deepStrictEqual([e.log.stage, e.log.landing, e.sb.el("childName").value, e.log.date], [null, 0, "", null], "아이 입력 화면·미리 채움 없음");
    const html = e.sb.el("empty-panel").innerHTML;
    assert.ok(html.includes("아이를 등록하면 월령에 맞는 일정과 혜택이 나와요") && html.includes('data-acct-action="empty-register"'));
    assert.ok(!("hannun_account_intent" in e.store) && e.log.closed === 1 && !e.authAd.calls.includes("deleteUser"));
    assert.strictEqual(e.acct.notice, "가입했어요. 로그인 상태예요.");
  });
  await test("예비 부모 가입: situation=EXPECTING 이 저장되고 빈 홈 문구는 '출산 예정일을 등록하면…'", async () => {
    const e = appEnv();
    e.init();
    e.acct.mode = "signup";
    e.acct.form = signupForm({ situation: "EXPECTING", role: "DAD", province: "", district: "" });
    await e.click({ action: "submit-signup" });
    const acc = e.w.db.docs.get("accounts/uNew");
    assert.deepStrictEqual([acc.situation, acc.role, "province" in acc], ["EXPECTING", "DAD", false]);
    const html = e.sb.el("empty-panel").innerHTML;
    assert.ok(html.includes("출산 예정일을 등록하면 임신 중 일정과 혜택이 나와요") && html.includes("출산 예정일 등록하기") && e.log.landing === 0);
  });
  await test("잘못된 코드: 계정을 만들기 전에 막고(Auth 호출 0) 코드 입력란에 안내", async () => {
    const e = appEnv();
    e.init();
    e.acct.mode = "signup";
    e.acct.form = signupForm({ role: "DAD", familyCode: "ZZZZ2222" });
    await e.click({ action: "submit-signup" });
    assert.deepStrictEqual(e.authAd.calls, []);
    assert.strictEqual(e.acct.errors.familyCode, "가족 캘린더 코드를 찾을 수 없어요. 코드를 다시 확인해 주세요.");
    assert.ok(e.sheet.innerHTML.includes("가족 캘린더 코드를 찾을 수 없어요.") && e.acct.user === null && !e.acct.busy);
    assert.strictEqual(e.w.db.docs.size, 0);
  });
  await test("코드 합류 가입: 가구 합류·구성원 확보 후 가구의 첫 아이를 불러온다(기기에 아이가 없을 때)", async () => {
    const first = world();
    const e = appEnv();
    // 같은 세계에 기존 가구와 아이 링크를 만든다
    const c = await e.w.hs.createHousehold({ firstChild: { familyCode: "ABC234", displayName: "수아" } });
    e.init();
    e.acct.mode = "signup";
    e.acct.form = signupForm({ role: "DAD", displayName: "민수", familyCode: c.code, situation: undefined, province: undefined, district: undefined });
    await e.click({ action: "submit-signup" });
    assert.strictEqual(e.acct.user.uid, "uNew");
    assert.deepStrictEqual(e.log.loaded, ["ABC234"]);
    assert.strictEqual(e.w.db.docs.get("accounts/uNew").householdId, c.householdId);
    assert.ok([...e.w.db.docs.entries()].some(([k, v]) => k.includes("/members/") && v.uid === "uNew" && v.role === "DAD"));
    assert.strictEqual(e.log.stage, null, "새 아이 입력 화면은 열지 않는다");
  });
  await test("규칙 미배포: 가입을 되돌린다(Auth 사용자 삭제·가입 의도 삭제·가구 미생성) + 안내 문구", async () => {
    const e = appEnv({ rules: false });
    e.init();
    e.acct.mode = "signup";
    e.acct.form = signupForm();
    await e.click({ action: "submit-signup" });
    assert.ok(e.authAd.calls.includes("createUser") && e.authAd.calls.includes("deleteUser"));
    assert.ok(e.acct.user === null && !("hannun_account_intent" in e.store) && e.log.setJoined.length === 0 && !e.acct.busy);
    assert.ok(e.sheet.innerHTML.includes("계정 서버 설정이 아직 준비되지 않았어요."));
    assert.ok(![...e.w.db.docs.keys()].some((k) => k.startsWith("households/")));
  });
  await test("다른 기기 로그인: 계정 가구를 이 기기에 복원(가구 연결 + 아이 불러오기), 이 기기에 이미 가구가 있으면 건드리지 않는다", async () => {
    const e = appEnv();
    const c = await e.w.hs.createHousehold({ firstChild: { familyCode: "ABC234", displayName: "수아" } });
    await e.w.sync.completeSignup({ user: { uid: "uOld" }, intent: { email: "m@x.co", displayName: "지은", role: "MOM", joiningCode: null, situation: "HAS_CHILD" } });
    // 위 호출은 새 가구를 또 만들므로, 계정 문서를 c 가구로 맞춘다
    e.w.db.docs.set("accounts/uOld", { v: 1, displayName: "지은", role: "MOM", householdId: c.householdId, householdCode: c.code, memberId: "m", createdAt: 1, updatedAt: 1 });
    e.init();
    await e.restore({ uid: "uOld", email: "m@x.co" });
    assert.deepStrictEqual(e.log.setJoined, [[c.householdId, c.code]]);
    assert.deepStrictEqual(e.log.loaded, ["ABC234"]);
    const e2 = appEnv({ hhCode: "OTHER234", shared: e.w });
    e2.init();
    await e2.restore({ uid: "uOld" });
    assert.deepStrictEqual([e2.log.setJoined.length, e2.log.loaded.length], [0, 0]);
  });
  await test("끝나지 않은 가입 이어서 마무리: 가입 의도가 있고 계정에 가구가 없으면 로그인 때 다시 연결(롤백 없음)", async () => {
    const e = appEnv({ local: { hannun_account_intent: JSON.stringify({ email: "m@x.co", displayName: "지은", role: "MOM", joiningCode: null, situation: "HAS_CHILD" }) } });
    e.init();
    e.acct.user = { uid: "uNew", email: "m@x.co", displayName: "지은" };
    await e.restore(e.acct.user);
    assert.strictEqual(e.log.setJoined.length, 1);
    assert.ok(e.w.db.docs.get("accounts/uNew").householdId);
    assert.ok(!("hannun_account_intent" in e.store) && e.sb.el("empty-panel").innerHTML.includes("아이 등록하기") && e.log.stage === null);
    // 규칙 미배포인 일시 상태에서는 로그인 사용자를 지우지 않는다
    const off = appEnv({ rules: false, local: { hannun_account_intent: JSON.stringify({ email: "m@x.co", displayName: "지은", role: "MOM", joiningCode: null, situation: "HAS_CHILD" }) } });
    off.init();
    off.acct.user = { uid: "uNew" };
    await off.restore(off.acct.user);
    assert.ok(!off.authAd.calls.includes("deleteUser"));
  });
  await test("일시 오류 후 로그아웃→재로그인: 연결 전에는 가입 의도를 유지하고, 같은 계정이 다시 로그인하면 이어서 가구를 연결한다", async () => {
    const intent = JSON.stringify({ email: "m@x.co", displayName: "지은", role: "MOM", joiningCode: null, situation: "HAS_CHILD" });
    const e = appEnv({ local: { hannun_account_intent: intent } });
    e.init();
    e.acct.user = { uid: "uNew", email: "m@x.co", displayName: "지은" };
    // 계정 문서는 있으나 가구 연결 전(일시 오류로 중단된 상태)
    e.w.db.docs.set("accounts/uNew", { v: 1, displayName: "지은", role: "MOM", createdAt: 1, updatedAt: 1 });
    e.acct.mode = "logout";
    await e.click({ action: "confirm-logout" });
    assert.ok(e.authAd.calls.includes("signOut") && e.store.hannun_account_intent === intent, "연결 전 로그아웃은 의도를 지우지 않는다");
    e.acct.user = { uid: "uNew", email: "m@x.co", displayName: "지은" };
    await e.restore(e.acct.user); // 같은 계정 재로그인
    assert.strictEqual(e.log.setJoined.length, 1);
    assert.ok(e.w.db.docs.get("accounts/uNew").householdCode && !("hannun_account_intent" in e.store));
    // 연결이 끝난 뒤의 로그아웃은 의도를 지운다
    e.store.hannun_account_intent = "{}";
    e.acct.user = { uid: "uNew", email: "m@x.co" };
    await e.click({ action: "confirm-logout" });
    assert.ok(!("hannun_account_intent" in e.store));
  });
  await test("복구 경로: 가구 연결도 가입 의도도 없으면 새 가족을 바로 만들지 않고 선택 화면(새 가족 만들기 / 가족 코드로 합류)을 한 번 거친다", async () => {
    const e = appEnv();
    e.init();
    e.w.db.docs.set("accounts/uLost", { v: 1, displayName: "지은", role: "MOM", institution: "DAYCARE", createdAt: 1, updatedAt: 1 });
    e.acct.user = { uid: "uLost", email: "m@x.co" };
    await e.restore(e.acct.user);
    assert.ok(!e.w.db.docs.get("accounts/uLost").householdId && e.log.setJoined.length === 0, "선택 전에는 아무것도 만들지 않는다");
    assert.ok(e.sheet.innerHTML.includes("가족 캘린더를 연결해 주세요") && e.sheet.innerHTML.includes("새 가족 만들기") && e.sheet.innerHTML.includes("가족 코드로 합류하기"));
    assert.deepStrictEqual([e.acct.form.role, e.acct.form.displayName], ["MOM", "지은"], "계정 문서 값으로 미리 채움");
    // 한 번만 보인다
    e.sheet.innerHTML = "";
    await e.restore(e.acct.user);
    assert.strictEqual(e.sheet.innerHTML, "");
    // 합류 선택: 잘못된 코드는 막고, 맞는 코드면 가구에 합류
    await e.click({ action: "recover-join-open" });
    assert.ok(e.sheet.innerHTML.includes('data-acct-input="familyCode"'));
    e.acct.form.familyCode = "ZZZZ2222";
    await e.click({ action: "recover-join" });
    assert.ok(e.sheet.innerHTML.includes("가족 캘린더 코드를 찾을 수 없어요.") && !e.w.db.docs.get("accounts/uLost").householdId);
    const c = await e.w.hs.createHousehold({ firstChild: { familyCode: "ABC234", displayName: "수아" } });
    e.acct.form.familyCode = c.code;
    await e.click({ action: "recover-join" });
    const joined = e.w.db.docs.get("accounts/uLost");
    assert.deepStrictEqual([joined.householdId, joined.householdCode], [c.householdId, c.code]);
    assert.ok(e.log.setJoined.length === 1 && e.log.closed >= 1 && e.log.loaded.length === 1, "합류 후 가구의 첫 아이를 불러온다");
    // 새 가족 만들기 선택
    const e2 = appEnv();
    e2.init();
    e2.acct.user = { uid: "uNone", email: "n@x.co", displayName: "민수" };
    await e2.restore(e2.acct.user); // 계정 문서도 의도도 없음 → 역할 다시 입력
    assert.ok(e2.sheet.innerHTML.includes("가족 캘린더를 연결해 주세요") && e2.acct.form.displayName === "민수" && e2.acct.form.role === "");
    await e2.click({ action: "recover-new" });
    assert.ok(e2.acct.errors.role && !e2.w.db.docs.has("accounts/uNone"), "역할을 고르기 전에는 만들지 않는다");
    e2.acct.form.role = "DAD";
    await e2.click({ action: "recover-new" });
    const acc = e2.w.db.docs.get("accounts/uNone");
    assert.ok(acc.householdId && acc.memberId && acc.role === "DAD" && e2.log.setJoined.length === 1);
    assert.strictEqual(e2.w.db.docs.get(`households/${acc.householdId}/members/${acc.memberId}`).uid, "uNone");
    // 이 기기에 이미 가구가 있으면 묻지 않는다
    const e3 = appEnv({ hhCode: "OTHER234" });
    e3.init();
    e3.acct.user = { uid: "uX", email: "x@x.co" };
    await e3.restore(e3.acct.user);
    assert.strictEqual(e3.sheet.innerHTML, "");
  });
  await test("로그인 직후 복원: 로그인 시트에서 로그인하면 끝난 뒤 계정 가구를 복원한다(로그인 중 onChange 복원은 건너뜀)", async () => {
    const e = appEnv();
    const c = await e.w.hs.createHousehold({ firstChild: { familyCode: "ABC234", displayName: "수아" } });
    e.w.db.docs.set("accounts/uOld", { v: 1, displayName: "지은", role: "MOM", householdId: c.householdId, householdCode: c.code, memberId: "m", createdAt: 1, updatedAt: 1 });
    e.init();
    e.acct.mode = "login";
    e.acct.form = { email: "m@x.co", password: "pw" };
    await e.click({ action: "submit-login" });
    await new Promise((r) => setTimeout(r, 20));
    assert.deepStrictEqual(e.log.setJoined, [[c.householdId, c.code]]);
    assert.strictEqual(e.acct.account.householdCode, c.code);
  });
  await test("플래그 OFF: acctInit·가입·복원이 아무 일도 하지 않는다(Firestore·Auth 호출 0)", async () => {
    const e = appEnv({ flag: false });
    e.init();
    e.acct.mode = "signup";
    e.acct.form = signupForm();
    await e.click({ action: "submit-signup" });
    assert.deepStrictEqual(e.authAd.calls, []);
    assert.strictEqual(e.w.db.calls.length, 0);
    assert.strictEqual(e.acct.sync, null);
  });
  await test("서버 쓰기 범위: 앱의 계정 블록은 accounts(AccountSync)·가구 생성/합류만 — 아이 문서(families)·일정·완료에는 쓰지 않는다", () => {
    const a = APP.indexOf("// ── D1 계정"), b = APP.indexOf("async function init()");
    const blk = APP.slice(a, b);
    assert.ok(!/FamilySync|families\/|completed|saveProfile|patchSchedule|createSchedule/.test(blk));
    assert.strictEqual((blk.match(/HouseholdSync\.addChild\(/g) || []).length, 1, "D4: 아이 링크 쓰기는 acctLinkKids 한 곳뿐");
    assert.ok(blk.includes("acct.sync.completeSignup(") && blk.includes("HouseholdSync.lookupHousehold(") && blk.includes("await acct.svc.deleteCurrentUser();"));
    const sync = read("js/account-sync.js").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
    assert.ok(!/families|completed|schedules|localStorage/.test(sync));
  });
  await test("수동 검증 페이지: 자동 실행 없음(확인란 체크 후에만), 일회용 zz- 값만, 문법 확인, 삭제 안내", () => {
    const html = read("test/firestore-account-manual-test.html");
    assert.ok(html.includes('<button id="run" disabled>') && html.includes('$("ack").addEventListener("change"') && !/run\(\);\s*\n\s*\}\)\(\);/.test(html));
    assert.ok(html.includes("zz-acct-") && html.includes("zz-hannun-test-") && html.includes("콘솔에서 직접 삭제") && html.includes("firebase-auth-compat.js"));
    assert.ok(!/householdCodes|families|"completed"/.test(html.replace(/<[^>]*>/g, " ").split("<script>")[0] + html.split("<script>")[1]), "실제 가구·가족 컬렉션에 쓰지 않는다");
    const js = html.match(/<script>\n\(function[\s\S]*?<\/script>/)[0].slice(8, -9);
    new vm.Script(js); // 문법 오류 없음
  });
  await Promise.all(pending);
  console.log(`\n${passed}개 통과${process.exitCode ? ", 일부 실패" : ""}`);
})();
