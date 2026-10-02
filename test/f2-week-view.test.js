/*
 * F2 월/주 보기 전환 테스트 — app.js 연결(소스 추출 스텁), 월 보기 경로 불변 증명(HEAD 소스 대비), 오프라인 캐시 목록(sw.js), 플래그 OFF·가구 없음 불변.
 * 서버 호출 없음. 실행: node test/f2-week-view.test.js
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { execSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const W = require("../js/calendar-week.js");
const V = require("../js/user-schedule-view.js");
const US = require("../js/user-schedule.js");
const CM = require("../js/calendar-model.js");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
let passed = 0, started = 0, finished = 0;
function test(name, fn) {
  started++;
  try { fn(); passed++; console.log("  ok  - " + name); } catch (e) { process.exitCode = 1; console.log("  FAIL- " + name + "\n      " + (e.stack || e).split("\n").slice(0, 6).join("\n      ")); }
  finished++;
}
process.on("exit", () => { if (started !== finished) { console.log(`FAIL- 끝나지 않은 테스트 ${started - finished}개`); process.exitCode = 1; } });

const app = read("js/app.js");
const head = execSync("git show 78efed3:js/app.js", { cwd: ROOT, encoding: "utf8" }); // F2 직전(F3 커밋) — F2 가 월 경로에 더한 변경만 비교한다
const fnSrc = (src, name) => { // "  function name(" 부터 다음 "\n  }\n" 까지
  const a = src.indexOf(`  function ${name}(`);
  assert.ok(a >= 0, name);
  const b = src.indexOf("\n  }\n", a);
  return src.slice(a, b + 5);
};

console.log("월 보기 경로 불변(HEAD 소스 대비)");
test("renderCalendar: 변경은 맨 앞 가드 한 줄뿐이다", () => {
  const now = fnSrc(app, "renderCalendar");
  const old = fnSrc(head, "renderCalendar");
  // 칩 달력 개편: 가구가 있을 때(dm)의 칸 마크업 분기만 더해졌고 가구가 없을 때의 기존 점 마크업은 그대로 남아 있다
  assert.ok(now.includes('<span class="markers">${dotHtml}${moreHtml}</span>') && old.includes('<span class="markers">${dotHtml}${moreHtml}</span>'));
  assert.ok(/cell\.innerHTML = dm\s*\?/.test(now));
  assert.ok(now.startsWith("  function renderCalendar() {\n    if (calWeekOn()) return renderWeek();\n"));
});
test("renderSelectedDayPanel·attachListHandlers·renderCalendarProgress·computeCalendarDays·renderAutoPeriodSlot 는 HEAD 와 글자까지 같다", () => {
  ["renderSelectedDayPanel", "attachListHandlers", "renderCalendarProgress", "computeCalendarDays", "renderAutoPeriodSlot", "usRefreshCalendar"].forEach((n) => assert.strictEqual(fnSrc(app, n).replace("    if (renderCalTodoLine()) return; // E(1-2)\n", "").replace("    if (renderCalTodoLine()) return;\n", ""), fnSrc(head, n), n)); // E(1-2): renderCalendarProgress 첫 줄(가구 활성이면 한 줄로 대체)만 다르다
});
test("usBuildModel: view 인자(F2)·C2 연결 옵션·칩 달력 필터(복수 선택)만 늘었고 기본(월) 호출은 month 모델", () => {
  const now = fnSrc(app, "usBuildModel");
  assert.ok(now.includes('view: view === "week" ? "week" : "month",') && now.includes("UserScheduleView.toModelFilter(usSel(), us.onlyUser, usLinks(), usMembers(), usSelOpts())") && now.includes("hideLinked: autoLinkOn()"));
});
test("usRenderDayPanel: C2 의 배지 옵션 한 곳만 다르다", () => {
  const now = fnSrc(app, "usRenderDayPanel");
  const old = fnSrc(head, "usRenderDayPanel");
  assert.strictEqual(now.replace("{ docById: usDocById, ...(autoLinkOn() ? { autoTitleOf: usAutoTitleOf } : {}) }", "{ docById: usDocById }"), old);
});
test("usRenderCalendarSlots: usRenderViewToggle() 호출은 플래그 OFF 가드 뒤에 있다(칩 달력 개편으로 필터 줄 마크업이 바뀜)", () => {
  const now = fnSrc(app, "usRenderCalendarSlots");
  assert.ok(now.indexOf("if (!hhEnabled()) return;") < now.indexOf("usRenderViewToggle();"));
});
test("월 이동 버튼: 주 보기일 때만 가로채고 월 이동 본문은 그대로", () => {
  assert.ok(app.includes('el("btn-prev-month").addEventListener("click", () => {\n      if (calWeekOn()) return usWeekShift(-1);\n      viewMonth.setMonth(viewMonth.getMonth() - 1);\n      renderCalendar();\n    });'));
  assert.ok(app.includes('el("btn-next-month").addEventListener("click", () => {\n      if (calWeekOn()) return usWeekShift(1);\n      viewMonth.setMonth(viewMonth.getMonth() + 1);\n      renderCalendar();\n    });'));
});
test("날짜 칸 클릭(월)은 기존 3종 호출을 그대로 둔다", () => {
  const m = fnSrc(app, "renderCalendar");
  assert.ok(/selectedCalendarDate = date;\s*renderCalendar\(\);\s*renderSelectedDayPanel\(\);[\s\S]*?attachListHandlers\(\);/.test(m));
});

console.log("주 보기 동작(소스 추출 스텁)");
const a0 = app.indexOf("  // ── F2 주 보기 시작");
const a1 = app.indexOf("  // ── F2 주 보기 끝");
assert.ok(a0 > 0 && a1 > a0);
const blockSrc = app.slice(a0, a1);
const NOW_ISO = "2026-10-07"; // 수
function env(opts) {
  const o = { active: true, flagOn: true, selected: new Date(2026, 9, 7), docs: [], ...opts };
  const dom = {};
  const mk = (id) => (dom[id] = dom[id] || {
    id, innerHTML: "", textContent: "", attrs: {}, cls: new Set(),
    setAttribute(k, v) { this.attrs[k] = v; }, getAttribute(k) { return this.attrs[k]; },
    classList: { toggle: (c, on) => (on ? dom[id].cls.add(c) : dom[id].cls.delete(c)) },
    listeners: {},
    addEventListener(t, f) { this.listeners[t] = f; },
    querySelectorAll(sel) {
      if (sel !== "[data-wk-date]") return [];
      return [...this.innerHTML.matchAll(/data-wk-date="([^"]+)"/g)].map((m) => ({ getAttribute: () => m[1], addEventListener: (t, f) => (dom[id].colClicks[m[1]] = f) }));
    },
    colClicks: {},
  });
  const calls = [];
  const sandbox = {
    CalendarWeek: W, UserScheduleView: V, CalendarModel: CM, UserSchedule: US, console,
    el: mk, calls, state: o,
    hhEnabled: () => o.flagOn, usActive: () => o.active,
    toISODate: (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
    usLinks: () => [], usMembers: () => [], usDocs: () => o.docs,
    us: { selection: "ALL", showAuto: true },
    calView: "month", viewMonth: new Date(2026, 9, 1), selectedCalendarDate: o.selected,
    renderCalendar() { calls.push("renderCalendar"); if (sandbox.calWeekOn()) sandbox.renderWeek(); else { calls.push("month"); sandbox.usRenderCalendarSlots(null); /* 실제 월 경로도 끝에서 슬롯을 그린다 */ } },
    renderSelectedDayPanel: () => calls.push("panel"), attachListHandlers: () => calls.push("attach"),
    computeCalendarDays: () => calls.push("compute"), renderCalLegend: () => {}, renderCalendarProgress: () => calls.push("progress"),
    renderAutoPeriodSlot: () => calls.push("autoPeriod"), usRenderCalendarSlots: (m) => { calls.push("slots"); sandbox.lastSlotsModel = m; sandbox.usRenderViewToggle(); },
    usBuildModel: (s, e, f, view) => { calls.push(["model", s, e, view || "month"]); const mm = CM.buildCalendarModel({ view: view === "week" ? "week" : "month", range: { start: s, end: e }, filter: f || { scope: "ALL", showAuto: true }, auto: { events: [], displayDates: new Map(), completed: {} }, user: { schedules: o.docs, childLinks: [], members: [] } });
      for (const [d, c] of Object.entries(o.auto || {})) { const cell = mm.days.get(d); if (cell) { cell.benefit = Array.from({ length: c.benefit || 0 }, (_, i) => ({ id: "b" + i })); cell.planned = Array.from({ length: c.planned || 0 }, (_, i) => ({ id: "p" + i })); } }
      return mm; },
  };
  vm.createContext(sandbox);
  vm.runInContext(blockSrc + "\n;globalThis.__x = Object.assign(globalThis, { calWeekOn, calWeekAvailable, usSetCalView, usWeekShift, renderWeek, usRenderViewToggle, usCalRefreshAll });", sandbox);
  return { sb: sandbox, dom, calls, api: sandbox.__x, o };
}
const doc = (title, date, over) => { const r = US.buildCreateDoc({ sourceType: "MANUAL", title, category: "FAMILY", scope: "FAMILY", dateKind: "FIXED", eventDate: date, allDay: true, ...over }, 1790000000000); assert(r.ok, JSON.stringify(r.errors)); return { ...r.doc, id: "d" + title }; };

test("월→주: 보기 전환 시 3종(renderCalendar·패널·attach)을 한 번씩, 선택일 유지, 토글·이름 갱신", () => {
  const e = env();
  e.api.usSetCalView("week");
  assert.strictEqual(e.sb.calView, "week");
  assert.deepStrictEqual(e.calls.filter((c) => ["renderCalendar", "panel", "attach"].includes(c)), ["renderCalendar", "panel", "attach"]);
  assert.strictEqual(e.dom["calendar-title"].textContent, "10월 4일 ~ 10일");
  assert.strictEqual(NOW_ISO, e.sb.toISODate(e.sb.selectedCalendarDate));
  assert.ok(e.dom["calendar-grid"].cls.has("calendar-week"));
  assert.ok(e.dom["cal-view-slot"].innerHTML.includes('us-chip active" data-cal-view="week"'));
  assert.deepStrictEqual([e.dom["btn-prev-month"].attrs["aria-label"], e.dom["btn-next-month"].attrs["aria-label"]], ["이전 주", "다음 주"]);
});
test("주 보기 렌더: 7열, 선택 열 강조, 한 주 범위로 week 모델, 진행률·하단 슬롯은 선택일의 달 기준", () => {
  const e = env({ docs: [doc("치과", "2026-10-08"), doc("지난주", "2026-10-02")] });
  e.api.usSetCalView("week");
  const grid = e.dom["calendar-grid"].innerHTML;
  assert.strictEqual((grid.match(/data-wk-date=/g) || []).length, 7);
  assert.ok(grid.includes('week-col selected" data-wk-date="2026-10-07"') && grid.includes("치과") && !grid.includes("지난주"));
  assert.deepStrictEqual(e.calls.find((c) => Array.isArray(c) && c[3] === "week"), ["model", "2026-10-04", "2026-10-10", "week"]);
  assert.deepStrictEqual(e.calls.find((c) => Array.isArray(c) && c[3] === "month"), ["model", "2026-10-01", "2026-10-31", "month"]);
  assert.ok(e.calls.includes("progress") && e.calls.includes("autoPeriod") && e.calls.includes("compute"));
});
test("주 이동: 같은 요일 유지(±7일), 매번 3종 호출, 달이 바뀌면 viewMonth 동기화", () => {
  const e = env({ selected: new Date(2026, 9, 1) }); // 목
  e.api.usSetCalView("week");
  e.calls.length = 0;
  e.api.usWeekShift(1);
  assert.strictEqual(e.sb.toISODate(e.sb.selectedCalendarDate), "2026-10-08");
  assert.deepStrictEqual(e.calls.filter((c) => ["renderCalendar", "panel", "attach"].includes(c)), ["renderCalendar", "panel", "attach"]);
  e.api.usWeekShift(-2);
  assert.strictEqual(e.sb.toISODate(e.sb.selectedCalendarDate), "2026-09-24");
  assert.deepStrictEqual([e.sb.viewMonth.getFullYear(), e.sb.viewMonth.getMonth()], [2026, 8]);
  assert.strictEqual(e.dom["calendar-title"].textContent, "9월 20일 ~ 26일");
  for (let i = 0; i < 5; i++) { const before = e.sb.selectedCalendarDate.getDay(); e.api.usWeekShift(1); assert.strictEqual(e.sb.selectedCalendarDate.getDay(), before); }
});
test("주 열 클릭: 선택일 변경 후 3종 호출(새로 그린 열도 다시 연결)", () => {
  const e = env();
  e.api.usSetCalView("week");
  e.calls.length = 0;
  e.dom["calendar-grid"].colClicks["2026-10-09"]();
  assert.strictEqual(e.sb.toISODate(e.sb.selectedCalendarDate), "2026-10-09");
  assert.deepStrictEqual(e.calls.filter((c) => ["renderCalendar", "panel", "attach"].includes(c)), ["renderCalendar", "panel", "attach"]);
  assert.ok(e.dom["calendar-grid"].innerHTML.includes('week-col selected" data-wk-date="2026-10-09"'));
  assert.ok(Object.keys(e.dom["calendar-grid"].colClicks).length === 7, "7열 모두 클릭 연결");
});
test("주→월: viewMonth 를 선택일의 달로, 선택일 유지, 월 렌더 경로를 탄다", () => {
  const e = env({ selected: new Date(2026, 8, 30) });
  e.api.usSetCalView("week");
  e.sb.viewMonth = new Date(2030, 0, 1); // 어긋난 상태에서도
  e.calls.length = 0;
  e.api.usSetCalView("month");
  assert.deepStrictEqual([e.sb.viewMonth.getFullYear(), e.sb.viewMonth.getMonth()], [2026, 8]);
  assert.strictEqual(e.sb.toISODate(e.sb.selectedCalendarDate), "2026-09-30");
  assert.ok(e.calls.includes("month") && !e.dom["calendar-grid"].cls.has("calendar-week"));
  assert.deepStrictEqual(e.calls.filter((c) => ["renderCalendar", "panel", "attach"].includes(c)), ["renderCalendar", "panel", "attach"]);
  assert.deepStrictEqual([e.dom["btn-prev-month"].attrs["aria-label"], e.dom["btn-next-month"].attrs["aria-label"]], ["이전 달", "다음 달"]);
});
test("주 보기에서 월 경계 주(9/27~10/3)의 일정이 두 달 모두 열에 나온다", () => {
  const e = env({ selected: new Date(2026, 9, 1), docs: [doc("월말", "2026-09-29"), doc("월초", "2026-10-02")] });
  e.api.usSetCalView("week");
  const g = e.dom["calendar-grid"].innerHTML;
  assert.ok(g.includes("월말") && g.includes("월초"));
});
test("'자동 일정 N개'는 혜택(benefit)과 추천(planned)을 합친 개수다(어느 한쪽만 세지 않는다)", () => {
  const e = env({ auto: { "2026-10-07": { benefit: 1, planned: 2 }, "2026-10-08": { planned: 4 }, "2026-10-09": { benefit: 2 } } });
  e.api.usSetCalView("week");
  const g = e.dom["calendar-grid"].innerHTML;
  const cell = (d) => g.split("<button").find((x) => x.includes(`data-wk-date="${d}"`)) || "";
  assert.ok(cell("2026-10-07").includes("자동 일정 3개"));
  assert.ok(cell("2026-10-08").includes("자동 일정 4개") && !cell("2026-10-08").includes("일정 없음"));
  assert.ok(cell("2026-10-09").includes("자동 일정 2개"));
  assert.ok(cell("2026-10-05").includes("일정 없음") && !cell("2026-10-05").includes("자동 일정"));
});
test("같은 보기를 다시 누르거나 잘못된 값은 아무것도 하지 않는다", () => {
  const e = env();
  e.api.usSetCalView("month"); e.api.usSetCalView("zzz");
  assert.strictEqual(e.calls.length, 0);
  assert.strictEqual(e.sb.calView, "month");
});

console.log("플래그 OFF·가구 없음에서 불변");
test("가구 없음/플래그 OFF: 주 보기를 쓸 수 없고(calView 가 week 여도 월 경로), 토글·그리드 클래스·이름이 비워진다", () => {
  for (const o of [{ active: false }, { flagOn: false, active: false }]) {
    const e = env(o);
    e.api.usSetCalView("week");
    assert.strictEqual(e.sb.calView, "month");
    assert.strictEqual(e.api.calWeekAvailable(), false);
    e.sb.calView = "week"; // 가구를 떠난 직후 같은 상태
    assert.strictEqual(e.api.calWeekOn(), false);
    e.api.usRenderViewToggle();
    assert.strictEqual(e.dom["cal-view-slot"].innerHTML, "");
    assert.ok(!e.dom["calendar-grid"].cls.has("calendar-week"));
    assert.strictEqual(e.dom["btn-prev-month"].attrs["aria-label"], "이전 달");
  }
});
test("CalendarWeek 스크립트가 없으면(캐시 누락 등) 주 보기는 꺼지고 월 보기는 그대로", () => {
  const e = env();
  e.sb.CalendarWeek = undefined;
  assert.strictEqual(e.api.calWeekAvailable(), false);
  assert.doesNotThrow(() => e.api.usRenderViewToggle());
});
test("usRenderCalendarSlots 는 플래그 OFF 이면 토글을 건드리기 전에 반환한다 · usInit 은 슬롯 클릭을 usSetCalView 로 연결", () => {
  assert.ok(/viewSlot\.addEventListener\("click", \(ev\) => \{\s*const b = ev\.target\.closest\("\[data-cal-view\]"\);\s*if \(b\) usSetCalView\(b\.getAttribute\("data-cal-view"\)\);/.test(app));
  assert.ok(app.indexOf("function usInit()") < app.indexOf('const viewSlot = el("cal-view-slot")'));
});
test("주 열 클릭·보기 전환·주 이동은 모두 usCalRefreshAll 한 곳으로 모인다(3종 누락 방지)", () => {
  const refresh = fnSrc(app, "usCalRefreshAll");
  assert.ok(/renderCalendar\(\);\s*renderSelectedDayPanel\(\);\s*attachListHandlers\(\);/.test(refresh));
  ["usSetCalView", "usWeekShift"].forEach((n) => assert.ok(fnSrc(app, n).includes("usCalRefreshAll();"), n));
  assert.ok(/usCalRefreshAll\(\);\s*\}\)\s*\);/.test(fnSrc(app, "renderWeek")));
});

console.log("오프라인 캐시·스크립트 목록");
test("index.html 의 로컬 앱 스크립트가 모두 sw.js SHELL_ASSETS 에 있다(주 보기 포함)", () => {
  const html = read("index.html");
  const scripts = [...html.matchAll(/<script[^>]*\ssrc="([^"]+)"/g)].map((m) => m[1]).filter((s) => !/^https?:/.test(s)).map((s) => s.split("?")[0]);
  assert.ok(scripts.includes("js/calendar-week.js") && scripts.length > 15);
  const sw = read("sw.js");
  const list = sw.slice(sw.indexOf("SHELL_ASSETS = ["), sw.indexOf("];", sw.indexOf("SHELL_ASSETS = [")));
  const missing = scripts.filter((s) => !list.includes(`"./${s}"`));
  assert.deepStrictEqual(missing, []);
  assert.ok(list.includes('"./css/style.css') || list.includes("style.css"), "스타일 시트도 캐시 목록에 있다");
});
test("calendar-week.js 는 calendar-model.js 뒤·app.js 앞에서 로드되고, 캐시 이름은 APP_VERSION 에서 나온다(버전 올림=캐시 교체)", () => {
  const html = read("index.html");
  assert.ok(html.indexOf("js/calendar-model.js") < html.indexOf("js/calendar-week.js") && html.indexOf("js/calendar-week.js") < html.indexOf("js/app.js"));
  assert.ok(read("sw.js").includes("const CACHE_NAME = `hannun-shell-v${self.APP_VERSION}`;"));
  assert.ok(/self\.APP_VERSION = "\d+\.\d+\.\d+"/.test(read("js/version.js")));
});
test("규칙·스키마·AUTO 계산·모델 파일은 F2 커밋 구간(78efed3..604d5e5)에서 건드리지 않았다", () => {
  const changed = execSync("git diff --name-only 78efed3 604d5e5", { cwd: ROOT, encoding: "utf8" });
  ["firestore.rules", "js/user-schedule.js", "js/calendar-model.js", "js/hn-logic.js", "js/todo-engine.js", "js/schedule.js", "js/sync.js", "js/household-sync.js"].forEach((f) => assert.ok(!changed.includes(f), f));
});

console.log(`\n${passed}개 통과${process.exitCode ? ", 일부 실패" : ""}`);
