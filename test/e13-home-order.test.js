/*
 * E(1-3) 홈 섹션 순서 순수 함수. 실행: node test/e13-home-order.test.js
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const HNLogic = require("../js/hn-logic.js");
const V = require("../js/user-schedule-view.js");
const read = (f) => fs.readFileSync(path.join(__dirname, "..", f), "utf8");
const HO = require("../js/home-order.js");
let passed = 0;
function test(name, fn) { try { fn(); passed++; console.log("  ok  - " + name); } catch (e) { process.exitCode = 1; console.log("  FAIL- " + name + "\n      " + (e.stack || e).split("\n").slice(0, 5).join("\n      ")); } }
const TODO = ["todo", "family"], FAM = ["family", "todo"];
const AS = new Date(2026, 9, 2);
const kid = (iso, stage) => ({ birthDate: iso, ...(stage ? { stage } : {}) });

test("가장 어린 아이 36개월 미만 → 챙길 것 먼저 / 36개월 이상 → 우리 가족 먼저(경계: 만 36개월 되는 날부터)", () => {
  assert.deepStrictEqual(HO.homeSectionOrder({ children: [kid("2026-01-02")], asOf: AS }), TODO);
  assert.deepStrictEqual(HO.homeSectionOrder({ children: [kid("2023-10-03")], asOf: AS }), TODO, "35개월 30일");
  assert.deepStrictEqual(HO.homeSectionOrder({ children: [kid("2023-10-02")], asOf: AS }), FAM, "정확히 36개월");
  assert.deepStrictEqual(HO.homeSectionOrder({ children: [kid("2019-05-05")], asOf: AS }), FAM);
});
test("여러 명이면 가장 어린 아이 기준(어린 아이가 36개월 미만이면 챙길 것 먼저)", () => {
  assert.deepStrictEqual(HO.homeSectionOrder({ children: [kid("2018-03-01"), kid("2025-12-01")], asOf: AS }), TODO);
  assert.deepStrictEqual(HO.homeSectionOrder({ children: [kid("2018-03-01"), kid("2022-01-01")], asOf: AS }), FAM);
});
test("임신 중(pregnant 플래그 또는 stage)·아이 없음·날짜를 읽을 수 없음 → 챙길 것 먼저", () => {
  assert.deepStrictEqual(HO.homeSectionOrder({ children: [kid("2018-03-01")], pregnant: true, asOf: AS }), TODO);
  assert.deepStrictEqual(HO.homeSectionOrder({ children: [kid("2018-03-01"), kid("2027-02-01", "pregnant")], asOf: AS }), TODO);
  for (const c of [[], undefined, null, [null], [{ birthDate: "x" }], [{}]]) assert.deepStrictEqual(HO.homeSectionOrder({ children: c, asOf: AS }), TODO, JSON.stringify(c));
  assert.deepStrictEqual(HO.homeSectionOrder(), TODO);
});
test("Date·ISO 입력 모두 지원, asOf 생략은 오늘, 반환은 새 배열(공유 상수 변경 불가)", () => {
  assert.deepStrictEqual(HO.homeSectionOrder({ children: [{ birthDate: new Date(2019, 4, 5) }], asOf: "2026-10-02" }), FAM);
  assert.deepStrictEqual(HO.homeSectionOrder({ children: [{ birthDate: new Date() }] }), TODO);
  const a = HO.homeSectionOrder({ children: [] }); a.push("x");
  assert.deepStrictEqual(HO.homeSectionOrder({ children: [] }), TODO);
});
test("개월 계산: 일자가 안 찼으면 한 달 덜, 미래 생일은 0", () => {
  assert.strictEqual(HO.monthsBetween(new Date(2026, 0, 31), new Date(2026, 1, 28)), 0);
  assert.strictEqual(HO.monthsBetween(new Date(2026, 0, 2), new Date(2026, 9, 2)), 9);
  assert.strictEqual(HO.monthsBetween(new Date(2027, 0, 2), AS), 0);
  assert.strictEqual(HO.THRESHOLD_MONTHS, 36);
});

console.log("home.js·app.js 연결");
function renderHome(extra) {
  const out = { html: null, usArgs: [] };
  const wrap = { set innerHTML(v) { out.html = v; }, get innerHTML() { return out.html; }, querySelectorAll: () => [] };
  const sb = { HNLogic, document: { getElementById: (id) => (id === "home-body" ? wrap : null) }, window: {} };
  vm.createContext(sb);
  vm.runInContext(read("js/home.js"), sb);
  const esc = (x) => String(x).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const ev = (id, title, cat) => ({ id, title, category: cat, scheduleKind: "window", windowStart: new Date(2026, 9, 1), windowEnd: new Date(2026, 9, 20) });
  sb.window.HNHome.render({
    profile: { birthDate: new Date(2026, 5, 20) }, completed: {}, today: new Date(2026, 9, 5), pregnant: false, ageNow: 3, events: [ev("a", "접종", "예방접종"), ev("b", "생활 점검", "생활")],
    CATEGORY_META: { 예방접종: { label: "접종", color: "#111" }, 생활: { label: "생활", color: "#222" } },
    esc, formatDateKR: () => "10월 1일", calGroupFor: () => ({ color: "#333" }), kindTagHtml: () => "", monthKeysOf: () => [3], periodRangeOf: () => null, periodGroupLabel: () => "기간", monthPeriodText: () => "3~5개월",
    bindOpen() {}, openTodos() {}, switchTab() {}, goCalendar() {}, showModal() {}, ...extra(out),
  });
  return out;
}
const CARD = (o) => `<section class="home-sec sec-us-upcoming">CARD${o && o.family ? "-FAMILY" : ""}</section>`;
test("homeOrder 없음(OFF·가구 없음)이면 이전과 같은 순서(가족 카드가 맨 앞), 카드가 비어 있으면 순서와 무관하게 HTML 동일", () => {
  const legacy = renderHome((o) => ({ usUpcomingHtml: (a) => { o.usArgs.push(a); return CARD(); } }));
  assert.ok(legacy.html.indexOf("CARD") < legacy.html.indexOf("sec-today") && legacy.usArgs[0] === undefined);
  const none = renderHome(() => ({}));
  for (const order of [["todo", "family"], ["family", "todo"], null]) {
    const r = renderHome(() => ({ usUpcomingHtml: () => "", homeOrder: () => order }));
    assert.strictEqual(r.html, none.html, JSON.stringify(order));
  }
});
test("['todo','family']: 이번 달 챙길 것 섹션이 먼저, 가족 카드는 그 바로 아래(나머지 섹션 앞) · ['family','todo']: 가족 카드 먼저(제목 옵션 family:true)", () => {
  const t = renderHome((o) => ({ usUpcomingHtml: (a) => { o.usArgs.push(a); return CARD(a); }, homeOrder: () => ["todo", "family"] }));
  const iT = t.html.indexOf("sec-today"), iC = t.html.indexOf("CARD"), iS = t.html.indexOf("sec-subsidy");
  assert.ok(iT > 0 && iT < iC && iC < iS && !t.html.includes("CARD-FAMILY"), "챙길 것 → 카드 → 혜택");
  assert.deepStrictEqual(JSON.parse(JSON.stringify(t.usArgs)), [{ family: false }]);
  const f = renderHome((o) => ({ usUpcomingHtml: (a) => { o.usArgs.push(a); return CARD(a); }, homeOrder: () => ["family", "todo"] }));
  assert.ok(f.html.indexOf("CARD-FAMILY") < f.html.indexOf("sec-today"));
  assert.deepStrictEqual(JSON.parse(JSON.stringify(f.usArgs)), [{ family: true }]);
  const body = (h) => h.replace(/<section class="home-sec sec-us-upcoming">CARD(-FAMILY)?<\/section>/, "");
  assert.strictEqual(body(t.html), body(f.html), "카드를 빼면 두 순서의 나머지 내용이 같다(내용 불변)");
});
test("카드 제목: family:true 면 '오늘·이번 주 우리 가족', 아니면 기존 '다가오는 우리 가족 일정'(담당자 태그는 항목 줄에 그대로)", () => {
  const items = { items: [{ key: "k", scheduleId: "s", date: "2026-10-05", title: "병원", whenText: "오늘", timeText: "오전 9:00", tag: "엄마 담당", color: "#c9b8ff" }], more: 0 };
  assert.ok(V.renderUpcomingCard(items, { family: true }).includes("오늘·이번 주 우리 가족") && V.renderUpcomingCard(items, { family: true }).includes("엄마 담당"));
  assert.ok(V.renderUpcomingCard(items).includes("다가오는 우리 가족 일정") && !V.renderUpcomingCard(items).includes("오늘·이번 주"));
  assert.ok(V.renderUpcomingCard({ items: [], more: 0 }, { family: true }).includes("오늘·이번 주 우리 가족"), "빈 상태도 같은 제목");
});
test("app.js: homeOrder 는 usActive 일 때만(아니면 null), 생년월일 기억은 가구 플래그가 켜졌을 때만, index.html·sw.js 에 스크립트 순서·등록", () => {
  const app = read("js/app.js");
  assert.ok(app.includes('homeOrder: () => (usActive() && typeof HomeOrder !== "undefined" ? HomeOrder.homeSectionOrder({ children: homeKids(), pregnant: isPregnant(), asOf: new Date() }) : null),'));
  assert.ok(/function rememberChildBirth\(\) \{\n    if \(!hhEnabled\(\) \|\| !familyCode \|\| !profile \|\| isPregnant\(\)\) return;/.test(app));
  assert.ok(/rememberChild\(\);\n    rememberChildBirth\(\);/.test(app));
  const a = app.indexOf("  function homeKids() {");
  const src = app.slice(a, app.indexOf("\n  }\n", a) + 5);
  const run = (st) => { const sb = { CHILD_BIRTHS_KEY: "hannun_child_births", localStorage: { getItem: (k) => (k === "hannun_child_births" ? JSON.stringify(st.births) : null) }, loadChildren: () => st.list, familyCode: st.cur, profile: st.profile, isPregnant: () => !!st.preg, JSON }; vm.createContext(sb); vm.runInContext(src + ";globalThis.r = homeKids();", sb); return JSON.parse(JSON.stringify(sb.r)); };
  assert.deepStrictEqual(run({ births: { A: "2018-03-01", B: "2025-12-01" }, list: [{ code: "A", stage: "born" }, { code: "B", stage: "born" }, { code: "C", stage: "pregnant" }], cur: "B", profile: { birthDate: "2025-12-01" } }),
    [{ birthDate: "2018-03-01", stage: "born" }, { stage: "pregnant" }, { birthDate: "2025-12-01", stage: "born" }]);
  const html = read("index.html");
  assert.ok(html.indexOf("js/home-order.js") > 0 && html.indexOf("js/home-order.js") < html.indexOf("js/app.js") && read("sw.js").includes('"./js/home-order.js"'));
});
console.log(`\n${passed}개 통과${process.exitCode ? ", 일부 실패" : ""}`);
