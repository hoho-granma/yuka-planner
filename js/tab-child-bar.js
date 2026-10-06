/*
 * tab-child-bar — D33 A안: 캘린더·체크리스트/할 일·교육 트렌드·어디갈까 탭 맨 위에 '지금 보는 아이' 칩 줄(이름 · 나이).
 * 아이가 2명 이상일 때만 만든다(1명·임신 중이면 빈 문자열 = 화면 변화 없음). 모양·동작은 홈 칩(.home-child-chip, data-home-child)을 그대로 쓴다.
 * 순수 마크업 — DOM·저장소를 만지지 않는다. kids = [{ code, name, ageText, current }].
 */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else root.TabChildBar = factory();
})(typeof window !== "undefined" ? window : global, function () {
  "use strict";
  const TABS = Object.freeze(["calendar", "checklist", "trend", "places", "growth"]);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  function render(kids) {
    const list = Array.isArray(kids) ? kids.filter((c) => c && c.code) : [];
    if (list.length < 2) return "";
    return list.map((c) => `<button type="button" role="tab" aria-selected="${c.current ? "true" : "false"}" class="home-child-chip tcb-chip${c.current ? " active" : ""}" data-home-child="${esc(c.code)}"><b>${esc(c.name)}</b>${c.ageText ? `<small> · ${esc(c.ageText)}</small>` : ""}</button>`).join("");
  }
  return { TABS, render };
});
