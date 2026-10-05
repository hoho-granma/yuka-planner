/*
 * photo-view — D37 일정 추가 4메뉴 줄과 사진 흐름 상태 화면(순수 마크업). 명세 docs/한눈육아-디자인명세-일정추가4메뉴.md §1~§3.
 * DOM·저장소·시각을 만지지 않는다. 색은 앱 토큰(var(--nd-*)·--line·--text-muted)만, 새 색 없음. 모든 상태에 [직접 입력으로 계속]·[붙여넣기로 계속] 중 하나 이상이 있다(막다른 화면 금지).
 *   renderMenu(selected) / renderState(kind, o) / mbText(bytes)
 *   kind: "download"(②′ 처음 한 번 데이터 받는 중) | "reading"(① 읽는 중) | "readFail"(④ 글자를 못 찾음) | "unparsed"(⑤ 규칙으로 일정이 안 나옴) | "downloadFail"(⑥ 데이터를 못 받음) | "unavailable"(⑦ 사진을 쓸 수 없음) | "loading"(D73 사진 준비 중) | "decodeFail"(D73 사진을 열 수 없음); renderCrop(o) = D73 자르기 화면
 *   o: { percent(0..100), long(bool, 읽기가 10초 넘음), bytes, previewUrl, from("camera"|"gallery"), rawText }
 */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else root.CapturePhotoView = factory();
})(typeof window !== "undefined" ? window : global, function () {
  "use strict";
  const esc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const MSG = Object.freeze({
    menuAria: "일정 추가 방법",
    camera: "사진 찍기", cameraSub: "안내문·메모를 찍어요",
    gallery: "사진 불러오기", gallerySub: "저장된 사진·캡처",
    paste: "메시지 붙여넣기", pasteSub: "문자·가정통신문 글",
    direct: "직접 입력", directSub: "날짜·제목을 직접",
    readingTitle: "사진에서 글자를 읽는 중", readingSub: "잠시만 기다려 주세요", reading: "읽는 중…", readingLong: "아직 읽고 있어요. 사진이 크면 오래 걸려요",
    privacy: "고른 사진은 저장하지도, 서버로 보내지도 않아요. 이 기기 안에서 글자만 읽고 바로 잊어요.",
    stop: "그만두기",
    dlTitle: "글자 읽는 데이터를 받고 있어요", dlBody: (mb) => `처음 한 번만 받아요(약 ${mb}MB). 와이파이에서 받는 걸 권해요. 이후에는 이 기기 안에서 바로 읽어요.`,
    failTitle: "사진에서 글자를 읽지 못했어요", failBody: "글자가 작거나 흐리거나 어두울 수 있어요. 더 밝은 곳에서 다시 찍거나, 아래 방법으로 이어 가세요.",
    againCamera: "다시 찍기", againGallery: "다시 고르기",
    ruleTitle: "규칙으로 분석하지 못했어요", ruleBody: "글자는 읽었지만 날짜를 찾지 못했어요. 손글씨나 흐린 글씨는 잘 읽지 못해요. 읽은 글을 붙여넣기 칸에 넣어 두었으니 고치거나 날짜를 적어 주세요.",
    readText: "읽은 글 보기 ›",
    dlFailTitle: "글자 읽는 데이터를 받지 못했어요", dlFailBody: "인터넷 연결을 확인하고 다시 시도해 주세요. 지금 바로 추가하려면 아래 방법을 쓰세요.", retry: "다시 시도",
    offTitle: "사진을 쓸 수 없어요", offBody: "기기 설정에서 카메라·사진 접근을 허용하면 쓸 수 있어요. 지금은 아래 방법으로 추가할 수 있어요.",
    loadingTitle: "사진을 불러오는 중", cropTitle: "읽을 부분 고르기", cropHint: "읽을 부분만 남기고 잘라 주세요. 자르지 않으면 사진 전체를 읽어요.", cropOk: "업로드", cropCancel: "취소",
    decodeFailBody: "이 사진은 열 수 없어요. 다른 사진을 고르거나, 스크린샷으로 저장해서 다시 올려 주세요.",
    toDirect: "직접 입력으로 계속", toPaste: "붙여넣기로 계속",
    photoNote: "사진에서 읽은 글자는 틀릴 수 있어요. 날짜와 시각을 꼭 확인해 주세요.",
  });
  const svg = (inner) => `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
  const ICON = Object.freeze({
    camera: svg('<path d="M4 8h3l1.5-2h7L17 8h3v11H4z"/><circle cx="12" cy="13" r="3.2"/>'),
    gallery: svg('<rect x="4" y="5" width="16" height="14" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="M5 17l4.5-4.5 3 3L15 13l4 4"/>'),
    paste: svg('<path d="M5 6h14v9H10l-4 3v-3H5z"/>'),
    direct: svg('<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/>'),
  });
  const mbText = (bytes) => Math.max(1, Math.round((Number(bytes) || 0) / 1000000));

  /** 4메뉴 2×2 타일. selected: "direct"(기본 ★) | "camera" | "gallery" | "paste". */
  function renderMenu(selected) {
    const sel = selected || "direct";
    const tile = (id, label, sub) => `<button type="button" class="cap-tile${sel === id ? " active" : ""}" data-cap-menu="${id}" aria-pressed="${sel === id ? "true" : "false"}">${ICON[id]}<span class="cap-tile-t"><b>${esc(label)}</b><small>${esc(sub)}</small></span></button>`;
    return `<div class="cap-menu" role="group" aria-label="${esc(MSG.menuAria)}">${tile("camera", MSG.camera, MSG.cameraSub)}${tile("gallery", MSG.gallery, MSG.gallerySub)}${tile("paste", MSG.paste, MSG.pasteSub)}${tile("direct", MSG.direct, MSG.directSub)}</div>`;
  }

  const continueBtns = (primary, pasteAttr) => {
    const direct = `<button type="button" class="${primary === "direct" ? "btn-complete" : "btn-close"} cap-btn" data-cap-direct>${esc(MSG.toDirect)}</button>`;
    const paste = `<button type="button" class="${primary === "paste" ? "btn-complete" : "btn-close"} cap-btn" ${pasteAttr || "data-cap-open"}>${esc(MSG.toPaste)}</button>`;
    return primary === "paste" ? paste + direct : direct + paste;
  };

  /** D73 자르기 화면(전체 화면). 캔버스·박스·핸들은 PhotoCrop.mount 가 [data-crop-stage] 안에 붙인다. */
  function renderCrop(o) {
    const op = o || {};
    return `<div class="crop-screen" role="dialog" aria-modal="true" aria-label="${esc(MSG.cropTitle)}" data-cap-step="photo-crop"><div class="crop-head"><h3>${esc(MSG.cropTitle)}</h3></div>` +
      `<div class="crop-stage" data-crop-stage></div><div class="crop-info"><p class="crop-hint">${esc(MSG.cropHint)}</p><p class="crop-privacy">${esc(MSG.privacy)}</p>` +
      `<button type="button" class="crop-again" data-cap-photo-again>${esc(op.from === "gallery" ? MSG.againGallery : MSG.againCamera)}</button></div>` +
      `<div class="crop-foot"><button type="button" class="btn-close cap-btn" data-cap-crop-cancel>${esc(MSG.cropCancel)}</button><button type="button" class="btn-complete cap-btn" data-cap-crop-ok>${esc(MSG.cropOk)}</button></div></div>`;
  }
  function renderState(kind, o) {
    const op = o || {};
    const wrap = (inner) => `<div class="us-form us-capture cap-state" data-cap-step="photo-${esc(kind)}">${inner}</div>`;
    if (kind === "download") {
      const pct = Math.max(0, Math.min(100, Math.round(op.percent || 0)));
      return wrap(`<h3>${esc(MSG.dlTitle)}</h3><p>${esc(MSG.dlBody(mbText(op.bytes)))}</p><div class="cap-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><i style="width:${pct}%"></i></div><button type="button" class="btn-close cap-btn" data-cap-photo-stop>${esc(MSG.stop)}</button>`);
    }
    if (kind === "loading") return wrap(`<div class="cap-reading"><span class="cap-spin" aria-hidden="true"></span></div><h3>${esc(MSG.loadingTitle)}</h3><p class="cap-sub" aria-live="polite">${esc(MSG.readingSub)}</p><button type="button" class="btn-close cap-btn" data-cap-photo-stop>${esc(MSG.stop)}</button>`);
    if (kind === "decodeFail") {
      const again = `<button type="button" class="btn-close cap-btn" data-cap-photo-again>${esc(op.from === "gallery" ? MSG.againGallery : MSG.againCamera)}</button>`;
      return wrap(`<h3>${esc(MSG.failTitle)}</h3><p>${esc(MSG.decodeFailBody)}</p>${again}${continueBtns("direct")}`);
    }
    if (kind === "reading") {
      const preview = op.previewUrl ? `<img class="cap-preview" src="${esc(op.previewUrl)}" alt="" width="48" height="48" />` : "";
      return wrap(`<div class="cap-reading">${preview}<span class="cap-spin" aria-hidden="true"></span></div><h3>${esc(MSG.readingTitle)}</h3><p class="cap-sub" aria-live="polite"><span class="cap-still">${esc(MSG.reading)}</span> ${esc(MSG.readingSub)}</p>` +
        `<p class="us-note">${esc(op.long ? MSG.readingLong : MSG.privacy)}</p><button type="button" class="btn-close cap-btn" data-cap-photo-stop>${esc(MSG.stop)}</button>`);
    }
    if (kind === "readFail") {
      const again = `<button type="button" class="btn-close cap-btn" data-cap-photo-again>${esc(op.from === "gallery" ? MSG.againGallery : MSG.againCamera)}</button>`;
      return wrap(`<h3>${esc(MSG.failTitle)}</h3><p>${esc(MSG.failBody)}</p>${again}${continueBtns("direct")}`);
    }
    if (kind === "unparsed") {
      return wrap(`<h3>${esc(MSG.ruleTitle)}</h3><p>${esc(MSG.ruleBody)}</p>${continueBtns("paste", "data-cap-paste-prefill")}` +
        (op.rawText ? `<details class="us-cand-raw"><summary>${esc(MSG.readText)}</summary><p class="us-note cap-rawtext">${esc(op.rawText)}</p></details>` : ""));
    }
    if (kind === "downloadFail") {
      return wrap(`<h3>${esc(MSG.dlFailTitle)}</h3><p>${esc(MSG.dlFailBody)}</p><button type="button" class="btn-close cap-btn" data-cap-photo-retry>${esc(MSG.retry)}</button>${continueBtns("direct")}`);
    }
    return wrap(`<h3>${esc(MSG.offTitle)}</h3><p>${esc(MSG.offBody)}</p>${continueBtns("direct")}`); // unavailable
  }
  return { MSG, ICON, mbText, renderMenu, renderState, renderCrop };
});
