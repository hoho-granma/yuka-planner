/*
 * next-stage — '다음 단계 안내'(W5): 곧 생길 고민 한 줄 배너 → 미리 알아보기(시기 타임라인) → 일정으로 넣기(항목별 체크)의 판단·마크업. 순수 모듈: DOM·저장소·네트워크 없음.
 * 데이터는 data/policy/next-stage.json(정책)이 갖고, 항목은 기존 todo/지원금 id 를 참조한다 — 새 일정 데이터를 만들지 않는다. 이 모듈은 값을 받아 판단만 한다.
 *   pick()        현재 아이 기준 가장 가까운 단계 하나(없거나 남은 항목이 없으면 null)
 *   proposal()    일정으로 넣을 때 날짜 제안: 정해진 날이 있을 때만 하루(FIXED), 아니면 시기(PERIOD, 그 기간 전체) — 날짜를 지어내지 않는다
 *   renderBanner / renderSheet / renderPlanSheet   홈 한 줄 배너 · 타임라인 시트 · 항목별 체크 시트
 * 문구는 부모 어투로 짧게 쓰고, 알림·푸시를 약속하지 않는다(홈 안의 배너일 뿐). 확인되지 않은 값은 수치·날짜 없이 '확인 필요'로만 보인다.
 */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else root.NextStage = factory();
})(typeof window !== "undefined" ? window : global, function () {
  "use strict";

  const esc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const MSG = Object.freeze({
    soon: "곧", checkNeeded: "확인 필요", preview: "미리 알아보기", done: "완료", planned: "일정 있음", past: "기간이 지났어요", now: "지금",
    sheetFrom: (name, stage) => `${stage}${name ? ` · ${name}` : ""}`,
    planAll: "이 시기 일정으로 넣기", planTitle: "일정으로 넣기", planHint: "넣을 일정을 골라요. 날짜는 나중에 고칠 수 있어요.",
    planBtn: (n) => `선택한 ${n}개 일정으로 넣기`, planBtnNone: "넣을 일정을 골라 주세요", planSaving: "넣는 중…",
    dateLater: "날짜는 나중에", dateUnknown: "날짜 확인 필요", noLink: "가족 캘린더에 연결되면 일정으로 넣을 수 있어요.",
    planAllDone: "다 넣었어요. 캘린더에서 확인해요.", planDone: (n) => `${n}개를 일정으로 넣었어요.`, planFail: (n) => `${n}개는 넣지 못했어요. 잠시 후 다시 해 주세요.`, close: "닫기", back: "‹ 돌아가기",
  });

  // ── 정책 읽기(형식이 맞지 않는 항목은 버린다) ──
  const STAGE_NAMES = ["PREGNANT", "INFANT", "TODDLER", "AGE_3_5", "AGE_6_7", "ELEMENTARY", "SECONDARY"];
  const isStr = (v) => typeof v === "string" && v.length > 0;
  function normalizePolicy(raw) {
    const out = { windowMonthsDefault: 6, stages: [] };
    if (!raw || typeof raw !== "object" || !Array.isArray(raw.stages)) return out;
    if (Number.isInteger(raw.windowMonthsDefault) && raw.windowMonthsDefault >= 1 && raw.windowMonthsDefault <= 24) out.windowMonthsDefault = raw.windowMonthsDefault;
    for (const s of raw.stages) {
      if (!s || !isStr(s.id) || !s.match || !isStr(s.headline) || !Array.isArray(s.items)) continue;
      const m = s.match;
      if (!["due", "age", "event"].includes(m.kind)) continue;
      if (m.kind === "age" && !(Number.isInteger(m.boundaryMonths) && Array.isArray(m.fromStage) && m.fromStage.every((x) => STAGE_NAMES.includes(x)))) continue;
      if (m.kind === "event" && !(isStr(m.anchorRef) && Array.isArray(m.fromStage))) continue;
      const items = s.items.filter((it) => it && isStr(it.ref) && isStr(it.label)).map((it) => ({
        ref: it.ref, also: Array.isArray(it.also) ? it.also.filter(isStr) : [], label: it.label, when: it.when || "", detail: it.detail || "",
        needsCheck: it.needsCheck === true, dateMode: ["deadline", "start", "window"].includes(it.dateMode) ? it.dateMode : "window",
      }));
      if (!items.length) continue;
      out.stages.push({
        id: s.id, match: m, windowMonths: Number.isInteger(s.windowMonths) && s.windowMonths >= 0 ? s.windowMonths : out.windowMonthsDefault,
        ...(Array.isArray(s.changes) ? { changes: s.changes.filter(isStr) } : {}), ...(isStr(s.changesSource) ? { changesSource: s.changesSource } : {}), ...(Number.isInteger(s.infoWindowMonths) && s.infoWindowMonths > 0 ? { infoWindowMonths: s.infoWindowMonths } : {}),
        stageLabel: s.stageLabel || "", headline: s.headline, sub: s.sub || "", subWhenPast: typeof s.subWhenPast === "string" ? s.subWhenPast : "", sheetTitle: s.sheetTitle || s.headline, intro: s.intro || "", items,
      });
    }
    return out;
  }

  const addMonths = (d, n) => new Date(d.getFullYear(), d.getMonth() + n, d.getDate());
  const sod = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const iso = (d) => (d instanceof Date && !isNaN(d.getTime()) ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}` : "");
  /** 오늘부터 d 까지 남은 개월 수(올림, 지났으면 0 이하). */
  function monthsUntil(today, d) {
    let m = (d.getFullYear() - today.getFullYear()) * 12 + (d.getMonth() - today.getMonth());
    while (sod(addMonths(today, m)) < sod(d)) m++;
    while (m > -120 && sod(addMonths(today, m - 1)) >= sod(d)) m--;
    return m;
  }

  /**
   * 일정으로 넣을 날짜 제안. mode: "deadline"(그 기한 하루) | "start"(시작일 하루) | "window"(기간 전체). 날짜를 만들지 않는다:
   *   기간·날짜가 없거나 이미 지났으면 { kind:"NONE" }. 반환 { kind:"FIXED", eventDate } | { kind:"PERIOD", periodStart, periodEnd } | { kind:"NONE" } + text(화면 문구).
   */
  function proposal(event, mode, todayIso) {
    if (!event) return { kind: "NONE", text: MSG.dateUnknown };
    const d = (v) => (v instanceof Date && !isNaN(v.getTime()) ? iso(v) : "");
    const ws = d(event.windowStart), we = d(event.windowEnd), fx = d(event.fixedDate), dl = d(event.deadlineDate);
    const t = todayIso;
    const md = (s) => `${+s.slice(5, 7)}월 ${+s.slice(8, 10)}일`;
    const mo = (s) => `${+s.slice(5, 7)}월`;
    if (mode === "deadline") {
      const end = we || dl;
      if (end && end >= t) return { kind: "FIXED", eventDate: end, text: `${md(end)}까지` };
    } else if (mode === "start") {
      const s = fx || ws || d(event.date);
      if (s) return { kind: "FIXED", eventDate: s >= t ? s : t, text: md(s >= t ? s : t) };
    }
    if (ws && we && we >= t) {
      const a = ws >= t ? ws : t;
      const text = mo(a) === mo(we) ? mo(a) : `${mo(a)}~${mo(we)}`;
      return { kind: "PERIOD", periodStart: a, periodEnd: we, text: `${text} (${MSG.dateLater})` };
    }
    return { kind: "NONE", text: MSG.dateUnknown };
  }

  /**
   * 현재 아이 기준 가장 가까운 다음 단계 하나. in = {
   *   policy(normalizePolicy 결과), kid: { name, pregnant, stage("PREGNANT"|"INFANT"|…), ageMonths|null, dueDate?(임신 중 출산 예정일) }, today: Date,
   *   events: Map<id, event>(현재 아이의 일정 이벤트 전체), isDone(id), isLinked(event), isNA(id) }
   * 반환 { id, headline, sub, sheetTitle, intro, stageLabel, kidName, items:[{ id, event, label, when, detail, needsCheck, state:"open"|"done"|"planned", dateMode }], remaining } | null
   */
  function pick(input) {
    const { policy, kid, today, events } = input;
    if (!policy || !kid || !(events && events.get)) return null;
    let best = null;
    for (const st of policy.stages) {
      const m = st.match;
      let when = null; // 시작까지 남은 개월(작을수록 가깝다)
      if (m.kind === "due") {
        if (!kid.pregnant || !(kid.dueDate instanceof Date)) continue;
        const left = monthsUntil(today, kid.dueDate);
        if (left > st.windowMonths) continue;
        when = Math.max(0, left);
      } else if (m.kind === "age") {
        if (kid.pregnant || typeof kid.ageMonths !== "number" || !m.fromStage.includes(kid.stage)) continue;
        const left = m.boundaryMonths - kid.ageMonths;
        const infoWin = st.changes && st.changes.length && st.infoWindowMonths ? st.infoWindowMonths : 0; // 1-6: 정보 카드 창(배너 창보다 길 수 있다)
        if (left <= 0 || left > Math.max(st.windowMonths, infoWin)) continue;
        when = left;
      } else {
        if (kid.pregnant || !m.fromStage.includes(kid.stage)) continue;
        const a = events.get(m.anchorRef);
        if (!a || !(a.windowStart instanceof Date)) continue;
        const u = m.untilRef ? events.get(m.untilRef) : null;
        const end = u && u.windowEnd instanceof Date ? u.windowEnd : addMonths(a.windowStart, 2);
        if (sod(today) > sod(end) || sod(today) < sod(addMonths(a.windowStart, -st.windowMonths))) continue;
        when = Math.max(0, monthsUntil(today, a.windowStart));
      }
      const items = [];
      for (const it of st.items) {
        const ev = [it.ref, ...it.also].map((r) => events.get(r)).find(Boolean);
        if (!ev) continue; // 이 아이에게 없는 항목은 만들지 않는다
        if (input.isNA && input.isNA(ev.id)) continue;
        let state = input.isDone && input.isDone(ev.id) ? "done" : input.isLinked && input.isLinked(ev) ? "planned" : "open";
        // 0-C3: 기간(끝 날짜)이 이미 지난 항목은 'open'으로 남기지 않는다(완료로 치지도, 날짜를 만들지도 않는다 — 끝난 사실만 표시).
        const endD = ev.windowEnd instanceof Date ? ev.windowEnd : ev.deadlineDate instanceof Date ? ev.deadlineDate : null;
        if (state === "open" && endD && sod(endD) < sod(today)) state = "past";
        items.push({ id: ev.id, event: ev, label: it.label, when: it.when, detail: it.detail, needsCheck: it.needsCheck, dateMode: it.dateMode, state });
      }
      const remaining = items.filter((x) => x.state === "open").length;
      if (!items.length || !remaining) continue; // 이미 다 했거나 일정에 넣었으면 숨긴다
      if (!best || when < best.when) best = { when, st, items, remaining };
    }
    if (!best) return null;
    const { st } = best;
    const months = best.when;
    const whenText = st.match.kind === "age" ? `${months}개월 뒤부터` : st.match.kind === "due" ? (months > 0 ? `출산 예정일까지 ${months}개월` : "출산이 가까워요") : "";
    // 0-C3: 끝난 항목(state past)이 있으면 지난 날짜가 든 sub 를 그대로 보이지 않는다 — 정책의 subWhenPast 가 있으면 그것, 없으면 sub 를 비운다(머리 문구만).
    const anyPast = best.items.some((x) => x.state === "past");
    const subSrc = anyPast ? st.subWhenPast : st.sub;
    const sub = subSrc.replace("{name}", kid.name || "").replace("{when}", whenText).replace(/^\s*·\s*|\s*·\s*$/g, "").replace(/\s+·\s+·\s+/g, " · ");
    return { bannerOn: st.match.kind !== "age" || months <= st.windowMonths, stage: st, ageMonths: typeof kid.ageMonths === "number" ? kid.ageMonths : null, id: st.id, headline: st.headline, sub, sheetTitle: st.sheetTitle, intro: st.intro, stageLabel: st.stageLabel, kidName: kid.name || "", items: best.items, remaining: best.remaining };
  }

  // ── 마크업 ──
  const CAL = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5" width="17" height="16" rx="2.5"/><path d="M8 3v4M16 3v4M3.5 10h17"/></svg>';
  const CHECK = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

  /** 홈 한 줄 배너(시안 E). 눌러서 미리 알아보기를 연다. 알림·푸시 표현 없음. */
  function renderBanner(m) {
    if (!m) return "";
    return `<button type="button" class="ns-banner" id="ns-banner" data-ns="open" aria-label="${esc(m.headline)} — ${esc(MSG.preview)}"><i class="ns-tag">${esc(MSG.soon)}</i><span class="ns-bt"><b>${esc(m.headline)}</b>${m.sub ? `<small>${esc(m.sub)}</small>` : ""}</span><span class="ns-go">${esc(MSG.preview)} ›</span></button>`;
  }

  /** 미리 알아보기 시트(시안 A, 시기 타임라인). opts: { applyOf(id)→{url,label}|null, canPlan:boolean } */
  function renderSheet(m, opts) {
    const o = opts || {};
    const chain = m.items.map((it, i) => {
      const apply = o.applyOf ? o.applyOf(it.id) : null;
      const cur = it.state === "open" && m.items.filter((x) => x.state === "open")[0] === it;
      const badge = it.state === "done" ? `<em class="ns-st">${esc(MSG.done)}</em>` : it.state === "planned" ? `<em class="ns-st">${esc(MSG.planned)}</em>` : it.state === "past" ? `<em class="ns-st">${esc(MSG.past)}</em>` : "";
      return `<div class="ns-cn${cur ? " cur" : ""}${it.state !== "open" ? " fin" : ""}" data-ns-item="${esc(it.id)}"><i class="ns-n">${it.state === "done" ? CHECK : i + 1}</i><div class="ns-cb"><small>${esc(cur && !it.when ? MSG.now : it.when)}</small><button type="button" class="ns-ttl" data-ns="detail" data-ns-id="${esc(it.id)}"><b>${esc(it.label)}</b>${badge}</button>${it.detail ? `<span class="ns-dl">${esc(it.detail)}${it.needsCheck ? ` <em class="ns-nc">${esc(MSG.checkNeeded)}</em>` : ""}</span>` : it.needsCheck ? `<span class="ns-dl"><em class="ns-nc">${esc(MSG.checkNeeded)}</em></span>` : ""}${apply && apply.url ? `<a class="ns-chip" href="${esc(apply.url)}" target="_blank" rel="noopener noreferrer">${esc(apply.label)}</a>` : ""}</div></div>`;
    }).join("");
    const foot = m.remaining ? (o.canPlan ? `<button type="button" class="ns-primary" data-ns="plan">${CAL}${esc(MSG.planAll)}</button>` : `<p class="ns-note">${esc(MSG.noLink)}</p>`) : "";
    return `<div class="ns-sheet" data-ns-sheet="timeline"><div class="ns-sh"><small>${esc(MSG.sheetFrom(m.kidName, m.stageLabel))}</small><b>${esc(m.sheetTitle)}</b></div>${m.intro ? `<p class="ns-intro">${esc(m.intro)}</p>` : ""}${o.cardHtml || ""}<div class="ns-chain">${chain}</div>${foot}<button type="button" class="ns-close" data-ns="close">${esc(MSG.close)}</button></div>`;
  }

  /**
   * 일정으로 넣기 시트(시안 A). rows: [{ id, label, sub, checked, disabled, state }] — 이미 한 항목(done·planned)은 나오지 않는다.
   * st: { saving, error, message }
   */
  function renderPlanSheet(m, rows, st) {
    const s = st || {};
    const n = rows.filter((r) => r.checked && !r.disabled).length;
    const list = rows.map((r) => `<label class="ns-pr${r.disabled ? " dis" : ""}"><input type="checkbox" data-ns-check="${esc(r.id)}" ${r.checked ? "checked" : ""} ${r.disabled || s.saving ? "disabled" : ""} /><span><b>${esc(r.label)}</b><small>${esc(r.sub)}</small></span></label>`).join("");
    return `<div class="ns-sheet" data-ns-sheet="plan"><div class="ns-sh"><small>${esc(m.stageLabel ? `${m.stageLabel}${m.kidName ? ` · ${m.kidName}` : ""}` : m.kidName)}</small><b>${esc(MSG.planTitle)}</b></div>${rows.length ? `<p class="ns-intro">${esc(MSG.planHint)}</p><div class="ns-pl">${list}</div>` : `<p class="ns-intro">${esc(MSG.planAllDone)}</p>`}${s.message ? `<p class="ns-note">${esc(s.message)}</p>` : ""}${s.error ? `<p class="ns-err" role="alert">${esc(s.error)}</p>` : ""}${rows.length ? `<button type="button" class="ns-primary" data-ns="save" ${n === 0 || s.saving ? "disabled" : ""}>${esc(s.saving ? MSG.planSaving : n ? MSG.planBtn(n) : MSG.planBtnNone)}</button>` : ""}<button type="button" class="ns-close" data-ns="back">${esc(MSG.back)}</button></div>`;
  }

  return { MSG, normalizePolicy, monthsUntil, proposal, pick, renderBanner, renderSheet, renderPlanSheet, esc };
});
