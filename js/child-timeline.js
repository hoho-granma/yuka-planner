/*
 * ChildTimeline — 아이의 나이·서비스 범위·체크리스트 그룹을 한 곳에서 답하는 순수 모듈(A1: 신규, 아직 소비자 없음).
 * DOM·Firestore·localStorage·다른 모듈에 의존하지 않는다(Node에서 그대로 테스트: test/child-timeline.test.js).
 *
 * A1~A2 범위의 원칙
 *   - 개월 수 계산은 기존 schedule.js ageInMonths / hn-logic.js ageMonthsAt 과 **결과가 완전히 같다**
 *     (오늘 일자 < 출생 일자이면 미완 개월, 하한 0). 말일 규칙(DateCalc)으로 통일하지 않는다 — 이슈 I-1은 별도 처리.
 *   - 서비스 범위(SERVICE_RANGE.maxMonths)는 A6-3에서 36 → 72개월로 올렸다. 기존 Todo·지원금의 노출은 LEGACY_TODO_CAP_MONTHS(36)로 보존한다(아래 상수·isLegacyCapped 주석).
 *   - 학교·학년 계층(school)은 **정책(policy)을 주입했을 때만** 계산한다. 정책 데이터는 이 모듈에도 저장소에도 없다(입학 학년도 산정·학년도 시작월 등은
 *     공식 확인 전). 정책이 없거나 검증 상태가 "확인됨"이 아니면 school 은 항상 null — 즉 기존 호출(compute({birthDate, asOf, stage}))의 결과는 A1~A4 와 같다.
 *   - 날짜 산술은 하지 않는다(출생·기준 날짜의 연·월 숫자만 읽는다). 2/29생 처리(addYearsClamped)는 이 단계에서 필요 없다.
 *   - 체크리스트 그룹 표: 24~36까지는 app.js LATE_BUCKETS 와 같은 값이고, A6-3에서 37~72개월 구간 3개를 뒤에 덧붙였다(기존 구간은 그대로).
 */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else root.ChildTimeline = factory();
})(typeof window !== "undefined" ? window : global, function () {
  "use strict";

  // pickerYearsBack: 생년월일 선택기의 연도 하한 = 올해 − 11 = 올해 초등 6학년의 출생연도(예: 2026년 → 2015년생).
  // 근거: 출생연도 기준 6년 뒤에 초1 입학 → 초6 = 출생연도 + 11. 취학 기준의 공식 확인(설계 Q-C)은 별도이며 이 값은 입력 가능한 연도 범위일 뿐 일정 계산에 쓰지 않는다.
  // 서비스 전체 상한. 이 값 이하의 이벤트만 화면에 나올 수 있다(A6-3: 36 → 72). 개별 Todo가 더 일찍 끊기는 것은 아래 LEGACY_TODO_CAP_MONTHS.
  const SERVICE_RANGE = Object.freeze({ maxMonths: 72, pickerYearsBack: 11 });

  // A6-3: "기존 Todo·지원금의 보존 상한". 서비스 상한을 72로 올려도 아래 isLegacyCapped 에 해당하는 항목은 이 값까지만 보인다
  // (기존 0~36개월 동작 보존. "72개월에는 필요 없다"는 판단이 아니라 이번 단계에서 새로 설계하지 않는다는 뜻 — 후속 단계에서 재검토).
  // 적용 위치: isEventVisible(app.js visibleSchedule) · effectiveMaxMonths(app.js repeatMonthRangeOf 반복 cap). 엔진(todo-engine.js)에는 상한이 없다.
  // 36개월: 세는 나이 표기 시작 · '36개월 이상' 메뉴/AUTO 경계 · 영유아/학령전 경계 · 기존 Todo 보존 상한이 모두 같은 값이다. 값의 출처는 이 한 곳(W1) — 아래 이름들은 의미만 다르다.
  const OVER36_FROM_MONTHS = 36;
  const LEGACY_TODO_CAP_MONTHS = OVER36_FROM_MONTHS;

  // stageBand 의 영유아/학령전 경계(INFANT_TODDLER ↔ PRESCHOOL). "Todo 노출 상한"과 다른 개념이라 SERVICE_RANGE.maxMonths 를 따라 움직이면 안 된다.
  const INFANT_TODDLER_MAX_MONTHS = OVER36_FROM_MONTHS;

  const CHECKLIST_BUCKETS = Object.freeze([
    Object.freeze({ start: 13, end: 17, label: "만 1세 (13~17개월)" }),
    Object.freeze({ start: 18, end: 23, label: "만 1세 (18~23개월)" }),
    Object.freeze({ start: 24, end: 36, label: "만 2세 (24~36개월)" }),
    // A6-3: 37~72개월 구간(위 3개의 경계·라벨·순서는 변경하지 않는다)
    Object.freeze({ start: 37, end: 47, label: "만 3세 (37~47개월)" }),
    Object.freeze({ start: 48, end: 59, label: "만 4세 (48~59개월)" }),
    Object.freeze({ start: 60, end: 72, label: "만 5~6세 (60~72개월)" }),
    // 학령기 확장 1단계: 73~144개월(만 12세까지) 구간. 위 6개의 경계·라벨·순서는 변경하지 않는다.
    Object.freeze({ start: 73, end: 95, label: "만 6~7세 (73~95개월)" }),
    Object.freeze({ start: 96, end: 119, label: "만 8~9세 (96~119개월)" }),
    Object.freeze({ start: 120, end: 144, label: "만 10~12세 (120~144개월)" }),
  ]);

  // 학령기 확장: 전역 서비스 범위(SERVICE_RANGE.maxMonths 72)는 그대로 두고, 정의가 직접 옵트인한 이벤트만 72개월 너머(최대 144개월)에서 보인다.
  // 정의 필드 extendedVisibility: [{ occurrenceKeys?: ["dose-5"], fromAgeMonths: 73, maxVisibleMonths: 144 }]
  //   - 규칙에 걸린 이벤트는 "아이의 현재 월령 >= fromAgeMonths" 이고 "이벤트 시점 월령 <= maxVisibleMonths" 일 때만 보인다(72개월 이하 아이에게는 보이지 않음 → 기존 화면 불변).
  //   - occurrenceKeys 가 없으면 그 정의의 모든 회차에 적용, 있으면 그 회차에만. 규칙이 없는 정의·이벤트는 기존 규칙(72/36) 그대로.
  const EXTENDED_MAX_MONTHS = 144;

  /** 완료된 개월 수 — 기존 ageInMonths/ageMonthsAt 과 동일한 규칙(말일 clamp 아님). */
  function completedMonths(birthDate, asOf) {
    return Math.max(0, signedMonths(birthDate, asOf));
  }
  /** 하한 없는 완료 개월 수(출산 전이면 음수). 월령 계산의 유일한 구현 — completedMonths 는 이것의 하한 0 판이다. */
  function signedMonths(birthDate, asOf) {
    let m = (asOf.getFullYear() - birthDate.getFullYear()) * 12 + (asOf.getMonth() - birthDate.getMonth());
    if (asOf.getDate() < birthDate.getDate()) m -= 1;
    return m;
  }

  /** 화면 표기 "생후 N개월"(현재 헤더·기록 탭과 같은 문자열). */
  function ageLabel(totalMonths) {
    return `생후 ${totalMonths}개월`;
  }

  /** 36개월부터는 개월 수 대신 세는 나이(한국 나이)로 표기한다: asOf 연도 − 출생 연도 + 1(생일과 무관). */
  const COUNTING_AGE_FROM_MONTHS = OVER36_FROM_MONTHS;
  /**
   * 화면 표기: 36개월 미만은 "생후 N개월"(ageLabel 그대로), 36개월 이상은 "N세"(세는 나이).
   * 36개월 이상 판정은 완료 개월 수(completedMonths) 기준, 연도 차는 asOf 연도 기준이다. 임신 중 표기는 호출하는 쪽(app.js)이 따로 한다.
   */
  function ageLabelAt(birthDate, asOf) {
    const months = completedMonths(birthDate, asOf);
    return months < COUNTING_AGE_FROM_MONTHS ? ageLabel(months) : `${asOf.getFullYear() - birthDate.getFullYear() + 1}세`;
  }

  /** 이벤트 시점 월령이 서비스 범위 안인가(날짜만 본다). range 를 주면 그 상한으로 판정한다(예: { maxMonths: LEGACY_TODO_CAP_MONTHS }). */
  function isWithinServiceRange(birthDate, eventDate, range) {
    return completedMonths(birthDate, eventDate) <= (range || SERVICE_RANGE).maxMonths;
  }

  /**
   * 36개월(LEGACY_TODO_CAP_MONTHS)까지만 보여주는 "기존 범위 보존" 정의인가 — A6-3 규칙(데이터 의미 그대로, !endMonth 식으로 넓히지 않는다):
   *   - triggerType === "MILESTONE_EVENT"            (마일스톤 대기: DV-09, OR-01, SF-02, SF-04, SF-05)
   *   - triggerParams.endMonth === null (명시적 null)  (끝 없는 정의: FD-05, FD-09, FD-10, OR-04, VX-FLU)
   * endMonth 가 undefined 인 정의(다회차 접종 등 triggerParams 없음)와 숫자인 정의는 해당하지 않는다.
   * 이 규칙에 걸리는 정의가 정확히 10개라는 것은 test/a6-3-cap.test.js 가 고정한다.
   */
  function isLegacyCappedDefinition(def) {
    if (!def) return false;
    if (def.triggerType === "MILESTONE_EVENT") return true;
    return !!def.triggerParams && def.triggerParams.endMonth === null;
  }

  /** 이벤트 단위 판정: 엔진 이벤트가 아닌 것(지역 지원금 등)은 A6-3 에서 전부 36개월 보존(지원금 검증은 별도 트랙), 엔진 이벤트는 정의 규칙을 따른다. */
  function isLegacyCapped(event) {
    const def = event && event.isEngineEvent && event.detail ? event.detail.definition : null;
    if (!def) return true;
    return isLegacyCappedDefinition(def);
  }

  /** 이 이벤트에 걸리는 학령기 확장 규칙(없으면 null). 정의의 extendedVisibility 중 회차가 맞는 첫 규칙. */
  function extendedRuleOf(event) {
    const def = event && event.isEngineEvent && event.detail ? event.detail.definition : null;
    const rules = def && def.extendedVisibility;
    if (!Array.isArray(rules)) return null;
    const key = event.detail.instance && event.detail.instance.occurrenceKey;
    return rules.find((r) => r && Number.isInteger(r.fromAgeMonths) && Number.isInteger(r.maxVisibleMonths) && (!Array.isArray(r.occurrenceKeys) || r.occurrenceKeys.indexOf(key) >= 0)) || null;
  }

  /** 이 이벤트가 보여질 수 있는 최대 월령 — 72(서비스 상한) 또는 36(보존 상한), 학령기 확장 규칙이 있으면 그 상한(최대 144). 반복 행 cap 도 이 값을 쓴다. */
  function effectiveMaxMonths(event) {
    const rule = extendedRuleOf(event);
    if (rule) return Math.min(rule.maxVisibleMonths, EXTENDED_MAX_MONTHS);
    return isLegacyCapped(event) ? Math.min(LEGACY_TODO_CAP_MONTHS, SERVICE_RANGE.maxMonths) : SERVICE_RANGE.maxMonths;
  }

  /**
   * 학교 단계(SCHOOL_TERM_WINDOW) 정의의 노출 판정 — 월령 상한(72/36)과 무관하게 "지금 아이의 학교 단계"로 정한다(A6-4).
   * def.visibleStages 의 값: "PRE_ELEMENTARY"(예비초등) · "GRADE_1"(초1). 현재 데이터는 PRE_ELEMENTARY 만 쓴다.
   * stage = schedule.js 가 이벤트에 실은 { stageBand, grade } (정책이 없거나 미확인이면 null → 보이지 않음).
   * 주의: 이 정의의 triggerParams.startMonth/endMonth 는 월령이 아니라 달력 월(1~12)이다 — 월령 규칙(isLegacyCapped·반복 행)과 섞지 않는다.
   */
  function isSchoolTermDefinition(def) {
    return !!def && def.triggerType === "SCHOOL_TERM_WINDOW";
  }
  function isSchoolStageVisible(def, stage) {
    if (!stage || !Array.isArray(def.visibleStages)) return false;
    if (def.visibleStages.indexOf(stage.stageBand) >= 0) return true;
    // 초1~초6: "GRADE_<n>" (현재 데이터는 PRE_ELEMENTARY 와 GRADE_1 만 쓴다. 초4 등은 학령기 확장 2단계에서 쓴다)
    return typeof stage.grade === "number" && def.visibleStages.indexOf("GRADE_" + stage.grade) >= 0;
  }

  /** app.js visibleSchedule 의 노출 판정: 학교 단계 정의는 현재 학교 단계로, 그 밖에는 이벤트 날짜의 월령이 그 이벤트의 유효 상한 이하인가. */
  function isEventVisible(birthDate, event, asOf) {
    const def = event && event.isEngineEvent && event.detail ? event.detail.definition : null;
    if (isSchoolTermDefinition(def)) return isSchoolStageVisible(def, event.schoolStage);
    const rule = extendedRuleOf(event);
    if (rule) return completedMonths(birthDate, asOf || new Date()) >= rule.fromAgeMonths && completedMonths(birthDate, event.date) <= effectiveMaxMonths(event);
    return completedMonths(birthDate, event.date) <= effectiveMaxMonths(event);
  }

  /**
   * 화면에 실제로 노출할지 — isEventVisible(월령·학교 단계 판정, 36개월 미만·임신 중 노출은 이것만으로 정해진다) + 36개월 이상 항목별 허용.
   * 36개월 이상(asOf 기준 완료 개월 ≥ 36) 아이에게는 허용 표식(autoAfter36 — schedule.js 가 data/policy/auto-after36.json 으로 단다)이 있는 항목만 보인다. 기본은 숨김.
   */
  function isEventShown(birthDate, event, asOf) {
    if (!(birthDate instanceof Date)) return isEventVisible(birthDate, event, asOf);
    const now = asOf || new Date();
    if (completedMonths(birthDate, now) < LEGACY_TODO_CAP_MONTHS) return isEventVisible(birthDate, event, asOf);
    if (!(event && event.autoAfter36 === true)) return false;
    // 36개월 이상: 앞으로 챙길 것만 — 끝(기간·마감)이 이번 달 1일 이전이면 숨긴다.
    const def = event.isEngineEvent && event.detail ? event.detail.definition : null;
    if (def && def.ageCap) { // 나이 상한이 있는 지원금(아동수당 SB-04): 창이 지났어도 신청 가능 연도(예외 출생연도 포함) 안이면 보이고, 상한을 넘으면 숨긴다
      if (ageCapExceeded(def.ageCap, birthDate, now)) return false;
    } else if (endOf(birthDate, event) < new Date(now.getFullYear(), now.getMonth(), 1)) return false;
    // 지역 지원금(엔진 밖) 이벤트는 날짜의 월령이 보존 상한(36)을 넘어도 허용 표식이 있으면 노출한다(경기 초4 치과주치의 등). 엔진 이벤트는 기존 판정.
    if (!(event.isEngineEvent && event.detail)) return true;
    return isEventVisible(birthDate, event, asOf);
  }
  /** 연도별 신청 가능 나이 상한 초과 여부(def.ageCap). hn-logic ageCapExceeded 와 같은 규칙(test/h6 가 같은 결과임을 고정). 판단할 수 없으면 false. */
  function ageCapExceeded(cap, birthDate, today) {
    if (!cap || !cap.maxMonthsByYear || !(birthDate instanceof Date) || !(today instanceof Date)) return false;
    const months = completedMonths(birthDate, today);
    const year = today.getFullYear();
    if ((cap.exceptions || []).some((x) => x.birthYear === birthDate.getFullYear() && year >= x.fromYear && year <= x.toYear)) return false;
    const years = Object.keys(cap.maxMonthsByYear).map(Number).sort((a, b) => a - b);
    if (!years.length) return false;
    const key = year <= years[0] ? years[0] : year >= years[years.length - 1] ? years[years.length - 1] : year;
    return months > cap.maxMonthsByYear[String(key)];
  }
  /** 이벤트가 끝나는 시점: 기간(windowEnd) → 마감(deadlineDate) → 상한 월령이 있는 지원금은 그 월령이 끝나는 날 → 없으면 시작 날짜(상시 지원은 아주 먼 미래). */
  function endOf(birthDate, event) {
    if (event.windowEnd instanceof Date) return event.windowEnd;
    if (event.deadlineDate instanceof Date) return event.deadlineDate;
    if (!event.isEngineEvent && event.detail && event.detail.deadlineType === "ongoing") {
      const mx = event.maxAgeMonths;
      return typeof mx === "number" && isFinite(mx) ? new Date(birthDate.getFullYear(), birthDate.getMonth() + mx + 1, birthDate.getDate()) : new Date(8640000000000000);
    }
    return event.fixedDate instanceof Date ? event.fixedDate : event.date;
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
    else stageBand = completedMonths(birthDate, asOf) <= INFANT_TODDLER_MAX_MONTHS ? "INFANT_TODDLER" : "PRESCHOOL";
    return { enrollmentYear, schoolYear, yearsToEnrollment, grade, stageBand, semester: null, gradeLabel: typeof grade === "number" ? `초${grade}` : null };
  }

  /**
   * 초등 입학 시기 선택지(프로필 시트): 기본(출생연도 기준)·한 해 일찍·한 해 늦게. 정책이 없거나 확인되지 않으면 null.
   * 반환 { defaultYear, current: "early"|"default"|"late"|"custom", options: [{key, year}] } — 현재 값이 세 가지 밖이면 "custom"(입학 학년도는 current 연도로 표시).
   * override 가 기본과 같으면 기본으로 본다. 입력은 바꾸지 않는다.
   */
  function enrollmentOptions(birthDate, asOf, policy, override) {
    const base = computeSchool(birthDate, asOf, policy, {});
    if (!base) return null;
    const d = base.enrollmentYear;
    const options = [{ key: "default", year: d }, { key: "early", year: d - 1 }, { key: "late", year: d + 1 }];
    const has = override !== undefined && override !== null;
    const hit = has ? options.find((o) => o.year === override) : null;
    return { defaultYear: d, currentYear: has ? override : d, current: !has ? "default" : hit ? hit.key : "custom", options };
  }

  /**
   * 한 시점의 연령 요약. 임신 중(stage "pregnant")은 birthDate 가 출산 예정일이라 개월 수 표기를 만들지 않는다(label null, 기존 임신 표기는 app.js).
   * years/months 는 totalMonths 의 분해. days 는 넣지 않는다(말일 규칙 결정 전).
   */
  // ── W1: stage·나이·학년 단일 진입점(내부 판단용 — 화면 메뉴가 아니다) ──────────────────────────────
  // 학년 기본값: 정책이 없거나 확인되지 않았을 때 쓰는 법령 기본값(입학 = 출생연도 + 7, 학년도 3월 시작 — data/policy/school.json 과 같은 값).
  const DEFAULT_ENROLLMENT_OFFSET_YEARS = 7;
  const DEFAULT_SCHOOL_YEAR_START_MONTH = 3;
  const STAGES = Object.freeze({ PREGNANT: "PREGNANT", INFANT: "INFANT", TODDLER: "TODDLER", AGE_3_5: "AGE_3_5", AGE_6_7: "AGE_6_7", ELEMENTARY: "ELEMENTARY", SECONDARY: "SECONDARY" });
  // 월령 경계(완료 개월): 0~11 영아 · 12~35 유아 · 36~71 만 3~5세 · 72~95 만 6~7세 · 학년이 1~6이면 초등(학년이 월령보다 우선)
  const STAGE_EDGES = Object.freeze({ TODDLER_FROM: 12, AGE_3_5_FROM: OVER36_FROM_MONTHS, AGE_6_7_FROM: 72 });

  /**
   * 초등 학년 번호: 0 = 입학 전, 1~6 = 초N, 7 = 초등 이후. 정책(확인됨)이 있으면 computeSchool 과 같은 규칙, 없으면 법령 기본값.
   * opts.enrollmentYearOverride(조기입학·유예)가 있으면 입학 학년도를 그 값으로 바꾼다. 교육 트렌드(edu-trend)와 일정 계산이 같은 규칙을 쓰게 한다.
   */
  function gradeNumber(birthDate, asOf, policy, opts) {
    const s = policy ? computeSchool(birthDate, asOf, policy, opts) : null;
    if (s) return typeof s.grade === "number" ? s.grade : s.grade === "AFTER_ELEMENTARY" ? 7 : 0;
    const override = opts && opts.enrollmentYearOverride;
    const enrollmentYear = isInt(override) ? override : birthDate.getFullYear() + DEFAULT_ENROLLMENT_OFFSET_YEARS;
    const schoolYear = asOf.getMonth() + 1 >= DEFAULT_SCHOOL_YEAR_START_MONTH ? asOf.getFullYear() : asOf.getFullYear() - 1;
    const n = schoolYear - enrollmentYear + 1;
    return n < 1 ? 0 : n > 6 ? 7 : n;
  }

  /**
   * 입력 { birthDate, asOf?, stage?("pregnant"|"born"), policy?, enrollmentYearOverride? } → { stage, ageMonths, grade, isPregnant }.
   *   임신 중이면 { stage:"PREGNANT", ageMonths:null, grade:null, isPregnant:true }.
   *   grade: 0(입학 전)·1~6·7(초등 이후). stage 는 위 STAGES — 초등(grade 1~6)은 학년이 월령보다 우선한다.
   */
  function stageOf({ birthDate, asOf, stage, policy, enrollmentYearOverride }) {
    if (stage === "pregnant") return { stage: STAGES.PREGNANT, ageMonths: null, grade: null, isPregnant: true };
    const now = asOf || new Date();
    const ageMonths = completedMonths(birthDate, now);
    const grade = gradeNumber(birthDate, now, policy, { enrollmentYearOverride });
    const st = grade === 7 ? STAGES.SECONDARY // 초등 이후(중1~)
      : grade >= 1 && grade <= 6 ? STAGES.ELEMENTARY
      : ageMonths < STAGE_EDGES.TODDLER_FROM ? STAGES.INFANT
      : ageMonths < STAGE_EDGES.AGE_3_5_FROM ? STAGES.TODDLER
      : ageMonths < STAGE_EDGES.AGE_6_7_FROM ? STAGES.AGE_3_5
      : STAGES.AGE_6_7; // 72개월 이상이어도 아직 입학 전(grade 0)이면 만 6~7세
    return { stage: st, ageMonths, grade, isPregnant: false };
  }

  function compute({ birthDate, asOf, stage, policy, enrollmentYearOverride }) {
    const totalMonths = completedMonths(birthDate, asOf);
    return {
      age: { years: Math.floor(totalMonths / 12), months: totalMonths % 12, totalMonths },
      label: stage === "pregnant" ? null : ageLabelAt(birthDate, asOf),
      // 임신 중(birthDate = 출산 예정일)에는 학년을 계산하지 않는다. 정책이 없으면 기존과 같이 null.
      school: stage === "pregnant" || !policy ? null : computeSchool(birthDate, asOf, policy, { enrollmentYearOverride }),
    };
  }

  return { SERVICE_RANGE, EXTENDED_MAX_MONTHS, OVER36_FROM_MONTHS, STAGES, STAGE_EDGES, gradeNumber, stageOf, LEGACY_TODO_CAP_MONTHS, INFANT_TODDLER_MAX_MONTHS, CHECKLIST_BUCKETS, completedMonths, signedMonths, ageLabel, ageLabelAt, isWithinServiceRange, isLegacyCappedDefinition, isLegacyCapped, extendedRuleOf, effectiveMaxMonths, isEventVisible, isEventShown, isSchoolTermDefinition, enrollmentOptions, checklistBucket, checklistGroupLabel, computeSchool, compute };
});
