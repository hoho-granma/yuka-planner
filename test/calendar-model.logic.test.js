/*
 * js/calendar-model.js 단위 테스트 — 실제 엔진으로 만든 AUTO 일정 + 가짜 USER 일정.
 * 실행: node test/calendar-model.logic.test.js
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { HN, buildAuto, PROFILES } = require("./tools/load-engine.js");
const US = require("../js/user-schedule.js");
const CM = require("../js/calendar-model.js");

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ok  - ${name}`);
  } catch (e) {
    console.error(`FAIL - ${name}\n       ${e.stack || e.message}`);
    process.exitCode = 1;
  }
}
const NOW = 1790000000000;
let n = 0;
const sched = (over) => {
  const input = { sourceType: "MANUAL", title: "수업", category: "LESSON", scope: "CHILD", childKeys: ["c1"], allDay: false, startTime: "16:00", dateKind: "FIXED", eventDate: "2026-10-06", ...over };
  Object.keys(input).forEach((k) => input[k] === undefined && delete input[k]);
  const r = US.buildCreateDoc(input, NOW);
  assert(r.ok, JSON.stringify(r.errors));
  return { ...r.doc, id: "s" + ++n };
};
const auto = buildAuto(PROFILES.eunchan);
const links = [{ childKey: "c1", displayName: "은찬", colorKey: "blue" }, { childKey: "c2", displayName: "둘째", colorKey: "pink" }, { childKey: "c3", displayName: "분리", removedAt: 5 }];
const members = [{ memberId: "m1", label: "엄마" }, { memberId: "m2", label: "이모님", deletedAt: 9 }];
const model = (schedules, over = {}) =>
  CM.buildCalendarModel({ view: "month", range: { start: "2026-10-01", end: "2026-10-31" }, filter: { scope: "ALL", showAuto: true }, auto: { events: auto.events, displayDates: auto.displayDates, completed: {} }, user: { schedules, childLinks: links, members }, ...over });

console.log("구조·USER 배치");
test("모델 구조: days 는 범위의 모든 날, 각 칸에 user/benefit/planned/marks/more/total", () => {
  const m = model([]);
  assert.strictEqual(m.days.size, 31);
  const d = m.days.get("2026-10-06");
  ["user", "benefit", "planned", "marks", "more", "total"].forEach((k) => assert(k in d, k));
  assert(m.periodList.length === 0 && "counts" in m && Array.isArray(m.skipped));
});
test("정렬: 종일 먼저 → startTime 오름차순 → 제목", () => {
  const m = model([sched({ title: "B", startTime: "17:00" }), sched({ title: "A", startTime: "09:00" }), sched({ title: "종일", allDay: true, startTime: undefined })]);
  assert.deepStrictEqual(m.days.get("2026-10-06").user.map((o) => o.title), ["종일", "A", "B"]);
});
test("endDate 연속 일정은 걸친 모든 날 칸에 들어가고 카운트는 1건", () => {
  const m = model([sched({ eventDate: "2026-10-16", endDate: "2026-10-17", allDay: true, startTime: undefined, title: "캠프" })]);
  assert.strictEqual(m.days.get("2026-10-16").user.length, 1);
  assert.strictEqual(m.days.get("2026-10-17").user.length, 1);
  assert.strictEqual(m.days.get("2026-10-18").user.length, 0);
  assert.strictEqual(m.counts.userItems, 1);
});
test("PERIOD 는 칸에 점이 없고 periodList 에만(periodEnd 오름차순, 제목순)", () => {
  const p = { dateKind: "PERIOD", eventDate: undefined, allDay: true, startTime: undefined };
  const m = model([sched({ ...p, periodStart: "2026-10-01", periodEnd: "2026-10-31", title: "나" }), sched({ ...p, periodStart: "2026-10-01", periodEnd: "2026-10-20", title: "다" }), sched({ ...p, periodStart: "2026-10-01", periodEnd: "2026-10-20", title: "가" })]);
  assert.deepStrictEqual(m.periodList.map((o) => o.title), ["가", "다", "나"]);
  assert([...m.days.values()].every((d) => d.user.length === 0));
  assert.strictEqual(m.counts.periodItems, 3);
});
test("범위와 겹치지 않는 일정·soft-deleted 는 제외", () => {
  const del = sched({ title: "삭제됨" });
  const m = model([sched({ eventDate: "2026-12-01" }), { ...del, deletedAt: NOW + 1 }]);
  assert.strictEqual(m.counts.userItems, 0);
});
test("반복 일정은 B2 에서 전개하지 않고 skipped 로 남긴다", () => {
  const m = model([sched({ eventDate: undefined, recurrence: { freq: "WEEKLY", interval: 1, byDay: ["TU"], startDate: "2026-10-06", until: null } })]);
  assert.strictEqual(m.skipped.length, 1);
  assert.strictEqual(m.skipped[0].reason, "recurrence-not-expanded");
  assert.strictEqual(m.counts.userItems, 0);
});

console.log("\n필터·배지·담당자");
const sc = [sched({ title: "첫째만", childKeys: ["c1"] }), sched({ title: "둘째만", childKeys: ["c2"] }), sched({ title: "형제공동", childKeys: ["c1", "c2"] }), sched({ title: "가족행사", scope: "FAMILY", childKeys: undefined, category: "FAMILY" })];
const titles = (m) => m.days.get("2026-10-06").user.map((o) => o.title).sort();
test("전체: 모두(형제 공동은 한 번만)", () => assert.deepStrictEqual(titles(model(sc)), ["가족행사", "둘째만", "첫째만", "형제공동"]));
test("아이별: childKeys 에 포함된 것만(가족 일정 제외)", () => assert.deepStrictEqual(titles(model(sc, { filter: { scope: "CHILD", childKey: "c2", showAuto: true } })), ["둘째만", "형제공동"]));
test("가족: scope=FAMILY 만", () => assert.deepStrictEqual(titles(model(sc, { filter: { scope: "FAMILY", showAuto: true } })), ["가족행사"]));
test("형제 공동 일정: 배지 2개, 분리된 아이는 '(분리된 아이)'", () => {
  const m = model([sched({ title: "공동", childKeys: ["c1", "c3"] })]);
  const o = m.days.get("2026-10-06").user[0];
  assert.deepStrictEqual(o.badges.map((b) => [b.childKey, b.displayName, b.removed]), [["c1", "은찬", false], ["c3", "(분리된 아이)", true]]);
});
test("담당자: 라벨 표시, 삭제된 담당자는 '(삭제된 담당자)'(데이터 유지), 미정은 null", () => {
  const m = model([sched({ title: "a", assigneeMemberId: "m1" }), sched({ title: "b", assigneeMemberId: "m2" }), sched({ title: "c" })]);
  const by = Object.fromEntries(m.days.get("2026-10-06").user.map((o) => [o.title, o.assigneeLabel]));
  assert.deepStrictEqual(by, { a: "엄마", b: "(삭제된 담당자)", c: null });
});
test("완료 상태: USER 문서 status=DONE → done 표시 + counts.userDone, completed(AUTO)와 무관", () => {
  const d = sched({ title: "완료됨" });
  const m = model([{ ...d, status: "DONE" }, sched({ title: "미완" })]);
  assert.strictEqual(m.counts.userItems, 2);
  assert.strictEqual(m.counts.userDone, 1);
});

console.log("\nAUTO 동일성·표식");
const sod = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const appFormula = (date) => ({
  fixed: auto.events.filter((e) => e.scheduleKind === "fixed" && HN.coversDay(e, date)),
  planned: HN.plannedOnDay(auto.events, auto.displayDates, date),
});
test("AUTO: 모든 날의 benefit/planned 가 앱 calendarDayItems 공식과 같은 항목(순서 포함)이다", () => {
  const m = model([sched({})], { range: { start: "2026-06-01", end: "2026-12-31" } });
  let nonEmpty = 0;
  for (const [k, cell] of m.days) {
    const [y, mo, d] = k.split("-").map(Number);
    const exp = appFormula(new Date(y, mo - 1, d));
    assert.deepStrictEqual(cell.benefit.map((e) => e.id), exp.fixed.map((e) => e.id), k);
    assert.deepStrictEqual(cell.planned.map((e) => e.id), exp.planned.map((e) => e.id), k);
    cell.benefit.forEach((e, i) => assert.strictEqual(e, exp.fixed[i], "같은 객체 참조"));
    if (cell.benefit.length || cell.planned.length) nonEmpty++;
  }
  assert(nonEmpty > 20, "비교 대상 날이 충분하다: " + nonEmpty);
});
test("showAuto=false 면 AUTO 없음, 가족 필터에서도 AUTO 없음, 아이별은 활성 아이일 때만", () => {
  const cnt = (m) => m.counts.benefit + m.counts.planned;
  assert(cnt(model([], { range: { start: "2026-06-01", end: "2026-12-31" } })) > 0);
  assert.strictEqual(cnt(model([], { filter: { scope: "ALL", showAuto: false } })), 0);
  assert.strictEqual(cnt(model([], { filter: { scope: "FAMILY", showAuto: true } })), 0);
  const wide = { range: { start: "2026-06-01", end: "2026-12-31" } };
  const other = { filter: { scope: "CHILD", childKey: "c2", showAuto: true }, auto: { events: auto.events, displayDates: auto.displayDates, completed: {}, childKey: "c1" }, ...wide };
  assert.strictEqual(cnt(model([], other)), 0);
  assert(cnt(model([], { ...other, filter: { scope: "CHILD", childKey: "c1", showAuto: true } })) > 0);
});
test("칸 표식: USER → 혜택 → 추천일 순, 최대 3개 + more(세 종류 합)", () => {
  const m = model([sched({ title: "a" }), sched({ title: "b" }), sched({ title: "c" }), sched({ title: "d" })], { range: { start: "2026-06-01", end: "2026-12-31" } });
  const c = m.days.get("2026-10-06");
  assert.strictEqual(c.marks.length, 3);
  assert(c.marks.every((x) => x.kind === "user"));
  assert.strictEqual(c.total, c.user.length + c.benefit.length + c.planned.length);
  assert.strictEqual(c.more, c.total - 3);
});
test("range 검증: 역순·400일 초과는 RangeError", () => {
  assert.throws(() => model([], { range: { start: "2026-10-31", end: "2026-10-01" } }), RangeError);
  assert.throws(() => model([], { range: { start: "2026-01-01", end: "2027-06-01" } }), RangeError);
});
test("정적 확인: 자동 일정 생성·추천일 배치·완료 쓰기를 호출하지 않는다", () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "js", "calendar-model.js"), "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
  ["TodoEngine", "buildSchedule", "assignDisplayDays", "localStorage", "firebase", "toISOString"].forEach((w) => assert(!src.includes(w), w));
  assert(!/\.sort\(/.test(src.replace(/d\.user\.sort|periodList\.sort/g, "")), "AUTO 입력 배열을 정렬하지 않는다");
});

console.log(`\n${passed}개 통과${process.exitCode ? ", 일부 실패" : ""}`);
