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

  /**
   * C2: autoRef 연결 색인(순수, 읽기 전용). childKey 의 아이에게 연결된(autoRef 가 있고 삭제·취소되지 않은 비반복) 일정을 AUTO 항목 id 별로 모은다.
   *   childKey 가 없으면 빈 Map(어느 아이의 AUTO 인지 모르면 연결을 적용하지 않는다). aliases: { 옛 id: 새 id } — 데이터 수정으로 AUTO id 가 바뀐 경우의 해석.
   *   한 AUTO 에 일정이 여럿이면 '현재 예약' 하나: 미완료 중 날짜가 가장 이른 것, 미완료가 없으면 가장 최근 완료. count 는 연결 일정 수.
   *   값: { autoId, scheduleId, date, status, count }. date 는 eventDate(없으면 periodStart).
   */
  function linksByAutoId(schedules, childKey, aliases) {
    const out = new Map();
    if (childKey == null) return out;
    const al = aliases && typeof aliases === "object" ? aliases : {};
    const dateOf = (d) => d.eventDate || d.periodStart || "";
    const groups = new Map();
    for (const d of schedules || []) {
      if (!d || typeof d.autoRef !== "string" || d.deletedAt != null || d.status === "CANCELLED") continue;
      if (!Array.isArray(d.childKeys) || d.childKeys[0] !== childKey) continue;
      const id = Object.prototype.hasOwnProperty.call(al, d.autoRef) ? al[d.autoRef] : d.autoRef;
      if (!groups.has(id)) groups.set(id, []);
      groups.get(id).push(d);
    }
    const cmp = (a, b) => (dateOf(a) < dateOf(b) ? -1 : dateOf(a) > dateOf(b) ? 1 : String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0);
    for (const [id, list] of groups) {
      const open = list.filter((d) => d.status !== "DONE");
      open.sort(cmp);
      const all = list.slice();
      all.sort(cmp);
      const cur = open.length ? open[0] : all[all.length - 1];
      out.set(id, { autoId: id, scheduleId: cur.id || null, date: dateOf(cur), status: cur.status || "TODO", count: list.length });
    }
    return out;
  }

  /** C2 1차 연결 대상(MEDICAL 성격 AUTO): 예방접종(VX)·영유아검진(HC) 정의, 그리고 치과 OR-03(첫 치과 방문)·OR-04(정기 치과검진). 이벤트의 detail.definition 으로 판정(읽기만). */
  const LINKABLE_CODES = Object.freeze(["VX", "HC"]);
  const LINKABLE_TODO_IDS = Object.freeze(["OR-03", "OR-04"]);
  function isLinkableAuto(event) {
    const def = event && event.detail && event.detail.definition;
    if (!def || typeof def.todo_id !== "string") return false;
    return LINKABLE_CODES.includes(def.category) || LINKABLE_TODO_IDS.includes(def.todo_id);
  }

  /** USER 문서가 필터를 통과하는가 (§7-2). */
  /**
   * 일정의 소유 태그: 담당 구성원이 엄마·아빠(MOM/DAD)면 그 역할, 가족 일정이면 "FAMILY", 아이 일정이면 "CHILD:<childKey>"(여러 명이면 모두).
   * filter.owners(복수 선택 필터)와 겹치는 태그가 하나라도 있으면 통과한다.
   */
  function ownerTags(doc, memberOf) {
    const tags = [];
    const m = doc.assigneeMemberId && memberOf ? memberOf.get(doc.assigneeMemberId) : null;
    if (m && !m.deletedAt && (m.role === "MOM" || m.role === "DAD")) tags.push(m.role);
    if (m && !m.deletedAt) tags.push(`MEMBER:${doc.assigneeMemberId}`); // 계정 모드(D3): 구성원 단위 필터
    if (doc.scope === "FAMILY") tags.push("FAMILY");
    for (const k of doc.childKeys || []) tags.push(`CHILD:${k}`);
    return tags;
  }

  function passesUserFilter(doc, filter, memberOf) {
    if (Array.isArray(filter.owners) && filter.owners.length) return ownerTags(doc, memberOf).some((t) => filter.owners.includes(t));
    if (filter.scope === "FAMILY") return doc.scope === "FAMILY";
    if (filter.scope === "CHILD") return doc.scope === "CHILD" && (doc.childKeys || []).includes(filter.childKey);
    return true; // ALL
  }

  /** AUTO 는 활성 아이 1명의 것이다(§7-3 1차): 전체이거나, 그 아이를 고른 경우에만 보인다. 가족 필터에서는 없다. */
  function autoVisible(filter, auto) {
    if (!filter.showAuto) return false;
    // 복수 선택 필터: 현재 아이가 선택에 포함될 때만 보인다(아이를 모르면 아이 칩이 하나라도 선택된 경우). 엄마·아빠·가족만 고르면 없다.
    if (Array.isArray(filter.owners) && filter.owners.length) {
      return auto.childKey == null ? filter.owners.some((t) => t.startsWith("CHILD:")) : filter.owners.includes(`CHILD:${auto.childKey}`);
    }
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
      let assigneeRole = null;
      let assigneeColorKey = null;
      if (o.assigneeMemberId) {
        const m = memberOf.get(o.assigneeMemberId);
        assigneeLabel = m && !m.deletedAt ? m.label : "(삭제된 담당자)";
        assigneeRole = m && !m.deletedAt ? m.role || null : null;
        assigneeColorKey = m && !m.deletedAt ? m.colorKey || null : null;
      }
      return { ...o, done: o.status === "DONE", badges, assigneeLabel, assigneeRole, assigneeColorKey };
    };

    const dayKeys = eachDay(US, range.start, range.end);
    const days = new Map(dayKeys.map((k) => [k, { user: [], benefit: [], planned: [], marks: [], more: 0, total: 0, cancelled: [] }]));

    // ── USER ──
    const periodList = [];
    const skipped = [];
    for (const doc of user.schedules || []) {
      if (!doc || !passesUserFilter(doc, filter, memberOf)) continue;
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
      const hiddenAutoIds = auto.hideLinked === false ? new Set() : new Set(linksByAutoId(user.schedules, auto.childKey, auto.autoIdAliases).keys()); // hideLinked:false 면 숨기지 않는다(앱의 autoLink 플래그 OFF)
      for (const k of dayKeys) {
        const date = toDate(k);
        const cell = days.get(k);
        cell.benefit = events.filter((e) => e.scheduleKind === "fixed" && HN.coversDay(e, date));
        cell.planned = HN.plannedOnDay(events, displayDates, date);
        // C2: 연결된(예약이 있는) AUTO 항목의 추천일 표식은 숨긴다. events/displayDates 는 그대로, 이 칸의 표시 목록에서만 뺀다. 아이를 모르면(childKey 없음) 숨기지 않는다.
        if (hiddenAutoIds.size && cell.planned.length) cell.planned = cell.planned.filter((e) => !hiddenAutoIds.has(e.id));
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

  return { buildCalendarModel, linksByAutoId, isLinkableAuto, ownerTags, MAX_MARKS };
});
