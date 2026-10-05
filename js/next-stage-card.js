/*
 * next-stage-card — 1-6 다음 단계 시트 맨 위 '무엇이 달라지나' 정보 카드(순수). 앱에 아직 연결하지 않는다(js/next-stage.js 의 시트가 intro 아래에 붙일 준비).
 * 근거: docs/한눈육아-디자인명세-다음단계카드.md. 문장은 정책(next-stage.json 단계의 changes[]·changesSource)에서만 읽는다 — 근거 없는 단계는 카드를 만들지 않는다(비노출).
 * 정보 카드 노출창: 단계의 infoWindowMonths 가 있으면 그 개월부터(배너 windowMonths 와 별개). 키가 없으면 정보 카드는 숨긴다(값은 hn_data).
 */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else root.NextStageCard = factory();
})(typeof window !== "undefined" ? window : global, function () {
  "use strict";

  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const MSG = Object.freeze({ title: "무엇이 달라지나", appSource: "한눈육아 앱 안내 기준" });

  /** 정책 단계 → 카드 데이터 { lines[2~3], source } | null. changes 가 문자열 배열이고 1~3줄일 때만(그 밖은 null = 카드 없음). */
  function cardOf(stage) {
    const c = stage && stage.changes;
    if (!Array.isArray(c) || c.length < 1 || c.length > 3 || !c.every((x) => typeof x === "string" && x.trim())) return null;
    return { lines: c.map((x) => x.trim()), source: typeof stage.changesSource === "string" && stage.changesSource.trim() ? stage.changesSource.trim() : MSG.appSource };
  }
  /** 정보 카드를 이 아이에게 보일까: age 단계는 infoWindowMonths(없으면 숨김), 날짜 기준·출산 단계는 배너 창과 같다(배너가 보일 때만 시트가 열리므로 true). */
  function infoVisible(stage, kid) {
    const m = stage && stage.match;
    if (!m || m.kind !== "age") return true;
    if (!Number.isInteger(stage.infoWindowMonths) || typeof kid.ageMonths !== "number") return false;
    const left = m.boundaryMonths - kid.ageMonths;
    return left > 0 && left <= stage.infoWindowMonths;
  }
  /** 행동 버튼용 '아직 하지 않은 첫 항목'(state open). 없으면 null. */
  const firstOpenItem = (items) => (items || []).find((it) => it && it.state === "open") || null;
  /** 카드 마크업(시트 intro 아래, 항목 목록 위). 행동 버튼은 시트의 기존 버튼 영역이 쓰므로 여기서는 data-ns-first 표식만 단다. */
  function render(stage, kid, items) {
    const card = cardOf(stage);
    if (!card || !infoVisible(stage, kid || {})) return "";
    const first = firstOpenItem(items);
    return `<div class="ns-change"><h4>${esc(MSG.title)}</h4><ul class="detail-list">${card.lines.map((l) => `<li>${esc(l)}</li>`).join("")}</ul><p class="fine-print">${esc(card.source)}</p>${first ? `<span hidden data-ns-first="${esc(first.id)}"></span>` : ""}</div>`;
  }

  return { cardOf, infoVisible, firstOpenItem, render, MSG };
});
