/*
 * auto-steps — 정보(AUTO) 상세 시트의 4단계 스텝(알아보기 → 신청 → 일정 넣기 → 완료)과 '가족 캘린더에 넣기' 한 장 시트의 마크업·판단(W4 패키지 1). 순수 모듈: DOM·저장소·네트워크 없음.
 * 앱(app.js)이 값을 모아 model() 에 넘기고, 돌려받은 HTML 을 시트에 넣는다. 버튼은 data-as 속성으로 의도를 표시한다:
 *   data-as="apply" (href 링크) · "link" (가족 캘린더에 넣기) · "view" (넣은 일정 보기, data-as-id) · "toggle" (완료 체크 — 기존 #btn-toggle-complete 를 그대로 옮겨 쓴다)
 *   시트: data-as="save" · "cancel", 입력 data-as-field="title|date|memo"
 * 문구는 부모 어투로 짧게, 알림을 약속하지 않는다(알림이 없는 앱). 앱 실제 데이터에 없는 것(신청 링크·날짜)은 만들지 않고 그 단계·줄을 숨긴다.
 */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else root.AutoSteps = factory();
})(typeof window !== "undefined" ? window : global, function () {
  "use strict";

  const esc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const MSG = Object.freeze({
    learnTitle: "알아보기", learnSub: "읽었어요",
    applyTitle: "신청", applySub: "신청 페이지에서 해요",
    planTitle: "일정 넣기", planBtn: "가족 캘린더에 넣기", planDone: (md) => `${md}에 넣었어요`, planView: "일정 보기",
    doneTitle: "완료", doneHint: (cat) => (cat === "행정·지원금" ? "신청이 끝나면 체크해요" : "끝나면 체크해요"), doneBy: (md, who) => `${md}${who ? ` · ${who}` : ""}`,
    dateAuto: "항목에서 자동 입력", dateCheck: "확인 필요",
    sheetTitle: "가족 캘린더에 넣기", sheetFrom: "정보 항목에서 가져왔어요",
    fTitle: "일정 이름", fDate: "날짜", fChild: "아이", fRepeat: "반복", noRepeat: "반복 없음", fMemo: "메모", optional: "선택", memoPh: "링크·준비물 적어 두기",
    infoActionLabel: "관련 행동 한 줄", infoActionChip: "일정 +", infoActionDone: (md) => `${md}에 넣었어요`,
    save: "일정 저장", saving: "저장하는 중…", cancel: "닫기",
    errTitle: "일정 이름을 입력해 주세요.", errDate: "날짜를 확인해 주세요.", saveFail: "저장하지 못했어요. 잠시 후 다시 해 주세요.",
  });

  const CHECK = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
  const EXT = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>';
  const CAL = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5" width="17" height="16" rx="2.5"/><path d="M8 3v4M16 3v4M3.5 10h17"/></svg>';
  const md = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || "")); return m ? `${+m[2]}월 ${+m[3]}일` : ""; };

  /** 법정·시기 분류가 가족 캘린더에 들어갈 수 있는 AUTO 항목인가(이벤트의 todo 정의 분류로 판단). VX·HC·OR-03·04 는 기존 예약 흐름(calendar-model.isLinkableAuto)이 맡는다. */
  const FAMILY_LINK_CODES = Object.freeze(["SC", "PG", "SB"]);
  function isFamilyLinkable(event, isLinkableAuto) {
    if (!event || (isLinkableAuto && isLinkableAuto(event))) return false;
    const def = event.detail && event.detail.definition;
    if (def && typeof def.todo_id === "string" && FAMILY_LINK_CODES.includes(def.category)) return true;
    return event.autoAfter36 === true; // 36개월 이상 허용 목록(지역 지원금 NAT-020·GG-* 포함)
  }
  /** autoRef 값(규칙: "<id>__<키>" 형식). 엔진 항목은 이벤트 id 그대로, 지역 지원금 등 id 에 "__" 가 없는 항목은 "__default" 를 붙인다. */
  const autoRefOf = (event) => (String(event.id).includes("__") ? String(event.id) : String(event.id) + "__default");
  /** 연결 색인(linksByAutoId)에서 이 항목의 현재 연결을 찾는다. */
  const linkOf = (links, event) => (links && event ? links.get(event.id) || links.get(autoRefOf(event)) || null : null);
  /** 일정 분류(규칙 허용 5종): 학교 단계는 기관, 나머지(신청·행정)는 기타. */
  const categoryOf = (event) => { const d = event && event.detail && event.detail.definition; return d && d.category === "SC" ? "INSTITUTION" : d && (d.category === "HC" || d.category === "VX") ? "MEDICAL" : "ETC"; }; // 학교=기관, 검진·접종=병원(다음 단계 안내에서 넣는 경우), 그 밖(신청·행정)=기타

  /** 정보 항목의 '관련 행동 한 줄'(data/policy/info-actions.json). raw → { id: { label } } (형식이 틀린 항목은 버린다). */
  function normalizeInfoActions(raw) {
    const out = {};
    const a = raw && typeof raw === "object" && raw.actions && typeof raw.actions === "object" ? raw.actions : {};
    for (const [id, v] of Object.entries(a)) if (v && typeof v.label === "string" && v.label.trim() && v.label.length <= 40) out[id] = { label: v.label.trim() };
    return out;
  }
  /** 이 항목의 제안 행동({label}) — 이벤트 id 그대로, 없으면 "__default" 를 붙이거나 뗀 id 로도 찾는다. 없으면 null(행동을 만들지 않는다). */
  function infoActionOf(actions, event) {
    if (!actions || !event) return null;
    const id = String(event.id);
    const alt = id.endsWith("__default") ? id.slice(0, -"__default".length) : id + "__default";
    return actions[id] || actions[alt] || null;
  }
  /** 정보 항목 시트의 '관련 행동 한 줄'. savedMd 가 있으면 이미 넣은 것(버튼 없이 '○월 ○일에 넣었어요'). */
  function renderInfoAction(action, savedMd) {
    if (!action) return "";
    const row = savedMd
      ? `<div class="as-info-row done"><b>${esc(action.label)}</b><span class="as-info-chip">${CHECK}${esc(MSG.infoActionDone(savedMd))}</span></div>`
      : `<button type="button" class="as-info-row" data-as="info-add"><b>${esc(action.label)}</b><span class="as-info-chip">${CAL}${esc(MSG.infoActionChip)}</span></button>`;
    return `<div class="as-info" data-as-info><small>${esc(MSG.infoActionLabel)}</small>${row}</div>`;
  }

  /**
   * 일정 날짜 자동 입력: 지금 이후의 마감일 → 없으면 권장일(추천일·시작일). 이미 지났으면 오늘. 반환 { iso, kind: "deadline"|"recommended", uncertain }.
   * input: { deadlineIso?, recommendedIso?, todayIso, uncertain? }
   */
  function pickDate(input) {
    const t = input.todayIso;
    if (input.deadlineIso && input.deadlineIso >= t) return { iso: input.deadlineIso, kind: "deadline", uncertain: !!input.uncertain };
    const r = input.recommendedIso || input.deadlineIso || "";
    if (!r) return { iso: "", kind: "recommended", uncertain: true };
    return { iso: r >= t ? r : t, kind: "recommended", uncertain: !!input.uncertain };
  }

  /**
   * 스텝 모델. m = { applyLink:{url,label}|null, canLink:boolean(가족 캘린더에 넣을 수 있는 상태), link:{date,scheduleId}|null,
   *   dateText:string(일정 넣기 줄 보조 문구), done:boolean, doneIso:string, doneBy:string, category:string }
   * 반환: [{ key, state: "done"|"current"|"todo", title, sub, action }] — 신청 단계는 링크가 없으면 없다, 일정 넣기 단계는 넣을 수 없는 상태면 없다.
   */
  function model(m) {
    const steps = [{ key: "learn", state: "done", title: MSG.learnTitle, sub: MSG.learnSub, action: null }];
    if (m.applyLink && m.applyLink.url) steps.push({ key: "apply", state: m.done ? "done" : "current", title: MSG.applyTitle, sub: m.applyLink.note || MSG.applySub, action: { kind: "apply", url: m.applyLink.url, label: m.applyLink.label || "신청하러 가기" } });
    if ((m.canLink || m.link) && m.externalPlan) { // 기존 예약 흐름(VX·HC·OR-03·04): 버튼은 앱이 기존 것을 이 줄에 옮긴다
      steps.push({ key: "plan", state: m.link ? "done" : "todo", title: MSG.planTitle, sub: m.link ? MSG.planDone(md(m.link.date)) : (m.dateText || ""), action: null });
    } else if (m.canLink || m.link) {
      steps.push(m.link
        ? { key: "plan", state: "done", title: MSG.planTitle, sub: MSG.planDone(md(m.link.date)), action: { kind: "view", id: m.link.scheduleId || "", label: MSG.planView } }
        : { key: "plan", state: "todo", title: MSG.planTitle, sub: m.dateText || "", action: { kind: "link", label: MSG.planBtn } });
    }
    steps.push({ key: "done", state: m.done ? "done" : "todo", title: MSG.doneTitle, sub: m.done ? MSG.doneBy(md(m.doneIso), m.doneBy) : MSG.doneHint(m.category), action: m.toggleLabel ? { kind: "toggle", label: m.toggleLabel } : null });
    return steps;
  }

  const act = (a) => {
    if (!a) return "";
    if (a.kind === "toggle") return `<button type="button" class="as-btn as-sec" data-as="toggle">${esc(a.label)}</button>`;
    if (a.kind === "apply") return `<a class="as-btn as-primary" data-as="apply" href="${esc(a.url)}" target="_blank" rel="noopener noreferrer">${EXT}${esc(a.label)}</a>`;
    if (a.kind === "link") return `<button type="button" class="as-btn as-sec" data-as="link">${CAL}${esc(a.label)}</button>`;
    if (a.kind === "view") return `<button type="button" class="as-btn as-sec" data-as="view" data-as-id="${esc(a.id)}">${CAL}${esc(a.label)}</button>`;
    return "";
  };
  /** 스텝 HTML(시안 B). 완료 단계의 체크 버튼 자리(data-as-slot="toggle")는 앱이 기존 완료 버튼을 옮겨 채운다. */
  function renderSteps(steps) {
    const rows = steps.map((s, i) => `<div class="as-st as-${s.state}" data-as-step="${esc(s.key)}"><i class="as-n">${s.state === "done" ? CHECK : i + 1}</i><div class="as-b"><b>${esc(s.title)}</b>${s.sub ? `<small>${esc(s.sub)}</small>` : ""}${act(s.action)}</div></div>`).join("");
    return `<div class="as-steps" role="list" aria-label="진행 단계">${rows}</div>`;
  }

  /**
   * 가족 캘린더에 넣기 한 장 시트(시안 A). 담당자 선택은 없다(완료한 사람이 자동으로 기록된다). f = { title, date, dateKind, dateUncertain, childName, memo, error, saving }.
   */
  function renderAddSheet(f) {
    const dateSub = f.dateUncertain ? ` <em class="as-nc">${esc(MSG.dateCheck)}</em>` : "";
    return `<div class="as-sheet" data-as-sheet="add">
      <div class="as-sh"><div><small>${esc(MSG.sheetFrom)}</small><b>${esc(MSG.sheetTitle)}</b></div></div>
      <div class="as-lb">${esc(MSG.fTitle)}</div><input class="as-in" type="text" maxlength="100" data-as-field="title" value="${esc(f.title)}" />
      <div class="as-lb">${esc(MSG.fDate)}<span class="as-au">${esc(MSG.dateAuto)}</span></div><input class="as-in" type="date" data-as-field="date" value="${esc(f.date)}" />${dateSub ? `<div class="as-note">${f.dateKind === "deadline" ? "마감일" : "권장일"}${dateSub}</div>` : ""}
      ${f.childName ? `<div class="as-lb">${esc(MSG.fChild)}</div><div class="as-chips"><span class="on"${/^#[0-9a-fA-F]{6}$/.test(String(f.childColor || "")) ? ` style="--us-color:${f.childColor}"` : ""}>${esc(f.childName)}</span></div>` : ""}
      <div class="as-lb">${esc(MSG.fRepeat)}</div><div class="as-chips"><span class="on as-nr">${esc(MSG.noRepeat)}</span></div>
      <div class="as-lb">${esc(MSG.fMemo)}<small>${esc(MSG.optional)}</small></div><textarea class="as-in as-mm" maxlength="500" data-as-field="memo" placeholder="${esc(MSG.memoPh)}">${esc(f.memo || "")}</textarea>
      ${f.error ? `<p class="as-err" role="alert">${esc(f.error)}</p>` : ""}
      <button type="button" class="as-save" data-as="save" ${f.saving ? "disabled" : ""}>${esc(f.saving ? MSG.saving : MSG.save)}</button>
      <button type="button" class="as-cancel" data-as="cancel">${esc(MSG.cancel)}</button>
    </div>`;
  }

  return { MSG, normalizeInfoActions, infoActionOf, renderInfoAction, FAMILY_LINK_CODES, isFamilyLinkable, autoRefOf, linkOf, categoryOf, pickDate, model, renderSteps, renderAddSheet, md, esc };
});
