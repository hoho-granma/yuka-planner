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
test("전개할 수 없는 반복 규칙(예: YEARLY)은 전개하지 않고 skipped 로 남긴다", () => {
  const rec = sched({ eventDate: undefined, recurrence: { freq: "WEEKLY", interval: 1, byDay: ["TU"], startDate: "2026-10-06", until: null } });
  const m = model([{ ...rec, recurrence: { ...rec.recurrence, freq: "YEARLY" } }]);
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
  assert(!/\.sort\(/.test(src.replace(/d\.user\.sort|d\.cancelled\.sort|d\.periodStarts\.sort|periodList\.sort|open\.sort\(cmp\)|all\.sort\(cmp\)/g, "") /* 마지막 둘은 C2 linksByAutoId 가 USER 일정 복사본을 정렬 */), "AUTO 입력 배열을 정렬하지 않는다");
});

console.log("\n반복 일정 (B5)");
const REC = { freq: "WEEKLY", interval: 1, byDay: ["TU", "TH"], startDate: "2026-10-06", until: null };
const recS = (over = {}) => sched({ eventDate: undefined, recurrence: REC, ...over });
test("반복 일정이 회차마다 칸에 들어가고 집계는 회차 수(D3)", () => {
  const m = model([recS()]);
  assert.strictEqual(m.skipped.length, 0);
  assert.strictEqual(m.counts.userItems, 8);
  ["2026-10-06", "2026-10-08", "2026-10-29"].forEach((k) => assert.strictEqual(m.days.get(k).user.length, 1));
  assert.strictEqual(m.days.get("2026-10-07").user.length, 0);
  assert.strictEqual(m.days.get("2026-10-06").user[0].key.endsWith("@2026-10-06"), true);
});
test("취소 회차: 표식·집계·total 에서 빠지고 days[날짜].cancelled 로만 나간다 / 되돌리면 다시 표식", () => {
  const d = recS({ exceptions: { "2026-10-08": { status: "CANCELLED" } } });
  const m = model([d]);
  const cell = m.days.get("2026-10-08");
  assert.strictEqual(cell.user.length, 0);
  assert.strictEqual(cell.cancelled.length, 1);
  assert.strictEqual(cell.cancelled[0].status, "CANCELLED");
  assert(cell.marks.every((x) => x.kind !== "user"));
  assert.strictEqual(m.counts.userItems, 7);
  const back = { ...d };
  delete back.exceptions;
  assert.strictEqual(model([back]).days.get("2026-10-08").cancelled.length, 0);
});
test("완료 회차는 userDone, 이동 회차는 이동한 날짜 칸에만(원래 날짜 칸은 비어 있음)", () => {
  const d = recS({ exceptions: { "2026-10-15": { status: "DONE" }, "2026-10-13": { status: "RESCHEDULED", movedTo: { date: "2026-10-14", startTime: "17:00" } } } });
  const m = model([d]);
  assert.strictEqual(m.counts.userDone, 1);
  assert.strictEqual(m.days.get("2026-10-13").user.length, 0);
  assert.strictEqual(m.days.get("2026-10-13").cancelled.length, 0, "이동은 원래 날짜에 아무 표시도 없다(R36)");
  const mv = m.days.get("2026-10-14").user;
  assert(mv.length === 1 && mv[0].originalDate === "2026-10-13" && mv[0].startTime === "17:00");
  assert.strictEqual(m.counts.userItems, 8);
});
test("필터: 가족 일정 반복은 FAMILY/ALL 에서만, 아이 반복은 그 아이 CHILD 에서만, 삭제된 반복은 안 나온다", () => {
  const fam = recS({ scope: "FAMILY", childKeys: undefined });
  const kid = recS({ childKeys: ["c1"] });
  const gone = { ...recS(), deletedAt: NOW + 1 };
  const f = (filter) => model([fam, kid, gone], { filter: { ...filter, showAuto: false } }).counts.userItems;
  assert.strictEqual(f({ scope: "ALL" }), 16);
  assert.strictEqual(f({ scope: "FAMILY" }), 8);
  assert.strictEqual(f({ scope: "CHILD", childKey: "c1" }), 8);
  assert.strictEqual(f({ scope: "CHILD", childKey: "c2" }), 0);
});
test("범위 밖 날짜: 칸이 없는 날(월 밖)으로 옮긴 회차·취소는 모델에 들어가지 않는다", () => {
  const d = recS({ exceptions: { "2026-10-27": { status: "RESCHEDULED", movedTo: { date: "2026-11-02" } }, "2026-10-29": { status: "CANCELLED" } } });
  const m = model([d]);
  assert.strictEqual(m.counts.userItems, 6);
  assert.strictEqual(m.days.size, 31);
});
test("AUTO 출력은 반복 일정이 있어도 동일(같은 배열 객체, benefit/planned 값 동일)", () => {
  const base = model([sched({})]);
  const withRec = model([sched({}), recS({ exceptions: { "2026-10-08": { status: "CANCELLED" } } }), recS({ scope: "FAMILY", childKeys: undefined })]);
  for (const [k, cell] of base.days) {
    assert.deepStrictEqual(withRec.days.get(k).benefit, cell.benefit);
    assert.deepStrictEqual(withRec.days.get(k).planned, cell.planned);
  }
  assert.strictEqual(withRec.counts.benefit, base.counts.benefit);
  assert.strictEqual(withRec.counts.planned, base.counts.planned);
});
test("입력(반복 문서·링크·AUTO)을 변경하지 않는다", () => {
  const frozen = JSON.parse(JSON.stringify(recS({ exceptions: { "2026-10-08": { status: "CANCELLED" }, "2026-10-13": { status: "RESCHEDULED", movedTo: { date: "2026-10-14" } } } })));
  const df = (o) => (Object.values(o).forEach((v) => v && typeof v === "object" && df(v)), Object.freeze(o));
  df(frozen);
  assert.doesNotThrow(() => model([frozen]));
});
test("비반복 일정의 칸 구조는 B4 와 같다(cancelled·periodStarts 는 빈 배열이 추가될 뿐)", () => {
  const m = model([sched({ eventDate: "2026-10-12" })]);
  const c = m.days.get("2026-10-12");
  assert.deepStrictEqual(Object.keys(c).sort(), ["benefit", "cancelled", "marks", "more", "periodStarts", "planned", "total", "user"]);
  assert.strictEqual(c.user.length, 1);
  assert.deepStrictEqual(c.cancelled, []);
  assert.deepStrictEqual(c.periodStarts, []);
});

test("기간(PERIOD) 일정: 시작일 칸의 periodStarts 에 들어가고(칸 표식·집계 user 는 그대로), 기간 목록에도 남는다 / 취소·범위 밖 시작은 칸에 넣지 않는다", () => {
  const P = (over) => sched({ dateKind: "PERIOD", eventDate: undefined, endDate: undefined, periodStart: "2026-10-20", periodEnd: "2026-10-30", ...over });
  const m = model([P()]);
  const c = m.days.get("2026-10-20");
  assert.strictEqual(c.periodStarts.length, 1); assert.strictEqual(c.user.length, 0); assert.strictEqual(c.total, 0);
  assert.strictEqual(m.periodList.length, 1);
  assert.strictEqual(m.days.get("2026-10-21").periodStarts.length, 0);
  assert.strictEqual(m.counts.userItems, 0);
  const before = model([P({ periodStart: "2026-09-20", periodEnd: "2026-10-05" })]);
  assert.strictEqual(before.periodList.length, 1); assert.ok([...before.days.values()].every((d) => d.periodStarts.length === 0));
});

console.log(`\n${passed}개 통과${process.exitCode ? ", 일부 실패" : ""}`);
