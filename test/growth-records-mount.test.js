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
