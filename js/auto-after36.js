// 36개월 이상 자동(AUTO) 일정 허용 목록 로더 — data/policy/auto-after36.json 을 읽어 "이 항목(회차)은 36개월 이상 아이에게도 자동 일정으로 나온다"를 판정한다.
// 기본은 숨김이다. 목록에 없거나 파일을 못 읽으면(빈 목록) 36개월 이상 아이에게는 자동 일정이 하나도 나오지 않는다. 36개월 미만·임신 중 아이의 노출에는 영향이 없다.
// 형식: { items: [{ todo_id: "SC-01" }, { todo_id: "VX-DTAP", occurrenceKeys: ["dose-5"] }] } — occurrenceKeys 가 없으면 그 항목의 모든 회차.
// DOM·저장소에 의존하지 않는다. fetch 는 주입(Node 테스트용). 형식이 잘못된 항목은 버린다.
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else root.AutoAfter36 = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const PATH = "data/policy/auto-after36.json";
  const ID = /^[A-Za-z0-9-]+$/;

  /** 읽은 JSON → { has(todoId, occurrenceKey), ids, size }. 입력은 바꾸지 않는다. */
  function normalize(raw) {
    const map = new Map(); // todoId → null(전체 회차) | Set(회차 키)
    const items = raw && typeof raw === "object" && Array.isArray(raw.items) ? raw.items : [];
    for (const it of items) {
      if (!it || typeof it !== "object" || typeof it.todo_id !== "string" || !ID.test(it.todo_id)) continue;
      if (it.occurrenceKeys === undefined) { map.set(it.todo_id, null); continue; }
      if (!Array.isArray(it.occurrenceKeys) || !it.occurrenceKeys.length || !it.occurrenceKeys.every((k) => typeof k === "string" && ID.test(k))) continue;
      if (map.get(it.todo_id) === null) continue; // 이미 전체 회차 허용
      const set = map.get(it.todo_id) || new Set();
      it.occurrenceKeys.forEach((k) => set.add(k));
      map.set(it.todo_id, set);
    }
    return Object.freeze({
      has(todoId, occurrenceKey) {
        if (!map.has(todoId)) return false;
        const keys = map.get(todoId);
        return keys === null || keys.has(occurrenceKey || "default");
      },
      ids: Object.freeze([...map.keys()]),
      size: map.size,
    });
  }

  /** fetchFn(path) → Response 형태({ok, json()}). 실패하면 빈 목록(36개월 이상 자동 일정 없음). */
  async function load(fetchFn) {
    try {
      const res = await fetchFn(PATH);
      if (!res || !res.ok) return normalize(null);
      return normalize(await res.json());
    } catch (e) {
      return normalize(null);
    }
  }

  return { PATH, normalize, load };
});
