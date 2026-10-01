/*
 * UX 개편(홈·캘린더·기록·지원금 탭)이 쓰는 순수 로직. DOM·Firestore·localStorage를 전혀 모른다 —
 * 입력은 schedule.js가 만든 events[]와 completed 맵뿐이라 Node에서 그대로 단위 테스트한다(test/hn-logic.test.js).
 *
 * 일정 3유형 — schedule.js가 event.scheduleKind로 채워 준다.
 *   fixed   : 지원금·제도. 실제 "신청 시작일"(fixedDate)이 있어 달력의 그 날짜에 표시한다(신청 기간은 카드에 함께 표시).
 *   window  : 엔진이 계산한 권장 기간(windowStart~windowEnd, 폭 60일 이하).
 *   monthly : 기간이 넓거나 열린 항목 — 대표 월령(그 월령 한 달)에 속한다.
 * window·monthly는 정해진 날짜가 없다. 달력에는 assignDisplayDays()가 "추천일"을 골라 표시한다:
 * 각자의 기간 안에서만, 하루에 몰리지 않게 나누고, 같은 시기 접종은 한날에 묶는다(화면에 "추천일"이라고 밝힌다).
 */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory(require("./date-calc.js"), require("./child-timeline.js"));
  else root.HNLogic = factory(root.DateCalc, root.ChildTimeline);
})(typeof window !== "undefined" ? window : global, function (DateCalc, ChildTimeline) {
  "use strict";

  const DAY = 24 * 60 * 60 * 1000;
  const sod = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const eod = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
  const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

  function isDone(completed, id) {
    return !!(completed && completed[id]);
  }

  // ---------------------------------------------------------------------
  // 달력
  // ---------------------------------------------------------------------

  /** fixed/window 항목이 차지하는 날짜 범위 [시작일, 종료일](일 단위). monthly는 null. */
  function dayRange(e) {
    if (e.scheduleKind === "fixed") {
      const d = sod(e.fixedDate || e.deadlineDate || e.date);
      return [d, d];
    }
    if (e.scheduleKind === "window" && e.windowStart) {
      const s = sod(e.windowStart);
      const en = e.windowEnd ? sod(e.windowEnd) : s;
      return [s, en < s ? s : en];
    }
    return null;
  }

  const md = (d) => `${d.getMonth() + 1}/${d.getDate()}`;
  /** 카드에 붙이는 짧은 기간 문구. 월령 체크는 날짜가 없으므로 빈 문자열. */
  function periodText(e) {
    if (e.scheduleKind === "fixed") return e.fixedDate ? `${md(e.fixedDate)} 신청 시작` : `${md(e.deadlineDate || e.date)}까지`;
    if (e.scheduleKind === "window" && e.windowStart) return e.windowEnd ? `${md(e.windowStart)}~${md(e.windowEnd)}` : `${md(e.windowStart)}부터`;
    return "";
  }

  function coversDay(e, day) {
    const r = dayRange(e);
    const d = sod(day);
    return !!r && r[0] <= d && d <= r[1];
  }

  /** 그 날짜의 달력 정보: 그날이 마감/예정일인 항목(fixed)과 그날이 권장 기간에 포함되는 항목(window). */
  function dayInfo(events, day) {
    const fixed = [];
    const windows = [];
    for (const e of events) {
      if (!coversDay(e, day)) continue;
      (e.scheduleKind === "fixed" ? fixed : windows).push(e);
    }
    return { fixed, windows };
  }

  const ymd = (d) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  const addDaysD = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  // 달력 월 더하기 — 대상 월에 같은 일자가 없으면 그 달 말일(js/date-calc.js). 항상 출생일에서 한 번에 계산한다.
  // 잘못된 월 수(비정수)는 DateCalc가 RangeError로 거부한다. 일정 계산 전체가 중단되지 않도록 여기서만 잡아 Invalid Date로 남기고
  // (assignDisplayDays는 그 슬롯만 건너뛴다) 경고를 한 번 기록한다. 임의의 정상 날짜로 보정하지 않는다. 현재 데이터에서는 발생하지 않는다.
  const warnedMonths = new Set();
  const addMonthsD = (d, n) => {
    try {
      return DateCalc.addMonthsClamped(d, n);
    } catch (e) {
      if (!e || e.name !== "RangeError") throw e;
      if (!warnedMonths.has(String(n))) {
        warnedMonths.add(String(n));
        console.warn(`[addMonthsD] 잘못된 월 값이라 슬롯을 계산하지 않았어요: n=${JSON.stringify(n)}`);
      }
      return new Date(NaN);
    }
  };
  const isWeekend = (d) => d.getDay() === 0 || d.getDay() === 6;

  /**
   * 달력용 "추천일" 배치 — window·monthly 항목마다 자기 기간(권장 기간 / 대표 월령 한 달) 안에서 날짜를 고른다.
   *  - 같은 시기에 함께 맞는 접종(권장 기간이 같은 접종, 또는 같은 월령 접종)은 한날로 묶는다.
   *  - 나머지(생활·안전·발달·이유식 등)는 하루에 몰리지 않게 나눈다(그날·이웃 날의 항목 수가 적은 날 우선).
   *  - 검진·접종은 가능하면 평일. 기간이 하루뿐이면 그날.
   *  - 완료 여부와 무관하게 전체를 한 번에 배치하므로 완료 처리해도 다른 항목의 위치가 바뀌지 않는다.
   *  - 지원금(행정·지원금)은 배치하지 않는다(fixed: 신청 시작일).
   * opts = { birthDate, monthKeysOf(e) → 대표 월령 배열(숫자 아닌 값은 무시) }. 반환: Map(eventId → Date[])
   */
  function assignDisplayDays(events, opts) {
    const slots = [];
    for (const e of events) {
      if (e.category === "행정·지원금") continue;
      const isVx = e.category === "예방접종";
      if (e.scheduleKind === "window" && e.windowStart) {
        const s = sod(e.windowStart);
        const en0 = e.windowEnd ? sod(e.windowEnd) : s;
        const en = en0 < s ? s : en0;
        slots.push({ e, start: s, end: en, gkey: isVx ? `VX|${ymd(s)}|${ymd(en)}` : `S|${e.id}` });
      } else if (e.scheduleKind === "monthly") {
        for (const k of opts.monthKeysOf(e)) {
          if (typeof k !== "number") continue;
          const s = sod(addMonthsD(opts.birthDate, k));
          const en = addDaysD(sod(addMonthsD(opts.birthDate, k + 1)), -1);
          if (isNaN(s) || isNaN(en)) continue; // 잘못된 월 값의 슬롯은 배치하지 않는다(다른 항목은 정상 배치)
          slots.push({ e, start: s, end: en, gkey: isVx ? `VXM|${k}` : `S|${e.id}|${k}` });
        }
      }
    }
    const groups = new Map();
    for (const sl of slots) {
      if (!groups.has(sl.gkey)) groups.set(sl.gkey, []);
      groups.get(sl.gkey).push(sl);
    }
    // 좁은 기간부터 먼저 자리를 잡는다(기간이 하루뿐인 항목이 밀리지 않게). 동률은 id로 고정해 매번 같은 결과.
    const order = [...groups.values()].sort((a, b) => {
      const la = a[0].end - a[0].start;
      const lb = b[0].end - b[0].start;
      return la - lb || a[0].start - b[0].start || (a[0].e.id < b[0].e.id ? -1 : 1);
    });
    const load = new Map();
    const at = (d) => load.get(ymd(d)) || 0;
    const out = new Map();
    for (const g of order) {
      const { start, end } = g[0];
      const weekdayOnly = g.some((sl) => sl.e.category === "예방접종" || sl.e.category === "영유아검진");
      let best = null;
      let bestScore = Infinity;
      const span = Math.min(120, Math.round((end - start) / DAY));
      for (let i = 0; i <= span; i++) {
        const d = addDaysD(start, i);
        // 그날 항목 수를 가장 크게, 이웃 이틀의 항목 수를 작게 반영 → 골고루 퍼진다.
        let score = at(d) * 100 + (at(addDaysD(d, -1)) + at(addDaysD(d, 1))) * 8 + (at(addDaysD(d, -2)) + at(addDaysD(d, 2))) * 3;
        if (weekdayOnly && isWeekend(d)) score += 50;
        if (score < bestScore) {
          bestScore = score;
          best = d;
        }
      }
      load.set(ymd(best), at(best) + g.length);
      for (const sl of g) {
        if (!out.has(sl.e.id)) out.set(sl.e.id, []);
        out.get(sl.e.id).push(best);
      }
    }
    return out;
  }

  /**
   * 홈 화면 분류 — 항목의 "기간"이 현재 달력 월과 어떤 관계인지로 나눈다(지원금은 별도 영역이라 제외).
   *   기간: window = 권장 기간(windowStart~windowEnd), monthly = 대표 월령의 한 달(monthKeysOf, 반복 항목은 여러 개).
   *   thisMonth : 기간 중 하나라도 이번 달과 겹침(완료·미완료 모두 — 완료는 표시만 달라진다)
   *   upcoming  : 이번 달과 겹치지 않고, 미래에 시작하는 기간이 있음(미완료만, 시작이 가까운 순)
   *   past      : 이번 달·미래 기간이 없고 전부 지난 기간(미완료만, 최근에 끝난 순)
   * 날짜가 없는 항목(그때그때 확인·마일스톤 대기)은 어디에도 넣지 않는다 — 임의로 날짜를 만들지 않는다.
   * 완료 처리하거나 삭제하지 않고 분류만 한다.
   */
  /**
   * 기간형 AUTO (§14) — 시작 월령이 guardMonths(36)를 넘는 monthly 엔진 항목(예: 4~6세 추가접종).
   * 월 칸·추천일(달력 점)에 올리지 않고 "시작 월령이 속한 달 ~ 서비스 상한(maxMonths=72) 월령이 끝나는 날"을 하나의 기간으로 본다.
   * 엔진 window 가 30일 개월 계산 때문에 먼저 끝나도(OVERDUE_CATCHUP) 이 기간은 서비스 상한까지 이어진다. 기간 끝은 isEventVisible 의 "completedMonths <= 72" 와 같은 기준이다.
   * 계산만 하고 저장하지 않는다 — 날짜 필드·완료 키를 만들지 않는다. 해당하지 않으면 null.
   * opts: { birthDate, monthKeysOf, guardMonths, maxMonths }
   */
  function periodRangeOf(e, opts) {
    if (!e || !e.isEngineEvent || e.scheduleKind !== "monthly") return null;
    if (e.isLegacySubsidy || e.category === "행정·지원금") return null;
    const def = e.detail && e.detail.definition;
    if (!def || def.schoolGroup) return null;
    const keys = opts.monthKeysOf(e).filter((k) => typeof k === "number");
    if (!keys.length) return null;
    const startKey = Math.min(...keys);
    if (startKey <= opts.guardMonths) return null;
    const start = sod(addMonthsD(opts.birthDate, startKey));
    const end = addDaysD(sod(addMonthsD(opts.birthDate, opts.maxMonths + 1)), -1);
    if (end < start) return null;
    return { startKey, start, end };
  }

  function classifyHomeItems(events, completed, opts) {
    const today = opts.today;
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    const out = { thisMonth: [], upcoming: [], past: [], period: [] };
    for (const e of events) {
      if (e.category === "행정·지원금") continue;
      // 기간형 AUTO: 이번 달이 기간과 겹치고 미완료일 때만 period 로(시작 전·완료 후는 홈에 없다). 월령 칸 분류(thisMonth/upcoming/past)에는 넣지 않는다.
      const pr = opts.periodRangeOf ? opts.periodRangeOf(e) : null;
      if (pr) {
        // 끝은 "오늘" 기준(서비스 상한 월령이 끝난 다음 날부터 사라진다) — 달력 월 겹침으로 보면 끝나는 달 내내 남는다. 시작은 시작 월령이 속한 달부터.
        if (!isDone(completed, e.id) && pr.start <= monthEnd && sod(today) <= pr.end) out.period.push({ e, start: pr.start, end: pr.end, done: false });
        continue;
      }
      const periods = [];
      if (e.scheduleKind === "window" && e.windowStart) {
        const s = sod(e.windowStart);
        const en = e.windowEnd ? sod(e.windowEnd) : s;
        periods.push({ start: s, end: en < s ? s : en });
      } else if (e.scheduleKind === "monthly") {
        for (const k of opts.monthKeysOf(e)) {
          if (typeof k !== "number") continue;
          periods.push({ start: sod(addMonthsD(opts.birthDate, k)), end: addDaysD(sod(addMonthsD(opts.birthDate, k + 1)), -1) });
        }
      }
      if (!periods.length) continue;
      const done = isDone(completed, e.id);
      const cur = periods.find((p) => p.start <= monthEnd && p.end >= monthStart);
      if (cur) {
        out.thisMonth.push({ e, start: cur.start, end: cur.end, done });
        continue;
      }
      if (done) continue;
      const fut = periods.filter((p) => p.start > monthEnd).sort((a, b) => a.start - b.start)[0];
      if (fut) out.upcoming.push({ e, start: fut.start, end: fut.end, done });
      else {
        const last = periods.filter((p) => p.end < monthStart).sort((a, b) => b.end - a.end)[0];
        if (last) out.past.push({ e, start: last.start, end: last.end, done });
      }
    }
    out.period.sort((a, b) => a.start - b.start || priorityOf(a.e) - priorityOf(b.e) || (a.e.id < b.e.id ? -1 : 1));
    out.thisMonth.sort((a, b) => a.done - b.done || priorityOf(a.e) - priorityOf(b.e) || a.end - b.end || (a.e.id < b.e.id ? -1 : 1));
    out.upcoming.sort((a, b) => a.start - b.start || priorityOf(a.e) - priorityOf(b.e) || (a.e.id < b.e.id ? -1 : 1));
    out.past.sort((a, b) => b.end - a.end || priorityOf(a.e) - priorityOf(b.e) || (a.e.id < b.e.id ? -1 : 1));
    return out;
  }

  /** 추천일이 그 날짜인 항목들. */
  function plannedOnDay(events, displayDays, day) {
    const d = sod(day);
    return events.filter((e) => (displayDays.get(e.id) || []).some((x) => sameDay(x, d)));
  }

  /** 추천일이 그 달에 있는 항목들(진행 현황·홈 미리보기용). */
  function plannedInMonth(events, displayDays, year, month) {
    return events.filter((e) => (displayDays.get(e.id) || []).some((x) => x.getFullYear() === year && x.getMonth() === month));
  }

  /** 달력 한 달 진행 현황: 그 달에 표시되는 항목(지원금 신청 시작 + 추천일 배치) 중 실제 완료 수. */
  function calendarMonthProgress(events, displayDays, completed, year, month) {
    const fixed = events.filter((e) => e.scheduleKind === "fixed" && dayRange(e)[0].getFullYear() === year && dayRange(e)[0].getMonth() === month);
    const items = [...fixed, ...plannedInMonth(events, displayDays, year, month)];
    const total = items.length;
    const done = items.filter((e) => isDone(completed, e.id)).length;
    return { total, done, percent: total ? Math.round((done / total) * 100) : 0 };
  }

  /** 지원금 신청 기간(시작~끝). 끝이 없으면 상시. */
  function subsidyPeriod(e) {
    const start = e.isLegacySubsidy ? e.entryDate : e.fixedDate || e.windowStart;
    return { start: start || null, end: subsidyDeadline(e) };
  }

  /** 달(연·월)과 겹치는 fixed/window 항목. */
  function datedInMonth(events, year, month) {
    const first = new Date(year, month, 1);
    const last = new Date(year, month + 1, 0);
    return events.filter((e) => {
      const r = dayRange(e);
      return r && r[0] <= last && r[1] >= first;
    });
  }

  /** 그 달의 "월령별 체크" 항목: monthly 유형 중 대표 월령이 그 달인 것. inMonth는 app.js의 대표월령 판정 함수. */
  function monthlyInMonth(events, year, month, inMonth) {
    return events.filter((e) => e.scheduleKind === "monthly" && inMonth(e, year, month));
  }

  /** 달 전체 진행 현황 — 실제 완료 내역 기준. 같은 항목이 두 유형에 중복 집계되지 않는다. */
  function monthProgress(events, completed, year, month, inMonth) {
    const items = [...datedInMonth(events, year, month), ...monthlyInMonth(events, year, month, inMonth)];
    const total = items.length;
    const done = items.filter((e) => isDone(completed, e.id)).length;
    return { total, done, percent: total ? Math.round((done / total) * 100) : 0 };
  }

  // ---------------------------------------------------------------------
  // 홈
  // ---------------------------------------------------------------------

  const priorityOf = (e) => (e.isEngineEvent && e.detail && e.detail.definition && typeof e.detail.definition.priority === "number" ? e.detail.definition.priority : 2);

  /**
   * 오늘의 할 일 — 엔진이 "지금 기간 안(DUE)"이거나 "기한이 지났지만 늦게라도 가능(OVERDUE_CATCHUP)"으로
   * 판정한 권장 기간 항목 중 미완료. 지원금은 별도 카드에서 다루므로 제외한다.
   * 정렬: 기한 지난 것 → 우선순위(작은 값이 중요) → 종료일 임박 순.
   */
  function todayItems(events, completed) {
    return events
      .filter(
        (e) =>
          e.isEngineEvent &&
          e.scheduleKind === "window" &&
          e.category !== "행정·지원금" &&
          (e.engineStatus === "DUE" || e.engineStatus === "OVERDUE_CATCHUP") &&
          !isDone(completed, e.id)
      )
      .sort((a, b) => {
        const oa = a.engineStatus === "OVERDUE_CATCHUP" ? 0 : 1;
        const ob = b.engineStatus === "OVERDUE_CATCHUP" ? 0 : 1;
        if (oa !== ob) return oa - ob;
        if (priorityOf(a) !== priorityOf(b)) return priorityOf(a) - priorityOf(b);
        const ea = a.windowEnd ? a.windowEnd.getTime() : Infinity;
        const eb = b.windowEnd ? b.windowEnd.getTime() : Infinity;
        return ea - eb;
      });
  }

  // ---------------------------------------------------------------------
  // 지원금·제도
  // ---------------------------------------------------------------------

  /** 지원금 신청 마감일(없으면 null). 지역 지원금은 deadlineDate, 전국 공통(엔진)은 소급 신청기한 → 창 종료일. */
  function subsidyDeadline(e) {
    if (e.isLegacySubsidy) return e.deadlineDate || null;
    const inst = e.detail && e.detail.instance;
    if (!inst) return null;
    if (inst.applicationDeadline && !inst.applicationDeadlinePassed) return inst.applicationDeadline;
    return inst.windowEnd || null;
  }

  /**
   * 'applied'(신청 완료) | 'available'(신청 가능) | 'upcoming'(신청 예정) | 'expired'(기한 지남).
   * ctx = { today: Date, ageNow: 개월, pregnant: bool }
   */
  function subsidyStatus(e, completed, ctx) {
    if (isDone(completed, e.id)) return "applied";
    const today = ctx.today;
    if (e.isLegacySubsidy) {
      const dl = e.deadlineDate ? eod(e.deadlineDate) : null;
      const usesPeriods = ctx.pregnant && Array.isArray(e.periods) && e.periods.length;
      if (usesPeriods && e.entryDate && today < sod(e.entryDate)) return "upcoming";
      if (dl && today > dl) return "expired";
      if (!usesPeriods) {
        if (ctx.ageNow < e.minAgeMonths) return "upcoming";
        if (ctx.ageNow > e.maxAgeMonths) return "expired";
      }
      return "available";
    }
    switch (e.engineStatus) {
      case "DUE":
      case "OVERDUE_CATCHUP":
        return "available";
      case "OVERDUE_FINAL":
        return "expired";
      default:
        return "upcoming";
    }
  }

  /** 마감 임박: 신청 가능 상태이면서 마감일이 있고 thresholdDays 이내. */
  function daysLeft(e, today) {
    const dl = subsidyDeadline(e);
    if (!dl) return null;
    return Math.ceil((eod(dl).getTime() - today.getTime()) / DAY);
  }
  function isUrgent(e, completed, ctx, thresholdDays) {
    if (subsidyStatus(e, completed, ctx) !== "available") return false;
    const left = daysLeft(e, ctx.today);
    return left !== null && left >= 0 && left <= (thresholdDays || 30);
  }

  /**
   * 지원금 탭 분류. urgent는 available의 부분집합(상단 고정용).
   * conditional: 신청 가능 상태지만 소득·직종·질환 등 해당자만 받는 제도(data의 conditionLabel) —
   * 모두에게 "신청 가능"으로 세지 않도록 available에서 빼고 따로 모은다(신청 완료·예정·기한 지남은 그대로).
   */
  function subsidyBuckets(events, completed, ctx, thresholdDays) {
    const subs = events.filter((e) => e.category === "행정·지원금");
    const out = { available: [], upcoming: [], applied: [], expired: [], urgent: [], conditional: [] };
    for (const e of subs) {
      const st = subsidyStatus(e, completed, ctx);
      if (st === "available" && e.isLegacySubsidy && e.detail && e.detail.conditionLabel) {
        out.conditional.push(e);
        continue;
      }
      out[st].push(e);
      if (st === "available" && isUrgent(e, completed, ctx, thresholdDays)) out.urgent.push(e);
    }
    const byDeadline = (a, b) => {
      const da = subsidyDeadline(a);
      const db = subsidyDeadline(b);
      return (da ? da.getTime() : Infinity) - (db ? db.getTime() : Infinity);
    };
    out.available.sort(byDeadline);
    out.conditional.sort(byDeadline);
    out.urgent.sort(byDeadline);
    return out;
  }

  // ---------------------------------------------------------------------
  // 기록
  // ---------------------------------------------------------------------

  const MANUAL_CATEGORIES = ["성장·발달", "건강", "생활", "활동"];

  /** 일정 카테고리(6그룹) → 기록 카테고리. 지원금 신청은 '제도'(전체 목록에만 나온다). */
  function recordCategoryOf(eventCategory) {
    switch (eventCategory) {
      case "예방접종":
      case "영유아검진":
        return "건강";
      case "발달관찰":
        return "성장·발달";
      case "생활·수유":
      case "안전·돌봄":
        return "생활";
      case "행정·지원금":
        return "제도";
      default:
        return "생활";
    }
  }

  function ageMonthsAt(birthDate, date) {
    return ChildTimeline.completedMonths(birthDate, date);
  }

  /**
   * 완료 내역 → 기록. 별도로 저장하지 않고 completed 맵에서 그때그때 만든다(기존 완료 데이터가 그대로 기록이 된다).
   * 일정에서 찾을 수 없는 완료 키(옛 형식 등)는 제목을 알 수 없어 만들지 않는다 — orphanCount로 세어 둔다.
   */
  function deriveAutoRecords(events, completed, birthDate) {
    const records = [];
    const seen = new Set();
    for (const e of events) {
      const c = completed && completed[e.id];
      if (!c) continue;
      seen.add(e.id);
      const date = c.recordedAt ? new Date(c.recordedAt) : null;
      if (!date || isNaN(date.getTime())) continue;
      records.push({
        id: "c:" + e.id,
        source: "auto",
        eventId: e.id,
        category: recordCategoryOf(e.category),
        eventCategory: e.category,
        title: e.title.replace(/^⚠️ 확인 필요 · /, ""),
        date,
        ageMonths: ageMonthsAt(birthDate, date),
        memo: (typeof c === "object" && c.memo) || "",
      });
    }
    const orphanCount = Object.keys(completed || {}).filter((k) => !k.endsWith("__milestone") && !k.endsWith("__na") && !seen.has(k)).length;
    return { records, orphanCount };
  }

  /** 직접 작성한 기록(맵) → 목록. 삭제 표시된 것은 뺀다. */
  function manualRecordList(recordMap, birthDate) {
    return Object.entries(recordMap || {})
      .filter(([, r]) => r && !r.deletedAt)
      .map(([id, r]) => {
        const date = new Date(r.date + "T12:00:00");
        return {
          id,
          source: "manual",
          category: r.category,
          title: r.title,
          date,
          ageMonths: ageMonthsAt(birthDate, date),
          memo: r.memo || "",
          authorLabel: r.authorLabel || "",
          updatedAt: r.updatedAt,
        };
      });
  }

  function mergeRecords(auto, manual, category) {
    const all = [...auto, ...manual].filter((r) => !category || category === "전체" || r.category === category);
    return all.sort((a, b) => b.date.getTime() - a.date.getTime());
  }

  /** 같은 Todo의 다음 회차(예: 접종 2차 → 3차). 관계가 데이터에 없으면 null — 지어내지 않는다. */
  function nextRelatedEvent(events, eventId, completed) {
    const cur = events.find((e) => e.id === eventId);
    if (!cur || !cur.isEngineEvent || !cur.detail || !cur.detail.instance) return null;
    const todoId = cur.detail.instance.todo_id;
    const curStart = cur.windowStart || cur.date;
    const next = events
      .filter(
        (e) =>
          e.id !== eventId &&
          e.isEngineEvent &&
          e.detail &&
          e.detail.instance &&
          e.detail.instance.todo_id === todoId &&
          !isDone(completed, e.id) &&
          (e.windowStart || e.date) > curStart
      )
      .sort((a, b) => (a.windowStart || a.date) - (b.windowStart || b.date));
    return next[0] || null;
  }

  /**
   * 동기화 병합: 서버·로컬 records 맵을 id별로 합치되 updatedAt이 더 새로운 쪽을 택한다.
   * 삭제(deletedAt)도 하나의 갱신이므로 같은 규칙으로 부활하지 않는다.
   */
  function mergeRecordMaps(local, remote) {
    const out = { ...(local || {}) };
    for (const [id, r] of Object.entries(remote || {})) {
      if (!r) continue;
      const mine = out[id];
      if (!mine || (r.updatedAt || 0) > (mine.updatedAt || 0)) out[id] = r;
    }
    return out;
  }

  return {
    DAY,
    sod,
    sameDay,
    dayRange,
    periodText,
    assignDisplayDays,
    periodRangeOf,
    classifyHomeItems,
    plannedOnDay,
    plannedInMonth,
    calendarMonthProgress,
    subsidyPeriod,
    coversDay,
    dayInfo,
    datedInMonth,
    monthlyInMonth,
    monthProgress,
    todayItems,
    subsidyDeadline,
    subsidyStatus,
    daysLeft,
    isUrgent,
    subsidyBuckets,
    MANUAL_CATEGORIES,
    recordCategoryOf,
    ageMonthsAt,
    deriveAutoRecords,
    manualRecordList,
    mergeRecords,
    nextRelatedEvent,
    mergeRecordMaps,
  };
});
