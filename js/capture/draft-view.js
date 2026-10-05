/*
 * draft-view — 2-1/2-2 붙여넣기·말로 추가 화면 마크업(순수). 앱에는 아직 로드하지 않는다. 명세 docs/한눈육아-디자인명세-붙여넣기확인.md §3.
 * 기존 .us-* 클래스를 재사용하고, '확인 필요'는 S5 글자(.us-nc, 배경·뱃지 없음) + 그 칸 테두리 #f9cb34 1.5px(css/capture.css). 이 파일은 DOM·저장소·시각을 만지지 않는다.
 *   renderPaste(s, o) / renderCandidates(s, o) / checkable(c) / registerCount(s) / withToggle(...)
 * s = { text, cands:[candidate + { checked, removed, dateUndecided }], undo:bool }, o = { mode:"mic"|"keyboard", listening, voiceNote(bool), childName(key)→문자열, spoken:bool }
 */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else root.CaptureDraftView = factory();
})(typeof window !== "undefined" ? window : global, function () {
  "use strict";

  const esc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const DOW = "일월화수목금토";
  const MSG = Object.freeze({
    pasteTitle: "붙여넣기로 추가", voiceTitle: "말로 추가", pastePlaceholder: "예) 10월 14일(화) 오후 3시 30분 하린 치과 예약입니다",
    pasteNote: "날짜가 분명하지 않으면 비워 두고 확인을 부탁드려요. 붙여 넣은 글은 저장하지 않아요.",
    find: "일정 찾기", interpret: "해석하기", example: "예) 다음 주 화요일 세 시에 하린 치과 예약",
    keyboardNote: "키보드의 마이크(받아쓰기)를 눌러 말한 뒤, 여기에 입력돼요.", listening: "듣고 있어요… 말을 마치면 버튼을 다시 눌러 주세요",
    voiceNote: "음성은 기기의 받아쓰기 기능으로 글자로 바뀌어요. 한눈육아는 녹음을 저장하지 않아요.", micAria: "말로 입력", emptyHeard: "잘 듣지 못했어요. 다시 말하거나 직접 입력해 주세요.",
    found: (n) => `일정 후보 ${n}개를 찾았어요. 맞는지 확인해 주세요.`, none: "일정을 찾지 못했어요.", direct: "직접 입력하기",
    needCheck: "확인 필요", pickDate: "날짜 선택", undecided: "날짜 미정(기간)으로 두기", edit: "수정", remove: "빼기", undo: "되돌리기", raw: "원문 보기 ›",
    register: (n) => `${n}개 등록`, cancel: "취소", noAssignee: "담당 미정", noRepeat: "반복 없음", weekly: "매주", biweekly: "2주마다",
  });
  const DAYS = { MO: "월", TU: "화", WE: "수", TH: "목", FR: "금", SA: "토", SU: "일" };

  /** 체크할 수 있는가: 날짜가 있거나 '날짜 미정'을 직접 골랐을 때만(빈 날짜 후보는 체크 불가 — 결정 3). */
  const checkable = (c) => !!c && !c.removed && (!!c.eventDate || c.dateUndecided === true);
  const isChecked = (c) => checkable(c) && c.checked !== false; // 기본 체크됨(날짜가 있으면)
  const registerCount = (s) => ((s && s.cands) || []).filter(isChecked).length;

  const dateKo = (isoStr) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoStr || "");
    if (!m) return "";
    const dt = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return `${Number(m[2])}월 ${Number(m[3])}일(${DOW[dt.getDay()]})`;
  };
  const timeKo = (t) => {
    const m = /^(\d{2}):(\d{2})$/.exec(t || "");
    if (!m) return "";
    const h = Number(m[1]), mm = m[2], p = h < 12 ? "오전" : "오후", h12 = h % 12 === 0 ? 12 : h % 12;
    return `${p} ${h12}:${mm}`;
  };
  const whenText = (c) => {
    if (!c.eventDate) return "";
    let s = dateKo(c.eventDate);
    if (c.endDate) s += `~${dateKo(c.endDate)}`;
    if (!c.allDay && c.startTime) s += ` ${timeKo(c.startTime)}${c.endTime ? `~${timeKo(c.endTime)}` : ""}`;
    return s;
  };
  const checkOf = (c, field) => (c.needsCheck || []).filter((x) => x.field === field);

  function renderPaste(s, o) {
    const st = s || {}, op = o || {};
    const voice = op.voice === true; // '말로 추가' 진입
    const mic = op.mode === "mic" ? `<button type="button" class="us-chip us-mic" data-cap-mic aria-pressed="${op.listening ? "true" : "false"}" aria-label="${esc(MSG.micAria)}"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg></button>` : "";
    const notes = [];
    if (voice && op.mode === "mic" && op.listening) notes.push(MSG.listening);
    if (voice && op.mode === "keyboard") notes.push(MSG.keyboardNote);
    if (voice) notes.push(MSG.example);
    if (voice && op.mode === "mic" && op.voiceNote) notes.push(MSG.voiceNote);
    if (op.emptyHeard) notes.push(MSG.emptyHeard);
    notes.push(MSG.pasteNote);
    const disabled = !String(st.text || "").trim();
    return `<div class="us-form us-capture" data-cap-step="paste"><h3>${esc(voice ? MSG.voiceTitle : MSG.pasteTitle)}</h3>` +
      `<div class="us-field us-paste-wrap"><textarea class="us-paste rv-textarea" data-cap-text rows="5" placeholder="${esc(MSG.pastePlaceholder)}"${voice && op.mode === "keyboard" ? " autofocus" : ""}>${esc(st.text || "")}</textarea>${mic}</div>` +
      notes.map((n) => `<p class="us-note">${esc(n)}</p>`).join("") +
      `<button type="button" class="btn-complete" data-cap-find${disabled ? " disabled" : ""}>${esc(voice ? MSG.interpret : MSG.find)}</button><button type="button" class="btn-close" data-cap-cancel>${esc(MSG.cancel)}</button></div>`;
  }

  function candidateCard(c, i, o) {
    const nameOf = typeof o.childName === "function" ? o.childName : () => "";
    const chk = isChecked(c), can = checkable(c);
    const when = whenText(c);
    const dateChecks = checkOf(c, "date"), timeChecks = checkOf(c, "time");
    const flag = (list) => (list.length ? ` us-nc-field` : "");
    const reasons = (c.needsCheck || []).map((x) => `<span class="us-nc-line"><b class="us-nc">${esc(MSG.needCheck)}</b> ${esc(x.reason)}</span>`).join("");
    const dateCell = when ? `<span class="us-cand-when${flag(dateChecks.concat(timeChecks))}">${esc(when)}</span>` : `<span class="us-cand-when us-nc-field"><button type="button" class="us-chip" data-cap-date="${i}">${esc(MSG.pickDate)}</button> <button type="button" class="us-chip" data-cap-undecided="${i}" aria-pressed="${c.dateUndecided ? "true" : "false"}">${esc(MSG.undecided)}</button></span>`;
    const kid = (c.childKeys || []).map(nameOf).filter(Boolean).join("·") || "";
    const rep = c.repeat === "WEEKLY" ? `${MSG.weekly} ${(c.byDay || []).map((k) => DAYS[k]).join("·")}` : c.repeat === "BIWEEKLY" ? `${MSG.biweekly} ${(c.byDay || []).map((k) => DAYS[k]).join("·")}` : MSG.noRepeat;
    const chips = [kid || (checkOf(c, "child").length ? `<span class="us-nc-field">?</span>` : ""), MSG.noAssignee, rep].filter(Boolean).map((t) => `<span class="us-chip us-chip-sm">${String(t).startsWith("<") ? t : esc(t)}</span>`).join("");
    return `<div class="us-cand${chk ? " checked" : ""}" data-cap-card="${i}"><button type="button" class="us-cand-check a36-cb${chk ? " on" : ""}" data-cap-check="${i}" role="checkbox" aria-checked="${chk ? "true" : "false"}"${can ? "" : " disabled"}></button>` +
      `<div class="us-cand-body"><strong class="us-cand-title">${esc(c.title || "")}</strong><div>${dateCell}</div><div class="us-cand-chips">${chips}</div>${reasons ? `<div class="us-cand-checks">${reasons}</div>` : ""}` +
      `<details class="us-cand-raw"><summary>${esc(MSG.raw)}</summary><p class="us-note">${esc(c.source || "")}</p></details></div>` +
      `<div class="us-cand-act"><button type="button" class="us-chip-edit" data-cap-edit="${i}">${esc(MSG.edit)}</button><button type="button" class="us-chip-edit" data-cap-remove="${i}">${esc(MSG.remove)}</button></div></div>`;
  }

  function renderCandidates(s, o) {
    const st = s || {}, op = o || {};
    const shown = (st.cands || []).map((c, i) => ({ c, i })).filter((x) => !x.c.removed);
    const n = registerCount(st);
    const head = shown.length ? `<p class="us-note">${esc(MSG.found(shown.length))}</p>` : `<p class="us-note">${esc(MSG.none)}</p><button type="button" class="us-chip" data-cap-direct>${esc(MSG.direct)}</button>`;
    return `<div class="us-form us-capture" data-cap-step="cands"><h3>${esc(op.voice ? MSG.voiceTitle : MSG.pasteTitle)}</h3>${head}${shown.map((x) => candidateCard(x.c, x.i, op)).join("")}` +
      (st.undo ? `<p class="us-note us-undo"><button type="button" class="us-chip-edit" data-cap-undo>${esc(MSG.undo)}</button></p>` : "") +
      `<button type="button" class="btn-complete" data-cap-register${n ? "" : " disabled"}>${esc(MSG.register(n))}</button><button type="button" class="btn-close" data-cap-cancel>${esc(MSG.cancel)}</button></div>`;
  }

  return { renderPaste, renderCandidates, checkable, registerCount, whenText, MSG };
});
