/*
 * motion — "나타나는 순간"에 부드러운 등장 모션을 붙이는 레이어(css/motion.css 의 hn-m-* 클래스).
 * app.js 는 화면을 .hidden 으로 껐다 켜고 시트를 DOM 에 넣고 빼므로, 그 변화를 MutationObserver 로 보고 클래스만 잠깐 붙였다 뗀다.
 *  - .view(랜딩↔앱) · .tab-panel(하단 탭, 가는 방향으로 슬라이드) · .modal(배경 페이드 + 패널 상승) · 시트류(삽입 시) · 그 밖에 숨김이 풀린 요소
 *  - 스와이프 전환(app.js acct23Go)이 이미 애니메이션을 단 패널은 건드리지 않는다. prefers-reduced-motion 이면 아무것도 하지 않는다.
 *  - 시트가 "다시 그려지는" 경우(같은 종류 노드가 같은 배치에서 지워짐)는 다시 올라오지 않게 건너뛴다. [data-no-motion] 은 제외.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else { root.HnMotion = api; if (typeof document !== "undefined") api.start(root); }
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";
  const SHEET = ".hn-sheet,.us-anniv-sheet,.hn-detail-sheet,.acct-add-sheet,.us-scope-sheet";
  const SKIP = ".nav-item,.bottom-nav,input,select,textarea,option,svg,path,img,[data-no-motion],.date-popup,.hn-face";
  const CLEAR_MS = 900;

  /** 하단 탭 이동 방향: 오른쪽 탭으로 가면 +1(오른쪽에서 들어옴), 왼쪽이면 -1. 알 수 없으면 0. */
  function tabDirection(order, from, to) {
    const a = order.indexOf(from), b = order.indexOf(to);
    return a < 0 || b < 0 || a === b ? 0 : b > a ? 1 : -1;
  }

  function start(win) {
    const doc = win.document;
    if (!doc || !doc.body || typeof win.MutationObserver !== "function") return;
    const reduce = typeof win.matchMedia === "function" ? win.matchMedia("(prefers-reduced-motion: reduce)") : { matches: false };
    let lastTab = null;
    const play = (el, cls) => {
      el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls);
      setTimeout(() => el.classList.remove(cls), CLEAR_MS);
    };
    const tabOrder = () => Array.from(doc.querySelectorAll(".bottom-nav .nav-item")).map((b) => b.dataset.nav).filter(Boolean);
    const shown = (el, old) => / hidden /.test(" " + (old || "") + " ") && !el.classList.contains("hidden");

    function onShown(el) {
      if (el.matches(SKIP) || el.closest(".nav-item")) return;
      if (el.classList.contains("tab-panel")) {
        const id = el.id.replace(/^tab-/, ""), dir = tabDirection(tabOrder(), lastTab, id);
        lastTab = id;
        if (typeof el.getAnimations === "function" && el.getAnimations().length) return; // 스와이프 전환이 이미 움직이는 중
        el.style.setProperty("--hn-dx", dir * 18 + "px");
        play(el, "hn-m-tab");
      } else if (el.classList.contains("view")) play(el, "hn-m-view");
      else if (el.classList.contains("modal")) play(el, "hn-m-modal");
      else if (el.matches(SHEET)) play(el, "hn-m-sheet");
      else if (el.offsetHeight > 24) play(el, "hn-m-pop");
    }

    new win.MutationObserver((list) => {
      if (reduce.matches) return;
      const removedSheets = new Set();
      list.forEach((m) => m.removedNodes && m.removedNodes.forEach((n) => { if (n.nodeType === 1 && n.matches && n.matches(SHEET)) removedSheets.add(n.className); }));
      list.forEach((m) => {
        if (m.type === "attributes") { if (m.target.nodeType === 1 && shown(m.target, m.oldValue)) onShown(m.target); return; }
        m.addedNodes.forEach((n) => {
          if (n.nodeType !== 1 || !n.matches || !n.matches(SHEET)) return;
          if (removedSheets.has(n.className)) return; // 같은 시트를 다시 그린 것 — 또 올라오지 않게
          play(n, "hn-m-sheet");
        });
      });
    }).observe(doc.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["class"], attributeOldValue: true });
  }
  return { start, tabDirection, SHEET };
});
