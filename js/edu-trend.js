/*
 * edu-trend — 「지역 교육 트렌드」(G25 MVP 틀)의 순수 규칙: 학년 계산 · 최소 표본 상태 · '우리 아이 현재 상태'(내가 등록한 학원 일정에서만 계산).
 * 모듈에는 DOM·저장소·네트워크가 없다. 또래 집계 데이터는 아직 없다(수집·동의 구조 확정 전) — 그래서 어떤 평균·순위·비교 수치도 만들지 않는다.
 *
 * 최소 표본 기준(초안 — 서비스 정의서 §7 의 '기준을 설정한다'를 위한 제안값, 사용자 승인 필요):
 *   n < 30 → 데이터 부족(수치 숨김) / 30 ≤ n < 100 → 참고용 / n ≥ 100 → 충분. n 은 같은 지역(시·군·구)·학년의 서로 다른 가구 수.
 * 이 단계에서는 집계 소스가 없으므로 항상 '데이터 부족'(n 을 모름 = 0 으로 본다).
 */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else root.EduTrend = factory();
})(typeof window !== "undefined" ? window : global, function () {
  "use strict";

  const MIN_REFERENCE = 30;
  const MIN_SUFFICIENT = 100;
  const MENU_FROM_MONTHS = 36; // G22 36+ 메뉴와 같은 기준(36개월 이상, 임신 중 제외)

  const STATUS = Object.freeze({
    INSUFFICIENT: Object.freeze({ key: "INSUFFICIENT", label: "데이터 부족", showNumbers: false }),
    REFERENCE: Object.freeze({ key: "REFERENCE", label: "참고용 데이터", showNumbers: true }),
    SUFFICIENT: Object.freeze({ key: "SUFFICIENT", label: "충분한 데이터", showNumbers: true }),
  });

  /** n: 같은 지역·학년의 가구 수(모르면 null/undefined → 부족). */
  function statusFor(n) {
    const c = Number.isFinite(n) ? n : 0;
    return c >= MIN_SUFFICIENT ? STATUS.SUFFICIENT : c >= MIN_REFERENCE ? STATUS.REFERENCE : STATUS.INSUFFICIENT;
  }

  /** 학년도(3월 시작) 기준 초등 학년: 1~6. 초등 입학 전이면 0, 졸업 뒤면 7(= 초등 범위 밖). birthDate: Date, today: Date */
  function gradeOf(birthDate, today) {
    const schoolYear = today.getMonth() >= 2 ? today.getFullYear() : today.getFullYear() - 1;
    const g = schoolYear - birthDate.getFullYear() - 6;
    return g < 1 ? 0 : g > 6 ? 7 : g;
  }
  const gradeLabel = (g) => (g >= 1 && g <= 6 ? `초${g}` : g === 0 ? "취학 전" : "초등 이후");

  /**
   * 우리 아이 현재 상태 — 이 가족이 등록한 학원(LESSON) 일정에서만 계산한다(입력하지 않은 정보는 만들지 않는다).
   * docs: 일정 문서들, keys: 이 아이의 childKey 후보(링크 키·가족코드). 반환: { count, lessons:[{id,title,weekly(주 몇 회, 반복이 아니면 null)}] }
   */
  function myLessons(docs, keys) {
    const ks = (keys || []).filter(Boolean);
    const lessons = (docs || [])
      .filter((d) => d && d.category === "LESSON" && d.scope === "CHILD" && d.deletedAt == null && d.status !== "CANCELLED" && Array.isArray(d.childKeys) && d.childKeys.some((k) => ks.includes(k)))
      .map((d) => ({ id: d.id, title: d.title, weekly: d.recurrence && Array.isArray(d.recurrence.byDay) && d.recurrence.byDay.length ? d.recurrence.byDay.length : null }))
      .sort((a, b) => (a.title < b.title ? -1 : a.title > b.title ? 1 : 0));
    return { count: lessons.length, lessons };
  }

  return { MIN_REFERENCE, MIN_SUFFICIENT, MENU_FROM_MONTHS, STATUS, statusFor, gradeOf, gradeLabel, myLessons };
});
