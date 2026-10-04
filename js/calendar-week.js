/*
 * calendar-week — 캘린더 주 보기(F2)의 날짜 계산과 마크업(순수 모듈). DOM·저장소·네트워크를 쓰지 않는다.
 * 날짜는 "YYYY-MM-DD" 문자열로만 다루고(UTC 기준 계산 — 타임존·DST 영향 없음), 주는 일요일 시작(월 달력 그리드와 같다).
 * 월 모델(CalendarModel)은 바꾸지 않는다: 주 보기는 같은 모델을 view:"week", range=한 주로 받아 쓴다.
 */
(function (root, factory) {
  const mod = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = mod;
  else root.CalendarWeek = mod;
})(typeof window !== "undefined" ? window : global, function () {
  "use strict";

  // 승인 문구(F2 #6~#9)
  const MSG = Object.freeze({
    viewMonth: "월",
    viewWeek: "주",
    viewLabel: "보기 방식",
    prevMonth: "이전 달",
    nextMonth: "다음 달",
    prevWeek: "이전 주",
    nextWeek: "다음 주",
    dayEmpty: "일정 없음",
    autoCount: (n) => `자동 일정 ${n}개`,
    more: (n) => `+${n}`,
  });
  const DOW = Object.freeze(["일", "월", "화", "수", "목", "금", "토"]);
  const MAX_ITEMS = 3;
  const SAFE_COLOR = /^#[0-9a-fA-F]{6}$/;

  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const isIso = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
  const utc = (iso) => { const [y, m, d] = iso.split("-").map(Number); return Date.UTC(y, m - 1, d); };
  const fromUtc = (ms) => { const d = new Date(ms); return `${String(d.getUTCFullYear()).padStart(4, "0")}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`; };
  const DAY = 86400000;

  /** iso 에서 n 일 뒤(음수 가능). */
  function addDays(iso, n) { return fromUtc(utc(iso) + n * DAY); }
  /** 요일(0=일). */
  function dowOf(iso) { return new Date(utc(iso)).getUTCDay(); }
  /** 그 날이 속한 주의 일요일. */
  function weekStartOf(iso) { return addDays(iso, -dowOf(iso)); }
  /** 그 날이 속한 주 {start(일), end(토)}. */
  function weekRange(iso) { const s = weekStartOf(iso); return { start: s, end: addDays(s, 6) }; }
  /** 일요일부터 7일. */
  function weekDays(iso) { const s = weekStartOf(iso); return Array.from({ length: 7 }, (_, i) => addDays(s, i)); }
  /** 주 이동: 같은 요일을 유지한 채 n 주 뒤(음수 가능)의 날짜. */
  function shiftWeek(iso, n) { return addDays(iso, 7 * n); }
  /** "YYYY-MM-DD" → 그 달 1일 "YYYY-MM-01". */
  function monthStartOf(iso) { return `${iso.slice(0, 7)}-01`; }
  /** 로컬 자정 Date (앱의 selectedCalendarDate/viewMonth 와 같은 종류). */
  function toLocalDate(iso) { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d); }
  /** "10월 4일 ~ 10일" / 달이 걸치면 "9월 28일 ~ 10월 4일" / 해가 걸치면 연도 표시 "2026년 12월 28일 ~ 2027년 1월 3일". */
  function weekTitle(iso) {
    const { start, end } = weekRange(iso);
    const [sy, sm, sd] = start.split("-").map(Number);
    const [ey, em, ed] = end.split("-").map(Number);
    if (sy !== ey) return `${sy}년 ${sm}월 ${sd}일 ~ ${ey}년 ${em}월 ${ed}일`;
    return sm === em ? `${sm}월 ${sd}일 ~ ${ed}일` : `${sm}월 ${sd}일 ~ ${em}월 ${ed}일`;
  }

  /** "월 | 주" 보기 전환 칩. view 는 현재 보기. */
  function renderViewToggle(view) {
    const chip = (v, label) => `<button type="button" class="us-chip${view === v ? " active" : ""}" data-cal-view="${v}" aria-pressed="${view === v}">${esc(label)}</button>`;
    return `<div class="cal-view-toggle" role="group" aria-label="${esc(MSG.viewLabel)}">${chip("month", MSG.viewMonth)}${chip("week", MSG.viewWeek)}</div>`;
  }

  /**
   * 주 보기 7열 마크업. days: [{ date, today, selected, user:[{title, color, done}], autoCount }].
   * 일정 제목은 열 폭이 좁아 CSS 로 한 줄 말줄임. 일정이 3개를 넘으면 "+N", 자동 일정은 개수 한 줄로만 요약한다.
   */
  function renderWeekCols(days) {
    return (days || [])
      .map((d) => {
        const dow = dowOf(d.date);
        const day = Number(d.date.slice(8, 10));
        const user = d.user || [];
        const items = user.slice(0, MAX_ITEMS).map((o) => `<span class="wk-item${o.done ? " done" : ""}" style="--wk-color:${SAFE_COLOR.test(o.color) ? o.color : "#62656b"}">${esc(o.title)}</span>`).join("");
        const more = user.length > MAX_ITEMS ? `<span class="wk-more">${esc(MSG.more(user.length - MAX_ITEMS))}</span>` : "";
        const auto = d.autoCount > 0 ? `<span class="wk-auto">${esc(MSG.autoCount(d.autoCount))}</span>` : "";
        const empty = !user.length && !(d.autoCount > 0) ? `<span class="wk-empty">${esc(MSG.dayEmpty)}</span>` : "";
        const total = user.length + (d.autoCount > 0 ? d.autoCount : 0);
        return `<button type="button" class="week-col${d.today ? " today" : ""}${d.selected ? " selected" : ""}" data-wk-date="${esc(d.date)}" aria-label="${esc(`${Number(d.date.slice(5, 7))}월 ${day}일(${DOW[dow]}) · 항목 ${total}건`)}"><span class="wk-num">${day}</span>${items}${more}${auto}${empty}</button>`;
      })
      .join("");
  }

  return { MSG, DOW, MAX_ITEMS, addDays, dowOf, weekStartOf, weekRange, weekDays, shiftWeek, monthStartOf, toLocalDate, weekTitle, renderViewToggle, renderWeekCols };
});
