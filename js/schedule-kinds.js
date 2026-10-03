/*
 * schedule-kinds — 일정 추가 시트(G13)의 '누구 일정인가요?' → 카테고리 목록 규칙(순수 모듈: DOM·저장소·네트워크 없음).
 * 나이 구간과 카테고리 목록은 이 파일 한 곳에만 둔다(test/g13b-schedule-kinds.test.js 가 값을 고정한다).
 *
 * 아이 나이 출처(앱이 정한다): 이 기기에 저장된 생일(출산 예정일) → 없으면 공통 아이 목록. 임신 중이면 "PREGNANT".
 * 저장 방식: schedules 의 category enum(LESSON·INSTITUTION·MEDICAL·FAMILY·ETC)에 매핑해서 저장하고, 상세 이름(label)은 제목에 자동으로 넣는다(새 필드·규칙 변경 없음).
 *   - target: "CHILD"(아이 — 나이 구간으로 목록이 달라진다) / "ADULT"(나·배우자·할머니 등 어른) / "FAMILY"(가족 전체)
 *   - 나이 구간(개월, 만 나이 기준): BABY 0~11 / TODDLER 12~47(1~3세) / KINDER 48~83(4~6세) / ELEM 84 이상(초등, 만 7세~). 임신 중(출산 전)은 BABY.
 */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else root.ScheduleKinds = factory();
})(typeof window !== "undefined" ? window : global, function () {
  "use strict";

  const k = (label, category) => Object.freeze({ label, category });
  const BANDS = Object.freeze([
    Object.freeze({ key: "BABY", from: 0, to: 11, label: "0~12개월" }),
    Object.freeze({ key: "TODDLER", from: 12, to: 47, label: "1~3세" }),
    Object.freeze({ key: "KINDER", from: 48, to: 83, label: "4~7세" }),
    Object.freeze({ key: "ELEM", from: 84, to: Infinity, label: "초등" }),
  ]);
  const CHILD_KINDS = Object.freeze({
    BABY: Object.freeze([k("병원·검진", "MEDICAL"), k("예방접종", "MEDICAL"), k("문화센터", "LESSON"), k("육아 모임", "ETC")]),
    TODDLER: Object.freeze([k("어린이집", "INSTITUTION"), k("병원·검진", "MEDICAL"), k("예방접종", "MEDICAL"), k("놀이·수업", "LESSON")]),
    KINDER: Object.freeze([k("어린이집·유치원", "INSTITUTION"), k("수업·학원", "LESSON"), k("병원·검진", "MEDICAL"), k("놀이·체험", "LESSON"), k("친구 약속", "ETC")]),
    ELEM: Object.freeze([k("학교", "INSTITUTION"), k("학원", "LESSON"), k("병원", "MEDICAL"), k("체험학습", "LESSON"), k("친구 약속", "ETC")]),
  });
  /** 출산 예정(임신 중) 아이 */
  const PREGNANT_KINDS = Object.freeze([k("병원·검진", "MEDICAL"), k("출산 준비", "ETC"), k("산후조리 예약", "INSTITUTION")]);
  /** 아이 나이를 모를 때(생일 정보가 없는 아이): 나이와 상관없이 쓸 수 있는 공통 목록 */
  const COMMON_CHILD_KINDS = Object.freeze([k("병원·검진", "MEDICAL"), k("어린이집·유치원", "INSTITUTION"), k("수업·학원", "LESSON"), k("놀이·체험", "LESSON"), k("친구 약속", "ETC")]);
  const ADULT_KINDS = Object.freeze([k("회사", "ETC"), k("모임·약속", "ETC"), k("병원", "MEDICAL"), k("운동", "ETC"), k("개인 일정", "ETC"), k("집안일", "FAMILY")]);
  const FAMILY_KINDS = Object.freeze([k("가족 행사", "FAMILY"), k("나들이", "FAMILY"), k("여행", "FAMILY"), k("기념일", "FAMILY")]);
  const TARGETS = Object.freeze(["CHILD", "ADULT", "FAMILY"]);

  /** "YYYY-MM-DD" 생일·기준일 → 만 개월 수(음수=출산 전). 날짜가 아니면 null. */
  function ageMonths(birthIso, todayIso) {
    const re = /^\d{4}-\d{2}-\d{2}$/;
    if (!re.test(birthIso || "") || !re.test(todayIso || "")) return null;
    const [by, bm, bd] = birthIso.split("-").map(Number);
    const [ty, tm, td] = todayIso.split("-").map(Number);
    return (ty - by) * 12 + (tm - bm) - (td < bd ? 1 : 0);
  }
  /** 개월 수 → 나이 구간 키. 모르면(null)·음수(출산 전)는 BABY. */
  function bandOf(months) {
    const m = typeof months === "number" && isFinite(months) ? months : 0;
    const b = BANDS.find((x) => m >= x.from && m <= x.to);
    return b ? b.key : "BABY";
  }
  /**
   * 대상(target)과 아이 나이에 맞는 카테고리 목록 [{label, category}].
   * 아이(CHILD)의 age: 개월 수(숫자) → 나이 구간 목록 / "PREGNANT"(출산 예정) → 임신 중 목록 / 그 밖(null·모름) → 공통 아이 목록.
   */
  function kindsFor(target, age) {
    if (target === "CHILD") {
      if (age === "PREGNANT") return PREGNANT_KINDS.slice();
      if (typeof age !== "number" || !isFinite(age)) return COMMON_CHILD_KINDS.slice();
      return CHILD_KINDS[bandOf(age)].slice();
    }
    if (target === "FAMILY") return FAMILY_KINDS.slice();
    return ADULT_KINDS.slice();
  }
  /** 카테고리 이름 → category enum(목록 밖이면 ETC). */
  function categoryOf(label, target, age) {
    const f = kindsFor(target, age).find((x) => x.label === label);
    return f ? f.category : "ETC";
  }
  /**
   * 제목 자동 채우기: 카테고리를 고르면 그 이름이 제목이 된다. 사용자가 직접 고친 제목은 덮어쓰지 않는다(다 지워서 비어 있으면 다시 채운다).
   * titleTouched: 사용자가 제목을 직접 고친 적이 있는가. 반환: 새 제목 문자열.
   */
  function nextTitle(currentTitle, titleTouched, label) {
    if (titleTouched === true && String(currentTitle || "").trim() !== "") return String(currentTitle); // 직접 고친(비우지 않은) 제목은 덮어쓰지 않는다
    return String(label || "");
  }
  return { BANDS, CHILD_KINDS, PREGNANT_KINDS, COMMON_CHILD_KINDS, ADULT_KINDS, FAMILY_KINDS, TARGETS, ageMonths, bandOf, kindsFor, categoryOf, nextTitle };
});
