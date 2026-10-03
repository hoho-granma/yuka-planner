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
    codeLabelAcct: "가족코드(8자리)", // 계정 모드: 코드는 가족코드 하나뿐(H1)
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
    linkButton: "이 아이를 가족 캘린더에 연결", // 참여 후 현재 아이 연결
    linkTitle: (name) => `${name}을(를) 가족 캘린더에 연결할까요?`,
    linkBody: "가족 모두 이 아이의 일정을 함께 볼 수 있어요.",
    linkConfirm: "연결하기",
    linkCancel: "취소",
    linkDone: "가족 캘린더에 연결했어요.",
    linkJoinHint: "이 기기의 아이를 가족 캘린더에 연결할 수 있어요.",
    leaveButton: "이 기기에서 가족 캘린더 나가기", // N6
    leaveTitle: "이 기기에서 가족 캘린더를 나갈까요?",
    leaveBody: "나가면 이 기기에서 가족 일정이 보이지 않아요. 가족의 일정과 아이 정보는 지워지지 않고, 가족 코드로 다시 참여할 수 있어요.",
    leavePending: (n) => `아직 서버에 보내지 못한 변경 ${n}건은 나가면 사라져요.`,
    leaveConfirm: "나가기",
    leaveConfirmPending: "그래도 나가기",
    leaveCancel: "취소",
    left: "이 기기에서 가족 캘린더를 나왔어요.",
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
    betaLandingAsk: "가족코드(8자리)가 있나요? 베타 기능을 켜면 입력할 수 있어요.",
    betaLandingButton: "가족 캘린더(베타) 켜기",
    // 가족 코드로 참여 · 시작 안내 · 아이 전환(핫픽스, 승인본)
    startHint: "시작하려면 가족 캘린더를 만들거나, 가족에게 받은 코드로 참여하세요.",
    joinDesc: "가족이 만든 가족 캘린더가 있나요? 받은 코드 8자리를 입력하면 일정을 함께 볼 수 있어요.",
    joinPlaceholder: "가족 코드 8자리",
    joinButton: "참여하기",
    switchChildButton: "아이 전환",
    // 구성원(B6-lite, 승인본 — 바꾸려면 사용자 확인이 필요하다)
    memTitle: "구성원",
    memNote: "구성원 이름은 일정에 보여 주는 표시용이에요. 본인 확인은 아니에요.",
    memAdd: "구성원 추가",
    memEdit: "수정",
    memDelete: "삭제",
    memSave: "저장",
    memCancel: "취소",
    memNameLabel: "이름",
    memNamePlaceholderAcct: "이름 (선택)",
    memTitleAcct: "가족 구성원",
    memNoteAcct: "가족코드를 받은 사람이 가입할 때 아직 가입하지 않은 자리를 고르면 역할이 자동으로 정해져요. 이름은 일정에 보여 주는 표시용이에요.",
    memMe: "나",
    memChildTitle: "아이",
    memChildRemove: "빼기",
    memNamePlaceholder: "이름 (예: 이모님, 할머니)",
    memRoleLabel: "역할",
    memErrRole: "역할을 골라 주세요.",
    memErrEmpty: "이름을 입력해 주세요.",
    memErrLong: "이름은 20자까지 입력할 수 있어요.",
    memMax: "구성원은 8명까지 추가할 수 있어요.",
    memDeleteTitle: "구성원을 삭제할까요?",
    memDeleteBody: "이 사람이 맡은 일정은 남고 담당은 “(삭제된 담당자)”로 보여요.", // G6: 캘린더 칩 지우기 확인과 같은 문구
    deviceUserLabel: "이 기기를 쓰는 사람",
    deviceUserNote: "이 기기에서 새 일정을 만들 때 담당이 자동으로 정해져요. 표시용이고 본인 확인은 아니에요. 이 기기에만 저장돼요.",
    deviceUserNone: "선택 안 함",
  });
  /** 역할 → 표시명(칩 라벨 겸용). 규칙(firestore.rules members)의 role 값과 같은 5종. */
  const ROLE_NAMES = Object.freeze({ MOM: "엄마", DAD: "아빠", GRANDPARENT: "조부모", CAREGIVER: "돌봄 선생님", OTHER: "기타" });
  const ROLES = Object.freeze(Object.keys(ROLE_NAMES));
  // 계정 모드(H2) 구성원 추가 폼의 역할 선택지. 화면 키 → 저장 role(+기본 이름). 할머니·할아버지는 둘 다 GRANDPARENT 이고 label 로 구분한다.
  const FORM_ROLES = Object.freeze([["MOM", "엄마", "MOM"], ["DAD", "아빠", "DAD"], ["CHILD", "아이(자녀)", "CHILD"], ["CAREGIVER", "이모님·돌봄", "CAREGIVER"], ["GRANDMA", "할머니", "GRANDPARENT"], ["GRANDPA", "할아버지", "GRANDPARENT"], ["OTHER", "기타", "OTHER"]]);
  const DEFAULT_LABEL = Object.freeze({ MOM: "엄마", DAD: "아빠", CHILD: "아이", CAREGIVER: "이모님", GRANDMA: "할머니", GRANDPA: "할아버지", OTHER: "가족" });
  /** 이름에서 역할 추정(역할을 아직 고르지 않았을 때): 할머니·할아버지·엄마·아빠·이모·아이 등. 못 정하면 "". */
  function inferRoleFromName(name) {
    const n = String(name || "").replace(/\s+/g, "");
    if (/할아버지|할아부지/.test(n)) return "GRANDPA";
    if (/할머니|할무니/.test(n)) return "GRANDMA";
    if (/아빠|아버지|아버님/.test(n)) return "DAD";
    if (/엄마|어머니|어머님/.test(n)) return "MOM";
    if (/이모|돌봄|선생님|도우미|시터/.test(n)) return "CAREGIVER";
    if (/아이|딸|아들/.test(n)) return "CHILD";
    return "";
  }
  /** 저장된 구성원 → 폼 역할 키(GRANDPARENT 는 이름에 '할아버지'가 있으면 할아버지, 아니면 할머니). */
  function formRoleOf(m) {
    if (m && m.role === "GRANDPARENT") return /할아버지|할아부지|외할아버지/.test(m.label || "") ? "GRANDPA" : "GRANDMA";
    return m && FORM_ROLES.some((r) => r[0] === m.role) ? m.role : "OTHER";
  }
  const roleLabelOf = (m) => (m && m.role === "GRANDPARENT" ? (formRoleOf(m) === "GRANDPA" ? "할아버지" : "할머니") : ROLE_NAMES[m && m.role] || (m && m.role === "CHILD" ? "아이(자녀)" : ROLE_NAMES.OTHER));
  const MEMBER_MAX = 8; // UI 상한(규칙에는 없다)
  const MEMBER_NAME_MAX = 20; // 규칙: label.size() <= 20

  const esc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  /** 이스케이프 후 줄바꿈만 <br> 로. */
  const lines = (s) => esc(s).replace(/\n/g, "<br>");
  const on = (state) => !!state && state.enabled === true;

  /** FEATURES 객체에서 켜짐 여부. */
  const isEnabled = (features) => !!(features && features.household === true);

  // ── 코드 입력 분류 (code-entry 하나로 아이 코드와 가족 코드를 구분 — D2) ─────────────────
  /** 6자리=아이 코드, 8자리=가족(가구) 코드, 그 밖은 invalid. 공백 제거·대문자화. */
  function classifyCode(input, opts) {
    const code = String(input == null ? "" : input).replace(/\s+/g, "").toUpperCase();
    // 계정 모드(H1): 코드는 8자리 가족코드 하나뿐이다. 아이 기록 코드는 화면에 나오지 않는다.
    if (opts && opts.accounts === true) return /^[A-Z0-9]{8}$/.test(code) ? { kind: "household", code } : { kind: "invalid", code };
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
  function childSubtitle(entry, opts) {
    if (!entry) return "";
    if (opts && opts.accounts === true) return entry.removed ? MSG.removedChild : entry.stage === "pregnant" ? "임신 중" : ""; // 계정 모드: 아이 기록 코드는 보이지 않는다(H1)
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
  /** 이 코드의 아이가 가구 링크 목록에 이미 있는가(분리된 링크 포함 — 같은 코드로 링크를 또 만들지 않는다). */
  function isChildLinked(mirror, familyCode) {
    const ch = mirror && mirror.children ? Object.values(mirror.children) : [];
    return ch.some((l) => l && l.familyCode === familyCode);
  }
  /** 프로필 시트 가족 캘린더에 '이 아이를 가족 캘린더에 연결'을 보일지: 가구 활성 · 현재 아이 코드가 있음 · 아직 링크 없음 · 임신 중 아님. */
  const canLinkCurrentChild = (o) => !!o && o.hasHousehold === true && !!o.familyCode && o.pregnant !== true && !isChildLinked(o.mirror, o.familyCode);

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
    const map = { joinOk: [n.text || "", ""], created: [MSG.created, ""], copied: [MSG.copyDone, ""], copyFailed: [MSG.copyFail, "hh-warn"], reissued: [MSG.reissued, ""], left: [MSG.left, ""], linked: [MSG.linkDone, ""], flushed: [MSG.flushed, ""], error: [n.text || MSG.failNetwork, "hh-warn"] };
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
      case "joining":
        body = note(MSG.joining);
        break;
      case "reissue-confirm":
        body = `<p class="hh-consent-title">${esc(MSG.reissueTitle)}</p><p class="hh-consent-body">${lines(MSG.reissueBody)}</p>
          <div class="hh-actions">${btn("confirm-reissue", MSG.reissueConfirm, "hh-primary")}${btn("cancel-reissue", MSG.reissueCancel)}</div>`;
        break;
      case "reissuing":
        body = note(MSG.creating);
        break;
      case "link-confirm":
        body = `<p class="hh-consent-title">${esc(MSG.linkTitle(state.childName || "아이"))}</p><p class="hh-consent-body">${lines(MSG.linkBody)}</p>
          <div class="hh-actions">${btn("confirm-link-child", MSG.linkConfirm, "hh-primary")}${btn("cancel-link-child", MSG.linkCancel)}</div>`;
        break;
      case "leave-confirm": {
        const pend = state.pending > 0 ? note(MSG.leavePending(state.pending), "hh-warn") : "";
        body = `<p class="hh-consent-title">${esc(MSG.leaveTitle)}</p><p class="hh-consent-body">${lines(MSG.leaveBody)}</p>${pend}
          <div class="hh-actions">${btn("confirm-leave", state.pending > 0 ? MSG.leaveConfirmPending : MSG.leaveConfirm, "hh-danger")}${btn("cancel-leave", MSG.leaveCancel)}</div>`;
        break;
      }
      case "active":
        body = `<div class="hh-code-box"><span class="hh-code-label">${esc(state.acctMode ? MSG.codeLabelAcct : MSG.codeLabel)}</span><strong class="hh-code">${esc(state.code)}</strong></div>
          ${note(MSG.codeInfo)}${note(MSG.shareWarn, "hh-warn")}
          <div class="hh-actions">${btn("copy", MSG.copyButton)}${btn("reissue", MSG.reissueButton)}</div>
          ${state.canLinkChild === true ? `<div class="hh-actions">${btn("link-child", MSG.linkButton)}</div>` : ""}
          ${state.hideLeave === true ? "" : `<div class="hh-actions">${btn("leave", MSG.leaveButton, "hh-danger")}</div>`}`;
        break;
      default: // "none"
        body = `${note(MSG.startHint)}${note(MSG.noHouseholdDesc)}<div class="hh-actions">${btn("create", MSG.createButton, "hh-primary")}</div>
          <div class="hh-join"><p class="hh-note">${esc(MSG.joinDesc)}</p>
          <input type="text" class="hh-input" data-hh-input="join-code" maxlength="8" inputmode="latin" autocapitalize="characters" autocomplete="off" spellcheck="false" placeholder="${esc(MSG.joinPlaceholder)}" value="${esc(state.joinInput || "")}" />
          <div class="hh-actions">${btn("join", MSG.joinButton, "hh-primary")}</div></div>`;
    }
    // 아이 전환 진입점(핫픽스): 가구가 있거나 이 기기 아이가 2명 이상일 때 app.js 가 showChildSwitch 를 켠다. 확인·입력 단계에서는 숨긴다.
    const canSwitch = state.showChildSwitch === true && ["none", "active"].includes(state.view || "none");
    const switchRow = canSwitch ? `<div class="hh-actions">${btn("child-switch", MSG.switchChildButton)}</div>` : "";
    return `<section class="hh-section" data-hh="${esc(state.view || "none")}">${head}${notice}${body}${switchRow}${status}</section>`;
  }

  // ── 구성원(B6-lite): 이름·역할 관리와 "이 기기를 쓰는 사람" 지정 (순수 함수) ─────────────────────────
  /** 삭제되지 않은 구성원을 order → 이름 순으로. 입력은 [{memberId, role, label, order, deletedAt?}] (미러 members 를 펼친 것). 입력은 바꾸지 않는다. */
  function visibleMembers(members) {
    return (Array.isArray(members) ? members : [])
      .filter((m) => m && m.memberId && !m.deletedAt)
      .slice()
      .sort((x, y) => (x.order || 0) - (y.order || 0) || String(x.label || "").localeCompare(String(y.label || "")) || (x.memberId < y.memberId ? -1 : 1));
  }
  /** 새 구성원의 order: 기존 최댓값 + 1(삭제된 구성원 포함 — 순서가 겹치지 않게). */
  const nextMemberOrder = (members) => (Array.isArray(members) ? members : []).reduce((mx, m) => Math.max(mx, (m && m.order) || 0), 0) + 1;
  /** 이 기기 사용자로 저장된 id 가 지금 구성원 목록(삭제 제외)에 있으면 그 id, 아니면 "" (미지정). */
  const activeMemberOf = (members, id) => (id && visibleMembers(members).some((m) => m.memberId === id) ? id : "");
  /** 폼 검증: 이름은 공백 제거 후 1~20자, 역할은 5종 중 하나. { ok, label, role, error } — error 는 승인 문구. */
  function validateMemberForm(form, opts) {
    if (opts && opts.accounts === true) { // 계정 모드: 이름은 선택(비우면 역할 이름), 역할은 FORM_ROLES 키
      const typed = String((form && form.label) == null ? "" : form.label).trim();
      const key = form && form.role ? form.role : inferRoleFromName(typed); // 역할을 고르지 않았으면 이름으로 추정, 그래도 모르면 고르게 한다(기본값 없음)
      const f = FORM_ROLES.find((r) => r[0] === key);
      if (!f) return { ok: false, label: typed, role: null, error: MSG.memErrRole };
      const label = typed || DEFAULT_LABEL[f[0]];
      if (label.length > MEMBER_NAME_MAX) return { ok: false, label, role: f[2], error: MSG.memErrLong };
      return { ok: true, label, role: f[2], error: null };
    }
    const label = String((form && form.label) == null ? "" : form.label).trim();
    const role = form && ROLES.includes(form.role) ? form.role : null;
    if (!label) return { ok: false, label, role, error: MSG.memErrEmpty };
    if (label.length > MEMBER_NAME_MAX) return { ok: false, label, role, error: MSG.memErrLong };
    if (!role) return { ok: false, label, role, error: MSG.failNetwork };
    return { ok: true, label, role, error: null };
  }
  const mchip = (attrs, label, active) => `<button type="button" class="hh-chip${active ? " active" : ""}" ${attrs}>${esc(label)}</button>`;

  /**
   * 프로필 시트의 "구성원" 영역(가구가 있을 때만). state: { enabled, hasHousehold, members, activeMemberId, view: "list"|"form"|"delete", form, deleteId, saving }
   *   saving === true 이면 저장·삭제 확인 버튼이 잠긴다(중복 클릭 방지).
   *   form = { memberId|null, role, label, error|null } / deleteId = 삭제 확인 중인 구성원.
   * 플래그 OFF 또는 가구 없음 → "". 이 함수는 저장하지 않는다(버튼 의도는 data-mem-action).
   */
  function renderMembers(state) {
    if (!on(state) || state.hasHousehold !== true) return "";
    const list = visibleMembers(state.members);
    const activeId = activeMemberOf(list, state.activeMemberId);
    const head = `<h4 class="hh-title">${esc(state.acctMode === true ? MSG.memTitleAcct : MSG.memTitle)}</h4>${note(state.acctMode === true ? MSG.memNoteAcct : MSG.memNote)}`;
    const roleName = (r) => ROLE_NAMES[r] || ROLE_NAMES.OTHER;
    const acctMode = state.acctMode === true;
    const rn = (m) => (acctMode ? roleLabelOf(m) : roleName(m.role));
    let body;
    if (state.view === "delete") {
      const m = list.find((x) => x.memberId === state.deleteId);
      body = m
        ? `<p class="hh-consent-title">${esc(MSG.memDeleteTitle)}</p><p class="hh-consent-body">${esc(m.label)} · ${esc(rn(m))}</p>${note(MSG.memDeleteBody)}
          <div class="hh-actions"><button type="button" class="hh-btn hh-primary" data-mem-action="confirm-delete" data-member-id="${esc(m.memberId)}"${state.saving === true ? " disabled" : ""}>${esc(MSG.memDelete)}</button><button type="button" class="hh-btn" data-mem-action="cancel">${esc(MSG.memCancel)}</button></div>`
        : "";
    } else if (state.view === "form" && state.form) {
      const f = state.form;
      body = `<div class="hh-field"><label>${esc(MSG.memNameLabel)}</label><input type="text" class="hh-input" data-mem-input="label" maxlength="${MEMBER_NAME_MAX}" placeholder="${esc(acctMode ? MSG.memNamePlaceholderAcct : MSG.memNamePlaceholder)}" value="${esc(f.label || "")}" /></div>
          <div class="hh-field"><label>${esc(MSG.memRoleLabel)}</label><div class="hh-chips">${(acctMode ? FORM_ROLES.map((r) => [r[0], r[1]]) : ROLES.map((r) => [r, ROLE_NAMES[r]])).map(([k, n]) => mchip(`data-mem-role="${k}"`, n, f.role === k)).join("")}</div></div>
          ${f.error ? `<p class="hh-note hh-warn">${esc(f.error)}</p>` : ""}
          <div class="hh-actions"><button type="button" class="hh-btn hh-primary" data-mem-action="save"${state.saving === true ? " disabled" : ""}>${esc(MSG.memSave)}</button><button type="button" class="hh-btn" data-mem-action="cancel">${esc(MSG.memCancel)}</button></div>`;
    } else {
      const device = acctMode ? "" : `<div class="hh-field"><label>${esc(MSG.deviceUserLabel)}</label><div class="hh-chips">${list.map((m) => mchip(`data-mem-action="set-active" data-member-id="${esc(m.memberId)}"`, m.label, m.memberId === activeId)).join("")}${mchip('data-mem-action="clear-active"', MSG.deviceUserNone, !activeId)}</div>${note(MSG.deviceUserNote)}</div>`;
      const rows = list
        .map((m) => {
          const isMe = acctMode && state.meId && m.memberId === state.meId;
          const del = isMe ? "" : `<button type="button" class="hh-btn hh-small" data-mem-action="ask-delete" data-member-id="${esc(m.memberId)}">${esc(MSG.memDelete)}</button>`;
          return `<li class="hh-member" data-member-id="${esc(m.memberId)}"><span class="hh-member-name">${esc(isMe && state.meName ? state.meName : m.label)}${isMe ? ` (${esc(MSG.memMe)})` : ""}</span><span class="hh-member-role">${esc(rn(m))}</span>
            <button type="button" class="hh-btn hh-small" data-mem-action="edit" data-member-id="${esc(m.memberId)}">${esc(MSG.memEdit)}</button>${del}</li>`;
        })
        .join("");
      const kids = acctMode && Array.isArray(state.children) && state.children.length
        ? `<h4 class="hh-title">${esc(MSG.memChildTitle)}</h4><ul class="hh-members">${state.children.map((c) => `<li class="hh-member" data-child-key="${esc(c.childKey)}"><span class="hh-member-name">${esc(c.displayName || "")}</span><button type="button" class="hh-btn hh-small" data-mem-action="ask-remove-child" data-member-id="${esc(c.childKey)}">${esc(MSG.memChildRemove)}</button></li>`).join("")}</ul>`
        : "";
      const add = acctMode ? "" : list.length >= MEMBER_MAX ? note(MSG.memMax) : `<div class="hh-actions"><button type="button" class="hh-btn" data-mem-action="add">${esc(MSG.memAdd)}</button></div>`;
      body = `${device}<ul class="hh-members">${rows}</ul>${add}${kids}`;
    }
    return `<section class="hh-section" data-mem="${esc(state.view || "list")}">${head}${body}</section>`;
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


  // ── 온보딩 가족 단계(첫 아이 입력 직후): 순수 판정·렌더. 새 문구라 사용자 승인 전 제안안이다. ─────────────────────
  const ONB_MSG = Object.freeze({
    offerTitle: "가족 캘린더를 만들어 볼까요?",
    offerBody: "가족과 일정을 함께 보고 나눠 쓸 수 있어요.\n지금 만들지 않아도 나중에 프로필에서 만들 수 있어요.",
    offerCreate: "만들어 볼게요",
    offerLater: "나중에",
    namesTitle: "가족 이름을 정해 주세요",
    namesBody: "일정에 표시될 이름이에요. 그대로 써도 돼요.",
    momLabel: "엄마 이름",
    dadLabel: "아빠 이름",
    meLabel: "이 기기를 쓰는 사람",
    meNone: "선택 안 함",
    namesSave: "저장",
    namesSkip: "그대로 쓸게요",
    codeTitle: "가족 캘린더가 만들어졌어요",
    codeBody: "가족에게 이 코드를 알려 주면 함께 쓸 수 있어요.",
    done: "완료",
  });

  /** 첫 아이 입력 직후 가족 단계를 보여줄지: 플래그 ON · 가구 없음 · 첫 아이(이전에 저장된 아이 없음) · 아직 안 봄. */
  const shouldOfferOnboarding = (o) => !!o && o.enabled === true && !o.hasHousehold && o.hadChildren === false && !o.seen;

  /**
   * 기본 구성원(MOM·DAD) 이름 입력 → 바꿀 것만 골라낸다. 입력이 비면 현재 이름을 유지한다.
   * { ok, error, updates:[{memberId, role, label}] } — 검증은 validateMemberForm(1~20자)과 같다.
   */
  function onboardingNameUpdates(members, input) {
    const vis = visibleMembers(members);
    const updates = [];
    for (const role of ["MOM", "DAD"]) {
      const m = vis.find((x) => x.role === role);
      if (!m) continue;
      const typed = String((input && input[role]) == null ? "" : input[role]).trim();
      const label = typed || m.label;
      const v = validateMemberForm({ label, role });
      if (!v.ok) return { ok: false, error: v.error, updates: [] };
      if (v.label !== m.label) updates.push({ memberId: m.memberId, role, label: v.label });
    }
    return { ok: true, error: null, updates };
  }

  /** state: { step: "offer"|"creating"|"names"|"code", code, mom, dad, me: "MOM"|"DAD"|"", error, saving } */
  function renderOnboarding(state) {
    const st = state || {};
    const act = (a, label, cls) => `<button type="button" class="hh-btn${cls ? " " + cls : ""}" data-onb-action="${a}"${st.saving === true ? " disabled" : ""}>${esc(label)}</button>`;
    let body;
    switch (st.step) {
      case "creating":
        body = note(MSG.creating);
        break;
      case "names":
        body = `<p class="hh-consent-title">${esc(ONB_MSG.namesTitle)}</p>${note(ONB_MSG.namesBody)}
          <div class="hh-field"><label>${esc(ONB_MSG.momLabel)}</label><input type="text" class="hh-input" data-onb-input="MOM" maxlength="${MEMBER_NAME_MAX}" value="${esc(st.mom == null ? "엄마" : st.mom)}" /></div>
          <div class="hh-field"><label>${esc(ONB_MSG.dadLabel)}</label><input type="text" class="hh-input" data-onb-input="DAD" maxlength="${MEMBER_NAME_MAX}" value="${esc(st.dad == null ? "아빠" : st.dad)}" /></div>
          <div class="hh-field"><label>${esc(ONB_MSG.meLabel)}</label><div class="hh-chips">${[["", ONB_MSG.meNone], ["MOM", ROLE_NAMES.MOM], ["DAD", ROLE_NAMES.DAD]].map(([v, l]) => `<button type="button" class="hh-chip${(st.me || "") === v ? " active" : ""}" data-onb-me="${v}">${esc(l)}</button>`).join("")}</div></div>
          ${st.error ? note(st.error, "hh-warn") : ""}
          <div class="hh-actions">${act("save-names", ONB_MSG.namesSave, "hh-primary")}${act("skip-names", ONB_MSG.namesSkip)}</div>`;
        break;
      case "code":
        body = `<p class="hh-consent-title">${esc(ONB_MSG.codeTitle)}</p>${note(ONB_MSG.codeBody)}
          <div class="hh-code-box"><span class="hh-code-label">${esc(MSG.codeLabel)}</span><strong class="hh-code">${esc(st.code)}</strong></div>
          <div class="hh-actions">${act("copy", MSG.copyButton)}${act("done", ONB_MSG.done, "hh-primary")}</div>`;
        break;
      default: // "offer"
        body = `<p class="hh-consent-title">${esc(ONB_MSG.offerTitle)}</p><p class="hh-consent-body">${lines(ONB_MSG.offerBody)}</p>
          ${st.error ? note(st.error, "hh-warn") : ""}
          <div class="hh-actions">${act("create", ONB_MSG.offerCreate, "hh-primary")}${act("later", ONB_MSG.offerLater)}</div>`;
    }
    return `<section class="hh-section" data-onb="${esc(st.step || "offer")}">${body}</section>`;
  }

  return { MSG, isChildLinked, canLinkCurrentChild, isEnabled, classifyCode, formRoleOf, inferRoleFromName, roleLabelOf, FORM_ROLES, mergeChildren, childSubtitle, switchSubText, statusLine, failMessage, joinMessage, renderNotice, renderSection, renderCodeEntryHint, renderBetaSwitch, renderBetaSwitchLanding, ROLE_NAMES, ROLES, MEMBER_MAX, MEMBER_NAME_MAX, visibleMembers, nextMemberOrder, activeMemberOf, validateMemberForm, renderMembers, ONB_MSG, shouldOfferOnboarding, onboardingNameUpdates, renderOnboarding };
});
