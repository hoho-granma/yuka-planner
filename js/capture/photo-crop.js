/*
 * photo-crop — D73 사진을 읽기 전에 읽을 부분만 자르는 화면. 좌표는 정규화(0~1, 방향 보정된 사진 기준)로 보관한다.
 *   순수: clampRect / moveRect / resizeRect / fitContain / toSourceRect / minNorm
 *   브라우저: mount(root, { bitmap, width, height, win }) → { getRect, destroy }  (Pointer Events, 캔버스는 화면용 축소본)
 * 사진은 저장하지도 보내지도 않는다. 원본 비트맵 1개만 들고 있고 자르기·취소 때 호출한 쪽이 close() 한다.
 */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else root.PhotoCrop = factory();
})(typeof window !== "undefined" ? window : global, function () {
  "use strict";
  const MIN_SCREEN = 80, MIN_SOURCE = 120, PREVIEW_EDGE = 1600;
  const FULL = Object.freeze({ x: 0, y: 0, w: 1, h: 1 });
  const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);

  /** 최소 크기(정규화): 화면 80px·원본 120px 중 큰 쪽. 사진이 그보다 작으면 사진 전체(1). */
  function minNorm(imgW, imgH, dispW, dispH) {
    const W = Math.max(1, num(imgW, 1)), H = Math.max(1, num(imgH, 1)), dw = Math.max(1, num(dispW, 1)), dh = Math.max(1, num(dispH, 1));
    return { w: Math.min(1, Math.max(MIN_SCREEN / dw, MIN_SOURCE / W)), h: Math.min(1, Math.max(MIN_SCREEN / dh, MIN_SOURCE / H)) };
  }
  /** 사진 밖으로 못 나가게·최소 크기 이상으로 맞춘다(크기 먼저, 그다음 위치). */
  function clampRect(r, min) {
    const m = min || { w: 0, h: 0 };
    let w = Math.min(1, Math.max(num(r && r.w, 1), m.w)), h = Math.min(1, Math.max(num(r && r.h, 1), m.h));
    const x = Math.min(1 - w, Math.max(0, num(r && r.x, 0))), y = Math.min(1 - h, Math.max(0, num(r && r.y, 0)));
    return { x, y, w, h };
  }
  function moveRect(r, dx, dy) { return clampRect({ x: r.x + dx, y: r.y + dy, w: r.w, h: r.h }, null); }
  /** handle: "nw|n|ne|e|se|s|sw|w". 반대편 가장자리는 고정, 최소 크기에서 멈춘다(뒤집힘 없음). */
  function resizeRect(r, handle, dx, dy, min) {
    const m = min || { w: 0, h: 0 };
    let l = r.x, t = r.y, rt = r.x + r.w, b = r.y + r.h;
    if (handle.includes("w")) l = Math.min(Math.max(0, l + dx), rt - m.w);
    if (handle.includes("e")) rt = Math.max(Math.min(1, rt + dx), l + m.w);
    if (handle.includes("n")) t = Math.min(Math.max(0, t + dy), b - m.h);
    if (handle.includes("s")) b = Math.max(Math.min(1, b + dy), t + m.h);
    return clampRect({ x: l, y: t, w: rt - l, h: b - t }, m);
  }
  /** stage 안에 비율을 지켜 맞춘다(contain). */
  function fitContain(imgW, imgH, stageW, stageH) {
    const W = Math.max(1, num(imgW, 1)), H = Math.max(1, num(imgH, 1)), k = Math.min(Math.max(1, num(stageW, 1)) / W, Math.max(1, num(stageH, 1)) / H);
    const w = W * k, h = H * k;
    return { x: (num(stageW, 0) - w) / 2, y: (num(stageH, 0) - h) / 2, w, h, scale: k };
  }
  /** 정규화 박스 → 원본 픽셀 정수 사각형(사진 안으로 보정, 최소 1px). */
  function toSourceRect(r, imgW, imgH) {
    const W = Math.max(1, Math.round(num(imgW, 1))), H = Math.max(1, Math.round(num(imgH, 1))), c = clampRect(r, null);
    const sx = Math.min(W - 1, Math.round(c.x * W)), sy = Math.min(H - 1, Math.round(c.y * H));
    return { sx, sy, sw: Math.max(1, Math.min(W - sx, Math.round(c.w * W))), sh: Math.max(1, Math.min(H - sy, Math.round(c.h * H))) };
  }

  const HANDLES = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
  const HANDLE_LABEL = { nw: "왼쪽 위 모서리", n: "위쪽", ne: "오른쪽 위 모서리", e: "오른쪽", se: "오른쪽 아래 모서리", s: "아래쪽", sw: "왼쪽 아래 모서리", w: "왼쪽" };
  /** 편집 마크업 안의 .crop-stage 에 캔버스·박스·핸들을 붙이고 포인터 조작을 연결한다. */
  function mount(rootEl, o) {
    const win = (o && o.win) || window, doc = win.document;
    const stage = rootEl.querySelector("[data-crop-stage]");
    const iw = o.width, ih = o.height;
    const canvas = doc.createElement("canvas"); canvas.className = "crop-canvas";
    const box = doc.createElement("div"); box.className = "crop-box"; box.setAttribute("aria-label", "자를 영역, 끌어서 옮겨요");
    stage.appendChild(canvas); stage.appendChild(box);
    HANDLES.forEach((h) => { const e = doc.createElement("span"); e.className = "crop-h crop-h-" + h; e.setAttribute("data-crop-handle", h); e.setAttribute("aria-label", "자르기 " + HANDLE_LABEL[h] + " 조절"); box.appendChild(e); });
    let rect = { x: 0, y: 0, w: 1, h: 1 }, fit = { x: 0, y: 0, w: 1, h: 1 }, min = { w: 0, h: 0 }, drag = null;
    function layout() {
      const sw = stage.clientWidth || 1, sh = stage.clientHeight || 1;
      fit = fitContain(iw, ih, sw, sh);
      const dpr = Math.min(win.devicePixelRatio || 1, 2), pw = Math.min(PREVIEW_EDGE, Math.round(fit.w * dpr)), k = pw / Math.max(1, fit.w);
      canvas.width = Math.max(1, Math.round(fit.w * k)); canvas.height = Math.max(1, Math.round(fit.h * k));
      canvas.style.cssText = `left:${fit.x}px;top:${fit.y}px;width:${fit.w}px;height:${fit.h}px`;
      const ctx = canvas.getContext("2d"); if (ctx) ctx.drawImage(o.bitmap, 0, 0, canvas.width, canvas.height);
      min = minNorm(iw, ih, fit.w, fit.h); rect = clampRect(rect, min); paint();
    }
    function paint() { box.style.cssText = `left:${fit.x + rect.x * fit.w}px;top:${fit.y + rect.y * fit.h}px;width:${rect.w * fit.w}px;height:${rect.h * fit.h}px`; }
    function down(ev) {
      if (drag) return;
      const hd = ev.target && ev.target.getAttribute && ev.target.getAttribute("data-crop-handle");
      drag = { id: ev.pointerId, handle: hd || null, x: ev.clientX, y: ev.clientY, rect: Object.assign({}, rect) };
      try { box.setPointerCapture(ev.pointerId); } catch (e) { /* 지원 안 하면 이동만 stage 안에서 */ }
      ev.preventDefault();
    }
    function move(ev) {
      if (!drag || ev.pointerId !== drag.id) return;
      const dx = (ev.clientX - drag.x) / fit.w, dy = (ev.clientY - drag.y) / fit.h;
      rect = drag.handle ? resizeRect(drag.rect, drag.handle, dx, dy, min) : moveRect(drag.rect, dx, dy);
      paint(); ev.preventDefault();
    }
    function up(ev) { if (drag && ev.pointerId === drag.id) drag = null; }
    box.addEventListener("pointerdown", down); box.addEventListener("pointermove", move); box.addEventListener("pointerup", up); box.addEventListener("pointercancel", up);
    const onResize = () => layout(); win.addEventListener("resize", onResize);
    layout();
    return { getRect: () => Object.assign({}, rect), relayout: layout, destroy() { win.removeEventListener("resize", onResize); canvas.width = canvas.height = 0; } };
  }
  return { MIN_SCREEN, MIN_SOURCE, PREVIEW_EDGE, FULL, HANDLES, minNorm, clampRect, moveRect, resizeRect, fitContain, toSourceRect, mount };
});
