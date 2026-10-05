/*
 * home-must — 4-1 A안 이전 홈 맨 위 '지금 꼭 할 것' 카드(최대 2줄)의 순수 마크업. 명세 docs/한눈육아-4-1-A-구현명세.md.
 * units = Curation.curate().now 의 앞 N개(정책 slots.homeMust, 기본 2, 0이면 카드 없음), more = 나머지 개수('외 N개 ›' → 체크리스트).
 * 줄: [분류색 점] 제목 … 날짜글자 — L1·L2 'D-N'(와인, 글자+색), L3 '지금 가능', L4 'M월 D일까지'(6개월 넘으면 연도), 지난 날짜·기록 확인 단위는 날짜 없음.
 * 항목이 없으면 빈 문자열(카드 숨김 = 이전 홈과 같은 화면). DOM·저장소·시각을 만지지 않는다(today 는 인자).
 */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else root.HomeMust = factory();
})(typeof window !== "undefined" ? window : global, function () {
  "use strict";
  const DAY = 86400000;
  const MSG = Object.freeze({ title: "지금 꼭 할 것", now: "지금 가능", more: (n) => `외 ${n}개 ›` });
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const sod = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const lv = (u) => Number(String(u.rule || u.level || "L7").slice(1));

  /** 오른쪽 날짜 글자 { text, urgent } — 지난 날짜·날짜 없음·기록 확인은 text "". */
  function dateOf(u, today) {
    if (u.review || u.actionKind === "review" || !(today instanceof Date)) return { text: "", urgent: false };
    const r = lv(u), n = u.daysToEnd;
    if (r === 1 || r === 2) return Number.isFinite(n) && n >= 0 ? { text: `D-${n}`, urgent: true } : { text: "", urgent: false };
    if (r === 3) return { text: MSG.now, urgent: false };
    if (r === 4 && Number.isFinite(n) && n >= 0) {
      const d = new Date(sod(today).getTime() + n * DAY), far = d.getFullYear() !== today.getFullYear() || d.getTime() - today.getTime() > 183 * DAY;
      return { text: `${far ? `${d.getFullYear()}년 ` : ""}${d.getMonth() + 1}월 ${d.getDate()}일까지`, urgent: false };
    }
    return { text: "", urgent: false };
  }
  /** o = { units, more, today, colorOf(u) → 분류색 } */
  function render(o) {
    const units = Array.isArray(o && o.units) ? o.units.filter((u) => u && u.key && u.title) : [];
    if (!units.length) return "";
    const more = Number.isInteger(o.more) && o.more > 0 ? o.more : 0;
    const rows = units.map((u) => {
      const d = dateOf(u, o.today), color = typeof o.colorOf === "function" ? o.colorOf(u) : "";
      return `<button type="button" class="home-must-row" data-hm-open="${esc(u.key)}"><span class="hm-dot"${color ? ` style="background:${esc(color)}"` : ""}></span><span class="hm-t">${esc(u.title)}</span>${d.text ? `<b class="hm-d${d.urgent ? " urgent" : ""}">${esc(d.text)}</b>` : ""}</button>`;
    }).join("");
    return `<section class="home-sec home-must" id="home-must"><div class="home-sec-head"><h3>${esc(MSG.title)}</h3>${more ? `<button type="button" class="home-viewall" data-hm-more>${esc(MSG.more(more))}</button>` : ""}</div>${rows}</section>`;
  }
  /** D72a: 큐레이션 결과(cur)에서 단위 key 로 항목 단위를 찾는다(옛 curated-home.js 의 unitOf — 새 홈 삭제 뒤 이 카드가 이어서 쓴다). */
  function unitOf(cur, key) {
    if (!cur) return null;
    for (const s of ["now", "soon", "know"]) for (const u of [...(cur[s] || []), ...((cur.overflow && cur.overflow[s]) || [])]) if (u.key === key) return u;
    return null;
  }

  return { MSG, dateOf, render, unitOf };
});
