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
global.ChildTimeline = require("../js/child-timeline.js");
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

test("isWithinServiceRange: 범위를 36으로 주면 기존 공식 ageInMonths(birth, date) <= 36 과 전 구간 동일, 기본은 서비스 상한(72)", () => {
  const LEG = { maxMonths: CT.LEGACY_TODO_CAP_MONTHS };
  for (const b of [D(2026, 6, 20), D(2023, 9, 30), D(2023, 9, 28), D(2026, 1, 31), D(2024, 2, 29)]) {
    for (let t = D(2023, 1, 1); t.getTime() < D(2036, 1, 1).getTime(); t = D(t.getFullYear(), t.getMonth() + 1, t.getDate() + 1)) {
      assert.strictEqual(CT.isWithinServiceRange(b, t, LEG), globalThis.__legacyAge(b, t) <= 36, `${b.toDateString()} / ${t.toDateString()}`);
      assert.strictEqual(CT.isWithinServiceRange(b, t), globalThis.__legacyAge(b, t) <= 72, `72 ${b.toDateString()} / ${t.toDateString()}`);
    }
  }
});

test("SERVICE_RANGE는 72개월(선택기 11년), 보존 상한·영유아 경계는 36으로 분리되어 있고 변경 불가", () => {
  assert.deepStrictEqual({ ...CT.SERVICE_RANGE }, { maxMonths: 72, pickerYearsBack: 11 });
  assert.strictEqual(CT.LEGACY_TODO_CAP_MONTHS, 36);
  assert.strictEqual(CT.INFANT_TODDLER_MAX_MONTHS, 36);
  assert.ok(Object.isFrozen(CT.SERVICE_RANGE) && Object.isFrozen(CT.CHECKLIST_BUCKETS));
});

// 기준선(app.js) 공식의 복제
const LEGACY = [{ start: 13, end: 17, label: "만 1세 (13~17개월)" }, { start: 18, end: 23, label: "만 1세 (18~23개월)" }, { start: 24, end: 36, label: "만 2세 (24~36개월)" }];
const legacyBucket = (m) => { if (typeof m !== "number" || m <= 12) return m; const b = LEGACY.find((x) => m >= x.start && m <= x.end); return b ? b.start : LEGACY[LEGACY.length - 1].start; };
const legacyLabel = (key) => { const b = LEGACY.find((x) => x.start === key); return b && key > 12 ? b.label : `생후 ${key}개월`; };

test("체크리스트 그룹 키·라벨: 월령 0~36과 비숫자 키가 기준선 공식과 동일(기존 3개 구간의 경계·라벨·순서 불변)", () => {
  for (let m = 0; m <= 36; m++) {
    assert.strictEqual(CT.checklistBucket(m), legacyBucket(m), `bucket ${m}`);
    assert.strictEqual(CT.checklistGroupLabel(CT.checklistBucket(m)), legacyLabel(legacyBucket(m)), `label ${m}`);
  }
  assert.deepStrictEqual(CT.CHECKLIST_BUCKETS.slice(0, 3).map((b) => ({ ...b })), LEGACY);
  assert.strictEqual(CT.checklistBucket("NEED_CHECK"), "NEED_CHECK");
  assert.strictEqual(CT.checklistBucket(null), null);
});

test("A6-3 체크리스트 그룹: 37~47 / 48~59 / 60~72 구간이 뒤에 붙고 빈틈·겹침이 없다", () => {
  assert.deepStrictEqual(CT.CHECKLIST_BUCKETS.slice(3).map((b) => [b.start, b.end, b.label]), [[37, 47, "만 3세 (37~47개월)"], [48, 59, "만 4세 (48~59개월)"], [60, 72, "만 5~6세 (60~72개월)"]]);
  for (let i = 1; i < CT.CHECKLIST_BUCKETS.length; i++) assert.strictEqual(CT.CHECKLIST_BUCKETS[i].start, CT.CHECKLIST_BUCKETS[i - 1].end + 1);
  const exp = (m) => (m <= 36 ? legacyBucket(m) : m <= 47 ? 37 : m <= 59 ? 48 : 60);
  for (let m = 37; m <= 72; m++) assert.strictEqual(CT.checklistBucket(m), exp(m), `bucket ${m}`);
  assert.strictEqual(CT.checklistGroupLabel(48), "만 4세 (48~59개월)");
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

// ── A5-1: 학교·학년(정책 주입형) ─────────────────────────────────────────────────────────
// 아래 정책 값은 **테스트 전용 가정**이다(실제 정책 데이터는 없고, 공식 확인 전). 제품 코드에는 이 값이 없다.
const T_POLICY = {
  enrollmentOffsetYears: { value: 7, verificationStatus: "확인됨", source: "테스트 전용" },
  schoolYearStartMonth: { value: 3, verificationStatus: "확인됨", source: "테스트 전용" },
  preElementaryYearsBefore: { value: 1, kind: "PRODUCT_DEFINITION", verificationStatus: "제품정의", source: "테스트 전용" },
};
const deepFreeze = (o) => (Object.values(o).forEach((v) => v && typeof v === "object" && deepFreeze(v)), Object.freeze(o));
const sch = (b, a, over = {}) => CT.compute({ birthDate: b, asOf: a, stage: "born", policy: T_POLICY, ...over }).school;

test("A5-1 불변: 정책이 없거나 확인되지 않으면 compute 결과는 기존과 키·값까지 같다(school: null)", () => {
  const unverified = { ...T_POLICY, enrollmentOffsetYears: { value: 7, verificationStatus: "확인필요", source: "x" } };
  for (const b of [D(2026, 6, 20), D(2023, 8, 30), D(2024, 2, 29), D(2025, 1, 31)]) {
    for (let m = 0; m <= 40; m++) {
      const asOf = new Date(b.getFullYear(), b.getMonth() + m, 15);
      const base = CT.compute({ birthDate: b, asOf, stage: "born" });
      const total = CT.completedMonths(b, asOf);
      assert.deepStrictEqual(base, { age: { years: Math.floor(total / 12), months: total % 12, totalMonths: total }, label: `생후 ${total}개월`, school: null });
      assert.deepStrictEqual(Object.keys(base), ["age", "label", "school"]);
      for (const policy of [undefined, null, {}, unverified, { ...T_POLICY, schoolYearStartMonth: { value: 13, verificationStatus: "확인됨" } }, { ...T_POLICY, preElementaryYearsBefore: undefined }]) {
        assert.deepStrictEqual(CT.compute({ birthDate: b, asOf, stage: "born", policy }), base);
      }
    }
  }
});

test("A5-1 입학 학년도 = 출생연도 + 정책 오프셋. 1/1생·12/31생·윤일생이 같은 학년도 코호트", () => {
  for (const b of [D(2020, 1, 1), D(2020, 5, 10), D(2020, 12, 31), D(2020, 2, 29)]) assert.strictEqual(sch(b, D(2026, 10, 1)).enrollmentYear, 2027);
  // 설계 §13-7 예: 같은 만 6세, 다른 단계 (가정 오프셋 7)
  const a = sch(D(2019, 12, 5), D(2026, 10, 1)); // 입학 학년도 2026 → 초1
  const b = sch(D(2020, 5, 10), D(2026, 10, 1)); // 입학 학년도 2027 → 예비초등
  assert.deepStrictEqual([a.grade, a.stageBand, a.gradeLabel], [1, "ELEMENTARY_LOW", "초1"]);
  assert.deepStrictEqual([b.grade, b.stageBand, b.gradeLabel, b.yearsToEnrollment], ["PRESCHOOL", "PRE_ELEMENTARY", null, 1]);
});

test("A5-1 학년도 경계: 시작월(3월) 직전 2/28(윤년 2/29)과 3/1", () => {
  const b = D(2020, 5, 10); // 입학 학년도 2027
  const before = sch(b, D(2027, 2, 28));
  const after = sch(b, D(2027, 3, 1));
  assert.deepStrictEqual([before.schoolYear, before.grade, before.stageBand], [2026, "PRESCHOOL", "PRE_ELEMENTARY"]);
  assert.deepStrictEqual([after.schoolYear, after.grade, after.gradeLabel], [2027, 1, "초1"]);
  assert.strictEqual(sch(D(2016, 1, 1), D(2024, 2, 29)).schoolYear, 2023); // 윤일(2/29)도 3월 이전 → 전년도
  assert.strictEqual(sch(D(2016, 1, 1), D(2024, 3, 1)).schoolYear, 2024);
  // 다른 시작월 정책(9월): 8/31 vs 9/1
  const p9 = { ...T_POLICY, schoolYearStartMonth: { value: 9, verificationStatus: "확인됨", source: "테스트 전용" } };
  assert.strictEqual(sch(b, D(2026, 8, 31), { policy: p9 }).schoolYear, 2025);
  assert.strictEqual(sch(b, D(2026, 9, 1), { policy: p9 }).schoolYear, 2026);
});

test("A5-1 학년 구간: 초1~초6, 졸업 후, 영유아/취학 전/예비초등 구분 (월 단위 경계 포함)", () => {
  const b = D(2020, 5, 10);
  assert.deepStrictEqual([1, 2, 3, 4, 5, 6].map((n) => sch(b, D(2026 + n, 3, 1)).gradeLabel), ["초1", "초2", "초3", "초4", "초5", "초6"]);
  assert.deepStrictEqual([1, 2, 3, 4, 5, 6].map((n) => sch(b, D(2026 + n, 3, 1)).stageBand), ["ELEMENTARY_LOW", "ELEMENTARY_LOW", "ELEMENTARY_LOW", "ELEMENTARY_HIGH", "ELEMENTARY_HIGH", "ELEMENTARY_HIGH"]);
  const after = sch(b, D(2033, 3, 1));
  assert.deepStrictEqual([after.grade, after.stageBand, after.gradeLabel], ["AFTER_ELEMENTARY", null, null]);
  assert.strictEqual(sch(b, D(2033, 2, 28)).grade, 6); // 초6 마지막 날까지
  // 2024-06-01생: 36개월(2027-06-01)까지 INFANT_TODDLER, 37개월부터 PRESCHOOL
  const c = D(2024, 6, 1);
  assert.strictEqual(sch(c, D(2026, 5, 1)).stageBand, "INFANT_TODDLER");
  assert.strictEqual(sch(c, D(2027, 6, 1)).stageBand, "INFANT_TODDLER");
  assert.strictEqual(sch(c, D(2027, 7, 1)).stageBand, "PRESCHOOL");
  assert.deepStrictEqual([sch(c, D(2029, 10, 1)).yearsToEnrollment, sch(c, D(2029, 10, 1)).stageBand], [2, "PRESCHOOL"]); // 2029-10: 입학(2031) 2년 전
  assert.strictEqual(sch(c, D(2030, 10, 1)).stageBand, "PRE_ELEMENTARY"); // 입학 직전 학년도(2030)
});

test("A5-1 enrollmentYearOverride(조기입학·유예): 정책 오프셋 없이도 계산, 정수가 아니면 null", () => {
  const noOffset = { schoolYearStartMonth: T_POLICY.schoolYearStartMonth, preElementaryYearsBefore: T_POLICY.preElementaryYearsBefore };
  const s = sch(D(2020, 5, 10), D(2027, 10, 1), { policy: noOffset, enrollmentYearOverride: 2028 });
  assert.deepStrictEqual([s.enrollmentYear, s.grade, s.stageBand], [2028, "PRESCHOOL", "PRE_ELEMENTARY"]);
  assert.strictEqual(sch(D(2020, 5, 10), D(2027, 10, 1), { policy: noOffset }), null, "오프셋도 override 도 없으면 계산 안 함");
  assert.strictEqual(sch(D(2020, 5, 10), D(2027, 10, 1), { enrollmentYearOverride: 2027.5 }), null);
  assert.strictEqual(sch(D(2020, 5, 10), D(2027, 10, 1), { enrollmentYearOverride: "2027" }), null);
  assert.strictEqual(sch(D(2020, 5, 10), D(2027, 10, 1), { enrollmentYearOverride: 2026 }).grade, 2, "조기입학: override 가 오프셋보다 우선");
});

test("A5-1 정책 검증: 키 누락·확인필요·범위 밖 값은 계산하지 않는다(null) — 확정 표시 금지", () => {
  const b = D(2020, 5, 10), a = D(2027, 3, 1);
  const without = (k) => { const p = { ...T_POLICY }; delete p[k]; return p; };
  for (const k of Object.keys(T_POLICY)) {
    assert.strictEqual(sch(b, a, { policy: without(k) }), null, `${k} 없음`);
    assert.strictEqual(sch(b, a, { policy: { ...T_POLICY, [k]: { ...T_POLICY[k], verificationStatus: "확인필요" } } }), null, `${k} 확인필요`);
    assert.strictEqual(sch(b, a, { policy: { ...T_POLICY, [k]: { ...T_POLICY[k], verificationStatus: undefined } } }), null, `${k} 상태 없음`);
  }
  for (const bad of [0, 13, 2.5, "3", null]) assert.strictEqual(sch(b, a, { policy: { ...T_POLICY, schoolYearStartMonth: { value: bad, verificationStatus: "확인됨" } } }), null, `시작월 ${bad}`);
  for (const bad of [0, -1, 7.5, "7"]) assert.strictEqual(sch(b, a, { policy: { ...T_POLICY, enrollmentOffsetYears: { value: bad, verificationStatus: "확인됨" } } }), null, `오프셋 ${bad}`);
});

test("A5-1 임신 중(birthDate = 출산 예정일)에는 정책이 있어도 school null, label null", () => {
  const p = CT.compute({ birthDate: D(2026, 12, 31), asOf: D(2026, 9, 30), stage: "pregnant", policy: T_POLICY });
  assert.strictEqual(p.school, null);
  assert.strictEqual(p.label, null);
});

test("A5-1 스윕: 출생 2015~2025 × 기준일(2~2년 간격) — 입학 학년도 = 출생연도 + 7, 학년은 시간이 지나도 줄지 않고 1씩만 오른다", () => {
  const order = (g) => (g === "PRESCHOOL" ? 0 : g === "AFTER_ELEMENTARY" ? 7 : g);
  for (let y = 2015; y <= 2025; y++) {
    for (const [m, d] of [[1, 1], [2, 29 > 28 ? 28 : 29], [5, 10], [12, 31]]) {
      const b = D(y, m, d);
      let prev = -1;
      for (let t = D(y, 1, 1); t.getTime() <= D(y + 16, 12, 31).getTime(); t = new Date(t.getFullYear(), t.getMonth(), t.getDate() + 5)) {
        const s = sch(b, t);
        assert.strictEqual(s.enrollmentYear, y + 7);
        const o = order(s.grade);
        assert.ok(o >= prev && o - prev <= 7, `${b.toDateString()} ${t.toDateString()}`);
        if (typeof s.grade === "number") assert.strictEqual(s.schoolYear - s.enrollmentYear + 1, s.grade);
        prev = o;
      }
    }
  }
});

test("A5-1 순수성: 입력(날짜·정책)을 변경하지 않는다(deep freeze), 같은 입력 → 같은 출력", () => {
  const policy = deepFreeze(JSON.parse(JSON.stringify(T_POLICY)));
  const b = D(2020, 5, 10), a = D(2027, 3, 1);
  const bT = b.getTime(), aT = a.getTime();
  const s1 = CT.computeSchool(b, a, policy, {});
  const s2 = CT.computeSchool(b, a, policy, {});
  assert.deepStrictEqual(s1, s2);
  assert.strictEqual(b.getTime(), bT);
  assert.strictEqual(a.getTime(), aT);
  assert.strictEqual(CT.computeSchool(b, a, undefined, {}), null);
});

test("A5-1 의존성: 다른 모듈을 require/참조하지 않고 날짜 문자열 변환(toISOString)을 쓰지 않는다", () => {
  const src = fs.readFileSync(path.join(ROOT, "js/child-timeline.js"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  assert.ok(!/require\(|DateCalc|TodoEngine|toISOString|localStorage|firebase/.test(src));
});

console.log(`\n${passed}개 통과${process.exitCode ? ", 일부 실패" : ""}`);
