/* G22 36개월 이상 아이의 메뉴(4탭·AUTO 없음·날짜 하프 시트) + 메모장형 할 일(households/{hid}/todos) + 규칙. 실행: node test/g22-over36-menu-todos.test.js */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const CT = require("../js/child-todos.js");
const V = require("../js/over36-view.js");
const HS = require("../js/household-sync.js");
const read = (f) => fs.readFileSync(path.join(__dirname, "..", f), "utf8");
const APP = read("js/app.js"), RULES = read("firestore.rules"), CSS = read("css/style.css");
let passed = 0;
async function test(name, f) { try { await f(); passed++; console.log("  ok  - " + name); } catch (e) { process.exitCode = 1; console.log("  FAIL- " + name + "\n      " + (e.stack || e).split("\n").slice(0, 4).join("\n      ")); } }
function fn(name, async_) { const i = APP.indexOf(`  ${async_ ? "async " : ""}function ${name}(`); assert.ok(i >= 0, name); return APP.slice(i, APP.indexOf("\n  }\n", i) + 4); }

// ── 가짜 어댑터·저장소 ──
function memStorage() { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m }; }
function fakeAdapter() {
  const docs = new Map(), calls = [], listeners = [];
  const a = { docs, calls, listeners, fail: null,
    async get(p) { return docs.has(p) ? { exists: true, data: { ...docs.get(p) } } : { exists: false, data: null }; },
    async set(p, d, o) { calls.push(["set", p, d, o]); if (a.fail) throw Object.assign(new Error(a.fail), { code: a.fail }); docs.set(p, o && o.merge ? { ...(docs.get(p) || {}), ...d } : { ...d }); },
    async update(p, d) { calls.push(["update", p, d]); if (a.fail) throw Object.assign(new Error(a.fail), { code: a.fail }); docs.set(p, { ...docs.get(p), ...d }); },
    async list(p) { return [...docs.entries()].filter(([k]) => k.startsWith(p + "/") && k.split("/").length === p.split("/").length + 1).map(([k, v]) => ({ id: k.split("/").pop(), data: { ...v } })); },
    listen(p, onData) { const l = { p, onData, off: false }; listeners.push(l); return () => (l.off = true); } };
  return a;
}
let T = 5000;
const mkHS = (flag = true, extra = {}) => { const adapter = extra.adapter || fakeAdapter(), storage = extra.storage || memStorage(); return { adapter, storage, hs: HS.create({ adapter, storage, features: () => ({ household: flag }), now: () => ++T, rand: () => 0.5 }) }; };

(async () => {
  console.log("할 일 문서(ChildTodos)");
  await test("추가: 제목 1~100자(공백 정리)·childKey 필수, order 는 맨 아래, 필드 v1 모양", () => {
    const list = [];
    let r = CT.buildCreate({ childKey: "c1", title: "  수학   숙제 ", list }, 10);
    assert.ok(r.ok && r.doc.title === "수학 숙제" && r.doc.done === false && r.doc.v === 1 && r.doc.order === 1000 && r.doc.createdAt === 10 && r.doc.updatedAt === 10);
    assert.deepStrictEqual(CT.validate(r.doc), { ok: true, errors: [] });
    assert.strictEqual(CT.buildCreate({ childKey: "c1", title: "   ", list }, 1).error, "EMPTY");
    assert.strictEqual(CT.buildCreate({ childKey: "c1", title: "가".repeat(101), list }, 1).error, "TOO_LONG");
    assert.ok(CT.buildCreate({ childKey: "c1", title: "가".repeat(100), list }, 1).ok);
    assert.strictEqual(CT.buildCreate({ childKey: "", title: "x", list }, 1).error, "NO_CHILD");
    const l2 = [{ id: "a", order: 1000, childKey: "c1" }, { id: "b", order: 2500, childKey: "c1" }];
    assert.strictEqual(CT.buildCreate({ childKey: "c1", title: "x", list: l2, createdBy: "m1" }, 1).doc.order, 3500);
    assert.strictEqual(CT.buildCreate({ childKey: "c1", title: "x", list: l2, createdBy: "m1" }, 1).doc.createdBy, "m1");
  });
  await test("목록: 그 아이의 것만·삭제 제외·order 순, 완료 숨기기, 홈 카드 줄(미완료 3 + 완료 1)", () => {
    const todos = [
      { id: "t3", childKey: "c1", title: "c", done: false, order: 3000, createdAt: 1 }, { id: "t1", childKey: "c1", title: "a", done: false, order: 1000, createdAt: 1 },
      { id: "t2", childKey: "c1", title: "b", done: true, order: 2000, createdAt: 1 }, { id: "x", childKey: "c2", title: "다른 아이", done: false, order: 0, createdAt: 1 },
      { id: "d", childKey: "c1", title: "삭제됨", done: false, order: 500, createdAt: 1, deletedAt: 9 },
      { id: "t4", childKey: "c1", title: "d", done: false, order: 4000, createdAt: 1 }, { id: "t5", childKey: "c1", title: "e", done: true, order: 5000, createdAt: 1 }, { id: "t6", childKey: "c1", title: "f", done: false, order: 6000, createdAt: 1 },
    ];
    assert.deepStrictEqual(CT.listFor(todos, "c1").map((d) => d.id), ["t1", "t2", "t3", "t4", "t5", "t6"]);
    assert.deepStrictEqual(CT.listFor(todos, "c1", { hideDone: true }).map((d) => d.id), ["t1", "t3", "t4", "t6"]);
    const h = CT.homeLines(CT.listFor(todos, "c1"), 3);
    assert.deepStrictEqual([h.open.map((d) => d.id), h.done.map((d) => d.id), h.openTotal], [["t1", "t3", "t4"], ["t2"], 4]);
  });
  await test("완료·되돌리기·고치기·맨 위로·삭제 patch 모양(순서·소프트 삭제)", () => {
    assert.deepStrictEqual(CT.patchToggle(true, 7), { done: true, doneAt: 7, updatedAt: 7 });
    assert.deepStrictEqual(CT.patchToggle(false, 8), { done: false, doneAt: null, updatedAt: 8 });
    assert.deepStrictEqual(CT.patchRename("  새   제목 ", 9), { ok: true, patch: { title: "새 제목", updatedAt: 9 } });
    assert.strictEqual(CT.patchRename("", 9).ok, false);
    assert.strictEqual(CT.patchRename("가".repeat(101), 9).error, "TOO_LONG");
    assert.strictEqual(CT.patchMoveTop([{ order: 1000 }, { order: 2000 }], 5).order, 0);
    assert.deepStrictEqual(CT.patchDelete(11), { deletedAt: 11, updatedAt: 11 });
  });

  console.log("동기화(HouseholdSync 미러·대기열)");
  await test("추가·완료·맨 위로·삭제: 미러에 즉시 반영되고 서버로도 간다(set + merge)", async () => {
    const { hs, adapter } = mkHS();
    const base = CT.buildCreate({ childKey: "c1", title: "A", list: [] }, 1).doc;
    const a = await hs.createTodo("h1", base);
    const b = await hs.createTodo("h1", CT.buildCreate({ childKey: "c1", title: "B", list: CT.listFor(hs.getTodos("h1"), "c1") }, 2).doc);
    assert.ok(a.ok && a.pending === false && a.todoId && b.todoId !== a.todoId);
    assert.deepStrictEqual(CT.listFor(hs.getTodos("h1"), "c1").map((d) => d.title), ["A", "B"]);
    await hs.patchTodo("h1", a.todoId, CT.patchToggle(true, 3));
    assert.strictEqual(hs.getTodos("h1").find((d) => d.id === a.todoId).done, true);
    await hs.patchTodo("h1", a.todoId, CT.patchToggle(false, 4));
    const m = hs.getTodos("h1").find((d) => d.id === a.todoId);
    assert.ok(m.done === false && !("doneAt" in m), "null 패치는 미러에서 필드 삭제");
    await hs.patchTodo("h1", b.todoId, CT.patchMoveTop(CT.listFor(hs.getTodos("h1"), "c1"), 5));
    assert.deepStrictEqual(CT.listFor(hs.getTodos("h1"), "c1").map((d) => d.title), ["B", "A"]);
    await hs.patchTodo("h1", a.todoId, CT.patchDelete(6));
    assert.deepStrictEqual(CT.listFor(hs.getTodos("h1"), "c1").map((d) => d.title), ["B"]);
    const w = adapter.calls.filter((c) => c[0] === "set");
    assert.ok(w.every((c) => c[1].startsWith("households/h1/todos/")) && w.slice(2).every((c) => c[3] && c[3].merge === true));
    assert.ok(w.length === 6 && adapter.docs.get(`households/h1/todos/${a.todoId}`).deletedAt === 6, "서버 문서는 소프트 삭제(문서 유지)");
  });
  await test("오프라인에서 추가하면 대기열에 들어가고(미러엔 바로 보임), 연결되면 순서대로 flush 된다", async () => {
    const { hs, adapter } = mkHS();
    adapter.fail = "unavailable";
    const r = await hs.createTodo("h1", CT.buildCreate({ childKey: "c1", title: "오프라인 추가", list: [] }, 1).doc);
    await hs.patchTodo("h1", r.todoId, CT.patchToggle(true, 2));
    assert.ok(r.pending === true && hs.getStatus("h1").pending === 2);
    assert.deepStrictEqual(hs.getTodos("h1").map((d) => [d.title, d.done]), [["오프라인 추가", true]]);
    adapter.fail = null;
    const f = await hs.flush("h1");
    assert.deepStrictEqual([f.sent, f.remaining], [2, 0]);
    assert.strictEqual(adapter.docs.get(`households/h1/todos/${r.todoId}`).done, true);
  });
  await test("합류·리스너: todos 도 미러에 합친다(대기열 문서는 로컬 우선), 리스너 5개, 규칙 미배포(list 실패)여도 합류는 계속", async () => {
    const A = mkHS();
    A.adapter.docs.set("householdCodes/ABCD2345", { householdId: "h9", active: true });
    A.adapter.docs.set("households/h9", { v: 1 });
    A.adapter.docs.set("households/h9/todos/t1", CT.buildCreate({ childKey: "c1", title: "서버 할 일", list: [] }, 1).doc);
    const j = await A.hs.joinHousehold("ABCD2345");
    assert.ok(j.ok && A.hs.getTodos("h9").length === 1);
    A.hs.startListening("h9");
    assert.ok(A.adapter.listeners.some((l) => l.p === "households/h9/todos") && A.adapter.listeners.length === 5);
    const B = mkHS();
    B.adapter.docs.set("householdCodes/ABCD2345", { householdId: "h9", active: true });
    B.adapter.docs.set("households/h9", { v: 1 });
    const orig = B.adapter.list;
    B.adapter.list = async (p) => { if (p.endsWith("/todos")) throw Object.assign(new Error("denied"), { code: "permission-denied" }); return orig(p); };
    assert.ok((await B.hs.joinHousehold("ABCD2345")).ok);
  });
  await test("OFF: 할 일 메서드도 어댑터·저장소를 건드리지 않는다", async () => {
    const { hs, adapter, storage } = mkHS(false);
    assert.strictEqual((await hs.createTodo("h1", {})).reason, "disabled");
    assert.strictEqual((await hs.patchTodo("h1", "t", {})).reason, "disabled");
    assert.deepStrictEqual(hs.getTodos("h1"), []);
    assert.strictEqual(adapter.calls.length, 0);
    assert.strictEqual(storage.m.size, 0);
  });

  console.log("규칙(firestore.rules todos 블록 — JS 재현 + 문구 대조)");
  const block = RULES.slice(RULES.indexOf("match /households/{householdId}/todos/{todoId}"), RULES.indexOf("[D2] 계정(accounts) 블록"));
  const listIn = (re) => [...(re.exec(block)[1].matchAll(/'([A-Za-z]+)'/g))].map((m) => m[1]);
  const REQ = listIn(/hasAll\(\[([^\]]*)\]\)/), ALLOW = listIn(/hasOnly\(\[([^\]]*)\]\)/);
  const todoOk = (d) => REQ.every((k) => k in d) && Object.keys(d).every((k) => ALLOW.includes(k)) && d.v === 1
    && typeof d.childKey === "string" && d.childKey.length >= 1 && d.childKey.length <= 60 && typeof d.title === "string" && d.title.length >= 1 && d.title.length <= 100
    && typeof d.done === "boolean" && typeof d.order === "number" && typeof d.createdAt === "number" && typeof d.updatedAt === "number"
    && (!("createdBy" in d) || d.createdBy == null || (typeof d.createdBy === "string" && d.createdBy.length <= 60)) && (!("doneAt" in d) || d.doneAt == null || typeof d.doneAt === "number") && (!("deletedAt" in d) || d.deletedAt == null || typeof d.deletedAt === "number");
  const createOk = (d) => todoOk(d);
  const updateOk = (before, after) => todoOk(after) && after.v === before.v && after.createdAt === before.createdAt && after.childKey === before.childKey;
  await test("규칙 문구: 필수·허용 키가 ChildTodos 와 같고, delete 금지·소프트 삭제·schedules 와 같은 읽기 범위, 기존 블록은 그대로(추가만)", () => {
    assert.deepStrictEqual(REQ.slice().sort(), CT.REQUIRED_KEYS.slice().sort());
    assert.deepStrictEqual(ALLOW.slice().sort(), [...CT.REQUIRED_KEYS, ...CT.OPTIONAL_KEYS].sort());
    assert.ok(/allow get, list: if true;/.test(block) && /allow delete: if resource == null \|\| isMemberOf\(householdId\);/.test(block) && /allow create: if todoOk\(request\.resource\.data\);/.test(block));
    assert.ok(/request\.resource\.data\.childKey == resource\.data\.childKey/.test(block) && /request\.resource\.data\.createdAt == resource\.data\.createdAt/.test(block));
    assert.ok(/d\.title\.size\(\) >= 1 && d\.title\.size\(\) <= 100/.test(block) && /d\.childKey\.size\(\) >= 1 && d\.childKey\.size\(\) <= 60/.test(block));
    assert.ok(RULES.includes("match /households/{householdId}/schedules/{scheduleId}") && RULES.includes("match /accounts/{uid}"), "기존 블록 유지");
    assert.strictEqual((RULES.match(/\{/g) || []).length, (RULES.match(/\}/g) || []).length, "중괄호 짝");
  });
  await test("규칙 허용: ChildTodos 가 만드는 문서·patch 결과는 통과(생성·완료·고치기·맨 위로·소프트 삭제·되돌리기 null)", () => {
    const doc = CT.buildCreate({ childKey: "c1", title: "A", list: [], createdBy: "m1" }, 1).doc;
    assert.ok(createOk(doc));
    for (const patch of [CT.patchToggle(true, 2), CT.patchToggle(false, 3), CT.patchRename("B", 4).patch, CT.patchMoveTop([doc], 5), CT.patchDelete(6)]) assert.ok(updateOk(doc, { ...doc, ...patch }), JSON.stringify(patch));
  });
  await test("규칙 거부: 키 누락·초과, 제목 0/101자, done 타입, v≠1, childKey 길이, 불변 필드(childKey·createdAt·v) 변경", () => {
    const ok = CT.buildCreate({ childKey: "c1", title: "A", list: [] }, 1).doc;
    const bad = [{ ...ok, extra: 1 }, (({ order, ...r }) => r)(ok), { ...ok, title: "" }, { ...ok, title: "가".repeat(101) }, { ...ok, done: "yes" }, { ...ok, v: 2 }, { ...ok, childKey: "" }, { ...ok, childKey: "k".repeat(61) }, { ...ok, order: "1" }, { ...ok, createdBy: 5 }, { ...ok, deletedAt: "x" }];
    bad.forEach((d, i) => assert.ok(!createOk(d), "거부되어야 함 #" + i));
    assert.ok(!updateOk(ok, { ...ok, childKey: "c2" }) && !updateOk(ok, { ...ok, createdAt: 99 }) && !updateOk(ok, { ...ok, v: 2 }));
    assert.ok(/allow delete: if resource == null \|\| isMemberOf\(householdId\);/.test(block), "H4: 할 일 삭제는 가구 구성원만(소프트 삭제는 update 그대로)");
  });

  console.log("36개월 이상 메뉴(app.js)");
  const sbFor = (o) => {
    const cls = new Set(), navSub = { hidden: false, classList: { toggle: (c, on) => (navSub.hidden = on) } }, ck = { textContent: "체크리스트" };
    const sb = { acctEnabled: () => o.on !== false, ChildTimeline: { completedMonths: (b) => b.months, OVER36_FROM_MONTHS: 36 }, profile: o.profile, currentTab: o.tab || "home", switched: [], switchTab: (n) => sb.switched.push(n), Over36View: V,
      window: { buildSchedule: () => ["AUTO1", "AUTO2"] }, document: { body: { classList: { toggle: (c, on) => (on ? cls.add(c) : cls.delete(c)) } }, querySelector: (q) => (q.includes("subsidy") ? navSub : q.includes("trend") ? null : ck) }, cls, navSub, ck, Date };
    vm.createContext(sb);
    vm.runInContext([fn("acct36Child"), "const acct36Active = () => acct36Child(profile);", fn("acct36Sync")].join("\n"), sb);
    return sb;
  };
  await test("판정: 만 36개월 정각부터 4탭(혜택 숨김·체크리스트→할 일), 35개월·임신 중·OFF·아이 없음은 기존 5탭", () => {
    const on = sbFor({ profile: { birthDate: { months: 36 }, stage: "born" } }); on.acct36Sync();
    assert.ok(on.cls.has("acct-36") && on.navSub.hidden === true && on.ck.textContent === "할 일");
    for (const [name, o] of [["35개월", { profile: { birthDate: { months: 35 }, stage: "born" } }], ["임신 중", { profile: { birthDate: { months: 40 }, stage: "pregnant" } }], ["OFF", { on: false, profile: { birthDate: { months: 80 }, stage: "born" } }], ["아이 없음", { profile: null }]]) {
      const x = sbFor(o); x.acct36Sync();
      assert.ok(!x.cls.has("acct-36") && x.navSub.hidden === false && x.ck.textContent === "체크리스트", name);
    }
  });
  await test("칩으로 아이를 바꿔(profile 교체) 다시 맞추면 바로 전환: 36+ → 미만 → 36+, 혜택 탭이던 화면은 홈으로", () => {
    const x = sbFor({ profile: { birthDate: { months: 120 }, stage: "born" } });
    x.acct36Sync(); assert.ok(x.cls.has("acct-36"));
    x.profile = { birthDate: { months: 3 }, stage: "born" }; x.acct36Sync(); assert.ok(!x.cls.has("acct-36") && x.ck.textContent === "체크리스트");
    x.profile = { birthDate: { months: 50 }, stage: "born" }; x.currentTab = "subsidy"; x.acct36Sync();
    assert.ok(x.cls.has("acct-36") && x.switched.includes("home"));
    assert.ok(/renderAll = function renderAll\(\) \{\n\s*renderAllBase\.apply\(this, arguments\);\n\s*if \(acctEnabled\(\)\) acct36Sync\(\);/.test(APP), "renderAll(아이 전환·저장의 끝)에서 맞춘다");
  });
  await test("36개월 이상: 항목별 허용 표식(autoAfter36)이 있는 AUTO 만 보인다 — app.js 우회 래퍼 없음, 표식 없는 항목은 숨김(36개월 미만·임신 중은 HEAD 노출 그대로)", () => {
    assert.ok(!/function buildSchedule\(/.test(APP), "app.js 에 buildSchedule 대체 함수가 없다");
    assert.ok(/schedule = buildSchedule\(\{ \.\.\.profile, schoolPolicy, pregnancyConfirmDate: pregConfirmIso\(\) \}, dataset, completionsForEngine\(\)\)/.test(APP), "호출부는 전역 buildSchedule 을 그대로 부른다");
    assert.ok(/isShown: ChildTimeline\.isEventShown/.test(APP) && /birthDate: profile\.birthDate/.test(APP), "visibleSchedule 은 허용 판정(isEventShown)을 순수 함수(HNLogic.visibleSchedule)에 넘긴다");
    require("./tools/load-engine.js");
    const AA = require("../js/auto-after36.js"); const CTm = require("../js/child-timeline.js");
    const defs = JSON.parse(read("data/todos/health-checkup.json")).todos;
    const now = new Date();
    const at = (months) => new Date(now.getFullYear(), now.getMonth() - months, 1);
    const run = (birthDate, stage, allow) => global.__buildSchedule({ birthDate, province: "서울특별시", district: "구로구", gender: "M", birthOrder: "first", stage: stage || "born" }, { todoDefinitions: defs, subsidy: { subsidies: [] }, autoAfter36: allow }, []);
    const none = AA.normalize(null), hc = AA.normalize({ items: [{ todo_id: "HC-07" }, { todo_id: "HC-08" }, { todo_id: "HC-09" }] });
    const shown = (b, ev) => ev.filter((e) => CTm.isEventShown(b, e, now));
    for (const m of [36, 40, 50]) assert.deepStrictEqual(shown(at(m), run(at(m), "born", none)).length, 0, `${m}개월: 허용 목록 없음 → 0건`);
    assert.strictEqual(shown(at(40), run(at(40), "born", undefined)).length, 0, "목록을 못 읽어도 0건");
    const ids = (b, a) => [...new Set(shown(b, run(b, "born", a)).map((e) => e.detail.instance.todo_id))].sort();
    assert.ok(ids(at(40), hc).every((i) => /^HC-0[789]$/.test(i)) && ids(at(40), hc).length > 0, "허용 항목만 보인다");
    assert.ok(shown(at(35), run(at(35), "born", none)).length > 0, "35개월은 목록과 무관하게 HEAD 노출");
    assert.ok(shown(new Date(now.getFullYear() + 1, 0, 15), run(new Date(now.getFullYear() + 1, 0, 15), "pregnant", none)).length > 0, "임신 중도 그대로");
  });
  await test("홈·체크리스트 탭: 36+ 일 때만 새 화면(래퍼), 아니면 원래 함수 — switchTab 은 36+ 에서 혜택 탭을 막는다", () => {
    assert.ok(/renderHome = function renderHome\(\) \{\n\s*if \(!acct36Active\(\)\) renderHomeBase\.apply\(this, arguments\);\n\s*else acct36RenderHome\(\);\n\s*nsSync\(\);/.test(APP));
    assert.ok(/renderChecklistTab = function renderChecklistTab\(\) \{\n\s*if \(!acct36Active\(\)\) return renderChecklistTabBase\.apply\(this, arguments\);/.test(APP));
    assert.ok(APP.includes('acct36Active() && name === "subsidy" ? "home" : name'));
    const h = V.renderHome({ kids: [{ code: "A", name: "수아", ageText: "10세", current: true }, { code: "B", name: "은찬", ageText: "3개월" }], name: "수아", familyHtml: "<section>가족</section>", todos: CT.homeLines([{ id: "1", title: "숙제", done: false }, { id: "2", title: "빨래", done: true }], 3), canTodo: true });
    assert.ok(h.indexOf("home-child-chips") < h.indexOf("가족") && h.indexOf("가족") < h.indexOf("수아 할 일") && h.indexOf("수아 할 일") < h.indexOf("자주 쓰는 일정"), "칩 → 가족 카드 → 할 일 카드 → 자주 쓰는 일정");
    assert.ok(h.includes('data-a36="add-home"') && h.includes("체크리스트 추가 +") && h.includes('data-a36-quick="학원"') && h.includes('data-a36-quick="숙제"') && h.includes('data-a36-quick="준비물"'));
  });

  console.log("날짜 일정은 달력 아래 패널(하프 시트 없음)·할 일 탭 화면");
  await test("36개월 이상도 달력 아래 일정 패널을 쓴다: 하프 시트·날짜 칸 시트 열기·좌우 넘기기 코드가 없고 패널을 숨기는 CSS도 없다", () => {
    assert.ok(!APP.includes("acct36OpenDay") && !APP.includes("acct36OnGridClick") && !APP.includes("acct36GoDay") && !APP.includes('modalMode = "day36"'));
    assert.ok(!V.renderDaySheet && !V.clockParts, "하프 시트 마크업 없음");
    assert.ok(!CSS.includes("acct-36 .selected-day-card { display: none; }") && !/\.a36-(day|tlr|dnav|dhead)\b/.test(CSS));
    assert.ok(/function calendarDayItems\(date\)/.test(APP) && /usRenderDayPanel\(date, byUrgency\)/.test(APP), "달력 아래 패널(자동 행·사용자 카드·+ 추가)은 36개월 미만과 같은 렌더");
  });
  await test("할 일 탭(메모장형): 머리 '[아이] 체크리스트' + '완료 숨기기' 스위치, 체크박스 줄, 맨 아래 '체크리스트 추가 +', 입력 줄·고치기 입력·길게 누르는 메뉴", () => {
    const list = [{ id: "a", title: "숙제", done: false }, { id: "b", title: "빨래", done: true }];
    const h = V.renderTodoTab({ name: "수아", list, hideDone: false, canTodo: true });
    assert.ok(h.includes("수아 체크리스트") && h.includes('data-a36="hide-done"') && h.includes('role="switch"') && h.includes("완료 숨기기") && h.includes('data-a36-toggle="a"') && h.includes('a36-t done">빨래') && h.includes('data-a36="add">체크리스트 추가 +'));
    assert.ok(V.renderTodoTab({ name: "수아", list, adding: true, canTodo: true }).includes('data-a36-input="add"') && !V.renderTodoTab({ name: "수아", list, adding: true, canTodo: true }).includes('data-a36="add"'));
    assert.ok(V.renderTodoTab({ name: "수아", list, editId: "a", canTodo: true }).includes('data-a36-input="edit"'));
    assert.ok(V.renderTodoTab({ name: "수아", list, canTodo: false }).includes("준비 중이에요"));
    const m = V.renderTodoMenu("a");
    assert.ok(["menu-edit", "menu-top", "menu-del"].every((k) => m.includes(`data-a36="${k}"`)) && m.includes("고치기") && m.includes("맨 위로") && m.includes("삭제"));
    assert.ok(APP.includes("}, 500) };") || /setTimeout\(\(\) => \{ A36\.press = null;[\s\S]*?\}, 500\)/.test(APP), "500ms 길게 누르기");
    assert.ok(/ev\.key !== "Enter"/.test(APP) && APP.includes("// 엔터 → 추가되고 다음 줄 입력이 이어진다(adding 유지)"));
  });

  console.log("OFF 보존");
  await test("OFF('0'): 새 코드는 계정 모드 가드(acct36Child → acctEnabled) 뒤, 새 CSS 는 body.acct-design 범위, OFF 의 홈·탭 DOM 은 그대로", () => {
    assert.ok(/function acct36Child\(p\) \{\n\s*return typeof acctEnabled === "function" && acctEnabled\(\)/.test(APP));
    assert.ok(/function acct36Init\(\) \{\n\s*if \(!acctEnabled\(\)/.test(APP));
    const i = CSS.indexOf("/* ===== G22:");
    const rules = CSS.slice(i).split("/* ═══ v1.12.92")[0].replace(/\/\*[\s\S]*?\*\//g, "").replace(/@media[^{]*\{/g, "").split("}").map((r) => r.split("{")[0].trim()).filter(Boolean);
    rules.forEach((sel) => sel.split(",").forEach((x) => assert.ok(x.trim().startsWith("body.acct-design"), x)));
    const html = read("index.html");
    assert.ok(/<script src="js\/child-todos\.js\?v=\d+"><\/script>/.test(html) && /<script src="js\/over36-view\.js\?v=\d+"><\/script>/.test(html));
    const sw = read("sw.js");
    assert.ok(sw.includes('"./js/child-todos.js"') && sw.includes('"./js/over36-view.js"'));
    assert.ok(!html.includes("a36-todo-box"), "정적 index.html 에 새 DOM 없음(계정 모드에서 JS 가 만든다)");
  });
  console.log(`\n${passed}개 통과`);
})();
