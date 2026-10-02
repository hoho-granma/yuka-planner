/*
 * N5: 72개월 초과 아이의 체크리스트 — 미완료 영유아 항목 숨김(완료·학교·그때그때 확인 유지), 72 이하 불변.
 * 실행: node test/n5-past-infant.test.js
 */
const assert = require("assert");
const { HN } = require("./tools/load-engine.js");

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log("  ok  - " + name); } catch (e) { process.exitCode = 1; console.log("  FAIL- " + name + "\n      " + (e.stack || e).split("\n").slice(0, 4).join("\n      ")); }
}
const items = [{ id: "A", k: "m" }, { id: "B", k: "m" }, { id: "S", k: "school" }, { id: "N", k: "need" }];
const isKeep = (e) => e.k !== "m";
const today = new Date(2026, 9, 2);
const run = (b, completed, extra) => HN.hidePastInfantItems(items, completed, { birthDate: b, today, isKeep, ...extra }).map((e) => e.id);

test("경계: 72개월 이하는 그대로, 73개월부터 미완료 영유아 항목 숨김", () => {
  assert.strictEqual(HN.isBeyondServiceRange(new Date(2020, 9, 2), today), false); // 72개월 정확히
  assert.strictEqual(HN.isBeyondServiceRange(new Date(2020, 9, 3), today), false); // 71개월
  assert.strictEqual(HN.isBeyondServiceRange(new Date(2020, 8, 2), today), true); // 73개월
  assert.deepStrictEqual(run(new Date(2020, 9, 2), {}), ["A", "B", "S", "N"]);
  assert.deepStrictEqual(run(new Date(2020, 8, 2), {}), ["S", "N"]);
});
test("72개월 이하는 같은 배열을 돌려준다(DOM 변화 0)", () => {
  assert.strictEqual(HN.hidePastInfantItems(items, {}, { birthDate: new Date(2024, 0, 1), today, isKeep }), items);
});
test("완료한 항목은 유지, 학교·그때그때 확인해요 유지", () => {
  assert.deepStrictEqual(run(new Date(2018, 0, 1), { A: { done: true } }), ["A", "S", "N"]);
});
test("토글(showPast)을 켜면 전부 보인다", () => {
  assert.deepStrictEqual(run(new Date(2018, 0, 1), {}, { showPast: true }), ["A", "B", "S", "N"]);
});
test("생일·today 없음/임신 중(미래 출생)은 숨기지 않는다, 입력 배열은 변하지 않는다", () => {
  assert.strictEqual(HN.hidePastInfantItems(items, {}, {}), items);
  assert.strictEqual(HN.isBeyondServiceRange(new Date(2027, 0, 1), today), false);
  const before = JSON.stringify(items);
  run(new Date(2018, 0, 1), {});
  assert.strictEqual(JSON.stringify(items), before);
});
test("안내 문구 상수", () => {
  assert.strictEqual(HN.PAST_INFANT_MSG.notice, "초등 이후 체크리스트는 준비 중이에요. 지난 영유아 항목은 아래 보기 버튼으로 확인할 수 있어요.");
  assert.strictEqual(HN.PAST_INFANT_MSG.toggle, "지난 영유아 항목 보기");
});
test("app.js 연결: 홈 범위 보기 제외·학교/확인 유지·토글 기본 꺼짐·72 이하는 안내 카드 없음", () => {
  const app = require("fs").readFileSync(require("path").join(__dirname, "..", "js", "app.js"), "utf8");
  assert.ok(/let showPastInfant = false;/.test(app));
  assert.ok(/const beyondRange = !checklistScope && HNLogic\.isBeyondServiceRange\(profile\.birthDate, new Date\(\)\);/.test(app));
  assert.ok(/k === NEED_CHECK_GROUP \|\| k === SCHOOL_GROUP/.test(app));
  assert.ok(/const pastCard = beyondRange\s*\?/.test(app) && /: "";\s*\n\s*el\("list-checklist"\)\.innerHTML = pastCard \+ monthKeys/.test(app));
  assert.ok(/!scoped && !pastHidden\) for/.test(app));
});
console.log(`\n${passed}개 통과${process.exitCode ? ", 일부 실패" : ""}`);
