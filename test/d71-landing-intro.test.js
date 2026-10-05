// D71: 로그인한 채로 홈 헤더 '한눈육아'를 누르면 온보딩 1장(히어로)이 열리고, 아래는 [홈으로]·로그인됨 안내 한 줄만. 로그아웃 상태 첫 화면·로그인 직후 홈 이동은 그대로.
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const AV = require("../js/account-view.js");
const read = (f) => fs.readFileSync(path.join(__dirname, "..", f), "utf8");
const APP = read("js/app.js"), CSS = read("css/style.css"), HTML = read("index.html");
let passed = 0;
function test(name, fn) { try { fn(); passed++; console.log("  ok  - " + name); } catch (e) { console.log("  FAIL - " + name + "\n" + e.stack); process.exitCode = 1; } }
const user = { displayName: "수아엄마", email: "a@b.c" };

test("로그인 + intro: 같은 1장 히어로, 버튼은 [홈으로] 하나·'○○님으로 로그인했어요.' 한 줄, 로그인·회원가입·로그아웃·가족코드 안내 없음", () => {
  const h = AV.renderLanding({ user, intro: true, version: "2.0.4" });
  assert.ok(h.includes('data-acct-slide="0"') && h.includes("acct-ob1-top") && h.includes("한눈에") && h.includes("acct-logo-w"));
  assert.ok(h.includes('data-acct-action="intro-home">홈으로<') && h.includes('<p class="acct-code-hint">수아엄마님으로 로그인했어요.</p>') && h.includes("v2.0.4"));
  assert.ok(!/open-login|open-signup|data-acct-action="logout"|가족코드를 받았다면|acct-dots|data-acct-slide="1"/.test(h));
  assert.strictEqual([...h.matchAll(/data-acct-action="([^"]+)"/g)].length, 1);
});
test("intro 아님: 로그인 상태 옛 카드(로그인 중 + [로그아웃])는 그대로, 로그아웃 상태 첫 화면은 D64 그대로([로그인]·[회원가입]·가족코드 안내)", () => {
  const u = AV.renderLanding({ user });
  assert.ok(u.includes('data-acct-action="logout"') && !u.includes("intro-home") && !u.includes("acct-ob1-top"));
  const o = AV.renderLanding({});
  assert.ok(o.includes('data-acct-action="open-login"') && o.includes('data-acct-action="open-signup"') && o.includes("가족코드를 받았다면 회원가입에서 입력해요") && !o.includes("intro-home"));
  assert.ok(!AV.renderLanding({ intro: true }).includes("intro-home"), "user 가 없으면 intro 플래그만으로는 소개 화면을 만들지 않는다");
});
test("헤더 '한눈육아'는 버튼(aria-label), 클릭하면 acctOpenIntro — 로그인 상태에서만, 가입 직후 스플래시·새 아이 입력 중엔 열지 않는다", () => {
  assert.ok(/<button type="button" class="app-title app-brand-btn" id="brand-text" aria-label="한눈육아 소개 화면 열기">한눈육아<\/button>/.test(HTML));
  assert.ok(/\.app-brand-btn \{[^}]*min-height: 44px[^}]*cursor: pointer/.test(CSS) && /\.app-brand-btn:focus-visible/.test(CSS));
  const i = APP.indexOf("  function acctOpenIntro() {");
  const fn = APP.slice(i, APP.indexOf("\n  }\n", i) + 5);
  const calls = [];
  const mk = (o) => { const sb = { acctEnabled: () => true, acct: { user: { uid: "u" }, splashHold: false, ...(o.acct || {}) }, newChildMode: !!o.newChild, acctIntro: false, showLandingView: () => calls.push("show"), acctRenderLanding: () => calls.push("render"), acctApplyLandingMode: () => calls.push("mode") }; vm.createContext(sb); vm.runInContext(fn + ";globalThis.__f = acctOpenIntro;", sb); return sb; };
  let sb = mk({}); sb.__f(); assert.deepStrictEqual(calls, ["show", "render", "mode"]); assert.strictEqual(vm.runInContext("acctIntro", sb), true);
  calls.length = 0; sb = mk({ acct: { user: null } }); sb.__f(); assert.deepStrictEqual(calls, []);
  sb = mk({ acct: { splashHold: true } }); sb.__f(); assert.deepStrictEqual(calls, []);
  sb = mk({ newChild: true }); sb.__f(); assert.deepStrictEqual(calls, []);
});
test("intro 중에는 acct-simple 유지·acctGoHome 가드 예외, [홈으로]=보던 탭 그대로 캘린더 뷰 복귀, 로그아웃하면 해제", () => {
  assert.ok(/const simple = \(!acct\.user \|\| \(typeof acctIntro !== "undefined" && acctIntro === true\)\) && !acctBrowse && !newChildMode;/.test(APP));
  assert.ok(/async function acctGoHome\(\) \{\n    if \(!acctEnabled\(\) \|\| !acct\.user \|\| newChildMode \|\| \(typeof acctIntro !== "undefined" && acctIntro === true\)\) return;/.test(APP));
  assert.ok(/if \(action === "intro-home"\) \{ acctIntro = false; showCalendarView\(\); acctApplyLandingMode\(\); return; \}/.test(APP));
  assert.ok(/if \(!acct\.user && typeof acctIntro !== "undefined"\) acctIntro = false;/.test(APP));
  assert.ok(!/history\.pushState/.test(APP.slice(APP.indexOf("function acctOpenIntro"), APP.indexOf("let acctIntro"))), "뒤로가기 라우팅은 이번에 안 함");
});
test("[홈으로] 버튼은 로그인 버튼과 같은 모양(CSS)", () => {
  assert.ok(/#view-landing\.acct-on \.acct-cta \[data-acct-action="intro-home"\] \{ min-height: 52px; border-radius: 13px; background: var\(--nd-indigo\); color: var\(--on-accent\)/.test(CSS));
});
console.log(`\n${passed}개 통과`);
