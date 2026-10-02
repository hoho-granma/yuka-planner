/*
 * 계정(D1) 화면 — 순수 문자열·검증. DOM·저장소·네트워크를 쓰지 않는다. 새 문구는 사용자 승인 전 제안안이다.
 * 가입 폼 값(form)은 app.js 가 들고 있고, 이 모듈은 검증(validateSignup)과 마크업만 만든다.
 *   form = { email, password, displayName, situation: "HAS_CHILD"|"EXPECTING", role, familyCode, province, district }  (D5: 아이 정보·기관은 가입에서 받지 않는다)
 * 서버 연결(accounts 문서·가구 생성/합류)은 D2 — 여기서는 가입 의도(intent)만 만든다.
 */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else root.AccountView = factory();
})(typeof window !== "undefined" ? window : global, function () {
  "use strict";

  const MSG = Object.freeze({
    logo: "한눈육아",
    landingTitle: "우리 아이 일정, 놓치지 않게",
    landingSub: "접종·검진·지원금을 아이 월령에 맞춰 자동으로 챙기고, 가족과 한 캘린더로 함께 관리해요.",
    landingLead: "가족이 함께 쓰려면 회원가입해 주세요.",
    landingNote: "계정 없이 아래에서 바로 시작할 수도 있어요.",
    entryFine: "회원가입 없이도 바로 시작할 수 있어요. 가족과 함께 쓰거나 다른 기기에서 이어 보려면 위에서 회원가입해 주세요.",
    signupLead: "가족이 함께 쓰려면 회원가입해 주세요.",
    signup: "회원가입",
    login: "로그인",
    logout: "로그아웃",
    cancel: "취소",
    close: "닫기",
    signupTitle: "회원가입",
    loginTitle: "로그인",
    emailLabel: "이메일",
    passwordLabel: "비밀번호 (8자 이상)",
    forgot: "비밀번호를 잊으셨나요?",
    resetTitle: "비밀번호 재설정",
    resetBody: "가입한 이메일로 재설정 메일을 보내 드려요.",
    resetSend: "재설정 메일 보내기",
    situationLabel: "현재 출생한 자녀가 있나요?",
    situationYes: "있어요",
    situationNo: "없어요",
    roleLabel: "가입하는 사람",
    regionLabel: "사는 지역 (선택)",
    provincePlaceholder: "시·도",
    districtPlaceholder: "시·군·구",
    regionHint: "📍 사는 지역(시·도, 시·군·구)을 알려 주시면 우리 동네 육아 지원금·혜택을 자동으로 찾아 캘린더에 표시해 신청 기한을 놓치지 않게 도와드려요. 선택 사항이고, 상세 주소는 받지 않아요.",
    errRegion: "시·도와 시·군·구를 함께 골라 주세요.",
    // D5: 아이가 없는 홈
    emptyTitle: "아이를 등록하면 월령에 맞는 일정과 혜택이 나와요",
    emptyTitleExpecting: "출산 예정일을 등록하면 임신 중 일정과 혜택이 나와요",
    emptyBody: "아이 이름과 생년월일만 있으면 돼요. 가족에게 받은 코드가 있으면 내 정보에서 합류할 수도 있어요.",
    emptyBodyExpecting: "출산 예정일과 사는 지역만 있으면 돼요. 아이가 태어나면 생년월일로 바꿀 수 있어요.",
    emptyTab: { calendar: "아이를 등록하면 캘린더에 접종·검진·혜택 일정이 표시돼요.", checklist: "아이를 등록하면 월령별 체크리스트가 만들어져요.", subsidy: "아이를 등록하면 우리 동네 지원금·혜택을 찾아 드려요.", record: "아이를 등록하면 성장·접종 기록을 남길 수 있어요." },
    myInfo: "내 정보",
    emptyButton: "아이 등록하기",
    emptyButtonExpecting: "출산 예정일 등록하기",
    nameLabel: "표시 이름",
    institutionLabel: "아이 돌봄 기관",
    codeLabel: "가족 캘린더 코드 (선택)",
    codeHint: "비워 두면 새 가족으로 시작해요. 가족에게 받은 코드가 있으면 입력해 같은 가족으로 합류해요.",
    codePlaceholder: "8자리 코드",
    childNameLabel: "아이 이름 또는 별칭",
    birthDateLabel: "아이 생년월일",
    genderLabel: "성별 (선택)",
    dueDateLabel: "출산 예정일",
    submitSignup: "가입하기",
    submitLogin: "로그인",
    signingUp: "가입하는 중이에요…",
    loggingIn: "로그인하는 중이에요…",
    signupDone: "가입했어요. 로그인 상태예요.",
    loginDone: "로그인했어요.",
    loggedInAs: (who) => `${who}님으로 로그인했어요.`,
    myAccount: "내 계정",
    logoutTitle: "로그아웃할까요?",
    logoutBody: "로그아웃해도 가족의 일정과 아이 정보는 지워지지 않아요. 이 기기에서는 가족 캘린더 연결만 해제되고, 다시 로그인하면 이어서 볼 수 있어요.",
    logoutPending: (n) => `아직 서버에 보내지 못한 변경 ${n}건은 로그아웃하면 사라질 수 있어요.`,
    loggedOut: "로그아웃했어요.",
    errEmailEmpty: "이메일을 입력해 주세요.",
    errEmail: "이메일 형식을 확인해 주세요.",
    errPassword: "비밀번호는 8자 이상으로 만들어 주세요.",
    errName: "표시 이름을 입력해 주세요(20자 이내).",
    errSituation: "출생한 자녀가 있는지 골라 주세요.",
    errRole: "가입하는 사람을 골라 주세요.",
    errInstitution: "아이 돌봄 기관을 골라 주세요.",
    errCode: "가족 캘린더 코드는 8자리 영문·숫자예요. 비워 두면 새 가족으로 시작해요.",
    errChildName: "아이 이름을 입력해 주세요(12자 이내).",
    errBirthDate: "아이 생년월일을 확인해 주세요.",
    errDueDate: "출산 예정일을 확인해 주세요.",
    // D3: 내 정보·가족 초대·연결 복구
    myRole: (role) => `나(${role})`,
    inviteMenu: "가족 초대하기",
    inviteTitle: "가족 초대하기",
    inviteBody: "가족에게 이 코드를 알려 주세요. 회원가입할 때 가족 캘린더 코드에 입력하면 같은 가족으로 합류해요.",
    inviteCodeLabel: "가족 캘린더 코드",
    inviteCopy: "코드 복사",
    inviteCopied: "복사했어요.",
    inviteNone: "가족 캘린더가 아직 연결되지 않았어요. 연결한 뒤에 초대할 수 있어요.",
    registerChild: "아이 등록하기",
    recoverTitle: "가족 캘린더를 연결해 주세요",
    recoverBody: "계정에 연결된 가족 캘린더가 없어요. 새로 만들지, 가족에게 받은 코드로 합류할지 골라 주세요.",
    recoverNew: "새 가족 만들기",
    recoverJoinOpen: "가족 코드로 합류하기",
    recoverJoin: "합류하기",
    recoverBack: "뒤로",
    recoverLater: "나중에",
    recoverDone: "가족 캘린더에 연결했어요.",
    migrateTitle: "이 기기의 아이를 어떻게 할까요?",
    migrateTitleConflict: "가족 캘린더를 바꿀까요?",
    migrateConflictBody: "이 기기에는 다른 가족 캘린더가 연결돼 있어요. 내 계정의 가족 캘린더로 바꿀까요?\n어느 쪽을 골라도 이 기기의 아이 기록은 지워지지 않아요.",
    migrateFail: "아직 보내지 못한 변경이 있거나 연결에 실패해 바꾸지 못했어요. 인터넷에 연결한 뒤 다시 시도해 주세요.",
    migrateBody: (names) => `이 기기에는 ${names}의 기록이 있어요. 내 계정의 가족 캘린더에 함께 볼까요?\n어느 쪽을 골라도 이 기기의 기록은 지워지지 않아요.`,
    migrateAdd: "이 기기 아이를 가족에 추가",
    migrateKeep: "내 계정 가족 쓰기",
    migrateAdded: "이 기기의 아이를 가족 캘린더에 추가했어요.",
    migrateKept: "내 계정 가족 캘린더를 쓰고 있어요. 이 기기의 아이 기록은 그대로 남아 있어요.",
    childCodeLabel: "아이 기록 코드(6자리)",
    childCodeHint: "다른 기기에서 이 아이의 기록을 불러올 때 쓰는 코드예요. 가족을 초대할 땐 위의 가족 캘린더 코드(8자리)를 알려주세요.",
  });
  const ROLES = Object.freeze([["MOM", "엄마"], ["DAD", "아빠"], ["CHILD", "자녀"], ["CAREGIVER", "이모님(기타 돌봄)"]]);
  const SITUATIONS = Object.freeze([["HAS_CHILD", "있어요"], ["EXPECTING", "없어요"]]);
  const ROLES_HAS_CHILD = Object.freeze([["MOM", "엄마"], ["DAD", "아빠"], ["CHILD", "자녀"]]);
  const ROLES_EXPECTING = Object.freeze([["MOM", "예비엄마"], ["DAD", "예비아빠"]]);
  const REGION_MAX = 30;
  const INSTITUTIONS = Object.freeze([["DAYCARE", "어린이집"], ["KINDERGARTEN", "유치원"], ["ELEMENTARY", "초등학교"], ["NONE", "해당 없음"]]);
  const GENDERS = Object.freeze([["F", "여"], ["M", "남"], ["", "선택 안 함"]]);
  const NAME_MAX = 20, CHILD_NAME_MAX = 12, DUE_MAX_DAYS = 300;

  const esc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const lines = (s) => esc(s).replace(/\n/g, "<br>");
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  const CODE_RE = /^[A-Z0-9]{8}$/;

  const toISO = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const parseDate = (s) => {
    if (!DATE_RE.test(String(s || ""))) return null;
    const [y, m, d] = s.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d ? dt : null;
  };
  const normCode = (c) => String(c == null ? "" : c).replace(/\s+/g, "").toUpperCase();

  /** 가입 시트에서 지금 고를 수 있는 역할 선택지: 합류(코드 입력)면 전체, 아니면 자녀 유무에 따라(있어요=엄마·아빠·자녀 / 없어요=예비엄마·예비아빠 / 미선택=없음). */
  function roleOptions(form) {
    const f = form || {};
    if (normCode(f.familyCode) !== "") return ROLES;
    return f.situation === "HAS_CHILD" ? ROLES_HAS_CHILD : f.situation === "EXPECTING" ? ROLES_EXPECTING : [];
  }
  /** 폼의 서로 의존하는 값을 맞춘다(선택지에 없는 역할 지움, 합류면 자녀 유무·지역 지움, 시·도가 바뀌면 시·군·구 지움). 같은 객체를 돌려준다. */
  function syncForm(form, regions) {
    const f = form;
    if (!roleOptions(f).some(([k]) => k === f.role)) f.role = "";
    if (normCode(f.familyCode) !== "") { f.situation = ""; f.province = ""; f.district = ""; }
    if (f.district && regions) {
      const p = regions.find((x) => x.code === f.province);
      if (!p || !p.districts.includes(f.district)) f.district = "";
    }
    return f;
  }
  /**
   * 가입 폼 검증(D5). 코드를 입력하면(합류) 자녀 유무·지역은 요구하지 않고 역할은 전체 선택지(엄마·아빠·자녀·이모님).
   * 새 가족이면 '출생한 자녀가 있나요'(HAS_CHILD/EXPECTING)와 그에 맞는 역할이 필수, 지역(시·도+시·군·구)은 선택 — 하나만 고르면 오류.
   * regions: 있으면 지역 값을 목록으로 검증한다. 반환 { ok, errors, intent } — intent 는 서버 연결에 쓰는 정규화 값(비밀번호 제외).
   */
  function validateSignup(form, today, regions) {
    const f = form || {};
    const errors = {};
    const email = String(f.email || "").trim();
    if (!email) errors.email = MSG.errEmailEmpty;
    else if (!EMAIL_RE.test(email)) errors.email = MSG.errEmail;
    if (typeof f.password !== "string" || f.password.length < 8) errors.password = MSG.errPassword;
    const name = String(f.displayName || "").trim();
    if (!name || name.length > NAME_MAX) errors.displayName = MSG.errName;
    const code = normCode(f.familyCode);
    const joining = code !== "";
    if (joining && !CODE_RE.test(code)) errors.familyCode = MSG.errCode;
    if (!joining && f.situation !== "HAS_CHILD" && f.situation !== "EXPECTING") errors.situation = MSG.errSituation;
    if (!roleOptions(f).some(([k]) => k === f.role)) errors.role = MSG.errRole;
    let province = "", district = "";
    if (!joining) {
      province = String(f.province || "").trim();
      district = String(f.district || "").trim();
      if (province || district) {
        const p = regions ? regions.find((x) => x.code === province) : null;
        const known = regions ? !!p && p.districts.includes(district) : province.length <= REGION_MAX && district.length <= REGION_MAX;
        if (!province || !district || !known) errors.region = MSG.errRegion;
      }
    }
    const ok = Object.keys(errors).length === 0;
    const intent = ok ? { email, displayName: name, role: f.role, joiningCode: joining ? code : null, ...(joining ? {} : { situation: f.situation, ...(province ? { province, district } : {}) }) } : null;
    return { ok, errors, intent };
  }
  /** 연결 복구 폼 검증: 역할·표시 이름 필수, 합류(joining)면 8자리 코드 필수. intent 는 가입 의도와 같은 모양(상황·기관 없음). */
  function validateRecover(form, joining) {
    const f = form || {};
    const errors = {};
    if (!ROLES.some(([k]) => k === f.role)) errors.role = MSG.errRole;
    const name = String(f.displayName || "").trim();
    if (!name || name.length > NAME_MAX) errors.displayName = MSG.errName;
    const code = normCode(f.familyCode);
    if (joining && !CODE_RE.test(code)) errors.familyCode = MSG.errCode;
    const ok = Object.keys(errors).length === 0;
    return { ok, errors, intent: ok ? { email: String(f.email || ""), displayName: name, role: f.role, joiningCode: joining ? code : null } : null };
  }
  function validateLogin(form) {
    const f = form || {};
    const errors = {};
    const email = String(f.email || "").trim();
    if (!email) errors.email = MSG.errEmailEmpty;
    else if (!EMAIL_RE.test(email)) errors.email = MSG.errEmail;
    if (!f.password) errors.password = MSG.errPassword;
    return { ok: Object.keys(errors).length === 0, errors };
  }

  // ── 마크업 ────────────────────────────────────────────────────────────────
  const err = (errors, k) => (errors && errors[k] ? `<p class="acct-err">${esc(errors[k])}</p>` : "");
  const input = (k, label, type, value, extra) => `<div class="acct-field"><label>${esc(label)}</label><input type="${type}" class="acct-input" data-acct-input="${k}" value="${esc(value)}" autocomplete="off" ${extra || ""} /></div>`;
  const radios = (k, label, opts, cur, errors) => `<div class="acct-field"><label>${esc(label)}</label><div class="acct-radios" role="radiogroup" aria-label="${esc(label)}">${opts.map(([v, l]) => `<button type="button" role="radio" aria-checked="${cur === v ? "true" : "false"}" class="acct-radio" data-acct-radio="${k}" data-value="${esc(v)}">${esc(l)}</button>`).join("")}</div>${err(errors, k)}</div>`;

  /** 랜딩의 계정 카드(로그아웃 상태): 로고 + 회원가입/로그인. */
  function renderLanding(state) {
    const s = state || {};
    if (s.user) return `<div class="card acct-landing" id="acct-landing"><div class="acct-logo">${esc(MSG.logo)}</div><p class="fine-print">${esc(MSG.loggedInAs(s.user.displayName || s.user.email))}</p><div class="acct-actions"><button type="button" class="btn-close" data-acct-action="logout">${esc(MSG.logout)}</button></div></div>`;
    return `<div class="card acct-landing" id="acct-landing"><div class="acct-logo">${esc(MSG.logo)}</div><p class="acct-sub">${esc(MSG.landingSub)}</p><p class="fine-print">${esc(MSG.landingLead)}</p><div class="acct-actions"><button type="button" class="btn-complete" data-acct-action="open-signup">${esc(MSG.signup)}</button><button type="button" class="btn-close" data-acct-action="open-login">${esc(MSG.login)}</button></div><p class="fine-print">${esc(MSG.landingNote)}</p></div>`;
  }
  const roleLabel = (r) => (ROLES.find(([k]) => k === r) || [])[1] || "";
  /** 프로필 시트의 계정 슬롯. s.account = { displayName, role }(accounts 문서)가 있으면 이름·역할을 보여준다. */
  function renderAccountSlot(state) {
    const s = state || {};
    if (s.user) return `<div class="detail-row acct-slot"><div class="label">${esc(MSG.myAccount)}</div>${esc((s.account && s.account.displayName) || s.user.displayName || "")}${s.account && s.account.role ? ` · ${esc(MSG.myRole(roleLabel(s.account.role).replace(/\(.*\)/, "")))}` : ""}<br /><span class="fine-print">${esc(s.user.email)}</span><div class="acct-actions"><button type="button" class="btn-close" data-acct-action="logout">${esc(MSG.logout)}</button></div>${s.notice ? `<p class="fine-print">${esc(s.notice)}</p>` : ""}</div>`;
    return `<div class="detail-row acct-slot"><div class="label">${esc(MSG.myAccount)}</div><div class="acct-actions"><button type="button" class="btn-complete" data-acct-action="open-signup">${esc(MSG.signup)}</button><button type="button" class="btn-close" data-acct-action="open-login">${esc(MSG.login)}</button></div>${s.notice ? `<p class="fine-print">${esc(s.notice)}</p>` : ""}</div>`;
  }
  const select = (k, placeholder, opts, cur, disabled) => `<select class="acct-input acct-select" data-acct-input="${k}" aria-label="${esc(placeholder)}"${disabled ? " disabled" : ""}><option value="">${esc(placeholder)}</option>${opts.map(([v, l]) => `<option value="${esc(v)}"${cur === v ? " selected" : ""}>${esc(l)}</option>`).join("")}</select>`;
  /** state: { form, errors, error(서버 오류 문구), busy, regions: [{code,name,districts}] } */
  function renderSignup(state) {
    const s = state || {}, f = s.form || {}, e = s.errors || {};
    const joining = normCode(f.familyCode) !== "";
    const regions = s.regions || [];
    const prov = regions.find((p) => p.code === f.province);
    const situation = joining ? "" : radios("situation", MSG.situationLabel, SITUATIONS, f.situation, e);
    const roles = roleOptions(f);
    const role = roles.length ? radios("role", MSG.roleLabel, roles, f.role, e) : "";
    const region = joining || !regions.length ? "" : `<div class="acct-field"><label>${esc(MSG.regionLabel)}</label>${select("province", MSG.provincePlaceholder, regions.map((p) => [p.code, p.name]), f.province || "")}${select("district", MSG.districtPlaceholder, (prov ? prov.districts : []).map((d) => [d, d]), f.district || "", !prov)}${err(e, "region")}<p class="fine-print acct-region-hint">${esc(MSG.regionHint)}</p></div>`;
    return `<div class="acct-form" data-acct-form="signup"><h3>${esc(MSG.signupTitle)}</h3><p class="fine-print">${esc(MSG.signupLead)}</p>
      ${input("email", MSG.emailLabel, "email", f.email || "", 'inputmode="email" autocapitalize="off"')}${err(e, "email")}
      ${input("password", MSG.passwordLabel, "password", f.password || "", 'autocomplete="new-password"')}${err(e, "password")}
      ${input("displayName", MSG.nameLabel, "text", f.displayName || "", 'maxlength="20"')}${err(e, "displayName")}
      ${situation}${role}
      <div class="acct-field"><label>${esc(MSG.codeLabel)}</label><input type="text" class="acct-input acct-code" data-acct-input="familyCode" maxlength="8" placeholder="${esc(MSG.codePlaceholder)}" value="${esc(f.familyCode || "")}" autocapitalize="characters" autocomplete="off" spellcheck="false" /><p class="fine-print">${esc(MSG.codeHint)}</p>${err(e, "familyCode")}</div>
      ${joining ? "" : region}
      ${s.error ? `<p class="acct-err">${esc(s.error)}</p>` : ""}
      <button type="button" class="btn-complete" data-acct-action="submit-signup"${s.busy ? " disabled" : ""}>${esc(s.busy ? MSG.signingUp : MSG.submitSignup)}</button>
      <button type="button" class="btn-close" data-acct-action="close"${s.busy ? " disabled" : ""}>${esc(MSG.cancel)}</button></div>`;
  }
  /** 내 정보 시트(아이가 없는 홈에서 열린다): 계정 슬롯 + 가족 캘린더 코드(있으면) + 닫기. */
  function renderMe(state) {
    const st = state || {};
    const code = st.code ? `<div class="hh-code-box"><span class="hh-code-label">${esc(MSG.inviteCodeLabel)}</span><strong class="hh-code">${esc(st.code)}</strong></div><button type="button" class="btn-close" data-acct-action="copy-me">${esc(MSG.inviteCopy)}</button>` : "";
    return `<div class="acct-form" data-acct-form="me">${renderAccountSlot(st)}${code}<button type="button" class="btn-close" data-acct-action="close">${esc(MSG.close)}</button></div>`;
  }
  /** 아이가 없는 홈(D5) 안내 카드. expecting=true 면 예비 부모 문구. */
  function renderEmptyHome(state) {
    const x = !!(state && state.expecting);
    return `<div class="card acct-empty" id="acct-empty-home"><h3>${esc(x ? MSG.emptyTitleExpecting : MSG.emptyTitle)}</h3><p class="fine-print">${esc(x ? MSG.emptyBodyExpecting : MSG.emptyBody)}</p><button type="button" class="btn-complete" data-acct-action="empty-register">${esc(x ? MSG.emptyButtonExpecting : MSG.emptyButton)}</button><button type="button" class="btn-close" data-acct-action="empty-me">${esc(MSG.myInfo)}</button></div>`;
  }
  function renderEmptyTab(tab, state) {
    const t = MSG.emptyTab[tab];
    if (!t) return renderEmptyHome(state);
    const x = !!(state && state.expecting);
    return `<div class="card acct-empty"><p class="fine-print">${esc(t)}</p><button type="button" class="btn-complete" data-acct-action="empty-register">${esc(x ? MSG.emptyButtonExpecting : MSG.emptyButton)}</button></div>`;
  }
  function renderLogin(state) {
    const s = state || {}, f = s.form || {}, e = s.errors || {};
    return `<div class="acct-form" data-acct-form="login"><h3>${esc(MSG.loginTitle)}</h3>
      ${input("email", MSG.emailLabel, "email", f.email || "", 'inputmode="email" autocapitalize="off"')}${err(e, "email")}
      ${input("password", MSG.passwordLabel, "password", f.password || "", 'autocomplete="current-password"')}${err(e, "password")}
      ${s.error ? `<p class="acct-err">${esc(s.error)}</p>` : ""}${s.notice ? `<p class="fine-print">${esc(s.notice)}</p>` : ""}
      <button type="button" class="btn-complete" data-acct-action="submit-login"${s.busy ? " disabled" : ""}>${esc(s.busy ? MSG.loggingIn : MSG.submitLogin)}</button>
      <button type="button" class="btn-text" data-acct-action="reset-password"${s.busy ? " disabled" : ""}>${esc(MSG.forgot)}</button>
      <button type="button" class="btn-close" data-acct-action="close"${s.busy ? " disabled" : ""}>${esc(MSG.cancel)}</button></div>`;
  }
  /** 가족 초대하기 시트(+ 메뉴): 내 가구 코드와 복사 버튼. code 가 없으면 안내만. */
  function renderInvite(state) {
    const code = state && state.code;
    return `<div class="acct-form" data-acct-form="invite"><h3>${esc(MSG.inviteTitle)}</h3>${code
      ? `<p class="fine-print">${lines(MSG.inviteBody)}</p><div class="hh-code-box"><span class="hh-code-label">${esc(MSG.inviteCodeLabel)}</span><strong class="hh-code">${esc(code)}</strong></div><button type="button" class="btn-complete" data-acct-action="copy-invite">${esc(MSG.inviteCopy)}</button>${state.notice ? `<p class="fine-print">${esc(state.notice)}</p>` : ""}`
      : `<p class="fine-print">${esc(MSG.inviteNone)}</p>`}<button type="button" class="btn-close" data-acct-action="close">${esc(MSG.close)}</button></div>`;
  }
  /** 이 기기의 아이를 계정 가족에 추가할지 묻는 시트(D4). kids: [{name}] */
  function renderMigrate(state) {
    const s = state || {};
    const kids = (s.kids || []).filter(Boolean);
    const names = kids.map((k) => k.name).filter(Boolean).join("·") || "아이";
    const dis = s.busy ? " disabled" : "";
    return `<div class="acct-form" data-acct-form="migrate"><h3>${esc(s.conflict ? MSG.migrateTitleConflict : MSG.migrateTitle)}</h3><p class="fine-print">${lines(s.conflict ? MSG.migrateConflictBody : MSG.migrateBody(names))}</p>
      ${s.error ? `<p class="acct-err">${esc(s.error)}</p>` : ""}${kids.length ? `<button type="button" class="btn-complete" data-acct-action="migrate-add"${dis}>${esc(MSG.migrateAdd)}</button>` : ""}<button type="button" class="${kids.length ? "btn-close" : "btn-complete"}" data-acct-action="migrate-keep"${dis}>${esc(MSG.migrateKeep)}</button><button type="button" class="btn-text" data-acct-action="close"${dis}>${esc(MSG.recoverLater)}</button></div>`;
  }
  /** 연결 복구 시트: 새 가족을 만들기 전에 반드시 한 번 거친다(합류 의도였는데 새 가족이 만들어지는 것을 막는다). state: { form, errors, error, busy, joining } */
  function renderRecover(state) {
    const s = state || {}, f = s.form || {}, e = s.errors || {};
    const body = s.joining
      ? `<div class="acct-field"><label>${esc(MSG.codeLabel.replace(" (선택)", ""))}</label><input type="text" class="acct-input acct-code" data-acct-input="familyCode" maxlength="8" placeholder="${esc(MSG.codePlaceholder)}" value="${esc(f.familyCode || "")}" autocapitalize="characters" autocomplete="off" spellcheck="false" />${err(e, "familyCode")}</div>
        <button type="button" class="btn-complete" data-acct-action="recover-join"${s.busy ? " disabled" : ""}>${esc(MSG.recoverJoin)}</button><button type="button" class="btn-text" data-acct-action="recover-back"${s.busy ? " disabled" : ""}>${esc(MSG.recoverBack)}</button>`
      : `<button type="button" class="btn-complete" data-acct-action="recover-new"${s.busy ? " disabled" : ""}>${esc(MSG.recoverNew)}</button><button type="button" class="btn-close" data-acct-action="recover-join-open"${s.busy ? " disabled" : ""}>${esc(MSG.recoverJoinOpen)}</button>`;
    return `<div class="acct-form" data-acct-form="recover"><h3>${esc(MSG.recoverTitle)}</h3><p class="fine-print">${esc(MSG.recoverBody)}</p>
      ${radios("role", MSG.roleLabel, ROLES, f.role, e)}${input("displayName", MSG.nameLabel, "text", f.displayName || "", 'maxlength="20"')}${err(e, "displayName")}
      ${s.error ? `<p class="acct-err">${esc(s.error)}</p>` : ""}${body}<button type="button" class="btn-text" data-acct-action="close"${s.busy ? " disabled" : ""}>${esc(MSG.recoverLater)}</button></div>`;
  }
  function renderLogoutConfirm(state) {
    const n = (state && state.pending) || 0;
    return `<div class="acct-form" data-acct-form="logout"><h3>${esc(MSG.logoutTitle)}</h3><p class="fine-print">${lines(MSG.logoutBody)}</p>${n > 0 ? `<p class="acct-err">${esc(MSG.logoutPending(n))}</p>` : ""}
      <button type="button" class="btn-complete" data-acct-action="confirm-logout">${esc(MSG.logout)}</button><button type="button" class="btn-close" data-acct-action="close">${esc(MSG.cancel)}</button></div>`;
  }

  return { MSG, ROLES, INSTITUTIONS, GENDERS, validateSignup, validateLogin, validateRecover, normCode, toISO, renderLanding, renderAccountSlot, renderSignup, renderLogin, renderLogoutConfirm, renderInvite, renderRecover, renderMigrate, renderEmptyHome, renderEmptyTab, renderMe, roleOptions, syncForm, SITUATIONS, esc };
});
