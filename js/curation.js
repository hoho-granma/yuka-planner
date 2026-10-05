/*
 * curation — 1-0 판단 규칙(큐레이션 레이어): "지금 부모가 판단할 일"을 대신 골라 슬롯(지금 꼭 / 곧 / 알아두기)에 놓는 순수 함수.
 * 근거: docs/ux-review/06-큐레이션-엔진-설계.md §3·§4, docs/agents/지시서-1-0-판단규칙.md. 아직 앱에 연결하지 않는다(화면 변경 없음).
 *
 *   curate(events, state, policy, today) → { now[], soon[], know[], moreCounts, reasons, excluded, stats }
 *   규칙 층: gate(G1~G4) → alias·bundle(묶기) → type(ACT/CHECK/KNOW) → urgency(L1~L7) → slot(지금 꼭·곧·알아두기)
 *
 * 순수: DOM·저장소·네트워크·현재 시각 없음(today 를 인자로 받는다 — 이 파일은 new Date() 를 인자 없이 부르지 않는다).
 * 모든 숫자(30/45/60/7일·슬롯 수)·actionType·묶음·별칭·긴 창 목록은 policy(data/policy/curation.json 모양)에서 읽는다 — 코드에 박지 않는다.
 * 기존 판단 함수(HNLogic.subsidyStatus·subsidyDeadline)는 호출만 하고, 엔진(todo-engine·schedule)은 건드리지 않는다.
 *
 * events: visibleSchedule(true) 결과(이벤트 배열). state: {
 *   completed:{id→기록}, isNA(id), subsidyStatusOf(e)→"available"|"upcoming"|…(HNLogic.subsidyStatus 를 birthDate 와 함께 감싼 것), linkDateOf(e)→Date|null(일정으로 넣은 날짜), applyOf(e)→{url}|null, canSchedule(e)→bool,
 *   unknown:[{id,title}](조건 답이 없어 이벤트가 되지 못한 항목 — CHECK 후보로만 쓴다), ageMonths, pregnant, birthDate }
 * 반환 단위(unit): { key, ids, title, items(이벤트), type, level("L1".."L7"), rule, daysToEnd, actionKind("apply"|"schedule"|"done"|"confirm"(확인형: 해당돼요/아니에요)|"review"(지난 기록 확인 → 체크리스트)), applyUrl, reason }
 */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory(require("./hn-logic.js"));
  else root.Curation = factory(root.HNLogic);
})(typeof window !== "undefined" ? window : global, function (HN) {
  "use strict";

  const DAY = 24 * 60 * 60 * 1000;
  const TYPES = ["ACT", "CHECK", "KNOW"];
  const sod = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = (a, b) => Math.round((sod(a).getTime() - sod(b).getTime()) / DAY);
  const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const baseId = (id) => String(id).split("__")[0];
  const isInt = (v, min) => Number.isInteger(v) && v >= min;
  const isDate = (v) => v instanceof Date && !isNaN(v.getTime());
  const SUBSIDY = "행정·지원금";
  const REVIEW_CATEGORIES = ["예방접종", "영유아검진"]; // D18 '지난 접종·검진 기록 확인' 묶음 대상(이유식·발달 같은 관찰·정보 항목은 묶지 않는다)

  // 이유 문장(키 → 문장). 화면은 키로 문장을 고르고, 숫자는 params 로 채운다. 새 사실(금액·날짜)을 만들지 않는다.
  const REASONS = Object.freeze({
    last_chance: (p) => `지금이 마지막 기회예요${Number.isFinite(p.days) ? ` (${p.days}일 남음)` : ""}`,
    deadline_soon: (p) => `${p.days}일 안에 마감돼요`,
    late_possible: () => "기한이 지났지만 지금도 할 수 있어요",
    in_short_window: () => "지금이 하기 좋은 기간이에요",
    urgent_long: () => "기간이 길어도 미루면 손해가 커요",
    retro_open: () => "지금 신청하면 소급 적용돼요",
    in_window: () => "기간 안이라 여유 있게 할 수 있어요",
    starting_soon: (p) => (Number.isFinite(p.days) ? `${p.days}일 뒤에 시작돼요` : "곧 시작돼요"),
    check_condition: () => "해당되는지 확인해 보세요",
    know_now: () => "이 시기에 알아두면 좋아요",
    review_past: () => "지난 기록을 확인해 두세요",
  });

  // ── 정책 읽기(data/policy/curation.json 모양. 형식이 틀리면 null — 호출하는 쪽이 값을 못 읽은 것으로 안다) ──
  const typed = (v) => !!v && typeof v === "object" && TYPES.includes(v.type);
  const cleanMap = (m) => Object.fromEntries(Object.entries(m && typeof m === "object" ? m : {}).filter(([k, v]) => !k.startsWith("_") && typed(v)).map(([k, v]) => [k, { type: v.type, sub: typeof v.sub === "string" ? v.sub : "" }]));
  function normalizePolicy(raw) {
    if (!raw || typeof raw !== "object") return null;
    const t = raw.thresholds, s = raw.slots;
    if (!t || !isInt(t.deadlineSoonDays, 0) || !isInt(t.upcomingDays, 0) || !isInt(t.shortWindowDays, 0) || !isInt(t.reappearDays, 0)) return null;
    if (!s || !isInt(s.now, 0) || !isInt(s.soon, 0) || !isInt(s.know, 0)) return null;
    if (!raw.prefix || typeof raw.prefix !== "object") return null;
    const pbe = {};
    for (const [p, m] of Object.entries(raw.prefixByExposure && typeof raw.prefixByExposure === "object" ? raw.prefixByExposure : {})) if (!p.startsWith("_") && m && typeof m === "object") pbe[p] = cleanMap(m);
    const sd = raw.subsidyDefault && typeof raw.subsidyDefault === "object" ? cleanMap(raw.subsidyDefault) : {};
    const al = {};
    for (const x of raw.aliases && Array.isArray(raw.aliases.pairs) ? raw.aliases.pairs : []) if (x && typeof x.alias === "string" && typeof x.primary === "string") al[x.alias] = x.primary;
    const b = raw.bundles && typeof raw.bundles === "object" ? raw.bundles : {};
    const warnings = [];
    if (!isInt(s.expandMax, 1)) warnings.push("slots.expandMax 가 없어 'N개 더' 펼침이 제한 없이 동작해요(D20: 정책에 최대 개수를 넣어야 해요)");
    return {
      warnings,
      thresholds: { deadlineSoonDays: t.deadlineSoonDays, upcomingDays: t.upcomingDays, shortWindowDays: t.shortWindowDays, reappearDays: t.reappearDays },
      slots: { now: s.now, soon: s.soon, know: s.know, expandMax: isInt(s.expandMax, 1) ? s.expandMax : null, homeMust: isInt(s.homeMust, 0) ? s.homeMust : 2 }, // homeMust: 이전 홈 맨 위 '지금 꼭 할 것' 카드 줄 수(4-1 A안, 기본 2, 0이면 카드 없음) // expandMax: 'N개 더' 펼침 상한(D20, 없으면 제한 없음)
      ids: cleanMap(raw.ids), triggerTypes: cleanMap(raw.triggerTypes), prefixByExposure: pbe, prefix: cleanMap(raw.prefix), subsidyDefault: sd,
      urgentLongWindowIds: Array.isArray(raw.urgentLongWindowIds && raw.urgentLongWindowIds.ids) ? raw.urgentLongWindowIds.ids.filter((x) => typeof x === "string") : [],
      aliases: al,
      bundles: { groups: (Array.isArray(b.groups) ? b.groups : []).filter((g) => g && typeof g.key === "string" && Array.isArray(g.ids) && g.ids.length >= 2).map((g) => ({ key: g.key, title: typeof g.title === "string" ? g.title : "", ids: g.ids.filter((x) => typeof x === "string") })) },
    };
  }

  const defOf = (e) => (e && e.detail && e.detail.definition) || null;
  const instOf = (e) => (e && e.detail && e.detail.instance) || null;
  const todoIdOf = (e) => (defOf(e) && defOf(e).todo_id) || baseId(e.id);

  /**
   * 분류 {type, sub}. 엔진 항목: ① ids → ② triggerType → ③ prefix+exposureLevel → ④ prefix 기본값. 엔진 밖 지원금: ① ids → ② deadlineType=ongoing → ③ conditionLabel=CHECK → ④ deadlineType별 기본값.
   * 어디에도 없으면 ACT(안전한 쪽 = 지금 보이던 그대로).
   */
  function classify(e, policy) {
    const fallback = { type: "ACT", sub: "" };
    const def = defOf(e), tid = todoIdOf(e);
    if (policy.ids[tid]) return { ...policy.ids[tid], explicit: true }; // 정책이 id 로 정한 분류는 G4 자동 강등보다 우선
    if (def) {
      if (def.triggerType && policy.triggerTypes[def.triggerType]) return policy.triggerTypes[def.triggerType];
      const pre = tid.split("-")[0];
      const byExp = policy.prefixByExposure[pre];
      if (byExp && byExp[def.exposureLevel]) return byExp[def.exposureLevel];
      return policy.prefix[pre] || fallback;
    }
    const rec = e.detail || {};
    if (rec.deadlineType === "ongoing" && policy.subsidyDefault.ongoing) return policy.subsidyDefault.ongoing;
    if (rec.conditionLabel && policy.subsidyDefault.conditionLabel) return policy.subsidyDefault.conditionLabel;
    return policy.subsidyDefault[rec.deadlineType] || fallback;
  }
  const typeOf = (e, policy) => classify(e, policy).type;

  const statusOf = (e, state) => (state.subsidyStatusOf ? state.subsidyStatusOf(e) : "available");

  /**
   * 나이 범위 밖인가(지원금만): 엔진 SB 항목은 AGE_WINDOW endMonth, 지역·전국 지원금 레코드는 maxAgeMonths 를 넘으면 해당 없음.
   * 접종·검진은 범위를 넘어도 따라잡기(L3)가 있어 대상이 아니다. 나이 상한표(ageCap)가 있는 항목은 isEventShown·subsidyStatus 가 이미 특례까지 판정하므로 건드리지 않는다.
   */
  function ageOut(e, state) {
    const a = state.ageMonths;
    if (typeof a !== "number") return false;
    const def = defOf(e);
    if (def && def.category === "SB" && !def.ageCap && def.triggerParams && Number.isFinite(def.triggerParams.endMonth)) return a > def.triggerParams.endMonth;
    if (e.isLegacySubsidy === true && Number.isFinite(e.maxAgeMonths) && e.maxAgeMonths < 1000) return a > e.maxAgeMonths;
    return false;
  }

  // ── 게이트 ──
  function gateOf(e, state, policy, today) {
    const inst = instOf(e);
    const done = state.completed && state.completed[e.id];
    if (done || (state.isNA && state.isNA(e.id)) || e.engineStatus === "DONE" || (inst && inst.autoExtended)) return "G1"; // 완료·미해당·자동 연장
    if (state.linkDateOf) { // G2: 일정으로 넣은 날짜가 오늘+재등장일보다 뒤면 가족 일정으로 옮겨 간 것
      const l = state.linkDateOf(e);
      if (isDate(l) && diffDays(l, today) > policy.thresholds.reappearDays) return "G2";
    }
    if (ageOut(e, state)) return "G1"; // 지원금의 나이 범위를 지난 것(초3 아동수당 같은) — 해당 없음
    if (e.engineStatus === "OVERDUE_FINAL") return "G3"; // 놓친 것: 홈에는 안 올린다
    if (e.category === SUBSIDY) { // G4: 지원금은 신청 가능·신청 예정만
      const st = statusOf(e, state); // 지원금 판정은 연결 단계가 주입(state.subsidyStatusOf) — 나이 상한 판정(birthDate)을 호출부가 책임진다
      if (st !== "available" && st !== "upcoming") return "G4";
    }
    return null;
  }

  // ── 시급성 ──
  const endOf = (e) => {
    if (e.category === SUBSIDY && HN && HN.subsidyDeadline) {
      if (e.isLegacySubsidy && e.detail && e.detail.deadlineType === "unconfirmed") return null; // 마감 미확인은 마감 임박(L2)에 넣지 않는다
      return HN.subsidyDeadline(e);
    }
    return isDate(e.windowEnd) ? e.windowEnd : null;
  };
  function levelOf(e, today, policy, state) {
    const th = policy.thresholds;
    const def = defOf(e) || {};
    const inst = instOf(e) || {};
    const end = endOf(e);
    const toEnd = end ? diffDays(end, today) : Infinity;
    const inSoon = toEnd >= 0 && toEnd <= th.deadlineSoonDays;
    let st = e.engineStatus;
    if (e.isLegacySubsidy) { // 지역 지원금은 엔진 status 가 없다 — subsidyStatus 로 같은 뜻을 만든다
      const s = statusOf(e, state);
      st = s === "upcoming" ? "UPCOMING" : "DUE";
      if (e.isLegacySubsidy && e.entryDate && isDate(e.entryDate) && diffDays(e.entryDate, today) > 0) st = "UPCOMING";
    }
    const start = isDate(e.entryDate) ? e.entryDate : isDate(e.windowStart) ? e.windowStart : isDate(e.date) ? e.date : null;
    const windowDays = isDate(e.windowStart) && isDate(e.windowEnd) ? diffDays(e.windowEnd, e.windowStart) + 1 : Infinity;
    if (st === "DUE" && def.catchUp === "NOT_ALLOWED" && inSoon) return { level: "L1", key: "last_chance", params: { days: toEnd } };
    if (st === "DUE" && inSoon) return { level: "L2", key: "deadline_soon", params: { days: toEnd } };
    if (st === "OVERDUE_CATCHUP" && REVIEW_CATEGORIES.includes(e.category) && isDate(e.windowEnd) && diffDays(today, e.windowEnd) > th.shortWindowDays) return { level: "L5", key: "past_old", params: {}, stale: true }; // D18: 끝난 지 오래된 따라잡기는 한 덩어리 '지난 기록 확인'으로
    const longOver = st === "OVERDUE_CATCHUP" && isDate(e.windowEnd) && diffDays(today, e.windowEnd) > th.shortWindowDays;
    if (st === "OVERDUE_CATCHUP" && def.exposureLevel === "MUST" && !longOver) return { level: "L3", key: "late_possible", params: {} }; // 끝난 지 오래된 지원 등은 L3(늦었지만 가능)로 올리지 않고 아래 L5
    if (st === "DUE") {
      if (windowDays <= th.shortWindowDays) return { level: "L4", key: "in_short_window", params: {} };
      if (policy.urgentLongWindowIds.includes(todoIdOf(e)) && isDate(e.windowStart) && diffDays(today, e.windowStart) <= th.shortWindowDays) return { level: "L4", key: "urgent_long", params: {} }; // D19: 긴 창 상향은 창 시작 후 shortWindowDays 안만(이후는 L5)
      if (inst.retroactiveEligible === true) return { level: "L4", key: "retro_open", params: {} };
      return { level: "L5", key: "in_window", params: {} };
    }
    if (st === "OVERDUE_CATCHUP") return { level: "L5", key: "in_window", params: {} };
    if (st === "UPCOMING" || st === "SCHEDULED") { // 곧(L6)은 '시작까지 남은 날 ≤ upcomingDays' 하나로만 정한다(지원금 upcoming 상태만으로는 넣지 않는다)
      const d = start ? diffDays(start, today) : NaN;
      return Number.isFinite(d) && d <= th.upcomingDays ? { level: "L6", key: "starting_soon", params: { days: d > 0 ? d : NaN } } : { level: "L7", key: "", params: {} };
    }
    return { level: "L7", key: "", params: {} };
  }
  const lv = (l) => Number(String(l).slice(1));

  // ── 동점 처리: 남은 날 → missable 먼저 → MUST 먼저 → priority → id ──
  function cmp(a, b) {
    if (a.daysToEnd !== b.daysToEnd) return a.daysToEnd < b.daysToEnd ? -1 : 1;
    const da = defOf(a.e) || {}, db = defOf(b.e) || {};
    const ma = da.catchUp === "NOT_ALLOWED" ? 0 : 1, mb = db.catchUp === "NOT_ALLOWED" ? 0 : 1;
    if (ma !== mb) return ma - mb;
    const ea = da.exposureLevel === "MUST" ? 0 : 1, eb = db.exposureLevel === "MUST" ? 0 : 1;
    if (ea !== eb) return ea - eb;
    const pa = typeof da.priority === "number" ? da.priority : 2, pb = typeof db.priority === "number" ? db.priority : 2;
    if (pa !== pb) return pa - pb;
    return String(a.e.id) < String(b.e.id) ? -1 : String(a.e.id) > String(b.e.id) ? 1 : 0;
  }
  const unitCmp = (a, b) => lv(a.level) - lv(b.level) || cmp(a.rep, b.rep);

  
  /** 큐레이션. 반환 { now, soon, know, moreCounts{now,soon,know,benefits,later}, reasons{unitKey→{rule,key,params,text}}, excluded[{id,gate}], stats{...} } */
  function curate(events, state, policy, today) {
    const out = { warnings: policy && policy.warnings ? policy.warnings.slice() : [], now: [], know: [], moreCounts: { now: 0, soon: 0, know: 0, benefits: 0, later: 0 }, overflow: { now: [], soon: [], know: [] }, reasons: {}, excluded: [], stats: { byLevel: {}, byType: { ACT: 0, CHECK: 0, KNOW: 0 }, candidates: 0, gated: 0 } };
    if (!policy || !isDate(today) || !Array.isArray(events)) return out;
    const st = state || {};
    const present = new Set(events.map((e) => baseId(e.id)));
    const cands = [];
    for (const e of events) {
      const alias = policy.aliases[baseId(e.id)]; // 같은 제도 두 경로: 정식 쪽이 있으면 이쪽은 숨긴다
      if (alias && present.has(baseId(alias))) { out.excluded.push({ id: e.id, gate: "alias" }); continue; }
      const gate = gateOf(e, st, policy, today);
      if (gate) { out.excluded.push({ id: e.id, gate }); out.stats.gated++; continue; }
      const cls = classify(e, policy);
      let type = cls.type;
      if (!cls.explicit && e.isLegacySubsidy && e.detail && e.detail.deadlineType === "unconfirmed" && !(st.applyOf && st.applyOf(e))) type = "KNOW"; // G4: 마감 미확인+행동 링크 없음 → 알아둘 것으로만
      const lvl = levelOf(e, today, policy, st);
      cands.push({ e, type, sub: cls.sub, stale: lvl.stale === true, level: lvl.level, reasonKey: lvl.key, params: lvl.params, daysToEnd: (() => { const d = endOf(e); return d ? diffDays(d, today) : Infinity; })(), id: e.id });
    }
    for (const u of st.unknown || []) { // 조건 답이 없어 이벤트가 되지 못한 항목: CHECK 후보로만(숨기지 않는다)
      const a = policy.aliases[baseId(u.id)];
      if (a && present.has(baseId(a))) { out.excluded.push({ id: u.id, gate: "alias" }); continue; }
      if (present.has(baseId(u.id))) continue;
      cands.push({ e: { id: u.id, title: u.title || u.id, category: SUBSIDY, unknown: true }, type: "CHECK", level: "L5", reasonKey: "check_condition", params: {}, daysToEnd: Infinity, id: u.id });
    }
    out.stats.candidates = cands.length;
    for (const c of cands) { out.stats.byLevel[c.level] = (out.stats.byLevel[c.level] || 0) + 1; out.stats.byType[c.type]++; }

    const stale = cands.filter((c) => c.stale); // D18
    // 마감 없는 상시 지원금은 슬롯에서 뺀다(혜택 한 줄용 개수)
    const slotCands = [];
    for (const c of cands) { if (c.stale) continue; if (c.sub === "INFO_BENEFIT") out.moreCounts.benefits++; else slotCands.push(c); }

    // 묶기: 정책 그룹(최소 2개 있을 때) → 같은 창 묶음(정책 분류) → 나머지는 1건 1단위
    const used = new Set();
    const units = [];
    const mk = (key, list, title) => {
      const rep = list.slice().sort((a, b) => lv(a.level) - lv(b.level) || cmp(a, b))[0];
      const best = list.map((c) => c.level).sort((a, b) => lv(a) - lv(b))[0];
      const type = list.some((c) => c.type === "ACT") ? "ACT" : list.some((c) => c.type === "CHECK") ? "CHECK" : "KNOW";
      units.push({ key, ids: list.map((c) => c.id), items: list.map((c) => c.e), title: title || rep.e.title || rep.e.id, type, level: best, reasonKey: rep.reasonKey, params: rep.params, daysToEnd: Math.min(...list.map((c) => c.daysToEnd)), rep: rep, rule: best });
      list.forEach((c) => used.add(c.id));
    };
    for (const g of policy.bundles.groups) {
      const list = slotCands.filter((c) => !used.has(c.id) && g.ids.includes(baseId(c.id)) && c.type === slotCands.find((x) => g.ids.includes(baseId(x.id)) && !used.has(x.id)).type);
      if (list.length >= 2) mk(g.key, list, g.title);
    }
    const win = new Map(); // 같은 창의 접종은 한 단위(추천일 배치와 같은 키 HNLogic.gkey)
    for (const c of slotCands) {
      const e = c.e;
      if (used.has(c.id) || e.category !== "예방접종" || !HN || !HN.gkey || !isDate(e.windowStart)) continue;
      const k = `${HN.gkey(e, e.windowStart, isDate(e.windowEnd) ? e.windowEnd : e.windowStart)}|${c.type}`;
      if (!win.has(k)) win.set(k, []);
      win.get(k).push(c);
    }
    for (const [k, list] of win) if (list.length >= 2) mk(k, list, "");
    for (const c of slotCands) if (!used.has(c.id)) mk(c.id, [c], "");
    if (stale.length) { // D18: 끝난 지 shortWindowDays 보다 오래된 따라잡기 항목 → 한 단위(CHECK, '곧' 칸), 개수와 목록은 items 로 보존
      const rep = stale.slice().sort(cmp)[0];
      units.push({ key: "REVIEW_PAST", ids: stale.map((c) => c.id), items: stale.map((c) => c.e), title: `지난 접종·검진 기록 확인 ${stale.length}개`, type: "CHECK", level: "L5", reasonKey: "review_past", params: {}, daysToEnd: Infinity, rep, rule: "L5", review: true });
      out.stats.pastReview = stale.length;
    }

    // 행 단위 행동 종류(신청 링크 > 일정 넣기 > 완료)와 이유 문장
    for (const u of units) {
      const e = u.rep.e;
      const apply = !e.unknown && st.applyOf ? st.applyOf(e) : null;
      u.applyUrl = apply && apply.url ? apply.url : "";
      u.actionKind = u.review ? "review" : u.type === "CHECK" ? "confirm" : u.applyUrl ? "apply" : !e.unknown && st.canSchedule && st.canSchedule(e) ? "schedule" : "done";
      const key = u.review ? "review_past" : u.type === "KNOW" ? "know_now" : u.type === "CHECK" && lv(u.level) > 4 ? "check_condition" : u.reasonKey;
      u.reason = { rule: u.level, key, params: u.params || {}, text: (REASONS[key] || (() => ""))(u.params || {}) };
      out.reasons[u.key] = u.reason;
      u.rule = u.level;
    }

    // 슬롯: 지금 꼭 = ACT L1~L4 / 곧 = ACT L5~L6 + CHECK L1~L6 / 알아두기 = KNOW 대표 1(+개수). 넘침은 아래로 내리지 않는다.
    const nowAll = units.filter((u) => u.type === "ACT" && lv(u.level) <= 4).sort(unitCmp);
    // '곧' 칸 정렬(C3): L5·L6 을 섞어 남은 날 오름차순 — L6 은 시작까지, 그 밖은 마감까지. 날짜가 없으면 맨 뒤. 같은 날은 기존 동점 규칙.
    const soonDays = (u) => (u.level === "L6" ? (Number.isFinite(u.params && u.params.days) ? u.params.days : 0) : u.daysToEnd);
    const soonCmp = (a, b) => { if (!!a.review !== !!b.review) return a.review ? -1 : 1; /* C4: '지난 접종·검진 기록 확인'은 날짜가 없어도 '곧' 맨 앞에 고정 */ const x = soonDays(a), y = soonDays(b); return x !== y ? (x < y ? -1 : 1) : cmp(a.rep, b.rep); };
    const soonAll = units.filter((u) => (u.type === "ACT" && (u.level === "L5" || u.level === "L6")) || (u.type === "CHECK" && lv(u.level) <= 6)).sort(soonCmp);
    const knowAll = units.filter((u) => u.type === "KNOW" && lv(u.level) <= 5).sort((a, b) => {
      const ra = knowRank(a, st), rb = knowRank(b, st);
      return ra < rb ? -1 : ra > rb ? 1 : unitCmp(a, b);
    });
    out.now = nowAll.slice(0, policy.slots.now); out.moreCounts.now = Math.max(0, nowAll.length - policy.slots.now);
    out.soon = soonAll.slice(0, policy.slots.soon); out.moreCounts.soon = Math.max(0, soonAll.length - policy.slots.soon);
    out.know = knowAll.slice(0, policy.slots.know); out.moreCounts.know = Math.max(0, knowAll.length - policy.slots.know);
    out.overflow = { now: nowAll.slice(policy.slots.now), soon: soonAll.slice(policy.slots.soon), know: knowAll.slice(policy.slots.know) }; // 넘친 단위(아래로 내리지 않고 'N개 더'로 펼침) — moreCounts 와 개수 일치
    out.expandMax = policy.slots.expandMax; // 'N개 더' 펼침 상한(D20)
    out.moreCounts.later = units.filter((u) => lv(u.level) === 7 && u.type !== "KNOW").length;
    out.stats.units = units.length;
    out.stats.slotCandidates = { now: nowAll.length, soon: soonAll.length, know: knowAll.length, actAny: units.filter((u) => u.type === "ACT").length };
    return out;
  }

  /** 알아두기 대표: 이번 달 새로 시작(displayMonth = 현재 월령) → 이정표 → 우선순위 1 → 나머지. 문자열 키로 정렬한다. */
  function knowRank(u, st) {
    const d = defOf(u.rep.e) || {};
    const fresh = typeof d.displayMonth === "number" && d.displayMonth === st.ageMonths ? 0 : 1;
    const mile = d.triggerType === "MILESTONE_EVENT" ? 0 : 1;
    const pri = d.priority === 1 ? 0 : 1;
    return `${fresh}${mile}${pri}`;
  }

  /** 월령 탭·달력 두 층이 쓰는 항목 설명: 분류(type·sub)와 '왜 지금' 한 줄(같은 판정·같은 문장표). 게이트·슬롯은 거치지 않는다. */
  function describe(e, state, policy, today) {
    const cls = classify(e, policy), lvl = levelOf(e, today, policy, state || {});
    const key = cls.type === "KNOW" ? "know_now" : lvl.key;
    const f = REASONS[key];
    return { type: cls.type, sub: cls.sub || "", level: lvl.level, reasonKey: key, text: f ? f(lvl.params || {}) : "" };
  }

  return { curate, normalizePolicy, typeOf, classify, describe, REASONS };
});
