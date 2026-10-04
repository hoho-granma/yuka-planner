/*
 * Todo 계산 엔진 (Phase 2) — docs/Todo-데이터모델-설계.md v2 그대로 구현한 순수 함수.
 *
 * 이 파일은 아직 index.html에서 로드하지 않는다(Phase 1과 동일한 원칙).
 * js/schedule.js, js/app.js는 건드리지 않았고, 기존 서비스 동작에 영향 없음.
 *
 * 입력/출력은 전부 순수 데이터(Date, plain object)이며 Firestore를 전혀 모른다.
 * Firestore Timestamp → Date 변환은 이 모듈을 호출하는 쪽(다음 단계, app.js 전환 시)의 책임이다.
 *
 * 지원하는 trigger/reference: AGE_WINDOW, DATE_FROM_BIRTH, RELATIVE_TO_EVENT,
 * MILESTONE_EVENT, REFERENCE, eligibilityCondition, variants — 전부 기존 문서에
 * 정의된 것만 쓴다.
 *
 * A5 확장(확장 설계 2단계 §13-5 / Q-G 승인 — "새 trigger type 추가 금지" 원칙의 승인된 예외, docs/한눈육아-A5-설계서.md):
 *   - 정의의 선택 필드 basis: "LEGACY_30D"(미지정 기본 = 지금 동작, 1개월=30일) | "CALENDAR"(달력 기반, 말일 보정).
 *     적용 범위는 AGE_WINDOW 의 startMonth/endMonth 뿐이다. CALENDAR 는 정수 월만 표현한다.
 *   - 새 trigger AGE_CALENDAR_WINDOW { start:{years,months}, end:{years,months}|null } — 정수 월에서는 AGE_WINDOW+CALENDAR 와 같은 결과를 내는 얇은 별칭.
 *   - 새 trigger SCHOOL_TERM_WINDOW { anchor:"ENROLLMENT", yearOffset, startMonth, endMonth } — 입력 timeline.school.enrollmentYear 가 필요하다.
 *     timeline/학교 정보가 없으면 계산하지 않고 status:null + eligibility:"UNKNOWN" 인스턴스를 돌려준다(schedule.js 가 이미 화면에서 제외하는 경로).
 *   - eligibilityCondition.requiredValues:[…] — 선언값이 목록에 있으면 통과. requiredValue(단일)는 그대로 동작한다.
 *   - 입력 timeline(선택): ChildTimeline.compute 결과. 없으면 이전과 완전히 동일하게 동작한다.
 *   기존 정의 데이터는 위 필드를 하나도 쓰지 않는다(정적 테스트로 고정) — 새 코드 경로는 새 필드가 있을 때만 실행된다.
 *   정의 오류(알 수 없는 basis, CALENDAR+비정수 월, 잘못된 새 트리거 파라미터, requiredValue 와 requiredValues 동시 지정 등)는 그 항목만 건너뛰고 console.warn 한다.
 */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    module.exports = factory(() => require("./date-calc.js"));
  } else {
    root.TodoEngine = factory(() => root.DateCalc);
  }
})(typeof window !== "undefined" ? window : global, function (getDateCalc) {
  "use strict";

  const DAY_MS = 24 * 60 * 60 * 1000;
  const MONTH_DAYS = 30; // 근사치. 원본 월령값(예: 14일/30=0.47개월)도 이 근사로 역산 가능하도록 통일했다.

  // ---------------------------------------------------------------------
  // 날짜 유틸 (js/schedule.js의 addMonths/addDays와 같은 목적이지만, 이 엔진은
  // 분수 월령(예: 0.47개월)도 다뤄야 해서 setMonth() 대신 일수 기반으로 계산한다.
  // schedule.js 자체는 건드리지 않았다 — 의도적으로 이 파일 안에 독립 구현했다.)
  // ---------------------------------------------------------------------
  function addDays(date, days) {
    return new Date(date.getTime() + days * DAY_MS);
  }
  function addMonths(date, months) {
    return addDays(date, months * MONTH_DAYS);
  }
  function ageInMonths(birthDate, today) {
    return (today.getTime() - birthDate.getTime()) / DAY_MS / MONTH_DAYS;
  }

  // ── A5: 정의 오류 / 달력 기반 월 계산 ────────────────────────────────────────────────
  /** 정의(데이터) 오류 — calculateTodoInstances 가 그 항목만 건너뛰고 경고한다. 그 외 오류(알 수 없는 trigger.type 등)는 예전처럼 그대로 던진다. */
  class TodoDefinitionError extends Error {
    constructor(message) {
      super(message);
      this.name = "TodoDefinitionError";
    }
  }
  const BASES = Object.freeze(["LEGACY_30D", "CALENDAR"]);
  const isInt = (n) => typeof n === "number" && Number.isInteger(n);
  /** 출생일 + n개월(정수, 말일 보정). DateCalc 의 RangeError 는 정의 오류로 바꾼다. */
  function addCalendarMonths(date, n) {
    if (!isInt(n) || n < 0) throw new TodoDefinitionError(`달력 기반(CALENDAR) 월 값은 0 이상의 정수여야 합니다: ${String(n)}`);
    try {
      return getDateCalc().addMonthsClamped(date, n);
    } catch (e) {
      if (e instanceof RangeError) throw new TodoDefinitionError(e.message);
      throw e;
    }
  }
  function ymPair(v, label) {
    if (!v || typeof v !== "object" || !isInt(v.years) || !isInt(v.months) || v.years < 0 || v.months < 0) {
      throw new TodoDefinitionError(`AGE_CALENDAR_WINDOW ${label} 는 {years, months}(0 이상 정수)여야 합니다`);
    }
    return v.years * 12 + v.months;
  }
  function validateBasis(td) {
    if (td.basis !== undefined && !BASES.includes(td.basis)) throw new TodoDefinitionError(`알 수 없는 basis: ${String(td.basis)}`);
  }
  const warned = new Set();
  function warnOnce(td, e) {
    const key = `${td.todo_id}|${e.message}`;
    if (warned.has(key)) return;
    warned.add(key);
    if (typeof console !== "undefined" && console.warn) console.warn(`[TodoEngine] 정의 오류로 건너뜀: ${td.todo_id} — ${e.message}`);
  }

  function toDate(v) {
    if (v instanceof Date) return v;
    if (typeof v === "string") return new Date(v);
    return v; // 이미 Date이거나 null
  }

  function regionMatches(regionCondition, province, district) {
    if (!regionCondition) return true; // null = 전국공통
    if (regionCondition === "SEE_SUBSIDIES_JSON") return true; // 이 엔진에서 판단하지 않는 위임 항목
    const list = regionCondition.include || [];
    if (list.includes("ALL")) return true;
    if (list.includes(`${province}:ALL`)) return true;
    if (list.includes(`${province}:${district}`)) return true;
    return false;
  }

  // 개편 전/후 분기 — td.birthOnOrAfter / td.birthBefore(YYYY-MM-DD)가 있으면 아이 생년월일이
  // 그 범위 안일 때만 계산한다(js/app.js가 data/subsidies/reform-2027.json 기준일로 채운다).
  function ymd(d) {
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function birthRuleMatches(td, birthDate) {
    if (!td.birthOnOrAfter && !td.birthBefore) return true;
    if (!birthDate) return true;
    const b = ymd(birthDate);
    if (td.birthOnOrAfter && b < td.birthOnOrAfter) return false;
    if (td.birthBefore && b >= td.birthBefore) return false;
    return true;
  }

  function needsReviewBadge(verificationStatus) {
    const v = verificationStatus || "";
    return !(v.startsWith("확인됨") || v === "확인완료");
  }

  /** 완료기록에서 특정 (todoId, occurrenceKey, recordType) 하나를 찾는다. */
  function findRecord(completions, todoId, occurrenceKey, recordType) {
    return (completions || []).find(
      (c) => c.todo_id === todoId && c.occurrenceKey === occurrenceKey && c.recordType === recordType
    );
  }

  /**
   * 하나의 occurrence(trigger)에 대해 windowStart/windowEnd를 계산한다.
   * RELATIVE_TO_EVENT는 이전 occurrence의 완료 기록이 있어야 계산 가능하다(없으면 null 반환) —
   * 단, referenceEvent가 "milestone_report"면 예외로 절대상한(absoluteCapMonth)만으로도
   * 계산 가능하다(OR-03 첫 치과방문처럼 "마일스톤+상대기간 vs 절대상한 중 먼저 오는 쪽"이
   * 필요한 경우. 새 trigger type을 만들지 않고 RELATIVE_TO_EVENT의 referenceEvent 값만 늘렸다).
   */
  function computeWindow(trigger, ctx) {
    const { birthDate, previousCompletionDate, completions, absoluteCapMonth } = ctx;
    switch (trigger.type) {
      case "AGE_WINDOW":
        if (ctx.basis === "CALENDAR") {
          return {
            windowStart: addCalendarMonths(birthDate, trigger.startMonth),
            windowEnd: trigger.endMonth == null ? null : addCalendarMonths(birthDate, trigger.endMonth),
          };
        }
        return {
          windowStart: addMonths(birthDate, trigger.startMonth),
          windowEnd: trigger.endMonth == null ? null : addMonths(birthDate, trigger.endMonth),
        };
      case "AGE_CALENDAR_WINDOW": // basis 와 무관하게 항상 달력 기반
        return {
          windowStart: addCalendarMonths(birthDate, ymPair(trigger.start, "start")),
          windowEnd: trigger.end == null ? null : addCalendarMonths(birthDate, ymPair(trigger.end, "end")),
        };
      case "SCHOOL_TERM_WINDOW": {
        // computeStandardInstance 가 timeline.school 이 없는 경우를 먼저 걸러낸다. 여기서는 올바른 파라미터만 확인한다.
        const { anchor, yearOffset, startMonth, endMonth, startDay, endDay } = trigger;
        if (anchor !== "ENROLLMENT" || !isInt(yearOffset) || !isInt(startMonth) || !isInt(endMonth) || startMonth < 1 || startMonth > 12 || endMonth < 1 || endMonth > 12) {
          throw new TodoDefinitionError("SCHOOL_TERM_WINDOW 는 {anchor:'ENROLLMENT', yearOffset(정수), startMonth(1~12), endMonth(1~12)} 여야 합니다");
        }
        // 선택 필드 startDay/endDay(1~31): 있으면 시작·끝을 그 날짜로 정확히 잡는다(예: 서울 중학교 배정원서 10.26~11.6). 없으면 아래 기존 규칙 그대로.
        if ((startDay != null && (!isInt(startDay) || startDay < 1 || startDay > 31)) || (endDay != null && (!isInt(endDay) || endDay < 1 || endDay > 31))) {
          throw new TodoDefinitionError("SCHOOL_TERM_WINDOW 의 startDay·endDay 는 1~31 정수여야 합니다");
        }
        const year = ctx.timeline.school.enrollmentYear + yearOffset;
        const endYear = endMonth >= startMonth ? year : year + 1;
        // 시작월 1일(또는 startDay) ~ 끝월 말일(또는 endDay)(끝월이 시작월보다 앞서면 다음 해 끝월)
        return {
          windowStart: new Date(year, startMonth - 1, startDay == null ? 1 : startDay),
          windowEnd: endDay == null ? new Date(endYear, endMonth, 0) : new Date(endYear, endMonth - 1, endDay),
        };
      }
      case "DATE_FROM_BIRTH":
        return {
          windowStart: addDays(birthDate, trigger.offsetDays),
          windowEnd: addDays(birthDate, trigger.offsetDays + trigger.deadlineDays),
        };
      case "RELATIVE_TO_EVENT": {
        if (trigger.referenceEvent === "milestone_report") {
          const capDate = absoluteCapMonth == null ? null : addMonths(birthDate, absoluteCapMonth);
          const report = findRecord(completions, trigger.milestoneTodoId, "default", "MILESTONE_REPORTED");
          if (!report) {
            // 마일스톤이 아직 보고 안 됐어도, 절대상한만으로 계산을 포기하지 않는다
            // (다른 MILESTONE_EVENT형 Todo와 달리 OR-03은 "언제까지나 대기"가 아니라
            // 절대 마감이 있는 항목이라 그렇다).
            return { windowStart: addMonths(birthDate, 0), windowEnd: capDate };
          }
          const relativeEnd = trigger.maxOffsetDays == null ? null : addDays(toDate(report.recordedAt), trigger.maxOffsetDays);
          let windowEnd = relativeEnd;
          if (relativeEnd && capDate) windowEnd = new Date(Math.min(relativeEnd.getTime(), capDate.getTime()));
          else if (!relativeEnd) windowEnd = capDate;
          return { windowStart: addMonths(birthDate, 0), windowEnd };
        }
        // 기본: 직전 occurrence(같은 todo_id의 이전 회차) 완료일 기준 상대오프셋
        if (!previousCompletionDate) return { windowStart: null, windowEnd: null };
        return {
          windowStart: addDays(previousCompletionDate, trigger.minOffsetDays),
          windowEnd: trigger.maxOffsetDays == null ? null : addDays(previousCompletionDate, trigger.maxOffsetDays),
        };
      }
      default:
        throw new Error(`computeWindow: 알 수 없는 trigger.type "${trigger.type}"`);
    }
  }

  /** windowStart/End + 완료여부 + catchUp으로 7개 상태 중 하나를 정한다. */
  function computeStatus({ windowStart, windowEnd, today, leadDays, isDone, catchUp }) {
    if (isDone) return "DONE";
    if (windowStart === null) return "SCHEDULED"; // 선행 조건(이전 회차 등) 미충족
    const leadCutoff = addDays(windowStart, -(leadDays || 0));
    if (today < leadCutoff) return "SCHEDULED";
    if (today < windowStart) return "UPCOMING";
    if (windowEnd === null || today <= windowEnd) return "DUE";
    // today > windowEnd, 미완료
    if (catchUp === "NOT_ALLOWED") return "OVERDUE_FINAL";
    if (catchUp === "NOT_APPLICABLE") return "DUE"; // 설계 결정: 관찰/지속형 항목은 기한을 넘겨도 계속 DUE로 남긴다(보고서 참고)
    return "OVERDUE_CATCHUP"; // ALLOWED
  }

  /** MILESTONE_EVENT 하나의 occurrence를 계산한다. */
  function computeMilestoneInstance(td, occurrenceKey, ctx) {
    const reported = findRecord(ctx.completions, td.todo_id, occurrenceKey, "MILESTONE_REPORTED");
    if (!reported) {
      return baseInstance(td, occurrenceKey, { status: "PENDING_MILESTONE", windowStart: null, windowEnd: null });
    }
    const windowStart = toDate(reported.recordedAt);
    const done = findRecord(ctx.completions, td.todo_id, occurrenceKey, "TODO_COMPLETED");
    const status = computeStatus({
      windowStart,
      windowEnd: null,
      today: ctx.today,
      leadDays: 0,
      isDone: !!done,
      catchUp: td.catchUp,
    });
    return baseInstance(td, occurrenceKey, { status, windowStart, windowEnd: null });
  }

  /** AGE_WINDOW/DATE_FROM_BIRTH/RELATIVE_TO_EVENT 계열 occurrence 하나를 계산한다. */
  function computeStandardInstance(td, occurrenceKey, trigger, ctx, previousCompletionDate) {
    if (trigger.type === "SCHOOL_TERM_WINDOW") {
      const school = ctx.timeline && ctx.timeline.school;
      // 학교 정보(정책이 확인된 timeline)가 없으면 날짜를 만들지 않는다 — status:null 은 schedule.js 가 화면에서 제외한다.
      if (!school || !isInt(school.enrollmentYear)) {
        return Object.assign(baseInstance(td, occurrenceKey, { status: null, windowStart: null, windowEnd: null }), { eligibility: "UNKNOWN" });
      }
    }
    const { windowStart, windowEnd } = computeWindow(trigger, {
      birthDate: ctx.birthDate,
      previousCompletionDate,
      completions: ctx.completions,
      absoluteCapMonth: td.absoluteCapMonth,
      basis: td.basis,
      timeline: ctx.timeline,
    });
    const done = findRecord(ctx.completions, td.todo_id, occurrenceKey, "TODO_COMPLETED");
    const status = computeStatus({
      windowStart,
      windowEnd,
      today: ctx.today,
      leadDays: td.leadDays,
      isDone: !!done,
      catchUp: td.catchUp,
    });
    const instance = baseInstance(td, occurrenceKey, { status, windowStart, windowEnd });
    return attachRetroactiveInfo(instance, td, occurrenceKey, ctx);
  }

  /**
   * retroactiveDeadline이 정의된 Todo(예: 부모급여·아동수당·기저귀바우처)에 한해,
   * "신청기한 경과 여부"와 "소급 적용 가능 여부"를 상태(status)와 별개의 필드로 덧붙인다.
   * status 자체(수급기간 기준)는 이 값과 무관하게 그대로 둔다 — 신청기한을 넘겨도
   * 수급기간이 남아있으면 계속 DUE로 보여야 하기 때문이다(이번 수정의 핵심).
   */
  function attachRetroactiveInfo(instance, td, occurrenceKey, ctx) {
    if (!td.retroactiveDeadline) return instance;
    const deadlineEnd = addDays(ctx.birthDate, td.retroactiveDeadline.offsetDays + td.retroactiveDeadline.deadlineDays);
    const done = findRecord(ctx.completions, td.todo_id, occurrenceKey, "TODO_COMPLETED");
    const appliedAt = done ? toDate(done.recordedAt) : null;
    const applicationDeadlinePassed = ctx.today > deadlineEnd;
    const retroactiveEligible = appliedAt ? appliedAt <= deadlineEnd : !applicationDeadlinePassed;
    return Object.assign(instance, {
      applicationDeadline: deadlineEnd,
      applicationDeadlinePassed,
      retroactiveEligible,
    });
  }

  function baseInstance(td, occurrenceKey, extra) {
    return Object.assign(
      {
        todo_id: td.todo_id,
        occurrenceKey,
        category: td.category,
        title: td.title,
        exposureLevel: td.exposureLevel,
        priority: td.priority,
        eligibility: "PASS",
        needsReview: needsReviewBadge(td.verificationStatus),
        variantSelectionNeeded: false,
      },
      extra
    );
  }

  /** 순서가 있는 occurrence 배열(다회차) 하나를 처리해 TodoInstance 배열로 만든다. */
  function computeOccurrenceSeries(td, occurrences, ctx, variantSelectionNeeded) {
    const instances = [];
    let prevCompletionDate = null;
    for (const occ of occurrences) {
      let instance;
      if (occ.trigger.type === "MILESTONE_EVENT") {
        instance = computeMilestoneInstance(td, occ.occurrenceKey, ctx);
      } else {
        instance = computeStandardInstance(td, occ.occurrenceKey, occ.trigger, ctx, prevCompletionDate);
      }
      instance.variantSelectionNeeded = !!variantSelectionNeeded;
      instances.push(instance);
      const doneRecord = findRecord(ctx.completions, td.todo_id, occ.occurrenceKey, "TODO_COMPLETED");
      prevCompletionDate = doneRecord ? toDate(doneRecord.recordedAt) : null;
    }
    return instances;
  }

  /** TodoDefinition 하나(및 그 occurrence/variant 전개)를 TodoInstance 배열로 계산한다. */
  function calculateOne(td, ctx) {
    validateBasis(td);
    // 1) 지역 필터
    if (!regionMatches(td.regionCondition, ctx.province, ctx.district)) return [];
    // 1-1) 출생일 범위 필터(제도 개편 전/후)
    if (!birthRuleMatches(td, ctx.birthDate)) return [];

    // 2) REFERENCE — 상태 계산 대상 아님
    if (td.triggerType === "REFERENCE") {
      return [baseInstance(td, "default", { status: "REFERENCE", windowStart: null, windowEnd: null })];
    }

    // 2-1) autoExtendsFrom — 선행 Todo(예: SB-02 부모급여 0세)가 이미 완료됐으면
    // 이 Todo(예: SB-03 부모급여 1세)는 별도 신청 행동 없이 자동 연장된다.
    // 선행 Todo가 완료되지 않았으면 이 분기를 건너뛰고 평소처럼(별도 신청 필요) 계산한다.
    if (td.autoExtendsFrom) {
      const priorDone = findRecord(
        ctx.completions,
        td.autoExtendsFrom.todo_id,
        td.autoExtendsFrom.occurrenceKey || "default",
        "TODO_COMPLETED"
      );
      if (priorDone) {
        return [baseInstance(td, "default", { status: "DONE", windowStart: null, windowEnd: null, autoExtended: true })];
      }
      // priorDone이 없으면 아래로 내려가 일반 AGE_WINDOW 계산(별도 신청 필요)을 그대로 적용한다.
    }

    // 3) 자격속성 필터(eligibilityCondition) — trigger와 무관한 별도 필터
    if (td.eligibilityCondition) {
      const ec = td.eligibilityCondition;
      if (ec.requiredValues !== undefined) {
        if (ec.requiredValue !== undefined) throw new TodoDefinitionError("eligibilityCondition 에 requiredValue 와 requiredValues 를 함께 쓸 수 없습니다");
        if (!Array.isArray(ec.requiredValues) || ec.requiredValues.length === 0) throw new TodoDefinitionError("eligibilityCondition.requiredValues 는 비어 있지 않은 배열이어야 합니다");
      }
      const attrValue = ctx.familyDeclaredAttributes[td.eligibilityCondition.attribute];
      if (attrValue === undefined) {
        return [
          Object.assign(baseInstance(td, "default", { status: null, windowStart: null, windowEnd: null }), {
            eligibility: "UNKNOWN",
          }),
        ];
      }
      const passes = ec.requiredValues !== undefined ? ec.requiredValues.includes(attrValue) : attrValue === td.eligibilityCondition.requiredValue;
      if (!passes) {
        return []; // FAIL — 목록에서 완전 제외
      }
      // PASS — 아래에서 정상 계산 계속
    }

    // 4) variants — 제품/방식 선택에 따라 회차 구성이 달라지는 Todo
    if (td.variants) {
      const selectedId = ctx.familyDeclaredAttributes[td.variants.selectionAttribute];
      let option = td.variants.options.find((o) => o.variantId === selectedId);
      const variantSelectionNeeded = !option;
      if (!option) option = td.variants.options[0]; // 미선택 시 첫 옵션으로 기본 표시(보고서 참고)
      return computeOccurrenceSeries(td, option.occurrences, ctx, variantSelectionNeeded);
    }

    // 5) 고정 다회차(occurrences) — 제품 분기 없는 백신 등
    if (td.occurrences) {
      return computeOccurrenceSeries(td, td.occurrences, ctx, false);
    }

    // 5-0) firstSeasonRule(VX-FLU 전용) — "생애 최초 시즌은 N회, 이후 시즌은 매번 1회"라는
    // 확인된 규칙만 반영한다. 이후 시즌이 정확히 "언제" 다가오는지(달력상 시즌 시작월)는
    // 검증된 자료가 없어 계산하지 않고, status=null + needsPolicyConfirmation 배지로 남긴다
    // (사용자 지시: "직전접종+12개월"을 확정 규칙으로 쓰지 말 것).
    if (td.firstSeasonRule) {
      const doneRecords = (ctx.completions || [])
        .filter((c) => c.todo_id === td.todo_id && c.recordType === "TODO_COMPLETED")
        .sort((a, b) => toDate(a.recordedAt) - toDate(b.recordedAt));
      const n = doneRecords.length;
      if (n < td.firstSeasonRule.doseCount) {
        // 아직 생애 최초 시즌을 완료하지 못함 — 이 부분은 정확히 계산 가능하다.
        const nextKey = `season-1-dose-${n + 1}`;
        if (n === 0) {
          const trigger = Object.assign({ type: td.triggerType }, td.triggerParams);
          return [computeStandardInstance(td, nextKey, trigger, ctx, null)];
        }
        const prevDate = toDate(doneRecords[n - 1].recordedAt);
        const trigger = { type: "RELATIVE_TO_EVENT", minOffsetDays: td.firstSeasonRule.intervalDays, maxOffsetDays: null };
        return [computeStandardInstance(td, nextKey, trigger, ctx, prevDate)];
      }
      // 최초 시즌 완료 이후: 다음 시즌이 정확히 언제인지 계산할 근거가 없다 — 확인 필요로만 남긴다.
      // 시즌 번호 = 최초 시즌(1) + 최초시즌 이후 매 회 1도즈씩 늘어난 시즌 수.
      const seasonsCompleted = 1 + (n - td.firstSeasonRule.doseCount);
      const nextSeasonKey = `season-${seasonsCompleted + 1}`;
      return [
        Object.assign(baseInstance(td, nextSeasonKey, { status: null, windowStart: null, windowEnd: null }), {
          needsPolicyConfirmation: true,
        }),
      ];
    }

    // 5-1) repeat(annual/interval, firstSeasonRule 없는 일반 반복) — 완료 이력 개수만큼
    // 다음 회차를 동적으로 계산한다(예: OR-04 6개월 간격 치과검진).
    if (td.repeat) {
      const doneRecords = (ctx.completions || [])
        .filter((c) => c.todo_id === td.todo_id && c.recordType === "TODO_COMPLETED")
        .sort((a, b) => toDate(a.recordedAt) - toDate(b.recordedAt));
      const n = doneRecords.length;
      const nextKey = `occ-${n + 1}`;
      if (n === 0) {
        const trigger = Object.assign({ type: td.triggerType }, td.triggerParams);
        return [computeStandardInstance(td, nextKey, trigger, ctx, null)];
      }
      const intervalMonths = td.repeat.intervalMonths;
      const prevDate = toDate(doneRecords[n - 1].recordedAt);
      const trigger = { type: "RELATIVE_TO_EVENT", minOffsetDays: intervalMonths * MONTH_DAYS, maxOffsetDays: null };
      return [computeStandardInstance(td, nextKey, trigger, ctx, prevDate)];
    }

    // 6) 단일 occurrence(대부분의 Todo)
    const trigger = Object.assign({ type: td.triggerType }, td.triggerParams);
    if (trigger.type === "MILESTONE_EVENT") {
      return [computeMilestoneInstance(td, "default", ctx)];
    }
    return [computeStandardInstance(td, "default", trigger, ctx, null)];
  }

  /**
   * calculateTodoInstances(input) — 이 엔진의 유일한 공개 진입점.
   * input: {
   *   today: Date,
   *   child: { birthDate: Date, gender },
   *   region: { province, district },
   *   familyDeclaredAttributes: { [attr]: value },  // eligibility 값 + variant 선택값 포함
   *   completions: [{ todo_id, occurrenceKey, recordType, recordedAt }],
   *   todoDefinitions: [...] // 73개 TodoDefinition
   * }
   * 반환: TodoInstance[] (REFERENCE/UNKNOWN 포함, FAIL/지역불일치는 제외됨)
   */
  function calculateTodoInstances(input) {
    const ctx = {
      today: toDate(input.today),
      birthDate: toDate(input.child.birthDate),
      province: input.region ? input.region.province : undefined,
      district: input.region ? input.region.district : undefined,
      familyDeclaredAttributes: input.familyDeclaredAttributes || {},
      completions: input.completions || [],
      timeline: input.timeline || null, // 선택(A5). ChildTimeline.compute 결과 — 없으면 이전과 동일하게 동작
    };
    const result = [];
    for (const td of input.todoDefinitions) {
      try {
        result.push(...calculateOne(td, ctx));
      } catch (e) {
        if (!(e instanceof TodoDefinitionError)) throw e; // 정의 오류만 그 항목을 건너뛴다. 나머지 오류는 예전과 같이 전파
        warnOnce(td, e);
      }
    }
    return result;
  }

  /** 부모 화면에서 "놓친 것"으로 모아 보여줄 인스턴스만 필터링하는 헬퍼. */
  function selectOverdue(instances) {
    return instances.filter((i) => i.status === "OVERDUE_CATCHUP" || i.status === "OVERDUE_FINAL");
  }

  return {
    calculateTodoInstances,
    selectOverdue,
    TodoDefinitionError,
    BASES,
    // 아래는 테스트/디버깅 편의를 위해 노출(엔진 사용자는 보통 calculateTodoInstances만 쓰면 된다)
    ageInMonths,
    addMonths,
    addDays,
    computeStatus,
  };
});
