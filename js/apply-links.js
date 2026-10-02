/*
 * 신청용 링크(E 1-2 데이터 부분). 근거 링크(officialUrl)와 별개로 '신청하러 가기'·'안내 보기'·'예방접종도우미 열기' 버튼이 여는 주소를 돌려준다. 순수 모듈(DOM·네트워크 없음).
 * 값의 출처(한 곳씩): 지원금 = data/subsidies/national.json 의 applyUrl·applyLabel / 자동 지원금 항목(SB-*) = national-todos.json 의 subsidyRef 로 위 항목을 조회 /
 * 접종(VX-*)·검진(HC-*) = 아래 분류 단위 기본값(정의마다 반복하지 않는다). 근거 문서: docs/한눈육아-신청링크-조사.md
 */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else root.ApplyLinks = factory();
})(typeof window !== "undefined" ? window : global, function () {
  "use strict";

  const LABELS = Object.freeze(["신청하러 가기", "안내 보기", "예방접종도우미 열기"]);
  /** 분류 접두사(todo_id 의 'VX-'·'HC-') 단위 기본값. */
  const CATEGORY_DEFAULTS = Object.freeze({
    VX: Object.freeze({ url: "https://nip.kdca.go.kr/", label: "예방접종도우미 열기" }),
    HC: Object.freeze({ url: "https://www.nhis.or.kr/nhis/healthin/wbhaca04800m01.do", label: "안내 보기" }),
  });
  const URL_RE = /^https:\/\/[^\s"'<>]+$/;
  const ok = (url, label) => (typeof url === "string" && URL_RE.test(url) && LABELS.includes(label) ? { url, label } : null);

  /** 지원금 레코드(national.json 항목 등)의 신청 링크. 없거나 형식이 맞지 않으면 null. */
  function forSubsidy(s) {
    return s ? ok(s.applyUrl, s.applyLabel) : null;
  }
  /**
   * 자동 항목(Todo 정의 또는 이벤트)의 신청 링크. def: { todo_id|id, subsidyRef? }, subsidiesById: { id: 지원금 레코드 }(선택).
   * subsidyRef 가 있으면 그 지원금 레코드를 조회하고, 없으면 접두사 기본값(VX/HC)을 쓴다. 해당 없으면 null.
   */
  function forTodo(def, subsidiesById) {
    if (!def) return null;
    if (def.subsidyRef) return forSubsidy(subsidiesById && subsidiesById[def.subsidyRef]);
    const id = String(def.todo_id || def.id || "");
    const d = CATEGORY_DEFAULTS[id.slice(0, 2)];
    return id.charAt(2) === "-" && d ? { url: d.url, label: d.label } : null;
  }
  return { LABELS, CATEGORY_DEFAULTS, forSubsidy, forTodo };
});
