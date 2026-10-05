/*
 * apply-channel-view — 3-3 지원금 상세 시트의 '신청하는 곳' 한 줄(+온라인이면 버튼). 순수 마크업, 형식은 06 §7-3(승인): 지원금 레코드의
 *   applyChannel: ["online"|"visit"|"healthCenter"|"onestop", …]  ·  applyPlaceText: 기존 문장에서 옮긴 신청처 원문 한 줄(선택)
 * 필드가 없거나 비면 빈 문자열 → 지금 화면과 같다. 문장은 데이터(applyPlaceText)가 있으면 그대로, 없으면 채널 이름만 이어 붙인다(새 사실을 만들지 않는다).
 * 버튼: online 이 들어 있고 기존 신청 링크(ApplyLinks.forSubsidy 결과 { url, label })가 있을 때만. 방문·보건소·원스톱은 문구만.
 */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else root.ApplyChannelView = factory();
})(typeof window !== "undefined" ? window : global, function () {
  "use strict";
  const KEYS = Object.freeze({ onestop: "행복출산 원스톱", healthCenter: "보건소", online: "온라인", visit: "방문" });
  const MSG = Object.freeze({ label: "신청하는 곳" });
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  /** 레코드 → { channels:[유효 키], text } | null. 유효한 채널도 원문도 없으면 null. */
  function normalize(rec) {
    if (!rec || typeof rec !== "object") return null;
    const channels = Array.isArray(rec.applyChannel) ? rec.applyChannel.filter((k, i, a) => Object.prototype.hasOwnProperty.call(KEYS, k) && a.indexOf(k) === i) : [];
    const text = typeof rec.applyPlaceText === "string" ? rec.applyPlaceText.trim() : "";
    if (!channels.length && !text) return null;
    return { channels, text: text || channels.map((k) => KEYS[k]).join(" · ") };
  }
  /** 상세 시트의 한 줄(.detail-row). apply = { url, label } | null. */
  function rowHtml(rec, apply) {
    const n = normalize(rec);
    if (!n) return "";
    const url = apply && typeof apply.url === "string" && /^https?:\/\//.test(apply.url) ? apply.url : "";
    const btn = n.channels.includes("online") && url ? `<a class="apply-ch-btn" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(apply.label || "신청 페이지 열기")}</a>` : "";
    return `<div class="detail-row" data-apply-channel><div class="label">${esc(MSG.label)}</div>${esc(n.text)}${btn}</div>`;
  }
  return { KEYS, MSG, normalize, rowHtml };
});
