/*
 * photo-compress — D37 사진을 글자 인식 전에 줄인다. 고른 사진은 메모리(Blob)에서만 다루고 저장하지도 보내지도 않는다.
 *   fitSize(w, h, maxEdge) → { width, height, scaled }   (순수: 긴 변이 maxEdge 를 넘으면 비율을 지켜 줄인다. 작으면 그대로)
 *   open(file, { win }) → Promise<{ bitmap, width, height }>  (D73: 디코드·방향 보정만, 자르기 화면용. 쓰고 나면 bitmap.close())
 *   cropToBlob(bitmap, { sx, sy, sw, sh }, { maxEdge, quality, win }) → Promise<{ blob, width, height, previewUrl }>  (D73: 원본 비트맵에서 잘라 긴 변이 maxEdge 를 넘을 때만 줄인다)
 *   compress(file, { maxEdge, quality, win }) → Promise<{ blob, width, height, previewUrl }>  (브라우저: 회전 정보 반영·JPEG 로 다시 그림)
 * 실패(이미지가 아님·디코드 실패)는 { code: "decode-failed" } 로 던진다.
 */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else root.PhotoCompress = factory();
})(typeof window !== "undefined" ? window : global, function () {
  "use strict";
  const MAX_EDGE = 1800; // 글자가 작은 안내문·캡처도 읽히는 크기(너무 크면 느리고 메모리를 많이 쓴다)
  const QUALITY = 0.9;

  function fitSize(w, h, maxEdge) {
    const W = Math.max(1, Math.round(Number(w) || 0)), H = Math.max(1, Math.round(Number(h) || 0)), M = maxEdge || MAX_EDGE;
    const long = Math.max(W, H);
    if (long <= M) return { width: W, height: H, scaled: false };
    const k = M / long;
    return { width: Math.max(1, Math.round(W * k)), height: Math.max(1, Math.round(H * k)), scaled: true };
  }

  async function decode(file, win) {
    const w = win || (typeof window !== "undefined" ? window : null);
    if (w && typeof w.createImageBitmap === "function") {
      try { return await w.createImageBitmap(file, { imageOrientation: "from-image" }); } catch (e) { /* 아래 Image 경로로 */ }
    }
    if (!w || !w.document || !w.URL) throw { code: "decode-failed" };
    const url = w.URL.createObjectURL(file);
    try {
      return await new Promise((resolve, reject) => { const img = new w.Image(); img.onload = () => resolve(img); img.onerror = () => reject({ code: "decode-failed" }); img.src = url; });
    } finally { w.URL.revokeObjectURL(url); }
  }

  async function compress(file, o) {
    const opts = o || {}, w = opts.win || (typeof window !== "undefined" ? window : null);
    if (!w || !w.document) throw { code: "decode-failed" };
    const img = await decode(file, w);
    const iw = img.width || img.naturalWidth, ih = img.height || img.naturalHeight;
    if (!iw || !ih) throw { code: "decode-failed" };
    const size = fitSize(iw, ih, opts.maxEdge);
    const canvas = w.document.createElement("canvas");
    canvas.width = size.width; canvas.height = size.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw { code: "decode-failed" };
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, size.width, size.height); // 투명 PNG(캡처)는 흰 바탕 위에
    ctx.drawImage(img, 0, 0, size.width, size.height);
    if (typeof img.close === "function") img.close();
    const blob = await new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject({ code: "decode-failed" })), "image/jpeg", opts.quality || QUALITY));
    canvas.width = canvas.height = 0; // 메모리 바로 반환
    return { blob, width: size.width, height: size.height, previewUrl: w.URL.createObjectURL(blob) };
  }
  async function open(file, o) {
    const w = (o && o.win) || (typeof window !== "undefined" ? window : null);
    if (!w || !w.document) throw { code: "decode-failed" };
    const img = await decode(file, w);
    const width = img.width || img.naturalWidth, height = img.height || img.naturalHeight;
    if (!width || !height) throw { code: "decode-failed" };
    return { bitmap: img, width, height };
  }
  async function cropToBlob(bitmap, r, o) {
    const opts = o || {}, w = opts.win || (typeof window !== "undefined" ? window : null);
    if (!w || !w.document || !bitmap || !r) throw { code: "decode-failed" };
    const size = fitSize(r.sw, r.sh, opts.maxEdge);
    const canvas = w.document.createElement("canvas");
    canvas.width = size.width; canvas.height = size.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw { code: "decode-failed" };
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, size.width, size.height);
    ctx.drawImage(bitmap, r.sx, r.sy, r.sw, r.sh, 0, 0, size.width, size.height);
    const blob = await new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject({ code: "decode-failed" })), "image/jpeg", opts.quality || QUALITY));
    canvas.width = canvas.height = 0;
    return { blob, width: size.width, height: size.height, previewUrl: w.URL.createObjectURL(blob) };
  }
  return { MAX_EDGE, QUALITY, fitSize, compress, open, cropToBlob };
});
