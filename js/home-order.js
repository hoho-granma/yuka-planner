/*
 * 홈 섹션 순서(E 1-3): 아이 나이에 따라 '이번 달 챙길 것'(todo)과 '오늘·이번 주 우리 가족'(family)의 순서만 정한다. 순수 함수(DOM·저장소 없음), 섹션은 둘 다 유지한다.
 *   가장 어린 아이가 36개월 미만이거나 임신 중이거나 아이가 없으면 ["todo","family"], 36개월 이상이면 ["family","todo"].
 */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else root.HomeOrder = factory();
})(typeof window !== "undefined" ? window : global, function () {
  "use strict";

  const THRESHOLD_MONTHS = 36;
  const TODO_FIRST = Object.freeze(["todo", "family"]);
  const FAMILY_FIRST = Object.freeze(["family", "todo"]);

  const toDate = (v) => {
    if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
    if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v)) { const d = new Date(v.slice(0, 10) + "T00:00:00"); return isNaN(d.getTime()) ? null : d; }
    return null;
  };
  /** 만 개월 수(생일의 '일'이 지나야 한 달 채움). 미래 생일이면 0. */
  function monthsBetween(birth, asOf) {
    let m = (asOf.getFullYear() - birth.getFullYear()) * 12 + (asOf.getMonth() - birth.getMonth());
    if (asOf.getDate() < birth.getDate()) m -= 1;
    return Math.max(0, m);
  }
  /**
   * children: [{ birthDate: Date|"YYYY-MM-DD", stage?: "pregnant"|"born" }](출산예정일인 임신 중 아이는 stage "pregnant"), pregnant: 현재 아이가 임신 중인가(선택), asOf: 기준일(기본 오늘).
   * 반환: ["todo","family"] | ["family","todo"] (새 배열). 날짜를 읽을 수 없는 아이는 무시하고, 판단할 근거가 없으면 챙길 것 먼저.
   */
  function homeSectionOrder(opts) {
    const o = opts || {};
    const asOf = toDate(o.asOf) || new Date();
    const kids = Array.isArray(o.children) ? o.children.filter(Boolean) : [];
    if (o.pregnant === true || kids.some((c) => c.stage === "pregnant")) return TODO_FIRST.slice();
    const ages = kids.map((c) => toDate(c.birthDate)).filter(Boolean).map((b) => monthsBetween(b, asOf));
    if (!ages.length) return TODO_FIRST.slice();
    return Math.min(...ages) >= THRESHOLD_MONTHS ? FAMILY_FIRST.slice() : TODO_FIRST.slice();
  }
  return { homeSectionOrder, monthsBetween, THRESHOLD_MONTHS };
});
