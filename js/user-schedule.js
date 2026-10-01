/*
 * user-schedule — 사용자 일정(USER) 문서의 검증·생성·수정 패치·회차 변환(B2, 순수 모듈).
 * 설계: docs/한눈육아-확장설계-2단계-상세.md §3(스키마·불변식), §4(AUTO와 분리), §5(날짜 규칙), §6(반복 — 저장 구조까지만).
 *
 * 원칙
 *   - DOM·Firestore·localStorage·다른 모듈에 의존하지 않는다. 자동 일정(TodoEngine·buildSchedule·assignDisplayDays·completed)을 참조하지 않는다.
 *   - 저장 위치: households/{hid}/schedules/{sid}. AUTO 일정은 저장하지 않으며 displayDate 필드는 스키마에 없다(I12).
 *   - 날짜·시각은 "YYYY-MM-DD"/"HH:mm" 문자열 그대로(타임존 변환 없음, I11). 날짜 산술은 로컬 Date 만 쓴다(toISOString 금지).
 *   - 삭제는 소프트(deletedAt)만. 반복 일정은 B2 에서 저장 구조·검증까지만 — 실제 전개는 B5(expandOccurrences 는 반복 문서를 건너뛴다).
 *   - Firestore I/O 는 하지 않는다(B4 에서 household-sync.js 와 연결). 패치 값 null = 해당 필드 삭제(B4 어댑터가 FieldValue.delete() 로 변환).
 *   - 아래 상수는 firestore.rules 의 [B2] 블록과 같은 값이다(test/firestore-rules.logic.test.js 가 대조한다).
 */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else root.UserSchedule = factory();
})(typeof window !== "undefined" ? window : global, function () {
  "use strict";

  const SOURCE_TYPES = ["MANUAL", "OCR", "VOICE", "IMPORT"];
  const CATEGORIES = ["LESSON", "INSTITUTION", "MEDICAL", "FAMILY", "ETC"];
  const SCOPES = ["CHILD", "FAMILY"];
  const DATE_KINDS = ["FIXED", "PERIOD"];
  const STATUSES = ["TODO", "DONE", "CANCELLED", "RESCHEDULED"];
  const WEEKDAYS = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];

  const LIMITS = Object.freeze({ titleMin: 1, titleMax: 100, memoMax: 500, locationMax: 100, exceptionsMax: 200, childKeysMax: 10, tagsMax: 10 });
  const MAX_EXPANSION_DAYS = 400;

  const REQUIRED_KEYS = Object.freeze(["v", "sourceType", "title", "category", "scope", "dateKind", "allDay", "createdAt", "updatedAt"]);
  const OPTIONAL_KEYS = Object.freeze([
    "tags", "childKeys", "eventDate", "endDate", "periodStart", "periodEnd", "startTime", "endTime", "recurrence", "exceptions",
    "assigneeMemberId", "needsAssignee", "status", "location", "memo", "provenance", "deletedAt", "authorLabel", "splitFromScheduleId",
  ]);
  const ALLOWED_KEYS = Object.freeze([...REQUIRED_KEYS, ...OPTIONAL_KEYS]);
  /** 한 번 정해지면 수정 패치로 바꿀 수 없는 필드(규칙에서도 불변). */
  const IMMUTABLE_KEYS = Object.freeze(["v", "createdAt", "sourceType"]);

  // ── 날짜·시각 문자열 ─────────────────────────────────────────────────
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  const TIME_RE = /^\d{2}:\d{2}$/;
  function isDateStr(s) {
    if (typeof s !== "string" || !DATE_RE.test(s)) return false;
    const [y, m, d] = s.split("-").map(Number);
    const t = new Date(y, m - 1, d);
    return t.getFullYear() === y && t.getMonth() === m - 1 && t.getDate() === d; // 2026-02-30 같은 날짜 거부
  }
  function isTimeStr(s) {
    if (typeof s !== "string" || !TIME_RE.test(s)) return false;
    const [h, m] = s.split(":").map(Number);
    return h <= 23 && m <= 59;
  }
  const nil = (v) => v === undefined || v === null;
  /** 로컬 날짜 산술: "YYYY-MM-DD" + n일. */
  function addDays(s, n) {
    const [y, m, d] = s.split("-").map(Number);
    const t = new Date(y, m - 1, d + n);
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
  }
  function dayDiff(a, b) {
    const [ay, am, ad] = a.split("-").map(Number);
    const [by, bm, bd] = b.split("-").map(Number);
    return Math.round((new Date(by, bm - 1, bd) - new Date(ay, am - 1, ad)) / 86400000);
  }

  const isRecurring = (doc) => !nil(doc && doc.recurrence);

  // ── 반복 규칙(B5): 매주 / N주마다. 주는 월요일 시작, 첫 날(startDate)이 속한 주가 0번째 주 ──────────────
  const DOW_CODE = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"]; // Date.getDay() 순서
  const EXCEPTION_WARN_AT = 180;
  function weekdayOf(s) {
    const [y, m, d] = s.split("-").map(Number);
    return DOW_CODE[new Date(y, m - 1, d).getDay()];
  }
  const mondayOf = (s) => addDays(s, -WEEKDAYS.indexOf(weekdayOf(s)));
  /** 전개할 수 있는 규칙인가(WEEKLY + 올바른 필드). 검증을 통과하지 못한 문서가 전개에서 예외를 던지지 않게 하는 방어선. */
  function recurrenceUsable(rec) {
    return !!rec && typeof rec === "object" && !Array.isArray(rec) && rec.freq === "WEEKLY" && isDateStr(rec.startDate)
      && Array.isArray(rec.byDay) && rec.byDay.length > 0 && rec.byDay.every((d) => WEEKDAYS.includes(d))
      && (nil(rec.interval) || (Number.isInteger(rec.interval) && rec.interval >= 1)) && (nil(rec.until) || isDateStr(rec.until));
  }
  /** 그 날짜가 반복 규칙이 만드는 회차의 "원래 날짜"인가. 문서(doc) 또는 규칙(rec) 둘 다 받는다. */
  function isRuleDate(docOrRec, date) {
    const rec = docOrRec && docOrRec.recurrence !== undefined ? docOrRec.recurrence : docOrRec;
    if (!recurrenceUsable(rec) || !isDateStr(date)) return false;
    if (date < rec.startDate || (!nil(rec.until) && date > rec.until)) return false;
    if (!rec.byDay.includes(weekdayOf(date))) return false;
    return (dayDiff(mondayOf(rec.startDate), mondayOf(date)) / 7) % (rec.interval || 1) === 0;
  }
  const exceptionCount = (doc) => Object.keys((doc && doc.exceptions) || {}).length;

  // ── 검증 ─────────────────────────────────────────────────────────────
  /** 불변식 I1~I12 + 스키마. { ok, errors: [{code, field, message}] } */
  function validate(doc) {
    const errors = [];
    const err = (code, field, message) => errors.push({ code, field, message });
    if (!doc || typeof doc !== "object" || Array.isArray(doc)) return { ok: false, errors: [{ code: "SCHEMA", field: "", message: "문서가 객체가 아니다" }] };

    for (const k of Object.keys(doc)) {
      if (!ALLOWED_KEYS.includes(k)) err(k === "displayDate" ? "I12" : "SCHEMA", k, k === "displayDate" ? "displayDate 는 저장 문서에 없다" : `허용되지 않은 필드: ${k}`);
    }
    for (const k of REQUIRED_KEYS) if (nil(doc[k])) err("SCHEMA", k, `필수 필드 누락: ${k}`);

    if (doc.v !== 1) err("SCHEMA", "v", "v 는 1");
    if (!SOURCE_TYPES.includes(doc.sourceType)) err("SCHEMA", "sourceType", "sourceType enum");
    if (!CATEGORIES.includes(doc.category)) err("SCHEMA", "category", "category enum");
    if (!SCOPES.includes(doc.scope)) err("SCHEMA", "scope", "scope enum");
    if (!DATE_KINDS.includes(doc.dateKind)) err("SCHEMA", "dateKind", "dateKind enum");
    if (typeof doc.allDay !== "boolean") err("SCHEMA", "allDay", "allDay 는 boolean");
    if (!nil(doc.status) && !STATUSES.includes(doc.status)) err("SCHEMA", "status", "status enum");
    for (const k of ["createdAt", "updatedAt"]) if (!nil(doc[k]) && typeof doc[k] !== "number") err("SCHEMA", k, `${k} 는 ms 숫자`);
    if (!nil(doc.deletedAt) && typeof doc.deletedAt !== "number") err("SCHEMA", "deletedAt", "deletedAt 는 ms 숫자");

    if (typeof doc.title !== "string" || doc.title.length < LIMITS.titleMin || doc.title.length > LIMITS.titleMax) err("SCHEMA", "title", `title ${LIMITS.titleMin}~${LIMITS.titleMax}자`);
    if (!nil(doc.memo) && (typeof doc.memo !== "string" || doc.memo.length > LIMITS.memoMax)) err("SCHEMA", "memo", `memo ≤${LIMITS.memoMax}자`);
    if (!nil(doc.location) && (typeof doc.location !== "string" || doc.location.length > LIMITS.locationMax)) err("SCHEMA", "location", `location ≤${LIMITS.locationMax}자`);
    if (!nil(doc.tags) && (!Array.isArray(doc.tags) || doc.tags.length > LIMITS.tagsMax || doc.tags.some((t) => typeof t !== "string"))) err("SCHEMA", "tags", `tags 문자열 배열 ≤${LIMITS.tagsMax}`);
    if (!nil(doc.assigneeMemberId) && typeof doc.assigneeMemberId !== "string") err("SCHEMA", "assigneeMemberId", "assigneeMemberId 는 문자열");

    // I7 scope ↔ childKeys
    const ck = doc.childKeys;
    if (!nil(ck) && (!Array.isArray(ck) || ck.length > LIMITS.childKeysMax || ck.some((c) => typeof c !== "string"))) err("SCHEMA", "childKeys", `childKeys 문자열 배열 ≤${LIMITS.childKeysMax}`);
    else if (doc.scope === "CHILD" && !(Array.isArray(ck) && ck.length >= 1)) err("I7", "childKeys", "scope=CHILD 는 childKeys 1개 이상");
    else if (doc.scope === "FAMILY" && Array.isArray(ck) && ck.length > 0) err("I7", "childKeys", "scope=FAMILY 는 childKeys 가 비어야 한다");

    // 날짜 문자열 형식(I11)
    for (const k of ["eventDate", "endDate", "periodStart", "periodEnd"]) if (!nil(doc[k]) && !isDateStr(doc[k])) err("I11", k, `${k} 는 실제 존재하는 YYYY-MM-DD`);

    // I1~I4
    const rec = doc.recurrence;
    if (isRecurring(doc)) {
      if (doc.dateKind !== "FIXED") err("I3", "dateKind", "반복 일정은 FIXED");
      if (!nil(doc.eventDate)) err("I3", "eventDate", "반복 일정은 eventDate 가 없다(시작은 recurrence.startDate)");
      if (!nil(doc.periodStart) || !nil(doc.periodEnd)) err("I3", "periodStart", "반복 일정은 periodStart/End 가 없다");
      if (!nil(doc.endDate)) err("I4", "endDate", "반복 일정에는 endDate 를 쓰지 않는다");
      if (!nil(doc.status)) err("SCHEMA", "status", "반복 일정의 완료·취소는 exceptions[날짜].status 로만 표현한다");
      validateRecurrence(rec, err);
    } else if (doc.dateKind === "FIXED") {
      if (nil(doc.eventDate)) err("I1", "eventDate", "FIXED 는 eventDate 필수");
      if (!nil(doc.periodStart) || !nil(doc.periodEnd)) err("I1", "periodStart", "FIXED 는 periodStart/End 가 없다");
      if (!nil(doc.endDate) && isDateStr(doc.endDate) && isDateStr(doc.eventDate) && doc.endDate < doc.eventDate) err("I4", "endDate", "endDate ≥ eventDate");
    } else if (doc.dateKind === "PERIOD") {
      if (nil(doc.periodStart) || nil(doc.periodEnd)) err("I2", "periodStart", "PERIOD 는 periodStart/End 필수");
      else if (isDateStr(doc.periodStart) && isDateStr(doc.periodEnd) && doc.periodStart > doc.periodEnd) err("I2", "periodStart", "periodStart ≤ periodEnd");
      if (!nil(doc.eventDate) || !nil(doc.endDate)) err("I2", "eventDate", "PERIOD 는 eventDate/endDate 가 없다");
    }

    // I5, I6
    if (doc.allDay === false) {
      if (nil(doc.startTime)) err("I5", "startTime", "allDay=false 는 startTime 필수");
      else if (!isTimeStr(doc.startTime)) err("I5", "startTime", "HH:mm");
      if (!nil(doc.endTime)) {
        if (!isTimeStr(doc.endTime)) err("I5", "endTime", "HH:mm");
        else if (isTimeStr(doc.startTime) && doc.endTime <= doc.startTime) err("I5", "endTime", "endTime > startTime(자정 넘김 미지원)");
      }
    } else if (doc.allDay === true && (!nil(doc.startTime) || !nil(doc.endTime))) err("I6", "startTime", "allDay=true 는 시각 필드가 없다");

    // I8
    if (doc.sourceType && doc.sourceType !== "MANUAL") {
      if (!(doc.provenance && typeof doc.provenance === "object" && doc.provenance.confirmedByUser === true)) err("I8", "provenance", "OCR/VOICE/IMPORT 는 사용자 확인(provenance.confirmedByUser) 필수");
    }

    // I10 exceptions
    if (!nil(doc.exceptions)) {
      if (typeof doc.exceptions !== "object" || Array.isArray(doc.exceptions)) err("I10", "exceptions", "exceptions 는 map");
      else {
        const keys = Object.keys(doc.exceptions);
        if (keys.length > LIMITS.exceptionsMax) err("I10", "exceptions", `exceptions ≤${LIMITS.exceptionsMax}`);
        for (const k of keys) {
          const ex = doc.exceptions[k];
          if (!isDateStr(k)) err("I10", `exceptions.${k}`, "예외 키는 YYYY-MM-DD(점 불가)");
          else if (!ex || typeof ex !== "object" || Array.isArray(ex)) err("I10", `exceptions.${k}`, "예외 값은 map");
          else {
            if (!nil(ex.status) && !STATUSES.includes(ex.status)) err("I10", `exceptions.${k}.status`, "status enum");
            if (!nil(ex.movedTo) && !(ex.movedTo && isDateStr(ex.movedTo.date))) err("I10", `exceptions.${k}.movedTo`, "movedTo.date 는 YYYY-MM-DD");
            else if (!nil(ex.movedTo)) {
              const mv = ex.movedTo;
              if (!nil(mv.startTime) && !isTimeStr(mv.startTime)) err("I10", `exceptions.${k}.movedTo.startTime`, "HH:mm");
              if (!nil(mv.endTime) && (nil(mv.startTime) || !isTimeStr(mv.endTime) || mv.endTime <= mv.startTime)) err("I10", `exceptions.${k}.movedTo.endTime`, "endTime 은 startTime 이 있고 그보다 늦어야 한다");
            }
          }
        }
      }
    }
    return { ok: errors.length === 0, errors };
  }

  function validateRecurrence(rec, err) {
    if (!rec || typeof rec !== "object" || Array.isArray(rec)) return err("I3", "recurrence", "recurrence 는 map");
    if (rec.freq !== "WEEKLY") err("I3", "recurrence.freq", "v1 은 WEEKLY 만");
    if (!nil(rec.interval) && !(Number.isInteger(rec.interval) && rec.interval >= 1)) err("I3", "recurrence.interval", "interval 은 1 이상 정수");
    if (!Array.isArray(rec.byDay) || rec.byDay.length === 0 || rec.byDay.some((d) => !WEEKDAYS.includes(d))) err("I3", "recurrence.byDay", "byDay 는 MO..SU 비어 있지 않은 배열");
    if (!isDateStr(rec.startDate)) err("I3", "recurrence.startDate", "startDate 는 YYYY-MM-DD");
    if (!nil(rec.until) && (!isDateStr(rec.until) || (isDateStr(rec.startDate) && rec.until < rec.startDate))) err("I3", "recurrence.until", "until 은 startDate 이후의 YYYY-MM-DD 또는 null");
  }

  // ── 생성 / 수정 패치 ─────────────────────────────────────────────────
  /** 입력에서 허용 필드만 골라(null·undefined 는 생략) 새 문서를 만든다. v/createdAt/updatedAt 을 채우고 검증한다. */
  function buildCreateDoc(input, now) {
    const doc = {};
    for (const k of ALLOWED_KEYS) if (!nil(input && input[k])) doc[k] = input[k];
    doc.v = 1;
    doc.createdAt = now;
    doc.updatedAt = now;
    if (!isRecurring(doc) && nil(doc.status)) doc.status = "TODO";
    if (doc.scope === "FAMILY") delete doc.childKeys;
    const dropped = input ? Object.keys(input).filter((k) => !ALLOWED_KEYS.includes(k)) : [];
    const v = validate(doc);
    const errors = v.errors.concat(dropped.map((k) => ({ code: k === "displayDate" ? "I12" : "SCHEMA", field: k, message: `허용되지 않은 필드: ${k}` })));
    return { ok: errors.length === 0, doc, errors };
  }

  /**
   * 수정 패치. changes 의 값이 null 이면 그 필드를 지운다. exceptions 는 { "YYYY-MM-DD": {...}|null } 로 날짜 단위 변경을 준다.
   * 반환: { ok, patch, after, errors } — patch 는 Firestore update() 용 평탄 맵(예외는 "exceptions.<날짜>" dot-path), after 는 적용 후 문서.
   */
  function buildPatch(before, changes, now) {
    const errors = [];
    const patch = {};
    const after = JSON.parse(JSON.stringify(before));
    for (const [k, val] of Object.entries(changes || {})) {
      if (IMMUTABLE_KEYS.includes(k)) {
        errors.push({ code: "IMMUTABLE", field: k, message: `${k} 는 수정할 수 없다` });
        continue;
      }
      if (k === "updatedAt") continue;
      if (k === "exceptions") {
        if (!val || typeof val !== "object" || Array.isArray(val)) {
          errors.push({ code: "I10", field: "exceptions", message: "exceptions 변경은 { 날짜: 값|null } 형태" });
          continue;
        }
        after.exceptions = after.exceptions || {};
        for (const [d, ex] of Object.entries(val)) {
          patch[`exceptions.${d}`] = nil(ex) ? null : ex;
          if (nil(ex)) delete after.exceptions[d];
          else after.exceptions[d] = ex;
        }
        if (Object.keys(after.exceptions).length === 0) delete after.exceptions;
        continue;
      }
      patch[k] = nil(val) ? null : val;
      if (nil(val)) delete after[k];
      else after[k] = val;
    }
    patch.updatedAt = now;
    after.updatedAt = now;
    const v = validate(after);
    const all = errors.concat(v.errors);
    return { ok: all.length === 0, patch, after, errors: all };
  }

  /** 완료/취소 등 상태 변경. 반복 일정은 날짜가 필요하다(exceptions[날짜].status), 비반복은 문서 status. */
  function setStatus(before, status, now, opts) {
    if (isRecurring(before)) {
      const date = opts && opts.date;
      if (!isDateStr(date)) return { ok: false, patch: null, after: null, errors: [{ code: "I10", field: "date", message: "반복 일정의 상태 변경은 회차 날짜(YYYY-MM-DD)가 필요하다" }] };
      const prev = (before.exceptions && before.exceptions[date]) || {};
      return buildPatch(before, { exceptions: { [date]: { ...prev, status } } }, now);
    }
    return buildPatch(before, { status }, now);
  }
  const markDone = (before, now, opts) => setStatus(before, "DONE", now, opts);

  /** 소프트 삭제 — deletedAt 만 기록한다(하드 삭제는 규칙이 막는다). */
  function softDelete(before, now) {
    return buildPatch(before, { deletedAt: now }, now);
  }

  // ── 회차(Occurrence) ────────────────────────────────────────────────
  /**
   * 화면 범위 [rangeStart, rangeEnd] 와 겹치는 비반복 일정을 Occurrence 로 바꾼다.
   *   FIXED: date=eventDate(endDate 가 있으면 확정 연속 기간), PERIOD: date=null(날짜 점 없음 — 기간 목록용).
   *   deletedAt 이 있는 문서는 건너뛴다. 반복 문서는 expandRecurring 이 회차로 전개한다. 범위가 MAX_EXPANSION_DAYS 를 넘으면 RangeError.
   */
  function expandOccurrences(doc, rangeStart, rangeEnd) {
    if (!isDateStr(rangeStart) || !isDateStr(rangeEnd) || rangeEnd < rangeStart) throw new RangeError("범위가 올바르지 않다");
    if (dayDiff(rangeStart, rangeEnd) + 1 > MAX_EXPANSION_DAYS) throw new RangeError(`전개 범위는 ${MAX_EXPANSION_DAYS}일 이하`);
    if (!doc || !nil(doc.deletedAt)) return [];
    if (isRecurring(doc)) return expandRecurring(doc, rangeStart, rangeEnd);
    const common = {
      origin: "USER", sourceType: doc.sourceType, scheduleId: doc.id || null, childKeys: doc.childKeys || [], scope: doc.scope, category: doc.category,
      title: doc.title, allDay: doc.allDay, startTime: doc.startTime || null, endTime: doc.endTime || null, assigneeMemberId: doc.assigneeMemberId || null,
      status: doc.status || "TODO", memo: doc.memo || "", location: doc.location || "", tags: doc.tags || [], dateKind: doc.dateKind,
    };
    if (doc.dateKind === "PERIOD") {
      if (doc.periodEnd < rangeStart || doc.periodStart > rangeEnd) return [];
      return [{ ...common, key: `u:${common.scheduleId}@period`, date: null, originalDate: null, periodStart: doc.periodStart, periodEnd: doc.periodEnd }];
    }
    const end = doc.endDate || doc.eventDate;
    if (end < rangeStart || doc.eventDate > rangeEnd) return [];
    const o = { ...common, key: `u:${common.scheduleId}@${doc.eventDate}`, date: doc.eventDate, originalDate: doc.eventDate };
    if (doc.endDate) o.endDate = doc.endDate;
    return [o];
  }

  /**
   * 반복 문서 → 화면 범위의 회차들. 회차는 저장하지 않는다(규칙 + exceptions[원래 날짜]).
   *   key=u:<id>@<원래 날짜>, date=표시 날짜(이동했으면 movedTo.date), originalDate=규칙상 날짜.
   *   CANCELLED 는 원래 날짜에 status:"CANCELLED" 로 포함한다(표식·집계에서 빼는 것은 CalendarModel). DONE 은 status:"DONE".
   *   이동한 회차는 "원래 날짜"에는 나타나지 않고 이동한 날짜에만 나타난다(rescheduled:true, movedFrom). 원래 날짜가 범위 밖이어도 이동 후 날짜가 범위 안이면 포함한다.
   *   규칙에 맞지 않는 날짜의 예외는 무시. 사용할 수 없는 규칙(freq 등)은 [] — CalendarModel 이 skipped 로 남긴다.
   */
  function expandRecurring(doc, rangeStart, rangeEnd) {
    const rec = doc.recurrence;
    if (!recurrenceUsable(rec)) return [];
    const exs = doc.exceptions || {};
    const cand = new Set();
    const from = rec.startDate > rangeStart ? rec.startDate : rangeStart;
    const to = !nil(rec.until) && rec.until < rangeEnd ? rec.until : rangeEnd;
    for (let d = from; d <= to; d = addDays(d, 1)) if (isRuleDate(rec, d)) cand.add(d);
    for (const k of Object.keys(exs)) if (isRuleDate(rec, k)) cand.add(k); // 범위 밖 원래 날짜에서 범위 안으로 옮겨진 회차
    const out = [];
    for (const orig of [...cand].sort()) {
      const ex = exs[orig] && typeof exs[orig] === "object" ? exs[orig] : {};
      const cancelled = ex.status === "CANCELLED";
      const mv = ex.movedTo && isDateStr(ex.movedTo.date) ? ex.movedTo : null;
      const moved = !cancelled && !!mv;
      const date = moved ? mv.date : orig;
      if (date < rangeStart || date > rangeEnd) continue;
      let allDay = doc.allDay, startTime = doc.startTime || null, endTime = doc.endTime || null;
      if (moved && !nil(mv.startTime)) {
        allDay = false;
        startTime = mv.startTime;
        endTime = mv.endTime || null;
      }
      const o = {
        origin: "USER", sourceType: doc.sourceType, scheduleId: doc.id || null, childKeys: doc.childKeys || [], scope: doc.scope, category: doc.category,
        title: doc.title, allDay, startTime, endTime, assigneeMemberId: doc.assigneeMemberId || null,
        status: cancelled ? "CANCELLED" : ex.status === "DONE" ? "DONE" : "TODO", memo: doc.memo || "", location: doc.location || "", tags: doc.tags || [], dateKind: "FIXED",
        key: `u:${doc.id || null}@${orig}`, date, originalDate: orig, recurring: true, rescheduled: moved,
      };
      if (moved && mv.date !== orig) o.movedFrom = orig;
      out.push(o);
    }
    return out;
  }

  // ── 반복 일정의 "이 날만" / "전체" 편집 (순수 — 패치를 만들어 돌려줄 뿐 저장은 호출자) ──────────────────
  function occurrenceGuard(before, date) {
    if (!isRecurring(before)) return [{ code: "I10", field: "date", message: "반복 일정이 아니다" }];
    if (!isDateStr(date) || !isRuleDate(before, date)) return [{ code: "I10", field: "date", message: "반복 규칙에 없는 날짜다" }];
    return [];
  }
  const fail = (errors) => ({ ok: false, patch: null, after: null, errors });
  const exOf = (before, date) => (before.exceptions && before.exceptions[date]) || {};
  const exOrNull = (ex) => (Object.keys(ex).length ? ex : null);

  /** 이 날만 취소(status CANCELLED). 이동 정보(movedTo)가 있어도 그대로 두어 되돌릴 때 복원된다. */
  function cancelOccurrence(before, date, now) {
    const g = occurrenceGuard(before, date);
    if (g.length) return fail(g);
    return buildPatch(before, { exceptions: { [date]: { ...exOf(before, date), status: "CANCELLED" } } }, now);
  }
  /** 취소 또는 완료를 되돌린다: 이동한 회차는 RESCHEDULED 로, 아니면 status 를 지운다(남는 것이 없으면 예외 자체를 삭제). */
  function restoreOccurrence(before, date, now) {
    const g = occurrenceGuard(before, date);
    if (g.length) return fail(g);
    const prev = { ...exOf(before, date) };
    if (prev.status !== "CANCELLED" && prev.status !== "DONE") return fail([{ code: "I10", field: "date", message: "되돌릴 상태가 없다" }]);
    if (prev.movedTo) prev.status = "RESCHEDULED";
    else delete prev.status;
    return buildPatch(before, { exceptions: { [date]: exOrNull(prev) } }, now);
  }
  /** 이 날만 날짜/시간 바꾸기. to={date, startTime?, endTime?}. 원래 날짜·시각 그대로면 이동을 해제한다. 취소된 회차는 먼저 되돌려야 한다. */
  function moveOccurrence(before, date, to, now) {
    const g = occurrenceGuard(before, date);
    if (g.length) return fail(g);
    const prev = { ...exOf(before, date) };
    if (prev.status === "CANCELLED") return fail([{ code: "I10", field: "date", message: "취소된 회차는 먼저 되돌려야 한다" }]);
    if (!to || !isDateStr(to.date)) return fail([{ code: "I10", field: "movedTo.date", message: "옮길 날짜가 올바르지 않다" }]);
    const timed = !nil(to.startTime);
    if (to.date === date && !timed) {
      delete prev.movedTo;
      if (prev.status === "RESCHEDULED") delete prev.status;
      return buildPatch(before, { exceptions: { [date]: exOrNull(prev) } }, now);
    }
    const movedTo = { date: to.date };
    if (timed) {
      movedTo.startTime = to.startTime;
      if (!nil(to.endTime)) movedTo.endTime = to.endTime;
    }
    return buildPatch(before, { exceptions: { [date]: { ...prev, movedTo, status: prev.status === "DONE" ? "DONE" : "RESCHEDULED" } } }, now);
  }
  /** 새 규칙에서 쓸모없어지는 예외 [{date, effective}] — effective 는 지금 규칙에서는 화면에 영향을 주던 예외(사용자가 잃게 되는 기록). */
  function exceptionsToPrune(before, newRec) {
    return Object.keys(before.exceptions || {})
      .filter((d) => !isRuleDate(newRec, d))
      .sort()
      .map((d) => ({ date: d, effective: isRecurring(before) && isRuleDate(before, d) }));
  }
  /**
   * 전체 수정. buildPatch 와 같은 반환 + { pruned:[{date,effective}], prunedEffective:n }.
   *   - 규칙(recurrence)이 바뀌면 새 규칙에서도 유효한 예외는 그대로 두고, 맞지 않게 된 예외만 "exceptions.<날짜>": null 로 정리한다.
   *     정리는 날짜별 dot-path 라서 오프라인 상태에서 보내도 서버에 새로 생긴 다른 날짜의 예외를 덮어쓰지 않는다.
   *   - 단일 → 반복, 반복 → 단일 전환도 같은 길로 처리한다(반복 → 단일이면 모든 예외 정리, eventDate 는 changes 가 준다).
   */
  function editAll(before, changes, now) {
    const c = { ...(changes || {}) };
    const wasRec = isRecurring(before);
    const hasRec = Object.prototype.hasOwnProperty.call(c, "recurrence");
    const newRec = hasRec ? (nil(c.recurrence) ? null : c.recurrence) : wasRec ? before.recurrence : null;
    let pruned = [];
    if (!wasRec && newRec) {
      Object.assign(c, { dateKind: "FIXED", eventDate: null, endDate: null, periodStart: null, periodEnd: null, status: null });
    } else if (wasRec && !newRec) {
      pruned = exceptionsToPrune(before, null);
      if (nil(c.status)) c.status = "TODO";
    } else if (wasRec && hasRec) {
      if (JSON.stringify(c.recurrence) === JSON.stringify(before.recurrence)) delete c.recurrence;
      else pruned = exceptionsToPrune(before, newRec);
    }
    if (pruned.length) {
      c.exceptions = { ...(c.exceptions || {}) };
      for (const p of pruned) if (!(p.date in c.exceptions)) c.exceptions[p.date] = null;
    }
    const r = buildPatch(before, c, now);
    return { ...r, pruned, prunedEffective: pruned.filter((p) => p.effective).length };
  }

  /**
   * OCR/음성 후보 → 문서 입력. 원문에서 확인된 값만 쓰고(I9), 비어 있는 필수값은 needsUserInput 으로 돌려준다.
   * 날짜가 없으면 FIXED 로 만들 수 없으므로 doc 는 null(사용자가 채우거나 PERIOD 로 저장). 확인(confirmedByUser)은 이 함수가 대신하지 않는다.
   */
  function normalizeFromCandidate(candidate, today) {
    const c = candidate || {};
    const needs = [];
    const input = {
      sourceType: c.sourceType, title: c.title, category: c.category, scope: c.scope, childKeys: c.childKeys,
      allDay: c.allDay, startTime: c.startTime, endTime: c.endTime, location: c.location, memo: c.memo, provenance: c.provenance,
    };
    if (!c.title) needs.push("title");
    if (!c.category) needs.push("category");
    if (!c.scope) needs.push("scope");
    if (typeof c.allDay !== "boolean") needs.push("allDay");
    if (isDateStr(c.eventDate)) {
      input.dateKind = "FIXED";
      input.eventDate = c.eventDate;
      if (isDateStr(c.endDate)) input.endDate = c.endDate;
    } else if (isDateStr(c.periodStart) && isDateStr(c.periodEnd)) {
      input.dateKind = "PERIOD";
      input.periodStart = c.periodStart;
      input.periodEnd = c.periodEnd;
    } else needs.push("date");
    if (c.allDay === false && !isTimeStr(c.startTime)) needs.push("startTime");
    if (!c.provenance || c.provenance.confirmedByUser !== true) needs.push("confirmedByUser");
    return { input: needs.includes("date") ? null : input, needsUserInput: needs, today };
  }

  return {
    SOURCE_TYPES, CATEGORIES, SCOPES, DATE_KINDS, STATUSES, WEEKDAYS, LIMITS, MAX_EXPANSION_DAYS, REQUIRED_KEYS, OPTIONAL_KEYS, ALLOWED_KEYS, IMMUTABLE_KEYS,
    validate, buildCreateDoc, buildPatch, setStatus, markDone, softDelete, expandOccurrences, normalizeFromCandidate,
    isDateStr, isTimeStr, addDays, dayDiff, isRecurring, recurrenceUsable, isRuleDate, weekdayOf, exceptionCount, EXCEPTION_WARN_AT,
    cancelOccurrence, restoreOccurrence, moveOccurrence, exceptionsToPrune, editAll,
  };
});
