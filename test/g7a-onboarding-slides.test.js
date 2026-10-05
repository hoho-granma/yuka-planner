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
  assert.ok(s0.includes('육아하며 시기마다 필요한 것,<br><mark class="acct-hl">한눈에</mark>') && s0.includes("접종·검진·지원금부터 학교 준비까지.<br>지금 우리 아이에게 필요한 것을 먼저 챙겨드려요.") && !s0.includes("예시 화면이에요"));
  assert.ok(!s0.includes("acct-ob1-cal") && !s0.includes("사는 지역에 맞춰") && !/ob1(People|Days|Events|Weekdays)/.test(read("js/account-view.js")), "달력 미리보기·지역 문장·옛 상수 없음");
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
  assert.ok(cta.indexOf("open-login") < cta.indexOf("open-signup"), "[로그인][회원가입] 순서");
  assert.deepStrictEqual([...cta.matchAll(/data-acct-action="([^"]+)">([^<]+)</g)].map((m) => [m[1], m[2]]), [["open-login", "로그인"], ["open-signup", "회원가입"]]);
  assert.ok(cta.includes('class="acct-btn-text" data-acct-action="open-signup"') && /\.acct-btn-text \{[^}]*min-height: 48px[^}]*border: 0[^}]*background: transparent[^}]*font-weight: 400/.test(CSS));
  assert.ok(cta.includes('class="acct-code-hint">가족코드를 받았다면 회원가입에서 입력해요'));
  assert.ok(!/open-join|가족코드로 함께하기|이미 계정이 있어요|가입 없이 둘러보기|이전 화면으로 돌아가기|data-acct-action="browse|beta-off-ask|browse-close/.test(h));
  assert.ok(/\.acct-cta \{[^}]*position: sticky; bottom: 0/.test(CSS) && /\.acct-slides \{[^}]*overflow-x: auto; scroll-snap-type: x mandatory/.test(CSS) && /\.acct-slide \{[^}]*scroll-snap-align: start/.test(CSS));
});
test("D41 온보딩 첫 화면: 로고 왼쪽 위 32px·원 2개 변수색(196/116px)·글자 블록 가운데·CTA 테두리 없음·로그인↔회원가입 전환 링크", () => {
  const root = CSS.slice(CSS.indexOf(":root"), CSS.indexOf("}", CSS.indexOf("--nd-ob-bg")));
  assert.ok(/--nd-ob-bg: #ffffff/.test(root) && /--nd-ob-circle1: #1f6f4a/.test(root) && /--nd-ob-circle2: #a85a1a/.test(root));
  const blk = CSS.slice(CSS.indexOf('#view-landing.acct-on .acct-slide[data-acct-slide="0"]'), CSS.indexOf("/* ── 온보딩 ③"));
  assert.ok(/::before \{[^}]*width: 196px[^}]*var\(--nd-ob-circle1\)/.test(blk) && /::after \{[^}]*left: -46px[^}]*bottom: 6px[^}]*width: 116px[^}]*var\(--nd-ob-circle2\)/.test(blk));
  assert.ok(!/#[0-9a-fA-F]{6}\b/.test(blk.replace(/background: #fff;/g, "")), "블록 안 직접 hex 없음");
  assert.ok(/\.acct-logo-w \{[^}]*position: absolute; left: 18px; top: 20px[^}]*font-size: 32px; font-weight: 900; letter-spacing: -\.8px/.test(blk));
  assert.ok(/\.acct-ob1-top \{[^}]*flex: 1 1 auto[^}]*justify-content: center; align-items: center; text-align: center; padding: 0 24px/.test(blk));
  assert.ok(/\.acct-cta \{[^}]*border: 0/.test(blk) && /open-login"\] \{[^}]*min-height: 52px[^}]*var\(--nd-indigo\)/.test(blk) && /open-signup"\] \{[^}]*min-height: 48px[^}]*background: transparent/.test(blk));
  const lg = AV.renderLogin({}), su = AV.renderSignup({ form: {} });
  assert.ok(lg.includes('class="acct-link ob-switch" data-acct-action="open-signup">처음이세요? 회원가입') && lg.indexOf("ob-switch") < lg.indexOf('data-acct-action="close"'));
  assert.ok(su.includes('class="acct-link ob-switch" data-acct-action="open-login">이미 계정이 있어요 · 로그인') && su.indexOf("ob-switch") < su.indexOf("acct-step-foot"));
  assert.ok(!AV.renderSignup({ form: { step: 2 } }).includes("ob-switch"), "2단계 이후엔 전환 링크 없음");
});
test("D41 폼 시트 회귀 방지: 시트(.modal)가 첫 화면 카피 층보다 위·시트 면 불투명·폼 안에 카피 없음·D47 가운데 카드 + 아래·위 정렬 아님", () => {
  const z = (re) => Number((re.exec(CSS) || [])[1]);
  const landingMax = Math.max(2, ...[...CSS.matchAll(/\.acct-ob1-top[^{]*\{[^}]*z-index: (\d+)/g)].map((m) => Number(m[1])));
  assert.ok(z(/\.modal \{[^}]*z-index: (\d+)/) > landingMax, "① .modal z-index > 첫 화면 머리 자손 최대 z-index");
  assert.ok(/^\.modal-panel \{[^}]*background: #fff;/m.test(CSS) && [...CSS.matchAll(/--nd-soft: (#[0-9a-fA-F]{6});/g)].length >= 2, "② 시트 면은 알파 없는 불투명 색");
  for (const h of [AV.renderLogin({}), AV.renderSignup({ form: {} }), AV.renderSignup({ form: { step: 2 } }), AV.renderSignup({ form: { step: 3 } })]) assert.ok(!h.includes("육아하며") && !h.includes("acct-ob1-top"), "③ 폼 마크업에 카피 없음");
  assert.ok(/^\.modal-panel \{[^}]*bottom: 0/m.test(CSS), "④ 다른 시트는 아래 정렬 그대로");
  assert.ok(/\.modal-panel:has\(\[data-acct-form="login"\]\), \.modal-panel:has\(\[data-acct-form="signup"\]\) \{ top: 50%; left: 50%; right: auto; bottom: auto; transform: translate\(-50%, -50%\); width: calc\(100% - 32px\); max-width: 480px; max-height: calc\(100dvh - 32px\); border-radius: 20px; overflow-y: auto; \}/.test(CSS), "D47 로그인·가입 = 가운데 카드(내부 스크롤)");
  assert.ok(/\.acct-btn-primary \{[^}]*box-shadow: none;/.test(CSS) && !/\.acct-btn-primary \{[^}]*rgba\(255, 106, 26/.test(CSS), "D48 가입 '다음' 등 계정 주 버튼 뒤 붉은 그림자 없음");
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
test("G12 높이 대응: 온보딩 화면은 화면 높이에 맞추고(버튼 영역 맨 아래 고정·스크롤 없음), 높이 단계별(760/700/620/600)로 위 콘텐츠를 줄이고 일정 목록 5→4→3개", () => {
  assert.ok(/#app:has\(> #view-landing\.acct-simple:not\(\.hidden\)\) \{[^}]*height: 100dvh[^}]*overflow: hidden/.test(CSS));
  assert.ok(/#view-landing\.acct-simple \.acct-cta \{ flex: none; position: static; \}/.test(CSS));
  for (const h of [760, 700, 620, 600]) assert.ok(CSS.includes(`@media (max-height: ${h}px)`), String(h));
  assert.ok(/max-height: 700px\)[\s\S]*nth-child\(n\+5\)[\s\S]*max-height: 620px\)[\s\S]*nth-child\(n\+4\)/.test(CSS.slice(CSS.indexOf("/* G12:"))));
});
console.log(`\n${passed}개 통과${process.exitCode ? ", 일부 실패" : ""}`);
