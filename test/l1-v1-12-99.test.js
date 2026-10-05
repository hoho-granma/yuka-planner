// v1.12.99: 0-A3 마지막 날 공용 함수·지난 마감 버튼 숨김, 0-C3 지난 항목이 있으면 배너 sub 의 지난 날짜 문구를 쓰지 않는다
const test = require("node:test"), assert = require("node:assert");
const AS = require("../js/auto-steps.js");
const D = (m, d) => new Date(2026, m - 1, d);
const sub = (o) => ({ id: "GG-1", isLegacySubsidy: true, category: "행정·지원금", ...o });
test("lastDayOf: 지역 지원금 deadlineDate(끝 제외)는 하루 빼고, 엔진 windowEnd 는 그대로", () => {
  assert.strictEqual(AS.lastDayOf(sub({ deadlineDate: D(11, 1) })).getTime(), D(10, 31).getTime());
  assert.strictEqual(AS.lastDayOf({ id: "PG-01", windowEnd: D(10, 20) }).getTime(), D(10, 20).getTime());
  assert.strictEqual(AS.lastDayOf({ id: "x" }), null);
});
test("isFamilyLinkable: 마지막 날이 오늘이면 가능, 어제면 숨김, today 없으면 기간 검사 안 함", () => {
  const never = () => false, e = sub({ deadlineDate: D(11, 1) });
  assert.strictEqual(AS.isFamilyLinkable(e, never, D(10, 31)), true);
  assert.strictEqual(AS.isFamilyLinkable(e, never, D(11, 1)), false);
  assert.strictEqual(AS.isFamilyLinkable(e, never), true);
  const pg = { id: "PG-01__x", windowEnd: D(10, 3), detail: { definition: { todo_id: "PG-01", category: "PG" } } };
  assert.strictEqual(AS.isFamilyLinkable(pg, never, D(10, 5)), false);
  assert.strictEqual(AS.isFamilyLinkable(sub({ deadlineDate: null }), never, D(10, 5)), false, "마감일 없는 지역 지원금은 대상 아님");
});
test("app.js: asDateFor 와 canLink 가 같은 마지막 날 함수·today 를 쓴다", () => {
  const src = require("fs").readFileSync(__dirname + "/../js/app.js", "utf8");
  assert.ok(src.includes("AutoSteps.lastDayOf(e)") && src.includes("isFamilyLinkable(e, CalendarModel.isLinkableAuto, new Date())"));
});
test("next-stage: 지난 항목이 있으면 subWhenPast(없으면 빈 문구)", () => {
  const NS = require("../js/next-stage.js");
  const src = require("fs").readFileSync(__dirname + "/../js/next-stage.js", "utf8");
  assert.ok(src.includes("subWhenPast") && src.includes('anyPast'));
  assert.ok(NS.normalizePolicy({ windowMonthsDefault: 3, stages: [{ id: "S", match: { kind: "due" }, headline: "h", sub: "a 12월 31일까지", subWhenPast: "b", items: [{ ref: "X", label: "l", when: "w", dateMode: "window" }] }] }).stages.every((s) => s.subWhenPast === "b"));
});
test("0-C2b: 비계정 폼도 '예방접종' 빠른 칩이면 후보 칩 블록(연결 후보 없으면 비어 있음)", () => {
  const V = require("../js/user-schedule-view.js");
  assert.strictEqual(V.renderAutoCand([]), "");
  assert.ok(V.renderAutoCand([{ id: "VX-1__a", title: "BCG" }]).includes('data-us-autoref="VX-1__a"'));
  const f = { mode: "create", quickKey: "vaccine", title: "", category: "MEDICAL", scope: "FAMILY", childKeys: [], dateKind: "FIXED" };
  const h = V.renderForm(f, [], { autoCandidates: [{ id: "VX-1__a", title: "BCG" }] });
  assert.ok(h.includes("data-us-autocand") && h.indexOf("us-quick") < h.indexOf("data-us-autocand"));
  assert.ok(!V.renderForm({ ...f, quickKey: "hospital" }, [], { autoCandidates: [{ id: "VX-1__a", title: "BCG" }] }).includes("data-us-autocand"));
});
