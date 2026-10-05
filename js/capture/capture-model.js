/*
 * capture-model — 2-1 붙여넣기 후보 → 일정 폼(순수). 후보의 값을 그대로 옮길 뿐 날짜·담당을 만들어 채우지 않는다(I9).
 *   formFromCandidate(c, base) → UserScheduleView 폼 / initialState(text) / fromParse(cands) / toggle·remove·undo
 */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else root.CaptureModel = factory();
})(typeof window !== "undefined" ? window : global, function () {
  "use strict";
  const CATS = ["MEDICAL", "INSTITUTION", "LESSON"];

  /** base = UserScheduleView.newForm(...) 결과(가구·담당 기본값 포함). 후보의 아이가 있으면 그 아이로, 없으면 base 의 대상 그대로. */
  function formFromCandidate(c, base) {
    const f = { ...base, byDay: (base.byDay || []).slice(), childKeys: (base.childKeys || []).slice() };
    f.title = String(c.title || "").slice(0, 100);
    f.category = CATS.includes(c.categoryHint) ? c.categoryHint : base.category || "ETC";
    if (Array.isArray(c.childKeys) && c.childKeys.length) { f.scope = "CHILD"; f.childKeys = c.childKeys.slice(); }
    if (c.memo) f.memo = String(c.memo).slice(0, 500); // D59: '키: 값' 안내문의 박수·자리·금액 등
    f.eventDate = c.eventDate || "";
    f.multiDay = !!c.endDate; f.endDate = c.endDate || "";
    f.allDay = c.allDay !== false || !c.startTime;
    f.startTime = f.allDay ? "" : c.startTime; f.endTime = f.allDay ? "" : c.endTime || "";
    f.repeat = c.repeat === "WEEKLY" || c.repeat === "BIWEEKLY" ? c.repeat : "NONE";
    f.byDay = f.repeat === "NONE" ? [] : (c.byDay || []).slice();
    if (c.who) applyWho(f, c.who); // D40: 후보 카드의 '누구' 칩 선택이 대상·구성원을 정한다(담당은 따로 두지 않는다)
    return f;
  }
  /** D40 '누구 일정' 칩 값: "CHILD:<childKey>" | "MEMBER:<memberId>" | "FAMILY". 아이=scope CHILD+childKeys, 구성원=scope FAMILY+assigneeMemberId(+whoPerson), 가족 전체=scope FAMILY — 기존 저장 필드 그대로. */
  function applyWho(f, who) {
    const [type, id] = String(who || "").split(/:(.*)/s);
    if (type === "CHILD" && id) { f.scope = "CHILD"; f.childKeys = [id]; f.assigneeMemberId = ""; f.whoPerson = false; }
    else if (type === "MEMBER" && id) { f.scope = "FAMILY"; f.childKeys = []; f.assigneeMemberId = id; f.whoPerson = true; }
    else if (type === "FAMILY") { f.scope = "FAMILY"; f.childKeys = []; f.assigneeMemberId = ""; f.whoPerson = false; }
    return f;
  }
  /** 후보마다 '누구'를 채운다: 글에서 아이를 찾았으면 그 아이, 아니면 fallback(지금 보는 아이, 없으면 가족 전체). 이미 사용자가 고른 값은 그대로. */
  function withDefaultWho(s, fallback) {
    for (const c of (s && s.cands) || []) if (!c.who) c.who = Array.isArray(c.childKeys) && c.childKeys.length ? `CHILD:${c.childKeys[0]}` : fallback || "FAMILY";
    return s;
  }
  const fromParse = (cands) => ({ text: "", cands: (cands || []).map((c) => ({ ...c, checked: true, removed: false })), undo: false });
  const toggle = (s, i) => { const c = s.cands[i]; if (c && !c.removed) c.checked = c.checked === false; return s; };
  const remove = (s, i) => { const c = s.cands[i]; if (c) { c.removed = true; s.lastRemoved = i; s.undo = true; } return s; };
  const undo = (s) => { const c = s.cands[s.lastRemoved]; if (c) c.removed = false; s.undo = false; return s; };
  /** 등록 대상: 날짜가 있고 체크됐고 빼지 않은 것만(날짜 없는 후보는 등록하지 않는다 — 폼에서 날짜를 고르게 한다). */
  const registrable = (s) => (s.cands || []).filter((c) => !c.removed && c.checked !== false && !!c.eventDate);
  return { formFromCandidate, applyWho, withDefaultWho, fromParse, toggle, remove, undo, registrable };
});
