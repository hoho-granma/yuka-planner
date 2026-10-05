/* 36+ 할 일 탭 '체크리스트 추가' 저장: 엔터·폼 제출('추가' 버튼·모바일 완료 키)·포커스 이동 모두 한 번만 저장, 실패는 알림, 줄 끝 ⋯ 메뉴로 삭제. 실행: node test/m26-todo-add-save.test.js */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const CT = require("../js/child-todos.js");
const V = require("../js/over36-view.js");
const read = (f) => fs.readFileSync(path.join(__dirname, "..", f), "utf8");
const APP = read("js/app.js");
let passed = 0;
async function test(name, f) { try { await f(); passed++; console.log("  ok  - " + name); } catch (e) { process.exitCode = 1; console.log("  FAIL- " + name + "\n      " + (e.stack || e).split("\n").slice(0, 3).join("\n      ")); } }
function fn(name, async_) { const i = APP.indexOf(`  ${async_ ? "async " : ""}function ${name}(`); assert.ok(i >= 0, name); return APP.slice(i, APP.indexOf("\n  }\n", i) + 4); }

function world(o = {}) {
  const store = [], log = [], timers = [];
  const errEl = { textContent: "", hidden: true, classList: { toggle: (c, on) => (errEl.hidden = !!on) } };
  const sb = { A36: { adding: true, editId: null, menuId: null, saving: false }, ChildTodos: CT, Over36View: V, Date,
    HouseholdSync: { createTodo: async (hid, doc) => { await Promise.resolve(); if (o.fail) return { ok: false, reason: "disabled" }; store.push({ ...doc, id: "t" + store.length }); return { ok: true }; }, patchTodo: async () => ({ ok: true }) },
    hh: { hid: "h1" }, acct36ChildKey: () => (o.noKey ? "" : "c1"), acct36All: () => store, usMeId: () => null, acct36Active: () => true,
    renderHome: () => log.push("home"), acct36RenderTodoTab: () => log.push("tab"), acct36Patch: async (id, p) => log.push("patch:" + id), el: (id) => (id === "a36-err" ? errEl : null),
    document: { activeElement: null }, setTimeout: (f) => timers.push(f), store, log, errEl, timers };
  vm.createContext(sb);
  vm.runInContext(["acct36Err", "acct36AddTodo", "acct36CommitInput", "acct36OnKey", "acct36OnSubmit", "acct36OnFocusOut"].map((n) => fn(n, /^(acct36AddTodo|acct36CommitInput|acct36OnKey)$/.test(n))).join("\n") + "\nObject.assign(globalThis,{acct36CommitInput,acct36OnKey,acct36OnSubmit,acct36OnFocusOut});", sb);
  return sb;
}
const mkInp = (value, kind = "add") => { const i = { value, dataset: { a36Input: kind, a36Id: "t0" }, isConnected: true }; i.closest = (q) => (/data-a36-input/.test(q) ? i : /data-a36-form/.test(q) ? form : null); return i; };
const form = { querySelector: () => form.inp };

(async () => {
  console.log("할 일 추가 저장");
  await test("엔터(key 또는 keyCode 13)로 저장 → 추가되고 다음 줄 입력이 이어진다, 조합 중 엔터는 무시", async () => {
    const w = world(), i = mkInp("숙제");
    await w.acct36OnKey({ key: "Enter", isComposing: true, target: i, preventDefault() {} }); assert.strictEqual(w.store.length, 0);
    await w.acct36OnKey({ keyCode: 13, key: "Unidentified", target: i, preventDefault() {} });
    assert.strictEqual(w.store.length, 1); assert.strictEqual(w.store[0].title, "숙제"); assert.strictEqual(w.A36.adding, true);
  });
  await test("폼 제출('추가' 버튼·모바일 완료 키) → 저장 / 빈 글이면 입력 줄만 닫힘", async () => {
    const w = world(), i = mkInp("빨래"); form.inp = i;
    let prevented = 0; w.acct36OnSubmit({ target: i, preventDefault: () => prevented++ }); await new Promise((r) => setImmediate(r));
    assert.strictEqual(w.store.length, 1); assert.strictEqual(prevented, 1);
    const w2 = world(), e = mkInp("  "); form.inp = e; w2.acct36OnSubmit({ target: e, preventDefault() {} }); await new Promise((r) => setImmediate(r));
    assert.strictEqual(w2.store.length, 0); assert.strictEqual(w2.A36.adding, false);
  });
  await test("키보드를 접거나 다른 곳을 눌러 포커스가 나가도(글이 있으면) 저장되고 입력 줄이 닫힌다 — 이전엔 글이 사라졌다", async () => {
    const w = world(), i = mkInp("청소"); w.acct36OnFocusOut({ target: i }); w.timers[0](); await new Promise((r) => setImmediate(r));
    assert.strictEqual(w.store.length, 1); assert.strictEqual(w.A36.adding, false);
  });
  await test("같은 글이 포커스 이동+'추가' 버튼으로 두 번 들어와도 한 번만 저장된다(진행 중 가드·분리된 입력 무시)", async () => {
    const w = world(), i = mkInp("준비물"); form.inp = i;
    w.acct36OnFocusOut({ target: i }); w.timers[0](); w.acct36OnSubmit({ target: i, preventDefault() {} }); await new Promise((r) => setImmediate(r));
    assert.strictEqual(w.store.length, 1);
    const w2 = world(), j = mkInp("끝난 줄"); w2.acct36OnFocusOut({ target: j }); j.isConnected = false; w2.timers[0](); await new Promise((r) => setImmediate(r));
    assert.strictEqual(w2.store.length, 0, "이미 사라진 입력은 저장하지 않는다");
  });
  await test("저장 실패(쓰기 거부·아이 연결 없음)는 조용히 넘기지 않고 알린다 — 줄을 닫지 않고 글을 남겨 둔다", async () => {
    const a = world({ fail: true }), i = mkInp("실패"); await a.acct36CommitInput(i, true);
    assert.strictEqual(a.store.length, 0); assert.ok(!a.errEl.hidden && a.errEl.textContent === V.MSG.saveFail); assert.strictEqual(a.A36.adding, true);
    const b = world({ noKey: true }); await b.acct36CommitInput(mkInp("연결 없음"), true); assert.ok(!b.errEl.hidden && b.errEl.textContent === V.MSG.saveFail);
    const c = world(); await c.acct36CommitInput(mkInp("가".repeat(101)), true); assert.ok(!c.errEl.hidden && c.errEl.textContent === V.MSG.tooLong);
  });
  await test("고치기 입력도 포커스가 나가면 저장(바뀐 이름) — 비면 취소", async () => {
    const w = world(); w.A36.adding = false; w.A36.editId = "t0"; const i = mkInp("새 이름", "edit"); w.acct36OnFocusOut({ target: i }); w.timers[0](); await new Promise((r) => setImmediate(r));
    assert.deepStrictEqual(w.log.filter((x) => /^patch/.test(x)), ["patch:t0"]); assert.strictEqual(w.A36.editId, null);
  });
  console.log("마크업·삭제");
  await test("입력 줄은 폼(입력 + '추가' 버튼, 엔터 안내 문구 없음), 각 줄 끝에 ⋯ 메뉴 버튼(편집 중 줄은 제외)", () => {
    const list = [{ id: "a", title: "숙제", done: false }];
    const h = V.renderTodoTab({ name: "수아", list, adding: true, canTodo: true });
    assert.ok(/<form class="a36-row a36-inrow" data-a36-form="add"[^>]*>.*data-a36-input="add".*<button type="submit" class="a36-add-btn">추가<\/button><\/form>/.test(h) && !/엔터/.test(h));
    assert.ok(h.includes('data-a36="row-menu" data-a36-id="a"') && !V.renderTodoTab({ name: "수아", list, editId: "a", canTodo: true }).includes('data-a36="row-menu"'));
  });
  await test("⋯ 를 누르면 그 줄의 메뉴가 열리고(길게 누르기 불필요) '삭제'는 소프트 삭제 patch, 길게 누르기 타이머는 ⋯ 에서 시작하지 않는다", () => {
    assert.ok(/a === "row-menu"\) \{ A36\.menuId = act\.dataset\.a36Id;/.test(APP) && /closest\("\[data-a36-toggle\], \[data-a36\], input"\)/.test(APP));
    assert.deepStrictEqual(Object.keys(CT.patchDelete(5)).sort(), ["deletedAt", "updatedAt"]);
    const menu = V.renderTodoMenu("a"); assert.ok(menu.includes('data-a36="menu-del"') && /"menu-del"\) \{ const id = A36\.menuId; A36\.menuId = null; return acct36Patch\(id, ChildTodos\.patchDelete/.test(APP));
  });
  await test("제출 이벤트가 연결돼 있다(acct36Init)", () => { assert.ok(/document\.addEventListener\("submit", acct36OnSubmit\)/.test(APP)); });
  console.log(`\n${passed} passed`);
})();
