/*
 * js/date-picker.js 순수 함수 테스트 — 연도 목록·선택 가능 범위. (DOM 동작은 브라우저에서 확인)
 * 실행: node test/date-picker.logic.test.js
 */
const assert = require("assert");
const DP = require("../js/date-picker.js");
const CT = require("../js/child-timeline.js");

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
const today = new Date(2026, 9, 1); // 2026-10-01
const BACK = CT.SERVICE_RANGE.pickerYearsBack;

test("연도 하한은 올해 초등 6학년의 출생연도: 2026 → 2015 (올해 − 11)", () => {
  assert.strictEqual(BACK, 11);
  const ys = DP.birthYears("born", today, BACK);
  assert.strictEqual(ys[0], 2026);
  assert.strictEqual(ys[ys.length - 1], 2015);
  assert.strictEqual(ys.length, 12);
  assert.deepStrictEqual(ys, [...ys].sort((a, b) => b - a), "내림차순");
});
test("초6 출생연도 검증: 올해 초1 = 6년 전 출생(2020) → 초6 = 2015", () => {
  const firstGrade = today.getFullYear() - 6;
  assert.strictEqual(firstGrade - 5, today.getFullYear() - BACK);
});
test("연도 목록은 해가 바뀌면 같이 이동한다(2027 → 2016)", () => {
  const ys = DP.birthYears("born", new Date(2027, 0, 5), BACK);
  assert.strictEqual(ys[0], 2027);
  assert.strictEqual(ys[ys.length - 1], 2016);
});
test("임신 중 연도: 올해·내년", () => assert.deepStrictEqual(DP.birthYears("pregnant", today, BACK), [2027, 2026]));
test("태어난 아이: 오늘까지 선택 가능, 내일부터 불가", () => {
  assert(DP.isSelectable(new Date(2026, 9, 1), "born", today, BACK));
  assert(DP.isSelectable(new Date(2026, 5, 20), "born", today, BACK));
  assert(!DP.isSelectable(new Date(2026, 9, 2), "born", today, BACK));
});
test("태어난 아이: 연도 하한(2015-01-01 가능, 2014-12-31 불가) — 시각이 섞인 today 도 같다", () => {
  assert(DP.isSelectable(new Date(2015, 0, 1), "born", new Date(2026, 9, 1, 15, 30), BACK));
  assert(!DP.isSelectable(new Date(2014, 11, 31), "born", today, BACK));
});
test("임신 중: 오늘~오늘+300일만 선택 가능", () => {
  assert(DP.isSelectable(new Date(2026, 9, 1), "pregnant", today, BACK));
  assert(!DP.isSelectable(new Date(2026, 8, 30), "pregnant", today, BACK));
  const last = new Date(today.getTime() + 300 * 86400000);
  assert(DP.isSelectable(last, "pregnant", today, BACK));
  assert(!DP.isSelectable(new Date(last.getTime() + 86400000), "pregnant", today, BACK));
});
test("yearsBack 를 주지 않으면 하한 없이 오늘까지만 본다", () => assert(DP.isSelectable(new Date(1990, 0, 1), "born", today)));
test("일정 모드(schedule): 연도 목록은 후년~작년 [올해+2 … 올해−1] 내림차순 — 2026 → 2028,2027,2026,2025", () => {
  assert.deepStrictEqual(DP.birthYears("schedule", today, BACK), [2028, 2027, 2026, 2025]);
  assert.deepStrictEqual(DP.birthYears("schedule", new Date(2027, 0, 5), BACK), [2029, 2028, 2027, 2026], "해가 바뀌면 같이 이동");
});
test("일정 모드: 과거·미래 모두 선택 가능, 범위는 작년 1/1 ~ 후년 12/31", () => {
  const S = (d) => DP.isSelectable(d, "schedule", today, BACK);
  assert(S(new Date(2026, 9, 1)) && S(new Date(2026, 9, 2)), "오늘과 내일");
  assert(S(new Date(2025, 0, 1)) && S(new Date(2028, 11, 31)), "경계");
  assert(!S(new Date(2024, 11, 31)) && !S(new Date(2029, 0, 1)), "경계 밖");
});
test("일정 모드는 생년월일 모드와 독립: 같은 미래 날짜가 born 에서는 막히고 schedule 에서는 열린다", () => {
  const d = new Date(2027, 2, 5);
  assert(!DP.isSelectable(d, "born", today, BACK));
  assert(DP.isSelectable(d, "schedule", today, BACK));
  assert(!DP.isSelectable(new Date(2020, 0, 1), "schedule", today, BACK), "yearsBack 와 무관하게 작년까지만");
});
test("minDate: 그 날짜 이전은 막고(연속 일정의 마지막 날), 당일 이후는 열린다 — 모든 stage 에서", () => {
  const min = new Date(2026, 9, 10, 15, 0); // 시각이 섞여도 날짜 기준
  assert(!DP.isSelectable(new Date(2026, 9, 9), "schedule", today, BACK, min));
  assert(DP.isSelectable(new Date(2026, 9, 10), "schedule", today, BACK, min));
  assert(DP.isSelectable(new Date(2026, 9, 11), "schedule", today, BACK, min));
  assert(!DP.isSelectable(new Date(2026, 5, 1), "born", today, BACK, new Date(2026, 6, 1)));
  assert(DP.isSelectable(new Date(2026, 9, 5), "schedule", today, BACK, null), "null 이면 제한 없음");
});
test("기존 호출(minDate 인자 없음)은 동작이 같다 — born/pregnant 결과 불변", () => {
  assert(DP.isSelectable(new Date(2015, 0, 1), "born", today, BACK));
  assert(!DP.isSelectable(new Date(2014, 11, 31), "born", today, BACK));
  assert(DP.isSelectable(new Date(2026, 9, 1), "pregnant", today, BACK));
  assert.deepStrictEqual(DP.birthYears("pregnant", today, BACK), [2027, 2026]);
});
test("마크업: 온보딩과 같은 클래스·구조, ID 는 prefix 규칙, hidden 입력은 `${prefix}-date`", () => {
  const html = DP.markup("ep");
  ["date-picker-wrap", "date-picker-trigger", "date-popup hidden", "date-popup-header", "date-popup-weekdays", "date-popup-grid"].forEach((c) => assert(html.includes(c), c));
  const ids = DP.elementIds("ep");
  Object.values(ids).forEach((id) => assert(html.includes(`id="${id}"`), id));
  assert.strictEqual(ids.hidden, "ep-date");
  assert(html.includes('type="hidden"'));
});
test("정적 확인: 저장소·네트워크·Firestore 를 참조하지 않는다", () => {
  const src = require("fs").readFileSync(require("path").join(__dirname, "..", "js", "date-picker.js"), "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
  ["localStorage", "firebase", "fetch(", "FamilySync", "toISOString"].forEach((w) => assert(!src.includes(w), w));
});

console.log(`\n${passed}개 통과${process.exitCode ? ", 일부 실패" : ""}`);
