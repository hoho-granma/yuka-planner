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
    // G1: 첫 화면(계정 기능 ON)·베타 미리 써 보기 — 문구는 여기 한곳에 모은다.
    onboard: Object.freeze({
      title: "우리 가족 일정, 한눈에",
      sub: "접종·검진·지원금은 아이 월령에 맞춰 자동으로, 엄마·아빠 일정은 가족과 함께 한 캘린더에서.",
      primary: "회원가입",
      loginBtn: "로그인",
      introHome: "홈으로", // D71: 로그인한 채 첫 화면을 볼 때의 주 버튼
      codeHint: "가족코드를 받았다면 회원가입에서 입력해요",
      joinTitle: "가족에게 받은 가족코드로 함께하기",
      ob1Title: "육아하며 시기마다 필요한 것,\n한눈에",
      ob1Sub: "접종·검진·지원금부터 학교 준비까지.\n지금 우리 아이에게 필요한 것을 먼저 챙겨드려요.",
      ob2Brand: "한눈육아",
      ob2Lead: "이것저것 흩어져 챙기기 어려웠다면,\n한눈육아에서 한방에 꼼꼼히 챙겨줘요",
      ob2Aria: "한눈육아 소개(옆으로 넘겨 보세요)",
      ob2Feats: Object.freeze([
        Object.freeze(["auto", "육아 일정 자동 챙김", "월령에 맞춰 접종·검진 일정을 알아서 채워 줘요"]),
        Object.freeze(["benefit", "지원금·혜택 챙김", "우리 지역 지원금 신청 기한까지 챙겨요"]),
        Object.freeze(["manage", "육아 일정 관리", "아이 일정을 직접 추가하고 완료까지 체크해요"]),
        Object.freeze(["family", "가족 일정 공유", "엄마·아빠·가족이 한 캘린더를 같이 봐요"]),
        Object.freeze(["places", "집 근처 갈 만한 곳 추천", "차로 가까운 곳부터 아이 나이에 맞춰 골라요"]),
      ]),
      joinDesc: "가족코드를 받았다면 여기로",
      browseBack: "‹ 회원가입·로그인으로 돌아가기",
      childFormTitle: "우리 아이 정보를 알려 주세요",
      dateKindAria: "날짜 종류",
      dateKindBorn: "생년월일",
      dateKindDue: "출산 예정일",
      browseHeroTitle: "우리 아이 정보를 알려 주세요",
      bornSub: "아이 생년월일과 사는 지역을 알려 주시면 접종·검진·지원금을 월령에 맞춰 챙겨 드려요.",
      pregnantSub: "출산 예정일과 사는 지역을 알려 주시면 임신 중 챙길 것과 혜택부터, 출산 후 접종·검진까지 이어서 챙겨 드려요.",
      bornSubmit: "우리 아이 일정 만들기",
      pregnantSubmit: "출산 전후 일정 만들기",
      formNote: "입력한 정보로 월령에 맞는 일정과 혜택을 챙겨 드려요. 언제든 프로필에서 고칠 수 있어요.",
      joinSheetTitle: "가족과 함께하기",
      joinSheetLead: "가족에게 받은 8자리 가족코드를 입력하면 같은 가족 캘린더로 합류해요. 아이 정보는 가족 캘린더에 이미 있어요.",
      joinOff: "코드가 없어요 · 새 가족으로 시작하기",
      errJoinCode: "가족에게 받은 8자리 가족코드를 입력해 주세요.",
      betaCardTitle: "새 버전 미리 써 보기 (베타)",
      betaCardDesc: "회원가입과 가족 캘린더가 있는 새 화면이에요",
      betaOnTitle: "새 버전을 써 볼까요?",
      betaOnBody: "첫 화면이 로그인·회원가입 중심으로 바뀌고 가족 캘린더를 함께 쓸 수 있어요. 하단에는 ‘어디갈까’ 탭이 생겨요.\n지금까지 입력한 아이 기록은 지워지지 않아요.",
      betaOnYes: "써 볼게요",
      betaOffTitle: "이전 화면으로 돌아갈까요?",
      betaOffBody: "첫 화면과 하단 탭이 예전 모습으로 돌아가요. 가입한 계정과 가족 캘린더는 그대로 남아 있어요.",
      betaOffYes: "돌아갈게요",
      cancel: "취소",
    }),
    landingTitle: "우리 아이 일정, 놓치지 않게",
    landingSub: "접종·검진·지원금을 아이 월령에 맞춰 자동으로 챙기고, 가족과 한 캘린더로 함께 관리해요.",
    landingLead: "가족이 함께 쓰려면 회원가입해 주세요.",
    landingNote: "계정 없이 아래에서 바로 시작할 수도 있어요.",
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
    switchToSignup: "처음이세요? 회원가입",
    switchToLogin: "이미 계정이 있어요 · 로그인",
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
    emptyTab: { calendar: "아이를 등록하면 캘린더에 접종·검진·혜택 일정이 표시돼요.", checklist: "아이를 등록하면 월령별 체크리스트가 만들어져요.", subsidy: "아이를 등록하면 우리 동네 지원금·혜택을 찾아 드려요.", record: "아이를 등록하면 성장·접종 기록을 남길 수 있어요.", places: "아이를 등록하면 우리 동네·월령에 맞는 갈 만한 곳을 보여 드려요." },
    // G20: 아이가 없는 계정의 기본 화면(얇은 배너 한 줄 + 빈 자리 줄) · 아이 등록 시트
    nc: {
      banner: "아이를 등록하면 월령별 할 일·혜택이 열려요",
      bannerExpecting: "출산 예정일을 등록하면 임신 중 할 일·혜택이 열려요",
      bannerGo: "등록 ›",
      checklistTitle: "체크리스트", checklistHint: "아이 나이를 알면 여기에 월령별 할 일이 채워져요.",
      subsidyHint: "아이 나이를 알면 받을 수 있는 혜택이 여기 나와요.", subsidySeg: ["신청 가능", "예정", "완료"],
      recordTitle: "기록", recordHint: "아이를 등록하면 성장·접종 기록을 남길 수 있어요.",
      familyTitle: "오늘·이번 주 우리 가족", mineTitle: "내 일정",
      sheetTitle: "아이 등록", close: "닫기",
      nameLabel: "이름", nameHint: "별명도 괜찮아요", namePlaceholder: "예: 하은이, 콩이",
      dateLabel: "날짜", kindBorn: "생년월일", kindDue: "출산 예정일",
      genderLabel: "성별", optional: "선택", genders: [["", "아직 몰라요"], ["M", "남아"], ["F", "여아"]],
      photoLabel: "사진", photoHint: "나중에 프로필에서 바꿀 수 있어요", photoAdd: "사진 추가", photoChange: "사진 변경", photoRemove: "삭제",
      save: "저장", saving: "저장 중…", regionProvince: "시·도", regionDistrict: "시·군·구",
      errName: "이름(별명)을 입력해 주세요.", errDate: "날짜를 선택해 주세요.", errDateBorn: "생년월일은 오늘 이전이어야 해요.", errDateDue: "출산 예정일은 오늘부터 300일 안이어야 해요.", errRegion: "사는 지역을 골라 주세요.",
      previewDue: (w, d, dateKr) => ({ main: `임신 ${w}주`, sub: d > 0 ? `출산까지 ${d}일 · ${dateKr}` : d === 0 ? `오늘이 출산 예정일 · ${dateKr}` : `출산 예정일이 지났어요 · ${dateKr}` }),
      previewBorn: (age) => ({ main: age, sub: "" }),
    },
    myInfo: "내 정보",
    emptyButton: "아이 등록하기",
    emptyButtonExpecting: "출산 예정일 등록하기",
    nameLabel: "표시 이름",
    institutionLabel: "아이 돌봄 기관",
    codeLabel: "가족코드 (선택)",
    codeHint: "비워 두면 새 가족으로 시작해요. 가족에게 받은 코드가 있으면 입력해 같은 가족으로 합류해요.",
    codePlaceholder: "가족코드 8자리",
    childNameLabel: "아이 이름 또는 별칭",
    birthDateLabel: "아이 생년월일",
    genderLabel: "성별 (선택)",
    dueDateLabel: "출산 예정일",
    submitSignup: "가입하기",
    stepLabel: (n, t) => `${n} / ${t} 단계`,
    stepQ1: "계정을 만들어요",
    stepQ2: "누가 함께 쓰나요?",
    stepQ2Join: "어느 가족에 합류하나요?",
    stepQ3: "사는 지역을 알려 주세요(선택)",
    stepNext: "다음",
    stepPrev: "이전",
    submitLogin: "로그인",
    signingUp: "가입하는 중이에요…",
    loggingIn: "로그인하는 중이에요…",
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
    errCode: "가족코드는 8자리 영문·숫자예요. 비워 두면 새 가족으로 시작해요.",
    errChildName: "아이 이름을 입력해 주세요(12자 이내).",
    errBirthDate: "아이 생년월일을 확인해 주세요.",
    errDueDate: "출산 예정일을 확인해 주세요.",
    // D3: 내 정보·가족 초대·연결 복구
    myRole: (role) => `나(${role})`,
    inviteMenu: "가족 추가",
    inviteTitle: "가족 추가",
    inviteBody: "초대할 사람의 역할을 고르고 [초대 보내기]를 누르면 초대 링크와 가족코드가 함께 공유돼요.",
    inviteCodeLabel: "가족코드",
    inviteCopy: "코드 복사",
    codeCopy: "가족코드 복사",
    codeCreate: "가족 만들고 가족코드 받기",
    codeReissue: "가족코드 다시 만들기",
    codeNoneHint: "아직 가족 캘린더가 연결되지 않았어요. 가족을 만들면 가족코드가 생겨요.",
    slotTitle: "누구로 합류하나요?",
    slotLead: "가족이 미리 만들어 둔 자리예요. 고르면 역할이 자동으로 정해져요.",
    slotNew: "목록에 없어요 · 새 구성원으로",
    slotConfirmTitle: (who) => `${who}(으)로 합류할까요?`,
    slotJoin: "합류하기",
    slotOther: "다른 역할로",
    rolePickTitle: "어떤 역할로 합류하나요?",
    rolePickContinue: "합류하기",
    slotFail: "합류하지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.",
    cardChildHint: "아이를 등록해 주세요",
    cardChildHintExpecting: "출산 예정일을 등록해 주세요",
    inviteCopied: "복사했어요.",
    inviteSend: "초대 보내기",
    addTitle: "추가하기",
    addTabSchedule: "일정 추가",
    addHint: "추가할 항목을 골라 주세요",
    addNeedHousehold: "일정을 추가하려면 먼저 프로필에서 가족 캘린더를 만들어 주세요",
    invitePreview: "초대 문구 미리보기",
    invitePreviewEmpty: "역할을 고르면 보낼 초대 문구가 여기에 보여요.",
    inviteWho: "누구를 초대하나요?",
    inviteTextCopied: "초대 문구를 복사했어요. 메신저에 붙여 넣어 보내 주세요.",
    inviteFail: "초대 자리를 만들지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.",
    inviteMenu2: "가족 추가",
    copyIcon: "가족코드 복사",
    copiedShort: "복사했어요",
    codeLabelShort: "가족코드",
    familyTitle: "우리 가족",
    meShort: "나",
    childFallback: "아이",
    membersManage: "구성원 관리",
    membersManageHint: "수정·삭제·아이 빼기",
    joinLinkLead: "초대받은 가족코드와 역할이 들어 있어요. 이메일·비밀번호·이름만 입력하면 돼요.",
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
  const LINK_ROLES = Object.freeze([["MOM", "엄마"], ["DAD", "아빠"], ["CHILD", "자녀"], ["OTHER", "기타"]]);
  const ACCOUNT_ROLE_OF = (r) => (["MOM", "DAD", "CHILD", "CAREGIVER"].includes(r) ? r : "CAREGIVER");
  function roleOptions(form) {
    const f = form || {};
    if (f.fromLink === true) return LINK_ROLES; // Q3: 초대 링크로 들어온 가입 — 엄마·아빠·자녀·기타 중 선택(링크의 역할이 미리 선택)
    if (normCode(f.familyCode) !== "" || f.join === true) return ROLES;
    return f.situation === "HAS_CHILD" ? ROLES_HAS_CHILD : f.situation === "EXPECTING" ? ROLES_EXPECTING : [];
  }
  /** 폼의 서로 의존하는 값을 맞춘다(선택지에 없는 역할 지움, 합류면 자녀 유무·지역 지움, 시·도가 바뀌면 시·군·구 지움). 같은 객체를 돌려준다. */
  function syncForm(form, regions) {
    const f = form;
    if (!roleOptions(f).some(([k]) => k === f.role)) f.role = "";
    if (normCode(f.familyCode) !== "" || f.join === true) { f.situation = ""; f.province = ""; f.district = ""; }
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
    const joining = code !== "" || f.join === true;
    if (joining && !CODE_RE.test(code)) errors.familyCode = f.join === true && code === "" ? MSG.onboard.errJoinCode : MSG.errCode;
    if (!joining && f.situation !== "HAS_CHILD" && f.situation !== "EXPECTING") errors.situation = MSG.errSituation;
    if ((!joining || f.fromLink === true) && !roleOptions(f).some(([k]) => k === f.role)) errors.role = MSG.errRole; // H2: 합류는 자리를 고르면 역할이 정해지므로 가입 폼에서 묻지 않는다
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
    const intent = ok ? { email, displayName: name, role: f.fromLink === true ? ACCOUNT_ROLE_OF(f.role) : f.role || null, ...(f.fromLink === true ? { memberRole: f.role, ...(f.from ? { invitedFrom: f.from } : {}) } : {}), joiningCode: joining ? code : null, ...(joining ? {} : { situation: f.situation, ...(province ? { province, district } : {}) }) } : null;
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

  const ICO_FAMILY = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="22" height="22" aria-hidden="true"><circle cx="9" cy="8" r="3"/><circle cx="17" cy="9.5" r="2.4"/><path d="M3.5 19c0-3.2 2.5-5.2 5.5-5.2s5.5 2 5.5 5.2"/><path d="M15.5 14.2c3 0 5 1.6 5 4.3"/></svg>';
  /** 랜딩의 계정 카드(로그아웃 상태): 로고·제목·부제·[회원가입하고 시작하기]·[가족 코드로 함께하기]·로그인. */
  function renderLanding(state) {
    const s = state || {};
    const O = MSG.onboard;
    // D71: 로그인한 채로 헤더 '한눈육아'를 눌러 연 첫 화면 — 같은 1장(히어로) + 아래 버튼만 [홈으로]·로그인됨 안내 한 줄(로그아웃·로그인·회원가입 없음).
    if (s.intro === true && s.user) {
      return `<div class="card acct-landing acct-ob" id="acct-landing"><div class="acct-main">
        <section class="acct-slide" data-acct-slide="0"><div class="acct-ob1-top"><div class="acct-logo acct-logo-w">${esc(MSG.logo)}</div><h1 class="acct-title">${lines(O.ob1Title).replace("한눈에", '<mark class="acct-hl">한눈에</mark>')}</h1><p class="acct-sub">${lines(O.ob1Sub)}</p></div></section>
      <div class="acct-cta">
        <button type="button" class="acct-btn-primary" data-acct-action="intro-home">${esc(O.introHome)}</button>
        <p class="acct-code-hint">${esc(MSG.loggedInAs(s.user.displayName || s.user.email))}</p>
        ${s.version ? `<p class="acct-ver">v${esc(s.version)}</p>` : ""}
      </div></div></div>`;
    }
    if (s.user) return `<div class="card acct-landing" id="acct-landing"><div class="acct-logo">${esc(MSG.logo)}</div><p class="fine-print">${esc(MSG.loggedInAs(s.user.displayName || s.user.email))}</p><div class="acct-actions"><button type="button" class="btn-close" data-acct-action="logout">${esc(MSG.logout)}</button></div></div>`;
    // 온보딩 첫 화면(D64): 한 장짜리 — 로고(왼쪽 위)·제목·보조(가운데) + 원 2개, 아래 고정 버튼 [로그인]·[회원가입]·가족코드 안내 한 줄. 2번째 화면(메인 기능 5개)·점은 없앴다(문구 상수 ob2*·FEAT_ICO 는 D51 보류로 보존, 미노출).
    return `<div class="card acct-landing acct-ob" id="acct-landing"><div class="acct-main">
        <section class="acct-slide" data-acct-slide="0"><div class="acct-ob1-top"><div class="acct-logo acct-logo-w">${esc(MSG.logo)}</div><h1 class="acct-title">${lines(O.ob1Title).replace("한눈에", '<mark class="acct-hl">한눈에</mark>')}</h1><p class="acct-sub">${lines(O.ob1Sub)}</p></div></section>
      <div class="acct-cta">
        <button type="button" class="acct-btn-primary" data-acct-action="open-login">${esc(O.loginBtn)}</button>
        <button type="button" class="acct-btn-text" data-acct-action="open-signup">${esc(O.primary)}</button>
        <p class="acct-code-hint">${esc(O.codeHint)}</p>
        ${s.version ? `<p class="acct-ver">v${esc(s.version)}</p>` : ""}
      </div></div></div>`;
  }
  const FEAT_ICO = Object.freeze({
    auto: '<svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="#8b5cf6" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="3" width="12" height="11" rx="2"/><path d="M2 7h12M5 1.5v3M11 1.5v3"/></svg>',
    benefit: '<svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="#d98a1f" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="6" width="12" height="8" rx="1.5"/><path d="M8 6v8M1.5 6h13V4h-13zM8 4c-1-2.2-3.4-2-3.4-.6S6.6 4 8 4zm0 0c1-2.2 3.4-2 3.4-.6S9.4 4 8 4z"/></svg>',
    manage: '<svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="#3b82c4" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="1.8" width="10" height="12.4" rx="2"/><path d="M5.5 5.5l1 1 2-2M5.5 9.5h5M5.5 12h3"/></svg>',
    family: '<svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="#e05a8e" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="5.5" cy="5.5" r="2.3"/><circle cx="11" cy="6" r="2"/><path d="M1.5 13c.6-2.4 2.2-3.6 4-3.6s3.4 1.2 4 3.6M9.6 13c.4-1.7 1.4-2.6 2.6-2.6 1.1 0 2 .8 2.3 2.6"/></svg>',
    places: '<svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="#2f9e64" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 14.5s5-4.3 5-8a5 5 0 0 0-10 0c0 3.7 5 8 5 8z"/><circle cx="8" cy="6.5" r="1.7"/></svg>',
  });
  /** 슬라이드 스크롤 위치 → 현재 장 번호(0..count-1). 점 표시 갱신용(순수). */
  function slideIndex(scrollLeft, width, count) {
    const n = Number(count) || 1;
    if (!(width > 0)) return 0;
    return Math.max(0, Math.min(n - 1, Math.round(Number(scrollLeft) / width)));
  }
  /** OFF 첫 화면의 '새 버전 미리 써 보기 (베타)' 카드. */
  function renderBetaPreviewCard() {
    const O = MSG.onboard;
    return `<button type="button" class="acct-beta-card" data-preview-action="ask"><span class="acct-btn-ico">${ICO_FAMILY}</span><span class="acct-btn-txt"><strong>${esc(O.betaCardTitle)}</strong><small>${esc(O.betaCardDesc)}</small></span></button>`;
  }
  /** 베타 켜기/끄기 확인 시트. on=true 켜기, false 끄기. 버튼은 data-preview-action(confirm|cancel). */
  function renderBetaConfirm(on) {
    const O = MSG.onboard;
    return `<div class="acct-form" data-preview-form="${on ? "on" : "off"}"><h3>${esc(on ? O.betaOnTitle : O.betaOffTitle)}</h3><p class="fine-print">${lines(on ? O.betaOnBody : O.betaOffBody)}</p>
      <button type="button" class="acct-btn-primary" data-preview-action="confirm">${esc(on ? O.betaOnYes : O.betaOffYes)}</button><button type="button" class="btn-close" data-preview-action="cancel">${esc(O.cancel)}</button></div>`;
  }
  const roleLabel = (r) => (ROLES.find(([k]) => k === r) || [])[1] || "";
  /** 프로필 시트의 계정 슬롯. s.account = { displayName, role }(accounts 문서)가 있으면 이름·역할을 보여준다. */
  const ICO_PERSON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" class="person-icon" aria-hidden="true"><circle cx="12" cy="8" r="3.5"/><path d="M5 20c0-3.5 3-6 7-6s7 2.5 7 6"/></svg>';
  const ICO_COPY = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="16" height="16" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/></svg>';
  /** 가족코드 구역(로그인 상태): 코드(다른 줄과 같은 글자 크기)+오른쪽 복사 아이콘 → [가족 추가] / 가구 연결이 없을 때만 [가족 만들기]. */
  function codeBlock(s) {
    if (s.code) return `<div class="acct-code-row"><span class="fine-print">${esc(MSG.codeLabelShort)} ${esc(s.code)}</span><button type="button" class="acct-copy-ico" data-acct-action="copy-me" aria-label="${esc(MSG.copyIcon)}" title="${esc(MSG.copyIcon)}">${ICO_COPY}</button>${s.notice === MSG.inviteCopied ? `<span class="acct-copied" role="status">${esc(MSG.copiedShort)}</span>` : ""}</div>`;
    return `<div class="acct-code-block"><p class="fine-print">${esc(MSG.codeNoneHint)}</p><div class="acct-actions"><button type="button" class="btn-complete" data-acct-action="open-recover">${esc(MSG.codeCreate)}</button></div></div>`;
  }
  /** 내 계정 영역: 기본 아이콘 + 이름·역할 → 이메일 → 가족코드. */
  function renderAccountSlot(state) {
    const s = state || {};
    if (s.user && s.family) return renderFamilySlot(s);
    if (s.user) {
      const name = (s.account && s.account.displayName) || s.user.displayName || "";
      const role = s.account && s.account.role ? ` · ${esc(MSG.myRole(roleLabel(s.account.role).replace(/\(.*\)/, "")))}` : "";
      return `<div class="detail-row acct-slot"><div class="label">${esc(MSG.myAccount)}</div><div class="acct-me"><span class="avatar acct-me-avatar">${ICO_PERSON}</span><div class="acct-me-text"><strong>${esc(name)}${role}</strong><span class="fine-print">${esc(s.user.email)}</span>${s.withCode ? codeBlock(s) : ""}</div></div><div class="acct-actions">${s.withCode && s.code ? `<button type="button" class="btn-close acct-btn-outline" data-acct-action="open-invite">${esc(MSG.inviteMenu)}</button>` : ""}<button type="button" class="btn-close" data-acct-action="logout">${esc(MSG.logout)}</button></div>${s.notice && s.notice !== MSG.inviteCopied ? `<p class="fine-print">${esc(s.notice)}</p>` : ""}</div>`;
    }
    return `<div class="detail-row acct-slot"><div class="label">${esc(MSG.myAccount)}</div><div class="acct-actions"><button type="button" class="btn-complete" data-acct-action="open-signup">${esc(MSG.signup)}</button><button type="button" class="btn-close" data-acct-action="open-login">${esc(MSG.login)}</button></div>${s.notice ? `<p class="fine-print">${esc(s.notice)}</p>` : ""}</div>`;
  }
  // ── G7 프로필 시트(D 가족 중심): 우리 가족 얼굴 + 가족코드 → 내 계정 줄(로그아웃). 가족 얼굴은 구성원·아이 링크에서 만든다. ──
  const FACE_COLORS = Object.freeze({ MOM: "#ff66b3", DAD: "#4d9bff" });
  const FACE_FAMILY = "#c9b8ff";
  const FACE_CHILD = Object.freeze(["#ffc233", "#2fe0a0", "#ff5f6d", "#17d3ee"]);
  const okColor = (c) => (/^#[0-9a-fA-F]{6}$/.test(String(c || "")) ? c : ""); // 앱이 팔레트에서 골라 넘긴 색만(없으면 옛 고정색 폴백)
  const face = (color, label, me) => `<div class="acct-face"><span class="acct-face-dot" style="background:${color}">${esc(String(label || "").slice(0, 1))}</span><span class="acct-face-name">${esc(label)}${me ? ` (${esc(MSG.meShort)})` : ""}</span></div>`;
  /** s.family = { members:[{memberId,role,label}], meId, meName, children:[{childKey,displayName}] } */
  function renderFamilySlot(s) {
    const f = s.family || {};
    const name = (s.account && s.account.displayName) || s.user.displayName || "";
    const role = s.account && s.account.role ? ` · ${esc(MSG.myRole(roleLabel(s.account.role).replace(/\(.*\)/, "")))}` : "";
    const faces = (f.members || []).map((m) => face(okColor(m.color) || FACE_COLORS[m.role] || FACE_FAMILY, f.meId && m.memberId === f.meId && f.meName ? f.meName : m.label, !!f.meId && m.memberId === f.meId)).join("")
      + (f.children || []).map((c, i) => face(okColor(c.color) || FACE_CHILD[i % FACE_CHILD.length], c.displayName || MSG.childFallback, false)).join("");
    const add = s.code ? `<button type="button" class="acct-face acct-face-add" data-acct-action="open-invite"><span class="acct-face-dot">+</span><span class="acct-face-name">${esc(MSG.inviteMenu)}</span></button>` : "";
    const pill = s.code
      ? `<div class="acct-fam-code"><span class="acct-fam-pill"><span class="acct-fam-pill-l">${esc(MSG.codeLabelShort)}</span><b>${esc(s.code)}</b><button type="button" class="acct-copy-ico" data-acct-action="copy-me" aria-label="${esc(MSG.copyIcon)}" title="${esc(MSG.copyIcon)}">${ICO_COPY}</button></span>${s.notice === MSG.inviteCopied ? `<span class="acct-copied" role="status">${esc(MSG.copiedShort)}</span>` : ""}</div>`
      : `<div class="acct-code-block"><p class="fine-print">${esc(MSG.codeNoneHint)}</p><div class="acct-actions"><button type="button" class="btn-complete" data-acct-action="open-recover">${esc(MSG.codeCreate)}</button></div></div>`;
    return `<div class="detail-row acct-slot acct-fam"><div class="acct-fam-hero"><h4>${esc(MSG.familyTitle)}</h4><div class="acct-faces">${faces}${add}</div>${pill}</div>
      <div class="acct-fam-me"><span class="avatar acct-me-avatar">${ICO_PERSON}</span><div class="acct-me-text"><strong>${esc(name)}${role}</strong><span class="fine-print">${esc(s.user.email)}</span></div><button type="button" class="acct-sm-btn" data-acct-action="logout">${esc(MSG.logout)}</button></div>${s.notice && s.notice !== MSG.inviteCopied ? `<p class="fine-print">${esc(s.notice)}</p>` : ""}</div>`;
  }
  /** 가입 직후 아이가 없는 홈의 '내 정보' 카드: 이름 · 나(역할) / 아이를 등록해 주세요 / 이메일. 누르면 내 정보(가족코드). */
  function renderMyCard(state) {
    const s = state || {};
    if (!s.user) return "";
    const name = (s.account && s.account.displayName) || s.user.displayName || "";
    const role = s.account && s.account.role ? MSG.myRole(roleLabel(s.account.role).replace(/\(.*\)/, "")) : "";
    const hint = s.expecting ? MSG.cardChildHintExpecting : MSG.cardChildHint;
    return `<button type="button" class="profile-card acct-mycard" data-acct-action="empty-me"><span class="avatar"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" class="person-icon"><circle cx="12" cy="8" r="3.5"/><path d="M5 20c0-3.5 3-6 7-6s7 2.5 7 6"/></svg></span><span class="profile-text"><strong>${esc(name)}${role ? ` · ${esc(role)}` : ""}</strong><span class="profile-location">${esc(hint)}</span><span class="profile-location">${esc(s.user.email || "")}</span></span><span class="chevron">›</span></button>`;
  }
  const SLOT_ROLE = Object.freeze({ MOM: "엄마", DAD: "아빠", CHILD: "아이(자녀)", CAREGIVER: "이모님·돌봄", GRANDPARENT: "조부모", OTHER: "기타" });
  /** 합류 직전: 아직 가입하지 않은 자리 목록(slots: [{memberId,label,role}]). 자리가 하나여도 조용히 정하지 않고 확인을 받는다. */
  function renderSlotPick(state) {
    const s = state || {};
    const dis = s.busy ? " disabled" : "";
    const slots = s.slots || [];
    const one = slots.length === 1;
    const rows = slots.map((m) => `<button type="button" class="${one ? "acct-btn-primary" : "acct-btn-join"}" data-acct-action="pick-slot" data-slot-id="${esc(m.memberId)}"${dis}>${one ? `<span class="acct-btn-txt"><strong>${esc(MSG.slotJoin)}</strong></span>` : `<span class="acct-btn-txt"><strong>${esc(m.label || "")}</strong><small>${esc(SLOT_ROLE[m.role] || SLOT_ROLE.OTHER)}</small></span>`}</button>`).join("");
    const title = one ? MSG.slotConfirmTitle(slots[0].label || SLOT_ROLE[slots[0].role] || SLOT_ROLE.OTHER) : MSG.slotTitle;
    return `<div class="acct-form" data-acct-form="slot"><h3>${esc(title)}</h3><p class="fine-print">${esc(MSG.slotLead)}</p>${s.error ? `<p class="acct-err">${esc(s.error)}</p>` : ""}${rows}<button type="button" class="acct-link" data-acct-action="pick-slot" data-slot-id=""${dis}>${esc(one ? MSG.slotOther : MSG.slotNew)}</button></div>`;
  }
  /** 자리를 고르지 않고 합류할 때(자리가 없거나 [다른 역할로]) 역할을 묻는 단계. */
  function renderRolePick(state) {
    const s = state || {}, f = s.form || {}, e = s.errors || {};
    return `<div class="acct-form" data-acct-form="role"><h3>${esc(MSG.rolePickTitle)}</h3>${radios("role", MSG.roleLabel, ROLES, f.role, e)}${s.error ? `<p class="acct-err">${esc(s.error)}</p>` : ""}<button type="button" class="acct-btn-primary" data-acct-action="role-continue"${s.busy ? " disabled" : ""}>${esc(MSG.rolePickContinue)}</button></div>`;
  }
  const select = (k, placeholder, opts, cur, disabled) => `<select class="acct-input acct-select" data-acct-input="${k}" aria-label="${esc(placeholder)}"${disabled ? " disabled" : ""}><option value="">${esc(placeholder)}</option>${opts.map(([v, l]) => `<option value="${esc(v)}"${cur === v ? " selected" : ""}>${esc(l)}</option>`).join("")}</select>`;
  // ── G7: 가입 폼 3단계 스텝(1 계정 / 2 누가 함께 쓰나요 / 3 사는 지역(선택)). 합류(코드 입력·초대 링크)는 2단계로 줄어든다. 입력 항목·검증(validateSignup)은 그대로. ──
  /** 이 폼의 총 단계 수: 합류면 2(계정·가족코드), 새 가족이면 3. */
  const signupTotal = (form) => (normCode((form || {}).familyCode) !== "" || (form || {}).join === true ? 2 : 3);
  /** 현재 단계(1..total). 폼에 step 이 없으면 1. */
  function signupStep(form) {
    const n = Math.floor(Number((form || {}).step));
    return Math.max(1, Math.min(signupTotal(form), Number.isFinite(n) && n > 0 ? n : 1));
  }
  /** 단계별 필드 키(검증 오류 키와 같다). 합류는 2단계에 코드(+링크 가입이면 역할)만. */
  function signupStepKeys(form, step) {
    const joining = signupTotal(form) === 2;
    if (step === 1) return ["email", "password", "displayName"];
    if (step === 2) return joining ? ["familyCode", "role"] : ["situation", "role", "familyCode"];
    return ["region"];
  }
  /** 오류가 있는 가장 앞 단계(없으면 0). 제출 때 앞 단계 오류로 되돌아가는 데 쓴다. */
  function firstErrorStep(form, errors) {
    const e = errors || {}, total = signupTotal(form);
    for (let st = 1; st <= total; st++) if (signupStepKeys(form, st).some((k) => e[k])) return st;
    return 0;
  }
  /** state: { form, errors, error(서버 오류 문구), busy, regions: [{code,name,districts}] } */
  function renderSignup(state) {
    const s = state || {}, f = s.form || {}, e = s.errors || {};
    const join = f.join === true;
    const joining = join || normCode(f.familyCode) !== "";
    const total = signupTotal(f), step = signupStep(f), last = step === total;
    const regions = s.regions || [];
    const prov = regions.find((p) => p.code === f.province);
    const situation = joining ? "" : radios("situation", MSG.situationLabel, SITUATIONS, f.situation, e);
    const roles = roleOptions(f);
    const role = roles.length && (!joining || f.fromLink === true) ? radios("role", MSG.roleLabel, roles, f.role, e) : "";
    const region = joining || !regions.length ? "" : `<div class="acct-field"><label>${esc(MSG.regionLabel)}</label>${select("province", MSG.provincePlaceholder, regions.map((p) => [p.code, p.name]), f.province || "")}${select("district", MSG.districtPlaceholder, (prov ? prov.districts : []).map((d) => [d, d]), f.district || "", !prov)}${err(e, "region")}<p class="fine-print acct-region-hint">${esc(MSG.regionHint)}</p></div>`;
    const codeField = `<div class="acct-field"><label>${esc(join ? MSG.onboard.joinTitle : MSG.codeLabel)}</label><input type="text" class="acct-input acct-code" data-acct-input="familyCode" maxlength="8" placeholder="${esc(MSG.codePlaceholder)}" value="${esc(f.familyCode || "")}" autocapitalize="characters" autocomplete="off" spellcheck="false" />${join ? "" : `<p class="fine-print">${esc(MSG.codeHint)}</p>`}${err(e, "familyCode")}</div>`;
    const account = `${input("email", MSG.emailLabel, "email", f.email || "", 'inputmode="email" autocapitalize="off"')}${err(e, "email")}
      ${input("password", MSG.passwordLabel, "password", f.password || "", 'autocomplete="new-password"')}${err(e, "password")}
      ${input("displayName", MSG.nameLabel, "text", f.displayName || "", 'maxlength="20"')}${err(e, "displayName")}`;
    const q = step === 1 ? MSG.stepQ1 : step === 2 ? (joining ? MSG.stepQ2Join : MSG.stepQ2) : MSG.stepQ3;
    const lead = step === 1 ? (f.fromLink === true ? MSG.joinLinkLead : joining ? "" : MSG.signupLead) : step === 2 && join && f.fromLink !== true ? MSG.onboard.joinSheetLead : "";
    const body = step === 1 ? account : step === 2 ? `${situation}${role}${codeField}` : region;
    const bars = Array.from({ length: total }, (_, k) => `<span class="acct-prog-seg${k < step ? " on" : ""}"></span>`).join("");
    const dis = s.busy ? " disabled" : "";
    const back = step > 1 ? `<button type="button" class="acct-step-back" data-acct-action="prev-step"${dis}>${esc(MSG.stepPrev)}</button>` : "";
    const go = last
      ? `<button type="button" class="acct-btn-primary acct-step-go" data-acct-action="submit-signup"${dis}>${esc(s.busy ? MSG.signingUp : MSG.submitSignup)}</button>`
      : `<button type="button" class="acct-btn-primary acct-step-go" data-acct-action="next-step"${dis}>${esc(MSG.stepNext)}</button>`;
    return `<div class="acct-form acct-steps" data-acct-form="signup" data-step="${step}" data-total="${total}"><div class="acct-step-top"><span class="acct-logo">${esc(MSG.logo)}</span><button type="button" class="acct-step-x" data-acct-action="close" aria-label="${esc(MSG.cancel)}"${dis}>×</button></div>
      <div class="acct-prog" role="progressbar" aria-valuemin="1" aria-valuemax="${total}" aria-valuenow="${step}">${bars}</div>
      <p class="acct-step-n">${esc(MSG.stepLabel(step, total))}</p><h3 class="acct-step-q">${esc(q)}</h3>${lead ? `<p class="fine-print acct-step-lead">${esc(lead)}</p>` : ""}
      ${body}
      ${s.error ? `<p class="acct-err">${esc(s.error)}</p>` : ""}
      ${join && last ? `<button type="button" class="acct-link" data-acct-action="join-off"${dis}>${esc(MSG.onboard.joinOff)}</button>` : ""}
      ${step === 1 ? `<button type="button" class="acct-link ob-switch" data-acct-action="open-login"${dis}>${esc(MSG.switchToLogin)}</button>` : ""}
      <div class="acct-step-foot">${back}${go}</div></div>`;
  }
  /** 내 정보 시트(아이가 없는 홈에서 열린다): 계정 슬롯 + 가족 캘린더 코드(있으면) + 닫기. */
  function renderMe(state) {
    const st = { ...(state || {}), withCode: true };
    return `<div class="acct-form" data-acct-form="me">${renderAccountSlot(st)}<button type="button" class="btn-close" data-acct-action="close">${esc(MSG.close)}</button></div>`;
  }
  // ── G20 아이가 없는 계정(emptyHome && !profile)의 화면: 공용 빈 화면 대신 탭마다 평소 화면 + 얇은 배너 한 줄 ──
  const ICO_BANNER = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M9 11v.01M15 11v.01M9.5 15c1.4 1 3.6 1 5 0"/></svg>';
  const ICO_PIN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21s6.5-5.6 6.5-11a6.5 6.5 0 1 0-13 0c0 5.4 6.5 11 6.5 11z"/><circle cx="12" cy="10" r="2.4"/></svg>';
  /** 맨 위 배너 한 줄 — '등록 ›' 은 새 아이 등록 시트를 연다(data-acct-action="empty-register"). 화면에는 항상 한 번만 그린다. */
  function renderNoChildBanner(state) {
    const x = !!(state && state.expecting);
    return `<div class="acct-nc-ban" id="acct-nc-banner" role="note">${ICO_BANNER}<span>${esc(x ? MSG.nc.bannerExpecting : MSG.nc.banner)}</span><button type="button" class="acct-nc-ban-go" data-acct-action="empty-register">${esc(MSG.nc.bannerGo)}</button></div>`;
  }
  const ghosts = '<div class="acct-nc-ghost" aria-hidden="true"><i></i><i></i><i></i></div><div class="acct-nc-ghost" aria-hidden="true"><i></i><i></i><i></i></div>';
  /** 홈: 배너 → 내 카드 → 이번 주 가족 일정 → 내 일정(두 카드 HTML 은 app 이 만들어 넘긴다). */
  function renderNoChildHome(state) {
    const s = state || {};
    if (!s.user) return renderNoChildBanner(s);
    const name = (s.account && s.account.displayName) || s.user.displayName || "";
    const role = s.account && s.account.role ? MSG.myRole(roleLabel(s.account.role).replace(/\(.*\)/, "")) : "";
    const region = s.account && s.account.province ? `${s.account.province} ${s.account.district || ""}`.trim() : "";
    const me = `<button type="button" class="acct-nc-me" data-acct-action="nc-me"><span class="avatar acct-nc-av">${ICO_PERSON}</span><span class="acct-nc-me-t"><b>${esc(name)}${role ? ` · ${esc(role)}` : ""}</b>${region ? `<small>${ICO_PIN} ${esc(region)}</small>` : ""}</span><span class="chevron">›</span></button>`;
    return `${renderNoChildBanner(s)}${me}${s.familyHtml || ""}${s.mineHtml || ""}`;
  }
  /** 체크리스트·혜택·기록: 배너 한 줄 + 빈 자리 줄(큰 [아이 등록하기] 버튼은 두지 않는다). */
  function renderNoChildTab(tab, state) {
    const N = MSG.nc;
    const head = renderNoChildBanner(state);
    if (tab === "checklist") return `${head}<h2 class="acct-nc-ttl">${esc(N.checklistTitle)}</h2><p class="acct-nc-hint">${esc(N.checklistHint)}</p>${ghosts}`;
    if (tab === "subsidy") return `${head}<div class="acct-nc-seg">${N.subsidySeg.map((t, i) => `<span${i === 0 ? ' class="on"' : ""}>${esc(t)}</span>`).join("")}</div><p class="acct-nc-hint">${esc(N.subsidyHint)}</p>${ghosts}`;
    if (tab === "record") return `${head}<h2 class="acct-nc-ttl">${esc(N.recordTitle)}</h2><p class="acct-nc-hint">${esc(N.recordHint)}</p>${ghosts}`;
    return `${head}${ghosts}`;
  }
  /** 아이 등록 바텀시트(시안 A, 한 장): 이름 → 날짜 종류 토글 → 날짜 → 미리보기 → 저장(성별·사진은 묻지 않는다). 날짜 입력칸 마크업(dateMarkup)은 app 이 넣는다. */
  function renderChildSheet(state) {
    const s = state || {}, N = MSG.nc;
    const kind = s.kind === "pregnant" ? "pregnant" : "born";
    const region = s.needRegion
      ? `<div class="lb acct-cs-lb">${esc(N.regionProvince)}</div><select id="cr-province" class="acct-cs-sel">${(s.regions || []).map((p) => `<option value="${esc(p.code)}">${esc(p.name)}</option>`).join("")}</select><select id="cr-district" class="acct-cs-sel"></select>`
      : "";
    return `<div class="acct-cs" data-acct-child-sheet="1"><div class="acct-cs-grab"></div><div class="acct-cs-head"><b>${esc(N.sheetTitle)}</b></div>
      <div class="lb acct-cs-lb"><label for="cr-name">${esc(N.nameLabel)}</label> <small>${esc(N.nameHint)}</small></div><input type="text" id="cr-name" class="acct-cs-inp" maxlength="${CHILD_NAME_MAX}" placeholder="${esc(N.namePlaceholder)}" value="${esc(s.name || "")}" />
      <div class="lb acct-cs-lb">${esc(N.dateLabel)}</div><div class="acct-cs-tg" role="radiogroup" aria-label="${esc(N.dateLabel)}"><button type="button" role="radio" data-cr-kind="born" aria-checked="${kind === "born"}" class="${kind === "born" ? "on" : ""}">${esc(N.kindBorn)}</button><button type="button" role="radio" data-cr-kind="pregnant" aria-checked="${kind === "pregnant"}" class="${kind === "pregnant" ? "on" : ""}">${esc(N.kindDue)}</button></div>
      <div class="acct-cs-date" id="cr-date-slot">${s.dateMarkup || ""}</div><div class="acct-cs-pv hidden" id="cr-preview" aria-live="polite"><b></b><span></span></div>
      ${region}
      <p class="acct-err hidden" id="cr-error" role="alert"></p>
      <div class="acct-cs-foot"><button type="button" class="acct-cs-save" id="cr-save">${esc(N.save)}</button></div></div>`;
  }
  /** 아이가 없는 홈(D5) 안내 카드. expecting=true 면 예비 부모 문구. */
  function renderEmptyHome(state) {
    const x = !!(state && state.expecting);
    return `${renderMyCard(state)}<div class="card acct-empty" id="acct-empty-home"><h3>${esc(x ? MSG.emptyTitleExpecting : MSG.emptyTitle)}</h3><p class="fine-print">${esc(x ? MSG.emptyBodyExpecting : MSG.emptyBody)}</p><button type="button" class="btn-complete" data-acct-action="empty-register">${esc(x ? MSG.emptyButtonExpecting : MSG.emptyButton)}</button>${state && state.user ? "" : `<button type="button" class="btn-close" data-acct-action="empty-me">${esc(MSG.myInfo)}</button>`}</div>`;
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
      <button type="button" class="acct-link ob-switch" data-acct-action="open-signup"${s.busy ? " disabled" : ""}>${esc(MSG.switchToSignup)}</button>
      <button type="button" class="btn-close" data-acct-action="close"${s.busy ? " disabled" : ""}>${esc(MSG.cancel)}</button></div>`;
  }
  // ── Q3 초대: 역할 3종·링크·문구(순수) ───────────────────────────────────────────────────────
  const INVITE_BASE = "https://hoho-granma.github.io/yuka-planner/";
  const INVITE_ROLES = Object.freeze([["DAD", "아빠"], ["CHILD", "자녀"], ["OTHER", "기타"]]);
  const INVITE_LABEL = Object.freeze({ DAD: "아빠", CHILD: "자녀", OTHER: "가족" }); // 빈 자리 기본 이름
  /** 초대 링크: ?join={가족코드}&role={DAD|CHILD|OTHER}&from={초대한 사람 memberId}. */
  function inviteLink(code, role, from) {
    const q = [`join=${encodeURIComponent(normCode(code))}`, `role=${encodeURIComponent(role)}`];
    if (from) q.push(`from=${encodeURIComponent(from)}`);
    return `${INVITE_BASE}?${q.join("&")}`;
  }
  /** 초대 문구: "{이름}({역할})님이 한눈육아 가족 캘린더에 초대했어요" + 링크 + 가족코드. */
  function inviteText(name, roleName, link, code) {
    const who = roleName ? `${name}(${roleName})` : `${name}`;
    return `${who}님이 한눈육아 가족 캘린더에 초대했어요\n${link}\n가족코드: ${normCode(code)}`;
  }
  /** 주소의 쿼리에서 초대 정보를 읽는다. 코드 형식이 잘못되면 null(무시). role 은 DAD/CHILD/OTHER 만, from 은 영문·숫자·_·- 만. */
  function parseJoinParams(search) {
    let p;
    try { p = new URLSearchParams(String(search || "")); } catch (e) { return null; }
    const code = normCode(p.get("join"));
    if (!CODE_RE.test(code)) return null;
    const role = INVITE_ROLES.some(([k]) => k === p.get("role")) ? p.get("role") : "";
    const from = /^[A-Za-z0-9_-]{1,60}$/.test(p.get("from") || "") ? p.get("from") : "";
    return { code, role, from };
  }
  // ── G7 + 메뉴(B 타일 메뉴 + 접이식 시트): 위에 타일 3개(일정 추가·아이 등록하기·가족 추가), 아래에 고른 항목의 시트. 타일 id 는 기존 메뉴 버튼 id 를 그대로 쓴다. ──
  const TILE_ICO = Object.freeze({
    schedule: '<svg class="acct-tile-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M8 3v4M16 3v4M3.5 10h17"/></svg>',
    child: '<svg class="acct-tile-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="3.5"/><path d="M5 20c0-3.5 3-6 7-6s7 2.5 7 6"/></svg>',
    invite: '<svg class="acct-tile-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.3"/><path d="M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5M16 14.5c2.6 0 5 1.6 5 4.5"/></svg>',
  });
  const TILE_ID = Object.freeze({ schedule: "btn-add-menu-schedule", child: "btn-add-menu-child", invite: "btn-add-menu-invite" });
  /** 타일 줄. active: "schedule"|"child"|"invite"|null, o.canSchedule=false 면 일정 타일 비활성. */
  function renderAddTiles(active, o) {
    const can = !(o && o.canSchedule === false);
    const tabs = [["schedule", MSG.addTabSchedule], ["child", MSG.registerChild], ["invite", MSG.inviteMenu]];
    return `<div class="acct-tiles" role="tablist" aria-label="${esc(MSG.addTitle)}">${tabs.map(([k, label]) => `<button type="button" class="acct-tile${active === k ? " on" : ""}" id="${TILE_ID[k]}" data-add-tab="${k}" role="tab" aria-selected="${active === k ? "true" : "false"}"${k === "schedule" && !can ? " disabled" : ""}>${TILE_ICO[k]}<span>${esc(label)}</span></button>`).join("")}</div>`;
  }
  /** + 메뉴 시트(계정 모드): 타일 3개만. state: { canSchedule } */
  function renderAddMenu(state) {
    const s = state || {};
    return `<div class="acct-add" data-acct-form="add-menu"><h3>${esc(MSG.addTitle)}</h3>${renderAddTiles(null, s)}${s.canSchedule === false ? `<p class="fine-print" id="add-menu-note">${esc(MSG.addNeedHousehold)}</p>` : `<p class="fine-print">${esc(MSG.addHint)}</p>`}<button type="button" class="btn-close" id="btn-add-menu-close">${esc(MSG.close)}</button></div>`;
  }
  /** 아이 등록하기 시트(계정 모드): 타일(아이 등록하기 선택) + 입력할 항목 미리보기 + [아이 입력하기]. */
  /** 가족 추가 시트: 타일(가족 추가 선택) + 라디오(아빠/자녀/기타) + 초대 문구 미리보기 + [초대 보내기]. state: { code, role, preview, notice, busy, error, canSchedule } */
  function renderInvite(state) {
    const s = state || {};
    const dis = s.busy ? " disabled" : "";
    if (!s.code) return `<div class="acct-form" data-acct-form="invite"><h3>${esc(MSG.inviteTitle)}</h3><p class="fine-print">${esc(MSG.inviteNone)}</p><button type="button" class="btn-close" data-acct-action="close">${esc(MSG.close)}</button></div>`;
    return `<div class="acct-form acct-add" data-acct-form="invite"><h3>${esc(MSG.addTitle)}</h3>${renderAddTiles("invite", s)}<div class="acct-add-sheet"><h4>${esc(MSG.inviteTitle)}</h4><p class="fine-print">${lines(MSG.inviteBody)}</p>${radios("inviteRole", MSG.inviteWho, INVITE_ROLES, s.role, {})}
      <div class="acct-preview"><span class="acct-preview-l">${esc(MSG.invitePreview)}</span><div class="acct-preview-b">${s.preview ? lines(s.preview) : esc(MSG.invitePreviewEmpty)}</div></div>${s.error ? `<p class="acct-err">${esc(s.error)}</p>` : ""}${s.notice ? `<p class="fine-print">${esc(s.notice)}</p>` : ""}<button type="button" class="btn-complete" data-acct-action="send-invite"${dis || (s.role ? "" : " disabled")}>${esc(MSG.inviteSend)}</button></div><button type="button" class="btn-close" data-acct-action="close">${esc(MSG.close)}</button></div>`;
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

  return { MSG, ROLES, INSTITUTIONS, GENDERS, validateSignup, validateLogin, validateRecover, normCode, toISO, signupTotal, signupStep, signupStepKeys, firstErrorStep, INVITE_ROLES, INVITE_LABEL, inviteLink, inviteText, parseJoinParams, renderLanding, slideIndex, renderBetaPreviewCard, renderBetaConfirm, renderAccountSlot, renderFamilySlot, renderMyCard, renderSlotPick, renderRolePick, renderSignup, renderLogin, renderLogoutConfirm, renderInvite, renderAddTiles, renderAddMenu, renderRecover, renderMigrate, renderEmptyHome, renderEmptyTab, renderNoChildBanner, renderNoChildHome, renderNoChildTab, renderChildSheet, renderMe, roleOptions, syncForm, SITUATIONS, esc };
});
