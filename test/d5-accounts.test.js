/*
 * D5 가입/온보딩 개편: 라디오 펼침(자녀 유무→역할)·가입 intent(situation/role/지역)·가입 후 아이 입력 없이 홈(아이가 없는 홈)·빈 상태 5탭·합류 시 숨김·지역 기본값 미리 채움·랜딩 문구(ON 일 때만).
 * 실행: node test/d5-accounts.test.js
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const AS = require("../js/auth-service.js");
const AV = require("../js/account-view.js");
const read = (f) => fs.readFileSync(path.join(__dirname, "..", f), "utf8");
const APP = read("js/app.js");
const REGIONS = JSON.parse(read("data/regions.json")).provinces;

let passed = 0;
const pending = [];
function test(name, fn) {
  const p = Promise.resolve().then(fn).then(() => { passed++; console.log("  ok  - " + name); }, (e) => { process.exitCode = 1; console.log("  FAIL- " + name + "\n      " + (e.stack || e).split("\n").slice(0, 6).join("\n      ")); });
  pending.push(p);
  return p;
}

function env({ flag = true, profile = null, account = null, user = null, emptyStart = false } = {}) {
  const store = {};
  const cl = () => { const c = { hidden: false, add(n) { if (n === "hidden") c.hidden = true; }, remove(n) { if (n === "hidden") c.hidden = false; }, toggle(n, on) { c[n] = !!on; if (n === "hidden") c.hidden = !!on; } }; return c; };
  const sheet = { innerHTML: "", querySelector: () => null, classList: cl() };
  const els = { "modal-content": sheet, "detail-modal": sheet, "view-landing": { querySelector: () => ({ insertAdjacentElement() {}, querySelector: () => ({ textContent: "" }), textContent: "" }), classList: cl() }, "view-calendar": { classList: cl() }, "new-child-bar": { classList: cl() },
    "empty-panel": { innerHTML: "", classList: cl(), addEventListener() {} }, "hero-title": { innerHTML: "기존" }, "entry-fine-print": { textContent: "기존 문구" }, province: { value: "" }, district: { value: "" } };
  ["home", "calendar", "record", "subsidy", "checklist"].forEach((t) => { els["tab-" + t] = { classList: cl() }; });
  const log = { register: 0, landing: 0, districts: [], closed: 0 };
  const authAd = { createUser: async (e) => ({ uid: "u1", email: e, displayName: "" }), signIn: async (e) => ({ uid: "u1", email: e }), signOut: async () => {}, sendReset: async () => {}, deleteUser: async () => {}, updateDisplayName: async (u, n) => ({ ...u, displayName: n }), onChange: () => () => {} };
  const sb = { charProfiles: new Map(), charProfileLoads: new Set(), console, Date, JSON, Promise, window: { FEATURES: { accounts: flag }, scrollTo() {} }, AccountView: AV,
    AuthService: { create: () => AS.create({ features: () => ({ accounts: true }), adapter: authAd }), MSG: AS.MSG },
    HouseholdSync: { getStatus: () => ({ pending: 0 }), flush: async () => {}, getMirror: () => null, leaveLocal: () => ({ ok: true }) }, HouseholdView: { isChildLinked: () => false, mergeChildren: () => [] },
    el: (id) => els[id] || null, closeDetail: () => { log.closed++; }, hh: { hid: null, code: null }, hhRender() {}, hhLeaveLocal() {}, hhSetJoined() {},
    beginNewChildEntry: async () => { log.register++; }, showLandingView: () => { log.landing++; }, populateDistricts: (p, d) => { log.districts.push([p, d]); }, renderProvinceChips() {}, renderDistrictChips() {},
    localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = v; }, removeItem: (k) => { delete store[k]; } },
    document: { createElement: () => ({ addEventListener() {} }), querySelectorAll: () => [] } };
  vm.createContext(sb);
  const a = APP.indexOf("// ── D1 계정"), b = APP.indexOf("async function init()");
  vm.runInContext(`let modalMode = null; let profile = ${JSON.stringify(profile)}; let familyCode = null; let regionsData = { provinces: ${JSON.stringify(REGIONS)} }; let currentTab = "home"; let newChildMode = false; const TAB_NAMES = ["home", "calendar", "record", "subsidy", "checklist"]; const us = { selection: [], selTouched: false }; const isPregnant = () => false; const childDisplayName = () => "";
    const loadChildren = () => []; function usRefreshCalendar() {}\n` + APP.slice(a, b) + "\n;globalThis.__t = { acct, acctOnClick, acctInit, acctRenderLanding, showEmptyHome, emptyRender, acctPrefillRegion, get emptyHome() { return emptyHome; } };", sb);
  const click = (attrs) => sb.__t.acctOnClick({ target: { closest: (sel) => (sel === "[data-acct-radio]" ? (attrs.radio ? { getAttribute: (n) => (n === "data-acct-radio" ? attrs.radio[0] : attrs.radio[1]) } : null) : { getAttribute: () => attrs.action } ) } });
  sb.__t.acct.user = user; sb.__t.acct.account = account;
  return { sb, els, store, sheet, log, click, acct: sb.__t.acct, t: sb.__t };
}

(async () => {
  console.log("가입 시트 라디오 펼침");
  await test("자녀 유무를 고르면 역할 선택지가 펼쳐지고(있어요=엄마·아빠·자녀 / 없어요=예비엄마·예비아빠), 맞지 않는 이전 역할 선택은 지운다", async () => {
    const e = env();
    e.acct.mode = "signup"; e.acct.form = { step: 2 }; // G7: 자녀 유무·역할은 2단계
    await e.click({ radio: ["situation", "HAS_CHILD"] });
    assert.ok(e.sheet.innerHTML.includes(">엄마<") && e.sheet.innerHTML.includes(">자녀<") && !e.sheet.innerHTML.includes("예비엄마") && !e.sheet.innerHTML.includes("이모님"));
    await e.click({ radio: ["role", "CHILD"] });
    assert.strictEqual(e.acct.form.role, "CHILD");
    await e.click({ radio: ["situation", "EXPECTING"] });
    assert.strictEqual(e.acct.form.role, "", "자녀는 예비 부모 선택지에 없어 지워진다");
    assert.ok(e.sheet.innerHTML.includes(">예비엄마<") && e.sheet.innerHTML.includes(">예비아빠<") && !e.sheet.innerHTML.includes(">자녀<"));
    await e.click({ radio: ["role", "DAD"] });
    assert.strictEqual(e.acct.form.role, "DAD");
    await e.click({ radio: ["situation", "HAS_CHILD"] });
    assert.strictEqual(e.acct.form.role, "DAD", "공통 역할은 유지");
  });
  await test("가입 시트에 시·도→시·군·구 2단 선택(실제 regions.json)과 주소 안내가 있고, 코드를 입력하면(합류) 자녀 유무·지역이 숨겨지고 역할은 전체 선택지", () => {
    const html = AV.renderSignup({ form: { situation: "HAS_CHILD", province: "서울특별시", step: 3 }, regions: REGIONS }); // G7: 지역은 3단계
    assert.ok(html.includes('data-acct-input="province"') && html.includes("구로구") && html.includes("상세 주소는 받지 않아요") && html.includes("신청 기한을 놓치지 않게"));
    const joined = [1, 2].map((st) => AV.renderSignup({ form: AV.syncForm({ familyCode: "abcd2345", situation: "HAS_CHILD", province: "서울특별시", district: "구로구", step: st }), regions: REGIONS })).join("");
    assert.ok(!joined.includes("province") && !joined.includes("현재 출생한 자녀") && !joined.includes('data-acct-radio="role"') && AV.renderRolePick({ form: {} }).includes(">이모님(기타 돌봄)<") && AV.renderRolePick({ form: {} }).includes(">자녀<")) // H2;
  });
  console.log("G7 가입 3단계 스텝");
  await test("3단계: 1 계정(이메일·비밀번호·이름) → 2 누가 함께 쓰나요(자녀 유무·역할·가족코드) → 3 사는 지역(선택·[가입하기]). 다음은 그 단계 필드만 검증하고 오류가 있으면 머문다, [이전]은 오류를 지우고 한 단계 뒤로", async () => {
    const e = env();
    e.acct.mode = "signup"; e.acct.form = {};
    await e.click({ action: "next-step" });
    assert.deepStrictEqual([e.acct.form.step, Object.keys(e.acct.errors).sort()], [undefined, ["displayName", "email", "password"]], "1단계 오류만(자녀 유무·역할 오류는 아직 안 나옴)");
    assert.ok(e.sheet.innerHTML.includes('data-acct-input="email"') && e.sheet.innerHTML.includes('data-acct-input="familyCode"') && e.sheet.innerHTML.includes('data-acct-action="submit-signup"') && !e.sheet.innerHTML.includes('data-acct-action="next-step"'), "단일 가입 폼은 내부 단계와 관계없이 모든 입력을 유지한다");
    Object.assign(e.acct.form, { email: "a@b.co", password: "12345678", displayName: "주연" });
    await e.click({ action: "next-step" });
    assert.deepStrictEqual([e.acct.form.step, Object.keys(e.acct.errors)], [2, []]);
    assert.ok(e.sheet.innerHTML.includes('data-acct-input="email"') && e.sheet.innerHTML.includes('data-acct-input="familyCode"') && e.sheet.innerHTML.includes('data-acct-action="submit-signup"') && !e.sheet.innerHTML.includes('data-acct-action="next-step"'), "단일 가입 폼은 내부 단계와 관계없이 모든 입력을 유지한다");
    await e.click({ action: "next-step" });
    assert.deepStrictEqual([e.acct.form.step, Object.keys(e.acct.errors).sort()], [2, ["role", "situation"]], "자녀 유무·역할을 골라야 넘어간다");
    Object.assign(e.acct.form, { situation: "HAS_CHILD", role: "MOM" });
    await e.click({ action: "next-step" });
    assert.strictEqual(e.acct.form.step, 3);
    assert.ok(e.sheet.innerHTML.includes('data-acct-input="email"') && e.sheet.innerHTML.includes('data-acct-input="familyCode"') && e.sheet.innerHTML.includes('data-acct-action="submit-signup"') && !e.sheet.innerHTML.includes('data-acct-action="next-step"'), "단일 가입 폼은 내부 단계와 관계없이 모든 입력을 유지한다");
    await e.click({ action: "prev-step" });
    assert.deepStrictEqual([e.acct.form.step, Object.keys(e.acct.errors)], [2, []]);
    e.acct.form.step = 1; await e.click({ action: "prev-step" });
    assert.strictEqual(e.acct.form.step, 1, "1단계 이전은 그대로");
  });
  await test("합류(코드 입력·[가족코드로 함께하기])는 2단계로 줄고, 가족코드부터 시작(open-join)하며 마지막 단계에서 [가입하기]·[코드가 없어요]", async () => {
    assert.deepStrictEqual([AV.signupTotal({}), AV.signupTotal({ familyCode: "abcd2345" }), AV.signupTotal({ join: true }), AV.signupStep({ step: 9 }), AV.signupStep({ join: true, step: 3 })], [3, 2, 2, 3, 2]);
    const e = env();
    await e.click({ action: "open-join" });
    assert.deepStrictEqual([e.acct.form.join, e.acct.form.step], [true, 2]);
    assert.ok(e.sheet.innerHTML.includes('data-acct-input="email"') && e.sheet.innerHTML.includes('data-acct-input="familyCode"') && e.sheet.innerHTML.includes('data-acct-action="submit-signup"') && !e.sheet.innerHTML.includes('data-acct-action="next-step"'), "단일 가입 폼은 내부 단계와 관계없이 모든 입력을 유지한다");
    await e.click({ action: "prev-step" });
    assert.ok(e.sheet.innerHTML.includes('data-acct-input="email"') && e.sheet.innerHTML.includes('data-acct-input="familyCode"') && e.sheet.innerHTML.includes('data-acct-action="submit-signup"') && !e.sheet.innerHTML.includes('data-acct-action="next-step"'), "단일 가입 폼은 내부 단계와 관계없이 모든 입력을 유지한다");
    Object.assign(e.acct.form, { email: "a@b.co", password: "12345678", displayName: "민" });
    await e.click({ action: "next-step" });
    assert.strictEqual(e.acct.form.step, 2);
    await e.click({ action: "submit-signup" });
    assert.ok(e.acct.errors.familyCode && e.acct.form.step === 2, "코드 없이 가입하면 코드 단계에서 오류");
  });
  await test("제출 때 앞 단계 오류는 그 단계로 되돌리고(firstErrorStep), 단계별 필드 키가 검증 오류 키와 일치한다", async () => {
    assert.deepStrictEqual([AV.signupStepKeys({}, 1), AV.signupStepKeys({}, 2), AV.signupStepKeys({}, 3), AV.signupStepKeys({ join: true }, 2)], [["email", "password", "displayName"], ["situation", "role", "familyCode"], ["region"], ["familyCode", "role"]]);
    assert.deepStrictEqual([AV.firstErrorStep({}, { region: "x", role: "y" }), AV.firstErrorStep({}, { email: "x" }), AV.firstErrorStep({}, {})], [2, 1, 0]);
    const e = env();
    e.acct.mode = "signup"; e.acct.form = { step: 3, situation: "HAS_CHILD", role: "MOM", password: "12345678", displayName: "주연" }; // 이메일 누락
    await e.click({ action: "submit-signup" });
    assert.deepStrictEqual([e.acct.form.step, Object.keys(e.acct.errors)], [1, ["email"]]);
    assert.ok(e.sheet.innerHTML.includes('data-acct-input="email"') && e.sheet.innerHTML.includes('data-acct-input="familyCode"') && e.sheet.innerHTML.includes('data-acct-action="submit-signup"') && !e.sheet.innerHTML.includes('data-acct-action="next-step"'), "단일 가입 폼은 내부 단계와 관계없이 모든 입력을 유지한다");
  });
  console.log("가입 intent");
  await test("가입 의도(저장값): situation·role·지역만 있고 아이 이름·생년월일·기관·비밀번호는 없다, 지역 없이도 가입된다", async () => {
    const e = env();
    e.acct.svc = e.sb.AuthService.create();
    e.acct.mode = "signup";
    e.acct.form = { email: "m@x.co", password: "12345678", displayName: "지은", situation: "EXPECTING", role: "MOM", province: "서울특별시", district: "구로구" };
    await e.click({ action: "submit-signup" });
    assert.deepStrictEqual(JSON.parse(e.store.hannun_account_intent), { email: "m@x.co", displayName: "지은", role: "MOM", joiningCode: null, situation: "EXPECTING", province: "서울특별시", district: "구로구" });
    const n = env();
    n.acct.svc = n.sb.AuthService.create(); n.acct.mode = "signup";
    n.acct.form = { email: "m@x.co", password: "12345678", displayName: "지은", situation: "HAS_CHILD", role: "DAD" };
    await n.click({ action: "submit-signup" });
    assert.deepStrictEqual(Object.keys(JSON.parse(n.store.hannun_account_intent)).sort(), ["displayName", "email", "joiningCode", "role", "situation"]);
  });
  console.log("아이가 없는 홈");
  await test("빈 홈: 홈은 안내 카드+[아이 등록하기]+[내 정보], 나머지 4탭도 각자 안내(크래시 0), 탭 패널은 숨기고 안내 패널만 보인다", () => {
    const e = env({ account: { situation: "HAS_CHILD" }, user: { uid: "u1" } });
    e.t.showEmptyHome();
    assert.ok(e.t.emptyHome && e.els["view-calendar"].classList.hidden === false && e.els["view-landing"].classList.hidden === true && e.els["empty-panel"].classList.hidden === false);
    assert.ok(["home", "calendar", "record", "subsidy", "checklist"].every((t) => e.els["tab-" + t].classList.hidden === true));
    assert.ok(e.els["empty-panel"].innerHTML.includes("아이를 등록하면 월령별 할 일·혜택이 열려요") && e.els["empty-panel"].innerHTML.includes("등록 ›") && e.els["empty-panel"].innerHTML.includes('data-acct-action="nc-me"')); // G20: 배너 한 줄 + 내 카드
    const want = { checklist: "체크리스트", subsidy: "신청 가능", record: "기록" }; // G20: 캘린더·어디갈까는 평소 화면(빈 안내 패널 없음)
    for (const [tab, word] of Object.entries(want)) { e.t.emptyRender(tab); const h = e.els["empty-panel"].innerHTML; assert.ok(h.includes(word) && h.includes("empty-register") && (h.match(/acct-nc-banner/g) || []).length === 1 && !h.includes("btn-complete"), tab); }
    const x = env({ account: { situation: "EXPECTING" }, user: { uid: "u1" } });
    x.t.showEmptyHome();
    assert.ok(x.els["empty-panel"].innerHTML.includes("출산 예정일을 등록하면 임신 중 할 일·혜택이 열려요"));
  });
  await test("프로필이 있으면(기존 이용자) 빈 홈으로 가지 않고, 계정 OFF 면 어떤 경우에도 가지 않는다", () => {
    const withP = env({ profile: { name: "수아" }, user: { uid: "u1" } });
    withP.t.showEmptyHome();
    assert.ok(!withP.t.emptyHome && withP.els["empty-panel"].innerHTML === "");
    const off = env({ flag: false, user: { uid: "u1" } });
    off.t.showEmptyHome();
    assert.ok(!off.t.emptyHome && off.els["empty-panel"].innerHTML === "");
  });
  await test("빈 홈의 [아이 등록하기]는 기존 아이 입력 흐름(beginNewChildEntry), [내 정보]는 계정·코드·로그아웃 시트, 로그아웃하면 처음 화면으로", async () => {
    const e = env({ account: { situation: "HAS_CHILD", displayName: "지은", role: "MOM", householdCode: "ABCD2345" }, user: { uid: "u1", email: "m@x.co" } });
    e.sb.hh.code = "ABCD2345";
    e.acct.svc = e.sb.AuthService.create();
    e.t.showEmptyHome();
    await e.click({ action: "empty-register" });
    assert.strictEqual(e.log.register, 1);
    await e.click({ action: "empty-me" });
    assert.ok(e.sheet.innerHTML.includes("지은") && e.sheet.innerHTML.includes("나(엄마)") && e.sheet.innerHTML.includes("ABCD2345") && e.sheet.innerHTML.includes('data-acct-action="logout"'));
    await e.click({ action: "confirm-logout" });
    assert.ok(!e.t.emptyHome && e.log.landing === 1 && e.els["empty-panel"].classList.hidden === true && e.acct.user === null);
  });
  await test("연결: 탭 전환은 빈 홈이면 안내만(switchTab 가드), 아이를 등록하면(buildAndRender) 빈 패널을 숨기고, 취소하고 돌아오면 빈 홈", () => {
    assert.ok(/function switchTab\(name\) \{\n(?:[^\n]*\n){0,4}?\s*if \(emptyHome && !profile\) return name === "calendar" \|\| name === "places" \? acctNoChildTab\(name\) : emptyRender\(name\);/.test(APP));
    assert.ok(/async function buildAndRender\(\) \{\n\s*hideEmptyHome\(\);/.test(APP));
    assert.ok(/if \(!profile && acctEnabled\(\)\) return showEmptyHome\(\);[^\n]*\n\s*showCalendarView\(\);/.test(APP));
    assert.ok(/if \(typeof acctPrefillRegion === "function"\) acctPrefillRegion\(\);\n\s*showLandingView\(\);/.test(APP));
    assert.ok(/if \(acct\.user && acct\.account && acct\.account\.householdCode && !profile && !newChildMode && !emptyHome\) showEmptyHome\(\);/.test(APP));
  });
  console.log("지역 기본값 · 문구");
  await test("가입에서 받은 시·도·시군구는 아이 등록 화면 지역 기본값으로 미리 채워지고(이미 고른 값·잘못된 값은 건드리지 않음)", () => {
    const e = env({ account: { province: "서울특별시", district: "구로구" }, user: { uid: "u1" } });
    e.t.acctPrefillRegion();
    assert.deepStrictEqual([e.els.province.value, e.els.district.value, e.log.districts], ["서울특별시", "구로구", [["서울특별시", "구로구"]]]);
    const picked = env({ account: { province: "서울특별시", district: "구로구" }, user: { uid: "u1" } });
    picked.els.province.value = "부산광역시";
    picked.t.acctPrefillRegion();
    assert.deepStrictEqual([picked.els.province.value, picked.log.districts], ["부산광역시", []]);
    const bad = env({ account: { province: "서울특별시", district: "없는구" }, user: { uid: "u1" } });
    bad.t.acctPrefillRegion();
    assert.deepStrictEqual([bad.els.province.value, bad.log.districts], ["", []]);
    const none = env({ account: {}, user: { uid: "u1" } });
    none.t.acctPrefillRegion();
    assert.strictEqual(none.els.province.value, "");
  });
  await test("랜딩(G1): 계정 ON 일 때만 옛 첫 화면 문구가 새 톤으로 바뀌고(OFF 는 기존 그대로), 카드에 새 첫 화면 문구", () => {
    const on = env();
    on.t.acctRenderLanding();
    const O = AV.MSG.onboard;
    assert.ok(on.els["hero-title"].textContent === O.browseHeroTitle && on.els["entry-fine-print"].textContent === O.formNote);
    const off = env({ flag: false });
    off.t.acctRenderLanding();
    assert.deepStrictEqual([off.els["hero-title"].innerHTML, off.els["entry-fine-print"].textContent], ["기존", "기존 문구"]);
    const card = AV.renderLanding({});
    for (const t of [O.primary, O.loginBtn, O.codeHint, O.ob1Title.split("\n")[0], O.ob2Brand]) assert.ok(card.includes(t), t); // G7: 새 첫 화면(2장 슬라이드)
    assert.ok(!card.includes("가입 없이 둘러보기") && !card.includes("베타 끄기"), "가입 없이 둘러보기·베타 끄기 버튼 삭제");
    assert.ok(read("index.html").includes('<p class="fine-print" id="entry-fine-print">회원가입 없이 바로 시작해요. 가족코드로 다른 기기에서도 이어볼 수 있어요.</p>'), "OFF 문구 원문 유지(id 만 추가)");
  });
  await Promise.all(pending);
  console.log(`\n${passed}개 통과${process.exitCode ? ", 일부 실패" : ""}`);
})();
