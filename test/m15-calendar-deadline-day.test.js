// 1-5b 달력 마감형 신청을 마감일 칸에('마감 ' 글자·임박 와인색): 표시 층(플래그 curation)만, 엔진 fixedDate 불변. 실행: node --test test/m15-calendar-deadline-day.test.js
const test = require("node:test"), assert = require("node:assert"), fs = require("fs"), path = require("path");
const HN = require("../js/hn-logic.js"), M = require("../js/month-tiers.js");
const app = fs.readFileSync(path.join(__dirname, "..", "js/app.js"), "utf8");
const today = new Date(2026, 9, 5);
const sub = (id, dt, o) => ({ id, title: "부모급여 신청", category: "행정·지원금", scheduleKind: "fixed", isLegacySubsidy: true, fixedDate: new Date(2026, 6, 1), date: new Date(2026, 6, 1), deadlineDate: o && "dl" in o ? o.dl : new Date(2026, 9, 15), detail: { deadlineType: dt }, ...(o && o.x) });
const ctx = { HN, today, soonDays: 30 };
test("신청 기한(birth_relative)은 마감일 칸으로 + '마감 ' 접두, 임박(30일 이내)은 calUrgent·D-N", () => {
  const e = sub("SB-02", "birth_relative_days"), v = M.deadlineView(e, ctx);
  assert.strictEqual(v.fixedDate.getTime(), new Date(2026, 9, 15).getTime()); assert.strictEqual(v.title, "마감 부모급여 신청"); assert.strictEqual(v.calDays, 10); assert.strictEqual(v.calUrgent, true); assert.strictEqual(e.fixedDate.getMonth(), 6, "원본(엔진 fixedDate) 불변");
  assert.strictEqual(M.deadlineView(sub("X", "birth_relative_days", { dl: new Date(2027, 1, 1) }), ctx).calUrgent, false, "임박 아님");
});
test("제외: 마감 미확인·상시·나이 상한(age_window·엔진 AGE_WINDOW)·마감 없음·fixed 아님 — 원본 그대로", () => {
  for (const t of ["unconfirmed", "ongoing", "age_window"]) { const e = sub("A", t); assert.strictEqual(M.deadlineView(e, ctx), e, t); }
  const eng = sub("SB-04", "x", { x: { isLegacySubsidy: false, detail: { definition: { triggerType: "AGE_WINDOW" } } } }); assert.strictEqual(M.deadlineView(eng, ctx), eng);
  const none = sub("B", "birth_relative_days", { dl: null }); assert.strictEqual(M.deadlineView(none, ctx), none);
  const win = { ...sub("C", "birth_relative_days"), scheduleKind: "window" }; assert.strictEqual(M.deadlineView(win, ctx), win);
});
test("달력: 복사본은 마감일 칸에 걸리고 시작일 칸에는 안 걸린다(coversDay)", () => {
  const v = M.deadlineView(sub("SB-02", "birth_relative_days"), ctx);
  assert.strictEqual(HN.coversDay(v, new Date(2026, 9, 15)), true); assert.strictEqual(HN.coversDay(v, new Date(2026, 6, 1)), false);
});
test("앱 연결: 플래그 OFF·정책 없음이면 목록 그대로(OFF 불변), 임박 줄은 eventItemHtml 래퍼(원본 함수 본문 불변)", () => {
  const i = app.indexOf("function calendarDeadlineViews("), fn = app.slice(i, app.indexOf("\n  }\n", i) + 4);
  const vm = require("vm"), list = [1, 2];
  const run = (flag, pol, mt) => vm.runInNewContext(`${fn}; calendarDeadlineViews(list)`, { FEATURES_CURATION_ON: () => flag, curationPolicy: pol, MonthTiers: mt, list, HNLogic: HN, Date });
  assert.strictEqual(run(false, {}, M), list); assert.strictEqual(run(true, null, M), list); assert.strictEqual(run(true, {}, undefined), list);
  assert.ok(app.includes("return calendarDeadlineViews(list);") && app.includes("eventItemHtml = function eventItemHtml(e, opts)") && app.includes('class="sub-when urgent">D-${e.calDays}'));
});
