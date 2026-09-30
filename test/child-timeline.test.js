/*
 * js/child-timeline.js 테스트(A1). 핵심: 기존 ageInMonths(schedule.js)·ageMonthsAt(hn-logic.js)와 결과가 **전 구간 동일**해야 한다.
 * 하나라도 다르면 A1 중단. 실행: node test/child-timeline.test.js
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
global.TodoEngine = require("../js/todo-engine.js");
global.DateCalc = require("../js/date-calc.js");
vm.runInThisContext(fs.readFileSync(path.join(ROOT, "js/schedule.js"), "utf8") + "\n;globalThis.__legacyAge = ageInMonths;");
const L = require("../js/hn-logic.js");
const CT = require("../js/child-timeline.js");

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log("  ok  - " + name); } catch (e) { process.exitCode = 1; console.log("  FAIL- " + name + "\n      " + (e.stack || e).split("\n").slice(0, 4).join("\n      ")); }
}
const D = (y, m, d) => new Date(y, m - 1, d);

test("스윕: 모든 출생일(2019~2030) × 월 경계 기준일 — completedMonths = 기존 ageInMonths = 기존 ageMonthsAt (차이 0건)", () => {
  let checked = 0;
  const end = D(2030, 12, 31).getTime();
  for (let b = D(2019, 1, 1); b.getTime() <= end; b = D(b.getFullYear(), b.getMonth() + 1, b.getDate() + 1)) {
    for (let m = -2; m <= 156; m++) {
      for (const day of [1, 2, 3, 26, 27, 28, 29, 30, 31]) {
        const asOf = new Date(b.getFullYear(), b.getMonth() + m, day);
        const got = CT.completedMonths(b, asOf);
        const legacy = globalThis.__legacyAge(b, asOf);
        const legacy2 = L.ageMonthsAt(b, asOf);
        if (got !== legacy || got !== legacy2) assert.fail(`${b.toDateString()} → ${asOf.toDateString()}: 새 ${got} / ageInMonths ${legacy} / ageMonthsAt ${legacy2}`);
        checked++;
      }
    }
  }
  assert.ok(checked > 6000000, `검사 수 ${checked}`);
});

test("말일생 예: 2026-01-31생은 기존 규칙 그대로(02-28 → 0개월, 03-31 → 2개월) — 말일 규칙으로 통일하지 않는다", () => {
  const b = D(2026, 1, 31);
  assert.strictEqual(CT.completedMonths(b, D(2026, 2, 28)), 0);
  assert.strictEqual(CT.completedMonths(b, D(2026, 3, 1)), 1);
  assert.strictEqual(CT.completedMonths(b, D(2026, 3, 31)), 2);
  assert.strictEqual(CT.completedMonths(b, D(2026, 4, 30)), 2);
});

test("출산 예정일 이전(임신 중)은 0으로 고정", () => {
  assert.strictEqual(CT.completedMonths(D(2026, 12, 31), D(2026, 9, 30)), 0);
});

test("isWithinServiceRange = 기존 공식 ageInMonths(birth, date) <= 36 (전 구간)", () => {
  for (const b of [D(2026, 6, 20), D(2023, 9, 30), D(2023, 9, 28), D(2026, 1, 31), D(2024, 2, 29)]) {
    for (let t = D(2023, 1, 1); t.getTime() < D(2036, 1, 1).getTime(); t = D(t.getFullYear(), t.getMonth() + 1, t.getDate() + 1)) {
      assert.strictEqual(CT.isWithinServiceRange(b, t), globalThis.__legacyAge(b, t) <= 36, `${b.toDateString()} / ${t.toDateString()}`);
    }
  }
});

test("SERVICE_RANGE는 현재 값(36개월, 선택기 8년)이며 변경 불가", () => {
  assert.deepStrictEqual({ ...CT.SERVICE_RANGE }, { maxMonths: 36, pickerYearsBack: 8 });
  assert.ok(Object.isFrozen(CT.SERVICE_RANGE) && Object.isFrozen(CT.CHECKLIST_BUCKETS));
});

// 기준선(app.js) 공식의 복제
const LEGACY = [{ start: 13, end: 17, label: "만 1세 (13~17개월)" }, { start: 18, end: 23, label: "만 1세 (18~23개월)" }, { start: 24, end: 36, label: "만 2세 (24~36개월)" }];
const legacyBucket = (m) => { if (typeof m !== "number" || m <= 12) return m; const b = LEGACY.find((x) => m >= x.start && m <= x.end); return b ? b.start : LEGACY[LEGACY.length - 1].start; };
const legacyLabel = (key) => { const b = LEGACY.find((x) => x.start === key); return b && key > 12 ? b.label : `생후 ${key}개월`; };

test("체크리스트 그룹 키·라벨: 월령 0~60과 비숫자 키가 기준선 공식과 동일", () => {
  for (let m = 0; m <= 60; m++) {
    assert.strictEqual(CT.checklistBucket(m), legacyBucket(m), `bucket ${m}`);
    assert.strictEqual(CT.checklistGroupLabel(CT.checklistBucket(m)), legacyLabel(legacyBucket(m)), `label ${m}`);
  }
  assert.strictEqual(CT.checklistBucket("NEED_CHECK"), "NEED_CHECK");
  assert.strictEqual(CT.checklistBucket(null), null);
});

test("ageLabel / compute: 헤더 문자열 동일, 임신 중은 label 없음, days 필드 없음, school null", () => {
  assert.strictEqual(CT.ageLabel(0), "생후 0개월");
  assert.strictEqual(CT.ageLabel(36), "생후 36개월");
  const c = CT.compute({ birthDate: D(2025, 8, 15), asOf: D(2026, 9, 30), stage: "born" });
  assert.deepStrictEqual(c, { age: { years: 1, months: 1, totalMonths: 13 }, label: "생후 13개월", school: null });
  const p = CT.compute({ birthDate: D(2026, 12, 31), asOf: D(2026, 9, 30), stage: "pregnant" });
  assert.strictEqual(p.label, null);
  assert.strictEqual(p.age.totalMonths, 0);
  assert.ok(!("days" in c.age));
});

test("의존성 없음: 다른 모듈을 require/참조하지 않는다(엔진·DateCalc 무관)", () => {
  const src = fs.readFileSync(path.join(ROOT, "js/child-timeline.js"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.ok(!/require\(|DateCalc|TodoEngine/.test(src));
});

console.log(`\n${passed}개 통과${process.exitCode ? ", 일부 실패" : ""}`);
