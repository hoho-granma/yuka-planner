/*
 * js/calendar-week.js 순수 함수 테스트 — 주 계산(일요일 시작)·같은 요일 이동·제목·마크업. 실행: node test/calendar-week.logic.test.js
 */
const assert = require("assert");
const W = require("../js/calendar-week.js");
const US = require("../js/user-schedule.js");

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log("  ok  - " + name); } catch (e) { process.exitCode = 1; console.log("  FAIL- " + name + "\n      " + (e.stack || e).split("\n").slice(0, 5).join("\n      ")); }
}

console.log("승인 문구");
test("보기 전환·이전/다음·빈 날·자동 일정 문구가 확정본과 같다", () => {
  assert.deepStrictEqual([W.MSG.viewMonth, W.MSG.viewWeek], ["월", "주"]);
  assert.deepStrictEqual([W.MSG.prevMonth, W.MSG.nextMonth, W.MSG.prevWeek, W.MSG.nextWeek], ["이전 달", "다음 달", "이전 주", "다음 주"]);
  assert.strictEqual(W.MSG.dayEmpty, "일정 없음");
  assert.strictEqual(W.MSG.autoCount(3), "자동 일정 3개");
  assert.ok(Object.isFrozen(W.MSG));
});

console.log("날짜 계산");
test("weekStartOf/weekRange: 일요일 시작, 일요일·토요일 자기 주", () => {
  assert.strictEqual(W.weekStartOf("2026-10-04"), "2026-10-04"); // 일
  assert.strictEqual(W.weekStartOf("2026-10-10"), "2026-10-04"); // 토
  assert.strictEqual(W.weekStartOf("2026-10-07"), "2026-10-04"); // 수
  assert.deepStrictEqual(W.weekRange("2026-10-07"), { start: "2026-10-04", end: "2026-10-10" });
});
test("월·연 경계와 윤일: 2026-09-30(수)→9/27~10/3, 2027-01-01(금)→2026-12-27~2027-01-02, 2024-02-29(목)→2/25~3/2", () => {
  assert.deepStrictEqual(W.weekRange("2026-09-30"), { start: "2026-09-27", end: "2026-10-03" });
  assert.deepStrictEqual(W.weekRange("2027-01-01"), { start: "2026-12-27", end: "2027-01-02" });
  assert.deepStrictEqual(W.weekRange("2024-02-29"), { start: "2024-02-25", end: "2024-03-02" });
});
test("weekDays: 7일 연속·일요일부터", () => {
  const d = W.weekDays("2026-10-07");
  assert.strictEqual(d.length, 7);
  assert.deepStrictEqual([d[0], d[6]], ["2026-10-04", "2026-10-10"]);
  d.forEach((x, i) => assert.strictEqual(W.dowOf(x), i));
});
test("shiftWeek: 같은 요일 유지(±n주), 월말·연말·윤일 넘김, DST 영향 없음", () => {
  assert.strictEqual(W.shiftWeek("2026-10-07", 1), "2026-10-14");
  assert.strictEqual(W.shiftWeek("2026-10-07", -1), "2026-09-30");
  assert.strictEqual(W.shiftWeek("2026-12-30", 1), "2027-01-06");
  assert.strictEqual(W.shiftWeek("2024-03-04", -1), "2024-02-26");
  assert.strictEqual(W.shiftWeek("2026-03-04", 1), "2026-03-11"); // 미국 DST 주
  assert.strictEqual(W.shiftWeek("2026-10-31", 1), "2026-11-07"); // 유럽 DST 종료 주
  for (let i = 0; i < 400; i++) {
    const d = W.addDays("2025-01-01", i);
    assert.strictEqual(W.dowOf(W.shiftWeek(d, 1)), W.dowOf(d));
    assert.strictEqual(W.shiftWeek(W.shiftWeek(d, 3), -3), d);
  }
});
test("UserSchedule.addDays 와 같은 결과(날짜 계산 일관)", () => {
  for (let i = -30; i < 800; i += 7) assert.strictEqual(W.addDays("2026-10-05", i), US.addDays("2026-10-05", i));
});
test("monthStartOf/toLocalDate", () => {
  assert.strictEqual(W.monthStartOf("2026-10-31"), "2026-10-01");
  const d = W.toLocalDate("2026-10-07");
  assert.deepStrictEqual([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()], [2026, 9, 7, 0]);
});
test("weekTitle: 같은 달 / 달 걸침 / 해 걸침", () => {
  assert.strictEqual(W.weekTitle("2026-10-07"), "10월 4일 ~ 10일");
  assert.strictEqual(W.weekTitle("2026-09-30"), "9월 27일 ~ 10월 3일");
  assert.strictEqual(W.weekTitle("2027-01-01"), "2026년 12월 27일 ~ 2027년 1월 2일");
});

console.log("마크업");
const day = (date, over) => ({ date, today: false, selected: false, user: [], autoCount: 0, ...over });
test("renderViewToggle: 현재 보기가 active·aria-pressed", () => {
  const m = W.renderViewToggle("month");
  assert.ok(/data-cal-view="month"[^>]*aria-pressed="true"/.test(m.replace(/class="[^"]*" /, "")) || m.includes('us-chip active" data-cal-view="month"'));
  assert.ok(m.includes('data-cal-view="week" aria-pressed="false"') && m.includes(">월<") && m.includes(">주<"));
  assert.ok(W.renderViewToggle("week").includes('us-chip active" data-cal-view="week"'));
});
test("renderWeekCols: 7열·오늘/선택 클래스·날짜 속성·일정 제목·자동 개수·빈 날 문구", () => {
  const days = W.weekDays("2026-10-07").map((d) => day(d));
  days[0] = day(days[0].date, { today: true });
  days[3] = day(days[3].date, { selected: true, user: [{ title: "병원", color: "#ff7a59", done: false }], autoCount: 2 });
  const h = W.renderWeekCols(days);
  assert.strictEqual((h.match(/data-wk-date=/g) || []).length, 7);
  assert.ok(h.includes('class="week-col today" data-wk-date="2026-10-04"'));
  assert.ok(h.includes('class="week-col selected" data-wk-date="2026-10-07"'));
  assert.ok(h.includes("병원") && h.includes("자동 일정 2개") && h.includes("--wk-color:#ff7a59"));
  assert.strictEqual((h.match(/일정 없음/g) || []).length, 6);
  assert.ok(h.includes('aria-label="10월 7일(수) · 항목 3건"'));
});
test("일정 4개 이상이면 3개만 + '+N', 완료는 done 클래스", () => {
  const user = [1, 2, 3, 4, 5].map((i) => ({ title: "일정" + i, color: "#14b8a6", done: i === 1 }));
  const h = W.renderWeekCols([day("2026-10-07", { user })]);
  assert.strictEqual((h.match(/class="wk-item/g) || []).length, 3);
  assert.ok(h.includes('class="wk-item done"') && h.includes("+2") && !h.includes("일정4"));
});
test("제목은 이스케이프, 색은 #RRGGBB 만(스타일 주입 불가)", () => {
  const h = W.renderWeekCols([day("2026-10-07", { user: [{ title: '<img onerror=x>"', color: 'red;background:url(x)', done: false }] })]);
  assert.ok(!h.includes("<img") && h.includes("&lt;img") && !h.includes("url(x)") && h.includes("--wk-color:#62656b"));
});
test("입력을 바꾸지 않는다 · 빈 입력은 빈 문자열", () => {
  const days = [day("2026-10-07", { user: [{ title: "a", color: "#ff7a59", done: false }] })];
  const snap = JSON.stringify(days);
  W.renderWeekCols(days);
  assert.strictEqual(JSON.stringify(days), snap);
  assert.strictEqual(W.renderWeekCols(null), "");
});

console.log(`\n${passed}개 통과${process.exitCode ? ", 일부 실패" : ""}`);
