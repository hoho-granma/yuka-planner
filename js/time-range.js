/*
 * time-range — 일정 시간의 표기와 15분 단위 범위 계산(순수 모듈: DOM·저장소·네트워크 없음).
 * 표기(시안 D): "오후 4:00 ~ 5:00 (1시간)" · 끝 시간이 없으면 시작만 "오후 4:00" · 종일은 "종일". 오전·오후가 같으면 끝의 오전/오후는 생략한다.
 * 입력(시안 B): 시작을 바꾸면 끝이 같은 길이로 따라오고, 끝이 시작보다 빠르거나 같으면 경고 + 자동 값으로 되돌린다. 모든 시간은 "HH:MM" 문자열(저장 형식 그대로).
 */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else root.TimeRange = factory();
})(typeof window !== "undefined" ? window : global, function () {
  "use strict";

  const STEP = 15; // 분 단위
  const DEFAULT_LENGTH = 60; // 기본 길이(분)
  const DAY = 24 * 60;
  const MSG = Object.freeze({ allDay: "종일", endBeforeStart: "끝나는 시간이 시작보다 빨라요. 시작 1시간 뒤로 맞췄어요.", endBeforeStartShort: "끝나는 시간은 시작보다 늦어야 해요." });

  /** "HH:MM" → 분(0~1439), 형식이 다르면 null */
  function toMin(t) {
    const m = /^(\d{2}):(\d{2})$/.exec(String(t || ""));
    if (!m) return null;
    const h = Number(m[1]), mi = Number(m[2]);
    return h > 23 || mi > 59 ? null : h * 60 + mi;
  }
  /** 분 → "HH:MM" (0~1439 으로 자른다) */
  function fromMin(n) {
    const v = Math.max(0, Math.min(DAY - 1, Math.round(n)));
    return `${String(Math.floor(v / 60)).padStart(2, "0")}:${String(v % 60).padStart(2, "0")}`;
  }
  const meridiem = (min) => (min < 12 * 60 ? "오전" : "오후");
  const clock = (min) => `${Math.floor(min / 60) % 12 === 0 ? 12 : Math.floor(min / 60) % 12}:${String(min % 60).padStart(2, "0")}`;
  /** "14:30" → "오후 2:30". 형식이 다르면 "". */
  function clock12(t) {
    const m = toMin(t);
    return m == null ? "" : `${meridiem(m)} ${clock(m)}`;
  }
  /** 길이(분) → "30분" · "1시간" · "1시간 30분". 0 이하이거나 24시간 이상이면 "". */
  function durationText(mins) {
    if (!(mins > 0) || mins >= DAY) return "";
    const h = Math.floor(mins / 60), m = mins % 60;
    return [h ? `${h}시간` : "", m ? `${m}분` : ""].filter(Boolean).join(" ");
  }
  /** 시간 일정 표기. o = { allDay, startTime, endTime }. 시작이 없으면 "". */
  function displayText(o) {
    if (!o) return "";
    if (o.allDay) return MSG.allDay;
    const s = toMin(o.startTime);
    if (s == null) return "";
    const e = toMin(o.endTime);
    if (e == null || e <= s) return clock12(o.startTime);
    const end = meridiem(s) === meridiem(e) ? clock(e) : `${meridiem(e)} ${clock(e)}`;
    const len = durationText(e - s);
    return `${clock12(o.startTime)} ~ ${end}${len ? ` (${len})` : ""}`;
  }

  /** 15분 단위로 맞춤(가장 가까운 칸). */
  const snap = (min) => Math.max(0, Math.min(DAY - STEP, Math.round(min / STEP) * STEP));
  /** 칸 이동: 분 값에 delta 칸(15분)을 더한다. 하루 안에서만(넘치면 끝에서 멈춘다). */
  const step = (min, delta) => Math.max(0, Math.min(DAY - STEP, snap(min) + delta * STEP));
  /** 새 범위 기본값: 시작은 15분 단위로 맞추고 끝은 기본 길이(1시간) 뒤. 24시를 넘으면 끝을 23:45 로 둔다. */
  function initial(startTime, endTime) {
    const s = toMin(startTime);
    const start = snap(s == null ? 9 * 60 : s);
    const e = toMin(endTime);
    const end = e != null && e > start ? e : Math.min(DAY - STEP, start + DEFAULT_LENGTH);
    return { start: fromMin(start), end: fromMin(Math.max(end, start + STEP > DAY - STEP ? DAY - STEP : end)), warn: "" };
  }
  /** 시작을 바꿨을 때: 끝이 같은 길이로 따라온다(하루를 넘기면 23:45 에서 멈추고 길이는 줄어든다). */
  function changeStart(range, newStart) {
    const oldS = toMin(range.start), oldE = toMin(range.end);
    const s = snap(toMin(newStart));
    const len = oldS != null && oldE != null && oldE > oldS ? oldE - oldS : DEFAULT_LENGTH;
    let e = snap(s + len); // 조작한 시작·끝 모두 15분 칸으로(기존 시각이 15분 단위가 아니어도)
    if (e > DAY - STEP) e = DAY - STEP;
    if (e <= s) e = Math.min(DAY - STEP, s + STEP);
    return { start: fromMin(s), end: fromMin(e), warn: "" };
  }
  /** 끝을 바꿨을 때: 시작보다 늦어야 한다. 아니면 경고와 함께 시작 1시간 뒤(하루 안)로 되돌린다. */
  function changeEnd(range, newEnd) {
    const s = toMin(range.start), e = snap(toMin(newEnd));
    if (e > s) return { start: range.start, end: fromMin(e), warn: "" };
    return { start: range.start, end: fromMin(Math.min(DAY - STEP, s + DEFAULT_LENGTH)), warn: MSG.endBeforeStart };
  }
  return { STEP, DEFAULT_LENGTH, MSG, toMin, fromMin, clock12, durationText, displayText, snap, step, initial, changeStart, changeEnd };
});
