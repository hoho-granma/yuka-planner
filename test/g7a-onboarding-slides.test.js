/* G7-1 온보딩: 2장 슬라이드(달력 미리보기 / 히어로+기능 4개), 점·스와이프, 아래 고정 버튼, 둘러보기·베타 끄기 삭제, OFF 불변. 실행: node test/g7a-onboarding-slides.test.js */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const AV = require("../js/account-view.js");
const read = (f) => fs.readFileSync(path.join(__dirname, "..", f), "utf8");
const APP = read("js/app.js"), CSS = read("css/style.css");
let passed = 0;
function test(name, fn) { try { fn(); passed++; console.log("  ok  - " + name); } catch (e) { process.exitCode = 1; console.log("  FAIL- " + name + "\n      " + (e.stack || e).split("\n").slice(0, 4).join("\n      ")); } }

test("첫 장=달력 미리보기(이번 달 우리 가족, 칩 4·날짜 14칸·예시 일정 3·예시 표기), 둘째 장=히어로+기능 4개(자동 일정·가족 캘린더·어디갈까·기록)", () => {
  const h = AV.renderLanding({});
  const s0 = h.slice(h.indexOf('data-acct-slide="0"'), h.indexOf('data-acct-slide="1"'));
  const s1 = h.slice(h.indexOf('data-acct-slide="1"'), h.indexOf('class="acct-dots"'));
  assert.ok(s0.includes("이번 달 우리 가족,<br>이렇게 보여요") && s0.includes("자동 일정 + 가족이 등록한 일정") && s0.includes("예시 화면이에요"));
  assert.deepStrictEqual([(s0.match(/<span style="background:/g) || []).length, (s0.match(/<div>\d+/g) || []).length], [4, 14]);
  assert.ok(["나(엄마)", "아빠", "은찬", "가족", "10/7 로타바이러스 2차 (자동)", "10/9 아빠 · 하원 픽업", "10/18 가족 · 보라매공원 (차로 약 8분)"].every((t) => s0.includes(t)));
  assert.ok(s1.includes("우리 가족 일정, 한눈에") && s1.includes("아이 월령에 맞춘 일정과 가족 일정을 한곳에서"));
  assert.deepStrictEqual([...s1.matchAll(/<b>([^<]+)<\/b>/g)].map((m) => m[1]), ["자동 일정", "가족 캘린더", "어디갈까", "기록"]);
  assert.ok(s1.includes("아이 성장 기록과 사진을 남겨요"));
});
test("점 2개(첫 장 선택)·버튼은 두 장 공통으로 슬라이드 밖 아래(고정): 회원가입하고 시작하기·가족코드로 함께하기·로그인, 둘러보기·베타 끄기 없음", () => {
  const h = AV.renderLanding({});
  assert.deepStrictEqual([...h.matchAll(/data-slide-to="(\d)"/g)].map((m) => m[1]), ["0", "1"]);
  assert.ok(/class="acct-dot on" role="tab" aria-selected="true" data-acct-action="slide-go" data-slide-to="0"/.test(h));
  const cta = h.slice(h.indexOf('class="acct-cta"'));
  assert.ok(h.indexOf('class="acct-cta"') > h.indexOf('data-acct-slide="1"') && !h.slice(0, h.indexOf('class="acct-cta"')).includes("open-signup"));
  assert.deepStrictEqual([...cta.matchAll(/data-acct-action="([^"]+)">([^<]+)</g)].map((m) => [m[1], m[2]]), [["open-signup", "회원가입하고 시작하기"], ["open-join", "가족코드로 함께하기"], ["open-login", "이미 계정이 있어요 · 로그인"]]);
  assert.ok(!/가입 없이 둘러보기|이전 화면으로 돌아가기|data-acct-action="browse|beta-off-ask|browse-close/.test(h));
  assert.ok(/\.acct-cta \{[^}]*position: sticky; bottom: 0/.test(CSS) && /\.acct-slides \{[^}]*overflow-x: auto; scroll-snap-type: x mandatory/.test(CSS) && /\.acct-slide \{[^}]*scroll-snap-align: start/.test(CSS));
});
test("slideIndex: 스크롤 위치 → 장 번호(반올림·범위 고정), 폭 0이면 0", () => {
  assert.deepStrictEqual([AV.slideIndex(0, 390, 2), AV.slideIndex(194, 390, 2), AV.slideIndex(196, 390, 2), AV.slideIndex(390, 390, 2), AV.slideIndex(9999, 390, 2), AV.slideIndex(-5, 390, 2), AV.slideIndex(10, 0, 2)], [0, 0, 1, 1, 1, 0, 0]);
});
test("스와이프·점·키보드: 스크롤하면 점 표시가 바뀌고, 점을 누르면 그 장으로 이동, 좌우 화살표 키 지원", () => {
  const dots = [0, 1].map((n) => { const cls = new Set(n === 0 ? ["on"] : []); const attrs = { "data-slide-to": String(n), "aria-selected": n === 0 ? "true" : "false" }; return { getAttribute: (k) => attrs[k], setAttribute: (k, v) => (attrs[k] = v), classList: { toggle: (c, on) => (on ? cls.add(c) : cls.delete(c)), has: (c) => cls.has(c) }, attrs }; });
  const lst = {}; const sl = { scrollLeft: 0, clientWidth: 390, addEventListener: (t, f) => (lst[t] = f), scrollTo: ({ left }) => { sl.scrollLeft = left; lst.scroll(); } };
  const slot = { querySelector: () => sl, querySelectorAll: () => dots };
  const sb = { AccountView: AV, el: () => slot };
  vm.createContext(sb);
  const grab = (n) => { const i = APP.indexOf("  function " + n + "("); return APP.slice(i, APP.indexOf("\n  }\n", i) + 5); };
  vm.runInContext(["acctSlidesOf", "acctSyncDots", "acctGoSlide", "acctBindSlides"].map(grab).join("\n") + ";globalThis.__t = { acctBindSlides, acctGoSlide };", sb);
  sb.__t.acctBindSlides(slot);
  sl.scrollLeft = 390; lst.scroll();
  assert.deepStrictEqual([dots[0].classList.has("on"), dots[1].classList.has("on"), dots[1].attrs["aria-selected"]], [false, true, "true"]);
  sb.__t.acctGoSlide(slot, 0);
  assert.deepStrictEqual([sl.scrollLeft, dots[0].classList.has("on")], [0, true]);
  let prevented = 0; lst.keydown({ key: "ArrowRight", preventDefault: () => prevented++ });
  assert.deepStrictEqual([sl.scrollLeft, prevented], [390, 1]);
  lst.keydown({ key: "ArrowLeft", preventDefault() {} });
  assert.strictEqual(sl.scrollLeft, 0);
  lst.keydown({ key: "Enter", preventDefault: () => { throw new Error("무관한 키"); } });
  assert.ok(APP.includes('if (action === "slide-go") return acctGoSlide(el("acct-landing-slot")'));
});
test("OFF 첫 화면 불변: 새 마크업은 계정 모드(acctRenderLanding)에서만 만들어지고, index.html 의 옛 첫 화면·베타 카드 슬롯은 그대로", () => {
  assert.ok(/function acctRenderLanding\(\) \{\n    if \(!acctEnabled\(\)\) return;/.test(APP));
  const html = read("index.html");
  assert.ok(html.includes('id="beta-preview-slot"') && html.includes('data-stage="born"') && html.includes("아이 키우면서 챙겨야 할 모든 것") && !html.includes("acct-slide"));
});
console.log(`\n${passed}개 통과${process.exitCode ? ", 일부 실패" : ""}`);
