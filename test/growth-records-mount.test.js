const { test } = require("node:test");
const assert = require("node:assert/strict");
const G = require("../js/growth-records.js");
global.URL.createObjectURL = () => "blob:x"; global.URL.revokeObjectURL = () => {};
const host = () => ({ innerHTML: "", querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, removeEventListener() {} });
const scope = JSON.stringify(["u1", "ABC"]);
const rec = (id, extra = {}) => ({ id, scope, group: "academy", activity: "피아노", title: "t" + id, text: "x", date: "2026-10-08", createdAt: 1, ...extra });
const tick = () => new Promise((r) => setTimeout(r, 5));
test("탭 진입은 사진 없이 목록을 먼저 읽고 사진은 개별 요청한다", async () => {
  const calls = { read: [], img: 0 };
  const backend = { read: async (s, o) => { calls.read.push(o); return [rec("a", { attachment: { storagePath: "p/a" }, image: null })]; }, loadImage: async () => { calls.img++; return { image: new Blob(["i"]), imageError: false, attachmentStatus: "ok" }; }, pendingLocal: async () => [], save: async (r) => r };
  const h = host(); G.mount(h, { scope, backend, familyId: "h1", name: "은찬", compact: true });
  await tick(); await tick();
  assert.deepEqual(calls.read, [{ attachments: false }]); assert.equal(calls.img, 1); assert.match(h.innerHTML, /ta/);
  G.unmount();
});
test("같은 아이를 다시 열면 지난 목록을 로딩 문구 없이 바로 그린다", async () => {
  const backend = { read: async () => [rec("b")], loadImage: async () => ({}), pendingLocal: async () => [], save: async (r) => r };
  const first = host(); G.mount(first, { scope, backend, familyId: "h2", name: "은찬" }); await tick(); G.unmount();
  const second = host(); G.mount(second, { scope, backend, familyId: "h2", name: "은찬" });
  assert.doesNotMatch(second.innerHTML, /기록을 불러오고 있어요/); assert.match(second.innerHTML, /tb/);
  G.unmount();
});
// 활동 버튼 이름·종류 바꾸기 / 삭제, 1회성 일정은 자동 연결하지 않음
const click = (h, attrs, dataset = {}) => h.onclick({ target: { closest: (sel) => (sel === "[data-gr-full]" ? null : { hasAttribute: (k) => k in attrs, dataset }) } });
function mem(rows) { const calls = []; return { calls, rows, backend: { read: async () => rows.slice(), pendingLocal: async () => [], loadImage: async () => ({}), save: async (r) => { calls.push(["save", r.id, r.activity, r.group]); const i = rows.findIndex((x) => x.id === r.id); rows[i] = { ...r }; return rows[i]; }, remove: async (r) => { calls.push(["remove", r.id]); const i = rows.findIndex((x) => x.id === r.id); rows.splice(i, 1); } } }; }
test("1회성 일정은 활동 버튼으로 자동 연결하지 않고 반복 수업만 연결", () => {
  const lessons = [{ title: "수영", weekly: null }, { title: "피아노", weekly: 2 }];
  assert.deepEqual(G.visibleLessons(lessons, "s", "f").map((l) => l.title), ["피아노"]);
});
test("분류를 열면 첫 활동이 기본 선택되고 이름·종류 바꾸기/삭제 버튼이 보인다", async () => {
  const m = mem([rec("a"), rec("b")]); const h = host(); G.mount(h, { scope, backend: m.backend, familyId: "m1", name: "은찬", compact: true }); await tick();
  assert.match(h.innerHTML, /data-gr-activity="피아노" aria-pressed="true"/); assert.match(h.innerHTML, /피아노의 기록/); assert.match(h.innerHTML, /＋ 성장기록 남기기/); assert.doesNotMatch(h.innerHTML, /활동기록 상세보기/);
  click(h, { "data-gr-activity": 1 }, { grActivity: "피아노" });
  assert.match(h.innerHTML, /data-gr-manage="rename"/); assert.match(h.innerHTML, /이 활동 삭제/);
  G.unmount();
});
test("활동 이름·종류 바꾸기는 그 활동의 모든 기록을 다시 저장한다", async () => {
  const m = mem([rec("a"), rec("b"), rec("c", { activity: "수영" })]); const h = host(); G.mount(h, { scope, backend: m.backend, familyId: "m2", name: "은찬" }); await tick();
  click(h, { "data-gr-activity": 1 }, { grActivity: "피아노" }); click(h, { "data-gr-manage": 1 }, { grManage: "rename" });
  assert.match(h.innerHTML, /data-gr-rename-form/);
  h.onsubmit({ target: { matches: () => true, preventDefault() {}, elements: { name: { value: "바이올린" }, group: { value: "activity" } } }, preventDefault() {} }); await tick(); await tick();
  assert.deepEqual(m.calls.map((c) => c.join("|")), ["save|a|바이올린|activity", "save|b|바이올린|activity"]);
  assert.equal(m.rows.find((r) => r.id === "c").activity, "수영");
  G.unmount();
});
test("활동 삭제는 그 활동의 기록만 지우고 버튼도 사라진다", async () => {
  const m = mem([rec("a"), rec("b"), rec("c", { activity: "수영" })]); const h = host(); G.mount(h, { scope, backend: m.backend, familyId: "m3", name: "은찬" }); await tick();
  click(h, { "data-gr-activity": 1 }, { grActivity: "피아노" }); click(h, { "data-gr-manage": 1 }, { grManage: "delete" });
  assert.match(h.innerHTML, /기록 2개를 삭제할까요/);
  click(h, { "data-gr-delete-confirm": 1 }); await tick(); await tick();
  assert.deepEqual(m.calls.map((c) => c.join("|")), ["remove|a", "remove|b"]);
  assert.doesNotMatch(h.innerHTML, /data-gr-activity="피아노"/); assert.match(h.innerHTML, /data-gr-activity="수영"/);
  G.unmount();
});

test("분류 탭에 개수가 나오고, 탭을 누르면 그 분류의 첫 활동이 선택된다", async () => {
  const m = mem([rec("a"), rec("b"), rec("c", { group: "home", activity: "독서" }), rec("d", { group: "home", activity: "요리" })]); const h = host(); G.mount(h, { scope, backend: m.backend, familyId: "m4", name: "은찬" }); await tick();
  assert.match(h.innerHTML, /data-gr-group="academy"[^>]*class="on">학원<small>2<\/small>/); assert.match(h.innerHTML, /가정활동<small>2<\/small>/);
  click(h, { "data-gr-group": 1 }, { grGroup: "home" });
  assert.match(h.innerHTML, /data-gr-activity="독서" aria-pressed="true"/); assert.match(h.innerHTML, /gr-g-home/);
  G.unmount();
});
