/*
 * ChildTimeline — 아이의 나이·서비스 범위·체크리스트 그룹을 한 곳에서 답하는 순수 모듈(A1: 신규, 아직 소비자 없음).
 * DOM·Firestore·localStorage·다른 모듈에 의존하지 않는다(Node에서 그대로 테스트: test/child-timeline.test.js).
 *
 * A1~A2 범위의 원칙
 *   - 개월 수 계산은 기존 schedule.js ageInMonths / hn-logic.js ageMonthsAt 과 **결과가 완전히 같다**
 *     (오늘 일자 < 출생 일자이면 미완 개월, 하한 0). 말일 규칙(DateCalc)으로 통일하지 않는다 — 이슈 I-1은 별도 처리.
 *   - 서비스 범위(SERVICE_RANGE)는 현재 값 그대로(36개월). 값을 올리는 것은 별도 승인 사항이다.
 *   - 학교·학년 계층은 없다(school: null). 입학 학년도 등 정책값은 공식 확인 전이라 넣지 않는다.
 *   - 체크리스트 그룹 표는 app.js LATE_BUCKETS 와 같은 값(24~36 포함).
 */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else root.ChildTimeline = factory();
})(typeof window !== "undefined" ? window : global, function () {
  "use strict";

  const SERVICE_RANGE = Object.freeze({ maxMonths: 36, pickerYearsBack: 8 });

  const CHECKLIST_BUCKETS = Object.freeze([
    Object.freeze({ start: 13, end: 17, label: "만 1세 (13~17개월)" }),
    Object.freeze({ start: 18, end: 23, label: "만 1세 (18~23개월)" }),
    Object.freeze({ start: 24, end: 36, label: "만 2세 (24~36개월)" }),
  ]);

  /** 완료된 개월 수 — 기존 ageInMonths/ageMonthsAt 과 동일한 규칙(말일 clamp 아님). */
  function completedMonths(birthDate, asOf) {
    let m = (asOf.getFullYear() - birthDate.getFullYear()) * 12 + (asOf.getMonth() - birthDate.getMonth());
    if (asOf.getDate() < birthDate.getDate()) m -= 1;
    return Math.max(0, m);
  }

  /** 화면 표기 "생후 N개월"(현재 헤더·기록 탭과 같은 문자열). */
  function ageLabel(totalMonths) {
    return `생후 ${totalMonths}개월`;
  }

  /** 이벤트 시점 월령이 서비스 범위 안인가 — app.js visibleSchedule 의 `ageInMonths(birth, e.date) <= 36` 과 같은 판정. */
  function isWithinServiceRange(birthDate, eventDate, range) {
    return completedMonths(birthDate, eventDate) <= (range || SERVICE_RANGE).maxMonths;
  }

  /** 체크리스트 그룹 키 — app.js checklistBucket 과 동일. 돌 전은 월별, 13개월~는 구간 시작 월령. */
  function checklistBucket(m) {
    if (typeof m !== "number" || m <= 12) return m;
    const b = CHECKLIST_BUCKETS.find((x) => m >= x.start && m <= x.end);
    return b ? b.start : CHECKLIST_BUCKETS[CHECKLIST_BUCKETS.length - 1].start;
  }

  /** 체크리스트 그룹 라벨 — app.js checklistGroupLabel 과 동일. */
  function checklistGroupLabel(key) {
    const b = CHECKLIST_BUCKETS.find((x) => x.start === key);
    return b && key > 12 ? b.label : `생후 ${key}개월`;
  }

  /**
   * 한 시점의 연령 요약. 임신 중(stage "pregnant")은 birthDate 가 출산 예정일이라 개월 수 표기를 만들지 않는다(label null, 기존 임신 표기는 app.js).
   * years/months 는 totalMonths 의 분해. days 는 넣지 않는다(말일 규칙 결정 전).
   */
  function compute({ birthDate, asOf, stage }) {
    const totalMonths = completedMonths(birthDate, asOf);
    return {
      age: { years: Math.floor(totalMonths / 12), months: totalMonths % 12, totalMonths },
      label: stage === "pregnant" ? null : ageLabel(totalMonths),
      school: null,
    };
  }

  return { SERVICE_RANGE, CHECKLIST_BUCKETS, completedMonths, ageLabel, isWithinServiceRange, checklistBucket, checklistGroupLabel, compute };
});
