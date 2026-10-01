/*
 * ChildTimeline — 아이의 나이·서비스 범위·체크리스트 그룹을 한 곳에서 답하는 순수 모듈(A1: 신규, 아직 소비자 없음).
 * DOM·Firestore·localStorage·다른 모듈에 의존하지 않는다(Node에서 그대로 테스트: test/child-timeline.test.js).
 *
 * A1~A2 범위의 원칙
 *   - 개월 수 계산은 기존 schedule.js ageInMonths / hn-logic.js ageMonthsAt 과 **결과가 완전히 같다**
 *     (오늘 일자 < 출생 일자이면 미완 개월, 하한 0). 말일 규칙(DateCalc)으로 통일하지 않는다 — 이슈 I-1은 별도 처리.
 *   - 서비스 범위(SERVICE_RANGE)는 현재 값 그대로(36개월). 값을 올리는 것은 별도 승인 사항이다.
 *   - 학교·학년 계층(school)은 **정책(policy)을 주입했을 때만** 계산한다. 정책 데이터는 이 모듈에도 저장소에도 없다(입학 학년도 산정·학년도 시작월 등은
 *     공식 확인 전). 정책이 없거나 검증 상태가 "확인됨"이 아니면 school 은 항상 null — 즉 기존 호출(compute({birthDate, asOf, stage}))의 결과는 A1~A4 와 같다.
 *   - 날짜 산술은 하지 않는다(출생·기준 날짜의 연·월 숫자만 읽는다). 2/29생 처리(addYearsClamped)는 이 단계에서 필요 없다.
 *   - 체크리스트 그룹 표는 app.js LATE_BUCKETS 와 같은 값(24~36 포함).
 */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else root.ChildTimeline = factory();
})(typeof window !== "undefined" ? window : global, function () {
  "use strict";

  // pickerYearsBack: 생년월일 선택기의 연도 하한 = 올해 − 11 = 올해 초등 6학년의 출생연도(예: 2026년 → 2015년생).
  // 근거: 출생연도 기준 6년 뒤에 초1 입학 → 초6 = 출생연도 + 11. 취학 기준의 공식 확인(설계 Q-C)은 별도이며 이 값은 입력 가능한 연도 범위일 뿐 일정 계산에 쓰지 않는다.
  const SERVICE_RANGE = Object.freeze({ maxMonths: 36, pickerYearsBack: 11 });

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

  // ── 학교·학년 (A5-1): 정책 주입형, 순수 ─────────────────────────────────────────────
  // policy 형식(설계 §13-8): 각 키 { value, verificationStatus: "확인됨" | "확인필요" | …, source }.
  //   enrollmentOffsetYears  출생연도 + N = 초등 입학 학년도 (override 가 없을 때 필요)
  //   schoolYearStartMonth   학년도 시작 월(1~12). 예: 3 → 3월~다음 해 2월이 한 학년도
  //   preElementaryYearsBefore  입학 학년도 몇 해 전을 "예비초등"으로 볼지(제품 정의, Q-C). 예: 1 → 입학 직전 학년도
  // 필요한 키가 하나라도 없거나 키별 허용 상태(아래 ALLOWED_STATUS)가 아니거나 값이 올바르지 않으면 계산하지 않는다(null) — 확인 전 값으로 확정 표시를 만들지 않기 위해서다.
  // 키별 허용 상태(A6-1): 법령 근거 값은 "확인됨"만, 제품 정의 값(preElementaryYearsBefore)은 kind=PRODUCT_DEFINITION + "제품정의"만 쓴다.
  const ALLOWED_STATUS = {
    enrollmentOffsetYears: ["확인됨"],
    schoolYearStartMonth: ["확인됨"],
    preElementaryYearsBefore: ["제품정의"],
  };
  const REQUIRED_KIND = { preElementaryYearsBefore: "PRODUCT_DEFINITION" };
  function verifiedPolicyValue(policy, key, ok) {
    const e = policy && policy[key];
    const allowed = ALLOWED_STATUS[key] || ["확인됨"];
    if (!e || allowed.indexOf(e.verificationStatus) < 0) return undefined;
    if (REQUIRED_KIND[key] && e.kind !== REQUIRED_KIND[key]) return undefined;
    return ok(e.value) ? e.value : undefined;
  }
  const isInt = (n) => typeof n === "number" && Number.isInteger(n);

  /**
   * 학교·학년 요약. 정책이 없거나 확인되지 않았으면 null.
   *   enrollmentYear    입학 학년도 — opts.enrollmentYearOverride(정수, 사용자 입력: 조기입학·유예)가 우선, 없으면 출생연도 + enrollmentOffsetYears
   *   schoolYear        asOf 가 속한 학년도(시작월 이전이면 전년도)
   *   yearsToEnrollment enrollmentYear − schoolYear (입학 학년도 자체는 0, 입학 전은 양수, 입학 후는 음수)
   *   grade             "PRESCHOOL" | 1..6 | "AFTER_ELEMENTARY"
   *   stageBand         "INFANT_TODDLER" | "PRESCHOOL" | "PRE_ELEMENTARY" | "ELEMENTARY_LOW" | "ELEMENTARY_HIGH" (설계 §13-3의 5종). grade 가 "AFTER_ELEMENTARY"(초6 이후)이면 null
   *   gradeLabel        1~6학년이면 "초N", 아니면 null (화면 문구는 이 단계에서 정하지 않는다 — label 은 기존 "생후 N개월" 그대로)
   * semester 는 학기 경계 정책이 아직 없어 null.
   */
  function computeSchool(birthDate, asOf, policy, opts) {
    const startMonth = verifiedPolicyValue(policy, "schoolYearStartMonth", (v) => isInt(v) && v >= 1 && v <= 12);
    const preBefore = verifiedPolicyValue(policy, "preElementaryYearsBefore", (v) => isInt(v) && v >= 1);
    if (startMonth === undefined || preBefore === undefined) return null;
    const override = opts && opts.enrollmentYearOverride;
    let enrollmentYear;
    if (override !== undefined && override !== null) {
      if (!isInt(override)) return null;
      enrollmentYear = override;
    } else {
      const offset = verifiedPolicyValue(policy, "enrollmentOffsetYears", (v) => isInt(v) && v >= 1);
      if (offset === undefined) return null;
      enrollmentYear = birthDate.getFullYear() + offset;
    }
    const schoolYear = asOf.getMonth() + 1 >= startMonth ? asOf.getFullYear() : asOf.getFullYear() - 1;
    const yearsToEnrollment = enrollmentYear - schoolYear;
    const n = schoolYear - enrollmentYear + 1; // 입학 학년도 = 1학년
    const grade = n < 1 ? "PRESCHOOL" : n <= 6 ? n : "AFTER_ELEMENTARY";
    let stageBand;
    if (typeof grade === "number") stageBand = grade <= 3 ? "ELEMENTARY_LOW" : "ELEMENTARY_HIGH";
    else if (grade === "AFTER_ELEMENTARY") stageBand = null; // 서비스 범위(초6) 밖 — 졸업 후 판정은 grade 로 한다
    else if (yearsToEnrollment === preBefore) stageBand = "PRE_ELEMENTARY";
    else stageBand = completedMonths(birthDate, asOf) <= SERVICE_RANGE.maxMonths ? "INFANT_TODDLER" : "PRESCHOOL";
    return { enrollmentYear, schoolYear, yearsToEnrollment, grade, stageBand, semester: null, gradeLabel: typeof grade === "number" ? `초${grade}` : null };
  }

  /**
   * 한 시점의 연령 요약. 임신 중(stage "pregnant")은 birthDate 가 출산 예정일이라 개월 수 표기를 만들지 않는다(label null, 기존 임신 표기는 app.js).
   * years/months 는 totalMonths 의 분해. days 는 넣지 않는다(말일 규칙 결정 전).
   */
  function compute({ birthDate, asOf, stage, policy, enrollmentYearOverride }) {
    const totalMonths = completedMonths(birthDate, asOf);
    return {
      age: { years: Math.floor(totalMonths / 12), months: totalMonths % 12, totalMonths },
      label: stage === "pregnant" ? null : ageLabel(totalMonths),
      // 임신 중(birthDate = 출산 예정일)에는 학년을 계산하지 않는다. 정책이 없으면 기존과 같이 null.
      school: stage === "pregnant" || !policy ? null : computeSchool(birthDate, asOf, policy, { enrollmentYearOverride }),
    };
  }

  return { SERVICE_RANGE, CHECKLIST_BUCKETS, completedMonths, ageLabel, isWithinServiceRange, checklistBucket, checklistGroupLabel, computeSchool, compute };
});
