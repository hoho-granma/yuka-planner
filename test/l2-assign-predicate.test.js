const test = require("node:test"), assert = require("node:assert");
const L = require("../js/hn-logic.js");
const birth = new Date(2026, 0, 10);
const ev = (id, k, cat) => ({ id, category: cat || "발달", scheduleKind: k, windowStart: new Date(2026, 5, 1), windowEnd: new Date(2026, 5, 20) });
const list = [ev("A", "window"), ev("B", "window"), ev("C", "monthly"), ev("V", "window", "예방접종"), ev("S", "window", "행정·지원금")];
const o = { birthDate: birth, monthKeysOf: () => [3] };
const ser = (m) => JSON.stringify([...m].map(([k, v]) => [k, v.map((d) => d.getTime())]));
test("술어 없으면 지금과 동일(없음·undefined·항상 true)", () => {
  const base = ser(L.assignDisplayDays(list, o));
  assert.equal(ser(L.assignDisplayDays(list, { ...o, inCalendar: undefined })), base);
  assert.equal(ser(L.assignDisplayDays(list, { ...o, inCalendar: () => true })), base);
});
test("술어 false 항목은 칸이 없고 나머지는 배치된다", () => {
  const m = L.assignDisplayDays(list, { ...o, inCalendar: (e) => e.id !== "B" });
  assert.ok(!m.has("B")); assert.ok(m.has("A") && m.has("C") && m.has("V"));
});
