/*
 * ai-parser — D37 AI 보강 자리(인터페이스만). 지금은 호출하지 않는다: enabled() 가 항상 false 이고 parseWithAI 는 네트워크를 쓰지 않는다.
 * 계획서 §7: 규칙이 못 푼 글만, 텍스트만 보내는 구조(서버·요금 결정 뒤). 화면에는 AI·자동 보정을 말하는 문구·버튼을 두지 않는다 — '규칙으로 분석하지 못했어요' 상태만 만든다.
 *   parseWithAI(text, baseDate, context) → Promise<{ ok:false, reason:"not-enabled" }>   (켜지면 { ok:true, candidates:[ScheduleCandidate] })
 *   RULE_FAILED: 규칙 파서가 글에서 일정을 찾지 못한 상태 이름 / ruleFailed(text, cands) → boolean
 */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else root.AiParser = factory();
})(typeof window !== "undefined" ? window : global, function () {
  "use strict";
  const RULE_FAILED = "rule-failed";
  const enabled = () => false;
  async function parseWithAI(/* text, baseDate, context */) { return { ok: false, reason: "not-enabled" }; }
  /** 글은 있는데 날짜가 있는 후보가 하나도 없으면(= 규칙으로 일정이 안 나옴) true. */
  function ruleFailed(text, cands) {
    if (!/[0-9A-Za-z가-힣]/.test(String(text || ""))) return false;
    return !(cands || []).some((c) => c && c.eventDate);
  }
  return { RULE_FAILED, enabled, parseWithAI, ruleFailed };
});
