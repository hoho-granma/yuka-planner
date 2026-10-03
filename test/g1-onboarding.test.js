/*
 * G1 첫 화면 온보딩: 계정 ON 첫 화면 모드(간단/둘러보기)·가족 코드로 함께하기(가입 시트 합류 모드)·새 문구·버튼 스타일, OFF 첫 화면의 '새 버전 미리 써 보기(베타)' 켜기/끄기 왕복.
 * 실행: node test/g1-onboarding.test.js
 */
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const vm = require("vm");
const cp = require("child_process");
const AS = require("../js/auth-service.js");
const AV = require("../js/account-view.js");
const ROOT = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
const APP = read("js/app.js"), CSS = read("css/style.css");
let passed = 0;
const pending = [];
function test(name, fn) { const p = Promise.resolve().then(fn).then(() => { passed++; console.log("  ok  - " + name); }, (e) => { process.exitCode = 1; console.log("  FAIL- " + name + "\n      " + (e.stack || e).split("\n").slice(0, 6).join("\n      ")); }); pending.push(p); return p; }

function env({ flag = true, user = null, newChild = false, storageThrows = false } = {}) {
  const store = {};
  const cls = new Set();
  const view = { classList: { toggle: (n, on) => (on ? cls.add(n) : cls.delete(n)), add: (n) => cls.add(n), remove: (n) => cls.delete(n) }, querySelector: () => null };
  const sheet = { innerHTML: "", querySelector: () => sheetRoot, classList: { remove() {}, add() {} } };
  let sheetRoot = null;
  const slot = { innerHTML: "", dataset: {}, listeners: [], classList: { toggle() {} }, addEventListener(t, f) { this.listeners.push(f); } };
  const log = { reload: 0, closed: 0, focused: 0, warns: 0 };
  const els = { "view-landing": view, "modal-content": sheet, "detail-modal": sheet, "beta-preview-slot": slot };
  const sb = { console: { warn() { log.warns++; }, error() {}, log() {} }, window: { FEATURES: { accounts: flag } }, AccountView: AV, AuthService: { create: () => AS.create({ features: () => ({ accounts: true }), adapter: {} }), MSG: AS.MSG },
    el: (id) => els[id] || null, closeDetail: () => { log.closed++; }, hh: { hid: null, code: null }, localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { if (storageThrows) throw new Error("x"); store[k] = v; }, removeItem: (k) => { if (storageThrows) throw new Error("x"); delete store[k]; } },
    location: { reload: () => { log.reload++; } }, document: { createElement: () => ({ addEventListener() {} }) } };
  vm.createContext(sb);
  const a = APP.indexOf("// ── D1 계정"), b = APP.indexOf("async function init()");
  vm.runInContext(`let modalMode = null; let profile = null; let regionsData = null; let currentTab = "home"; let newChildMode = ${newChild}; const TAB_NAMES = []; const us = { selection: [], selTouched: false }; function hhRender() {}\n` + APP.slice(a, b) + "\n;globalThis.__t = { acct, acctOnClick, acctApplyLandingMode, previewRender, previewOnClick, get browse() { return acctBrowse; } };", sb);
  sb.__t.acct.user = user;
  const click = (action) => sb.__t.acctOnClick({ target: { closest: (sel) => (sel === "[data-acct-radio]" ? null : { getAttribute: () => action }) } });
  const pclick = (action, kind) => sb.__t.previewOnClick({ target: { closest: (sel) => (sel === "[data-preview-action]" ? { getAttribute: () => action } : sel === "[data-preview-form]" ? (kind ? { getAttribute: () => kind } : null) : null) }, stopPropagation() {} });
  return { sb, cls, store, sheet, slot, log, click, pclick, acct: sb.__t.acct, t: sb.__t, setRoot: (r) => { sheetRoot = r; } };
}

console.log("첫 화면 모드·가족 코드로 함께하기");
test("모드: 로그아웃·기본은 간단(acct-simple), 둘러보기를 누르면 acct-browse, 돌아가기로 다시 간단, 로그인 상태·새 아이 입력 중은 간단 아님(카드 숨김), OFF 는 클래스를 건드리지 않는다", async () => {
  const e = env();
  e.t.acctApplyLandingMode();
  assert.deepStrictEqual([e.cls.has("acct-simple"), e.cls.has("acct-browse")], [true, false]);
  await e.click("browse");
  assert.deepStrictEqual([e.t.browse, e.cls.has("acct-simple"), e.cls.has("acct-browse")], [true, false, true]);
  await e.click("browse-close");
  assert.deepStrictEqual([e.t.browse, e.cls.has("acct-simple"), e.cls.has("acct-browse")], [false, true, false]);
  const u = env({ user: { uid: "u" } }); u.t.acctApplyLandingMode();
  assert.deepStrictEqual([u.cls.has("acct-simple"), u.cls.has("acct-browse")], [false, false]);
  const n = env({ newChild: true }); n.t.acctApplyLandingMode();
  assert.deepStrictEqual([n.cls.has("acct-simple"), n.cls.has("acct-browse"), n.cls.has("acct-hidecard")], [false, false, true]);
  const off = env({ flag: false }); off.t.acctApplyLandingMode();
  assert.strictEqual(off.cls.size, 0);
});
test("[가족 코드로 함께하기]: 가입 시트를 합류 모드로 열고(코드 칸 먼저·포커스), 자녀 유무·지역은 숨기고 역할은 4종 전체, 코드 없이 제출하면 안내 오류, [코드가 없어요]로 일반 가입으로 복귀", async () => {
  const e = env();
  let focused = 0;
  e.setRoot({ addEventListener() {}, querySelector: (s) => (s === '[data-acct-input="familyCode"]' ? { focus: () => focused++ } : null) });
  await e.click("open-join");
  const h = e.sheet.innerHTML;
  assert.ok(h.includes("어느 가족에 합류하나요?") && h.includes("2 / 2 단계") && h.includes('data-acct-input="familyCode"') && !h.includes('data-acct-input="email"'), "합류는 가족코드(2/2단계)부터, 이전 단계에서 계정 입력"); // G7
  assert.ok(!h.includes('data-acct-radio="situation"') && !h.includes('data-acct-input="province"') && !h.includes('data-acct-radio="role"') && AV.renderRolePick({ form: {} }).includes(">이모님(기타 돌봄)<") && h.includes('data-acct-action="join-off"')) // H2: 역할은 자리 선택/역할 단계에서;
  assert.deepStrictEqual([focused, e.acct.joinFocus], [1, false], "코드 칸 포커스 1회");
  e.acct.form = { ...e.acct.form, email: "d@x.co", password: "12345678", displayName: "민수", role: "DAD" };
  const bad = AV.validateSignup(e.acct.form, new Date());
  assert.strictEqual(bad.errors.familyCode, AV.MSG.onboard.errJoinCode);
  const ok = AV.validateSignup({ ...e.acct.form, familyCode: " abcd2345 " }, new Date());
  assert.ok(ok.ok && ok.intent.joiningCode === "ABCD2345" && !("situation" in ok.intent));
  await e.click("join-off");
  assert.ok(e.sheet.innerHTML.includes('data-acct-radio="situation"') && !e.sheet.innerHTML.includes('data-acct-action="join-off"') && e.acct.form.join === false);
  await e.click("open-signup");
  assert.ok(!e.acct.form.join);
});
test("가입 시트 [가입하기]는 첫 화면 주 버튼과 같은 스타일 클래스(acct-btn-primary)", () => {
  assert.ok(AV.renderSignup({ form: { step: 3 } }).includes('class="acct-btn-primary acct-step-go" data-acct-action="submit-signup"')); // G7: 마지막(3/3) 단계의 [가입하기]
  assert.ok(AV.renderLanding({}).includes('class="acct-btn-primary" data-acct-action="open-login"'));
});
test("첫 화면 문구: 부제·버튼 라벨·링크가 합의한 문구이고 한곳(MSG.onboard, 동결)에 모여 있다", () => {
  const O = AV.MSG.onboard;
  assert.ok(Object.isFrozen(O));
  assert.deepStrictEqual([O.title, O.primary, O.loginBtn, O.codeHint, O.joinTitle, O.joinDesc], ["우리 가족 일정, 한눈에", "회원가입", "로그인", "가족코드를 받았다면 회원가입에서 입력해요", "가족에게 받은 가족코드로 함께하기", "가족코드를 받았다면 여기로"]);
  assert.strictEqual(O.sub, "접종·검진·지원금은 아이 월령에 맞춰 자동으로, 엄마·아빠 일정은 가족과 함께 한 캘린더에서.");
  assert.ok(!("stageQuestion" in O) && !("stagePregnant" in O) && !("stageBorn" in O), "G10: 아이 상황 선택 문구 삭제");
  assert.strictEqual(O.formNote, "입력한 정보로 월령에 맞는 일정과 혜택을 챙겨 드려요. 언제든 프로필에서 고칠 수 있어요.");
});
test("setLandingStage: 계정 ON 일 때만 새 부제·제출 문구, OFF 는 기존 STAGE_TEXT 그대로", () => {
  const a = APP.indexOf("  function setLandingStage(stage) {"), b = APP.indexOf("\n  }\n", a) + 5;
  const stageText = APP.slice(APP.indexOf("  const STAGE_TEXT = {"), a);
  const run = (flag, stage) => {
    const o = {};
    const mk = (n) => (o[n] = o[n] || { innerHTML: "", textContent: "", placeholder: "", classList: { toggle() {} } });
    const sb = { AccountView: AV, acctEnabled: () => flag, el: mk, resetBirthDatePicker() {}, landingStage: null };
    vm.createContext(sb);
    vm.runInContext(stageText + APP.slice(a, b) + `;globalThis.f = setLandingStage;`, sb);
    sb.f(stage);
    return { sub: o["hero-sub"].innerHTML, submit: o["btn-submit"].textContent };
  };
  assert.deepStrictEqual(run(true, "pregnant"), { sub: AV.MSG.onboard.pregnantSub, submit: AV.MSG.onboard.pregnantSubmit });
  assert.deepStrictEqual(run(true, null), { sub: AV.MSG.onboard.bornSub, submit: AV.MSG.onboard.bornSubmit });
  assert.ok(run(false, "born").sub.includes("한 캘린더에서 챙겨드려요") && run(false, "born").submit === "우리 아이 맞춤 육아 일정 만들기", "OFF 기존 문구");
});

console.log("OFF 첫 화면: 베타 미리 써 보기");
test("OFF 기본 HTML 은 '베타 버튼 슬롯' 한 줄만 다르다(그 외 HEAD 와 동일)", () => {
  let head;
  try { head = cp.execFileSync("git", ["show", "5ec3e02:index.html"], { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }); } catch (e) { return; }
  const norm = (h) => h.replace(/\?v=\d+/g, "").replace(/\n\s*<div id="beta-preview-slot"><\/div>/, "").replace(/\n\s*<script src="js\/schedule-kinds\.js[^>]*><\/script>/, ""); // G13: 순수 모듈 스크립트 한 줄(전역 정의만, OFF 동작 없음)
  assert.strictEqual(norm(read("index.html")), norm(head));
  assert.ok(read("index.html").includes('<div id="beta-preview-slot"></div>'));
});
test("미리 써 보기 카드: OFF 에서만 보이고(ON·새 아이 입력 중은 비움), 누르면 확인 시트(바뀌는 점·[써 볼게요]/[취소]), 취소는 아무것도 안 쓴다", () => {
  const e = env({ flag: false });
  e.t.previewRender();
  assert.ok(e.slot.innerHTML.includes("새 버전 미리 써 보기 (베타)") && e.slot.innerHTML.includes("회원가입과 가족 캘린더가 있는 새 화면이에요") && e.slot.listeners.length === 1);
  e.t.previewRender();
  assert.strictEqual(e.slot.listeners.length, 1, "리스너 1회");
  assert.strictEqual(env({ flag: true }).slot.innerHTML === "" && (env({ flag: true }).t.previewRender(), true), true);
  const on = env({ flag: true }); on.t.previewRender(); assert.strictEqual(on.slot.innerHTML, "");
  const nc = env({ flag: false, newChild: true }); nc.t.previewRender(); assert.strictEqual(nc.slot.innerHTML, "");
  e.setRoot({ addEventListener() {} });
  e.pclick("ask");
  assert.ok(e.sheet.innerHTML.includes("새 버전을 써 볼까요?") && e.sheet.innerHTML.includes("써 볼게요") && e.sheet.innerHTML.includes("취소") && e.sheet.innerHTML.includes("언제든 이전 화면으로 돌아올 수 있어요"));
  e.pclick("cancel");
  assert.deepStrictEqual([e.log.closed, e.log.reload, Object.keys(e.store)], [1, 0, []]);
});
test("왕복: 켜기 확인 → household·accounts 키 '1' + reload, 새 첫 화면의 [이전 화면으로 돌아가기(베타 끄기)] → 확인 시트 → 두 키 삭제 + reload(서버 호출 0)", async () => {
  const e = env({ flag: false });
  e.setRoot({ addEventListener() {} });
  e.pclick("ask"); e.pclick("confirm", "on");
  assert.deepStrictEqual([e.store.hannun_feature_household, e.store.hannun_feature_accounts, e.log.reload], ["1", "1", 1]);
  const on = env({ flag: true });
  on.store.hannun_feature_household = "1"; on.store.hannun_feature_accounts = "1";
  await on.click("beta-off-ask");
  assert.ok(on.sheet.innerHTML.includes("이전 화면으로 돌아갈까요?") && on.sheet.innerHTML.includes('data-preview-form="off"'));
  assert.deepStrictEqual([Object.keys(on.store).length, on.log.reload], [2, 0], "확인 전에는 아무것도 바꾸지 않는다");
  on.pclick("confirm", "off");
  assert.deepStrictEqual([Object.keys(on.store), on.log.reload], [[], 1]);
  const blk = APP.slice(APP.indexOf("// ── G1 OFF 첫 화면"), APP.indexOf("/* (G1 구간 끝) */"));
  assert.ok(!/fetch\(|firebase|Firestore|HouseholdSync|FamilySync|\.set\(|\.update\(/.test(blk), "서버 호출 없음");
  const bad = env({ flag: false, storageThrows: true });
  bad.setRoot({ addEventListener() {} });
  bad.pclick("ask"); bad.pclick("confirm", "on");
  assert.deepStrictEqual([bad.log.reload, bad.log.warns], [0, 1], "저장 실패 시 reload 하지 않는다");
  assert.ok(/data-beta-action/.test(read("js/household-view.js")) && APP.includes('localStorage.setItem("hannun_feature_accounts", "1")'), "프로필 시트 기존 베타 스위치도 같은 두 키");
});

console.log("버튼 스타일(CSS) · 390px 측정");
test("CSS: 주 버튼 54px·둥근 16px·accent 채움·그림자·눌림·포커스 링, 보조 카드 56px·테두리·원형 아이콘, 새 색 도입 없음(var(--accent*)/기존 #fff·#fff7f2/accent rgba 만)", () => {
  const g1 = CSS.slice(CSS.indexOf("/* G1: 첫 화면(계정 ON)"), CSS.indexOf("/* G6:")); // G7 슬라이드 CSS 는 아래 별도 블록
  const rule = (sel) => (g1.match(new RegExp("(^|\\n)" + sel.replace(/[.*+?^${}()|[\]\\:]/g, "\\$&") + "\\s*\\{([^}]*)\\}")) || [])[2] || "";
  const pri = rule(".acct-btn-primary");
  assert.ok(/min-height:\s*54px/.test(pri) && /border-radius:\s*16px/.test(pri) && /background:\s*var\(--accent\)/.test(pri) && /color:\s*#fff/.test(pri) && /box-shadow:/.test(pri) && /width:\s*100%/.test(pri));
  assert.ok(/transform:\s*scale\(\.98\)/.test(rule(".acct-btn-primary:active")));
  assert.ok(/outline:\s*3px solid var\(--accent-dark\)/.test(g1.match(/\.acct-btn-primary:focus-visible[^{]*\{([^}]*)\}/)[0]));
  const join = rule(".acct-btn-join, .acct-beta-card");
  assert.ok(/min-height:\s*56px/.test(join) && /border:\s*1px solid var\(--border\)/.test(join) && /border-radius:\s*16px/.test(join) && /background:\s*#fff/.test(join));
  assert.ok(/border-radius:\s*50%/.test(rule(".acct-btn-ico")));
  const colors = (g1.match(/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)/g) || []).map((c) => c.toLowerCase().replace(/\s+/g, ""));
  const allowed = new Set(["#fff", "#fff7f2", "rgba(255,138,92,.3)"]);
  colors.forEach((c) => assert.ok(allowed.has(c), "허용 밖 색: " + c));
  assert.ok(/#view-landing\.acct-simple #btn-show-code-entry, #view-landing\.acct-simple #code-entry \{ display: none !important; \}/.test(g1), "인라인 display:block 을 이기려면 !important");
  assert.ok(read("index.html").includes('id="btn-show-code-entry" class="btn-text" style="display:block'), "인라인 style 이 실제로 있다(그래서 !important)");
  assert.ok(/#view-landing\.acct-simple > \.hero, #view-landing\.acct-simple #stage-choice, #view-landing\.acct-simple #query-form/.test(g1));
});
const BROWSERS = (() => { const d = path.join(os.homedir(), "Library/Caches/ms-playwright"); const out = []; try { for (const n of fs.readdirSync(d).filter((x) => x.startsWith("chromium_headless_shell"))) { const sub = fs.readdirSync(path.join(d, n)).find((x) => x.startsWith("chrome-headless-shell")); if (sub) out.push(path.join(d, n, sub, "chrome-headless-shell")); } } catch (e) {} out.push("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"); return out.filter((p) => fs.existsSync(p)); })();
for (const width of [360, 390, 430]) {
  test(`폭 ${width}px: 첫 화면 카드·버튼·가입 시트(합류 모드)·베타 카드가 넘치지 않고 버튼 높이 52~64px`, () => {
    if (!BROWSERS.length) return;
    const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><link rel="stylesheet" href="file://${path.join(ROOT, "css/style.css")}" /></head><body><main id="app"><section id="view-landing" class="view acct-simple"><div id="acct-landing-slot">${AV.renderLanding({})}</div><div id="beta-preview-slot">${AV.renderBetaPreviewCard()}</div><div class="card" id="sheet">${AV.renderSignup({ form: { join: true }, regions: [] })}</div></section></main><pre id="out"></pre><script>window.addEventListener("load", function () { setTimeout(function () { var r = []; document.querySelectorAll(".acct-btn-primary,.acct-btn-join,.acct-beta-card").forEach(function (b) { var q = b.getBoundingClientRect(); r.push({ cls: b.className, h: q.height, over: b.scrollWidth - b.clientWidth, right: q.right }); }); r.push({ cls: "page", over: document.documentElement.scrollWidth - window.innerWidth }); document.getElementById("out").textContent = JSON.stringify(r); }, 50); });</script></body></html>`;
    const file = path.join(os.tmpdir(), `g1-${process.pid}-${width}.html`);
    fs.writeFileSync(file, html);
    let dom;
    try { dom = cp.execFileSync(BROWSERS[0], ["--headless", "--disable-gpu", "--no-sandbox", `--window-size=${width},1800`, "--virtual-time-budget=3000", "--dump-dom", "file://" + file], { encoding: "utf8", timeout: 60000, stdio: ["ignore", "pipe", "ignore"] }); } finally { try { fs.unlinkSync(file); } catch (e) {} }
    const res = JSON.parse(dom.match(/<pre id="out">([\s\S]*?)<\/pre>/)[1].replace(/&quot;/g, '"'));
    res.filter((r) => r.cls !== "page").forEach((r) => { assert.ok(r.h >= 52 && r.h <= 64, `${r.cls} 높이 ${r.h}`); assert.ok(r.over <= 1 && r.right <= width + 0.5, `${r.cls} 넘침`); });
    assert.ok(res.find((r) => r.cls === "page").over <= 1, "페이지 가로 스크롤");
  });
}
test("계정 모드에서는 아이 기록 코드 입력을 숨긴다(문구 상수 삭제, 가족코드 합류는 가입 시트)", () => {
  assert.deepStrictEqual([AV.MSG.onboard.codeEntryOpen, AV.MSG.onboard.codeEntryLabel], [undefined, undefined]);
  assert.ok(APP.includes('co.style.setProperty("display", "none", "important")') && !APP.includes("O.codeEntryLabel"));
});
Promise.all(pending).then(() => console.log(`\n${passed}개 통과${process.exitCode ? ", 일부 실패" : ""}`));
