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

test("G11 1장: 타이틀 2줄, 칩 아빠·엄마·세현·수아(가족 없음)·사람별 색, 요일줄·날짜 14칸(오늘 표시), 일정 5개(라벨 접종·검진·지원금 3색), 예시 표기. 2장: 브랜드+회색 서브문구+기능 5개", () => {
  const h = AV.renderLanding({});
  const s0 = h.slice(h.indexOf('data-acct-slide="0"'), h.indexOf('data-acct-slide="1"'));
  const s1 = h.slice(h.indexOf('data-acct-slide="1"'), h.indexOf('class="acct-dots"'));
  assert.ok(s0.includes("우리 가족 일정,<br>한눈에") && s0.includes("접종·지원금·가족 약속까지 한 달력에") && !s0.includes("예시 화면이에요") && !s0.includes("엄마 회식"));
  const chips = [...s0.matchAll(/<span style="background:(#[0-9a-f]{6})">([^<]+)<\/span>/g)].map((m) => [m[2], m[1]]);
  assert.deepStrictEqual(chips, [["아빠", "#7fb8ff"], ["엄마", "#ff9ec4"], ["세현", "#ffc46b"], ["수아", "#7fe0b3"]]);
  assert.strictEqual((s0.match(/<div( class="t")?>\d+/g) || []).length, 14);
  assert.ok(s0.includes('class="acct-ob1-wk"') && s0.includes('<div class="t">7</div>'));
  const evs = s0.slice(s0.indexOf('class="acct-ob1-ev"'));
  assert.strictEqual((evs.match(/<div><i /g) || []).length, 5);
  assert.deepStrictEqual([...evs.matchAll(/<em class="(\w+)">([^<]+)<\/em>/g)].map((m) => [m[1], m[2]]), [["vx", "접종"], ["hc", "검진"], ["sb", "지원금"]]);
  assert.ok(["10/6 수아 ", "10/8 아빠 하원 픽업", "10/10 세현 어린이집 발표회", "영유아 검진", "아동수당 지급"].every((t) => evs.includes(t)));
  assert.ok(/\.acct-ob1-ev \{ margin-top: 16px/.test(CSS));
  assert.ok(s1.includes('class="acct-brand">한눈육아') && s1.includes("이것저것 흩어져 챙기기 어려웠다면,<br>한눈육아에서 한방에 꼼꼼히 챙겨줘요") && !s1.includes("우리 가족 일정, 한눈에"));
  assert.deepStrictEqual([...s1.matchAll(/<b>([^<]+)<\/b>/g)].map((m) => m[1]), ["육아 일정 자동 챙김", "지원금·혜택 챙김", "육아 일정 관리", "가족 일정 공유", "집 근처 갈 만한 곳 추천"]);
  assert.ok(s1.includes("우리 지역 지원금 신청 기한까지 챙겨요") && /\.acct-lead \{ margin: 8px 0 34px/.test(CSS));
});
test("점 2개(첫 장 선택)·버튼은 두 장 공통으로 슬라이드 밖 아래(고정): 주 버튼 [로그인], 아래 [회원가입], 회색 안내 한 줄. [가족코드로 함께하기]·'이미 계정이 있어요' 줄·둘러보기 없음", () => {
  const h = AV.renderLanding({});
  assert.deepStrictEqual([...h.matchAll(/data-slide-to="(\d)"/g)].map((m) => m[1]), ["0", "1"]);
  assert.ok(/class="acct-dot on" role="tab" aria-selected="true" data-acct-action="slide-go" data-slide-to="0"/.test(h));
  const cta = h.slice(h.indexOf('class="acct-cta"'));
  assert.ok(h.indexOf('class="acct-cta"') > h.indexOf('data-acct-slide="1"') && !h.slice(0, h.indexOf('class="acct-cta"')).includes("open-signup"));
  assert.deepStrictEqual([...cta.matchAll(/data-acct-action="([^"]+)">([^<]+)</g)].map((m) => [m[1], m[2]]), [["open-login", "로그인"], ["open-signup", "회원가입"]]);
  assert.ok(cta.includes('class="acct-btn-text" data-acct-action="open-signup"') && /\.acct-btn-text \{[^}]*min-height: 48px[^}]*border: 0[^}]*background: transparent[^}]*font-weight: 400/.test(CSS));
  assert.ok(cta.includes('class="acct-code-hint">가족코드를 받았다면 회원가입에서 입력해요'));
  assert.ok(!/open-join|가족코드로 함께하기|이미 계정이 있어요|가입 없이 둘러보기|이전 화면으로 돌아가기|data-acct-action="browse|beta-off-ask|browse-close/.test(h));
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
