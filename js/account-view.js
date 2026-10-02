/*
 * 계정(D1) 화면 — 순수 문자열·검증. DOM·저장소·네트워크를 쓰지 않는다. 새 문구는 사용자 승인 전 제안안이다.
 * 가입 폼 값(form)은 app.js 가 들고 있고, 이 모듈은 검증(validateSignup)과 마크업만 만든다.
 *   form = { email, password, displayName, situation: "PREGNANT"|"HAS_CHILD", role, institution, familyCode, childName, birthDate, gender, dueDate }
 * 서버 연결(accounts 문서·가구 생성/합류)은 D2 — 여기서는 가입 의도(intent)만 만든다.
 */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else root.AccountView = factory();
})(typeof window !== "undefined" ? window : global, function () {
  "use strict";

  const MSG = Object.freeze({
    logo: "한눈육아",
    landingLead: "가족과 함께 쓰려면 회원가입해 주세요.",
    landingNote: "계정 없이 아래에서 바로 시작할 수도 있어요.",
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
    situationLabel: "지금 상황",
    situationPregnant: "임산부예요",
    situationChild: "아이가 있어요",
    roleLabel: "가입하는 사람",
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
    logoutBody: "로그아웃해도 가족의 일정과 아이 정보는 지워지지 않아요. 다시 로그인하면 이어서 볼 수 있어요.",
    logoutPending: (n) => `아직 서버에 보내지 못한 변경 ${n}건은 로그아웃하면 사라질 수 있어요.`,
    loggedOut: "로그아웃했어요.",
    errEmailEmpty: "이메일을 입력해 주세요.",
    errEmail: "이메일 형식을 확인해 주세요.",
    errPassword: "비밀번호는 8자 이상으로 만들어 주세요.",
    errName: "표시 이름을 입력해 주세요(20자 이내).",
    errSituation: "지금 상황을 골라 주세요.",
    errRole: "가입하는 사람을 골라 주세요.",
    errInstitution: "아이 돌봄 기관을 골라 주세요.",
    errCode: "가족 캘린더 코드는 8자리 영문·숫자예요. 비워 두면 새 가족으로 시작해요.",
    errChildName: "아이 이름을 입력해 주세요(12자 이내).",
    errBirthDate: "아이 생년월일을 확인해 주세요.",
    errDueDate: "출산 예정일을 확인해 주세요.",
  });
  const ROLES = Object.freeze([["MOM", "엄마"], ["DAD", "아빠"], ["CHILD", "자녀"], ["CAREGIVER", "이모님(기타 돌봄)"]]);
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

  /**
   * 가입 폼 검증. 코드를 입력하면(합류) 상황·기관·아이 정보는 요구하지 않는다(가구의 아이를 쓴다).
   * today: Date(주입 가능). 반환 { ok, errors:{필드:문구}, intent } — intent 는 D2 가 서버 연결에 쓰는 정규화 값(비밀번호 제외).
   */
  function validateSignup(form, today) {
    const f = form || {};
    const t = today instanceof Date ? today : new Date();
    const errors = {};
    const email = String(f.email || "").trim();
    if (!email) errors.email = MSG.errEmailEmpty;
    else if (!EMAIL_RE.test(email)) errors.email = MSG.errEmail;
    if (typeof f.password !== "string" || f.password.length < 8) errors.password = MSG.errPassword;
    const name = String(f.displayName || "").trim();
    if (!name || name.length > NAME_MAX) errors.displayName = MSG.errName;
    if (!ROLES.some(([k]) => k === f.role)) errors.role = MSG.errRole;
    const code = normCode(f.familyCode);
    const joining = code !== "";
    if (joining && !CODE_RE.test(code)) errors.familyCode = MSG.errCode;
    let childPart = null;
    if (!joining) {
      if (f.situation !== "PREGNANT" && f.situation !== "HAS_CHILD") errors.situation = MSG.errSituation;
      if (!INSTITUTIONS.some(([k]) => k === f.institution)) errors.institution = MSG.errInstitution;
      if (f.situation === "HAS_CHILD") {
        const cn = String(f.childName || "").trim();
        if (!cn || cn.length > CHILD_NAME_MAX) errors.childName = MSG.errChildName;
        const bd = parseDate(f.birthDate);
        const tod = new Date(t.getFullYear(), t.getMonth(), t.getDate());
        if (!bd || bd > tod) errors.birthDate = MSG.errBirthDate;
        childPart = { childName: cn, birthDate: f.birthDate || "", gender: ["F", "M"].includes(f.gender) ? f.gender : "" };
      } else if (f.situation === "PREGNANT") {
        const dd = parseDate(f.dueDate);
        const tod = new Date(t.getFullYear(), t.getMonth(), t.getDate());
        const max = new Date(tod.getFullYear(), tod.getMonth(), tod.getDate() + DUE_MAX_DAYS);
        if (!dd || dd < tod || dd > max) errors.dueDate = MSG.errDueDate;
        childPart = { dueDate: f.dueDate || "" };
      }
    }
    const ok = Object.keys(errors).length === 0;
    const intent = ok ? { email, displayName: name, role: f.role, joiningCode: joining ? code : null, ...(joining ? {} : { situation: f.situation, institution: f.institution, ...childPart }) } : null;
    return { ok, errors, intent };
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
    return `<div class="card acct-landing" id="acct-landing"><div class="acct-logo">${esc(MSG.logo)}</div><p class="fine-print">${esc(MSG.landingLead)}</p><div class="acct-actions"><button type="button" class="btn-complete" data-acct-action="open-signup">${esc(MSG.signup)}</button><button type="button" class="btn-close" data-acct-action="open-login">${esc(MSG.login)}</button></div><p class="fine-print">${esc(MSG.landingNote)}</p></div>`;
  }
  /** 프로필 시트의 계정 슬롯. */
  function renderAccountSlot(state) {
    const s = state || {};
    if (s.user) return `<div class="detail-row acct-slot"><div class="label">${esc(MSG.myAccount)}</div>${esc(s.user.displayName || "")}${s.user.displayName ? " · " : ""}${esc(s.user.email)}<div class="acct-actions"><button type="button" class="btn-close" data-acct-action="logout">${esc(MSG.logout)}</button></div>${s.notice ? `<p class="fine-print">${esc(s.notice)}</p>` : ""}</div>`;
    return `<div class="detail-row acct-slot"><div class="label">${esc(MSG.myAccount)}</div><div class="acct-actions"><button type="button" class="btn-complete" data-acct-action="open-signup">${esc(MSG.signup)}</button><button type="button" class="btn-close" data-acct-action="open-login">${esc(MSG.login)}</button></div>${s.notice ? `<p class="fine-print">${esc(s.notice)}</p>` : ""}</div>`;
  }
  /** state: { form, errors, error(서버 오류 문구), busy } */
  function renderSignup(state) {
    const s = state || {}, f = s.form || {}, e = s.errors || {};
    const joining = normCode(f.familyCode) !== "";
    const child = joining ? "" : f.situation === "HAS_CHILD"
      ? `${input("childName", MSG.childNameLabel, "text", f.childName || "", 'maxlength="12"')}${err(e, "childName")}${input("birthDate", MSG.birthDateLabel, "date", f.birthDate || "")}${err(e, "birthDate")}${radios("gender", MSG.genderLabel, GENDERS, f.gender == null ? "" : f.gender, e)}`
      : f.situation === "PREGNANT" ? `${input("dueDate", MSG.dueDateLabel, "date", f.dueDate || "")}${err(e, "dueDate")}` : "";
    const situation = joining ? "" : radios("situation", MSG.situationLabel, [["PREGNANT", MSG.situationPregnant], ["HAS_CHILD", MSG.situationChild]], f.situation, e);
    const institution = joining ? "" : radios("institution", MSG.institutionLabel, INSTITUTIONS, f.institution, e);
    return `<div class="acct-form" data-acct-form="signup"><h3>${esc(MSG.signupTitle)}</h3>
      ${input("email", MSG.emailLabel, "email", f.email || "", 'inputmode="email" autocapitalize="off"')}${err(e, "email")}
      ${input("password", MSG.passwordLabel, "password", f.password || "", 'autocomplete="new-password"')}${err(e, "password")}
      ${radios("role", MSG.roleLabel, ROLES, f.role, e)}
      ${input("displayName", MSG.nameLabel, "text", f.displayName || "", 'maxlength="20"')}${err(e, "displayName")}
      <div class="acct-field"><label>${esc(MSG.codeLabel)}</label><input type="text" class="acct-input acct-code" data-acct-input="familyCode" maxlength="8" placeholder="${esc(MSG.codePlaceholder)}" value="${esc(f.familyCode || "")}" autocapitalize="characters" autocomplete="off" spellcheck="false" /><p class="fine-print">${esc(MSG.codeHint)}</p>${err(e, "familyCode")}</div>
      ${situation}${institution}${child}
      ${s.error ? `<p class="acct-err">${esc(s.error)}</p>` : ""}
      <button type="button" class="btn-complete" data-acct-action="submit-signup"${s.busy ? " disabled" : ""}>${esc(s.busy ? MSG.signingUp : MSG.submitSignup)}</button>
      <button type="button" class="btn-close" data-acct-action="close"${s.busy ? " disabled" : ""}>${esc(MSG.cancel)}</button></div>`;
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
  function renderLogoutConfirm(state) {
    const n = (state && state.pending) || 0;
    return `<div class="acct-form" data-acct-form="logout"><h3>${esc(MSG.logoutTitle)}</h3><p class="fine-print">${lines(MSG.logoutBody)}</p>${n > 0 ? `<p class="acct-err">${esc(MSG.logoutPending(n))}</p>` : ""}
      <button type="button" class="btn-complete" data-acct-action="confirm-logout">${esc(MSG.logout)}</button><button type="button" class="btn-close" data-acct-action="close">${esc(MSG.cancel)}</button></div>`;
  }

  return { MSG, ROLES, INSTITUTIONS, GENDERS, validateSignup, validateLogin, normCode, toISO, renderLanding, renderAccountSlot, renderSignup, renderLogin, renderLogoutConfirm, esc };
});
