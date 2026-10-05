/* v1.12.97: 온보딩·홈 새 디자인(인디고)은 온보딩(첫 화면·로그인·가입·아이 정보)과 홈 범위에만 있고, 앱 전역 슬롯은 그대로다. 실행: node --test test/k10-onboarding-home-design.test.js */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const CSS = fs.readFileSync(path.join(ROOT, "css/style.css"), "utf8");
const MARK = "/* ═══ v1.12.97 온보딩·홈 새 디자인";
const i = CSS.indexOf(MARK);
const BLOCK = CSS.slice(i);
const rules = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "").split("}").map((r) => r.trim()).filter(Boolean).map((r) => { const k = r.indexOf("{"); return [r.slice(0, k).trim(), r.slice(k + 1)]; });

test("블록이 있고 마지막에 붙어 있다", () => { assert.ok(i > 0); assert.ok(CSS.indexOf(MARK, i + 1) < 0); });

test("앱 전역 슬롯(:root 의 --c-primary·--accent·--c-active 등)은 인디고로 바뀌지 않았다", () => {
  const root = CSS.slice(0, CSS.indexOf("\n}\n"));
  assert.ok(/--c-primary:\s*#ff6a1a/.test(root) && /--accent:\s*#ff6a1a/.test(root) && /--c-active:\s*#24252a/.test(root));
  assert.ok(!/#4a45c8/i.test(CSS.slice(0, i)), "인디고는 이 블록 밖(기존 CSS)에 없다");
});

test("새 규칙의 선택자는 모두 온보딩·홈 범위다(다른 화면 규칙 없음)", () => {
  const OK = /^(:root$|\.modal-panel:has\(\.(us-form|as-steps|acct-prof-head)\)|body\.acct-design \.modal-panel:has\(\.as-steps\)|body:has\(#view-landing\.acct-on|#view-landing\.acct-on|\.modal-panel:has\(\[data-acct-form="(login|signup)"\]\)|\.modal-panel:has\(\[data-acct-child-sheet\]\)|body\.acct-design \.modal-panel:has\(\[data-acct-child-sheet\]\)|\.modal-panel:has\(#ep-save\)|body:has\(#view-calendar:not\(\.hidden\) :is\(#tab-home, #empty-panel\)|#view-calendar:has\(:is\(#tab-home, #empty-panel\)|:is\(#tab-home, #empty-panel\)|body\.acct-design :is\(#tab-home, #empty-panel\))/;
  for (const [sel] of rules(BLOCK.slice(BLOCK.indexOf("}") + 1))) {
    sel.split(/,(?![^()]*\))/).forEach((s) => assert.ok(OK.test(s.trim()), "범위 밖 선택자: " + s.trim()));
  }
});

test("인디고·와인 등 새 색 hex 는 :root 의 --nd-* 정의에만 있다(규칙에서는 변수로 쓴다)", () => {
  const body = BLOCK.slice(BLOCK.indexOf("}") + 1);
  for (const hex of ["#4a45c8", "#8a1c3d", "#f0f1ff", "#d8d6ff", "#fff0bd", "#f9cb34", "#e4dcee", "#f7f3fa", "#fff8e0", "#7a55c9", "#061665"]) assert.ok(!body.toLowerCase().includes(hex), hex + " 는 변수로");
  const root = BLOCK.slice(0, BLOCK.indexOf("}"));
  for (const hex of ["#4a45c8", "#8a1c3d", "#f0f1ff", "#d8d6ff", "#fff0bd", "#f9cb34", "#e4dcee", "#f7f3fa", "#fff8e0", "#7a55c9", "#061665"]) assert.ok(root.toLowerCase().includes(hex), hex);
});

test("대비: 인디고·보라·남색 위 흰 글자 4.5:1 이상, 차콜·검정 글자는 노랑·라벤더 위에서 읽힌다", () => {
  const L = (h) => { const c = [1, 3, 5].map((k) => parseInt(h.slice(k, k + 2), 16) / 255).map((x) => (x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4))); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  const cr = (a, b) => { const [x, y] = [L(a), L(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  for (const bg of ["#4a45c8", "#7a55c9", "#061665"]) assert.ok(cr("#ffffff", bg) >= 4.5, bg);
  for (const [fg, bg] of [["#161618", "#d8d6ff"], ["#24252a", "#fff0bd"], ["#000000", "#fff0bd"], ["#24252a", "#f0f1ff"]]) assert.ok(cr(fg, bg) >= 4.5, fg + bg);
});

test("마크업·동작은 그대로: 로그인·가입 버튼 액션, 가입 단계 진행 막대 요소, 홈 배너 요소가 같다", () => {
  const av = fs.readFileSync(path.join(ROOT, "js/account-view.js"), "utf8");
  assert.ok(av.includes('data-acct-action="open-login"') && av.includes('data-acct-action="open-signup"') && av.includes('class="acct-prog-seg'));
  const ns = fs.readFileSync(path.join(ROOT, "js/next-stage.js"), "utf8");
  assert.ok(ns.includes("ns-banner"));
});
