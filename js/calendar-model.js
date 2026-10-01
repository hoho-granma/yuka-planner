/*
 * calendar-model — 캘린더 화면 전용 집계(B2, 순수 모듈). 자동 일정(AUTO)과 사용자 일정(USER)을 "읽기만" 해서 하나의 모델로 합친다.
 * 설계: docs/한눈육아-확장설계-2단계-상세.md §4(분리), §7-2(필터), §9(계약·표시 규칙), §10(진행률은 AUTO 전용).
 *
 * 원칙
 *   - 입력(auto.events·auto.displayDates·auto.completed·user.*)을 절대 변경하지 않는다(정렬 등은 복사본에서). AUTO 항목은 같은 객체를 그대로 돌려준다.
 *   - AUTO 판정은 기존 앱과 같은 함수를 그대로 쓴다: benefit = HNLogic.coversDay(fixed), planned = HNLogic.plannedOnDay — 앱의 calendarDayItems 공식과 동일.
 *   - USER 는 UserSchedule.expandOccurrences 결과만 쓴다. USER 완료는 completed 와 무관(문서 status / exceptions)이며 진행률(%)에 섞지 않는다.
 *   - 월/주 구분은 range 로만 표현한다(같은 구조). 주 화면의 종일 행·기간 띠·추천 접힘 같은 표시 방식은 UI(B4).
 *   - 반복 일정(WEEKLY)은 UserSchedule.expandOccurrences 가 회차로 전개한다(B5). 취소 회차는 days[날짜].cancelled 로만 나가고 표식·집계에서 빠진다. 전개할 수 없는 규칙만 skipped 에 남긴다.
 *
 * 의존성(없으면 Node 에서 ./hn-logic.js, ./user-schedule.js 를 require, 브라우저에서는 전역 HNLogic, UserSchedule). deps 로 주입 가능.
 */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory(() => require("./hn-logic.js"), () => require("./user-schedule.js"));
  else root.CalendarModel = factory(() => root.HNLogic, () => root.UserSchedule);
})(typeof window !== "undefined" ? window : global, function (getHNLogic, getUserSchedule) {
  "use strict";

  const MAX_MARKS = 3;
  const toDate = (s) => {
    const [y, m, d] = s.split("-").map(Number);
    return new Date(y, m - 1, d);
  };

  function eachDay(US, start, end) {
    const out = [];
    for (let s = start; s <= end; s = US.addDays(s, 1)) out.push(s);
    return out;
  }

  const byTimeThenTitle = (a, b) => {
    if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
    if (!a.allDay && a.startTime !== b.startTime) return a.startTime < b.startTime ? -1 : 1;
    if (a.title !== b.title) return a.title < b.title ? -1 : 1;
    return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
  };

  /** USER 문서가 필터를 통과하는가 (§7-2). */
  function passesUserFilter(doc, filter) {
    if (filter.scope === "FAMILY") return doc.scope === "FAMILY";
    if (filter.scope === "CHILD") return doc.scope === "CHILD" && (doc.childKeys || []).includes(filter.childKey);
    return true; // ALL
  }

  /** AUTO 는 활성 아이 1명의 것이다(§7-3 1차): 전체이거나, 그 아이를 고른 경우에만 보인다. 가족 필터에서는 없다. */
  function autoVisible(filter, auto) {
    if (!filter.showAuto) return false;
    if (filter.scope === "FAMILY") return false;
    if (filter.scope === "CHILD") return auto.childKey == null || auto.childKey === filter.childKey;
    return true;
  }

  function buildCalendarModel(input, deps) {
    const HN = (deps && deps.HNLogic) || getHNLogic();
    const US = (deps && deps.UserSchedule) || getUserSchedule();
    const view = input.view === "week" ? "week" : "month";
    const range = input.range;
    const filter = { scope: "ALL", showAuto: true, ...(input.filter || {}) };
    const auto = input.auto || { events: [], displayDates: new Map(), completed: {} };
    const user = input.user || { schedules: [], childLinks: [], members: [] };

    if (!US.isDateStr(range.start) || !US.isDateStr(range.end) || range.end < range.start) throw new RangeError("range 가 올바르지 않다");
    if (US.dayDiff(range.start, range.end) + 1 > US.MAX_EXPANSION_DAYS) throw new RangeError("range 가 너무 길다");

    const childLinkOf = new Map((user.childLinks || []).map((c) => [c.childKey || c.id, c]));
    const memberOf = new Map((user.members || []).map((m) => [m.memberId || m.id, m]));
    const decorate = (o) => {
      const badges = (o.childKeys || []).map((k) => {
        const l = childLinkOf.get(k);
        return { childKey: k, displayName: l && !l.removedAt ? l.displayName : "(분리된 아이)", colorKey: (l && l.colorKey) || null, removed: !l || !!l.removedAt };
      });
      let assigneeLabel = null;
      if (o.assigneeMemberId) {
        const m = memberOf.get(o.assigneeMemberId);
        assigneeLabel = m && !m.deletedAt ? m.label : "(삭제된 담당자)";
      }
      return { ...o, done: o.status === "DONE", badges, assigneeLabel };
    };

    const dayKeys = eachDay(US, range.start, range.end);
    const days = new Map(dayKeys.map((k) => [k, { user: [], benefit: [], planned: [], marks: [], more: 0, total: 0, cancelled: [] }]));

    // ── USER ──
    const periodList = [];
    const skipped = [];
    for (const doc of user.schedules || []) {
      if (!doc || !passesUserFilter(doc, filter)) continue;
      if (US.isRecurring(doc) && !doc.deletedAt && !US.recurrenceUsable(doc.recurrence)) {
        skipped.push({ scheduleId: doc.id || null, reason: "recurrence-not-expanded" });
        continue;
      }
      for (const o of US.expandOccurrences(doc, range.start, range.end)) {
        const occ = decorate(o);
        if (occ.dateKind === "PERIOD") {
          periodList.push(occ);
          continue;
        }
        if (occ.status === "CANCELLED") {
          if (days.has(occ.date)) days.get(occ.date).cancelled.push(occ); // 취소한 회차: 표식·집계에서는 빠지고 그날 패널에서만 보인다
          continue;
        }
        const last = occ.endDate || occ.date;
        for (const k of dayKeys) if (k >= occ.date && k <= last) days.get(k).user.push(occ);
      }
    }
    for (const d of days.values()) {
      d.user.sort(byTimeThenTitle);
      d.cancelled.sort(byTimeThenTitle);
    }
    periodList.sort((a, b) => (a.periodEnd !== b.periodEnd ? (a.periodEnd < b.periodEnd ? -1 : 1) : a.title < b.title ? -1 : a.title > b.title ? 1 : 0));

    // ── AUTO (읽기 전용 — 기존 calendarDayItems 공식과 동일) ──
    if (autoVisible(filter, auto)) {
      const events = auto.events || [];
      const displayDates = auto.displayDates || new Map();
      for (const k of dayKeys) {
        const date = toDate(k);
        const cell = days.get(k);
        cell.benefit = events.filter((e) => e.scheduleKind === "fixed" && HN.coversDay(e, date));
        cell.planned = HN.plannedOnDay(events, displayDates, date);
      }
    }

    // ── 칸 표식: USER → 혜택 → 추천일, 최대 3개 + 나머지 ──
    const counts = { userItems: 0, benefit: 0, planned: 0, periodItems: periodList.length, userDone: 0 };
    const seenUser = new Set();
    for (const cell of days.values()) {
      const all = [...cell.user.map((ref) => ({ kind: "user", ref })), ...cell.benefit.map((ref) => ({ kind: "benefit", ref })), ...cell.planned.map((ref) => ({ kind: "planned", ref }))];
      cell.total = all.length;
      cell.marks = all.slice(0, MAX_MARKS);
      cell.more = Math.max(0, all.length - MAX_MARKS);
      counts.benefit += cell.benefit.length;
      counts.planned += cell.planned.length;
      for (const o of cell.user) {
        if (seenUser.has(o.key)) continue;
        seenUser.add(o.key);
        counts.userItems++;
        if (o.done) counts.userDone++;
      }
    }

    return { view, range: { start: range.start, end: range.end }, days, periodList, counts, skipped };
  }

  return { buildCalendarModel, MAX_MARKS };
});
