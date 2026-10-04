/*
 * tab-swipe — 본문을 좌우로 쓸어 이전·다음 탭으로 넘기는 판정(G23, 순수 모듈: DOM·저장소·네트워크 없음).
 * 판정: 가로 이동이 세로 이동보다 충분히 크고(|dx| > 60px, |dx| > 1.5·|dy|) 빠를 때(0.7초 이내, 0.2px/ms 이상)만 넘긴다.
 * 방향: 왼쪽으로 쓸면(dx < 0) 다음 탭(+1), 오른쪽으로 쓸면 이전 탭(-1). 양 끝 탭에서는 넘어가지 않는다(null).
 * 무시 조건(가로 스크롤 영역·열린 시트·입력 포커스)은 앱이 DOM 을 보고 shouldIgnore 에 넘긴다.
 */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else root.TabSwipe = factory();
})(typeof window !== "undefined" ? window : global, function () {
  "use strict";

  const MIN_DX = 60;
  const RATIO = 1.5;
  const MAX_MS = 700;
  const MIN_SPEED = 0.2; // px/ms

  /** dx·dy: 시작→끝 이동(px), dt: 걸린 시간(ms). 방향(+1 다음 / -1 이전) 또는 0(스와이프 아님). */
  function direction(dx, dy, dt) {
    const ax = Math.abs(dx), ay = Math.abs(dy);
    if (!(ax > MIN_DX) || !(ax > RATIO * ay)) return 0;
    if (!(dt > 0) || dt > MAX_MS || ax / dt < MIN_SPEED) return 0;
    return dx < 0 ? 1 : -1;
  }

  /** order: 하단 바에 보이는 탭 이름 순서. 끝이거나 현재 탭이 목록에 없으면 null. */
  function nextTab(order, current, dir) {
    const i = (order || []).indexOf(current);
    if (i < 0 || !dir) return null;
    const j = i + (dir > 0 ? 1 : -1);
    return j < 0 || j >= order.length ? null : order[j];
  }

  /** ctx: { disabled, modalOpen, popupOpen, inputFocused, multiTouch, inHorizontalScroll } — 하나라도 true 면 무시. */
  function shouldIgnore(ctx) {
    const c = ctx || {};
    return !!(c.disabled || c.modalOpen || c.popupOpen || c.inputFocused || c.multiTouch || c.inHorizontalScroll);
  }

  return { MIN_DX, RATIO, MAX_MS, MIN_SPEED, direction, nextTab, shouldIgnore };
});
