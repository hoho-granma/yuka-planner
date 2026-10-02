/*
 * 월·주 달력 칸 넘침 방지: 긴 자동 제목이 열을 늘려 달력이 영역을 벗어나던 버그(칩 모드 '카테고리색 OFF'에서만 발생)의 재발 방지.
 * ① CSS 규칙 존재(항상 실행) ② 로컬 헤드리스 Chrome 으로 실제 css/style.css 를 렌더해 DOM 측정(브라우저가 없으면 ②만 건너뛴다고 출력).
 *   폭 360/390/430 × (월 보기: 구성원색·아이색·카테고리색 / 주 보기) × 긴 자동·직접 제목. 검사: 셀·그리드 scrollWidth<=clientWidth, 그리드가 컨테이너 안, 7열 폭 균등, 페이지 가로 스크롤 없음.
 * 실행: node test/cal-overflow.test.js
 */
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const cp = require("child_process");
const V = require("../js/user-schedule-view.js");
const W = require("../js/calendar-week.js");
const ROOT = path.join(__dirname, "..");
const CSS_PATH = path.join(ROOT, "css/style.css");
const CSS = fs.readFileSync(CSS_PATH, "utf8");

let passed = 0, skipped = 0;
function test(name, fn) {
  try { const r = fn(); if (r === "skip") { skipped++; console.log("  skip- " + name); } else { passed++; console.log("  ok  - " + name); } } catch (e) { process.exitCode = 1; console.log("  FAIL- " + name + "\n      " + (e.stack || e).split("\n").slice(0, 8).join("\n      ")); }
}
const rule = (sel) => { const m = CSS.match(new RegExp("(^|\\n)" + sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*\\{([^}]*)\\}")); return m ? m[2] : ""; };

console.log("CSS 규칙");
test("월 그리드·요일 헤더는 minmax(0,1fr) 7열(내용 폭으로 열이 늘지 않는다)", () => {
  for (const s of [".calendar-weekdays", ".calendar-grid"]) assert.ok(/grid-template-columns:\s*repeat\(7,\s*minmax\(0,\s*1fr\)\)/.test(rule(s)), s);
  assert.ok(!/repeat\(7,\s*1fr\)/.test(CSS.slice(CSS.indexOf(".calendar-weekdays"), CSS.indexOf(".calendar-weekdays") + 400)), "옛 repeat(7, 1fr) 가 남아 있다");
});
test("날짜 칸·주 열·칩은 열 폭을 못 넓힌다(min-width:0 + overflow hidden)", () => {
  assert.ok(/min-width:\s*0/.test(rule(".day-cell")) && /overflow:\s*hidden/.test(rule(".day-cell")), ".day-cell");
  assert.ok(/min-width:\s*0/.test(rule(".week-col")) && /overflow:\s*hidden/.test(rule(".week-col")), ".week-col");
  assert.ok(/min-width:\s*0/.test(rule(".calendar-grid-v2 .markers.chips")), ".markers.chips");
  assert.ok(/min-width:\s*0/.test(rule(".cal-chip")) && /text-overflow:\s*ellipsis/.test(rule(".cal-chip")), ".cal-chip");
});

console.log("헤드리스 렌더 측정");
const BROWSERS = [
  ...(() => { const d = path.join(os.homedir(), "Library/Caches/ms-playwright"); try { return fs.readdirSync(d).filter((n) => n.startsWith("chromium_headless_shell")).map((n) => { const b = path.join(d, n); const sub = fs.readdirSync(b).find((x) => x.startsWith("chrome-headless-shell")); return sub ? path.join(b, sub, "chrome-headless-shell") : null; }).filter(Boolean); } catch (e) { return []; } })(),
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/chromium", "/usr/bin/google-chrome",
].filter((p) => fs.existsSync(p));

const AUTO_TITLES = ["영유아 건강검진 4차(30~36개월)", "B형간염 3차 접종(생후 6개월 전후)", "디프테리아·파상풍·백일해·폴리오 추가접종", "첫만남이용권(출산 후 60일 이내 신청)"];
const USER_TITLES = ["소아과 정기 진료 예약 및 예방접종 상담", "어린이집 상담"];
const LINKS = [{ childKey: "c1", displayName: "수아", order: 1 }];
function monthCells(mode, catColor) {
  const cells = [];
  for (let i = 0; i < 35; i++) {
    const items = [];
    if (i % 3 !== 1) items.push({ t: "a", title: AUTO_TITLES[i % AUTO_TITLES.length], category: ["VACCINE", "CHECKUP", "BENEFIT", "DEVELOP"][i % 4], done: false });
    if (i % 2 === 0) items.unshift({ t: "u", occ: { title: USER_TITLES[i % 2], scope: "CHILD", childKeys: ["c1"], assigneeRole: i % 4 === 0 ? "MOM" : "DAD", category: "HOSPITAL" } });
    if (i % 5 === 0) items.push({ t: "a", title: AUTO_TITLES[(i + 1) % 4], category: "CHECKUP", done: true });
    const chips = items.length ? V.cellChips(items, { links: LINKS, mode, catColor, autoColor: "#ff9ec4" }) : "";
    cells.push(`<button type="button" class="day-cell${i === 9 ? " today" : ""} has-event"><span class="num">${(i % 30) + 1}</span><span class="markers chips">${chips}</span></button>`);
  }
  return cells.join("");
}
// 사용자 실제 케이스: 자동 일정이 한 날에 여러 개·긴 제목(칩은 2개+N 으로 줄고 칸 높이는 폭주하지 않아야 한다)
function manyCells() {
  return Array.from({ length: 35 }, (_, i) => {
    const items = AUTO_TITLES.concat(AUTO_TITLES).slice(0, 4 + (i % 4)).map((t, k) => ({ t: "a", title: t, category: ["VACCINE", "CHECKUP", "BENEFIT", "DEVELOP"][k % 4], done: false }));
    return `<button type="button" class="day-cell has-event"><span class="num">${(i % 30) + 1}</span><span class="markers chips">${V.cellChips(items, { links: LINKS, mode: "kids", catColor: false, autoColor: "#ff9ec4" })}</span></button>`;
  }).join("");
}
function weekCols() {
  const days = [];
  for (let i = 0; i < 7; i++) days.push({ date: `2026-10-${String(4 + i).padStart(2, "0")}`, today: i === 2, selected: i === 3, user: i % 2 ? [] : [{ title: USER_TITLES[0], color: "#ff9ec4" }, { title: USER_TITLES[1], color: "#7fb8ff" }, { title: "가족 외식 약속 장소 정하기", color: "#c9b8ff" }, { title: "네 번째 일정", color: "#c9b8ff" }], autoCount: 3 });
  return W.renderWeekCols(days);
}
const VARIANTS = [
  { id: "month-member", grid: `<div class="calendar-weekdays"><span>일</span><span>월</span><span>화</span><span>수</span><span>목</span><span>금</span><span>토</span></div><div class="calendar-grid calendar-grid-v2">${monthCells("member", false)}</div>` },
  { id: "month-kids", grid: `<div class="calendar-weekdays"><span>일</span><span>월</span><span>화</span><span>수</span><span>목</span><span>금</span><span>토</span></div><div class="calendar-grid calendar-grid-v2">${monthCells("kids", false)}</div>` },
  { id: "month-category", grid: `<div class="calendar-weekdays"><span>일</span><span>월</span><span>화</span><span>수</span><span>목</span><span>금</span><span>토</span></div><div class="calendar-grid calendar-grid-v2">${monthCells("kids", true)}</div>` },
  { id: "month-many", grid: `<div class="calendar-weekdays"><span>일</span><span>월</span><span>화</span><span>수</span><span>목</span><span>금</span><span>토</span></div><div class="calendar-grid calendar-grid-v2">${manyCells()}</div>` },
  { id: "week", grid: `<div class="calendar-weekdays"><span>일</span><span>월</span><span>화</span><span>수</span><span>목</span><span>금</span><span>토</span></div><div class="calendar-grid calendar-week">${weekCols()}</div>` },
];
const MEASURE = `
(function () {
  const out = [];
  document.querySelectorAll("[data-variant]").forEach((card) => {
    const id = card.getAttribute("data-variant");
    const cr = card.getBoundingClientRect();
    const grid = card.querySelector(".calendar-grid"), head = card.querySelector(".calendar-weekdays");
    const gr = grid.getBoundingClientRect(), hr = head.getBoundingClientRect();
    const kids = Array.from(grid.children);
    const widths = kids.slice(0, 7).map((c) => c.getBoundingClientRect().width);
    const bad = kids.filter((c) => c.scrollWidth > c.clientWidth + 1).length;
    out.push({ id, gridScrollOver: grid.scrollWidth - grid.clientWidth, gridInside: gr.left >= cr.left - 0.5 && gr.right <= cr.right + 0.5, headSame: Math.abs(hr.width - gr.width) < 1.5, spread: Math.max(...widths) - Math.min(...widths), cells: kids.length, badCells: bad, maxChips: Math.max(...kids.map((c) => c.querySelectorAll('.cal-chip').length)), maxH: Math.max(...kids.map((c) => c.getBoundingClientRect().height)), more: kids.filter((c) => c.querySelector('.cal-chip-more')).length, pageOver: document.documentElement.scrollWidth - window.innerWidth });
  });
  document.getElementById("out").textContent = JSON.stringify(out);
})();`;
function measure(width) {
  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><link rel="stylesheet" href="file://${CSS_PATH}" /></head><body>
<main id="app"><section id="view-calendar" class="view"><div id="tab-calendar" class="tab-panel">${VARIANTS.map((v) => `<div class="card calendar-card" data-variant="${v.id}">${v.grid}</div>`).join("")}</div></section></main>
<pre id="out"></pre><script>window.addEventListener("load", function () { setTimeout(function () {${MEASURE}}, 50); });</script></body></html>`;
  const file = path.join(os.tmpdir(), `cal-overflow-${process.pid}-${width}.html`);
  fs.writeFileSync(file, html);
  let dom;
  try {
    dom = cp.execFileSync(BROWSERS[0], ["--headless", "--disable-gpu", "--no-sandbox", `--window-size=${width},1600`, "--virtual-time-budget=3000", "--dump-dom", "file://" + file], { encoding: "utf8", timeout: 60000, stdio: ["ignore", "pipe", "ignore"] });
  } finally { try { fs.unlinkSync(file); } catch (e) {} }
  const m = dom.match(/<pre id="out">([\s\S]*?)<\/pre>/);
  assert.ok(m && m[1].trim(), "측정 결과가 비어 있다(브라우저 렌더 실패)");
  return JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, "&"));
}
for (const width of [360, 390, 430]) {
  test(`폭 ${width}px: 월(구성원색·아이색·카테고리색)·주 보기 모두 칸·그리드 넘침 0, 7열 균등, 요일 헤더 폭=그리드 폭`, () => {
    if (!BROWSERS.length) return "skip";
    const res = measure(width);
    assert.strictEqual(res.length, VARIANTS.length);
    for (const r of res) {
      assert.ok(r.cells === (r.id === "week" ? 7 : 35), `${r.id} 칸 수 ${r.cells}`);
      assert.ok(r.gridScrollOver <= 1, `${r.id}: 그리드가 컨테이너보다 ${r.gridScrollOver}px 넓다`);
      assert.ok(r.gridInside, `${r.id}: 그리드가 카드 영역을 벗어난다`);
      assert.ok(r.headSame, `${r.id}: 요일 헤더 폭과 그리드 폭이 다르다`);
      assert.ok(r.spread <= 1.5, `${r.id}: 열 폭이 ${r.spread.toFixed(1)}px 차이(균등하지 않음)`);
      assert.strictEqual(r.badCells, 0, `${r.id}: 내용이 넘치는 칸 ${r.badCells}개`);
      if (r.id.startsWith('month')) { assert.ok(r.maxChips <= 2, `${r.id}: 칸 안 칩 ${r.maxChips}개(2개+N 이어야 함)`); assert.ok(r.maxH <= 110, `${r.id}: 칸 높이 ${r.maxH.toFixed(0)}px(폭주)`); }
      if (r.id === 'month-many') assert.ok(r.more >= 30, `month-many: '+N' 이 ${r.more}칸에만 있다`);
      assert.ok(r.pageOver <= 1, `${r.id}: 페이지 가로 스크롤 ${r.pageOver}px`);
    }
  });
}
test("측정 환경: 브라우저를 찾았는지 표시(없으면 위 측정은 건너뜀)", () => { console.log("      " + (BROWSERS[0] ? "browser: " + BROWSERS[0] : "headless browser 없음 — CSS 규칙 테스트만 실행")); });
console.log(`\n${passed}개 통과${skipped ? `, ${skipped}개 건너뜀` : ""}${process.exitCode ? ", 일부 실패" : ""}`);
