/*
 * household-view — 가구(가족 캘린더) 화면의 문구·마크업·목록 병합 (B3 1단계: 순수 함수만).
 * 설계: docs/한눈육아-확장설계-2단계-상세.md §2(생명주기), §11-2(실패 표시), §2-4(가구 코드=마스터 키). 문구는 사용자가 승인한 B3 문구 목록(D5)을 그대로 쓴다.
 *
 * 원칙
 *   - DOM·Firestore·localStorage·다른 모듈에 의존하지 않는다. 문자열(HTML)만 만들고, 이벤트 연결·저장은 app.js 가 한다(B3 2단계).
 *   - 플래그가 꺼져 있으면(state.enabled !== true) 모든 render* 는 빈 문자열 "" 을 돌려준다 → 기존 화면에 아무것도 추가되지 않는다.
 *     예외: renderBetaSwitch / renderBetaSwitchLanding — 플래그를 켜고 끄는 스위치라서 꺼져 있을 때도 그린다(enabled 는 "지금 켜져 있는지"를 뜻한다).
 *   - 가구 코드·이름 같은 동적 값은 전부 이스케이프한다. 코드를 아이 문서에 쓰지 않는다(R1) — 이 모듈은 쓰기 자체를 하지 않는다.
 *   - 버튼은 data-hh-action 속성으로 의도를 표시한다(create · confirm-create · cancel-create · copy · reissue · confirm-reissue · cancel-reissue).
 *     베타 스위치 버튼은 data-beta-action(ask-on · confirm-on · ask-off · confirm-off · cancel).
 */
(function (root, factory) {
  const mod = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = mod;
  else root.HouseholdView = mod;
})(typeof window !== "undefined" ? window : global, function () {
  "use strict";

  // 승인된 문구(번호는 B3 문구 목록의 #). 바꾸려면 사용자 확인이 필요하다.
  const MSG = Object.freeze({
    sectionTitle: "가족 캘린더", // #1
    noHouseholdDesc: "아이와 가족 일정을 가족이 함께 볼 수 있어요.", // #2
    createButton: "가족 캘린더 만들기", // #3
    consentTitle: "가족 캘린더를 만들까요?", // #4
    consentBody: (name) => `가족 코드 8자리가 만들어지고, 이 코드를 입력한 사람은 ${name}의 일정과 가족 일정을 모두 볼 수 있어요.\n지금 쓰는 아이 정보와 완료 기록은 바뀌지 않아요.`, // #5
    consentConfirm: "만들기", // #6
    consentCancel: "취소", // #6
    creating: "만드는 중이에요…", // #7
    created: "가족 캘린더를 만들었어요. 아래 코드로 가족을 초대해 보세요.", // #8
    codeLabel: "가족 코드", // #9
    codeInfo: "이 코드로 아이 전부와 일정을 볼 수 있어요.", // #10
    shareWarn: "이 코드를 아는 사람은 누구나 우리 가족 일정을 볼 수 있어요. 가족에게만 알려 주세요.", // #11
    copyButton: "코드 복사", // #12
    copyDone: "복사했어요.", // #13
    copyFail: "복사하지 못했어요. 코드를 길게 눌러 복사해 주세요.", // #14
    pending: (n) => `이 기기에만 저장됨 · 인터넷이 연결되면 자동으로 올라가요. (${n}건 대기)`, // #15
    flushed: "모두 저장했어요.", // #16
    denied: "지금은 서버에 저장할 수 없어요. 이 기기에만 저장돼 있어요.", // #17
    unavailable: "가족 캘린더는 준비 중이에요. 조금만 기다려 주세요.", // #18
    codeEntryHint: "코드를 입력해 주세요. (아이 코드 6자리 또는 가족 코드 8자리)", // #19 (사용자 수정 반영)
    joinInfo: "8자리 코드로 들어가면 이 가족의 아이와 일정이 모두 보여요.", // #20
    joining: "가족 캘린더를 불러오는 중이에요…", // #21
    joinOk: (n) => (n > 0 ? `가족 캘린더에 들어왔어요. 아이 ${n}명을 불러왔어요.` : "가족 캘린더에 들어왔어요. 아직 등록된 아이가 없어요."), // #22
    joinNotFound: "이 코드로 만든 가족 캘린더를 찾지 못했어요. 코드를 다시 확인해 주세요.", // #23
    failNetwork: "처리하지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.", // #25
    failDenied: "지금은 가족 캘린더를 쓸 수 없어요. 잠시 후 다시 시도해 주세요.", // #26
    switchSubHousehold: "이 기기에서 열어 본 아이와 가족 캘린더의 아이예요. 눌러서 바꿔 볼 수 있어요.", // #27
    switchSub: "이 기기에서 열어 본 아이예요. 눌러서 바꿔 볼 수 있어요.", // 기존 문구(가구 없음)
    removedChild: "(분리된 아이)", // #28
    linkedOnly: (code) => `가족 캘린더 · 아이 코드 ${code}`, // #29 (승인: 6자리 아이 코드와 8자리 가족 코드를 구분)
    switchFail: "불러오지 못했어요. 인터넷 연결을 확인해 주세요.", // #30 (기존 문구 그대로)
    reissueButton: "가족 코드 다시 만들기", // #31
    reissueTitle: "가족 코드를 다시 만들까요?", // #32
    reissueBody: "새 코드가 만들어지고, 지금 코드는 바로 쓸 수 없게 돼요.\n이미 들어와 있는 가족 기기는 그대로 쓸 수 있지만, 새로 들어올 사람은 새 코드가 필요해요.", // #33
    reissueConfirm: "다시 만들기", // #34
    reissueCancel: "취소", // #34
    reissued: "새 코드를 만들었어요. 가족에게 새 코드를 알려 주세요.", // #35
    reissueFail: "코드를 다시 만들지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.", // #36
    // 베타 켜기 스위치(승인본 — 바꾸려면 사용자 확인이 필요하다)
    betaSectionTitle: "실험 기능",
    betaItem: "가족 캘린더 (베타)",
    betaDesc: "아이와 가족 일정을 가족이 함께 볼 수 있는 기능이에요. 켜면 일정이 서버에 저장되고, 가족 코드를 아는 사람은 누구나 볼 수 있어요.",
    betaOn: "켜기",
    betaOff: "끄기",
    betaCancel: "취소",
    betaConfirmOn: "가족 캘린더(베타)를 켤까요? 켜면 이 기기에서 가족 캘린더 화면이 나타나요.",
    betaConfirmOff: "가족 캘린더를 끌까요? 가족 캘린더 화면이 숨겨져요. 저장된 일정은 지워지지 않아요.",
    betaLandingAsk: "가족 캘린더 코드(8자리)가 있나요? 베타 기능을 켜면 입력할 수 있어요.",
    betaLandingButton: "가족 캘린더(베타) 켜기",
  });

  const esc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  /** 이스케이프 후 줄바꿈만 <br> 로. */
  const lines = (s) => esc(s).replace(/\n/g, "<br>");
  const on = (state) => !!state && state.enabled === true;

  /** FEATURES 객체에서 켜짐 여부. */
  const isEnabled = (features) => !!(features && features.household === true);

  // ── 코드 입력 분류 (code-entry 하나로 아이 코드와 가족 코드를 구분 — D2) ─────────────────
  /** 6자리=아이 코드, 8자리=가족(가구) 코드, 그 밖은 invalid. 공백 제거·대문자화. */
  function classifyCode(input) {
    const code = String(input == null ? "" : input).replace(/\s+/g, "").toUpperCase();
    if (/^[A-Z0-9]{8}$/.test(code)) return { kind: "household", code };
    if (/^[A-Z0-9]{6}$/.test(code)) return { kind: "child", code };
    return { kind: "invalid", code };
  }

  // ── 아이 목록 병합 (이 기기의 목록 + 가구의 children 링크) ─────────────────────────────
  /**
   * localList: [{code, name, stage}] (hannun_children). mirror: HouseholdSync.getMirror() 결과 또는 null.
   * 규칙: 코드 기준 중복 제거 / 원본은 아이 문서이므로 이 기기의 이름·stage 가 있으면 그것을 쓴다(링크의 displayName 은 캐시)
   *       / 순서: 이 기기 목록 순서 → 가구에만 있는 아이(order 순) / 분리된(removedAt) 링크는 removed 표시 / mirror 가 없으면 입력 그대로.
   * 입력은 변경하지 않는다. 반환: [{code, name, stage, source: "local"|"household"|"both", removed, current}]
   */
  function mergeChildren(localList, mirror, activeCode) {
    const local = Array.isArray(localList) ? localList : [];
    const out = [];
    const byCode = new Map();
    for (const c of local) {
      if (!c || !c.code || byCode.has(c.code)) continue;
      const e = { code: c.code, name: c.name, stage: c.stage || "born", source: "local", removed: false, current: c.code === activeCode };
      byCode.set(c.code, e);
      out.push(e);
    }
    const links = mirror && mirror.children ? Object.entries(mirror.children).map(([key, l]) => ({ key, ...l })) : [];
    links.sort((a, b) => (a.order || 0) - (b.order || 0) || (a.addedAt || 0) - (b.addedAt || 0) || (a.key < b.key ? -1 : 1));
    for (const l of links) {
      if (!l.familyCode) continue;
      const hit = byCode.get(l.familyCode);
      if (hit) {
        hit.source = "both";
        hit.removed = hit.removed || !!l.removedAt;
        continue;
      }
      const e = { code: l.familyCode, name: l.displayName || "", stage: "born", source: "household", removed: !!l.removedAt, current: l.familyCode === activeCode };
      byCode.set(l.familyCode, e);
      out.push(e);
    }
    return out;
  }

  /** 아이 전환 시트 한 줄 설명. 기존 문구("임신 중 · 가족코드 X")를 유지하고 가구 항목만 달리 표시한다. */
  function childSubtitle(entry) {
    if (!entry) return "";
    if (entry.removed) return `${MSG.removedChild} · 가족코드 ${entry.code}`;
    if (entry.source === "household") return MSG.linkedOnly(entry.code);
    return `${entry.stage === "pregnant" ? "임신 중 · " : ""}가족코드 ${entry.code}`;
  }
  const switchSubText = (hasHousehold) => (hasHousehold ? MSG.switchSubHousehold : MSG.switchSub);

  // ── 상태/결과 → 문구 ─────────────────────────────────────────────────────────────────
  /** 가구 섹션 아래 한 줄 상태. 우선순위: 규칙 미배포(준비 중) > 쓰기 거부 > 대기열. 없으면 "". */
  function statusLine(state) {
    if (!on(state)) return "";
    if (state.rulesUnavailable) return MSG.unavailable;
    if (state.permissionDenied) return MSG.denied;
    if (state.pending > 0) return MSG.pending(state.pending);
    return "";
  }

  /** 에러(코드 속성 또는 문자열) → 생성/참여/재발급 실패 문구. */
  function failMessage(err, kind) {
    const code = err && (err.code || err.reason || err);
    if (kind === "reissue") return MSG.reissueFail;
    return code === "permission-denied" ? MSG.failDenied : MSG.failNetwork;
  }

  /** joinHousehold 결과 → 문구. 현재 API 는 없는 코드와 비활성 코드를 모두 "not-found" 로 돌려주므로 둘 다 #23 하나로 안내한다(#24 는 쓰지 않는다). */
  function joinMessage(result) {
    if (!result) return MSG.failNetwork;
    if (result.ok) return MSG.joinOk(result.mirror ? Object.values(result.mirror.children || {}).filter((c) => !c.removedAt).length : 0);
    if (result.reason === "not-found" || result.reason === "inactive") return MSG.joinNotFound;
    if (result.reason === "permission-denied") return MSG.failDenied;
    return MSG.failNetwork;
  }

  // ── 마크업 ───────────────────────────────────────────────────────────────────────────
  const btn = (action, label, cls) => `<button type="button" class="hh-btn${cls ? " " + cls : ""}" data-hh-action="${action}">${esc(label)}</button>`;
  const note = (text, cls) => (text ? `<p class="hh-note${cls ? " " + cls : ""}">${esc(text)}</p>` : "");

  /** 알림 한 줄(생성 완료·복사·재발급·실패). state.notice = {kind, text?} */
  function renderNotice(n) {
    if (!n) return "";
    const map = { created: [MSG.created, ""], copied: [MSG.copyDone, ""], copyFailed: [MSG.copyFail, "hh-warn"], reissued: [MSG.reissued, ""], flushed: [MSG.flushed, ""], error: [n.text || MSG.failNetwork, "hh-warn"] };
    const m = map[n.kind];
    return m ? note(m[0], m[1]) : "";
  }

  /**
   * 프로필 시트의 "가족 캘린더" 섹션.
   * state: { enabled, view: "none"|"consent"|"creating"|"active"|"reissue-confirm"|"reissuing", childName, code,
   *          pending, permissionDenied, rulesUnavailable, notice }
   * 플래그 OFF → "". 규칙 미배포 → 제목 + "준비 중" 한 줄만(버튼·코드 없음).
   */
  function renderSection(state) {
    if (!on(state)) return "";
    const head = `<h4 class="hh-title">${esc(MSG.sectionTitle)}</h4>`;
    if (state.rulesUnavailable) return `<section class="hh-section" data-hh="unavailable">${head}${note(MSG.unavailable)}</section>`;
    const status = note(statusLine(state), "hh-status");
    const notice = renderNotice(state.notice);
    let body = "";
    switch (state.view) {
      case "consent":
        body = `<p class="hh-consent-title">${esc(MSG.consentTitle)}</p><p class="hh-consent-body">${lines(MSG.consentBody(state.childName || "아이"))}</p>
          <div class="hh-actions">${btn("confirm-create", MSG.consentConfirm, "hh-primary")}${btn("cancel-create", MSG.consentCancel)}</div>`;
        break;
      case "creating":
        body = note(MSG.creating);
        break;
      case "reissue-confirm":
        body = `<p class="hh-consent-title">${esc(MSG.reissueTitle)}</p><p class="hh-consent-body">${lines(MSG.reissueBody)}</p>
          <div class="hh-actions">${btn("confirm-reissue", MSG.reissueConfirm, "hh-primary")}${btn("cancel-reissue", MSG.reissueCancel)}</div>`;
        break;
      case "reissuing":
        body = note(MSG.creating);
        break;
      case "active":
        body = `<div class="hh-code-box"><span class="hh-code-label">${esc(MSG.codeLabel)}</span><strong class="hh-code">${esc(state.code)}</strong></div>
          ${note(MSG.codeInfo)}${note(MSG.shareWarn, "hh-warn")}
          <div class="hh-actions">${btn("copy", MSG.copyButton)}${btn("reissue", MSG.reissueButton)}</div>`;
        break;
      default: // "none"
        body = `${note(MSG.noHouseholdDesc)}<div class="hh-actions">${btn("create", MSG.createButton, "hh-primary")}</div>`;
    }
    return `<section class="hh-section" data-hh="${esc(state.view || "none")}">${head}${notice}${body}${status}</section>`;
  }

  // ── 베타 켜기 스위치 (플래그와 무관하게 항상 그린다 — 이 두 함수만 OFF 에서도 렌더되는 예외) ──────────
  const betaBtn = (action, label, cls) => `<button type="button" class="hh-btn${cls ? " " + cls : ""}" data-beta-action="${action}">${esc(label)}</button>`;

  /**
   * 프로필 시트의 "실험 기능" 섹션. state: { enabled, confirming } — enabled = 지금 켜져 있는지, confirming = 켜기/끄기 확인 단계인지.
   * 이 함수는 저장·이동을 하지 않는다. 버튼 의도(data-beta-action)만 표시하고 처리는 app.js 가 한다.
   */
  function renderBetaSwitch(state) {
    const enabled = !!state && state.enabled === true;
    const confirming = !!state && state.confirming === true;
    const head = `<h4 class="hh-title">${esc(MSG.betaSectionTitle)}</h4>`;
    let body;
    if (confirming) {
      body = `<p class="hh-consent-title">${esc(enabled ? MSG.betaConfirmOff : MSG.betaConfirmOn)}</p>
          <div class="hh-actions">${betaBtn(enabled ? "confirm-off" : "confirm-on", enabled ? MSG.betaOff : MSG.betaOn, "hh-primary")}${betaBtn("cancel", MSG.betaCancel)}</div>`;
    } else {
      body = `<p class="hh-consent-title">${esc(MSG.betaItem)}</p>${note(MSG.betaDesc)}
          <div class="hh-actions">${betaBtn(enabled ? "ask-off" : "ask-on", enabled ? MSG.betaOff : MSG.betaOn, enabled ? "" : "hh-primary")}</div>`;
    }
    return `<section class="hh-section" data-beta="${confirming ? "confirm-" + (enabled ? "off" : "on") : enabled ? "on" : "off"}">${head}${body}</section>`;
  }

  /** 가족코드 입력 화면의 한 줄 변형. 켜져 있으면 "" (이미 켜져 있으면 코드 입력 안내가 따로 나온다). 켜기 확인 단계는 위와 같은 문구를 쓴다. */
  function renderBetaSwitchLanding(state) {
    const enabled = !!state && state.enabled === true;
    const confirming = !!state && state.confirming === true;
    if (enabled) return "";
    if (confirming) {
      return `<div class="hh-landing" data-beta="confirm-on"><p class="hh-consent-title">${esc(MSG.betaConfirmOn)}</p>
          <div class="hh-actions">${betaBtn("confirm-on", MSG.betaOn, "hh-primary")}${betaBtn("cancel", MSG.betaCancel)}</div></div>`;
    }
    return `<div class="hh-landing" data-beta="off">${note(MSG.betaLandingAsk)}<div class="hh-actions">${betaBtn("ask-on", MSG.betaLandingButton)}</div></div>`;
  }

  /** code-entry 화면의 입력 안내(#19 + #20). 플래그 OFF → "" (기존 화면 유지). */
  function renderCodeEntryHint(state) {
    if (!on(state)) return "";
    return `<p class="hh-note">${esc(MSG.codeEntryHint)}</p><p class="hh-note">${esc(MSG.joinInfo)}</p>`;
  }

  return { MSG, isEnabled, classifyCode, mergeChildren, childSubtitle, switchSubText, statusLine, failMessage, joinMessage, renderNotice, renderSection, renderCodeEntryHint, renderBetaSwitch, renderBetaSwitchLanding };
});
