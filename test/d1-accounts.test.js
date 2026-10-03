/*
 * D1 계정: auth-service(가짜 어댑터)·account-view(검증·마크업)·app.js 연결·플래그 OFF 불변. 실제 Firebase/Auth 는 쓰지 않는다.
 * 실행: node test/d1-accounts.test.js
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const AS = require("../js/auth-service.js");
const AV = require("../js/account-view.js");
const read = (f) => fs.readFileSync(path.join(__dirname, "..", f), "utf8");
const APP = read("js/app.js");

let passed = 0;
const pending = [];
function test(name, fn) {
  const p = Promise.resolve().then(fn).then(() => { passed++; console.log("  ok  - " + name); }, (e) => { process.exitCode = 1; console.log("  FAIL- " + name + "\n      " + (e.stack || e).split("\n").slice(0, 4).join("\n      ")); });
  pending.push(p);
  return p;
}

function fakeAdapter(over) {
  const calls = [];
  let cb = null;
  const rec = (n, f) => async (...a) => { calls.push(n); return f ? f(...a) : undefined; };
  const ad = { calls, emit: (u) => cb && cb(u),
    createUser: rec("createUser", async (e) => ({ uid: "u1", email: e, displayName: "" })),
    signIn: rec("signIn", async (e) => ({ uid: "u1", email: e, displayName: "지은" })),
    signOut: rec("signOut"), sendReset: rec("sendReset"),
    updateDisplayName: rec("updateDisplayName", async (u, n) => ({ ...u, displayName: n })),
    onChange: (f) => { calls.push("onChange"); cb = f; return () => calls.push("off"); }, ...over };
  return ad;
}
const svc = (flag, ad, loadSdk) => AS.create({ features: () => ({ accounts: flag }), adapter: ad, loadSdk });

(async () => {
  console.log("auth-service");
  await test("OFF: 모든 메서드가 disabled 이고 어댑터·SDK 로더를 한 번도 부르지 않는다", async () => {
    const ad = fakeAdapter();
    let loads = 0;
    const s = AS.create({ features: () => ({ accounts: false }), adapter: ad, loadSdk: async () => { loads++; } });
    const rs = [await s.signUp({ email: "a@b.co", password: "12345678" }), await s.signIn({ email: "a@b.co", password: "x" }), await s.signOut(), await s.sendPasswordReset("a@b.co")];
    rs.forEach((r) => assert.deepStrictEqual({ ok: r.ok, reason: r.reason }, { ok: false, reason: "disabled" }));
    const off = s.onChange(() => { throw new Error("호출 금지"); });
    off();
    assert.deepStrictEqual(ad.calls, []);
    assert.strictEqual(loads, 0);
    assert.strictEqual(s.isEnabled(), false);
  });
  await test("ON: SDK 는 처음 필요할 때 한 번만 불러온다(어댑터 미주입 경로: loadSdk → firebase.auth)", async () => {
    let loads = 0;
    const fb = { auth: () => ({ createUserWithEmailAndPassword: async (e) => ({ user: { uid: "u9", email: e, displayName: null } }), currentUser: null }) };
    const s = AS.create({ features: () => ({ accounts: true }), loadSdk: async () => { loads++; }, firebase: fb });
    const r1 = await s.signUp({ email: "a@b.co", password: "12345678" });
    const r2 = await s.signUp({ email: "c@d.co", password: "12345678" });
    assert.ok(r1.ok && r2.ok && r1.user.uid === "u9");
    assert.strictEqual(loads, 1);
  });
  await test("가입: 이메일·비밀번호 로컬 검증 후 createUser → 표시 이름 반영, 잘못된 입력은 서버 호출 없음", async () => {
    const ad = fakeAdapter();
    const s = svc(true, ad);
    const bad = await s.signUp({ email: "nope", password: "12345678" });
    assert.deepStrictEqual([bad.ok, bad.code, bad.message], [false, "auth/invalid-email", "이메일 형식을 확인해 주세요."]);
    const weak = await s.signUp({ email: "a@b.co", password: "1234567" });
    assert.deepStrictEqual([weak.ok, weak.code, weak.message], [false, "auth/weak-password", "비밀번호가 너무 약해요. 8자 이상으로 만들어 주세요."]);
    assert.deepStrictEqual(ad.calls, []);
    const ok = await s.signUp({ email: " a@b.co ", password: "12345678", displayName: " 지은 " });
    assert.deepStrictEqual(ok, { ok: true, user: { uid: "u1", email: "a@b.co", displayName: "지은" } });
    assert.deepStrictEqual(ad.calls, ["createUser", "updateDisplayName"]);
    assert.strictEqual(s.currentUser().uid, "u1");
  });
  await test("오류 문구(한국어): 이메일 중복·약한 비밀번호·잘못된 비밀번호·네트워크·시도 과다·모르는 코드", async () => {
    const m = (code) => AS.errorMessage({ code });
    assert.strictEqual(m("auth/email-already-in-use"), "이미 가입된 이메일이에요. 로그인해 주세요.");
    assert.strictEqual(m("auth/weak-password"), "비밀번호가 너무 약해요. 8자 이상으로 만들어 주세요.");
    for (const c of ["auth/wrong-password", "auth/invalid-credential", "auth/user-not-found"]) assert.strictEqual(m(c), "이메일 또는 비밀번호가 맞지 않아요.");
    assert.strictEqual(m("auth/network-request-failed"), "인터넷 연결을 확인하고 다시 시도해 주세요.");
    assert.strictEqual(m("auth/too-many-requests"), "시도가 너무 많아요. 잠시 후 다시 시도해 주세요.");
    assert.strictEqual(m("auth/weird"), AS.MSG.generic);
    assert.strictEqual(AS.errorMessage(undefined), AS.MSG.generic);
    const s = svc(true, fakeAdapter({ createUser: async () => { throw Object.assign(new Error("x"), { code: "auth/email-already-in-use" }); } }));
    const r = await s.signUp({ email: "a@b.co", password: "12345678" });
    assert.deepStrictEqual([r.ok, r.message], [false, "이미 가입된 이메일이에요. 로그인해 주세요."]);
    const n = await svc(true, fakeAdapter({ signIn: async () => { throw Object.assign(new Error("x"), { code: "auth/network-request-failed" }); } })).signIn({ email: "a@b.co", password: "x" });
    assert.strictEqual(n.message, "인터넷 연결을 확인하고 다시 시도해 주세요.");
  });
  await test("로그인·로그아웃·재설정 메일·상태 구독", async () => {
    const ad = fakeAdapter();
    const s = svc(true, ad);
    const seen = [];
    const off = s.onChange((u) => seen.push(u && u.uid));
    await new Promise((r) => setTimeout(r, 0));
    ad.emit({ uid: "u1", email: "a@b.co", displayName: "" });
    ad.emit(null);
    assert.deepStrictEqual(seen, ["u1", null]);
    const li = await s.signIn({ email: "a@b.co", password: "pw" });
    assert.ok(li.ok && s.currentUser().displayName === "지은");
    assert.strictEqual((await s.signIn({ email: "a@b.co", password: "" })).message, "이메일 또는 비밀번호가 맞지 않아요.");
    assert.ok((await s.sendPasswordReset("a@b.co")).ok);
    assert.strictEqual((await s.sendPasswordReset("bad")).message, "이메일 형식을 확인해 주세요.");
    assert.ok((await s.signOut()).ok && s.currentUser() === null);
    off();
    assert.ok(ad.calls.includes("off"));
  });

  console.log("account-view");
  const T = new Date(2026, 9, 2);
  const base = { email: "mom@x.com", password: "12345678", displayName: "지은", role: "MOM", situation: "HAS_CHILD" };
  const REGIONS = [{ code: "서울특별시", name: "서울특별시", districts: ["종로구", "구로구"] }, { code: "부산광역시", name: "부산광역시", districts: ["중구"] }];
  await test("가입 검증(D5): 출생한 자녀 있음 정상 · 필수 누락마다 필드별 한국어 오류, 기관·아이 정보는 받지 않는다", () => {
    const r = AV.validateSignup(base, T);
    assert.ok(r.ok);
    assert.deepStrictEqual(JSON.parse(JSON.stringify(r.intent)), { email: "mom@x.com", displayName: "지은", role: "MOM", joiningCode: null, situation: "HAS_CHILD" });
    assert.ok(!("password" in r.intent), "비밀번호는 의도에 넣지 않는다");
    const empty = AV.validateSignup({}, T);
    assert.deepStrictEqual(Object.keys(empty.errors).sort(), ["displayName", "email", "password", "role", "situation"]);
    assert.strictEqual(empty.errors.password, "비밀번호는 8자 이상으로 만들어 주세요.");
    for (const [patch, key] of [[{ email: "x" }, "email"], [{ password: "short" }, "password"], [{ displayName: "가".repeat(21) }, "displayName"], [{ role: "BOSS" }, "role"], [{ role: "CAREGIVER" }, "role"], [{ situation: "PREGNANT" }, "situation"]])
      assert.ok(AV.validateSignup({ ...base, ...patch }, T).errors[key], key);
  });
  await test("출생한 자녀 없음(예비 부모): 역할은 예비엄마·예비아빠(MOM/DAD)만, situation=EXPECTING 으로 구분", () => {
    const p = { ...base, situation: "EXPECTING" };
    const r = AV.validateSignup(p, T);
    assert.ok(r.ok && r.intent.role === "MOM" && r.intent.situation === "EXPECTING");
    assert.ok(AV.validateSignup({ ...p, role: "DAD" }, T).ok);
    assert.ok(AV.validateSignup({ ...p, role: "CHILD" }, T).errors.role, "자녀는 예비 부모 선택지가 아니다");
    assert.deepStrictEqual(AV.roleOptions(p), [["MOM", "예비엄마"], ["DAD", "예비아빠"]]);
    assert.deepStrictEqual(AV.roleOptions(base), [["MOM", "엄마"], ["DAD", "아빠"], ["CHILD", "자녀"]]);
    assert.deepStrictEqual(AV.roleOptions({}), []);
    assert.strictEqual(AV.validateSignup({ ...base, role: "CHILD" }, T).intent.role, "CHILD");
  });
  await test("지역(선택): 비워도 가입 가능, 시·도+시·군·구가 함께 있으면 intent 에 포함, 하나만 고르거나 목록에 없으면 오류", () => {
    assert.ok(AV.validateSignup(base, T, REGIONS).ok && !("province" in AV.validateSignup(base, T, REGIONS).intent));
    const ok = AV.validateSignup({ ...base, province: "서울특별시", district: "구로구" }, T, REGIONS);
    assert.ok(ok.ok);
    assert.deepStrictEqual([ok.intent.province, ok.intent.district], ["서울특별시", "구로구"]);
    for (const patch of [{ province: "서울특별시" }, { district: "구로구" }, { province: "서울특별시", district: "중구" }, { province: "없는시", district: "x" }])
      assert.strictEqual(AV.validateSignup({ ...base, ...patch }, T, REGIONS).errors.region, "시·도와 시·군·구를 함께 골라 주세요.", JSON.stringify(patch));
  });
  await test("syncForm: 자녀 유무가 바뀌면 맞지 않는 역할을 지우고, 코드를 입력(합류)하면 자녀 유무·지역을 지우며 역할 전체 선택지, 시·도가 바뀌면 시·군·구 정리", () => {
    assert.strictEqual(AV.syncForm({ situation: "EXPECTING", role: "CHILD" }).role, "");
    assert.strictEqual(AV.syncForm({ situation: "EXPECTING", role: "DAD" }).role, "DAD");
    const j = AV.syncForm({ situation: "HAS_CHILD", role: "CAREGIVER", familyCode: "abcd2345", province: "서울특별시", district: "구로구" });
    assert.deepStrictEqual([j.situation, j.province, j.district, j.role], ["", "", "", "CAREGIVER"]);
    assert.deepStrictEqual(AV.roleOptions({ familyCode: "ABCD2345" }).map((r) => r[0]), ["MOM", "DAD", "CHILD", "CAREGIVER"]);
    assert.strictEqual(AV.syncForm({ situation: "HAS_CHILD", province: "부산광역시", district: "구로구" }, REGIONS).district, "");
  });
  await test("합류(코드 입력): 8자리 코드(소문자·공백 정규화)만 검증하고 상황·기관·아이는 요구하지 않는다, 잘못된 코드는 오류", () => {
    const join = { email: "dad@x.com", password: "12345678", displayName: "민수", role: "DAD", familyCode: " abcd 2345 " };
    const r = AV.validateSignup(join, T);
    assert.ok(r.ok, JSON.stringify(r.errors));
    assert.strictEqual(r.intent.joiningCode, "ABCD2345");
    assert.ok(!("situation" in r.intent) && !("province" in r.intent));
    assert.strictEqual(AV.validateSignup({ ...join, familyCode: "ABC12" }, T).errors.familyCode, "가족코드는 8자리 영문·숫자예요. 비워 두면 새 가족으로 시작해요.");
  });
  await test("로그인 검증", () => {
    assert.ok(AV.validateLogin({ email: "a@b.co", password: "x" }).ok);
    assert.deepStrictEqual(Object.keys(AV.validateLogin({}).errors), ["email", "password"]);
  });
  await test("마크업: 랜딩(로그아웃/로그인 상태)·내 계정 슬롯·가입/로그인/로그아웃 시트, 이스케이프·조건부 필드", () => {
    const l = AV.renderLanding({});
    assert.ok(l.includes("한눈육아") && l.includes('data-acct-action="open-signup"') && l.includes('data-acct-action="open-login"') && l.includes(">회원가입<") && !l.includes("open-join") && !l.includes("가입 없이 둘러보기"));
    const li = AV.renderLanding({ user: { email: "a@b.co", displayName: '<b>x</b>' } });
    assert.ok(li.includes('data-acct-action="logout"') && !li.includes("<b>x</b>") && li.includes("&lt;b&gt;"));
    assert.ok(AV.renderAccountSlot({ user: { email: "a@b.co", displayName: "지은" } }).includes('data-acct-action="logout"') && AV.renderAccountSlot({}).includes("회원가입"));
    const sign = [1, 2, 3].map((st) => AV.renderSignup({ form: { situation: "HAS_CHILD", step: st }, regions: REGIONS })).join(""); // G7: 3단계 스텝 — 모든 단계를 합쳐 필드 존재를 확인
    ["email", "password", "displayName", "familyCode", "province", "district"].forEach((k) => assert.ok(sign.includes(`data-acct-input="${k}"`), k));
    ["role", "situation"].forEach((k) => assert.ok(sign.includes(`data-acct-radio="${k}"`), k));
    ["childName", "birthDate", "dueDate", "institution", "gender"].forEach((k) => assert.ok(!sign.includes(k), "D5: " + k + " 없음"));
    assert.ok(sign.includes("현재 출생한 자녀가 있나요?") && sign.includes(">있어요<") && sign.includes(">없어요<") && sign.includes("가족이 함께 쓰려면 회원가입해 주세요.") && sign.includes("📍 사는 지역(시·도, 시·군·구)을 알려 주시면") && sign.includes("상세 주소는 받지 않아요"));
    assert.ok(!AV.renderSignup({ form: { step: 2 }, regions: REGIONS }).includes('data-acct-radio="role"'), "자녀 유무를 고르기 전에는 역할 선택지 없음");
    assert.ok(AV.renderSignup({ form: { situation: "EXPECTING", step: 2 }, regions: REGIONS }).includes(">예비엄마<"));
    assert.ok(AV.renderSignup({ form: { situation: "HAS_CHILD", province: "서울특별시", step: 3 }, regions: REGIONS }).includes("<option value=\"구로구\""));
    const joined = AV.renderSignup({ form: { familyCode: "ABCD2345" }, regions: REGIONS });
    assert.ok(!joined.includes('data-acct-radio="situation"') && !joined.includes('data-acct-input="province"') && !joined.includes('data-acct-radio="role"') && AV.renderRolePick({ form: {} }).includes(">이모님(기타 돌봄)<")) // H2: 합류 폼은 역할을 묻지 않고 자리/역할 단계에서 정한다;
    const evil = AV.renderSignup({ form: { email: '"><img src=x>', displayName: "<script>" }, errors: { email: "<i>" }, error: "<u>" });
    assert.ok(!/<img|<script|<i>|<u>/.test(evil));
    assert.ok(AV.renderSignup({ busy: true }).includes("disabled") && AV.renderLogin({ form: {} }).includes('data-acct-action="reset-password"'));
    const lo = AV.renderLogoutConfirm({ pending: 3 });
    assert.ok(lo.includes("로그아웃할까요?") && lo.includes("아직 서버에 보내지 못한 변경 3건") && !AV.renderLogoutConfirm({}).includes("보내지 못한"));
  });
  await test("순수 모듈: DOM·저장소·네트워크·Firestore 참조 없음", () => {
    for (const f of ["js/account-view.js", "js/auth-service.js"]) {
      const src = read(f).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
      ["localStorage", "sessionStorage", "firestore", "Firestore", "fetch(", "FamilySync", "HouseholdSync"].forEach((w) => assert.ok(!src.includes(w), f + " " + w));
    }
    assert.ok(!read("js/account-view.js").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "").includes("document."));
  });

  console.log("플래그·연결");
  await test("feature-flags: accounts 는 '1'일 때만 ON 이고 household 도 함께 켠다, OFF 는 둘 다 false", () => {
    const mk = (store) => { const sb = { console, localStorage: { getItem: (k) => (k in store ? store[k] : null) } }; sb.window = sb; vm.createContext(sb); vm.runInContext(read("js/feature-flags.js"), sb); return JSON.parse(JSON.stringify(sb.FEATURES)); };
    assert.deepStrictEqual(mk({}), { household: false, autoLink: false, accounts: false });
    assert.deepStrictEqual(mk({ hannun_feature_accounts: "1" }), { household: true, autoLink: true, accounts: true }); // E(1-2): 가구가 켜지면 autoLink 기본 ON
    assert.deepStrictEqual(mk({ hannun_feature_accounts: "true" }), { household: false, autoLink: false, accounts: false });
  });
  await test("app.js: 모든 진입점이 acctEnabled 가드 뒤, 서버(Firestore) 쓰기 없음, 가입 정보는 의도로만 보관하고 비밀번호는 저장하지 않는다", () => {
    const a = APP.indexOf("// ── D1 계정"), b = APP.indexOf("async function init()");
    const blk = APP.slice(a, b);
    assert.ok(/function acctInit\(\) \{\n    if \(acctJoinLinkStart\(\)\) return;[^\n]*\n    if \(!acctEnabled\(\)\) return;/.test(blk));
    assert.ok(/async function acctOnClick\(ev\) \{\n    if \(!acctEnabled\(\)\) return;/.test(blk));
    assert.ok(/function acctRenderLanding\(\) \{\n    if \(!acctEnabled\(\)\) return;/.test(blk));
    // D2: 서버 읽기(lookupHousehold·joinHousehold)와 AccountSync(계정 문서·가구 생성)만 허용 — 아이·일정·완료에는 쓰지 않는다
    assert.ok(!/FamilySync|HouseholdSync\.(create|update|patch|remove)/.test(blk)); // upsertMember 는 가족 추가(acctSendInvite)의 빈 자리 만들기 한 곳뿐
    assert.ok(blk.includes("localStorage.setItem(ACCT_INTENT_KEY, JSON.stringify(intent));") && !/setItem\([^)]*password/i.test(blk));
    assert.ok(APP.includes("    usInit();\n    acctInit();") && APP.includes("${acctEnabled() ? '<div id=\"acct-slot\"></div>' : \"\"}") && APP.includes("if (acctEnabled()) acctOpenSlot();"));
  });
  await test("로그아웃 최소: Auth 로그아웃 + 가입 의도 삭제만, 가구·아이 로컬 데이터는 건드리지 않는다(D2·D4에서 확장)", () => {
    const blk = APP.slice(APP.indexOf('if (action === "logout" || action === "confirm-logout")'), APP.indexOf('if (action === "submit-signup")'));
    assert.ok(blk.includes("acct.svc.signOut()") && blk.includes("if (linked) acctClearIntent();"));
    assert.ok(!/leaveLocal|HH_ID_KEY|removeItem\([^)]*(PROFILE|COMPLETED|CHILDREN)|clearCode|saveCompleted|saveProfile/.test(blk));
  });
  await test("OFF 불변: index.html 에 정적 계정 마크업·Auth SDK 스크립트가 없다(플래그 ON 일 때 동적 로드), sw.js 에는 새 스크립트만 추가", () => {
    const html = read("index.html");
    assert.ok(!/firebase-auth-compat/.test(html) && !/acct-/.test(html));
    assert.ok(html.includes('<script src="js/auth-service.js?v=4"></script>') && html.includes('<script src="js/account-view.js?v=19"></script>'));
    const sw = read("sw.js");
    assert.ok(sw.includes('"./js/auth-service.js"') && sw.includes('"./js/account-view.js"') && !sw.includes("firebase-auth-compat"));
    assert.ok(AS.SDK_URL === "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth-compat.js");
  });
  console.log("app.js 흐름(소스 추출 + 가짜 어댑터)");
  function appEnv(adapterOver, flag) {
    const a = APP.indexOf("// ── D1 계정"), b = APP.indexOf("async function init()");
    const store = { hannun_profile: "keep", hannun_household_id: "h1", hannun_children: "[1]" };
    const sheet = { innerHTML: "", querySelector: () => null, classList: { remove() {}, add() {} } };
    const els = { "modal-content": sheet, "detail-modal": sheet };
    const log = { closed: 0 };
    const ad = fakeAdapter(adapterOver);
    const sb = {
      console, window: { FEATURES: { accounts: flag !== false } }, AccountView: AV, AuthService: { create: () => AS.create({ features: () => ({ accounts: true }), adapter: ad }), MSG: AS.MSG, normCode: AV.normCode },
      el: (id) => els[id] || null, closeDetail: () => { log.closed++; }, hh: { hid: null }, HouseholdSync: { getStatus: () => ({ pending: 2 }) },
      localStorage: { setItem: (k, v) => { store[k] = v; }, removeItem: (k) => { delete store[k]; }, getItem: (k) => store[k] },
      document: { createElement: () => ({ addEventListener() {}, set innerHTML(v) {} }) },
    };
    vm.createContext(sb);
    vm.runInContext("let modalMode = null; let profile = null; let regionsData = null; const us = { selection: [], selTouched: false }; function hhRender() {} function hideEmptyHome() {} function showLandingView() { globalThis.__landing = (globalThis.__landing || 0) + 1; }\n" + APP.slice(a, b) + "\n;globalThis.__t = { acct, acctOnClick };", sb);
    const click = (attrs) => sb.__t.acctOnClick({ target: { closest: (sel) => (sel === "[data-acct-radio]" ? (attrs.radio ? { getAttribute: (n) => (n === "data-acct-radio" ? attrs.radio[0] : attrs.radio[1]) } : null) : { getAttribute: () => attrs.action } ) } });
    return { sb, ad, store, sheet, log, click, acct: sb.__t.acct };
  }
  const goodForm = { email: "mom@x.com", password: "12345678", displayName: "지은", role: "MOM", situation: "HAS_CHILD" };
  await test("가입 흐름: 검증 통과 → Auth 가입 → 가입 의도 저장(비밀번호 없음)·로그인 상태·시트 닫힘, 기존 로컬 데이터 불변", async () => {
    const e = appEnv();
    e.acct.svc = e.sb.AuthService.create();
    e.acct.form = { ...goodForm };
    await e.click({ action: "submit-signup" });
    assert.strictEqual(e.acct.user.uid, "u1");
    assert.deepStrictEqual(e.ad.calls, ["createUser", "updateDisplayName"]);
    const intent = JSON.parse(e.store.hannun_account_intent);
    assert.deepStrictEqual([intent.role, intent.situation, intent.joiningCode, "password" in intent, "childName" in intent], ["MOM", "HAS_CHILD", null, false, false]);
    assert.ok(!JSON.stringify(e.store).includes("12345678"));
    assert.strictEqual(e.log.closed, 1);
    assert.deepStrictEqual([e.store.hannun_profile, e.store.hannun_household_id, e.store.hannun_children], ["keep", "h1", "[1]"]);
  });
  await test("가입 흐름: 검증 실패면 서버 호출 없이 필드 오류, 서버 오류(이메일 중복)는 문구를 시트에 보이고 의도를 저장하지 않는다", async () => {
    const e = appEnv();
    e.acct.svc = e.sb.AuthService.create();
    e.acct.mode = "signup";
    e.acct.form = { ...goodForm, password: "short" };
    await e.click({ action: "submit-signup" });
    assert.deepStrictEqual(e.ad.calls, []);
    assert.ok(e.acct.errors.password && e.sheet.innerHTML.includes("비밀번호는 8자 이상으로 만들어 주세요."));
    const dup = appEnv({ createUser: async () => { throw Object.assign(new Error("x"), { code: "auth/email-already-in-use" }); } });
    dup.acct.svc = dup.sb.AuthService.create();
    dup.acct.mode = "signup";
    dup.acct.form = { ...goodForm };
    await dup.click({ action: "submit-signup" });
    assert.ok(dup.sheet.innerHTML.includes("이미 가입된 이메일이에요. 로그인해 주세요."));
    assert.ok(!("hannun_account_intent" in dup.store) && dup.acct.user === null && dup.acct.busy === false);
  });
  await test("로그인·로그아웃 흐름: 로그인 성공 → 로그인 상태, [로그아웃]은 확인 없이 바로 Auth 로그아웃 + 의도 삭제 + 첫 화면, 로컬 데이터 유지", async () => {
    const e = appEnv();
    e.acct.svc = e.sb.AuthService.create();
    e.sb.hh.hid = "h1";
    e.acct.form = { email: "a@b.co", password: "pw" };
    await e.click({ action: "submit-login" });
    assert.strictEqual(e.acct.user.uid, "u1");
    e.store.hannun_account_intent = "{}";
    await e.click({ action: "logout" }); // P1: 확인 시트 없이 바로 로그아웃 → 첫 화면
    assert.ok(!APP.includes('acctShowSheet("logout")') && e.log.closed >= 1, "확인 시트를 열지 않고 닫는다");
    assert.strictEqual(e.acct.user, null);
    assert.strictEqual(e.sb.__landing, 1, "첫 화면(온보딩)으로 이동");
    assert.ok(e.ad.calls.includes("signOut") && !("hannun_account_intent" in e.store));
    assert.deepStrictEqual([e.store.hannun_profile, e.store.hannun_household_id, e.store.hannun_children], ["keep", "h1", "[1]"]);
  });
  await test("플래그 OFF 흐름: 어떤 클릭도 아무 일도 하지 않는다(어댑터 호출 0)", async () => {
    const e = appEnv(undefined, false);
    e.acct.svc = e.sb.AuthService.create();
    await e.click({ action: "open-signup" });
    await e.click({ action: "submit-signup" });
    assert.deepStrictEqual(e.ad.calls, []);
    assert.strictEqual(e.sheet.innerHTML, "");
  });
  await Promise.all(pending);
  console.log(`\n${passed}개 통과${process.exitCode ? ", 일부 실패" : ""}`);
})();
