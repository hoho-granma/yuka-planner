/*
 * user-schedule-view — 가족 캘린더에 "추가한 일정"을 보여 주고 입력받는 화면의 문구·마크업·데이터 변환 (B4 2단계: 순수 함수만).
 * 설계: docs/한눈육아-확장설계-2단계-상세.md §3·§6·§7·§9, B4 계획서(사용자 승인) 및 승인된 문구 목록 #1~#59(#39·#42·#55 수정 반영),
 *       B5 문구목록 R1~R41(docs/한눈육아-B5-문구목록.md, 전체 승인 + G1~G3·R30 결정).
 *
 * 원칙
 *   - DOM·Firestore·localStorage·네트워크를 쓰지 않는다. 문자열(HTML)과 평범한 객체만 만들고, 이벤트 연결·저장은 app.js 가 한다(B4 3단계).
 *   - js/user-schedule.js(UserSchedule)와 js/calendar-model.js(CalendarModel)의 출력 형태를 그대로 받는다. 두 모듈은 바꾸지 않는다.
 *   - 캘린더는 하나다(자동 일정 + 추가한 일정). 별도 "개인" 캘린더·범위는 없다 — scope 는 CHILD / FAMILY 두 가지뿐이다.
 *   - 자동 일정 완료(completed)와 추가한 일정 완료(문서 status)는 섞지 않는다. 이 모듈은 completed 를 받지도 않는다.
 *   - 동적 값(제목·장소·메모·아이 이름)은 전부 이스케이프하고, 색은 고정 팔레트에서만 고른다(스타일 주입 방지).
 *   - 날짜·시각은 "YYYY-MM-DD"/"HH:mm" 문자열 그대로 다룬다(Date 변환·타임존 없음).
 *
 * 의존성(선택 주입): UserSchedule(검증 폴백), DatePicker(HNDatePicker.markup). Node 에서는 require, 브라우저에서는 전역.
 */
(function (root, factory) {
  const mod = factory(
    () => (typeof module !== "undefined" && module.exports ? require("./user-schedule.js") : root.UserSchedule),
    () => (typeof module !== "undefined" && module.exports ? require("./date-picker.js") : root.HNDatePicker),
    () => (typeof module !== "undefined" && module.exports ? require("./schedule-kinds.js") : root.ScheduleKinds),
    () => (typeof module !== "undefined" && module.exports ? require("./time-range.js") : root.TimeRange),
    () => (typeof module !== "undefined" && module.exports ? require("./time-wheel.js") : root.TimeWheel)
  );
  if (typeof module !== "undefined" && module.exports) module.exports = mod;
  else root.UserScheduleView = mod;
})(typeof window !== "undefined" ? window : global, function (getUS, getDP, getSK, getTR, getTW) {
  "use strict";

  // ── 승인된 문구 (번호는 B4 문구 목록 #) ─────────────────────────────────────
  /** 이름 + 목적격 조사: 마지막 글자가 받침 있는 한글이면 '을', 없으면 '를', 한글이 아니면 '을(를)'. */
  function withObjectParticle(name) {
    const t = String(name == null ? "" : name);
    const code = t.length ? t.charCodeAt(t.length - 1) : 0;
    if (code < 0xac00 || code > 0xd7a3) return `${t}을(를)`;
    return `${t}${(code - 0xac00) % 28 === 0 ? "를" : "을"}`;
  }
  const MSG = Object.freeze({
    addButton: "＋ 일정 추가", // #1
    needHousehold: "일정을 추가하려면 프로필에서 가족 캘린더를 만들거나, 가족에게 받은 코드로 참여해 주세요.", // #2 (핫픽스로 교체)
    monthSummary: (n, m) => `이번 달 추가 일정 ${n}개 (완료 ${m})`, // #3
    monthEmpty: "이번 달에 추가한 일정이 없어요.", // #4
    groupAdded: "추가한 일정", // #5
    groupBenefit: "혜택 신청 시작", // #6
    groupPlanned: "추천 항목 (정해진 날이 아니에요)", // #7
    dayEmpty: "이 날 추가한 일정이 없어요.", // #8
    srcAuto: "자동", // G13-1: 날짜 패널의 출처 라벨(접종·검진·혜택 같은 자동 항목)
    srcUser: "직접 입력", // G13-1: 가족이 등록한 일정
    // F1 홈 '다음 일정' 카드(승인 문구 1~5)
    upcomingTitle: "다가오는 우리 가족 일정",
    upcomingTitleFamily: "오늘·이번 주 우리 가족", // E(1-3): 36개월 이상 아이의 홈에서 이 카드가 먼저 올 때의 제목
    upcomingEmpty: "앞으로 7일 안에 등록된 가족 일정이 없어요.",
    upcomingAdd: "일정 추가하기",
    upcomingMore: "캘린더에서 보기 ›",
    upcomingToday: "오늘",
    upcomingTomorrow: "내일",
    // F3 빠른 추가 칩(승인 문구 10~12)
    quickLabel: "자주 쓰는 일정",
    // C2-b1 AUTO 항목 연결(승인 문구 #1~#4)
    autoReserve: "예약 일정 만들기",
    autoReserved: (md) => `예약됨 ${md} · 일정 보기`,
    autoReservedNote: (md) => `예약됨 ${md}`,
    recommendChip: (md) => `추천일 ${md}로 하기`, // 1-7: 예약 폼 날짜 후보(누르면 날짜만 채우고 저장은 사용자가 한다 — I9)
    autoFormNote: (item) => `‘${item}’ 예약 일정이에요. 날짜와 시간을 입력해 주세요.`,
    autoLinkBadge: (item) => `${item} 연결`,
    // C2-b2 완료 제안(승인 문구 #6~#10) — 사용자가 직접 답하는 방식만. 자동으로 완료하지 않고, 공식 기록과 연동된다는 표현은 쓰지 않는다.
    linkRecordTitle: (word) => `${word ? `${word} ` : ""}기록도 남길까요?`,
    linkRecordBody: (sched, md, item) => `‘${sched}’(${md})을 완료로 표시했어요. ‘${item}’도 완료로 기록할까요?`,
    linkRecordYes: "예, 기록할게요",
    linkRecordNo: "아니요",
    linkKeepTitle: "예약 일정은 어떻게 할까요?",
    linkKeepBody: (item, md) => `‘${item}’을 완료했어요. 예약 일정(${md})은 그대로 둘까요?`,
    linkKeepStay: "그대로 두기",
    linkKeepDone: "일정도 완료",
    periodTitle: "이번 달 기간 일정", // #9
    periodNote: "날짜는 아직 정해지지 않았어요.", // #10
    periodRow: (range) => `날짜 미정 · ${range}`, // #11
    legend: "꽉 찬 칩은 직접 등록한 일정, 테두리만 있는 칩은 자동 일정이에요.", // #12 (칩 달력 개편)
    filterAll: "전체", // #13
    meChip: (role) => `나(${role})`, // 계정 모드: 내 구성원 칩
    filterFamily: "가족", // #13
    toggleAuto: "자동 일정 함께 보기", // #14 (구)
    onlyUserSwitch: "직접 등록한 일정만 보기", // 칩 달력 개편: 아이만 선택했을 때 보이는 토글 칩(기본 꺼짐, 켜면 자동 일정 칩 숨김)
    annivSwitch: "아이 생일·100일·돌 보기", // 2-5: 기본 켜짐(기기 저장)
    catColorSwitch: "카테고리별 색깔 다르게 하기", // 칩 달력 개편: 기본 꺼짐
    // #15 "반복 일정은 아직 표시되지 않아요." 는 B5 R38 로 폐기 — 반복 일정이 표시되므로 쓰지 않는다.
    sheetAdd: "일정 추가", // #16
    sheetEdit: "일정 수정", // #17
    titleLabel: "제목", // #18
    titleHint: "예: 피아노 수업", // #18
    categoryLabel: "분류", // #19
    targetLabel: "대상", // #21
    targetFamily: "가족", // #22 (D41: 두 글자 칩)
    assigneeLabel: "담당", // B6-lite (승인본)
    // G13 일정 추가 시트(계정 모드)
    g13Who: "누구 일정인가요?",
    g13WhoMe: "나",
    g13Kind: "카테고리",
    g13Visibility: "공개 범위",
    g13VisFamily: "공개 (가족 캘린더)",
    g13VisPrivate: "비공개 (나만 보기)",
    g13VisNote: "지금은 모든 일정이 가족 캘린더에 공개로 저장돼요.",
    g13Soon: "곧 추가돼요",
    g13RepeatMonthly: "매월",
    g13RepeatNth: "매월 같은 요일",
    assigneeNone: "정하지 않음",
    autoCandAsk: "연결할 접종·검진이 있나요?", autoCandHint: "고르면 그 항목과 이어져요(날짜는 직접 정해요). 고르지 않고 직접 입력해도 돼요.", // 0-C2
    assigneeAsk: "누가 데려가나요?", assigneeCard: (n) => `담당 ${n}`, assigneeNeed: "이 일정은 담당을 정해 두면 좋아요.", // 0-C1 담당 복원
    assigneeHint: "담당을 고르면 카드에 이름이 함께 보여요.",
    assigneeEmph: "누가 맡을지 골라 주세요. 담당을 정해 두면 가족 모두가 알 수 있어요.",
    deletedAssignee: "(삭제된 담당자)", // calendar-model.js 와 같은 문구
    dateLabel: "날짜", // #23
    kindFixed: "날짜 정함", // #24
    kindPeriod: "날짜 미정 (기간)", // #24
    dateField: "날짜", // #25
    endField: "마지막 날", // #25
    multiDay: "여러 날에 걸쳐요", // #26
    periodStart: "시작", // #27
    periodEnd: "끝", // #27
    periodHint: '정해지지 않은 일정은 달력 칸에는 찍히지 않고 "이번 달 기간 일정"에 모여요.', // #28
    allDay: "종일", // #29
    startField: "시작", // #30
    endTimeField: "종료", // #30
    locationLabel: "장소 (선택)", // #31
    locationHint: "예: 구로 음악학원", // #31
    memoLabel: "메모 (선택)", // #32
    memoHint: "준비물이나 참고할 점", // #32
    save: "저장", // #33
    cancel: "취소", // #33
    saving: "저장하는 중이에요…", // #34
    saveFail: "저장하지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.", // #35
    errTitleEmpty: "제목을 입력해 주세요.", // #36
    errTitleLong: "제목은 100자까지 쓸 수 있어요.", // #37
    errCategory: "분류를 골라 주세요.", // #38
    errTarget: '대상을 골라 주세요. 가족 모두와 관련된 일정은 "가족"을 눌러 주세요.', // #39 (수정 승인)
    errDate: "날짜를 골라 주세요.", // #40
    errEndBeforeStart: "마지막 날은 시작하는 날과 같거나 이후여야 해요.", // #41
    errPeriodOrder: "기간의 시작은 끝보다 같거나 앞서야 해요.", // #42 (수정 승인)
    errStartTime: '시작 시각을 골라 주세요. 하루 종일이면 "종일"을 눌러 주세요.', // #43
    errEndTime: "종료 시각은 시작 시각보다 늦어야 해요.", // #44
    errLength: "메모는 500자, 장소는 100자까지 쓸 수 있어요.", // #45
    errGeneric: "입력한 내용을 다시 확인해 주세요.", // #46
    cardFamily: "가족 일정", // #47
    removedChild: "(분리된 아이)", // #49
    timeAllDay: "종일", // #50
    cellPeriod: "기간 ", // 시작일 칸의 기간 일정 표식
    timeRange: (a, b) => `${a} ~ ${b}`, // #50
    timeFrom: (a) => `${a}부터`, // #50
    dateRange: (a, b) => `${a} ~ ${b}`, // #51
    done: "완료", // #52
    btnDone: "완료했어요", // #53
    btnUndone: "완료 취소", // #53
    btnEdit: "수정", // #53
    btnDelete: "삭제", // #53
    btnClose: "닫기", // #53
    deleteTitle: "이 일정을 삭제할까요?", // #54
    deleteBody: "삭제하면 가족 모두의 캘린더에서 사라져요. 지금은 복구할 수 없어요.", // #55 (수정 승인)
    deleteConfirm: "삭제", // #56
    deleteCancel: "취소", // #56
    // G6: 칩 편집(지우기)
    chipEdit: "편집",
    chipEditDone: "완료",
    chipDelAria: (name) => `${name} 지우기`,
    chipDelMemberTitle: (name) => `${withObjectParticle(name)} 가족 캘린더 구성원에서 지울까요?`,
    chipDelMemberBody: "이 사람이 맡은 일정은 남고 담당은 “(삭제된 담당자)”로 보여요.",
    chipDelUidWarn: "이 사람은 가족 계정으로 로그인 중이에요. 지우면 그 사람 화면에서 “나” 표시와 기본 담당이 풀려요. 가족 캘린더 연결은 그대로예요.",
    chipDelChildTitle: (name) => `${withObjectParticle(name)} 가족 캘린더에서 뺄까요?`,
    chipDelChildBody: "아이 기록과 체크리스트는 지워지지 않고, 가족 캘린더에서만 보이지 않아요.",
    chipDelChildBlocked: "지금 보고 있는 아이는 뺄 수 없어요. 다른 아이로 바꾼 뒤 빼 주세요.",
    // 아이 삭제(구성원 관리 > 내가 만든 아이). '빼기'와 달리 그 아이의 일정·할 일까지 함께 지운다.
    chipDelDeleteTitle: (name) => `${withObjectParticle(name)} 삭제할까요?`,
    chipDelDeleteBody: (ev, todo) => `삭제하면 되돌릴 수 없어요. 이 아이의 일정 ${ev}건과 할 일 ${todo}건, 성장·접종 기록과 프로필까지 서버에서 모두 지워지고 가족 캘린더와 이 기기에서도 사라져요.`,
    chipDelDeleteCurrent: "지금 보고 있는 아이예요. 삭제하면 남은 아이로 화면이 바뀌고, 마지막 아이라면 아이가 없는 상태가 돼요.",
    chipDelDeniedNote: "아직 삭제할 수 없어요. 삭제 기능이 서버에 적용되는 중이라, 잠시 뒤에 다시 시도해 주세요. 지금까지 지운 일정·할 일은 다시 시도하면 이어서 지워져요.",
    chipDelNetworkNote: "인터넷 연결이 불안정해 삭제를 마치지 못했어요. 연결을 확인하고 다시 눌러 주세요. 이미 지운 것은 건너뛰고 이어서 지워져요.",
    chipDelDelete: "삭제",
    chipDelMember: "지우기",
    chipDelChild: "빼기",
    chipDelCancel: "취소",
    chipDelClose: "닫기",
    actionFail: "처리하지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.", // #57
    // #58·#59(오프라인 대기·쓰기 거부)는 B3 의 HouseholdView.MSG.pending / denied 를 그대로 재사용한다.

    // ── B5 반복 일정 (승인된 R1~R41) ──
    repeatLabel: "반복", // R1
    repeatNone: "반복 안 함", // R2
    repeatWeekly: "매주", // R2
    repeatBiweekly: "2주마다", // R2
    repeatDaysLabel: "반복 요일", // R3
    firstDayLabel: "첫 날", // R5
    firstDayHint: "첫 날이 고른 요일이 아니면, 그다음 해당 요일부터 시작돼요.", // R6
    untilLabel: "끝나는 날", // R7
    untilNone: "계속 반복", // R8
    untilDate: "날짜까지", // R8
    lastRepeatLabel: "마지막 반복일", // R9
    repeatHint: '반복 일정은 "여러 날에 걸쳐요"와 "날짜 미정"을 함께 쓸 수 없어요.', // R10
    repeatBadge: "반복", // R12
    errNoWeekday: "반복할 요일을 하나 이상 골라 주세요.", // R13
    errUntilBeforeStart: "끝나는 날은 첫 날과 같거나 이후여야 해요.", // R14
    errUntilMissing: "마지막 반복일을 골라 주세요.", // R15
    exceptionsMany: (n) => `이 일정은 날짜별 변경이 많아요. (${n}/200)`, // R16
    exceptionsFull: "날짜별 변경을 더 저장할 수 없어요. 전체 수정으로 정리해 주세요.", // R17
    btnDoneDay: "이 날 완료했어요", // R18
    btnUndoneDay: "이 날 완료 취소", // R18
    editScopeTitle: "반복 일정을 어떻게 수정할까요?", // R20
    editDayLabel: "이 날만 수정", // R21
    editDayDesc: (d) => `${d} 하루만 날짜나 시간을 바꿔요. 다른 날은 그대로예요.`, // R21
    editAllLabel: "전체 수정", // R22
    editAllDesc: "지난 날짜를 포함해 이 반복 일정 전체가 바뀌어요.", // R22
    editScopeNote: "이 날 이후만 바꾸는 기능은 아직 없어요.", // R23
    deleteScopeTitle: "반복 일정을 어떻게 삭제할까요?", // R24
    cancelDayLabel: "이 날만 취소", // R25
    cancelDayDesc: (d) => `${d} 하루만 빼요. 취소한 날은 다시 되돌릴 수 있어요.`, // R25
    deleteAllLabel: "전체 삭제", // R26
    deleteAllDesc: "지난 날짜와 앞으로의 모든 반복이 가족 모두의 캘린더에서 사라져요.", // R26
    scopeBack: "돌아가기", // R27
    cancelDayTitle: (d) => `${d} 일정만 취소할까요?`, // R28
    cancelDayBody: "다른 날은 그대로예요. 취소한 날은 그날 목록에서 되돌릴 수 있어요.", // R28
    cancelDayConfirm: "이 날만 취소", // R28
    deleteAllTitle: "반복 일정 전체를 삭제할까요?", // R29
    deleteAllBody: "삭제하면 가족 모두의 캘린더에서 지난 날짜와 앞으로의 모든 반복이 사라져요. 지금은 복구할 수 없어요.", // R29
    deleteAllConfirm: "전체 삭제", // R29
    ruleChangeTitle: "반복 규칙을 바꿀까요?", // R30
    ruleChangeBody: (n) => `바뀐 규칙에 맞지 않는 날짜의 취소·변경 기록 ${n}개가 함께 정리돼요.`, // R30 (n>0)
    ruleChangeConfirm: "바꾸기", // R30
    editDayTitle: "이 날만 수정", // R31
    editDayNote: (d) => `${d} 하루만 바뀌어요.`, // R31
    editDaySave: "이 날만 저장", // R31
    editAllTitle: "반복 일정 전체 수정", // R32
    editAllNote: "지난 날짜를 포함해 모든 반복에 적용돼요.", // R32
    editAllSave: "전체 저장", // R32
    cancelledBadge: "취소됨", // R33
    btnRestore: "취소 되돌리기", // R34
    movedFrom: (d) => `${d}에서 옮겨 왔어요`, // R35
    // R36(옮기기 전 날짜는 표시 없음)·R37(완료 = #52)·R39~R41 은 기존 문구를 그대로 쓴다.
  });

  const CATEGORIES = Object.freeze([
    { key: "LESSON", label: "수업·학원" },
    { key: "INSTITUTION", label: "어린이집·학교" },
    { key: "MEDICAL", label: "병원·검진" },
    { key: "FAMILY", label: "가족" },
    { key: "ETC", label: "기타" },
  ]); // #20
  const categoryLabel = (key) => (CATEGORIES.find((c) => c.key === key) || { label: "" }).label;

  // ── 아이별 색(링크 order 기반 파생 — 저장하지 않는다) ─────────────────────────
  // 칩 달력 개편(B 마카롱 파스텔): 아이 첫째·둘째·셋째·넷째 이상 / 가족·기타 구성원 / 엄마·아빠(역할 고정, 저장하지 않는다)
  // 대표색 팔레트 10색: 아이·구성원마다 키(colorKey p1~p10, 없으면 childKey/memberId 해시)로 정해 한 번 정해지면 사람이 늘거나 줄어도 바뀌지 않는다.
  // 색 적용(v1.12.92): '선명 팝' 순서. 모두 칩 글자색(--chip-ink #1a1410) 대비 5.7:1 이상, 서로 색차(Lab ΔE) 20 이상(test/h4-chips-members-delete.test.js 가 확인). css/style.css 의 --d1~--d10 과 같은 값이다.
  // D41 최종 팔레트: 테마별 10칸(슬롯 p1~p10 고정, colorKey 호환). 웜 브라운 = 세트 2 '토스트', 딥 포레스트 = 세트 3 '물가 연두'(+d1 #bdf4ff). 배열 순서 = 확정된 색 우선순위(D43, picks/priority-1 final). css/style.css 의 --d1~--d10 과 같은 값이다.
  const PALETTES = Object.freeze({
    warm: Object.freeze(["#a1e3f7", "#f4e07c", "#f47ca8", "#7c90f4", "#d2f7a1", "#f7b5a1", "#a1f7a4", "#b07cf4", "#7cf4c8", "#f7a1f4"]),
    forest: Object.freeze(["#bdf4ff", "#f9d86c", "#fb93c0", "#d5fb93", "#93abfb", "#93fbce", "#b993fb", "#f9846c", "#71f96c", "#f46cf9"]),
  });
  const PALETTE = PALETTES.warm.slice(); // 지금 테마의 10색 — 같은 배열을 제자리에서 바꾼다(setTheme). 칩·막대·얼굴 색은 모두 여기서 나온다.
  let currentTheme = "warm";
  /** 보는 아이 월령에 따라 앱이 부른다: "warm"(36개월 미만·임신 중·아이 없음) | "forest"(36개월 이상). 같은 슬롯 번호가 테마의 색을 받는다. */
  function setTheme(name) {
    const t = PALETTES[name] ? name : "warm";
    currentTheme = t;
    PALETTE.splice(0, PALETTE.length, ...orderedPalette(t));
    return t;
  }
  // 가구 문서 colorOrder(선택 필드): { warm:[0..9 순열], forest:[0..9 순열] } — 슬롯 i 가 기본 팔레트의 order[i] 번 색을 받는다. 없거나 잘못되면 기본 순서.
  let colorOrder = null;
  const isPerm = (a) => Array.isArray(a) && a.length === 10 && new Set(a).size === 10 && a.every((n) => Number.isInteger(n) && n >= 0 && n <= 9);
  /** 문서에서 읽은 값을 검증해 { warm, forest } 중 유효한 순열만 남긴다(전부 잘못되면 null). 순수. */
  function normalizeColorOrder(raw) {
    if (!raw || typeof raw !== "object") return null;
    const out = {};
    for (const k of Object.keys(PALETTES)) if (isPerm(raw[k])) out[k] = raw[k].slice();
    return Object.keys(out).length ? out : null;
  }
  function orderedPalette(t) {
    const base = PALETTES[t], ord = colorOrder && colorOrder[t];
    return ord ? ord.map((n) => base[n]) : base.slice();
  }
  /** 가구 문서의 colorOrder 를 적용한다(읽기 전용 — 쓰기·조정 UI 는 별도). 지금 테마의 팔레트를 제자리에서 다시 맞춘다. */
  function setColorOrder(raw) {
    colorOrder = normalizeColorOrder(raw);
    PALETTE.splice(0, PALETTE.length, ...orderedPalette(currentTheme));
    return colorOrder;
  }
  const getTheme = () => currentTheme;
  const COLOR_KEYS = Object.freeze(PALETTE.map((_, i) => `p${i + 1}`));
  const CHILD_PALETTE = PALETTE; // (옛 이름)
  const hashIndex = (key) => { let h = 0; for (const ch of String(key == null ? "" : key)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h % PALETTE.length; };
  /** key(childKey·memberId)와 문서의 colorKey 로 대표색을 고른다 — colorKey 가 있으면 그 색, 없으면 key 해시(항상 같은 색). */
  const keyColor = (key, colorKey) => { const i = COLOR_KEYS.indexOf(colorKey); return PALETTE[i >= 0 ? i : hashIndex(key)]; };
  const NEUTRAL_HEX = "#c9b8ff"; // 허용 목록 밖 색·알 수 없는 값의 중립색(가족색이 아님)
  const FAMILY_SLOT = 5; // D46: 가족 칩·가족 전체 일정 = 팔레트 6번(p6)
  const familyColor = () => PALETTE[FAMILY_SLOT];
  // 옛 고정색: colorKey 가 없는 엄마·아빠 구성원(예전에 만든 가구)은 계속 이 색을 쓴다(바뀌면 이미 익숙한 색이 달라진다). 새 구성원은 colorKey(팔레트)를 받는다.
  // 엄마 #ff66b3 = 팔레트 p6 와 같은 색, 아빠 #4d9bff = p9 와 같은 색(옛 분홍·파랑 느낌을 그대로 이은 값) — 가장 덜 쓰인 색을 고를 때 이 두 칸을 쓰는 것으로 센다(household-sync LEGACY_ROLE_KEY).
  const MEMBER_COLORS = Object.freeze(Object.defineProperties({}, { MOM: { enumerable: true, get: () => PALETTE[5] }, DAD: { enumerable: true, get: () => PALETTE[8] } })); // D41: 옛 엄마·아빠(colorKey 없음)도 슬롯 p6·p9 의 현재 테마 색(옛 고정 분홍·파랑은 팔레트가 바뀌어 폐지)
  // 카테고리별 색(칩 전용 맵 — 앱의 CATEGORY_META 색과 별개): 자동 6분류 + 등록 일정(병원=검진색·수업/기관=주황·가족/기타=회색)
  // D49: 여섯 분류색은 종류 라벨 세트(테마별, css --k-vx/hc/dv/lf/sf/bn 과 같은 값). 수업·기관·가족·기타는 칩 전용 고정색.
  const KSETS = Object.freeze({
    warm: Object.freeze({ "접종": "#294ee1", "검진": "#9b26d1", "발달": "#199d5a", "생활": "#a58815", "안전": "#f31664", "혜택": "#281cdc" }),
    forest: Object.freeze({ "접종": "#1b7bd9", "검진": "#572bdc", "발달": "#1e9f3f", "생활": "#be8025", "안전": "#f20d5d", "혜택": "#2646c9" }),
  });
  const CATEGORY_COLORS = Object.freeze(Object.defineProperties({}, {
    ...Object.fromEntries(Object.keys(KSETS.warm).map((k) => [k, { enumerable: true, get: () => KSETS[currentTheme][k] }])),
    "수업·기관": { enumerable: true, value: "#ffb87a" }, "가족·기타": { enumerable: true, value: "#d8cdc4" },
  }));
  const NEUTRAL_COLOR = NEUTRAL_HEX;
  const ALL_COLORS = new Set([...PALETTES.warm, ...PALETTES.forest, NEUTRAL_HEX, ...Object.values(KSETS.warm), ...Object.values(KSETS.forest), "#ffb87a", "#d8cdc4"]); // 허용 목록 = 모든 테마 팔레트의 합집합(테마 전환 중에도 다른 세트 색이 라벤더로 바뀌지 않는다)
  /** D41 진한 바탕이면 글자를 자동으로 흰색으로: 기본 글자색(--chip-ink #1a1410)과의 대비가 4.5:1 미만이면 #ffffff. 칩·달력 칩·구성원 알약이 같은 헬퍼를 쓴다. */
  const INK = "#1a1410", WHITE = "#ffffff";
  const lumOf = (hex) => { const m = /^#([0-9a-f]{6})$/i.exec(String(hex || "")); if (!m) return null; const c = [0, 2, 4].map((i) => { const v = parseInt(m[1].slice(i, i + 2), 16) / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  const contrastOf = (a, b) => { const x = lumOf(a), y = lumOf(b); return x == null || y == null ? 21 : (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const inkOn = (bg) => (contrastOf(INK, bg) < 4.5 ? WHITE : INK);
  const safeColor = (c) => (ALL_COLORS.has(c) ? c : NEUTRAL_COLOR);

  const esc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const linkKey = (l) => l.childKey || l.id;
  const activeLinks = (links) => (links || []).filter((l) => l && !l.removedAt).slice().sort((a, b) => (a.order || 0) - (b.order || 0) || (a.addedAt || 0) - (b.addedAt || 0) || (linkKey(a) < linkKey(b) ? -1 : 1));

  /** 아이 색: 링크의 colorKey(없으면 childKey 해시). 순서·인원이 바뀌어도 같은 아이는 같은 색이다. */
  function childColor(link) {
    return keyColor(link && linkKey(link), link && link.colorKey);
  }
  /** { childKey: color } — 분리된 아이도 자기 order 색을 유지한다(과거 일정 표시용). */
  function childColors(links) {
    const out = {};
    (links || []).forEach((l) => (out[linkKey(l)] = childColor(l)));
    return out;
  }
  /** 일정 한 건의 막대 색: 가족 일정=가족색, 아이 일정=childKeys 중 order 가 가장 앞선 아이의 색(공동 일정은 첫 아이 색 + 배지). */
  function childOnlyColor(occ, links) {
    if (!occ || occ.scope === "FAMILY" || !(occ.childKeys || []).length) return familyColor();
    const colors = childColors(links);
    const ordered = (occ.childKeys || []).slice().sort((a, b) => (colorRank(colors[a])) - (colorRank(colors[b])));
    return colors[ordered[0]] || NEUTRAL_COLOR;
  }
  const USER_CATEGORY_GROUP = Object.freeze({ MEDICAL: "검진", LESSON: "수업·기관", INSTITUTION: "수업·기관", FAMILY: "가족·기타", ETC: "가족·기타" });
  const AUTO_CATEGORY_GROUP = Object.freeze({ "예방접종": "접종", "영유아검진": "검진", "발달관찰": "발달", "생활·수유": "생활", "안전·돌봄": "안전", "행정·지원금": "혜택" });
  const userCategoryGroup = (occ) => USER_CATEGORY_GROUP[occ && occ.category] || "가족·기타";
  const autoCategoryGroup = (ev) => AUTO_CATEGORY_GROUP[ev && ev.category] || "가족·기타";
  /**
   * 일정 한 건의 표시색. mode: "owner"(기본: 담당 엄마·아빠 → 아이 → 가족 순) | "child"(아이색만) | "category"(분류색).
   * 홈·주 보기·상세는 기본(owner), 월 달력은 선택한 필터에 따라 정한다.
   */
  function occurrenceColor(occ, links, mode) {
    if (mode === "category") return CATEGORY_COLORS[userCategoryGroup(occ)];
    // D40: 색 = 일정에 해당하는 '누구'(대상)의 대표색. 아이 일정(scope CHILD)은 누가 만들었든·옛 담당 값이 있든 그 아이 색, 구성원 일정(scope FAMILY + assigneeMemberId = 그 구성원)은 그 구성원 색, 그 밖은 가족색.
    if (mode !== "child" && occ && occ.scope !== "CHILD" && occ.assigneeRole && occ.assigneeMemberId) return personColor(occ.assigneeRole, occ.assigneeMemberId, occ.assigneeColorKey); // (삭제된 구성원은 assigneeRole 이 없다)
    return childOnlyColor(occ, links);
  }
  /** 담당·구성원의 대표색 — colorKey 가 있으면 팔레트, 없으면 엄마·아빠는 옛 고정색, 그 밖의 역할은 key 해시색. */
  const personColor = (role, key, colorKey) => (COLOR_KEYS.indexOf(colorKey) < 0 && MEMBER_COLORS[role]) || keyColor(key, colorKey);
  const colorRank = (c) => (CHILD_PALETTE.indexOf(c) >= 0 ? CHILD_PALETTE.indexOf(c) : 99);

  // ── 필터 (칩 달력 개편: 복수 선택) ───────────────────────────────────────────
  /** 선택값 id: "MOM" | "DAD" | "CHILD:<childKey>" | "FAMILY". 선택 배열이 비어 있으면 "전체". 옛 단일 값("ALL"·"FAMILY"·"CHILD:key")도 받아 1개짜리 배열로 바꾼다. */
  /** 계정 모드(D3, opts.memberMode): 칩이 역할(MOM/DAD)이 아니라 구성원 단위 "MEMBER:<memberId>" 다. 라벨은 나=나(엄마)·그 밖은 구성원 라벨. */
  const ROLE_LABELS = Object.freeze({ MOM: "엄마", DAD: "아빠", GRANDPARENT: "조부모", CAREGIVER: "이모님", CHILD: "자녀", OTHER: "기타" });
  const visibleMembersOf = (members) => (members || []).filter((m) => m && !m.deletedAt && (m.memberId || m.id)).slice().sort((a, b) => (a.order || 0) - (b.order || 0) || String(a.label || "").localeCompare(String(b.label || "")) || ((a.memberId || a.id) < (b.memberId || b.id) ? -1 : 1));
  const memberKey = (m) => m.memberId || m.id;
  const memberColor = (m) => personColor(m && m.role, m && memberKey(m), m && m.colorKey); // 역할이 아니라 구성원마다 자기 색
  const LEGACY_SLOT = Object.freeze({ MOM: "p6", DAD: "p9" }); // household-sync LEGACY_ROLE_KEY 와 같다(옛 엄마 분홍·아빠 파랑 = p6·p9 색)
  /**
   * D46 역할 기준 색(화면 전용 — 저장된 colorKey 는 건드리지 않는다). 슬롯(팔레트 칸): 아빠 p1 · 엄마 p2 · 아이 p3~p5(등록 순서, 링크에 생년월일이 있으면 태어난 순서) · 가족 p6(칩·가족 일정) · 그 밖 p7~p10.
   * 그 밖 = 같은 역할의 두 번째 아빠·엄마, 조부모·이모님·자녀·기타, 역할을 모르는 구성원, 아이 6번째 이후(아이 → 구성원 순서, 만든 순서). p7~p10 이 다 차면 나머지는 저장된 colorKey(없으면 해시)로 넘어간다.
   * 삭제된 구성원·분리된 아이는 슬롯을 차지하지 않는다(과거 일정은 저장된 colorKey 색). 가구 colorOrder(슬롯→색 순열)는 PALETTE 에서 이미 적용되므로 이 슬롯 번호 위에 그대로 얹힌다.
   * 반환: { members: Map(memberKey → "p#"), children: Map(childKey → "p#") }
   */
  function roleSlots(members, links) {
    const ck = (n) => COLOR_KEYS[n];
    const liveMembers = (Array.isArray(members) ? members : []).filter((m) => m && !m.deletedAt && memberKey(m)).slice().sort((a, b) => (a.order || 0) - (b.order || 0) || (a.createdAt || 0) - (b.createdAt || 0) || (memberKey(a) < memberKey(b) ? -1 : 1));
    const active = activeLinks(links);
    // 태어난 순서: 활성 아이 모두에게 생년월일(ISO 문자열)이 있을 때만(일부만 있으면 기기마다 순서가 달라지므로 쓰지 않고 등록 순서). 같으면 등록 순서 유지(안정 정렬).
    const byBirth = active.length > 1 && active.every((l) => typeof l.birthDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(l.birthDate));
    const kids = byBirth ? active.slice().sort((a, b) => (a.birthDate < b.birthDate ? -1 : a.birthDate > b.birthDate ? 1 : 0)) : active;
    const outM = new Map(), outC = new Map(), pool = [];
    let dad = false, mom = false;
    const rest = [];
    for (const m of liveMembers) {
      if (m.role === "DAD" && !dad) { dad = true; outM.set(memberKey(m), ck(0)); } else if (m.role === "MOM" && !mom) { mom = true; outM.set(memberKey(m), ck(1)); } else rest.push(m);
    }
    kids.forEach((l, i) => { if (i < 3) outC.set(linkKey(l), ck(2 + i)); else pool.push(["c", linkKey(l)]); });
    rest.forEach((m) => pool.push(["m", memberKey(m)]));
    pool.slice(0, 4).forEach(([kind, key], i) => (kind === "m" ? outM : outC).set(key, ck(6 + i)));
    return { members: outM, children: outC };
  }
  /** members → 같은 길이·같은 순서의 새 배열(colorKey 를 역할 슬롯으로 채움). 슬롯이 없는 구성원(7~10 초과)·삭제된 구성원은 그대로. 화면용 — 저장 안 함. */
  function resolveMemberColors(members, links) {
    const list = Array.isArray(members) ? members : [];
    const slots = roleSlots(list, links).members;
    return list.map((m) => (m && slots.has(memberKey(m)) ? { ...m, colorKey: slots.get(memberKey(m)) } : m));
  }
  /** links → 같은 순서의 새 배열(colorKey 를 역할 슬롯으로 채움). 슬롯이 없는 아이·분리된 아이는 그대로. 화면용 — 저장 안 함. */
  function resolveChildColors(links, members) {
    const list = Array.isArray(links) ? links : [];
    const slots = roleSlots(members, list).children;
    return list.map((l) => (l && slots.has(linkKey(l)) ? { ...l, colorKey: slots.get(linkKey(l)) } : l));
  }
  const roleSet = (members) => new Set((members || []).filter((m) => m && !m.deletedAt).map((m) => m.role));
  function normalizeSelection(selection, links, members, opts) {
    let raw = Array.isArray(selection) ? selection : selection == null || selection === "ALL" ? [] : [selection];
    if (opts && opts.memberMode) {
      // 계정 모드 이전에 저장된 선택(MOM/DAD 역할 칩)은 같은 역할의 구성원 칩으로 옮겨 복원한다.
      const legacy = raw.filter((id) => id === "MOM" || id === "DAD");
      if (legacy.length) raw = [...raw, ...visibleMembersOf(members).filter((m) => legacy.includes(m.role)).map((m) => `MEMBER:${memberKey(m)}`)];
    }
    const kids = activeLinks(links).map((l) => `CHILD:${linkKey(l)}`);
    const roles = members === undefined ? new Set(["MOM", "DAD"]) : roleSet(members);
    const memberIds = opts && opts.memberMode ? visibleMembersOf(members).map((m) => `MEMBER:${memberKey(m)}`) : null;
    const valid = [...(memberIds || ["MOM", "DAD"].filter((r) => roles.has(r))), ...kids, ...(opts && opts.noFamily === true ? [] : ["FAMILY"])]; // G21: noFamily(계정 모드)는 '가족' 칩이 없다 — 저장된 'FAMILY' 선택은 걸러져 '전체'가 된다
    const picked = valid.filter((id) => raw.includes(id));
    return picked.length === valid.length ? [] : picked; // 전부 골랐으면 전체와 같다
  }
  /** "all"(선택 없음) | "kids"(아이만 선택) | "member"(엄마·아빠·가족이 하나라도 선택) */
  function selectionMode(sel) {
    if (!sel || !sel.length) return "all";
    return sel.every((id) => id.startsWith("CHILD:")) ? "kids" : "member";
  }
  /** 칩 라벨: 표시 이름(구성원 label, 내 구성원이면 계정 표시 이름)이 있으면 이름만('나(엄마)' 대신 '주연'). 이름이 없는 옛 구성원(엄마·아빠 시드)은 역할 라벨, 내 구성원은 기존 '나(역할)'. */
  function memberChipLabel(m, opts) {
    const role = ROLE_LABELS[m.role] || ROLE_LABELS.OTHER;
    const isMe = !!(opts && opts.meId && memberKey(m) === opts.meId);
    const own = String(m.label || "").trim();
    const named = own && own !== role && own !== ROLE_LABELS.MOM && own !== ROLE_LABELS.DAD ? own : "";
    if (named) return named;
    if (isMe) return String((opts && opts.meName) || "").trim() || MSG.meChip(role);
    return own || role;
  }
  /** 칩: 엄마·아빠(있는 구성원만) / 아이들(분리된 아이 제외) / 가족. selected 는 복수. */
  function filterChips(links, selection, members, opts) {
    const sel = normalizeSelection(selection, links, members, opts);
    const chips = []; // '전체' 버튼은 없다 — 칩을 모두 해제하면(또는 모두 고르면) 전체가 보인다
    const mem = (members || []).filter((m) => m && !m.deletedAt);
    if (opts && opts.memberMode) {
      // 계정 모드: 구성원마다 칩 하나(내 구성원은 '나(역할)'), 합류한 구성원은 목록에 들어오는 즉시 칩이 늘어난다.
      for (const m of visibleMembersOf(members)) {
        const id = `MEMBER:${memberKey(m)}`;
        const label = memberChipLabel(m, opts);
        chips.push({ id, label, selected: sel.includes(id), color: memberColor(m) });
      }
    } else
    for (const role of ["MOM", "DAD"]) {
      const m = mem.find((x) => x.role === role);
      if (m) chips.push({ id: role, label: m.label || (role === "MOM" ? "엄마" : "아빠"), selected: sel.includes(role), color: personColor(role, memberKey(m), m.colorKey) });
    }
    activeLinks(links).forEach((l) => chips.push({ id: `CHILD:${linkKey(l)}`, label: l.displayName || "", selected: sel.includes(`CHILD:${linkKey(l)}`), color: childColors(links)[linkKey(l)] }));
    if (!(opts && opts.noFamily === true)) chips.push({ id: "FAMILY", label: MSG.filterFamily, selected: sel.includes("FAMILY"), color: familyColor() });
    return chips;
  }
  /** 칩 하나를 눌렀을 때의 새 선택: "ALL" 은 비우기, 그 밖은 토글. */
  function toggleSelection(selection, id, links, members, opts) {
    if (id === "ALL") return [];
    const cur = normalizeSelection(selection, links, members, opts);
    const base = cur.length ? cur : [];
    const next = base.includes(id) ? base.filter((x) => x !== id) : [...base, id];
    return normalizeSelection(next, links, members, opts);
  }
  /** CalendarModel.buildCalendarModel 의 input.filter. onlyUser(직접 등록한 일정만)는 아이만 선택했을 때만 효력이 있다. */
  function toModelFilter(selection, onlyUser, links, members, opts) {
    const sel = normalizeSelection(selection, links, members, opts);
    if (!sel.length) return { scope: "ALL", showAuto: true };
    return { scope: "ALL", showAuto: !(selectionMode(sel) === "kids" && onlyUser === true), owners: sel };
  }
  /** 2-5: 비계정(가구 없음) 캘린더 위의 단독 토글 줄 — 계정 모드는 renderFilterChips 안의 같은 스위치를 쓴다. */
  function renderAnnivSwitch(on) {
    return `<div class="us-optrows"><button type="button" class="us-tchip" role="switch" aria-checked="${on ? "true" : "false"}" data-us-action="toggle-anniv">${esc(MSG.annivSwitch)}</button></div>`;
  }
  /** opts: { mode, onlyUser, catColor } — 토글 칩 2개는 아이만 선택했을 때(mode "kids")만 필터 칩 아래 한 줄에 나란히(role=switch, 라벨만) 보인다. */
  function renderFilterChips(chips, opts) {
    const o = opts || {};
    const del = new Set(Array.isArray(o.deletable) ? o.deletable : []);
    const edit = o.canEdit === true && o.edit === true;
    const items = chips
      .map((c) => {
        const btn = `<button type="button" class="us-chip${c.selected ? " active" : ""}" aria-pressed="${c.selected ? "true" : "false"}" data-us-filter="${esc(c.id)}"${c.color ? ` style="--us-color:${safeColor(c.color)};--us-ink:${inkOn(safeColor(c.color))}"` : ""}>${esc(c.label)}</button>`;
        // G6: 편집 모드에서 지울 수 있는 칩(전체·가족·나 자신은 제외 — 호출부가 deletable 로 알려 준다)에 ✕
        return edit && del.has(c.id) ? `<span class="us-chip-wrap">${btn}<button type="button" class="us-chip-x" data-us-chip-del="${esc(c.id)}" aria-label="${esc(MSG.chipDelAria(c.label))}">✕</button></span>` : btn;
      })
      .join("");
    const editBtn = o.canEdit === true && (del.size > 0 || edit) ? `<button type="button" class="us-chip-edit" data-us-action="chip-edit" aria-pressed="${edit ? "true" : "false"}">${esc(edit ? MSG.chipEditDone : MSG.chipEdit)}</button>` : "";
    const sw = (action, label, on) => `<button type="button" class="us-tchip" role="switch" aria-checked="${on ? "true" : "false"}" data-us-action="${action}">${esc(label)}</button>`;
    const switches = (o.mode === "kids" && o.hideSwitches !== true ? `<div class="us-optrows">${sw("toggle-only-user", MSG.onlyUserSwitch, o.onlyUser === true)}${sw("toggle-cat-color", MSG.catColorSwitch, o.catColor === true)}</div>` : "") + (typeof o.annivOn === "boolean" ? `<div class="us-optrows">${sw("toggle-anniv", MSG.annivSwitch, o.annivOn)}</div>` : "");
    return `<div class="us-filter">${items}${editBtn}</div>${switches}`;
  }
  /** 칩 지우기 확인 시트. d: { kind:"MEMBER"|"CHILD", id, name, uidWarn?, blocked?, busy?, error? } — 버튼 data-us-chipdel-act(confirm|cancel). */
  function renderChipDeleteConfirm(d) {
    const x = d || {};
    const name = x.name || "";
    const isDelete = x.kind === "CHILD_DELETE"; // 완전 삭제(내가 만든 아이) — 일정·할 일 함께 삭제
    const isChild = x.kind === "CHILD" || isDelete;
    if (x.blocked) return `<div class="us-chipdel" data-us-chipdel><h3>${esc(isDelete ? MSG.chipDelDeleteTitle(name) : MSG.chipDelChildTitle(name))}</h3><p class="fine-print">${esc(isDelete ? MSG.chipDelDeleteBlocked : MSG.chipDelChildBlocked)}</p><button type="button" class="btn-close" data-us-chipdel-act="cancel">${esc(MSG.chipDelClose)}</button></div>`;
    const title = isDelete ? MSG.chipDelDeleteTitle(name) : isChild ? MSG.chipDelChildTitle(name) : MSG.chipDelMemberTitle(name);
    const bodyText = isDelete ? MSG.chipDelDeleteBody(x.eventCount || 0, x.todoCount || 0) + (x.current ? " " + MSG.chipDelDeleteCurrent : "") : isChild ? MSG.chipDelChildBody : MSG.chipDelMemberBody;
    const okLabel = isDelete ? MSG.chipDelDelete : isChild ? MSG.chipDelChild : MSG.chipDelMember;
    return `<div class="us-chipdel" data-us-chipdel><h3>${esc(title)}</h3><p class="fine-print">${esc(bodyText)}</p>${!isChild && x.uidWarn ? `<p class="us-note us-chipdel-warn">${esc(MSG.chipDelUidWarn)}</p>` : ""}${x.error ? `<p class="us-note">${esc(x.error)}</p>` : ""}<button type="button" class="btn-complete${isDelete ? " us-chipdel-danger" : ""}" data-us-chipdel-act="confirm"${x.busy ? " disabled" : ""}>${esc(okLabel)}</button><button type="button" class="btn-close" data-us-chipdel-act="cancel"${x.busy ? " disabled" : ""}>${esc(MSG.chipDelCancel)}</button></div>`;
  }
  /**
   * 월 달력 날짜 칸의 제목 칩(최대 2개 + 나머지 +N). items: [{ t:"u", occ } | { t:"a", title, category, done }] 를 직접 등록 → 자동 순으로 받는다.
   * ctx: { links, mode("all"|"member"|"kids"), catColor, autoColor(현재 아이 색) }. 직접 등록=꽉 찬 칩, 자동=옅은 칩+같은 색 테두리, 완료=흐리게.
   */
  function cellChips(items, ctx) {
    const c = ctx || {};
    const catMode = c.mode === "kids" && c.catColor === true;
    const list = (items || []).slice().sort((a, b) => (a.t === "u" ? 0 : 1) - (b.t === "u" ? 0 : 1));
    const show = list.slice(0, 2).map((it) => {
      if (it.t === "u") {
        const col = catMode ? occurrenceColor(it.occ, c.links, "category") : occurrenceColor(it.occ, c.links, c.mode === "kids" ? "child" : "owner");
        const done = it.occ.status === "DONE" || it.occ.done === true;
        return `<span class="cal-chip u${done ? " done" : ""}${it.period ? " p" : ""}" style="background:${safeColor(col)};color:${inkOn(safeColor(col))}">${it.period ? esc(MSG.cellPeriod) : ""}${esc(it.occ.title)}</span>`;
      }
      const col = it.anniv && it.color ? it.color : catMode && !it.anniv ? CATEGORY_COLORS[autoCategoryGroup(it)] : c.autoColor || familyColor(); // 기념일 칩은 그 아이의 구성원 색
      return `<span class="cal-chip a${it.done ? " done" : ""}" style="--chip-c:${safeColor(col)}">${esc(catMode && !it.anniv ? autoCategoryGroup(it) : it.title)}</span>`; // 2-5: 100일·돌·생일 칩은 분류 모드에서도 '생활' 대신 제목을 보인다
    });
    const more = list.length - 2;
    return show.join("") + (more > 0 ? `<span class="cal-chip-more">+${more}</span>` : "");
  }

  // ── 표시용 데이터 변환 ─────────────────────────────────────────────────────
  const md = (s) => `${Number(s.slice(5, 7))}/${Number(s.slice(8, 10))}`; // "2026-10-06" → "10/6"
  const KO_DOW = Object.freeze(["일", "월", "화", "수", "목", "금", "토"]);
  const WEEKDAY_KEYS = Object.freeze(["MO", "TU", "WE", "TH", "FR", "SA", "SU"]);
  const WEEKDAY_LABELS = Object.freeze({ MO: "월", TU: "화", WE: "수", TH: "목", FR: "금", SA: "토", SU: "일" }); // R4
  /** "2026-10-13" → "10/13(화)" — 범위 시트·확인창의 {날짜} 자리 */
  function dayLabel(date) {
    if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return "";
    const [y, m, d] = date.split("-").map(Number);
    const t = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4]; // Sakamoto — Date 객체 없이 요일(0=일)을 구한다
    const yy = m < 3 ? y - 1 : y;
    const dow = (yy + Math.floor(yy / 4) - Math.floor(yy / 100) + Math.floor(yy / 400) + t[m - 1] + d) % 7;
    return `${md(date)}(${KO_DOW[dow]})`;
  }
  /** R11: "매주 화·목 · 10/6부터" / "2주마다 월 · 10/6~2027/2/26"(끝나는 해가 첫 날과 다르면 연도 표시) */
  function repeatSummary(rec) {
    if (!rec || typeof rec !== "object") return "";
    const days = WEEKDAY_KEYS.filter((k) => (rec.byDay || []).includes(k)).map((k) => WEEKDAY_LABELS[k]).join("·");
    const every = rec.interval === 2 ? MSG.repeatBiweekly : MSG.repeatWeekly;
    const start = typeof rec.startDate === "string" && rec.startDate.length >= 10 ? md(rec.startDate) : "";
    let range = "";
    if (start && rec.until) {
      const sameYear = rec.until.slice(0, 4) === rec.startDate.slice(0, 4);
      range = `${start}~${sameYear ? "" : `${Number(rec.until.slice(0, 4))}/`}${md(rec.until)}`;
    } else if (start) range = `${start}부터`;
    return [`${every} ${days}`.trim(), range].filter(Boolean).join(" · ");
  }
  /** 시간 표기(시안 D): 종일 / 오후 4:00 ~ 5:00 (1시간) / 끝이 없으면 시작만. 일정 시간이 보이는 모든 곳이 이 함수를 쓴다. */
  function timeText(o) {
    return getTR().displayText({ allDay: !!o.allDay, startTime: o.startTime, endTime: o.endTime });
  }
  function dateText(o) {
    if (o.dateKind === "PERIOD") return MSG.periodRow(`${md(o.periodStart)}~${md(o.periodEnd)}`);
    return o.endDate && o.endDate !== o.date ? MSG.dateRange(md(o.date), md(o.endDate)) : "";
  }
  /** 칸·카드의 대상 표시: 가족 일정이면 "가족 일정", 아이 일정이면 아이 이름들("A · B"). 분리된 아이는 "(분리된 아이)". */
  /** 카드 태그: 가족 일정이면 '가족 일정', 아이 일정이면 아이 이름들. 담당은 화면에 표시하지 않는다(데이터는 그대로 — 완료한 사람이 자동 기록되는 방식과 별개). */
  function tagText(o) {
    if (o.scope === "FAMILY") return MSG.cardFamily;
    return (o.badges || []).map((b) => (b.removed ? MSG.removedChild : b.displayName)).join(" · ");
  }
  /** 상세의 '대상' 줄: 담당과 별도로 대상만(가족 / 아이 이름들). */
  function targetText(o) {
    if (o.scope === "FAMILY") return MSG.cardFamily;
    return (o.badges || []).map((b) => (b.removed ? MSG.removedChild : b.displayName)).join(" · ");
  }
  /** CalendarModel 의 Occurrence(decorate 포함) → 카드/상세용 평범한 객체. */
  function cardData(occ, links, extra) {
    const cancelled = occ.status === "CANCELLED";
    const done = !cancelled && (occ.status === "DONE" || occ.done === true);
    const base = {
      key: occ.key,
      scheduleId: occ.scheduleId,
      title: occ.title,
      categoryKey: occ.category,
      categoryLabel: categoryLabel(occ.category),
      scope: occ.scope,
      timeText: occ.dateKind === "PERIOD" ? "" : timeText(occ),
      dateText: dateText(occ),
      tag: tagText(occ),
      targetText: targetText(occ),
      assigneeText: occ.assigneeLabel || "",
      color: occurrenceColor(occ, links),
      done,
      doneLabel: done ? MSG.done : "",
      location: occ.location || "",
      memo: occ.memo || "",
      isPeriod: occ.dateKind === "PERIOD",
    };
    if (extra && extra.autoTitle && occ.autoRef) base.autoLinkText = MSG.autoLinkBadge(extra.autoTitle); // C2: 연결된 AUTO 항목 배지(앱이 제목을 줄 때만)
    if (!occ.recurring) return base;
    // 반복 일정의 한 회차(B5): 원래 날짜(originalDate)가 회차의 정체성, 표시 날짜(date)는 이동했으면 다를 수 있다.
    const x = extra || {};
    const n = Number.isInteger(x.exceptionCount) ? x.exceptionCount : null;
    return {
      ...base,
      recurring: true,
      repeatBadge: MSG.repeatBadge,
      repeatSummary: repeatSummary(x.recurrence),
      originalDate: occ.originalDate || occ.date,
      date: occ.date,
      dayLabel: dayLabel(occ.date), // 상세의 "날짜" 줄 — 옮겨진 회차는 지금 놓인 날짜(원래 날짜는 movedText 가 알려 준다)
      cancelled,
      cancelledLabel: cancelled ? MSG.cancelledBadge : "",
      movedText: occ.movedFrom ? MSG.movedFrom(dayLabel(occ.movedFrom)) : "",
      exceptionsNotice: n === null ? "" : exceptionsNotice(n),
    };
  }
  /** R16·R17: 날짜별 변경(exceptions)이 180개 이상이면 안내, 200개면 더 저장할 수 없다는 안내. */
  function exceptionsNotice(n) {
    const US = getUS();
    const warnAt = US && US.EXCEPTION_WARN_AT ? US.EXCEPTION_WARN_AT : 180;
    const max = US && US.LIMITS ? US.LIMITS.exceptionsMax : 200;
    if (n >= max) return MSG.exceptionsFull;
    return n >= warnAt ? MSG.exceptionsMany(n) : "";
  }
  /** 날짜 칸 표식: 모델이 고른 최대 3개를 그리기 좋은 형태로. user=막대(아이색), benefit·planned=원(색은 앱의 기존 카테고리색 사용). */
  function cellMarks(day, links) {
    return {
      marks: (day.marks || []).map((m) =>
        m.kind === "user" ? { kind: "user", shape: "bar", color: occurrenceColor(m.ref, links), done: m.ref.status === "DONE" || m.ref.done === true, key: m.ref.key } : { kind: m.kind, shape: "dot", ref: m.ref }
      ),
      more: day.more || 0,
      total: day.total || 0,
    };
  }
  /** 선택한 날짜 패널: 추가한 일정은 카드 데이터, 자동 일정 두 구역은 제목·개수만(자동 일정 카드 마크업은 기존 앱이 그대로 그린다). */
  function dayPanel(day, links, extra) {
    const recOf = (o) => (extra && extra.docById ? { recurrence: (extra.docById(o.scheduleId) || {}).recurrence } : undefined);
    const extraOf = (o) => {
      const title = extra && extra.autoTitleOf && o.autoRef ? extra.autoTitleOf(o.autoRef) : "";
      return title ? { ...(recOf(o) || {}), autoTitle: title } : recOf(o);
    };
    // 취소한 반복 회차(B5 D4)는 칸 표식·집계에서는 빠지지만 그날 패널에는 흐리게 남아 되돌릴 수 있다. 맨 뒤에 둔다.
    const cards = (day.user || []).concat(day.periodStarts || [], day.cancelled || []).map((o) => cardData(o, links, extraOf(o))); // 기간 일정은 시작일에 '날짜 미정 · 12/1~12/31' 카드로
    return {
      added: { title: MSG.groupAdded, cards },
      benefit: { title: MSG.groupBenefit, count: (day.benefit || []).length },
      planned: { title: MSG.groupPlanned, count: (day.planned || []).length },
      emptyAdded: cards.length === 0,
      emptyText: MSG.dayEmpty,
    };
  }
  /** G13-1: 날짜 패널 카드의 출처 라벨. kind = "auto"(자동 항목 카드 html) | "user"(직접 입력 일정 카드 html). 자동 카드만 제목 바로 앞에 작은 '자동' 라벨을 끼운다.
   *  직접 입력 일정은 가족이 넣는 일정 전부라 따로 표시하지 않는다(모든 계정, html 그대로). */
  function sourceLabeled(html, kind) {
    if (kind !== "auto") return html;
    const label = kind === "auto" ? MSG.srcAuto : MSG.srcUser;
    const mark = `<span class="us-src us-src-${kind === "auto" ? "auto" : "user"}">${esc(label)}</span>`;
    const anchor = kind === "auto" ? '<p class="title">' : '<strong class="us-title">';
    const i = String(html).indexOf(anchor);
    return i < 0 ? html : html.slice(0, i) + mark + html.slice(i);
  }
  /** 캘린더 상단 개수 줄(퍼센트 없음). 자동 일정 진행률과 섞지 않는다. */
  function monthSummary(counts) {
    const n = (counts && counts.userItems) || 0;
    const m = (counts && counts.userDone) || 0;
    return n === 0 ? MSG.monthEmpty : MSG.monthSummary(n, m);
  }
  /** "이번 달 기간 일정": 날짜 미정 일정(periodList). */
  function periodSection(periodList, links) {
    const rows = (periodList || []).map((o) => cardData(o, links));
    return { title: MSG.periodTitle, note: MSG.periodNote, rows, empty: rows.length === 0 };
  }
  /** B5 R38: 반복 일정이 표시되므로 "아직 표시되지 않아요" 안내는 폐기했다. 호출부 호환을 위해 함수만 남기고 항상 빈 문자열. */
  const skippedNote = () => "";

  // ── 카드·상세·삭제 확인·추가 버튼 마크업 ────────────────────────────────────
  function renderCard(c) {
    const meta = [c.categoryLabel, c.timeText, c.dateText, c.assigneeText ? MSG.assigneeCard(c.assigneeText) : ""].filter(Boolean).map(esc).join(" · ");
    const rec = c.recurring === true; // 반복 회차만 아래 군더더기가 붙는다 — 단일·기간 일정의 마크업은 B4 와 같다
    return `<button type="button" class="us-card${c.done ? " done" : ""}${c.cancelled ? " cancelled" : ""}" data-us-key="${esc(c.key)}" data-us-id="${esc(c.scheduleId)}"${rec ? ` data-us-date="${esc(c.originalDate)}"` : ""} style="--us-color:${safeColor(c.color)}">
      <span class="us-bar"></span>
      <span class="us-body"><strong class="us-title">${esc(c.title)}</strong>
        <span class="us-meta">${meta}</span>${rec && c.movedText ? `\n        <span class="us-meta us-moved">${esc(c.movedText)}</span>` : ""}
        ${c.tag ? `<span class="us-tag">${esc(c.tag)}</span>` : ""}${c.autoLinkText ? `<span class="us-tag us-autolink">${esc(c.autoLinkText)}</span>` : ""}${rec ? `<span class="us-tag us-repeat">${esc(c.repeatBadge)}</span>` : ""}
      </span>
      ${c.done ? `<span class="us-done">${esc(c.doneLabel)}</span>` : ""}${c.cancelled ? `<span class="us-cancelled">${esc(c.cancelledLabel)}</span>` : ""}
    </button>`;
  }
  /** 일정 한 건 상세 모달. 완료 버튼은 상태에 따라 "완료했어요" ↔ "완료 취소". */
  function detailView(c) {
    if (c.recurring === true) {
      // 반복 회차: 완료는 "이 날" 기준(R18). 취소된 회차는 되돌리기와 닫기만(R34). 수정·삭제는 범위 시트(R20·R24)로 이어진다.
      const actions = c.cancelled
        ? [{ id: "restore", label: MSG.btnRestore }, { id: "close", label: MSG.btnClose }]
        : [{ id: "toggle-done", label: c.done ? MSG.btnUndoneDay : MSG.btnDoneDay }, { id: "edit", label: MSG.btnEdit }, { id: "delete", label: MSG.btnDelete }, { id: "close", label: MSG.btnClose }];
      return { ...c, actions };
    }
    return { ...c, actions: [{ id: "toggle-done", label: c.done ? MSG.btnUndone : MSG.btnDone }, { id: "edit", label: MSG.btnEdit }, { id: "delete", label: MSG.btnDelete }, { id: "close", label: MSG.btnClose }] };
  }
  /** G15-3: 일정 상세의 대상·담당 앞 사람별 대표색 점(표시만). 아이=아이색(없으면 가족색), 담당=구성원 역할색(없으면 가족색). */
  function detailDots(occ, links) {
    if (!occ) return null;
    return { target: occ.scope === "CHILD" ? childOnlyColor(occ, links) : familyColor(), assignee: occ.assigneeRole && occ.assigneeMemberId ? personColor(occ.assigneeRole, occ.assigneeMemberId, occ.assigneeColorKey) : familyColor() };
  }
  function renderDetail(c, opts) {
    const dots = opts && opts.dots ? opts.dots : null; // 계정 모드 상세에서만 넘어온다(없으면 기존 마크업 그대로)
    const v = detailView(c);
    const rows = [
      [MSG.categoryLabel, v.categoryLabel],
      [MSG.dateLabel, v.recurring ? [v.dayLabel, v.timeText].filter(Boolean).join(" · ") : [v.dateText, v.timeText].filter(Boolean).join(" · ")],
      ...(v.recurring ? [[MSG.repeatLabel, v.repeatSummary], ["", v.movedText]] : []),
      [MSG.targetLabel, v.targetText !== undefined ? v.targetText : v.tag, "target"],
      [MSG.assigneeLabel, v.assigneeText, "assignee"],
      [MSG.locationLabel.replace(/ \(선택\)$/, ""), v.location],
      [MSG.memoLabel.replace(/ \(선택\)$/, ""), v.memo],
    ]
      .filter(([, val]) => val)
      .map(([k, val, dk]) => `<div class="detail-row">${k ? `<div class="label">${esc(k)}</div>` : ""}${dots && dk && dots[dk] ? `<span class="us-val"><i class="us-dot" style="background:${safeColor(dots[dk])}"></i>${esc(val)}</span>` : esc(val)}</div>`)
      .join("");
    const badges = (v.done ? ` <span class="us-done">${esc(MSG.done)}</span>` : "") + (v.cancelled ? ` <span class="us-cancelled">${esc(v.cancelledLabel)}</span>` : "") + (v.recurring ? ` <span class="us-repeat">${esc(v.repeatBadge)}</span>` : "");
    const notice = v.recurring && v.exceptionsNotice ? `<p class="us-note">${esc(v.exceptionsNotice)}</p>` : "";
    return `<div class="us-detail" style="--us-color:${safeColor(v.color)}"><h3>${esc(v.title)}${badges}</h3>${rows}${notice}
      <div class="us-actions">${v.actions.map((a) => `<button type="button" class="us-btn${a.id === "toggle-done" ? " us-primary" : ""}" data-us-action="${a.id}">${esc(a.label)}</button>`).join("")}</div></div>`;
  }
  function renderDeleteConfirm() {
    return `<div class="us-confirm"><h3>${esc(MSG.deleteTitle)}</h3><p>${esc(MSG.deleteBody)}</p>
      <div class="us-actions"><button type="button" class="us-btn us-danger" data-us-action="confirm-delete">${esc(MSG.deleteConfirm)}</button><button type="button" class="us-btn" data-us-action="cancel-delete">${esc(MSG.deleteCancel)}</button></div></div>`;
  }
  // ── 반복 일정: 범위 선택 시트·확인창 (R20~R30) — "이 날만" / "전체" 두 가지뿐, "이후 모두"는 선택지로 만들지 않는다(G1) ──
  const backBtn = `<button type="button" class="us-btn" data-us-action="scope-back">${esc(MSG.scopeBack)}</button>`; // R27
  const scopeOption = (action, label, desc, danger) =>
    `<button type="button" class="us-scope${danger ? " us-danger" : ""}" data-us-action="${action}"><strong>${esc(label)}</strong><span>${esc(desc)}</span></button>`;
  /** 수정 시트. 인자: 눌러서 연 회차의 원래 날짜("YYYY-MM-DD"). */
  function renderEditScopeSheet(originalDate) {
    const d = dayLabel(originalDate);
    return `<div class="us-scope-sheet"><h3>${esc(MSG.editScopeTitle)}</h3>
      ${scopeOption("edit-day", MSG.editDayLabel, MSG.editDayDesc(d))}${scopeOption("edit-all", MSG.editAllLabel, MSG.editAllDesc)}
      <p class="us-note">${esc(MSG.editScopeNote)}</p><div class="us-actions">${backBtn}</div></div>`;
  }
  function renderDeleteScopeSheet(originalDate) {
    const d = dayLabel(originalDate);
    return `<div class="us-scope-sheet"><h3>${esc(MSG.deleteScopeTitle)}</h3>
      ${scopeOption("cancel-day", MSG.cancelDayLabel, MSG.cancelDayDesc(d))}${scopeOption("delete-all", MSG.deleteAllLabel, MSG.deleteAllDesc, true)}
      <div class="us-actions">${backBtn}</div></div>`;
  }
  function renderCancelDayConfirm(originalDate) {
    return `<div class="us-confirm"><h3>${esc(MSG.cancelDayTitle(dayLabel(originalDate)))}</h3><p>${esc(MSG.cancelDayBody)}</p>
      <div class="us-actions"><button type="button" class="us-btn us-danger" data-us-action="confirm-cancel-day">${esc(MSG.cancelDayConfirm)}</button>${backBtn}</div></div>`;
  }
  function renderDeleteAllConfirm() {
    return `<div class="us-confirm"><h3>${esc(MSG.deleteAllTitle)}</h3><p>${esc(MSG.deleteAllBody)}</p>
      <div class="us-actions"><button type="button" class="us-btn us-danger" data-us-action="confirm-delete-all">${esc(MSG.deleteAllConfirm)}</button>${backBtn}</div></div>`;
  }
  /** 규칙 변경 확인창(G2: 반복 규칙을 바꿀 때만). n = 화면에 영향을 주던 예외 중 정리되는 개수(R30 결정). n=0 이면 R30 본문 대신 R32 안내 문장을 쓴다(승인된 문구만 사용). */
  function renderRuleChangeConfirm(n) {
    const body = n > 0 ? MSG.ruleChangeBody(n) : MSG.editAllNote;
    return `<div class="us-confirm"><h3>${esc(MSG.ruleChangeTitle)}</h3><p>${esc(body)}</p>
      <div class="us-actions"><button type="button" class="us-btn us-primary" data-us-action="confirm-rule-change">${esc(MSG.ruleChangeConfirm)}</button>${backBtn}</div></div>`;
  }

  /** 캘린더 선택일 패널의 추가 버튼. 가구가 없으면 안내 문구만. 플래그 OFF → "". */
  function renderAddButton(state) {
    if (!state || state.enabled !== true) return "";
    if (!state.hasHousehold) return `<p class="us-note">${esc(MSG.needHousehold)}</p>`;
    return `<button type="button" class="us-btn us-primary us-add" data-us-action="add">${esc(MSG.addButton)}</button>`;
  }
  function renderPeriodSection(sec) {
    if (!sec || sec.empty) return "";
    return `<section class="us-period"><h4>${esc(sec.title)}</h4><p class="us-note">${esc(sec.note)}</p>${sec.rows.map(renderCard).join("")}</section>`;
  }

  // ── 입력 폼 상태 ───────────────────────────────────────────────────────────
  const PICKER_PREFIXES = Object.freeze({ date: "usd", end: "use", periodStart: "usps", periodEnd: "uspe", until: "usu", day: "usdy" });
  const HOURS = Object.freeze(Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0")));
  const MINUTES = Object.freeze(Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, "0"))); // 5분 단위
  const splitTime = (t) => (/^\d{2}:\d{2}$/.test(t || "") ? { h: t.slice(0, 2), m: t.slice(3, 5) } : { h: "", m: "" });
  /** 5분 단위가 아닌 기존 값(예: 16:07)도 수정 화면에서 그대로 보이도록 선택한 분을 목록에 끼워 넣는다. */
  const minuteOptions = (current) => (current && !MINUTES.includes(current) ? [...MINUTES, current].sort() : MINUTES.slice());

  /** 새 일정 폼. date: 선택한 날짜("YYYY-MM-DD"), 대상 기본값 = 지금 보는 아이(가구에 링크돼 있을 때) 아니면 가족 전체. */
  function newForm({ date, activeChildKey, links, defaultAssigneeId, autoRef, title, defaultScope }) {
    // defaultScope:"FAMILY"(헤더 + 버튼의 일정 추가)면 아이가 링크돼 있어도 대상을 가족 전체로 시작한다(칩으로 아이를 고를 수 있다). 옵션이 없으면 기존과 같다.
    const active = activeLinks(links).some((l) => linkKey(l) === activeChildKey) && defaultScope !== "FAMILY";
    return {
      mode: "create", scheduleId: null, title: "", category: "", scope: active ? "CHILD" : "FAMILY", childKeys: active ? [activeChildKey] : [], assigneeMemberId: defaultAssigneeId || "",
      dateKind: "FIXED", eventDate: date || "", multiDay: false, endDate: "", periodStart: "", periodEnd: "", allDay: true, startTime: "", endTime: "", location: "", memo: "",
      repeat: "NONE", byDay: [], untilMode: "NONE", until: "", wasRecurring: false,
      ...(autoRef ? { autoRef, ...(title ? { title: String(title).slice(0, 100) } : {}), category: "MEDICAL" } : {}), // C2: AUTO 항목 예약 — 제목·분류(병원)를 채우고 날짜·시각은 비워 둔다(I9)
    };
  }
  /** 저장된 일정 문서에서 화면용 id 를 뗀다. getSchedules()/CalendarModel 의 문서에는 id 가 붙어 있는데 UserSchedule.buildPatch(before, …)·validate 는 저장 필드만 허용한다. */
  function stripId(doc) {
    const { id, ...rest } = doc || {};
    return rest;
  }
  /** 저장된 일정 문서(+id) → 수정 폼. */
  function formFromSchedule(doc) {
    const rec = doc.recurrence && typeof doc.recurrence === "object" ? doc.recurrence : null;
    const repeatFields = rec
      ? { repeat: rec.interval === 2 ? "BIWEEKLY" : "WEEKLY", byDay: WEEKDAY_KEYS.filter((k) => (rec.byDay || []).includes(k)), untilMode: rec.until ? "DATE" : "NONE", until: rec.until || "", wasRecurring: true }
      : { repeat: "NONE", byDay: [], untilMode: "NONE", until: "", wasRecurring: false };
    return {
      ...repeatFields,
      mode: "edit", scheduleId: doc.id || null, title: doc.title || "", category: doc.category || "", scope: doc.scope, childKeys: (doc.childKeys || []).slice(), assigneeMemberId: typeof doc.assigneeMemberId === "string" ? doc.assigneeMemberId : "",
      dateKind: doc.dateKind, eventDate: rec ? rec.startDate || "" : doc.eventDate || "", multiDay: !!doc.endDate, endDate: doc.endDate || "", periodStart: doc.periodStart || "", periodEnd: doc.periodEnd || "",
      allDay: doc.allDay !== false, startTime: doc.startTime || "", endTime: doc.endTime || "", location: doc.location || "", memo: doc.memo || "",
      ...(doc.autoRef ? { autoRef: doc.autoRef } : {}),
    };
  }
  const isRepeating = (f) => f.repeat === "WEEKLY" || f.repeat === "BIWEEKLY";
  /** 폼 → UserSchedule.buildCreateDoc 입력(MANUAL). 쓰지 않는 필드는 아예 넣지 않는다. */
  function formToInput(f) {
    const input = { sourceType: "MANUAL", title: String(f.title || "").trim(), category: f.category, scope: f.scope, dateKind: f.dateKind, allDay: !!f.allDay };
    if (f.scope === "CHILD") input.childKeys = (f.childKeys || []).slice();
    if (f.autoRef) input.autoRef = f.autoRef; // C2: 연결은 생성 때만 정해진다(수정은 PATCH_FIELDS 밖)
    if (f.assigneeMemberId && (!f.g13 || (f.scope === "FAMILY" && f.whoPerson === true))) input.assigneeMemberId = f.assigneeMemberId; // 미지정이면 필드 생략(규칙은 null 을 허용하지 않는다). 계정 모드(g13) 새 일정은 구성원 일정(누구=구성원)일 때만 저장 — 아이·가족 일정에 담당 기본값을 남기지 않는다(D40)
    if (isRepeating(f)) {
      // 반복: 첫 날은 recurrence.startDate 에 둔다(eventDate·endDate 없음 — I3·I4). 키 순서는 설계서 §6-1 과 같다.
      input.dateKind = "FIXED";
      input.recurrence = { freq: "WEEKLY", interval: f.repeat === "BIWEEKLY" ? 2 : 1, byDay: WEEKDAY_KEYS.filter((k) => (f.byDay || []).includes(k)), startDate: f.eventDate, until: f.untilMode === "DATE" && f.until ? f.until : null };
    } else if (f.dateKind === "PERIOD") {
      input.periodStart = f.periodStart;
      input.periodEnd = f.periodEnd;
    } else {
      input.eventDate = f.eventDate;
      if (f.multiDay && f.endDate) input.endDate = f.endDate;
    }
    if (!f.allDay) {
      input.startTime = f.startTime;
      if (f.endTime) input.endTime = f.endTime;
    }
    const loc = String(f.location || "").trim();
    const memo = String(f.memo || "").trim();
    if (loc) input.location = loc;
    if (memo) input.memo = memo;
    return input;
  }
  /** 화면에서 먼저 하는 친절한 검증(승인된 문구). 통과하면 { ok:true }. 서버·문서 불변식은 UserSchedule.validate 가 다시 확인한다. */
  function validateForm(f) {
    const errors = [];
    const add = (field, message) => errors.push({ field, message });
    const title = String(f.title || "").trim();
    if (!title) add("title", MSG.errTitleEmpty);
    else if (title.length > 100) add("title", MSG.errTitleLong);
    if (!f.category) add("category", MSG.errCategory);
    if (f.scope === "CHILD" && !(f.childKeys || []).length) add("target", MSG.errTarget);
    if (f.autoRef && (f.scope !== "CHILD" || (f.childKeys || []).length !== 1)) add("target", MSG.errTarget); // I13: 연결 일정은 아이 1명
    if (isRepeating(f)) {
      if (!f.eventDate) add("date", MSG.errDate);
      if (!(f.byDay || []).length) add("byDay", MSG.errNoWeekday); // R13
      if (f.untilMode === "DATE") {
        if (!f.until) add("until", MSG.errUntilMissing); // R15
        else if (f.eventDate && f.until < f.eventDate) add("until", MSG.errUntilBeforeStart); // R14
      }
    } else if (f.dateKind === "PERIOD") {
      if (!f.periodStart || !f.periodEnd) add("period", MSG.errDate);
      else if (f.periodStart > f.periodEnd) add("period", MSG.errPeriodOrder);
    } else {
      if (!f.eventDate) add("date", MSG.errDate);
      else if (f.multiDay && f.endDate && f.endDate < f.eventDate) add("endDate", MSG.errEndBeforeStart);
    }
    if ((f.dateKind !== "PERIOD" || isRepeating(f)) && !f.allDay) {
      if (!f.startTime) add("startTime", MSG.errStartTime);
      else if (f.endTime && f.endTime <= f.startTime) add("endTime", MSG.errEndTime);
    }
    if (String(f.memo || "").trim().length > 500 || String(f.location || "").trim().length > 100) add("memo", MSG.errLength);
    return { ok: errors.length === 0, errors };
  }
  /** UserSchedule 의 오류(코드·필드) → 화면 문구. 모르는 오류는 #46. 같은 문구는 한 번만. */
  function messagesFromErrors(errs) {
    const out = [];
    for (const e of errs || []) {
      const f = e.field || "";
      let m = MSG.errGeneric;
      if (f === "recurrence.byDay") m = MSG.errNoWeekday;
      else if (f === "recurrence.until") m = MSG.errUntilBeforeStart;
      else if (f === "recurrence.startDate") m = MSG.errDate;
      else if (e.code === "I10" && f === "exceptions") m = MSG.exceptionsFull;
      else if (f === "title") m = MSG.errTitleEmpty;
      else if (f === "category") m = MSG.errCategory;
      else if (f === "childKeys" || e.code === "I7") m = MSG.errTarget;
      else if (e.code === "I1" || f === "eventDate" || e.code === "I11") m = MSG.errDate;
      else if (e.code === "I4") m = MSG.errEndBeforeStart;
      else if (e.code === "I2") m = f === "periodStart" && /≤/.test(e.message || "") ? MSG.errPeriodOrder : MSG.errDate;
      else if (e.code === "I5" && f === "startTime") m = MSG.errStartTime;
      else if (e.code === "I5" && f === "endTime") m = MSG.errEndTime;
      else if (f === "memo" || f === "location") m = MSG.errLength;
      if (!out.includes(m)) out.push(m);
    }
    return out;
  }
  /** 화면 검증 + 문서 불변식 검증을 모두 거친 저장 입력. { ok, input, messages } */
  function prepareSave(f, now) {
    const v = validateForm(f);
    if (!v.ok) return { ok: false, messages: v.errors.map((e) => e.message) };
    const input = formToInput(f);
    const US = getUS();
    if (US) {
      const r = US.buildCreateDoc(input, now || 0);
      if (!r.ok) return { ok: false, messages: messagesFromErrors(r.errors) };
    }
    return { ok: true, input, messages: [] };
  }
  const PATCH_FIELDS = Object.freeze(["title", "category", "scope", "childKeys", "dateKind", "eventDate", "endDate", "periodStart", "periodEnd", "allDay", "startTime", "endTime", "location", "memo", "assigneeMemberId"]);
  /** 규칙 비교(키 순서·interval 생략 무시): 같은 규칙이면 true. Firestore 는 맵 키를 정렬해 돌려줄 수 있어 JSON 문자열 비교를 쓰지 않는다. */
  function sameRule(a, b) {
    if (!a || !b) return !a && !b;
    const norm = (r) => JSON.stringify({ f: r.freq, i: r.interval || 1, d: WEEKDAY_KEYS.filter((k) => (r.byDay || []).includes(k)), s: r.startDate, u: r.until || null });
    return norm(a) === norm(b);
  }
  /** 수정 폼 → UserSchedule.buildPatch 의 changes. 바뀐 필드만, 쓰지 않게 된 필드는 null(=삭제). */
  function changesFromForm(f, before) {
    const input = formToInput(f);
    const changes = {};
    for (const k of PATCH_FIELDS) {
      const next = input[k];
      const prev = before[k];
      if (next === undefined) {
        if (prev !== undefined && prev !== null) changes[k] = null;
      } else if (JSON.stringify(next) !== JSON.stringify(prev)) changes[k] = next;
    }
    // 반복 규칙(B5): 의미가 달라졌을 때만 recurrence 를 보낸다. 반복 → 단일이면 null(삭제).
    if (input.recurrence) {
      if (!sameRule(input.recurrence, before.recurrence)) changes.recurrence = input.recurrence;
    } else if (before.recurrence) changes.recurrence = null;
    return changes;
  }
  /**
   * "전체 수정" 계획(순수): 폼 + 저장된 문서(id 없는 것) → UserSchedule.editAll 결과를 감싼 화면용 계획.
   *   { ok, messages, changes, patch, after, ruleChanged, prunedEffective, confirm }
   *   confirm 은 반복 규칙(요일·간격·첫 날·끝나는 날, 반복 켜기/끄기)이 바뀔 때만 true(G2) — 그때 R30 확인창을 띄운 뒤 patch 를 저장한다.
   *   prunedEffective 는 화면에 영향을 주던 예외만 센 정리 개수(R30 결정).
   */
  function planFullEdit(f, before, now) {
    const US = getUS();
    const v = validateForm(f);
    if (!v.ok) return { ok: false, messages: v.errors.map((e) => e.message), confirm: false };
    const changes = changesFromForm(f, before);
    const ruleChanged = Object.prototype.hasOwnProperty.call(changes, "recurrence");
    if (!US) return { ok: true, messages: [], changes, patch: null, after: null, ruleChanged, prunedEffective: 0, confirm: ruleChanged };
    const r = US.editAll(before, changes, now);
    if (!r.ok) return { ok: false, messages: messagesFromErrors(r.errors), confirm: false };
    return { ok: true, messages: [], changes, patch: r.patch, after: r.after, ruleChanged, pruned: r.pruned, prunedEffective: r.prunedEffective, confirm: ruleChanged };
  }

  // ── G13 일정 추가 시트(계정 모드): 누구 일정 → 그 사람에 맞는 카테고리 → 제목 자동 → 날짜·시간 → 반복 → 장소·담당·메모 → 공개 범위 ──
  // 저장 필드는 기존 그대로다: 아이=scope CHILD+childKeys, 어른=scope FAMILY+담당자(assigneeMemberId)=그 사람, 가족 전체=scope FAMILY. 새 필드·규칙 변경 없음.
  const whoKeyOf = (f) => (f.scope === "CHILD" ? `CHILD:${(f.childKeys || [])[0] || ""}` : f.assigneeMemberId && f.whoPerson ? `MEMBER:${f.assigneeMemberId}` : "FAMILY");
  /** 카테고리 목록의 대상 구분: MEMBER → ADULT, CHILD → CHILD(+나이), FAMILY. */
  function g13Kinds(f, ctx) {
    const SK = getSK();
    if (!SK) return [];
    const t = f.whoPerson ? "ADULT" : f.scope === "CHILD" ? "CHILD" : "FAMILY";
    return SK.kindsFor(t, t === "CHILD" && ctx && ctx.ageOf ? ctx.ageOf((f.childKeys || [])[0]) : null);
  }
  /** 고른 사람(whoKey)을 폼 필드로 옮기고, 새 목록에 없는 카테고리는 비운다(직접 고친 제목은 그대로). */
  function g13ApplyWho(f, whoKey, ctx) {
    const [type, id] = String(whoKey).split(/:(.*)/s);
    const wasPerson = !!f.whoPerson;
    if (type === "MEMBER") { f.scope = "FAMILY"; f.childKeys = []; f.assigneeMemberId = id || ""; f.whoPerson = true; }
    else if (type === "CHILD") { f.scope = "CHILD"; f.childKeys = id ? [id] : []; f.whoPerson = false; f.assigneeMemberId = ""; } // D40: 담당(데려가는 사람)은 더 이상 받지 않는다
    else { f.scope = "FAMILY"; f.childKeys = []; f.whoPerson = false; f.assigneeMemberId = ""; }
    const list = g13Kinds(f, ctx);
    if (f.kindPick && !list.some((x) => x.label === f.kindPick)) {
      const SK = getSK();
      if (SK && !f.titleTouched && f.title === f.kindPick) f.title = "";
      f.kindPick = "";
      f.category = "";
    }
    return f;
  }
  /** 카테고리 칩을 눌렀을 때: category enum 을 정하고 제목을 자동으로 채운다(직접 고친 제목은 덮어쓰지 않는다). */
  function g13PickKind(f, label, ctx) {
    const SK = getSK();
    const hit = g13Kinds(f, ctx).find((x) => x.label === label);
    if (!SK || !hit) return f;
    f.kindPick = hit.label;
    f.category = hit.category;
    f.title = SK.nextTitle(f.title, f.titleTouched === true, hit.label);
    return f;
  }
  /**
   * 기존 폼(newForm·formFromSchedule 이 만든 것)을 계정 모드 시트용으로 바꾼다(저장 필드는 그대로, 보기 상태만 더한다).
   * 새 일정: 기본은 본인(구성원을 알 때), 모르면 가족 전체. 수정: 저장된 제목은 카테고리를 바꿔도 덮어쓰지 않는다.
   * ctx: { meId, ageOf(childKey)→개월수|"PREGNANT"|null }
   */
  function upgradeFormG13(f, ctx) {
    const c = ctx || {};
    f.g13 = true;
    f.kindPick = "";
    if (f.mode === "edit") {
      f.titleTouched = true;
      f.whoPerson = f.scope === "FAMILY" && typeof f.assigneeMemberId === "string" && !!f.assigneeMemberId;
      const hit = g13Kinds(f, c).find((x) => x.label === f.title); // 제목이 지금 사람·나이 기준 카테고리 이름과 같으면 그 칩을 선택 상태로(표시만, 저장 필드는 그대로)
      f.kindPick = hit ? hit.label : "";
      return f;
    }
    f.titleTouched = false;
    f.whoPerson = false;
    return g13ApplyWho(f, f.scope === "CHILD" && (f.childKeys || [])[0] ? `CHILD:${f.childKeys[0]}` : c.meId ? `MEMBER:${c.meId}` : "FAMILY", c); // D40: 새 일정의 '누구' 기본 = 지금 보는 아이(아이가 없는 가구는 본인, 모르면 가족 전체)
  }
  const soonChip = (label) => `<button type="button" class="us-chip us-chip-soon" disabled aria-disabled="true">${esc(label)}<small>${esc(MSG.g13Soon)}</small></button>`;
  /** 계정 모드 일정 추가·수정 시트. opts: renderForm 과 같음 + { ctx } */
  function renderFormG13(f, links, opts) {
    const o = opts || {};
    const ctx = o.ctx || {};
    const kids = activeLinks(links);
    const colors = childColors(links);
    const members = Array.isArray(o.members) ? o.members : [];
    const meId = ctx.meId || "";
    const ordered = members.slice().sort((a, b) => (a.memberId === meId ? -1 : 0) - (b.memberId === meId ? -1 : 0));
    const whoChips =
      ordered.map((m) => chip("", `data-us-who="MEMBER:${esc(m.memberId)}"`, m.memberId === meId ? MSG.g13WhoMe : m.label || "", f.whoPerson && f.assigneeMemberId === m.memberId, memberColor(m))).join("") +
      kids.map((l) => chip("", `data-us-who="CHILD:${esc(linkKey(l))}"`, l.displayName || "", f.scope === "CHILD" && (f.childKeys || []).includes(linkKey(l)), colors[linkKey(l)])).join("") +
      chip("", 'data-us-who="FAMILY"', MSG.targetFamily, f.scope === "FAMILY" && !f.whoPerson);
    const kindChips = g13Kinds(f, ctx).map((x) => chip("", `data-us-sk="${esc(x.label)}"`, x.label, f.kindPick === x.label)).join("");
    const fixed = f.dateKind !== "PERIOD";
    const repeating = fixed && isRepeating(f);
    const repeatBlock = !fixed
      ? ""
      : `<div class="us-field"><label>${esc(MSG.repeatLabel)}</label><div class="us-chips">${chip("", 'data-us-repeat="NONE"', MSG.repeatNone, !repeating)}${chip("", 'data-us-repeat="WEEKLY"', MSG.repeatWeekly, f.repeat === "WEEKLY")}${chip("", 'data-us-repeat="BIWEEKLY"', MSG.repeatBiweekly, f.repeat === "BIWEEKLY")}${soonChip(MSG.g13RepeatMonthly)}${soonChip(MSG.g13RepeatNth)}</div></div>`;
    const repeatDetail = !repeating
      ? ""
      : `<div class="us-field"><label>${esc(MSG.repeatDaysLabel)}</label><div class="us-chips">${WEEKDAY_KEYS.map((k) => chip("", `data-us-day="${k}"`, WEEKDAY_LABELS[k], (f.byDay || []).includes(k))).join("")}</div></div>
         <p class="us-note">${esc(MSG.firstDayHint)}</p>
         <div class="us-field"><label>${esc(MSG.untilLabel)}</label><div class="us-chips">${chip("", 'data-us-until="NONE"', MSG.untilNone, f.untilMode !== "DATE")}${chip("", 'data-us-until="DATE"', MSG.untilDate, f.untilMode === "DATE")}</div></div>
         ${f.untilMode === "DATE" ? `<div class="us-field"><label>${esc(MSG.lastRepeatLabel)}</label>${picker(PICKER_PREFIXES.until, f.until)}</div>` : ""}
         <p class="us-note">${esc(MSG.repeatHint)}</p>`;
    const dates = fixed
      ? `<div class="us-field"><label>${esc(repeating ? MSG.firstDayLabel : MSG.dateField)}</label>${picker(PICKER_PREFIXES.date, f.eventDate)}</div>
         <label class="us-check"><input type="checkbox" id="us-allday"${f.allDay ? " checked" : ""} /> ${esc(MSG.allDay)}</label>
         ${f.allDay ? "" : timesBlock(f)}
         ${repeating ? "" : `<label class="us-check"><input type="checkbox" id="us-multi"${f.multiDay ? " checked" : ""} /> ${esc(MSG.multiDay)}</label>
         ${f.multiDay ? `<div class="us-field"><label>${esc(MSG.endField)}</label>${picker(PICKER_PREFIXES.end, f.endDate)}</div>` : ""}`}
         ${repeatBlock}${repeatDetail}`
      : `<div class="us-field"><label>${esc(MSG.periodStart)}</label>${picker(PICKER_PREFIXES.periodStart, f.periodStart)}</div>
         <div class="us-field"><label>${esc(MSG.periodEnd)}</label>${picker(PICKER_PREFIXES.periodEnd, f.periodEnd)}</div>
         <p class="us-note">${esc(MSG.periodHint)}</p>`;
    // 0-C1: 담당 칩 복원("누가 데려가나요?" — 아이·가족 일정 모두). 대상을 구성원으로 고른 경우(whoPerson)는 그 사람이 담당이라 칩을 두지 않는다. 필드는 기존 assigneeMemberId.
    const asgMembers = members.filter((m) => m && m.memberId);
    const assignee = ""; // D40: 담당(누가 데려가나요?) 칩은 없앴다 — 일정의 색·주인은 위 '누구' 칩 하나로 정한다. 옛 일정의 담당 값은 그대로 읽힌다.
    // 0-C2: '예방접종' 종류를 고르면 그 아이의 미완료 접종·검진 후보를 보여 준다. 고르면(앱이 그 항목으로 예약 폼을 연다) 연결되고, 고르지 않으면 직접 입력 그대로 — 자동 선택 없음.
    const cands = Array.isArray(o.autoCandidates) ? o.autoCandidates : [];
    const autoCand = f.mode === "create" && !f.autoRef && f.kindPick === "예방접종" ? renderAutoCand(cands) : "";
    const errors = (o.messages || []).map((m) => `<p class="us-error">${esc(m)}</p>`).join("");
    const edit = f.mode === "edit";
    return `<div class="us-form us-form-g13" data-us-mode="${esc(f.mode)}">
      <h3>${esc(f.wasRecurring && edit ? MSG.editAllTitle : edit ? MSG.sheetEdit : MSG.sheetAdd)}</h3>${f.wasRecurring && edit ? `\n      <p class="us-note">${esc(MSG.editAllNote)}</p>` : ""}
      <div class="us-field"><label>${esc(MSG.g13Who)}</label><div class="us-chips">${whoChips}</div></div>
      <div class="us-field"><label>${esc(MSG.g13Kind)}</label><div class="us-chips" data-us-kinds>${kindChips}</div></div>
      ${autoCand}
      <div class="us-field"><label for="us-title">${esc(MSG.titleLabel)}</label><input type="text" id="us-title" maxlength="100" placeholder="${esc(MSG.titleHint)}" value="${esc(f.title)}" /></div>
      <div class="us-field"><label>${esc(MSG.dateLabel)}</label><div class="us-chips">${chip("", 'data-us-kind="FIXED"', MSG.kindFixed, fixed)}${repeating ? `<button type="button" class="us-chip" disabled>${esc(MSG.kindPeriod)}</button>` : chip("", 'data-us-kind="PERIOD"', MSG.kindPeriod, !fixed)}</div></div>
      ${dates}
      ${assignee}
      <div class="us-field"><label for="us-location">${esc(MSG.locationLabel)}</label><input type="text" id="us-location" maxlength="100" placeholder="${esc(MSG.locationHint)}" value="${esc(f.location)}" /></div>
      <div class="us-field"><label for="us-memo">${esc(MSG.memoLabel)}</label><textarea id="us-memo" maxlength="500" placeholder="${esc(MSG.memoHint)}">${esc(f.memo)}</textarea></div>
      ${/* G21: 공개 범위(공개/비공개) 항목은 화면에서 숨긴다(저장 필드는 그대로) */""}
      <div id="us-errors">${errors}</div>
      ${o.saving ? `<p class="us-note">${esc(MSG.saving)}</p>` : ""}
      <div class="us-actions"><button type="button" class="us-btn us-primary" data-us-action="save"${o.saving ? " disabled" : ""}>${esc(f.wasRecurring && edit ? MSG.editAllSave : MSG.save)}</button><button type="button" class="us-btn" data-us-action="cancel">${esc(MSG.cancel)}</button></div>
    </div>`;
  }

  // ── "이 날만 수정" 폼 (R31): 날짜·시각만 ─────────────────────────────────────
  /** 회차(occ) + 저장 문서 → 폼. 문서가 종일이 아니면 종일로 바꿀 수 없다(이동 예외는 시각을 지울 수 없음 — canAllDay=false). */
  function dayFormFromOccurrence(occ, doc) {
    return {
      mode: "day", scheduleId: occ.scheduleId || (doc && doc.id) || null, originalDate: occ.originalDate || occ.date, date: occ.date,
      allDay: occ.allDay !== false, startTime: occ.startTime || "", endTime: occ.endTime || "", canAllDay: !doc || doc.allDay !== false,
    };
  }
  function validateDayForm(f) {
    const errors = [];
    if (!f.date) errors.push({ field: "date", message: MSG.errDate });
    if (!f.allDay) {
      if (!f.startTime) errors.push({ field: "startTime", message: MSG.errStartTime });
      else if (f.endTime && f.endTime <= f.startTime) errors.push({ field: "endTime", message: MSG.errEndTime });
    }
    return { ok: errors.length === 0, errors };
  }
  /** 폼 → UserSchedule.moveOccurrence 의 to. 원래 날짜·시각 그대로면 { date } 만 줘서 이동이 해제된다. */
  function dayFormToMove(f, doc) {
    const to = { date: f.date };
    if (f.allDay) return to;
    const autoEnd = !!(f.endAuto && doc && !doc.endTime); // 끝 시간이 없던 일정에 화면용으로 채운 끝은 사용자가 만지기 전까지 없는 것으로 본다
    const same = doc && doc.allDay === false && f.startTime === doc.startTime && (autoEnd || (f.endTime || null) === (doc.endTime || null));
    if (!same || f.date !== f.originalDate) {
      to.startTime = f.startTime;
      if (f.endTime && !autoEnd) to.endTime = f.endTime;
    }
    return to;
  }

  // ── 입력 시트 마크업 ───────────────────────────────────────────────────────
  const chip = (cls, attrs, label, active, color) => `<button type="button" class="us-chip${cls ? " " + cls : ""}${active ? " active" : ""}" ${attrs}${color ? ` style="--us-color:${safeColor(color)};--us-ink:${inkOn(safeColor(color))}"` : ""}>${esc(label)}</button>`;
  const timeSelect = (id, value, label) => {
    const p = splitTime(value);
    return `<span class="us-time"><label for="${id}-h">${esc(label)}</label><select id="${id}-h" data-us-time="${id}"><option value="">--</option>${HOURS.map((h) => `<option value="${h}"${p.h === h ? " selected" : ""}>${h}</option>`).join("")}</select><select id="${id}-m" data-us-time="${id}"><option value="">--</option>${minuteOptions(p.m).map((m) => `<option value="${m}"${p.m === m ? " selected" : ""}>${m}</option>`).join("")}</select></span>`;
  };
  /** 시간 입력(시안 B): 한 줄 범위 + 휠. 시작·끝은 'HH:MM' 두 필드 그대로, 시간이 비어 있으면 기본값(오전 9:00~10:00)을 보여 주고 앱이 폼에 채운다. 활성 칸·경고는 폼의 twActive·twWarn. */
  function timesBlock(f) {
    const TW = getTW();
    const base = TW.initState(f.startTime, f.endTime);
    const st = { start: f.startTime || base.start, end: f.endTime || base.end, active: f.twActive === "end" ? "end" : "start", warn: f.twWarn || "" };
    return `<div class="us-times us-tw">${TW.markup("us", st)}</div>`;
  }
  function picker(prefix, value, placeholder) {
    const DP = getDP();
    const html = DP ? DP.markup(prefix, placeholder) : `<div id="${prefix}-slot"></div>`;
    return value ? html.replace(`id="${prefix}-date"`, `id="${prefix}-date" value="${esc(value)}"`) : html;
  }
  /** 일정 추가·수정 시트. links: 아이 링크(분리된 아이는 선택지에서 제외). 날짜 달력 컴포넌트(HNDatePicker)는 app.js 가 bind 한다. */
  function renderForm(f, links, opts) {
    const o = opts || {};
    const kids = activeLinks(links);
    const colors = childColors(links);
    const cats = CATEGORIES.map((c) => chip("", `data-us-cat="${c.key}"`, c.label, f.category === c.key)).join("");
    const targets =
      kids.map((l) => chip("", `data-us-target="${esc(linkKey(l))}"`, l.displayName || "", f.scope === "CHILD" && (f.childKeys || []).includes(linkKey(l)), colors[linkKey(l)])).join("") +
      chip("", 'data-us-target="FAMILY"', MSG.targetFamily, f.scope === "FAMILY");
    // 담당(B6-lite): 구성원이 있을 때만. 단일 선택, 다시 누르면 해제(정하지 않음). 저장된 담당이 삭제된 구성원이면 그 사실을 칩으로 보여 준다.
    const locked = !!f.autoRef; // C2: 연결된 AUTO 예약은 대상(아이 1명)·날짜 종류(날짜 정함)·반복을 바꿀 수 없다
    const fixed = f.dateKind !== "PERIOD";
    const repeating = fixed && isRepeating(f);
    const repeatBlock = !fixed || locked
      ? ""
      : `<div class="us-field"><label>${esc(MSG.repeatLabel)}</label><div class="us-chips">${chip("", 'data-us-repeat="NONE"', MSG.repeatNone, !repeating)}${chip("", 'data-us-repeat="WEEKLY"', MSG.repeatWeekly, f.repeat === "WEEKLY")}${chip("", 'data-us-repeat="BIWEEKLY"', MSG.repeatBiweekly, f.repeat === "BIWEEKLY")}</div></div>`;
    const repeatDetail = !repeating
      ? ""
      : `<div class="us-field"><label>${esc(MSG.repeatDaysLabel)}</label><div class="us-chips">${WEEKDAY_KEYS.map((k) => chip("", `data-us-day="${k}"`, WEEKDAY_LABELS[k], (f.byDay || []).includes(k))).join("")}</div></div>
         <p class="us-note">${esc(MSG.firstDayHint)}</p>
         <div class="us-field"><label>${esc(MSG.untilLabel)}</label><div class="us-chips">${chip("", 'data-us-until="NONE"', MSG.untilNone, f.untilMode !== "DATE")}${chip("", 'data-us-until="DATE"', MSG.untilDate, f.untilMode === "DATE")}</div></div>
         ${f.untilMode === "DATE" ? `<div class="us-field"><label>${esc(MSG.lastRepeatLabel)}</label>${picker(PICKER_PREFIXES.until, f.until)}</div>` : ""}
         <p class="us-note">${esc(MSG.repeatHint)}</p>`;
    const recM = /^\d{4}-(\d{2})-(\d{2})$/.exec(f.recommendIso || "");
    const recChip = recM && !f.eventDate && !repeating && f.mode === "create" ? `<div class="us-field us-recommend"><div class="us-chips">${chip("", `data-us-recommend="${esc(f.recommendIso)}"`, MSG.recommendChip(`${+recM[1]}/${+recM[2]}`), false)}</div></div>` : "";
    const dates = fixed
      ? `${repeatBlock}${recChip}<div class="us-field"><label>${esc(repeating ? MSG.firstDayLabel : MSG.dateField)}</label>${picker(PICKER_PREFIXES.date, f.eventDate)}</div>
         ${repeating ? repeatDetail : `<label class="us-check"><input type="checkbox" id="us-multi"${f.multiDay ? " checked" : ""} /> ${esc(MSG.multiDay)}</label>
         ${f.multiDay ? `<div class="us-field"><label>${esc(MSG.endField)}</label>${picker(PICKER_PREFIXES.end, f.endDate)}</div>` : ""}`}
         <label class="us-check"><input type="checkbox" id="us-allday"${f.allDay ? " checked" : ""} /> ${esc(MSG.allDay)}</label>
         ${f.allDay ? "" : timesBlock(f)}`
      : `<div class="us-field"><label>${esc(MSG.periodStart)}</label>${picker(PICKER_PREFIXES.periodStart, f.periodStart)}</div>
         <div class="us-field"><label>${esc(MSG.periodEnd)}</label>${picker(PICKER_PREFIXES.periodEnd, f.periodEnd)}</div>
         <p class="us-note">${esc(MSG.periodHint)}</p>`;
    const errors = (o.messages || []).map((m) => `<p class="us-error">${esc(m)}</p>`).join("");
    return `<div class="us-form" data-us-mode="${esc(f.mode)}">
      <h3>${esc(f.wasRecurring && f.mode === "edit" ? MSG.editAllTitle : f.mode === "edit" ? MSG.sheetEdit : MSG.sheetAdd)}</h3>${f.wasRecurring && f.mode === "edit" ? `\n      <p class="us-note">${esc(MSG.editAllNote)}</p>` : ""}
      ${locked && f.mode === "create" && o.autoLabel ? `<p class="us-note us-autoref-note">${esc(MSG.autoFormNote(o.autoLabel))}</p>` : ""}${renderQuickChips(f)}${f.mode === "create" && !f.autoRef && f.quickKey === "vaccine" ? renderAutoCand(o.autoCandidates) : ""}
      <div class="us-field"><label for="us-title">${esc(MSG.titleLabel)}</label><input type="text" id="us-title" maxlength="100" placeholder="${esc(MSG.titleHint)}" value="${esc(f.title)}" /></div>
      <div class="us-field"><label>${esc(MSG.categoryLabel)}</label><div class="us-chips">${cats}</div></div>
      ${locked ? "" : `<div class="us-field"><label>${esc(MSG.targetLabel)}</label><div class="us-chips">${targets}</div></div>`}
      ${locked ? "" : `<div class="us-field"><label>${esc(MSG.dateLabel)}</label><div class="us-chips">${chip("", 'data-us-kind="FIXED"', MSG.kindFixed, fixed)}${repeating ? `<button type="button" class="us-chip" disabled>${esc(MSG.kindPeriod)}</button>` : chip("", 'data-us-kind="PERIOD"', MSG.kindPeriod, !fixed)}</div></div>`}
      ${dates}
      <div class="us-field"><label for="us-location">${esc(MSG.locationLabel)}</label><input type="text" id="us-location" maxlength="100" placeholder="${esc(MSG.locationHint)}" value="${esc(f.location)}" /></div>
      <div class="us-field"><label for="us-memo">${esc(MSG.memoLabel)}</label><textarea id="us-memo" maxlength="500" placeholder="${esc(MSG.memoHint)}">${esc(f.memo)}</textarea></div>
      <div id="us-errors">${errors}</div>
      ${o.saving ? `<p class="us-note">${esc(MSG.saving)}</p>` : ""}
      <div class="us-actions"><button type="button" class="us-btn us-primary" data-us-action="save"${o.saving ? " disabled" : ""}>${esc(f.wasRecurring && f.mode === "edit" ? MSG.editAllSave : MSG.save)}</button><button type="button" class="us-btn" data-us-action="cancel">${esc(MSG.cancel)}</button></div>
    </div>`;
  }
  /** "이 날만 수정" 시트(R31). 날짜 달력은 app.js 가 PICKER_PREFIXES.day 로 bind 한다. */
  function renderDayForm(f, opts) {
    const o = opts || {};
    const errors = (o.messages || []).map((m) => `<p class="us-error">${esc(m)}</p>`).join("");
    const times = f.allDay ? "" : timesBlock(f);
    return `<div class="us-form" data-us-mode="day">
      <h3>${esc(MSG.editDayTitle)}</h3><p class="us-note">${esc(MSG.editDayNote(dayLabel(f.originalDate)))}</p>
      <div class="us-field"><label>${esc(MSG.dateField)}</label>${picker(PICKER_PREFIXES.day, f.date)}</div>
      ${f.canAllDay ? `<label class="us-check"><input type="checkbox" id="us-allday"${f.allDay ? " checked" : ""} /> ${esc(MSG.allDay)}</label>` : ""}${times}
      <div id="us-errors">${errors}</div>
      ${o.saving ? `<p class="us-note">${esc(MSG.saving)}</p>` : ""}
      <div class="us-actions"><button type="button" class="us-btn us-primary" data-us-action="save-day"${o.saving ? " disabled" : ""}>${esc(MSG.editDaySave)}</button><button type="button" class="us-btn" data-us-action="cancel">${esc(MSG.cancel)}</button></div>
    </div>`;
  }
  /** 폼의 날짜 값 → 달력 컴포넌트 초기값(prefix → "YYYY-MM-DD") */
  function pickerInitials(f) {
    if (f.mode === "day") return { [PICKER_PREFIXES.day]: f.date };
    if (isRepeating(f)) return { [PICKER_PREFIXES.date]: f.eventDate, ...(f.untilMode === "DATE" ? { [PICKER_PREFIXES.until]: f.until } : {}) };
    return f.dateKind === "PERIOD"
      ? { [PICKER_PREFIXES.periodStart]: f.periodStart, [PICKER_PREFIXES.periodEnd]: f.periodEnd }
      : { [PICKER_PREFIXES.date]: f.eventDate, ...(f.multiDay ? { [PICKER_PREFIXES.end]: f.endDate } : {}) };
  }

  // ── C2-b1 AUTO 연결 표시 (순수) ─────────────────────────────────────────────
  /** linksByAutoId 의 값 → 보조 문구 "예약됨 10/14"(완료된 예약·날짜 없음이면 ""). */
  function autoLinkNote(link) {
    if (!link || !link.date || link.status === "DONE") return "";
    return MSG.autoReservedNote(md(link.date));
  }
  /** AUTO 상세 하단 버튼 줄: 현재 예약이 있으면 "예약됨 10/14 · 일정 보기"(일정 상세로), 없으면 "예약 일정 만들기". */
  function renderAutoLinkButton(link) {
    if (link && link.date) return `<button type="button" class="btn-complete auto-link-btn" id="btn-auto-view" data-auto-schedule="${esc(link.scheduleId || "")}">${esc(MSG.autoReserved(md(link.date)))}</button>`;
    return `<button type="button" class="btn-complete auto-link-btn" id="btn-auto-reserve">${esc(MSG.autoReserve)}</button>`;
  }

  // ── C2-b2 완료 제안 (순수) ───────────────────────────────────────────────────
  /** AUTO 항목의 카테고리 → 제목에 쓰는 낱말(접종/검진). 그 밖(치과 등)은 낱말 없이 "기록도 남길까요?". */
  function linkKindWord(category) {
    return category === "예방접종" ? "접종" : category === "영유아검진" ? "검진" : "";
  }
  /**
   * 연결 일정을 완료로 바꾼 뒤 'AUTO 항목도 완료로 기록할까요?'를 물을지 판단한다(U8 포함). 물어야 하면 AUTO 항목 id, 아니면 null.
   * 조건: 일정이 DONE·날짜 정함(FIXED)이고 일정 날짜 ≤ 오늘(미래 날짜는 제안 안 함), 활성 아이의 일정, autoRef 가 현재 AUTO 항목으로 해석되고 연결 대상이며 그 항목이 아직 완료 전.
   * c = { activeChildKey, resolveId(ref)→id, eventOf(id)→event|null, isLinkable(event), isDone(id)→boolean(그 AUTO 항목의 완료 여부 — 이 모듈은 완료 저장소를 보지 않는다), todayIso }
   */
  function autoCompleteTarget(doc, c) {
    if (!doc || !c || typeof doc.autoRef !== "string" || doc.status !== "DONE") return null;
    if (doc.dateKind !== "FIXED" || !doc.eventDate || !c.todayIso || doc.eventDate > c.todayIso) return null;
    if (c.activeChildKey == null || !Array.isArray(doc.childKeys) || doc.childKeys[0] !== c.activeChildKey) return null;
    const id = c.resolveId(doc.autoRef);
    const e = id ? c.eventOf(id) : null;
    if (!e || !c.isLinkable(e)) return null;
    if (typeof c.isDone === "function" && c.isDone(e.id)) return null;
    return e.id;
  }
  /** 시트 마크업. 버튼은 data-us-action(link-record / link-skip / link-keep / link-complete) — 앱이 한 곳에서 처리한다. */
  function renderLinkRecordSheet(d) {
    return `<div class="us-confirm us-link-prompt"><h3>${esc(MSG.linkRecordTitle(d.word))}</h3><p>${esc(MSG.linkRecordBody(d.scheduleTitle, md(d.date), d.item))}</p>
      <div class="us-actions"><button type="button" class="us-btn us-primary" data-us-action="link-record">${esc(MSG.linkRecordYes)}</button><button type="button" class="us-btn" data-us-action="link-skip">${esc(MSG.linkRecordNo)}</button></div></div>`;
  }
  function renderLinkKeepSheet(d) {
    return `<div class="us-confirm us-link-prompt"><h3>${esc(MSG.linkKeepTitle)}</h3><p>${esc(MSG.linkKeepBody(d.item, md(d.date)))}</p>
      <div class="us-actions"><button type="button" class="us-btn us-primary" data-us-action="link-keep">${esc(MSG.linkKeepStay)}</button><button type="button" class="us-btn" data-us-action="link-complete">${esc(MSG.linkKeepDone)}</button></div></div>`;
  }

  // ── E(1-2) 캘린더 '이번 달 챙길 것' 한 줄 (순수) ─────────────────────────────────────
  const TODO_MSG = Object.freeze({
    title: (label, n) => `${label} 챙길 것 ${n}개`,
    allDone: (label) => `${label} 챙길 것을 모두 확인했어요`,
    none: (label) => `${label} 챙길 것이 없어요`,
    reserve: "예약 일정 만들기",
    done: "완료",
    undo: "완료 취소",
    doneGroup: (n) => `완료한 항목 ${n}개`,
    deadline: (md) => `${md}까지`,
    expired: "기한 지남",
    more: (n) => `나머지 ${n}개 더 보기`,
    less: "접기",
    loginNote: "공식 사이트에서 로그인 후 신청해요",
    hint: "날짜가 정해진 일정이 아니라 기한 안에 하면 되는 항목이에요. 병원 예약처럼 날짜가 생기면 ‘예약 일정 만들기’로 캘린더에 담아요.",
  });
  const TODO_LIMIT = 5;
  /** 마감 표기: 이미 지났으면 '기한 지남', 올해가 아니면 'YYYY. M/D까지', 올해면 'M/D까지'. date·today(Date)가 없거나 잘못됐으면 "". */
  function todoDeadlineText(date, today) {
    const ok = (d) => !!d && typeof d.getTime === "function" && !isNaN(d.getTime());
    if (!ok(date) || !ok(today)) return "";
    const key = (d) => d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
    if (key(date) < key(today)) return TODO_MSG.expired;
    const md = `${date.getMonth() + 1}/${date.getDate()}`;
    return TODO_MSG.deadline(date.getFullYear() === today.getFullYear() ? md : `${date.getFullYear()}. ${md}`);
  }
  const safeHttps = (u) => (typeof u === "string" && /^https:\/\/[^\s"'<>]+$/.test(u) ? u : "");
  /**
   * 달력 위 한 줄. state: { label("이번 달"|"11월"), open, items:[{ id, title, deadlineMd, done, reservedText, canReserve, apply:{url,label}|null }] }.
   * 항목은 호출부가 정렬해 준다(미완료 마감 빠른 순, 완료는 아래 접힘). 버튼은 data-cal-todo-act(toggle|reserve|done) 로 구분한다.
   */
  function renderTodoLine(state) {
    const s = state || {};
    const items = s.items || [];
    const todo = items.filter((i) => !i.done), done = items.filter((i) => i.done);
    const head = todo.length ? TODO_MSG.title(s.label, todo.length) : done.length ? TODO_MSG.allDone(s.label) : TODO_MSG.none(s.label);
    const li = (i) => {
      const apply = i.apply && safeHttps(i.apply.url) ? `<a class="btn-apply" href="${esc(i.apply.url)}" target="_blank" rel="noopener noreferrer">${esc(i.apply.label)}</a>${/bokjiro\.go\.kr/.test(i.apply.url) ? `<span class="cal-todo-note">${esc(TODO_MSG.loginNote)}</span>` : ""}` : "";
      const reserve = i.canReserve ? `<button type="button" class="btn-close" data-cal-todo-act="reserve" data-id="${esc(i.id)}">${esc(TODO_MSG.reserve)}</button>` : "";
      const meta = [i.deadlineText || (i.deadlineMd ? TODO_MSG.deadline(i.deadlineMd) : ""), i.reservedText || ""].filter(Boolean).map((t) => esc(t)).join(" · ");
      return `<li class="cal-todo-item${i.done ? " done" : ""}" data-id="${esc(i.id)}"><div class="cal-todo-main"><strong>${esc(i.title)}</strong>${meta ? `<small>${meta}</small>` : ""}</div><div class="cal-todo-actions">${i.done ? "" : reserve}${i.done ? "" : apply}<button type="button" class="btn-close" data-cal-todo-act="done" data-id="${esc(i.id)}">${esc(i.done ? TODO_MSG.undo : TODO_MSG.done)}</button></div></li>`;
    };
    const body = s.open
      ? `<p class="us-note">${esc(TODO_MSG.hint)}</p>${todo.length ? `<ul class="cal-todo-list">${(s.showAll ? todo : todo.slice(0, TODO_LIMIT)).map(li).join("")}</ul>${todo.length > TODO_LIMIT ? `<button type="button" class="home-more" data-cal-todo-act="more">${esc(s.showAll ? TODO_MSG.less : TODO_MSG.more(todo.length - TODO_LIMIT))}</button>` : ""}` : ""}${done.length ? `<details class="cal-todo-done"><summary>${esc(TODO_MSG.doneGroup(done.length))}</summary><ul class="cal-todo-list">${done.map(li).join("")}</ul></details>` : ""}`
      : "";
    return `<div class="card cal-todo"><button type="button" class="cal-todo-head" data-cal-todo-act="toggle" aria-expanded="${s.open ? "true" : "false"}"><span>${esc(head)}</span><span class="cal-todo-chev" aria-hidden="true">${s.open ? "⌃" : "⌄"}</span></button>${body}</div>`;
  }

  // ── F3 빠른 추가 칩 (순수) ───────────────────────────────────────────────────
  /** 칩 → 제목·분류만 채운다(종일·날짜·담당·대상은 건드리지 않는다). 분류는 기존 CATEGORIES 값만 쓴다. */
  const QUICK_TEMPLATES = Object.freeze([
    Object.freeze({ key: "hospital", label: "병원 예약", title: "병원 예약", category: "MEDICAL" }),
    Object.freeze({ key: "vaccine", label: "예방접종", title: "예방접종 병원 예약", category: "MEDICAL" }),
    Object.freeze({ key: "dental", label: "치과", title: "치과 진료", category: "MEDICAL" }),
    Object.freeze({ key: "daycare", label: "어린이집 행사", title: "어린이집 행사", category: "INSTITUTION" }),
    Object.freeze({ key: "outing", label: "가족 외출", title: "가족 외출", category: "FAMILY" }),
    // E(1-4): 누가 맡는지가 핵심인 일정 — 칩을 누르고 담당이 비어 있으면 담당 영역을 강조해 안내한다(분류·제목만 채우는 규칙은 그대로).
    Object.freeze({ key: "pickup", label: "등원·하원 픽업", title: "등원·하원 픽업", category: "INSTITUTION", needsAssignee: true }),
    Object.freeze({ key: "ride", label: "학원 라이딩", title: "학원 라이딩", category: "LESSON", needsAssignee: true }),
  ]);
  /** 폼에서 담당 영역을 강조해야 하는가: 담당이 필요한 빠른 추가 칩을 눌렀고 아직 담당을 고르지 않았을 때. */
  function assigneeEmphasis(f) {
    const t = f && QUICK_TEMPLATES.find((x) => x.key === f.quickKey);
    return !!(t && t.needsAssignee && !f.assigneeMemberId);
  }
  /** 폼 + 칩 키 → 바뀐 제목·분류. 제목은 비어 있을 때만 채우고(입력한 제목은 보존) 분류는 항상 칩을 따른다. 모르는 키면 null. 폼은 바꾸지 않는다. */
  function applyTemplate(f, key) {
    const t = QUICK_TEMPLATES.find((x) => x.key === key);
    if (!t || !f) return null;
    return { title: String(f.title || "").trim() ? f.title : t.title, category: t.category };
  }
  /** 0-C2/0-C2b: '예방접종' 선택 시 연결 후보 칩 블록(후보가 없으면 ""). 계정 폼(G13)과 가구만 켠 비계정 폼이 같이 쓴다. */
  function renderAutoCand(cands) {
    const list = Array.isArray(cands) ? cands : [];
    return list.length ? `<div class="us-field us-autocand" data-us-autocand><label>${esc(MSG.autoCandAsk)}</label><div class="us-chips">${list.map((c) => chip("", `data-us-autoref="${esc(c.id)}"`, c.title, false)).join("")}</div><p class="us-note">${esc(MSG.autoCandHint)}</p></div>` : "";
  }
  /** 추가 모드 폼의 칩 줄. 수정·반복 편집 폼에는 그리지 않는다(""). */
  function renderQuickChips(f) {
    if (!f || f.mode !== "create" || f.autoRef) return "";
    return `<div class="us-field us-quick"><label>${esc(MSG.quickLabel)}</label><div class="us-chips">${QUICK_TEMPLATES.map((t) => chip("", `data-us-quick="${t.key}"`, t.label, false)).join("")}</div></div>`;
  }

  // ── F1 홈 '다음 일정' 카드 (순수) ─────────────────────────────────────────────
  const UPCOMING_DAYS = 7;
  const UPCOMING_MAX = 3;
  const clock12 = (t) => getTR().clock12(t);
  /** 날짜 표기: 오늘 / 내일 / "10/5(일)". */
  function upcomingWhen(date, todayIso) {
    if (date === todayIso) return MSG.upcomingToday;
    const next = getUS().addDays(todayIso, 1);
    return date === next ? MSG.upcomingTomorrow : dayLabel(date).replace(/^(\d+)\/(\d+)/, "$1월 $2일"); // "10/5(일)" → "10월 5일(일)"
  }
  /**
   * CalendarModel(오늘~+6일, showAuto:false) → 홈 카드용 항목. 앞으로 7일(오늘 포함) 안의 추가 일정만, 날짜순·같은 날은 모델 정렬(종일→시각→제목).
   * 완료(DONE)·취소 회차·날짜 미정(기간) 일정은 뺀다. 여러 날 일정은 처음 보이는 날 한 번만. 최대 3개, 나머지 개수는 more.
   */
  function upcomingItems(model, opts) {
    const todayIso = opts && opts.todayIso;
    const links = (opts && opts.links) || [];
    const out = [];
    const seen = new Set();
    let total = 0;
    if (!model || !model.days || typeof todayIso !== "string") return { items: out, more: 0 };
    const last = getUS().addDays(todayIso, UPCOMING_DAYS - 1);
    for (const date of [...model.days.keys()].sort()) {
      if (date < todayIso || date > last) continue;
      for (const o of model.days.get(date).user) {
        if (o.status === "DONE" || o.status === "CANCELLED" || o.dateKind === "PERIOD" || seen.has(o.key)) continue;
        seen.add(o.key);
        total++;
        if (out.length < UPCOMING_MAX) out.push({ key: o.key, scheduleId: o.scheduleId, date, title: o.title, whenText: upcomingWhen(date, todayIso), timeText: timeText(o), tag: tagText(o), color: occurrenceColor(o, links) });
      }
    }
    return { items: out, more: total - out.length };
  }
  /** 홈 카드. 일정이 없으면 빈 상태 안내와 추가 버튼, 있으면 줄 목록과 '캘린더에서 보기'. */
  function renderUpcomingCard(data, opts) {
    const items = (data && data.items) || [];
    const head = `<div class="home-sec-head"><h3>${esc(opts && opts.title ? opts.title : opts && opts.family === true ? MSG.upcomingTitleFamily : MSG.upcomingTitle)}</h3></div>`;
    if (!items.length) {
      return `<section class="home-sec sec-us-upcoming">${head}<p class="home-empty-line">${esc(MSG.upcomingEmpty)}</p><button type="button" class="home-more" data-act="us-add">${esc(MSG.upcomingAdd)}</button></section>`;
    }
    const rows = items
      .map((it) => {
        const sub = [it.whenText, it.timeText, it.tag].filter(Boolean).map(esc).join(" · ");
        return `<button type="button" class="home-row" data-home-date="${esc(it.date)}"><span class="cat-dot" style="background:${safeColor(it.color)}"></span><span class="hr-body"><strong>${esc(it.title)}</strong><small>${sub}</small></span><span class="hr-chev">›</span></button>`;
      })
      .join("");
    return `<section class="home-sec sec-us-upcoming">${head}${rows}<button type="button" class="home-more" data-act="us-cal">${esc(MSG.upcomingMore)}</button></section>`;
  }

  return {
    MSG, CATEGORIES, CHILD_PALETTE, PALETTE, COLOR_KEYS, keyColor, get FAMILY_COLOR() { return familyColor(); }, familyColor, roleSlots, resolveChildColors, PICKER_PREFIXES, HOURS, MINUTES,
    categoryLabel, childColor, childColors, occurrenceColor, memberColor, resolveMemberColors, PALETTES, setTheme, getTheme, setColorOrder, normalizeColorOrder, inkOn, MEMBER_COLORS, ROLE_LABELS, CATEGORY_COLORS, autoCategoryGroup, selectionMode, toggleSelection, cellChips,
    filterChips, normalizeSelection, toModelFilter, renderFilterChips,
    cardData, cellMarks, dayPanel, sourceLabeled, monthSummary, periodSection, skippedNote, timeText, dateText, tagText,
    linkKindWord, autoCompleteTarget, renderLinkRecordSheet, renderLinkKeepSheet, autoLinkNote, renderAutoLinkButton, clock12, upcomingItems, renderUpcomingCard, QUICK_TEMPLATES, renderChipDeleteConfirm, withObjectParticle, renderTodoLine, todoDeadlineText, TODO_LIMIT, TODO_MSG, assigneeEmphasis, applyTemplate, renderQuickChips, renderAutoCand, renderAnnivSwitch,
    renderCard, detailView, renderDetail, detailDots, renderDeleteConfirm, renderAddButton, renderPeriodSection,
    newForm, formFromSchedule, stripId, formToInput, validateForm, messagesFromErrors, prepareSave, changesFromForm, minuteOptions, splitTime,
    renderForm, renderFormG13, upgradeFormG13, g13ApplyWho, g13PickKind, g13Kinds, pickerInitials, esc,
    // B5 반복 일정
    WEEKDAY_KEYS, WEEKDAY_LABELS, dayLabel, repeatSummary, exceptionsNotice, isRepeating, sameRule, planFullEdit,
    renderEditScopeSheet, renderDeleteScopeSheet, renderCancelDayConfirm, renderDeleteAllConfirm, renderRuleChangeConfirm,
    dayFormFromOccurrence, validateDayForm, dayFormToMove, renderDayForm,
  };
});
