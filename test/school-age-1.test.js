/*
 * 학령기 확장 1단계: 정의 단위 옵트인(extendedVisibility)·체크리스트 구간 3개·학교 단계 GRADE_n·N5 isKeep. 72개월 이하 불변.
 * 실행: node test/school-age-1.test.js
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const CT = require("../js/child-timeline.js");

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log("  ok  - " + name); } catch (e) { process.exitCode = 1; console.log("  FAIL- " + name + "\n      " + (e.stack || e).split("\n").slice(0, 4).join("\n      ")); }
}
const ev = (def, date, key) => ({ isEngineEvent: true, date, detail: { definition: def, instance: { occurrenceKey: key || "default" } } });
const RULE = { fromAgeMonths: 73, maxVisibleMonths: 144 };
const birth = new Date(2017, 5, 15);
const at = (months, day = 15) => new Date(2017, 5 + months, day);

test("규칙 없는 정의는 기존 그대로(72 상한·36 보존), 규칙은 occurrenceKeys 로 회차를 가린다", () => {
  const plain = ev({ triggerType: "AGE_WINDOW", triggerParams: { startMonth: 0, endMonth: 72 } }, at(100));
  assert.strictEqual(CT.isEventVisible(birth, plain, at(120)), false);
  assert.strictEqual(CT.effectiveMaxMonths(plain), 72);
  const def = { triggerType: "AGE_WINDOW", triggerParams: { startMonth: 0, endMonth: 144 }, extendedVisibility: [{ ...RULE, occurrenceKeys: ["dose-5"] }] };
  assert.strictEqual(CT.extendedRuleOf(ev(def, at(144), "dose-4")), null);
  assert.ok(CT.extendedRuleOf(ev(def, at(144), "dose-5")));
  assert.strictEqual(CT.effectiveMaxMonths(ev(def, at(144), "dose-4")), 72);
  assert.strictEqual(CT.effectiveMaxMonths(ev(def, at(144), "dose-5")), 144);
  assert.ok(CT.extendedRuleOf(ev({ ...def, extendedVisibility: [RULE] }, at(144), "dose-1")), "occurrenceKeys 없으면 모든 회차");
});
test("규칙 이벤트: 아이 월령 73 이상 & 이벤트 월령 ≤144일 때만 보인다(72개월 이하 아이에게는 숨김)", () => {
  const e = ev({ extendedVisibility: [RULE] }, at(140));
  assert.strictEqual(CT.isEventVisible(birth, e, at(72)), false); // 72개월 아이
  assert.strictEqual(CT.isEventVisible(birth, e, at(73)), true);
  assert.strictEqual(CT.isEventVisible(birth, e, at(120)), true);
  assert.strictEqual(CT.isEventVisible(birth, ev({ extendedVisibility: [RULE] }, at(145)), at(120)), false); // 144 초과 이벤트
  assert.strictEqual(CT.isEventVisible(birth, ev({ extendedVisibility: [{ ...RULE, maxVisibleMonths: 999 }] }, at(150)), at(140)), false); // 상한 144 클램프
  assert.strictEqual(CT.isEventVisible(birth, ev({ extendedVisibility: [{ fromAgeMonths: "73", maxVisibleMonths: 144 }] }, at(100)), at(120)), false); // 잘못된 규칙은 무시(기존 규칙)
});
test("체크리스트 구간: 기존 6개 불변, 73~144 3개 추가(빈틈·겹침 없음), 73 이상 월령 매핑", () => {
  const b = CT.CHECKLIST_BUCKETS;
  assert.deepStrictEqual(b.slice(3, 6).map((x) => x.start), [37, 48, 60]);
  assert.deepStrictEqual(b.slice(6).map((x) => [x.start, x.end, x.label]), [[73, 95, "만 6~7세 (73~95개월)"], [96, 119, "만 8~9세 (96~119개월)"], [120, 144, "만 10~12세 (120~144개월)"]]);
  for (let i = 1; i < b.length; i++) assert.strictEqual(b[i].start, b[i - 1].end + 1);
  for (let m = 13; m <= 72; m++) assert.ok(CT.checklistBucket(m) <= 60, "기존 구간 매핑 불변 " + m);
  assert.deepStrictEqual([73, 95, 96, 119, 120, 144].map(CT.checklistBucket), [73, 73, 96, 96, 120, 120]);
  assert.strictEqual(CT.checklistGroupLabel(96), "만 8~9세 (96~119개월)");
});
test("학교 단계 가시성: GRADE_<n> 일반화(GRADE_1 동작 불변)", () => {
  const e = (vs, grade) => ({ isEngineEvent: true, date: at(90), schoolStage: grade === null ? null : { stageBand: "X", grade }, detail: { definition: { triggerType: "SCHOOL_TERM_WINDOW", visibleStages: vs }, instance: {} } });
  assert.strictEqual(CT.isEventVisible(birth, e(["GRADE_1"], 1)), true);
  assert.strictEqual(CT.isEventVisible(birth, e(["GRADE_1"], 4)), false);
  assert.strictEqual(CT.isEventVisible(birth, e(["GRADE_4"], 4)), true);
  assert.strictEqual(CT.isEventVisible(birth, e(["GRADE_1", "GRADE_4"], 4)), true);
  assert.strictEqual(CT.isEventVisible(birth, e(["GRADE_4"], "PRESCHOOL")), false);
  assert.strictEqual(CT.isEventVisible(birth, e(["GRADE_4"], null)), false);
});
test("전역 상수·N5 연결: SERVICE_RANGE 72 유지, 확장 상한 144, isKeep 이 72 초과 월령 키를 유지", () => {
  assert.deepStrictEqual({ ...CT.SERVICE_RANGE }, { maxMonths: 72, pickerYearsBack: 11 });
  assert.strictEqual(CT.EXTENDED_MAX_MONTHS, 144);
  const app = fs.readFileSync(path.join(__dirname, "..", "js", "app.js"), "utf8");
  assert.ok(app.includes('(typeof k === "number" && k > ChildTimeline.SERVICE_RANGE.maxMonths)'));
});
console.log(`\n${passed}개 통과${process.exitCode ? ", 일부 실패" : ""}`);
