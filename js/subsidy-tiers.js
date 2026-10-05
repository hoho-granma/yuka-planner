/*
 * subsidy-tiers — 1-4 지원 목록 3단(마감 임박 / 확실히 받는 것 / 조건 확인)의 순수 모델. 앱에 아직 연결하지 않는다(js/subsidy-view.js 가 부를 준비).
 * 근거: docs/한눈육아-디자인명세-지원목록3단.md. 기존 HNLogic.subsidyBuckets 결과를 재사용하고, 새 지원금·조건·금액을 만들지 않는다.
 * 답('해당돼요/아니에요', D14)은 항목 단위로 기기 저장(localStorage) — Firestore·필드 변경 없음. '해당'은 '신청 완료'와 별개다.
 */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else root.SubsidyTiers = factory();
})(typeof window !== "undefined" ? window : global, function () {
  "use strict";

  const DAY = 86400000;
  const sod = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = (a, b) => Math.round((sod(a).getTime() - sod(b).getTime()) / DAY);
  const KEY = "hannun_subsidy_answers";
  const MSG = Object.freeze({
    urgent: "마감 임박", sure: "확실히 받는 것", condToggle: (n, open) => `조건 확인 ${n}개 ${open ? "접기" : "보기"}`, noToggle: (n, open) => `해당 없음 ${n}개 ${open ? "접기" : "보기"}`,
    yes: "해당돼요", no: "아니에요", undo: "되돌리기", confirmedTag: "해당 확인", empty: "지금 신청할 수 있는 혜택이 없어요.", more: "전체 보기 →",
    ongoing: "상시", deadlineUnknown: "기간은 공식 안내 확인", official: "공식 안내 보기", apply: "신청하러 가기", method: "신청 방법 보기", plan: "일정 넣기",
    target: (t, cond) => (cond ? `조건: ${cond}${t ? " · " + t : ""}` : t),
  });

  /** 답 저장소: { id: "yes"|"no" }. 형식이 틀린 값은 버린다. */
  function loadAnswers(storage) {
    try {
      const raw = storage && storage.getItem(KEY);
      const o = raw ? JSON.parse(raw) : {};
      return Object.fromEntries(Object.entries(o && typeof o === "object" && !Array.isArray(o) ? o : {}).filter(([k, v]) => v === "yes" || v === "no"));
    } catch (e) { return {}; }
  }
  /** 답을 바꾼 새 맵(입력은 바꾸지 않는다). value 가 null 이면 되돌림(삭제). */
  const withAnswer = (answers, id, value) => { const o = { ...(answers || {}) }; if (value === "yes" || value === "no") o[id] = value; else delete o[id]; return o; };
  function saveAnswers(storage, answers) { try { if (storage) storage.setItem(KEY, JSON.stringify(answers || {})); } catch (e) {} }

  /**
   * 3단 구성. buckets = HNLogic.subsidyBuckets 결과(available·urgent·conditional), o = { answers, deadlineOf(e)→Date|null, isUrgent(e)→bool, expandMax, today }.
   * ① urgent: 마감 임박(가까운 순). ② sure: 마감 있는 것(남은 날 오름차순) 먼저, 상시는 뒤 + '해당돼요' 답한 조건형(꼬리표). ③ conditional: 답 없는 조건형. no: '아니에요' 답.
   */
  function tiers(buckets, o) {
    const b = buckets || {}, opt = o || {}, ans = opt.answers || {};
    const isNo = (e) => ans[e.id] === "no" || (typeof opt.isNA === "function" && opt.isNA(e.id)); // 읽기는 둘 다: 이 기기의 '아니에요' + 기존 미해당(가족이 표시한 것 포함) — 쓰기는 별도 기기 저장만
    const dl = typeof opt.deadlineOf === "function" ? opt.deadlineOf : () => null;
    const urgentSet = new Set((b.urgent || []).map((e) => e.id));
    const isUrg = (e) => urgentSet.has(e.id) || (typeof opt.isUrgent === "function" && opt.isUrgent(e));
    const byDl = (a, c) => { const x = dl(a.e), y = dl(c.e); return (x ? x.getTime() : Infinity) - (y ? y.getTime() : Infinity) || (String(a.e.name || a.e.title || a.e.id) < String(c.e.name || c.e.title || c.e.id) ? -1 : 1); };
    const urgent = [], sure = [], conditional = [], no = [];
    const place = (e, confirmed) => { const it = { e, confirmed }; (isUrg(e) ? urgent : sure).push(it); };
    for (const e of b.available || []) { if (isNo(e)) no.push({ e, confirmed: false }); else place(e, false); }
    for (const e of b.conditional || []) {
      if (isNo(e)) no.push({ e, confirmed: false });
      else if (ans[e.id] === "yes") place(e, true);
      else conditional.push({ e, confirmed: false });
    }
    urgent.sort(byDl); conditional.sort(byDl);
    sure.sort(byDl); // 마감 있는 것 먼저(남은 날 오름차순), 상시(Infinity)는 뒤
    const max = Number.isInteger(opt.expandMax) && opt.expandMax > 0 ? opt.expandMax : null; // D20(정책 값 — 없으면 제한 없음)
    return { urgent, sure: max ? sure.slice(0, max) : sure, sureMore: max ? sure.slice(max) : [], conditional, no, empty: !urgent.length && !sure.length };
  }

  /**
   * 카드 한 장의 줄 모델(§3). e = 이벤트, ctx = { today, deadlineOf, urgent, applyOf(e)→{url,label}|null, canSchedule(e)→bool, answerable }.
   * 반환 { name, scope, target, when:{kind:"urgent"|"date"|"ongoing"|"unknown", text, days?}, amount, where, buttons:{primary:{kind,url,label}|null, plan:bool}, answerable }. 없는 값은 null(줄 숨김).
   */
  function rowModel(e, ctx) {
    const c = ctx || {}, d = e.detail || {};
    const end = typeof c.deadlineOf === "function" ? c.deadlineOf(e) : null;
    let when;
    if (end && c.today) {
      const n = diffDays(end, c.today), t = `${end.getMonth() + 1}월 ${end.getDate()}일까지`;
      when = c.urgent ? { kind: "urgent", text: `D-${n} · ${t}`, days: n } : { kind: "date", text: t, days: n };
    } else if (d.deadlineType === "ongoing") when = { kind: "ongoing", text: MSG.ongoing };
    else when = { kind: "unknown", text: MSG.deadlineUnknown };
    const target = d.target ? MSG.target(d.target, d.conditionLabel || "") : d.conditionLabel ? MSG.target("", d.conditionLabel) : null;
    const apply = typeof c.applyOf === "function" ? c.applyOf(e) : null;
    const url = (apply && apply.url) || d.applyUrl || "";
    const official = d.officialUrl || e.officialUrl || "";
    const primary = url ? { kind: "apply", url, label: MSG.apply } : official ? { kind: "official", url: official, label: MSG.method } : null;
    return {
      name: e.title || d.name || e.id, scope: d.scope || null, target: target || null, when,
      amount: e.summary || d.amountText || null, // 금액은 데이터의 원문 한 줄만(숫자를 만들지 않는다)
      where: d.applyPlaceText || null, // 없으면 줄 숨김, 버튼 줄의 '공식 안내 보기'만
      buttons: { primary, plan: !!end && typeof c.canSchedule === "function" && c.canSchedule(e) === true },
      answerable: !!c.answerable,
    };
  }

  return { tiers, rowModel, loadAnswers, saveAnswers, withAnswer, KEY, MSG };
});
