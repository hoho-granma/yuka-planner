/*
 * child-todos — 36개월 이상 아이의 '할 일(체크리스트)' 문서 규칙(순수 모듈: DOM·저장소·네트워크 없음).
 * 저장 위치: households/{hid}/todos/{todoId} (가구 공유). 쓰기·미러·대기열은 js/household-sync.js(HouseholdSync.createTodo/patchTodo)가 맡는다.
 * 문서 필드: v(=1) · childKey(가구 안 아이 링크 키, 없으면 그 아이의 familyCode) · title(1~100자) · done(bool) · order(number) · createdAt · updatedAt
 *            · createdBy(선택, 만든 구성원 id) · doneAt(선택) · deletedAt(선택, 소프트 삭제). 삭제는 문서를 지우지 않고 deletedAt 만 남긴다(규칙: delete 금지).
 * firestore.rules 의 todoOk 와 같은 규칙을 test/g22-*.test.js 가 JS 로 재현해 맞춘다.
 */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else root.ChildTodos = factory();
})(typeof window !== "undefined" ? window : global, function () {
  "use strict";

  const TITLE_MAX = 100;
  const REQUIRED_KEYS = Object.freeze(["v", "childKey", "title", "done", "order", "createdAt", "updatedAt"]);
  const OPTIONAL_KEYS = Object.freeze(["createdBy", "doneAt", "deletedAt"]);
  const ORDER_STEP = 1000;

  const clean = (t) => String(t == null ? "" : t).replace(/\s+/g, " ").trim();

  /** 제목 검사 → { ok, title, error } (1~100자, 공백 정리) */
  function checkTitle(raw) {
    const title = clean(raw);
    if (!title) return { ok: false, title, error: "EMPTY" };
    if (title.length > TITLE_MAX) return { ok: false, title, error: "TOO_LONG" };
    return { ok: true, title };
  }

  /** 아이의 살아 있는(삭제 안 한) 할 일, order 오름차순(같으면 만든 순). todos: [{id, ...doc}]. childKey 는 문자열 또는 키 배열
   *  (가구 링크가 만들어지기 전에 가족코드로 적은 할 일이, 링크가 생긴 뒤에도 같은 아이 것으로 보이게 — 둘 다 넘긴다). */
  function listFor(todos, childKey, opts) {
    const hideDone = !!(opts && opts.hideDone);
    const keys = (Array.isArray(childKey) ? childKey : [childKey]).filter(Boolean);
    return (todos || [])
      .filter((d) => d && keys.includes(d.childKey) && d.deletedAt == null && !(hideDone && d.done === true))
      .slice()
      .sort((a, b) => (a.order - b.order) || (a.createdAt - b.createdAt) || (a.id < b.id ? -1 : 1));
  }

  /** 맨 아래에 붙일 order */
  function nextOrder(list) {
    return (list || []).reduce((m, d) => Math.max(m, d.order), 0) + ORDER_STEP;
  }
  /** 맨 위로 보낼 order(가장 작은 값보다 작게) */
  function topOrder(list) {
    return (list || []).reduce((m, d) => Math.min(m, d.order), ORDER_STEP) - ORDER_STEP;
  }

  /** 새 문서. { ok, doc, error } — list 는 listFor(전체, 숨김 없이) 결과(맨 아래 order 계산용). */
  function buildCreate({ childKey, title, list, createdBy }, now) {
    const t = checkTitle(title);
    if (!t.ok) return { ok: false, error: t.error };
    if (!childKey || typeof childKey !== "string") return { ok: false, error: "NO_CHILD" };
    const doc = { v: 1, childKey, title: t.title, done: false, order: nextOrder(list), createdAt: now, updatedAt: now };
    if (createdBy) doc.createdBy = String(createdBy);
    return { ok: true, doc };
  }

  /** 문서 하나를 고치는 patch(HouseholdSync.patchTodo 가 set+merge 로 보낸다). */
  const patchToggle = (done, now) => (done ? { done: true, doneAt: now, updatedAt: now } : { done: false, doneAt: null, updatedAt: now });
  function patchRename(title, now) {
    const t = checkTitle(title);
    return t.ok ? { ok: true, patch: { title: t.title, updatedAt: now } } : { ok: false, error: t.error };
  }
  const patchMoveTop = (list, now) => ({ order: topOrder(list), updatedAt: now });
  const patchDelete = (now) => ({ deletedAt: now, updatedAt: now });

  /** 홈 카드용: 미완료 앞에서 max 줄 + 완료 1줄까지(총 max+1 이하). */
  function homeLines(list, max) {
    const open = (list || []).filter((d) => !d.done).slice(0, max || 3);
    const done = (list || []).filter((d) => d.done).slice(0, 1);
    return { open, done, openTotal: (list || []).filter((d) => !d.done).length };
  }

  /** 규칙(todoOk)과 같은 검사 — 문서 하나(서버에 쓰기 전)가 규칙을 통과하는 모양인지. */
  function validate(doc) {
    const errs = [];
    const keys = Object.keys(doc || {});
    for (const k of REQUIRED_KEYS) if (!(k in doc) || doc[k] == null) errs.push("missing:" + k);
    for (const k of keys) if (!REQUIRED_KEYS.includes(k) && !OPTIONAL_KEYS.includes(k)) errs.push("extra:" + k);
    if (doc.v !== 1) errs.push("v");
    if (typeof doc.childKey !== "string" || doc.childKey.length < 1 || doc.childKey.length > 60) errs.push("childKey");
    if (typeof doc.title !== "string" || doc.title.length < 1 || doc.title.length > TITLE_MAX) errs.push("title");
    if (typeof doc.done !== "boolean") errs.push("done");
    if (typeof doc.order !== "number") errs.push("order");
    if (typeof doc.createdAt !== "number" || typeof doc.updatedAt !== "number") errs.push("times");
    if (doc.createdBy != null && (typeof doc.createdBy !== "string" || doc.createdBy.length > 60)) errs.push("createdBy");
    if (doc.doneAt != null && typeof doc.doneAt !== "number") errs.push("doneAt");
    if (doc.deletedAt != null && typeof doc.deletedAt !== "number") errs.push("deletedAt");
    return { ok: errs.length === 0, errors: errs };
  }

  return { TITLE_MAX, REQUIRED_KEYS, OPTIONAL_KEYS, ORDER_STEP, checkTitle, listFor, nextOrder, topOrder, buildCreate, patchToggle, patchRename, patchMoveTop, patchDelete, homeLines, validate };
});
