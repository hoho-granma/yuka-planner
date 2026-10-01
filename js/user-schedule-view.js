/*
 * user-schedule-view — 가족 캘린더에 "추가한 일정"을 보여 주고 입력받는 화면의 문구·마크업·데이터 변환 (B4 2단계: 순수 함수만).
 * 설계: docs/한눈육아-확장설계-2단계-상세.md §3·§7·§9, B4 계획서(사용자 승인) 및 승인된 문구 목록 #1~#59(#39·#42·#55 수정 반영).
 *
 * 원칙
 *   - DOM·Firestore·localStorage·네트워크를 쓰지 않는다. 문자열(HTML)과 평범한 객체만 만들고, 이벤트 연결·저장은 app.js 가 한다(B4 3단계).
 *   - js/user-schedule.js(UserSchedule)와 js/calendar-model.js(CalendarModel)의 출력 형태를 그대로 받는다. 두 모듈은 바꾸지 않는다.
 *   - 캘린더는 하나다(자동 일정 + 추가한 일정). 별도 "개인" 캘린더·범위는 없다 — scope 는 CHILD / FAMILY 두 가지뿐이다.
 *   - 자동 일정 완료(completed)와 추가한 일정 완료(문서 status)는 섞지 않는다. 이 모듈은 completed 를 받지도 않는다.
 *   - 동적 값(제목·장소·메모·아이 이름)은 전부 이스케이프하고, 색은 고정 팔레트에서만 고른다(스타일 주입 방지).
 *   - 날짜·시각은 "YYYY-MM-DD"/"HH:mm" 문자열 그대로 다룬다(Date 변환·타임존 없음).
 *
 * 의존성(선택 주입): UserSchedule(검증 폴백), DatePicker(HNDatePicker.markup). Node 에서는 require, 브라우저에서는 전역.
 */
(function (root, factory) {
  const mod = factory(
    () => (typeof module !== "undefined" && module.exports ? require("./user-schedule.js") : root.UserSchedule),
    () => (typeof module !== "undefined" && module.exports ? require("./date-picker.js") : root.HNDatePicker)
  );
  if (typeof module !== "undefined" && module.exports) module.exports = mod;
  else root.UserScheduleView = mod;
})(typeof window !== "undefined" ? window : global, function (getUS, getDP) {
  "use strict";

  // ── 승인된 문구 (번호는 B4 문구 목록 #) ─────────────────────────────────────
  const MSG = Object.freeze({
    addButton: "＋ 일정 추가", // #1
    needHousehold: '일정을 추가하려면 프로필의 "가족 캘린더"를 먼저 만들어 주세요.', // #2
    monthSummary: (n, m) => `이번 달 추가 일정 ${n}개 (완료 ${m})`, // #3
    monthEmpty: "이번 달에 추가한 일정이 없어요.", // #4
    groupAdded: "추가한 일정", // #5
    groupBenefit: "혜택 신청 시작", // #6
    groupPlanned: "추천 항목 (정해진 날이 아니에요)", // #7
    dayEmpty: "이 날 추가한 일정이 없어요.", // #8
    periodTitle: "이번 달 기간 일정", // #9
    periodNote: "날짜는 아직 정해지지 않았어요.", // #10
    periodRow: (range) => `날짜 미정 · ${range}`, // #11
    legend: "막대는 추가한 일정 · 원은 혜택과 추천 항목", // #12
    filterAll: "전체", // #13
    filterFamily: "가족", // #13
    toggleAuto: "자동 일정 함께 보기", // #14
    recurringSkipped: "반복 일정은 아직 표시되지 않아요.", // #15
    sheetAdd: "일정 추가", // #16
    sheetEdit: "일정 수정", // #17
    titleLabel: "제목", // #18
    titleHint: "예: 피아노 수업", // #18
    categoryLabel: "분류", // #19
    targetLabel: "대상", // #21
    targetFamily: "가족 전체", // #22
    dateLabel: "날짜", // #23
    kindFixed: "날짜 정함", // #24
    kindPeriod: "날짜 미정 (기간)", // #24
    dateField: "날짜", // #25
    endField: "마지막 날", // #25
    multiDay: "여러 날에 걸쳐요", // #26
    periodStart: "시작", // #27
    periodEnd: "끝", // #27
    periodHint: '정해지지 않은 일정은 달력 칸에는 찍히지 않고 "이번 달 기간 일정"에 모여요.', // #28
    allDay: "종일", // #29
    startField: "시작", // #30
    endTimeField: "종료", // #30
    locationLabel: "장소 (선택)", // #31
    locationHint: "예: 구로 음악학원", // #31
    memoLabel: "메모 (선택)", // #32
    memoHint: "준비물이나 참고할 점", // #32
    save: "저장", // #33
    cancel: "취소", // #33
    saving: "저장하는 중이에요…", // #34
    saveFail: "저장하지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.", // #35
    errTitleEmpty: "제목을 입력해 주세요.", // #36
    errTitleLong: "제목은 100자까지 쓸 수 있어요.", // #37
    errCategory: "분류를 골라 주세요.", // #38
    errTarget: '대상을 골라 주세요. 가족 모두와 관련된 일정은 "가족 전체"를 눌러 주세요.', // #39 (수정 승인)
    errDate: "날짜를 골라 주세요.", // #40
    errEndBeforeStart: "마지막 날은 시작하는 날과 같거나 이후여야 해요.", // #41
    errPeriodOrder: "기간의 시작은 끝보다 같거나 앞서야 해요.", // #42 (수정 승인)
    errStartTime: '시작 시각을 골라 주세요. 하루 종일이면 "종일"을 눌러 주세요.', // #43
    errEndTime: "종료 시각은 시작 시각보다 늦어야 해요.", // #44
    errLength: "메모는 500자, 장소는 100자까지 쓸 수 있어요.", // #45
    errGeneric: "입력한 내용을 다시 확인해 주세요.", // #46
    cardFamily: "가족 일정", // #47
    removedChild: "(분리된 아이)", // #49
    timeAllDay: "종일", // #50
    timeRange: (a, b) => `${a} ~ ${b}`, // #50
    timeFrom: (a) => `${a}부터`, // #50
    dateRange: (a, b) => `${a} ~ ${b}`, // #51
    done: "완료", // #52
    btnDone: "완료했어요", // #53
    btnUndone: "완료 취소", // #53
    btnEdit: "수정", // #53
    btnDelete: "삭제", // #53
    btnClose: "닫기", // #53
    deleteTitle: "이 일정을 삭제할까요?", // #54
    deleteBody: "삭제하면 가족 모두의 캘린더에서 사라져요. 지금은 복구할 수 없어요.", // #55 (수정 승인)
    deleteConfirm: "삭제", // #56
    deleteCancel: "취소", // #56
    actionFail: "처리하지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.", // #57
    // #58·#59(오프라인 대기·쓰기 거부)는 B3 의 HouseholdView.MSG.pending / denied 를 그대로 재사용한다.
  });

  const CATEGORIES = Object.freeze([
    { key: "LESSON", label: "수업·학원" },
    { key: "INSTITUTION", label: "어린이집·학교" },
    { key: "MEDICAL", label: "병원·검진" },
    { key: "FAMILY", label: "가족" },
    { key: "ETC", label: "기타" },
  ]); // #20
  const categoryLabel = (key) => (CATEGORIES.find((c) => c.key === key) || { label: "" }).label;

  // ── 아이별 색(링크 order 기반 파생 — 저장하지 않는다) ─────────────────────────
  const CHILD_PALETTE = Object.freeze(["#ff7a59", "#14b8a6", "#ec4899", "#a16207"]); // 첫째·둘째·셋째·넷째 이상
  const FAMILY_COLOR = "#6b5b53"; // 가족 일정(웜 그레이)
  const NEUTRAL_COLOR = FAMILY_COLOR;
  const ALL_COLORS = new Set([...CHILD_PALETTE, FAMILY_COLOR]);
  const safeColor = (c) => (ALL_COLORS.has(c) ? c : NEUTRAL_COLOR);

  const esc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const linkKey = (l) => l.childKey || l.id;
  const activeLinks = (links) => (links || []).filter((l) => l && !l.removedAt).slice().sort((a, b) => (a.order || 0) - (b.order || 0) || (a.addedAt || 0) - (b.addedAt || 0) || (linkKey(a) < linkKey(b) ? -1 : 1));

  /** 링크 order 로 아이 색을 고른다(order 1→코랄, 2→틸, 3→핑크, 4 이상→브라운). order 가 없으면 목록 순서. */
  function childColor(link, indexFallback) {
    const order = link && Number.isInteger(link.order) && link.order >= 1 ? link.order : (indexFallback || 0) + 1;
    return CHILD_PALETTE[Math.min(order, CHILD_PALETTE.length) - 1];
  }
  /** { childKey: color } — 분리된 아이도 자기 order 색을 유지한다(과거 일정 표시용). */
  function childColors(links) {
    const out = {};
    (links || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0)).forEach((l, i) => (out[linkKey(l)] = childColor(l, i)));
    return out;
  }
  /** 일정 한 건의 막대 색: 가족 일정=가족색, 아이 일정=childKeys 중 order 가 가장 앞선 아이의 색(공동 일정은 첫 아이 색 + 배지). */
  function occurrenceColor(occ, links) {
    if (!occ || occ.scope === "FAMILY" || !(occ.childKeys || []).length) return FAMILY_COLOR;
    const colors = childColors(links);
    const ordered = (occ.childKeys || []).slice().sort((a, b) => (colorRank(colors[a])) - (colorRank(colors[b])));
    return colors[ordered[0]] || NEUTRAL_COLOR;
  }
  const colorRank = (c) => (CHILD_PALETTE.indexOf(c) >= 0 ? CHILD_PALETTE.indexOf(c) : 99);

  // ── 필터 ──────────────────────────────────────────────────────────────────
  /** 선택값: "ALL" | "FAMILY" | "CHILD:<childKey>". 칩: 전체 / 아이들(분리된 아이 제외) / 가족. */
  function filterChips(links, selection) {
    const sel = normalizeSelection(selection, links);
    const chips = [{ id: "ALL", label: MSG.filterAll, selected: sel === "ALL" }];
    activeLinks(links).forEach((l) => chips.push({ id: `CHILD:${linkKey(l)}`, label: l.displayName || "", selected: sel === `CHILD:${linkKey(l)}`, color: childColors(links)[linkKey(l)] }));
    chips.push({ id: "FAMILY", label: MSG.filterFamily, selected: sel === "FAMILY" });
    return chips;
  }
  /** 선택한 아이가 분리됐거나 알 수 없는 값이면 "전체"로 되돌린다. */
  function normalizeSelection(selection, links) {
    if (selection === "FAMILY" || selection === "ALL") return selection;
    const m = /^CHILD:(.+)$/.exec(String(selection || ""));
    if (m && activeLinks(links).some((l) => linkKey(l) === m[1])) return selection;
    return "ALL";
  }
  /** CalendarModel.buildCalendarModel 의 input.filter */
  function toModelFilter(selection, showAuto, links) {
    const sel = normalizeSelection(selection, links);
    const showAutoFlag = showAuto !== false;
    if (sel === "FAMILY") return { scope: "FAMILY", showAuto: showAutoFlag };
    if (sel.startsWith("CHILD:")) return { scope: "CHILD", childKey: sel.slice(6), showAuto: showAutoFlag };
    return { scope: "ALL", showAuto: showAutoFlag };
  }
  function renderFilterChips(chips, showAuto) {
    const items = chips
      .map((c) => `<button type="button" class="us-chip${c.selected ? " active" : ""}" data-us-filter="${esc(c.id)}"${c.color ? ` style="--us-color:${safeColor(c.color)}"` : ""}>${esc(c.label)}</button>`)
      .join("");
    return `<div class="us-filter">${items}<button type="button" class="us-chip us-toggle${showAuto !== false ? " active" : ""}" data-us-action="toggle-auto" aria-pressed="${showAuto !== false}">${esc(MSG.toggleAuto)}</button></div>`;
  }

  // ── 표시용 데이터 변환 ─────────────────────────────────────────────────────
  const md = (s) => `${Number(s.slice(5, 7))}/${Number(s.slice(8, 10))}`; // "2026-10-06" → "10/6"
  function timeText(o) {
    if (o.allDay) return MSG.timeAllDay;
    if (o.startTime && o.endTime) return MSG.timeRange(o.startTime, o.endTime);
    if (o.startTime) return MSG.timeFrom(o.startTime);
    return "";
  }
  function dateText(o) {
    if (o.dateKind === "PERIOD") return MSG.periodRow(`${md(o.periodStart)}~${md(o.periodEnd)}`);
    return o.endDate && o.endDate !== o.date ? MSG.dateRange(md(o.date), md(o.endDate)) : "";
  }
  /** 칸·카드의 대상 표시: 가족 일정이면 "가족 일정", 아이 일정이면 아이 이름들("A · B"). 분리된 아이는 "(분리된 아이)". */
  function tagText(o) {
    if (o.scope === "FAMILY") return MSG.cardFamily;
    return (o.badges || []).map((b) => (b.removed ? MSG.removedChild : b.displayName)).join(" · ");
  }
  /** CalendarModel 의 Occurrence(decorate 포함) → 카드/상세용 평범한 객체. */
  function cardData(occ, links) {
    const done = occ.status === "DONE" || occ.done === true;
    return {
      key: occ.key,
      scheduleId: occ.scheduleId,
      title: occ.title,
      categoryKey: occ.category,
      categoryLabel: categoryLabel(occ.category),
      scope: occ.scope,
      timeText: occ.dateKind === "PERIOD" ? "" : timeText(occ),
      dateText: dateText(occ),
      tag: tagText(occ),
      color: occurrenceColor(occ, links),
      done,
      doneLabel: done ? MSG.done : "",
      location: occ.location || "",
      memo: occ.memo || "",
      isPeriod: occ.dateKind === "PERIOD",
    };
  }
  /** 날짜 칸 표식: 모델이 고른 최대 3개를 그리기 좋은 형태로. user=막대(아이색), benefit·planned=원(색은 앱의 기존 카테고리색 사용). */
  function cellMarks(day, links) {
    return {
      marks: (day.marks || []).map((m) =>
        m.kind === "user" ? { kind: "user", shape: "bar", color: occurrenceColor(m.ref, links), done: m.ref.status === "DONE" || m.ref.done === true, key: m.ref.key } : { kind: m.kind, shape: "dot", ref: m.ref }
      ),
      more: day.more || 0,
      total: day.total || 0,
    };
  }
  /** 선택한 날짜 패널: 추가한 일정은 카드 데이터, 자동 일정 두 구역은 제목·개수만(자동 일정 카드 마크업은 기존 앱이 그대로 그린다). */
  function dayPanel(day, links) {
    const cards = (day.user || []).map((o) => cardData(o, links));
    return {
      added: { title: MSG.groupAdded, cards },
      benefit: { title: MSG.groupBenefit, count: (day.benefit || []).length },
      planned: { title: MSG.groupPlanned, count: (day.planned || []).length },
      emptyAdded: cards.length === 0,
      emptyText: MSG.dayEmpty,
    };
  }
  /** 캘린더 상단 개수 줄(퍼센트 없음). 자동 일정 진행률과 섞지 않는다. */
  function monthSummary(counts) {
    const n = (counts && counts.userItems) || 0;
    const m = (counts && counts.userDone) || 0;
    return n === 0 ? MSG.monthEmpty : MSG.monthSummary(n, m);
  }
  /** "이번 달 기간 일정": 날짜 미정 일정(periodList). */
  function periodSection(periodList, links) {
    const rows = (periodList || []).map((o) => cardData(o, links));
    return { title: MSG.periodTitle, note: MSG.periodNote, rows, empty: rows.length === 0 };
  }
  const skippedNote = (skipped) => ((skipped || []).length ? MSG.recurringSkipped : "");

  // ── 카드·상세·삭제 확인·추가 버튼 마크업 ────────────────────────────────────
  function renderCard(c) {
    const meta = [c.categoryLabel, c.timeText, c.dateText].filter(Boolean).map(esc).join(" · ");
    return `<button type="button" class="us-card${c.done ? " done" : ""}" data-us-key="${esc(c.key)}" data-us-id="${esc(c.scheduleId)}" style="--us-color:${safeColor(c.color)}">
      <span class="us-bar"></span>
      <span class="us-body"><strong class="us-title">${esc(c.title)}</strong>
        <span class="us-meta">${meta}</span>
        ${c.tag ? `<span class="us-tag">${esc(c.tag)}</span>` : ""}
      </span>
      ${c.done ? `<span class="us-done">${esc(c.doneLabel)}</span>` : ""}
    </button>`;
  }
  /** 일정 한 건 상세 모달. 완료 버튼은 상태에 따라 "완료했어요" ↔ "완료 취소". */
  function detailView(c) {
    return { ...c, actions: [{ id: "toggle-done", label: c.done ? MSG.btnUndone : MSG.btnDone }, { id: "edit", label: MSG.btnEdit }, { id: "delete", label: MSG.btnDelete }, { id: "close", label: MSG.btnClose }] };
  }
  function renderDetail(c) {
    const v = detailView(c);
    const rows = [
      [MSG.categoryLabel, v.categoryLabel],
      [MSG.dateLabel, [v.dateText, v.timeText].filter(Boolean).join(" · ")],
      [MSG.targetLabel, v.tag],
      [MSG.locationLabel.replace(/ \(선택\)$/, ""), v.location],
      [MSG.memoLabel.replace(/ \(선택\)$/, ""), v.memo],
    ]
      .filter(([, val]) => val)
      .map(([k, val]) => `<div class="detail-row"><div class="label">${esc(k)}</div>${esc(val)}</div>`)
      .join("");
    return `<div class="us-detail" style="--us-color:${safeColor(v.color)}"><h3>${esc(v.title)}${v.done ? ` <span class="us-done">${esc(MSG.done)}</span>` : ""}</h3>${rows}
      <div class="us-actions">${v.actions.map((a) => `<button type="button" class="us-btn${a.id === "toggle-done" ? " us-primary" : ""}" data-us-action="${a.id}">${esc(a.label)}</button>`).join("")}</div></div>`;
  }
  function renderDeleteConfirm() {
    return `<div class="us-confirm"><h3>${esc(MSG.deleteTitle)}</h3><p>${esc(MSG.deleteBody)}</p>
      <div class="us-actions"><button type="button" class="us-btn us-danger" data-us-action="confirm-delete">${esc(MSG.deleteConfirm)}</button><button type="button" class="us-btn" data-us-action="cancel-delete">${esc(MSG.deleteCancel)}</button></div></div>`;
  }
  /** 캘린더 선택일 패널의 추가 버튼. 가구가 없으면 안내 문구만. 플래그 OFF → "". */
  function renderAddButton(state) {
    if (!state || state.enabled !== true) return "";
    if (!state.hasHousehold) return `<p class="us-note">${esc(MSG.needHousehold)}</p>`;
    return `<button type="button" class="us-btn us-primary us-add" data-us-action="add">${esc(MSG.addButton)}</button>`;
  }
  function renderPeriodSection(sec) {
    if (!sec || sec.empty) return "";
    return `<section class="us-period"><h4>${esc(sec.title)}</h4><p class="us-note">${esc(sec.note)}</p>${sec.rows.map(renderCard).join("")}</section>`;
  }

  // ── 입력 폼 상태 ───────────────────────────────────────────────────────────
  const PICKER_PREFIXES = Object.freeze({ date: "usd", end: "use", periodStart: "usps", periodEnd: "uspe" });
  const HOURS = Object.freeze(Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0")));
  const MINUTES = Object.freeze(Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, "0"))); // 5분 단위
  const splitTime = (t) => (/^\d{2}:\d{2}$/.test(t || "") ? { h: t.slice(0, 2), m: t.slice(3, 5) } : { h: "", m: "" });
  /** 5분 단위가 아닌 기존 값(예: 16:07)도 수정 화면에서 그대로 보이도록 선택한 분을 목록에 끼워 넣는다. */
  const minuteOptions = (current) => (current && !MINUTES.includes(current) ? [...MINUTES, current].sort() : MINUTES.slice());

  /** 새 일정 폼. date: 선택한 날짜("YYYY-MM-DD"), 대상 기본값 = 지금 보는 아이(가구에 링크돼 있을 때) 아니면 가족 전체. */
  function newForm({ date, activeChildKey, links }) {
    const active = activeLinks(links).some((l) => linkKey(l) === activeChildKey);
    return {
      mode: "create", scheduleId: null, title: "", category: "", scope: active ? "CHILD" : "FAMILY", childKeys: active ? [activeChildKey] : [],
      dateKind: "FIXED", eventDate: date || "", multiDay: false, endDate: "", periodStart: "", periodEnd: "", allDay: true, startTime: "", endTime: "", location: "", memo: "",
    };
  }
  /** 저장된 일정 문서에서 화면용 id 를 뗀다. getSchedules()/CalendarModel 의 문서에는 id 가 붙어 있는데 UserSchedule.buildPatch(before, …)·validate 는 저장 필드만 허용한다. */
  function stripId(doc) {
    const { id, ...rest } = doc || {};
    return rest;
  }
  /** 저장된 일정 문서(+id) → 수정 폼. */
  function formFromSchedule(doc) {
    return {
      mode: "edit", scheduleId: doc.id || null, title: doc.title || "", category: doc.category || "", scope: doc.scope, childKeys: (doc.childKeys || []).slice(),
      dateKind: doc.dateKind, eventDate: doc.eventDate || "", multiDay: !!doc.endDate, endDate: doc.endDate || "", periodStart: doc.periodStart || "", periodEnd: doc.periodEnd || "",
      allDay: doc.allDay !== false, startTime: doc.startTime || "", endTime: doc.endTime || "", location: doc.location || "", memo: doc.memo || "",
    };
  }
  /** 폼 → UserSchedule.buildCreateDoc 입력(MANUAL). 쓰지 않는 필드는 아예 넣지 않는다. */
  function formToInput(f) {
    const input = { sourceType: "MANUAL", title: String(f.title || "").trim(), category: f.category, scope: f.scope, dateKind: f.dateKind, allDay: !!f.allDay };
    if (f.scope === "CHILD") input.childKeys = (f.childKeys || []).slice();
    if (f.dateKind === "PERIOD") {
      input.periodStart = f.periodStart;
      input.periodEnd = f.periodEnd;
    } else {
      input.eventDate = f.eventDate;
      if (f.multiDay && f.endDate) input.endDate = f.endDate;
    }
    if (!f.allDay) {
      input.startTime = f.startTime;
      if (f.endTime) input.endTime = f.endTime;
    }
    const loc = String(f.location || "").trim();
    const memo = String(f.memo || "").trim();
    if (loc) input.location = loc;
    if (memo) input.memo = memo;
    return input;
  }
  /** 화면에서 먼저 하는 친절한 검증(승인된 문구). 통과하면 { ok:true }. 서버·문서 불변식은 UserSchedule.validate 가 다시 확인한다. */
  function validateForm(f) {
    const errors = [];
    const add = (field, message) => errors.push({ field, message });
    const title = String(f.title || "").trim();
    if (!title) add("title", MSG.errTitleEmpty);
    else if (title.length > 100) add("title", MSG.errTitleLong);
    if (!f.category) add("category", MSG.errCategory);
    if (f.scope === "CHILD" && !(f.childKeys || []).length) add("target", MSG.errTarget);
    if (f.dateKind === "PERIOD") {
      if (!f.periodStart || !f.periodEnd) add("period", MSG.errDate);
      else if (f.periodStart > f.periodEnd) add("period", MSG.errPeriodOrder);
    } else {
      if (!f.eventDate) add("date", MSG.errDate);
      else if (f.multiDay && f.endDate && f.endDate < f.eventDate) add("endDate", MSG.errEndBeforeStart);
    }
    if (f.dateKind !== "PERIOD" && !f.allDay) {
      if (!f.startTime) add("startTime", MSG.errStartTime);
      else if (f.endTime && f.endTime <= f.startTime) add("endTime", MSG.errEndTime);
    }
    if (String(f.memo || "").trim().length > 500 || String(f.location || "").trim().length > 100) add("memo", MSG.errLength);
    return { ok: errors.length === 0, errors };
  }
  /** UserSchedule 의 오류(코드·필드) → 화면 문구. 모르는 오류는 #46. 같은 문구는 한 번만. */
  function messagesFromErrors(errs) {
    const out = [];
    for (const e of errs || []) {
      const f = e.field || "";
      let m = MSG.errGeneric;
      if (f === "title") m = MSG.errTitleEmpty;
      else if (f === "category") m = MSG.errCategory;
      else if (f === "childKeys" || e.code === "I7") m = MSG.errTarget;
      else if (e.code === "I1" || f === "eventDate" || e.code === "I11") m = MSG.errDate;
      else if (e.code === "I4") m = MSG.errEndBeforeStart;
      else if (e.code === "I2") m = f === "periodStart" && /≤/.test(e.message || "") ? MSG.errPeriodOrder : MSG.errDate;
      else if (e.code === "I5" && f === "startTime") m = MSG.errStartTime;
      else if (e.code === "I5" && f === "endTime") m = MSG.errEndTime;
      else if (f === "memo" || f === "location") m = MSG.errLength;
      if (!out.includes(m)) out.push(m);
    }
    return out;
  }
  /** 화면 검증 + 문서 불변식 검증을 모두 거친 저장 입력. { ok, input, messages } */
  function prepareSave(f, now) {
    const v = validateForm(f);
    if (!v.ok) return { ok: false, messages: v.errors.map((e) => e.message) };
    const input = formToInput(f);
    const US = getUS();
    if (US) {
      const r = US.buildCreateDoc(input, now || 0);
      if (!r.ok) return { ok: false, messages: messagesFromErrors(r.errors) };
    }
    return { ok: true, input, messages: [] };
  }
  const PATCH_FIELDS = Object.freeze(["title", "category", "scope", "childKeys", "dateKind", "eventDate", "endDate", "periodStart", "periodEnd", "allDay", "startTime", "endTime", "location", "memo"]);
  /** 수정 폼 → UserSchedule.buildPatch 의 changes. 바뀐 필드만, 쓰지 않게 된 필드는 null(=삭제). */
  function changesFromForm(f, before) {
    const input = formToInput(f);
    const changes = {};
    for (const k of PATCH_FIELDS) {
      const next = input[k];
      const prev = before[k];
      if (next === undefined) {
        if (prev !== undefined && prev !== null) changes[k] = null;
      } else if (JSON.stringify(next) !== JSON.stringify(prev)) changes[k] = next;
    }
    return changes;
  }

  // ── 입력 시트 마크업 ───────────────────────────────────────────────────────
  const chip = (cls, attrs, label, active, color) => `<button type="button" class="us-chip${cls ? " " + cls : ""}${active ? " active" : ""}" ${attrs}${color ? ` style="--us-color:${safeColor(color)}"` : ""}>${esc(label)}</button>`;
  const timeSelect = (id, value, label) => {
    const p = splitTime(value);
    return `<span class="us-time"><label for="${id}-h">${esc(label)}</label><select id="${id}-h" data-us-time="${id}"><option value="">--</option>${HOURS.map((h) => `<option value="${h}"${p.h === h ? " selected" : ""}>${h}</option>`).join("")}</select><select id="${id}-m" data-us-time="${id}"><option value="">--</option>${minuteOptions(p.m).map((m) => `<option value="${m}"${p.m === m ? " selected" : ""}>${m}</option>`).join("")}</select></span>`;
  };
  function picker(prefix, value, placeholder) {
    const DP = getDP();
    const html = DP ? DP.markup(prefix, placeholder) : `<div id="${prefix}-slot"></div>`;
    return value ? html.replace(`id="${prefix}-date"`, `id="${prefix}-date" value="${esc(value)}"`) : html;
  }
  /** 일정 추가·수정 시트. links: 아이 링크(분리된 아이는 선택지에서 제외). 날짜 달력 컴포넌트(HNDatePicker)는 app.js 가 bind 한다. */
  function renderForm(f, links, opts) {
    const o = opts || {};
    const kids = activeLinks(links);
    const colors = childColors(links);
    const cats = CATEGORIES.map((c) => chip("", `data-us-cat="${c.key}"`, c.label, f.category === c.key)).join("");
    const targets =
      kids.map((l) => chip("", `data-us-target="${esc(linkKey(l))}"`, l.displayName || "", f.scope === "CHILD" && (f.childKeys || []).includes(linkKey(l)), colors[linkKey(l)])).join("") +
      chip("", 'data-us-target="FAMILY"', MSG.targetFamily, f.scope === "FAMILY");
    const fixed = f.dateKind !== "PERIOD";
    const dates = fixed
      ? `<div class="us-field"><label>${esc(MSG.dateField)}</label>${picker(PICKER_PREFIXES.date, f.eventDate)}</div>
         <label class="us-check"><input type="checkbox" id="us-multi"${f.multiDay ? " checked" : ""} /> ${esc(MSG.multiDay)}</label>
         ${f.multiDay ? `<div class="us-field"><label>${esc(MSG.endField)}</label>${picker(PICKER_PREFIXES.end, f.endDate)}</div>` : ""}
         <label class="us-check"><input type="checkbox" id="us-allday"${f.allDay ? " checked" : ""} /> ${esc(MSG.allDay)}</label>
         ${f.allDay ? "" : `<div class="us-times">${timeSelect("us-start", f.startTime, MSG.startField)}${timeSelect("us-end", f.endTime, MSG.endTimeField)}</div>`}`
      : `<div class="us-field"><label>${esc(MSG.periodStart)}</label>${picker(PICKER_PREFIXES.periodStart, f.periodStart)}</div>
         <div class="us-field"><label>${esc(MSG.periodEnd)}</label>${picker(PICKER_PREFIXES.periodEnd, f.periodEnd)}</div>
         <p class="us-note">${esc(MSG.periodHint)}</p>`;
    const errors = (o.messages || []).map((m) => `<p class="us-error">${esc(m)}</p>`).join("");
    return `<div class="us-form" data-us-mode="${esc(f.mode)}">
      <h3>${esc(f.mode === "edit" ? MSG.sheetEdit : MSG.sheetAdd)}</h3>
      <div class="us-field"><label for="us-title">${esc(MSG.titleLabel)}</label><input type="text" id="us-title" maxlength="100" placeholder="${esc(MSG.titleHint)}" value="${esc(f.title)}" /></div>
      <div class="us-field"><label>${esc(MSG.categoryLabel)}</label><div class="us-chips">${cats}</div></div>
      <div class="us-field"><label>${esc(MSG.targetLabel)}</label><div class="us-chips">${targets}</div></div>
      <div class="us-field"><label>${esc(MSG.dateLabel)}</label><div class="us-chips">${chip("", 'data-us-kind="FIXED"', MSG.kindFixed, fixed)}${chip("", 'data-us-kind="PERIOD"', MSG.kindPeriod, !fixed)}</div></div>
      ${dates}
      <div class="us-field"><label for="us-location">${esc(MSG.locationLabel)}</label><input type="text" id="us-location" maxlength="100" placeholder="${esc(MSG.locationHint)}" value="${esc(f.location)}" /></div>
      <div class="us-field"><label for="us-memo">${esc(MSG.memoLabel)}</label><textarea id="us-memo" maxlength="500" placeholder="${esc(MSG.memoHint)}">${esc(f.memo)}</textarea></div>
      <div id="us-errors">${errors}</div>
      ${o.saving ? `<p class="us-note">${esc(MSG.saving)}</p>` : ""}
      <div class="us-actions"><button type="button" class="us-btn us-primary" data-us-action="save"${o.saving ? " disabled" : ""}>${esc(MSG.save)}</button><button type="button" class="us-btn" data-us-action="cancel">${esc(MSG.cancel)}</button></div>
    </div>`;
  }
  /** 폼의 날짜 값 → 달력 컴포넌트 초기값(prefix → "YYYY-MM-DD") */
  function pickerInitials(f) {
    return f.dateKind === "PERIOD"
      ? { [PICKER_PREFIXES.periodStart]: f.periodStart, [PICKER_PREFIXES.periodEnd]: f.periodEnd }
      : { [PICKER_PREFIXES.date]: f.eventDate, ...(f.multiDay ? { [PICKER_PREFIXES.end]: f.endDate } : {}) };
  }

  return {
    MSG, CATEGORIES, CHILD_PALETTE, FAMILY_COLOR, PICKER_PREFIXES, HOURS, MINUTES,
    categoryLabel, childColor, childColors, occurrenceColor,
    filterChips, normalizeSelection, toModelFilter, renderFilterChips,
    cardData, cellMarks, dayPanel, monthSummary, periodSection, skippedNote, timeText, dateText, tagText,
    renderCard, detailView, renderDetail, renderDeleteConfirm, renderAddButton, renderPeriodSection,
    newForm, formFromSchedule, stripId, formToInput, validateForm, messagesFromErrors, prepareSave, changesFromForm, minuteOptions, splitTime,
    renderForm, pickerInitials, esc,
  };
});
