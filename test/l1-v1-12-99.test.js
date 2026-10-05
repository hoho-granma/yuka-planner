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
test("1-8(D8): 임신 중에는 어디갈까 탭을 숨기고 가지 않는다(switchTab 가드·applyTabLayout), 아이 프로필이 임신이 아니면 영향 없음", () => {
  const src = require("fs").readFileSync(__dirname + "/../js/app.js", "utf8");
  assert.ok(/const placesHiddenNow = \(\) => isPregnant\(\) \|\| \(!profile && acctExpecting\(\)\);/.test(src));
  assert.ok(/pl\.classList\.toggle\("hidden", !on \|\| placesHiddenNow\(\)\)/.test(src));
  assert.ok(/if \(name === "places" && placesHiddenNow\(\)\) name = "home";/.test(src));
  const vm = require("vm");
  const fn = (n) => { const i = src.indexOf(`const ${n} = `); return src.slice(i, src.indexOf("\n", i)); };
  const run = (isP, prof, exp) => vm.runInNewContext(`${fn("placesHiddenNow")}; placesHiddenNow()`, { isPregnant: () => isP, profile: prof, acctExpecting: () => exp });
  assert.strictEqual(run(true, {}, false), true);
  assert.strictEqual(run(false, {}, true), false, "아이가 있으면 예정 상태 계정이어도 숨기지 않는다");
  assert.strictEqual(run(false, null, true), true);
  assert.strictEqual(run(false, {}, false), false);
});
test("1-7: 예약 폼 '추천일 M/D로 하기' 칩 — 추천일이 있고 날짜가 비었을 때만, 누르면 날짜만 채움(저장은 사용자)", () => {
  const V = require("../js/user-schedule-view.js");
  const base = V.newForm({ date: "", activeChildKey: "c1", links: [{ childKey: "c1", displayName: "a" }], autoRef: "VX-1__a", title: "BCG" });
  assert.ok(!V.renderForm({ ...base }, [{ childKey: "c1", displayName: "a" }], {}).includes("data-us-recommend"), "추천일 없으면 칩 없음");
  const h = V.renderForm({ ...base, recommendIso: "2026-10-14" }, [{ childKey: "c1", displayName: "a" }], {});
  assert.ok(h.includes('data-us-recommend="2026-10-14"') && h.includes("추천일 10/14로 하기"));
  assert.ok(!V.renderForm({ ...base, recommendIso: "2026-10-14", eventDate: "2026-10-20" }, [], {}).includes("data-us-recommend"), "날짜가 이미 있으면 칩 없음");
  const src = require("fs").readFileSync(__dirname + "/../js/app.js", "utf8");
  assert.ok(/us\.form\.eventDate = rec\.getAttribute\("data-us-recommend"\)/.test(src) && !/save[^\n]*data-us-recommend/.test(src));
});
test("2-4: 계정 모드 새 일정에도 '2주마다'가 보이고 저장은 interval 2 로 변환, 매월은 D75 로 활성 칩", () => {
  const V = require("../js/user-schedule-view.js");
  const f = V.upgradeFormG13(V.newForm({ date: "2026-10-12", activeChildKey: null, links: [], defaultAssigneeId: "m1", defaultScope: "FAMILY" }), { meId: "m1" });
  const h = V.renderFormG13({ ...f, repeat: "BIWEEKLY" }, [], { members: [{ memberId: "m1", label: "엄마" }], ctx: { meId: "m1" } });
  assert.ok(h.includes('data-us-repeat="BIWEEKLY"') && h.includes("2주마다") && h.includes('data-us-repeat="MONTHLY"') && !h.includes("곧 추가돼요"));
  const src = require("fs").readFileSync(__dirname + "/../js/app.js", "utf8");
  assert.ok(/\(us\.form\.repeat === "WEEKLY" \|\| us\.form\.repeat === "BIWEEKLY"\)/.test(src), "2주마다도 시작 날짜의 요일이 기본 선택");
  assert.ok(/interval: f\.repeat === "BIWEEKLY" \? 2 : 1/.test(require("fs").readFileSync(__dirname + "/../js/user-schedule-view.js", "utf8")));
});
