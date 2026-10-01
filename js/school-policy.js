// 학교 정책 로더 (A6-1) — data/policy/school.json 을 읽어 ChildTimeline.computeSchool 의 policy 인자로 쓸 객체를 만든다.
// 형식 검증만 하고(알 수 없는 키·빠진 필드·잘못된 kind/상태 조합은 해당 키를 버린다) 값의 의미 판단은 ChildTimeline 이 한다.
// 읽기 실패·JSON 오류는 빈 정책({})을 돌려준다 → computeSchool 은 school=null (A5 안전 동작).
// DOM 에 의존하지 않는다. fetch 는 주입(Node 테스트용). 앱 연결은 A6-2.
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else root.SchoolPolicy = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const PATH = "data/policy/school.json";
  const KEYS = ["enrollmentOffsetYears", "schoolYearStartMonth", "preElementaryYearsBefore"];
  // kind 별로 허용되는 verificationStatus
  const KIND_STATUS = {
    OFFICIAL_POLICY: ["확인됨", "확인필요"],
    PRODUCT_DEFINITION: ["제품정의"],
  };

  function isEntry(e) {
    return !!e && typeof e === "object" && Number.isInteger(e.value) && typeof e.source === "string" && e.source !== "" &&
      Object.prototype.hasOwnProperty.call(KIND_STATUS, e.kind) && KIND_STATUS[e.kind].indexOf(e.verificationStatus) >= 0 &&
      (e.kind === "PRODUCT_DEFINITION" || (typeof e.effectiveDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(e.effectiveDate)));
  }

  /** 읽은 JSON 객체 → computeSchool 용 policy. 형식이 올바른 키만 담는다. */
  function normalize(raw) {
    const out = {};
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
    for (const k of KEYS) if (isEntry(raw[k])) out[k] = Object.freeze({ ...raw[k] });
    return Object.freeze(out);
  }

  /** fetchFn(path) → Response 형태({ok, json()}). 실패하면 빈 정책. */
  async function load(fetchFn) {
    try {
      const res = await fetchFn(PATH);
      if (!res || !res.ok) return normalize(null);
      return normalize(await res.json());
    } catch (e) {
      return normalize(null);
    }
  }

  return { PATH, KEYS, normalize, load };
});
