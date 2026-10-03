/* G13-3 계정 모드 홈: 맨 위 프로필 카드=나, 가족 일정 먼저 → 아이별 챙길 것(아이 여러 명이면 아이 칩) → 신청 가능한 혜택. OFF 홈은 그대로. 실행: node test/g13e-account-home.test.js */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const HNLogic = require("../js/hn-logic.js");
const read = (f) => fs.readFileSync(path.join(__dirname, "..", f), "utf8");
const HOME = read("js/home.js"), APP = read("js/app.js"), CSS = read("css/style.css"), HTML = read("index.html");
let passed = 0;
function test(name, fn) { try { fn(); passed++; console.log("  ok  - " + name); } catch (e) { process.exitCode = 1; console.log("  FAIL- " + name + "\n      " + (e.stack || e).split("\n").slice(0, 4).join("\n      ")); } }
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
function run(extra) {
  const out = { html: null, clicks: [] };
  const nodes = [];
  const wrap = { set innerHTML(v) { out.html = v; }, get innerHTML() { return out.html; }, querySelectorAll: (sel) => (sel === "[data-home-child]" ? [...(out.html || "").matchAll(/data-home-child="([^"]+)"/g)].map((m) => ({ dataset: { homeChild: m[1] }, addEventListener: (t, f) => nodes.push([m[1], f]) })) : []) };
  const sb = { HNLogic, document: { getElementById: (id) => (id === "home-body" ? wrap : null) }, window: {} };
  vm.createContext(sb);
  vm.runInContext(HOME, sb);
  const ev = (id, title, cat) => ({ id, title, category: cat, scheduleKind: "window", windowStart: new Date(2026, 9, 1), windowEnd: new Date(2026, 9, 20) });
  sb.window.HNHome.render({
    profile: { birthDate: new Date(2026, 5, 20) }, completed: {}, today: new Date(2026, 9, 5), pregnant: false, ageNow: 3, events: [ev("a", "DTaP 접종", "예방접종"), ev("b", "생활 점검", "생활")],
    CATEGORY_META: { 예방접종: { label: "접종", color: "#111" }, 생활: { label: "생활", color: "#222" } },
    esc, formatDateKR: () => "10월 1일", calGroupFor: () => ({ color: "#333" }), kindTagHtml: () => "", monthKeysOf: () => [3], periodRangeOf: () => null, periodGroupLabel: () => "기간", monthPeriodText: () => "3~5개월",
    usUpcomingHtml: (o) => `<section class="home-sec sec-us-upcoming" data-family="${o && o.family}">FAMILY</section>`, homeOrder: () => ["todo", "family"],
    bindOpen() {}, openTodos() {}, switchTab() {}, goCalendar() {}, showModal() {}, ...extra,
  });
  return { html: out.html, nodes };
}
const pos = (h, s) => h.indexOf(s);
test("OFF·기존 홈: accountHome 이 없으면 순서·내용은 그대로(36개월 미만이면 챙길 것이 먼저, 아이 칩·아이 줄 없음)", () => {
  const h = run({}).html;
  assert.ok(pos(h, "sec-today") < pos(h, "sec-us-upcoming") && !h.includes("home-child") && h.includes('data-family="false"'));
});
test("계정 모드 홈: 가족 일정('오늘·이번 주 우리 가족')이 맨 먼저, 그다음 아이 챙길 것(아이 한 줄), 그다음 혜택", () => {
  const h = run({ accountHome: true, homeChildText: "은찬 · 생후 3개월", homeChildren: [{ code: "KID111", name: "은찬", current: true }] }).html;
  assert.ok(h.includes('data-family="true"'));
  assert.ok(pos(h, "sec-us-upcoming") < pos(h, "sec-today") && pos(h, "sec-today") < pos(h, "sec-subsidy"));
  assert.ok(h.includes('<p class="home-child-line">은찬 · 생후 3개월</p>') && !h.includes("home-child-chips"), "아이 한 명이면 칩 없음");
  assert.ok(pos(h, "home-child-line") > pos(h, "sec-today") && pos(h, "home-child-line") < pos(h, "cat-line"));
});
test("아이가 여러 명이면 아이 칩(지금 아이 선택됨), 누르면 switchChild(코드) — 지금 아이를 다시 누르면 앱이 무시", () => {
  const calls = [];
  const r = run({ accountHome: true, homeChildText: "은찬 · 생후 3개월", homeChildren: [{ code: "KID111", name: "은찬", current: true }, { code: "KID222", name: "서윤", current: false }], switchChild: (c) => calls.push(c) });
  assert.ok(/home-child-chip active" data-home-child="KID111">은찬/.test(r.html) && /home-child-chip" data-home-child="KID222">서윤/.test(r.html) && r.html.includes('role="tablist"'));
  r.nodes.find(([c]) => c === "KID222")[1]();
  assert.deepStrictEqual(calls, ["KID222"]);
});
test("앱: 프로필 카드는 '나'(이름 · 나(역할), 사람 아이콘) — 별도 내 이름 줄 삭제, 아이 정보는 홈 챙길 것 머리, 로그인 전·OFF 는 그대로", () => {
  const i = APP.indexOf("  function acctRenderMeLine() {");
  const fnSrc = APP.slice(i, APP.indexOf("\n  }\n", i));
  assert.ok(fnSrc.includes("old.remove()") && fnSrc.includes('card.classList.toggle("acct-me", !!id)') && fnSrc.indexOf("if (!id) return;") < fnSrc.indexOf("strong.textContent"));
  assert.ok(fnSrc.includes("PERSON_ICON_SVG") && !fnSrc.includes("createElement"));
  assert.ok(/\.\.\.\(acctEnabled\(\) && acct\.user \? \{ accountHome: true, homeChildText: acctHomeChildText\(\), homeChildren: acctHomeChildren\(\), switchChild:/.test(APP));
  assert.ok(APP.includes("openProfile: showProfileSheet") && HTML.includes('id="btn-profile-card"'));
});
test("CSS·버전: 나 카드 아바타 색, 아이 칩·한 줄 스타일", () => {
  assert.ok(/\.profile-card\.acct-me \.avatar \{/.test(CSS) && /\.home-child-chip\.active \{/.test(CSS) && /\.home-child-line \{/.test(CSS));
  assert.ok(/home\.js\?v=26/.test(HTML));
});
console.log(`\n${passed}개 통과`);
