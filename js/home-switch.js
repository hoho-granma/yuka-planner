/*
 * home-switch — 1-1b 새 홈 미리보기 스위치(순수). 명세 docs/한눈육아-디자인명세-큐레이션홈-노출.md, 결정 D24(2026-10-05).
 * 사용자 키(기기 저장 localStorage "hannun_home_v2": "1" 새 홈 / "0" 이전 홈) > 개발용 플래그(curation) > 단계 기본값(① OFF · ② ON).
 * 이 파일은 저장소를 인자로만 받고 서버·Firestore 를 만지지 않는다. 단계 ②·③ 은 코드만 준비 — 단계 전환은 사용자 확인 원문으로만(STAGE 상수는 app.js 가 1 로 고정).
 */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else root.HomeSwitch = factory();
})(typeof window !== "undefined" ? window : global, function () {
  "use strict";
  const KEY = "hannun_home_v2", NOTICE_KEY = "hannun_home_v2_notice", ONCE_KEY = "hannun_home_v2_welcomed";
  const MSG = Object.freeze({
    title: "새 홈 미리보기", desc: "지금 꼭 할 것부터 먼저 보여 드려요", on: "끄기", off: "켜기", aria: "새 홈 미리보기",
    title2: "홈 화면", desc2: "새 홈을 쓰고 있어요", desc2Old: "이전 홈을 쓰고 있어요", on2: "새 홈 사용", off2: "이전 홈",
    notice: "새 홈을 보고 계세요. 지금 꼭 할 것부터 보여 드려요.", toOld: "이전 홈으로", close: "닫기",
    welcome2: "홈이 새로워졌어요. 지금 꼭 할 것부터 보여 드려요. 이전 홈이 편하면 맨 아래에서 바꿀 수 있어요.",
    fallback: "새 홈을 불러오지 못해 이전 홈을 보여 드려요", linkOld: "이전 홈으로 보기", linkNew: "새 홈으로 보기",
  });
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const get = (st, k) => { try { return st ? st.getItem(k) : null; } catch (e) { return null; } };
  const set = (st, k, v) => { try { if (st) st.setItem(k, v); return true; } catch (e) { return false; } };

  /** 사용자 선택: "on" | "off" | null(키 없음·이상한 값). */
  const read = (st) => { const v = get(st, KEY); return v === "1" ? "on" : v === "0" ? "off" : null; };
  const write = (st, on) => set(st, KEY, on ? "1" : "0");
  /** 지금 새 홈을 쓸까: 사용자 키 > 개발용 플래그 > 단계 기본값(① false · ② true). */
  function effective(pref, devFlag, stage) { if (pref === "on") return true; if (pref === "off") return false; if (devFlag === true) return true; return Number(stage) >= 2; }

  const btn = (on, label, stage) => `<button type="button" class="us-tchip" role="switch" aria-checked="${on ? "true" : "false"}" aria-label="${esc(MSG.aria)}" data-home-switch="${on ? "off" : "on"}">${esc(label)}</button>`;
  /** 프로필 시트 줄('구성원 관리' 아래·'우리 아이' 위). 기존 .detail-row 카드 모양 + .hs-pref 안쪽 글자. */
  function rowHtml(on, stage) {
    const s2 = Number(stage) >= 2;
    const title = s2 ? MSG.title2 : MSG.title, desc = s2 ? (on ? MSG.desc2 : MSG.desc2Old) : MSG.desc, label = s2 ? (on ? MSG.on2 : MSG.off2) : (on ? MSG.on : MSG.off);
    return `<div class="detail-row hs-pref" data-home-switch-row><div class="hs-pref-t"><b>${esc(title)}</b><small>${esc(desc)}</small></div>${btn(on, label, stage)}</div>`;
  }
  /** 켠 직후 홈 맨 위 1회 안내 띠(단계 ①) / ② 로 바뀐 첫날 안내. kind: "on" | "welcome2" | "fallback". */
  function noticeHtml(kind, diag) {
    const text = kind === "welcome2" ? MSG.welcome2 : kind === "fallback" ? MSG.fallback : MSG.notice;
    const why = kind === "fallback" && diag ? `<small class="hs-notice-diag">진단: ${esc(String(diag).slice(0, 60))}</small>` : ""; // 오류 요지(앞 60자) — 사용자가 콘솔 없이 읽어 줄 수 있게
    const link = kind === "fallback" ? "" : `<button type="button" class="hs-notice-link" data-home-switch="off">${esc(MSG.toOld)}</button>`;
    return `<div class="hs-notice" data-home-notice><span>${esc(text)}${why}</span>${link}<button type="button" class="hs-notice-x" data-home-notice-x aria-label="${esc(MSG.close)}">✕</button></div>`;
  }
  /** 홈 맨 아래 작은 링크(단계 ② 전용): 새 홈에서는 '이전 홈으로 보기', 이전 홈에서는 '새 홈으로 보기'. 단계 ① 에서는 비움. */
  function linkHtml(on, stage, pref) {
    if (!(Number(stage) >= 2) && !(on && pref === "on")) return ""; // 단계 ①: 스위치로 새 홈을 켠 사용자(키 "1")에게만 — 큐레이션 홈 맨 아래 '이전 홈으로 보기'(D24, 누르면 스위치가 꺼진다)
    return `<div class="hs-switch-link"><button type="button" class="hs-link" data-home-switch="${on ? "off" : "on"}">${esc(on ? MSG.linkOld : MSG.linkNew)}</button></div>`;
  }
  /** 안내 띠를 지금 보일까: 켠 직후 한 번(once) + 이 기기에서 ✕ 하지 않았을 때. */
  const noticeDue = (st, justEnabled) => justEnabled === true && get(st, NOTICE_KEY) !== "1";
  const dismissNotice = (st) => set(st, NOTICE_KEY, "1");
  return { KEY, NOTICE_KEY, ONCE_KEY, MSG, read, write, effective, rowHtml, noticeHtml, linkHtml, noticeDue, dismissNotice };
});
