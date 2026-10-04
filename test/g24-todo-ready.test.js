/* G24 첫 아이 등록 직후 할 일 화면: 가구·아이 연결이 준비되면 다시 그린다 + 준비 중 표시 + 새로고침 뒤 미러 캐시. 실행: node test/g24-todo-ready.test.js */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const CT = require("../js/child-todos.js");
const V = require("../js/over36-view.js");
const HS = require("../js/household-sync.js");
const APP = fs.readFileSync(path.join(__dirname, "..", "js/app.js"), "utf8");
let passed = 0;
async function test(name, f) { try { await f(); passed++; console.log("  ok  - " + name); } catch (e) { process.exitCode = 1; console.log("  FAIL- " + name + "\n      " + (e.stack || e).split("\n").slice(0, 4).join("\n      ")); } }
function fn(name) { const i = APP.indexOf(`  function ${name}(`); assert.ok(i >= 0, name); return APP.slice(i, APP.indexOf("\n  }\n", i) + 4); }
function memStorage() { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m }; }
function fakeAdapter() {
  const docs = new Map(), a = { docs, fail: null,
    async get(p) { return docs.has(p) ? { exists: true, data: { ...docs.get(p) } } : { exists: false, data: null }; },
    async set(p, d, o) { if (a.fail) throw Object.assign(new Error(a.fail), { code: a.fail }); docs.set(p, o && o.merge ? { ...(docs.get(p) || {}), ...d } : { ...d }); },
    async update(p, d) { docs.set(p, { ...docs.get(p), ...d }); }, async list() { return []; }, listen() { return () => {}; } };
  return a;
}
let T = 9000;
const mkHS = (storage, adapter) => HS.create({ adapter: adapter || fakeAdapter(), storage, features: () => ({ household: true }), now: () => ++T, rand: () => 0.5 });

(async () => {
  await test("원인: 첫 등록 직후엔 가족코드·가구 링크가 조금 늦게 생겨 할 일 준비 상태(canTodo)가 false → true 로 바뀌는데, 표식(sig)에 그 상태가 없어 다시 그리지 않았다(실서버에서도 같은 순서 — 가짜 환경만의 현상 아님)", () => {
    assert.ok(/const acct36Sig = \(\) => [\s\S]*`\|auto:[^`]*\|ready:\$\{acct36CanTodo\(\)\}:\$\{acct36Keys\(\)\.join\(","\)\}\|`/.test(APP));
    assert.ok(/ensureFamilyCode[\s\S]{0,400}familyCode = await FamilySync\.createFamily/.test(APP) && /async function ensureFamilyCode\(\) \{[\s\S]*?hhLinkNewChild\(\);/.test(APP), "가족코드는 저장 뒤 네트워크로 만들어진다");
  });
  const wrapEnv = (o) => {
    const log = { home: 0, tab: 0 };
    const sb = {
      acct36Active: () => true, hhEnabled: () => true, us: {}, currentTab: o.tab || "checklist", acct36Sig: () => o.sig(), renderHome: () => log.home++, acct36RenderTodoTab: () => log.tab++,
      usRefreshHome: function () { return "base"; },
    };
    vm.createContext(sb);
    const i0 = APP.indexOf("  const usRefreshHomeBase = usRefreshHome;");
    vm.runInContext(APP.slice(i0, APP.indexOf("\n  };\n", i0) + 6), sb);
    return { sb, log };
  };
  await test("준비 상태가 바뀌면(가족코드·링크 생김) usRefreshHome 이 홈 할 일 카드와 할 일 탭을 다시 그린다 / 같으면 건너뛴다", () => {
    let ready = false;
    const e = wrapEnv({ sig: () => `s|ready:${ready}` });
    e.sb.usRefreshHome(); // 처음: 표식이 비어 있어 한 번 그림
    assert.deepStrictEqual([e.log.home, e.log.tab], [1, 1]);
    e.sb.us.homeSig36 = `s|ready:false`; // 방금 그린 상태
    e.sb.usRefreshHome(); assert.deepStrictEqual([e.log.home, e.log.tab], [1, 1], "그대로면 건너뜀");
    ready = true;
    e.sb.usRefreshHome(); assert.deepStrictEqual([e.log.home, e.log.tab], [2, 2], "준비 완료 → 다시 그림");
    const h = wrapEnv({ tab: "home", sig: () => "x" });
    h.sb.usRefreshHome(); assert.deepStrictEqual([h.log.home, h.log.tab], [1, 0], "홈 화면이면 탭은 안 그림");
  });
  await test("준비되는 시점에 호출된다: 가족코드 생성 뒤 가구 링크(hhLinkNewChild)·가구 시작(hhStart) 래퍼가 usRefreshHome 을 부른다(계정 모드만)", () => {
    assert.ok(/hhLinkNewChild = function hhLinkNewChild\(\) \{\n\s*const r = hhLinkNewChildBase\.apply\(this, arguments\);\n\s*if \(acctEnabled\(\)\) usRefreshHome\(\);/.test(APP));
    assert.ok(/hhStart = function hhStart\(\) \{\n\s*const r = hhStartBase\.apply\(this, arguments\);\n\s*if \(acctEnabled\(\) && typeof usRefreshHome === "function"\) usRefreshHome\(\);/.test(APP));
    assert.ok(/function rememberChild\(\)[\s\S]*?usRefreshHome\(\);/.test(APP), "가족코드가 생기는 순간(rememberChild)에도 호출");
  });
  await test("준비 중 표시: canTodo=false 면 할 일 탭·홈 카드에 '준비 중이에요…'(추가 줄·옛 '가족 캘린더가 만들어지면' 문구 없음), 준비되면 추가 줄", () => {
    const tab = V.renderTodoTab({ name: "수아", list: [], canTodo: false });
    assert.ok(tab.includes("준비 중이에요…") && tab.includes("data-a36-preparing") && !tab.includes("가족 캘린더가 만들어지면") && !tab.includes('data-a36="add"'));
    const home = V.renderHome({ kids: [], name: "수아", todos: { open: [], done: [] }, canTodo: false });
    assert.ok(home.includes("준비 중이에요…") && !home.includes("가족 캘린더가 만들어지면") && !home.includes('data-a36="add-home"'));
    assert.ok(V.renderTodoTab({ name: "수아", list: [], canTodo: true }).includes('data-a36="add">체크리스트 추가 +'));
  });
  await test("링크 생성 전후 키: 가족코드로 적은 할 일이 링크가 생긴 뒤에도 보인다(listFor 키 배열), 새 할 일은 링크가 있으면 링크 키", () => {
    const todos = [{ id: "a", childKey: "FAM12345", title: "링크 전", done: false, order: 1000, createdAt: 1 }, { id: "b", childKey: "c1", title: "링크 후", done: false, order: 2000, createdAt: 2 }, { id: "x", childKey: "c9", title: "다른 아이", done: false, order: 0, createdAt: 3 }];
    assert.deepStrictEqual(CT.listFor(todos, ["c1", "FAM12345"]).map((d) => d.id), ["a", "b"]);
    assert.deepStrictEqual(CT.listFor(todos, "c1").map((d) => d.id), ["b"], "문자열 키는 그대로");
    assert.deepStrictEqual(CT.listFor(todos, ["", null]).map((d) => d.id), [], "빈 키는 아무것도 아님");
    assert.ok(/const acct36Keys = \(\) => \[acct36LinkKey\(\), familyCode\]\.filter\(Boolean\);/.test(APP) && /const acct36ChildKey = \(\) => acct36LinkKey\(\) \|\| familyCode \|\| "";/.test(APP));
  });
  await test("새로고침 뒤에도 할 일 목록이 로컬 미러 캐시로 유지된다(같은 저장소로 새 인스턴스), 대기열도 유지되어 연결되면 전송", async () => {
    const storage = memStorage(), adapter = fakeAdapter();
    adapter.fail = "unavailable"; // 오프라인
    const hs1 = mkHS(storage, adapter);
    const a = await hs1.createTodo("h1", CT.buildCreate({ childKey: "c1", title: "새로고침 전 1", list: [] }, 1).doc);
    const b = await hs1.createTodo("h1", CT.buildCreate({ childKey: "c1", title: "새로고침 전 2", list: CT.listFor(hs1.getTodos("h1"), "c1") }, 2).doc);
    await hs1.patchTodo("h1", a.todoId, CT.patchToggle(true, 3));
    // 새로고침 = 같은 localStorage 로 새 인스턴스
    const hs2 = mkHS(storage, adapter);
    const list = CT.listFor(hs2.getTodos("h1"), "c1");
    assert.deepStrictEqual(list.map((d) => [d.title, d.done]), [["새로고침 전 1", true], ["새로고침 전 2", false]]);
    assert.strictEqual(hs2.getStatus("h1").pending, 3, "서버에 못 올린 변경은 대기열에 남아 있다");
    adapter.fail = null;
    const f = await hs2.flush("h1");
    assert.deepStrictEqual([f.sent, f.remaining], [3, 0]);
    assert.strictEqual(adapter.docs.get(`households/h1/todos/${b.todoId}`).title, "새로고침 전 2");
    // 서버 스냅샷이 아직 안 와도(리스너 전) 미러 캐시만으로 목록이 있다
    const hs3 = mkHS(storage, adapter);
    assert.strictEqual(hs3.getTodos("h1").length, 2);
  });
  console.log(`\n${passed}개 통과`);
})();
