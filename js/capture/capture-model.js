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
    f.eventDate = c.eventDate || "";
    f.multiDay = !!c.endDate; f.endDate = c.endDate || "";
    f.allDay = c.allDay !== false || !c.startTime;
    f.startTime = f.allDay ? "" : c.startTime; f.endTime = f.allDay ? "" : c.endTime || "";
    f.repeat = c.repeat === "WEEKLY" || c.repeat === "BIWEEKLY" ? c.repeat : "NONE";
    f.byDay = f.repeat === "NONE" ? [] : (c.byDay || []).slice();
    return f;
  }
  const fromParse = (cands) => ({ text: "", cands: (cands || []).map((c) => ({ ...c, checked: true, removed: false })), undo: false });
  const toggle = (s, i) => { const c = s.cands[i]; if (c && !c.removed) c.checked = c.checked === false; return s; };
  const remove = (s, i) => { const c = s.cands[i]; if (c) { c.removed = true; s.lastRemoved = i; s.undo = true; } return s; };
  const undo = (s) => { const c = s.cands[s.lastRemoved]; if (c) c.removed = false; s.undo = false; return s; };
  /** 등록 대상: 날짜가 있고 체크됐고 빼지 않은 것만(날짜 없는 후보는 등록하지 않는다 — 폼에서 날짜를 고르게 한다). */
  const registrable = (s) => (s.cands || []).filter((c) => !c.removed && c.checked !== false && !!c.eventDate);
  return { formFromCandidate, fromParse, toggle, remove, undo, registrable };
});
