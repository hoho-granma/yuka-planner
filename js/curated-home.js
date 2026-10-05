/*
 * curated-home — 1-1 홈 연결 층(순수): curate() → 홈 슬롯 마크업 · 클릭 분기 · 폴백. 앱에는 아직 로드하지 않는다(연결은 v1.12.102 패치, docs/agents/dev-note-1-0-wiring.md §6).
 * 앱은 이 파일에 의존성(함수)만 주입한다 — 이 파일은 DOM·저장소·현재 시각·Firestore 를 직접 만지지 않는다.
 *   CuratedHome.render(deps)  → html | null(null 이면 호출한 쪽이 기존 홈을 그린다 = 폴백)
 *   CuratedHome.dispatch(el, handlers) → true(처리함)/false
 */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory(require("./curation.js"), require("./home-slots-view.js"));
  else root.CuratedHome = factory(root.Curation, root.HomeSlotsView);
})(typeof window !== "undefined" ? window : global, function (Curation, View) {
  "use strict";

  /**
   * deps = { policy(normalizePolicy 결과), events(visibleSchedule(true)), state(Curation.curate 의 state), today(Date),
   *          head, family(배열|null), benefits, nextStage, explore, todosHtml, nextHint }
   * 폴백(null): 모듈·정책·날짜·이벤트가 없거나 curate/렌더가 던질 때 — 앱은 기존 홈(HNHome.render / Over36View.renderHome)을 그린다.
   */
  let lastError = null; // 마지막 폴백(null)의 원인 — 홈 폴백 안내의 진단 문구용(오류가 없으면 null)
  function render(deps) {
    const d = deps || {};
    lastError = null;
    if (!Curation || !View || !d.policy || !(d.today instanceof Date) || !Array.isArray(d.events)) return null;
    try {
      const cur = Curation.curate(d.events, d.state || {}, d.policy, d.today);
      const benefits = d.benefits === undefined ? (cur.moreCounts.benefits > 0 ? { count: cur.moreCounts.benefits, check: cur.stats.byType.CHECK || 0 } : null) : d.benefits;
      const html = View.render(cur, { today: d.today, head: d.head, family: d.family, benefits, nextStage: d.nextStage, explore: d.explore, nextHint: d.nextHint, todosHtml: d.todosHtml });
      return typeof html === "string" && html ? html : null;
    } catch (e) { lastError = e; return null; }
  }
  const getLastError = () => lastError;

  /** 단위 key → 단위(지금 꼭·곧·알아두기와 넘친 목록 전체에서). */
  function unitOf(cur, key) {
    if (!cur) return null;
    for (const s of ["now", "soon", "know"]) for (const u of [...(cur[s] || []), ...((cur.overflow && cur.overflow[s]) || [])]) if (u.key === key) return u;
    return null;
  }

  /**
   * 홈 클릭 한 곳: [data-hs-act] / [data-hs-go]. handlers = { apply(url, key), schedule(key), done(key), confirm(key, yes), review(), go(name) } — 앱이 기존 동작(공식 링크 열기·일정 넣기 시트·완료 처리·확인 답 저장·체크리스트 탭·탭 이동)에 연결한다.
   * 이 함수는 어떤 저장도 하지 않는다. 처리했으면 true.
   */
  function dispatch(el, handlers) {
    const h = handlers || {};
    const t = el && el.closest ? el.closest("[data-hs-act], [data-hs-go]") : null;
    if (!t) return false;
    const act = t.getAttribute("data-hs-act"), key = t.getAttribute("data-hs-key") || "";
    if (act) {
      if (act === "apply") { if (h.apply) h.apply(t.getAttribute("data-hs-url") || "", key); return true; }
      if (act === "schedule") { if (h.schedule) h.schedule(key); return true; }
      if (act === "done") { if (h.done) h.done(key); return true; }
      if (act === "confirm-yes" || act === "confirm-no") { if (h.confirm) h.confirm(key, act === "confirm-yes"); return true; }
      if (act === "review") { if (h.review) h.review(); return true; } // 지난 접종·검진 기록 확인 → 체크리스트
      return false;
    }
    const go = t.getAttribute("data-hs-go");
    if (go && h.go) { h.go(go); return true; }
    return false;
  }

  return { render, unitOf, dispatch, getLastError };
});
