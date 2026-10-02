/*
 * F1 홈 '다가오는 가족 일정' 카드 테스트 — 순수 선택/렌더(user-schedule-view), 홈 골든(플래그 OFF·가구 없음에서 홈 DOM 불변), app.js 갱신 훅(소스 추출 스텁).
 * 서버 호출 없음. 실행: node test/f1-home-upcoming.test.js
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { execSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const V = require("../js/user-schedule-view.js");
const US = require("../js/user-schedule.js");
const CM = require("../js/calendar-model.js");
const HNLogic = require("../js/hn-logic.js");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
let passed = 0, started = 0, finished = 0;
function test(name, fn) {
  started++;
  try { fn(); passed++; console.log("  ok  - " + name); } catch (e) { process.exitCode = 1; console.log("  FAIL- " + name + "\n      " + (e.stack || e).split("\n").slice(0, 6).join("\n      ")); }
  finished++;
}
process.on("exit", () => { if (started !== finished) { console.log(`FAIL- 끝나지 않은 테스트 ${started - finished}개`); process.exitCode = 1; } });

const NOW = 1790000000000;
const TODAY = "2026-10-05"; // 월요일
let n = 0;
const sched = (over) => {
  const input = { sourceType: "MANUAL", title: "수업", category: "LESSON", scope: "FAMILY", allDay: true, dateKind: "FIXED", eventDate: TODAY, ...over };
  Object.keys(input).forEach((k) => input[k] === undefined && delete input[k]);
  const r = US.buildCreateDoc(input, NOW);
  assert(r.ok, JSON.stringify(r.errors));
  return { ...r.doc, id: "s" + ++n };
};
const LINKS = [{ childKey: "c1", displayName: "은찬", order: 1 }];
const model = (docs, start = TODAY, end = US.addDays(TODAY, 6)) =>
  CM.buildCalendarModel({ view: "month", range: { start, end }, filter: { scope: "ALL", showAuto: false }, auto: { events: [], displayDates: new Map(), completed: {} }, user: { schedules: docs, childLinks: LINKS, members: [] } });
const pick = (docs, over) => V.upcomingItems(model(docs), { todayIso: TODAY, links: LINKS, ...over });

console.log("승인 문구");
test("카드 문구가 확정본과 글자까지 같다(#1~#4)", () => {
  assert.strictEqual(V.MSG.upcomingTitle, "다가오는 우리 가족 일정");
  assert.strictEqual(V.MSG.upcomingEmpty, "앞으로 7일 안에 등록된 가족 일정이 없어요.");
  assert.strictEqual(V.MSG.upcomingAdd, "일정 추가하기");
  assert.strictEqual(V.MSG.upcomingMore, "캘린더에서 보기");
  assert.deepStrictEqual([V.MSG.upcomingToday, V.MSG.upcomingTomorrow], ["오늘", "내일"]);
});

console.log("upcomingItems");
test("오늘~+6일만 포함(오늘·+6 포함, +7·어제 제외), 날짜순", () => {
  const docs = [
    sched({ title: "어제", eventDate: "2026-10-04" }), sched({ title: "여섯째날", eventDate: "2026-10-11" }), sched({ title: "일곱째날", eventDate: "2026-10-12" }),
    sched({ title: "오늘것", eventDate: TODAY }), sched({ title: "수요일", eventDate: "2026-10-07" }),
  ];
  const r = V.upcomingItems(model(docs, "2026-10-01", "2026-10-20"), { todayIso: TODAY, links: LINKS });
  assert.deepStrictEqual(r.items.map((i) => i.title), ["오늘것", "수요일", "여섯째날"]);
  assert.strictEqual(r.more, 0);
});
test("최대 3개, 나머지 개수는 more", () => {
  const docs = [1, 2, 3, 4, 5].map((i) => sched({ title: "일정" + i, eventDate: US.addDays(TODAY, i % 3) }));
  const r = pick(docs);
  assert.strictEqual(r.items.length, 3);
  assert.strictEqual(r.more, 2);
});
test("같은 날은 종일 → 시각 → 제목 순(모델 정렬 그대로)", () => {
  const docs = [sched({ title: "나중", allDay: false, startTime: "15:00" }), sched({ title: "일찍", allDay: false, startTime: "09:00" }), sched({ title: "종일", allDay: true })];
  assert.deepStrictEqual(pick(docs).items.map((i) => i.title), ["종일", "일찍", "나중"]);
});
test("완료(DONE)·삭제 일정·날짜 미정(기간)은 뺀다", () => {
  const done = sched({ title: "끝남" }); done.status = "DONE";
  const gone = sched({ title: "삭제" }); gone.deletedAt = 5;
  const period = sched({ title: "기간", dateKind: "PERIOD", eventDate: undefined, periodStart: TODAY, periodEnd: "2026-10-09" });
  const keep = sched({ title: "남음" });
  assert.deepStrictEqual(pick([done, gone, period, keep]).items.map((i) => i.title), ["남음"]);
});
test("취소된 반복 회차는 뺀다, 정상 회차는 포함", () => {
  const rec = sched({ title: "매주", eventDate: undefined, dateKind: "FIXED", recurrence: { freq: "WEEKLY", interval: 1, byDay: ["MO", "WE"], startDate: "2026-09-28", until: null } });
  const base = pick([rec]).items.map((i) => i.date);
  assert.deepStrictEqual(base, ["2026-10-05", "2026-10-07", "2026-10-12"].filter((d) => d <= "2026-10-11"));
  const cancelled = { ...rec, exceptions: { "2026-10-05": { status: "CANCELLED" } } };
  assert.deepStrictEqual(pick([cancelled]).items.map((i) => i.date), ["2026-10-07"]);
});
test("여러 날 일정은 처음 보이는 날 한 번만", () => {
  const multi = sched({ title: "여행", eventDate: "2026-10-06", endDate: "2026-10-08" });
  const r = pick([multi]);
  assert.strictEqual(r.items.length, 1);
  assert.strictEqual(r.items[0].date, "2026-10-06");
});
test("오늘 이미 시작한 여러 날 일정은 '오늘'로 보인다", () => {
  const multi = sched({ title: "캠프", eventDate: "2026-10-03", endDate: "2026-10-06" });
  const r = V.upcomingItems(model([multi], "2026-10-03", "2026-10-11"), { todayIso: TODAY, links: LINKS });
  assert.strictEqual(r.items[0].whenText, "오늘");
});
test("AUTO 일정은 섞이지 않는다: 모델에 AUTO 가 있어도 benefit/planned 는 무시", () => {
  const m = model([sched({ title: "가족" })]);
  m.days.get(TODAY).benefit.push({ id: "auto1", title: "AUTO 혜택" });
  m.days.get(TODAY).planned.push({ id: "auto2", title: "AUTO 추천" });
  const r = V.upcomingItems(m, { todayIso: TODAY, links: LINKS });
  assert.deepStrictEqual(r.items.map((i) => i.title), ["가족"]);
});
test("whenText/timeText: 오늘·내일·'10월 7일(수)', 종일/오전·오후", () => {
  const docs = [sched({ title: "a", allDay: false, startTime: "14:30" }), sched({ title: "b", eventDate: "2026-10-06", allDay: false, startTime: "09:05" }), sched({ title: "c", eventDate: "2026-10-07" })];
  const it = pick(docs).items;
  assert.deepStrictEqual(it.map((i) => [i.whenText, i.timeText]), [["오늘", "오후 2:30"], ["내일", "오전 9:05"], ["10월 7일(수)", "종일"]]);
  assert.deepStrictEqual([V.clock12("00:00"), V.clock12("12:10"), V.clock12("13:00"), V.clock12(""), V.clock12("9:00")], ["오전 12:00", "오후 12:10", "오후 1:00", "", ""]);
});
test("월말·연말 경계: 12/29 기준 +6일은 1/4", () => {
  const t = "2026-12-29";
  const m = model([sched({ title: "새해", eventDate: "2027-01-04" }), sched({ title: "밖", eventDate: "2027-01-05" })], t, US.addDays(t, 6));
  assert.deepStrictEqual(V.upcomingItems(m, { todayIso: t, links: LINKS }).items.map((i) => i.title), ["새해"]);
});
test("입력(model)을 바꾸지 않는다 · 잘못된 입력은 빈 결과", () => {
  const m = model([sched({ title: "x" })]);
  const before = JSON.stringify([...m.days.entries()]);
  pick([sched({ title: "y" })]); V.upcomingItems(m, { todayIso: TODAY });
  assert.strictEqual(JSON.stringify([...m.days.entries()]), before);
  assert.deepStrictEqual(V.upcomingItems(null, { todayIso: TODAY }), { items: [], more: 0 });
  assert.deepStrictEqual(V.upcomingItems(m, {}), { items: [], more: 0 });
});

console.log("renderUpcomingCard");
test("일정 있음: 제목·줄 3개·data-home-date·캘린더에서 보기, 빈 상태 문구 없음", () => {
  const html = V.renderUpcomingCard(pick([sched({ title: "병원" }), sched({ title: "치과", eventDate: "2026-10-06" })]));
  assert.ok(html.includes("다가오는 우리 가족 일정") && html.includes('data-home-date="2026-10-05"') && html.includes('data-home-date="2026-10-06"'));
  assert.ok(html.includes('data-act="us-cal"') && html.includes("캘린더에서 보기") && !html.includes("등록된 가족 일정이 없어요") && !html.includes('data-act="us-add"'));
});
test("일정 없음: 빈 상태 한 줄 + 일정 추가하기 버튼", () => {
  const html = V.renderUpcomingCard({ items: [], more: 0 });
  assert.ok(html.includes("앞으로 7일 안에 등록된 가족 일정이 없어요.") && html.includes('data-act="us-add"') && html.includes("일정 추가하기") && !html.includes("data-home-date"));
});
test("제목·태그는 이스케이프되고 색은 고정 팔레트(스타일 주입 불가)", () => {
  const html = V.renderUpcomingCard({ items: [{ key: "k", scheduleId: "s", date: TODAY, title: '<img onerror=x>"', whenText: "오늘", timeText: "종일", tag: "<b>", color: 'red;background:url(x)' }], more: 0 });
  assert.ok(!html.includes("<img") && !html.includes("<b>") && !html.includes("url(x)"));
  assert.ok(html.includes("&lt;img"));
});

console.log("홈 골든(플래그 OFF·가구 없음에서 홈 DOM 불변)");
const headHome = execSync("git show 0badff5:js/home.js", { cwd: ROOT, encoding: "utf8" });
(function () {
  const run = (src, extra) => {
    const out = { html: null };
    const wrap = { set innerHTML(v) { out.html = v; }, get innerHTML() { return out.html; }, querySelectorAll: () => [] };
    const sandbox = { HNLogic, document: { getElementById: (id) => (id === "home-body" ? wrap : null) }, window: {} };
    sandbox.globalThis = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(src, sandbox);
    const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    const ev = (id, title, cat) => ({ id, title, category: cat, scheduleKind: "window", windowStart: new Date(2026, 9, 1), windowEnd: new Date(2026, 9, 20) });
    const ctx = {
      profile: { birthDate: new Date(2026, 5, 20) }, completed: {}, today: new Date(2026, 9, 5), pregnant: false, ageNow: 3,
      events: [ev("a", "3개월 검진", "영유아검진"), ev("b", "생활 점검", "생활")], CATEGORY_META: { 영유아검진: { label: "영유아검진", color: "#111" }, 생활: { label: "생활", color: "#222" } },
      esc, formatDateKR: () => "10월 1일", calGroupFor: () => ({ color: "#333" }), kindTagHtml: () => "", monthKeysOf: () => [3], periodRangeOf: () => null, periodGroupLabel: () => "기간", monthPeriodText: () => "3~5개월",
      bindOpen: () => {}, openTodos: () => {}, switchTab: () => {}, goCalendar: () => {}, showModal: () => {}, ...extra,
    };
    (sandbox.window.HNHome || sandbox.HNHome).render(ctx);
    return out;
  };
  global.__runHome = run;
})();
const homeNew = read("js/home.js");
const render = (src, extra) => global.__runHome(src, extra).html;
test("ctx 에 usUpcomingHtml 이 없거나 \"\" 를 돌려주면 홈 HTML 이 HEAD(변경 전) 와 글자까지 같다", () => {
  const base = render(headHome);
  assert.ok(base.includes("챙길 것") && base.length > 200, "골든 입력이 비어 있지 않다");
  assert.strictEqual(render(homeNew), base);
  assert.strictEqual(render(homeNew, { usUpcomingHtml: () => "" }), base);
});
test("카드가 있으면 임신 배너 다음·'이번 달 챙길 것' 앞에만 끼워지고 나머지는 그대로", () => {
  const base = render(headHome);
  const card = '<section class="home-sec sec-us-upcoming">CARD</section>';
  const withCard = render(homeNew, { usUpcomingHtml: () => card });
  assert.strictEqual(withCard, card + base);
  const preg = render(homeNew, { pregnant: true, usUpcomingHtml: () => card });
  assert.ok(preg.indexOf("home-banner") < preg.indexOf("CARD") && preg.indexOf("CARD") < preg.indexOf("챙길 것"));
});
test("data-act us-cal/us-add, 줄 탭이 각각 goCalendar/usAddFromHome 으로 연결된다", () => {
  const calls = [];
  const handlers = {};
  const mk = (sel, attr) => ({ dataset: attr, addEventListener: (t, f) => (handlers[sel] = f) });
  const wrap = {
    set innerHTML(v) {}, querySelectorAll: (sel) => (sel === "[data-act]" ? [mk("us-cal", { act: "us-cal" }), mk("us-add", { act: "us-add" })] : sel === "[data-home-date]" ? [mk("row", { homeDate: "2026-10-07" })] : []),
  };
  const sandbox = { HNLogic, document: { getElementById: () => wrap }, window: {} };
  vm.createContext(sandbox);
  vm.runInContext(homeNew, sandbox);
  sandbox.window.HNHome.render({
    profile: { birthDate: new Date(2026, 5, 20) }, completed: {}, today: new Date(2026, 9, 5), pregnant: false, ageNow: 3, events: [], CATEGORY_META: {},
    esc: String, formatDateKR: () => "", calGroupFor: () => ({ color: "#0" }), kindTagHtml: () => "", monthKeysOf: () => [], periodRangeOf: () => null, periodGroupLabel: () => "", monthPeriodText: () => "",
    bindOpen() {}, goCalendar: (d) => calls.push(["cal", d.getFullYear(), d.getMonth() + 1, d.getDate()]), usAddFromHome: () => calls.push(["add"]),
  });
  handlers["us-cal"](); handlers["us-add"](); handlers["row"]();
  assert.strictEqual(calls[0][0], "cal");
  assert.deepStrictEqual(calls.slice(1), [["add"], ["cal", 2026, 10, 7]]);
});

console.log("app.js 연결(갱신 훅·가드)");
const app = read("js/app.js");
const slice = (from, to) => { const a = app.indexOf(from); const b = app.indexOf(to, a); assert.ok(a > 0 && b > a, from); return app.slice(a, b); };
const hookSrc = slice("  function usHomeCardHtml()", "  function usRefreshCalendar()");
function hookEnv(opts) {
  const log = { render: 0, build: 0 };
  const st = { enabled: true, active: true, docsHtml: "A", ...opts };
  const sandbox = {
    console, us: { homeSig: "" }, profile: {}, log, st,
    hhEnabled: () => st.enabled, usActive: () => st.active, usAutoLinkSig: () => st.autoSig || "", autoLinkOn: () => !!st.autoSig, renderChecklistTab: () => { log.checklist = (log.checklist || 0) + 1; }, toISODate: () => TODAY,
    UserSchedule: { addDays: US.addDays }, usBuildModel: (a, b, f) => { log.build++; log.args = [a, b, f]; return {}; }, usLinks: () => [],
    UserScheduleView: { upcomingItems: () => ({ items: [] }), renderUpcomingCard: () => st.docsHtml },
    renderHome: () => { log.render++; sandbox.us.homeSig = sandbox.usHomeCardHtml() + sandbox.usAutoLinkSig(); },
  };
  vm.createContext(sandbox);
  vm.runInContext(hookSrc, sandbox);
  return sandbox;
}
test("usHomeCardHtml: 오늘~+6일, 필터 ALL·showAuto:false 로 모델을 만든다(AUTO 차단)", () => {
  const e = hookEnv();
  assert.strictEqual(e.usHomeCardHtml(), "A");
  assert.deepStrictEqual(JSON.parse(JSON.stringify(e.log.args)), [TODAY, "2026-10-11", { scope: "ALL", showAuto: false }]);
});
test("플래그 OFF·가구 없음이면 \"\" 이고 모델도 만들지 않으며, usRefreshHome 은 아무것도 하지 않는다", () => {
  for (const o of [{ enabled: false }, { active: false }]) {
    const e = hookEnv(o);
    assert.strictEqual(e.usHomeCardHtml(), "");
    e.usRefreshHome();
    assert.deepStrictEqual([e.log.build, e.log.render], [0, 0]);
  }
});
test("가구 없음 상태에서 이전에 카드가 있었다면(탈퇴 등) 한 번 다시 그려 카드를 지운다", () => {
  const e = hookEnv({ active: false });
  e.us.homeSig = "<card>";
  e.usRefreshHome();
  assert.strictEqual(e.log.render, 1);
  assert.strictEqual(e.us.homeSig, "");
});
test("중복 호출 가드: 카드 HTML 이 같으면 renderHome 을 부르지 않고, 달라졌을 때만 한 번 부른다", () => {
  const e = hookEnv();
  e.usRefreshHome(); // "" → "A": 1회
  e.usRefreshHome(); e.usRefreshHome(); // 같음: 0회
  assert.strictEqual(e.log.render, 1);
  e.st.docsHtml = "B";
  e.usRefreshHome(); e.usRefreshHome();
  assert.strictEqual(e.log.render, 2);
});
test("C2: 연결 색인(usAutoLinkSig)이 달라지면 카드가 같아도 홈과(autoLink ON 일 때) 체크리스트를 한 번 다시 그리고, 같으면 건너뛴다", () => {
  const e = hookEnv({ autoSig: "A" });
  e.usRefreshHome(); // "" → "A|card": 1회
  assert.deepStrictEqual([e.log.render, e.log.checklist], [1, 1]);
  e.usRefreshHome(); e.usRefreshHome();
  assert.deepStrictEqual([e.log.render, e.log.checklist], [1, 1]);
  e.st.autoSig = "B";
  e.usRefreshHome(); e.usRefreshHome();
  assert.deepStrictEqual([e.log.render, e.log.checklist], [2, 2]);
  const off = hookEnv({}); // autoLink 꺼짐: 카드 변화로 홈만 갱신, 체크리스트는 건드리지 않는다
  off.usRefreshHome();
  assert.deepStrictEqual([off.log.render, off.log.checklist || 0], [1, 0]);
});
test("usHomeCardHtml 이 던져도 홈은 깨지지 않는다(\"\" 반환)", () => {
  const e = hookEnv();
  e.usBuildModel = () => { throw new Error("boom"); };
  const err = console.error; console.error = () => {};
  try { assert.strictEqual(e.usHomeCardHtml(), ""); } finally { console.error = err; }
});
test("연결: usRefreshCalendar 는 캘린더가 숨겨져 있어도 홈 갱신을 먼저 호출하고, hnCtx 가 카드·추가 진입을 제공한다", () => {
  const body = slice("  function usRefreshCalendar()", "  /** 캘린더 위");
  assert.ok(/^\s*function usRefreshCalendar\(\) \{\n\s*usRefreshHome\(\);\n\s*if \(!profile/.test(body));
  const ctxSrc = slice("      usUpcomingHtml:", "      openDetail,");
  assert.ok(/us\.homeSig = h \+ usAutoLinkSig\(\)/.test(ctxSrc) && /const h = usHomeCardHtml\(\);/.test(ctxSrc) && /usOpenForm\(null, toISODate\(new Date\(\)\)\)/.test(ctxSrc));
});
test("버전 쿼리: home.js·user-schedule-view.js·app.js 스크립트 태그가 올라갔다", () => {
  const idx = read("index.html");
  assert.ok(/home\.js\?v=(2[2-9]|[3-9]\d)\b/.test(idx) && /user-schedule-view\.js\?v=([6-9]|\d{2})\b/.test(idx) && /app\.js\?v=(6[1-9]|[7-9]\d)\b/.test(idx));
});
test("스키마·규칙·AUTO 계산 파일은 F1 커밋 구간(0badff5..672d21b)에서 건드리지 않았다", () => {
  const changed = execSync("git diff --name-only 0badff5 672d21b", { cwd: ROOT, encoding: "utf8" });
  ["firestore.rules", "js/user-schedule.js", "js/calendar-model.js", "js/hn-logic.js", "js/todo-engine.js", "js/schedule.js", "js/sync.js"].forEach((f) => assert.ok(!changed.includes(f), f));
});

console.log(`\n${passed}개 통과${process.exitCode ? ", 일부 실패" : ""}`);
