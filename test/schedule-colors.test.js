const { test } = require("node:test"), assert = require("node:assert/strict"), fs = require("fs"), vm = require("vm");
const V = require("../js/user-schedule-view.js");
test("동일 카테고리 일정도 서로 다른 색, 반복 회차·새로고침·일정 추가에도 기존 색 유지", () => {
  const first = V.assignScheduleColors(["piano", "swim", "art"], {}, () => .5);
  assert.equal(new Set(Object.values(first)).size, 3);
  assert.equal(V.scheduleColor({ scheduleId: "piano", key: "piano@2026-10-06" }, first), V.scheduleColor({ scheduleId: "piano", key: "piano@2026-10-13" }, first));
  const next = V.assignScheduleColors(["new", "art", "swim", "piano"], JSON.parse(JSON.stringify(first)), () => .1);
  assert.equal(next.piano, first.piano); assert.equal(next.swim, first.swim);
  assert.equal(new Set(Object.values(next)).size, 4);
  const ten = V.assignScheduleColors(Array.from({ length: 10 }, (_, i) => "s" + i), {}, () => .9);
  assert.equal(new Set(Object.values(ten)).size, 10);
  assert.equal(V.assignScheduleColors(["s"], { s: -1 }, () => 0).s, 0);
});
test("36개월 이상 선택은 일정별 토글, 미만은 기존 카테고리 토글", () => {
  const old = V.renderFilterChips([], { mode: "kids", catColor: true });
  const next = V.renderFilterChips([], { mode: "kids", scheduleColorAvailable: true, scheduleColor: true });
  assert.ok(old.includes("카테고리별 색깔 다르게 하기"));
  assert.ok(next.includes("일정별 색깔 다르게 하기") && next.includes('data-us-action="toggle-schedule-color"'));
  assert.ok(!next.includes("카테고리별 색깔 다르게 하기"));
  assert.ok(next.includes("직접 등록한 일정만 보기"));
});
test("선택한 아이 월령으로 판단: 36개월 경계·혼합 선택·어른 선택·계정 OFF", () => {
  const source = fs.readFileSync(__dirname + "/../js/app.js", "utf8"), start = source.indexOf("  function usScheduleColorAvailable(");
  const fn = source.slice(start, source.indexOf("\n  }\n", start) + 4);
  const run = (ages, mode = "kids", account = true) => vm.runInNewContext(fn + "\nusScheduleColorAvailable()", { acctEnabled: () => account, usSelectionMode: () => mode, usSel: () => Object.keys(ages).map((k) => "CHILD:" + k), usChildAge: (k) => ages[k] });
  assert.equal(run({ a: 35 }), false); assert.equal(run({ a: 36 }), true);
  assert.equal(run({ a: 40, b: 12 }), false); assert.equal(run({ a: 40, b: 36 }), true);
  assert.equal(run({ a: "PREGNANT" }), false); assert.equal(run({ a: 40 }, "member"), false);
  assert.equal(run({ a: 40 }, "kids", false), false);
});
test("달력 칩: 같은 카테고리도 스케줄별 색, 껐을 때는 아이 색으로 복원", () => {
  const a = { scheduleId: "a", title: "피아노", scope: "CHILD", childKeys: ["child"], category: "LESSON" };
  const b = { ...a, scheduleId: "b", title: "미술" };
  const links = [{ childKey: "child", colorKey: "p1" }], items = [{ t: "u", occ: a }, { t: "u", occ: b }];
  const colors = (s) => [...s.matchAll(/background:(#[0-9a-f]+);/g)].map((m) => m[1]);
  const slots = V.assignScheduleColors(["a", "b"], {}, () => 0);
  const on = colors(V.cellChips(items, { mode: "kids", links, scheduleSlots: slots }));
  const off = colors(V.cellChips(items, { mode: "kids", links, scheduleSlots: null }));
  assert.notEqual(on[0], on[1]); assert.equal(off[0], off[1]);
});
