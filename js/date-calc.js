/*
 * 날짜 계산 공통 함수 — 달력 월 더하기(말일 보정). DOM·Firestore·localStorage를 전혀 모르는 순수 함수라 Node에서 그대로 테스트한다(test/date-calc.test.js).
 *
 * 규칙(Q-A, 2026-09-30 확정)
 *   - 대상 월에 원래 일자가 있으면 그대로 유지한다.
 *   - 대상 월에 그 일자가 없으면 대상 월의 마지막 날로 보정한다(2026-01-31 + 1개월 = 2026-02-28, 2024-02-29 + 12개월 = 2025-02-28).
 *   - 시·분·초·밀리초는 원본을 그대로 유지한다. 로컬 날짜만 다룬다(toISOString·UTC 변환 금지).
 *
 * 항상 "원본 날짜(예: 출생일)에서 한 번에" 계산한다. 결과를 다시 더하는 연쇄 호출은 값이 달라진다:
 *   f(f(1/31, +1), +1) = 3/28 이지만 f(1/31, +2) = 3/31.
 *
 * 쓰는 곳: js/schedule.js addMonths, js/hn-logic.js addMonthsD (둘 다 이 함수를 부르는 얇은 래퍼).
 * 이 파일은 월 수를 세는 ageInMonths·ageMonthsAt, 일수 근사(todo-engine.js), calAdd(app.js)와 무관하다.
 */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else root.DateCalc = factory();
})(typeof window !== "undefined" ? window : global, function () {
  "use strict";

  const isDate = (v) => Object.prototype.toString.call(v) === "[object Date]";

  /** 월 수는 정수만 받는다. 조용히 잘못 계산하는 것보다 명시적으로 실패시킨다(현재 데이터의 월 값은 전부 정수). */
  function assertMonthCount(n) {
    if (typeof n !== "number" || !Number.isInteger(n)) {
      throw new RangeError(`월 수는 정수여야 합니다: ${String(n)}`);
    }
  }

  /** 그 달의 마지막 날(일). monthIndex는 0~11 (Date의 월과 같음). */
  function lastDayOfMonth(year, monthIndex) {
    return new Date(year, monthIndex + 1, 0).getDate();
  }

  /** date에 n개월(정수, 음수 허용)을 더한다. 대상 월에 그 일자가 없으면 그 달 말일. 입력 Date는 바꾸지 않는다. */
  function addMonthsClamped(date, n) {
    assertMonthCount(n);
    if (!isDate(date)) throw new TypeError("date는 Date여야 합니다");
    if (isNaN(date.getTime())) throw new RangeError("잘못된 Date입니다");
    // 대상 (연,월)을 1일로 먼저 만들어 일자 넘침(1/31 → 3/3)을 원천 차단한 뒤, 일자를 말일 이하로 맞춘다.
    const result = new Date(date.getFullYear(), date.getMonth() + n, 1, date.getHours(), date.getMinutes(), date.getSeconds(), date.getMilliseconds());
    result.setDate(Math.min(date.getDate(), lastDayOfMonth(result.getFullYear(), result.getMonth())));
    return result;
  }

  return { addMonthsClamped, assertMonthCount, lastDayOfMonth };
});
