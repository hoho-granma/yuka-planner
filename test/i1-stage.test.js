/* W1: stage·나이·학년 중앙화 — 동작 불변 정리. 단일 진입점(ChildTimeline.stageOf)과 기존 구현과의 동치(월령 전 구간·경계일), 학년 통일, 상수 한 곳.
 * 실행: node --test test/i1-stage.test.js */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const CT = require("../js/child-timeline.js");
const HO = require("../js/home-order.js");
const SK = require("../js/schedule-kinds.js");
const ET = require("../js/edu-trend.js");
const SP = require("../js/school-policy.js");
const ROOT = path.join(__dirname, "..");
const policy = SP.normalize(JSON.parse(fs.readFileSync(path.join(ROOT, "data/policy/school.json"), "utf8")));

// 옛 구현(W1 이전 코드 그대로)
const oldMonths = (b, a) => { let m = (a.getFullYear() - b.getFullYear()) * 12 + (a.getMonth() - b.getMonth()); if (a.getDate() < b.getDate()) m -= 1; return Math.max(0, m); };
const oldSigned = (bi, ti) => { const [by, bm, bd] = bi.split("-").map(Number); const [ty, tm, td] = ti.split("-").map(Number); return (ty - by) * 12 + (tm - bm) - (td < bd ? 1 : 0); };
const oldGradeOf = (b, t) => { const sy = t.getMonth() >= 2 ? t.getFullYear() : t.getFullYear() - 1; const g = sy - b.getFullYear() - 6; return g < 1 ? 0 : g > 6 ? 7 : g; };
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function* pairs() { // 출생일 × 기준일(월 경계·말일·2/29 포함)
  for (const by of [2016, 2020, 2023, 2024, 2026]) for (const bm of [0, 1, 2, 5, 11]) for (const bd of [1, 15, 28, 29, 30, 31]) {
    const b = new Date(by, bm, bd); if (b.getMonth() !== bm) continue;
    for (let off = -2; off <= 180; off++) for (const day of [1, 14, 28, 30, 31]) {
      const t = new Date(by, bm + off, day); yield [b, t];
    }
  }
}

test("월령 동치: ChildTimeline.completedMonths = 옛 공식, home-order.monthsBetween = 옛 공식, schedule-kinds.ageMonths = 옛 공식(출산 전은 음수 그대로)", () => {
  let n = 0;
  for (const [b, t] of pairs()) {
    n++;
    assert.strictEqual(CT.completedMonths(b, t), oldMonths(b, t), `${iso(b)} → ${iso(t)}`);
    assert.strictEqual(HO.monthsBetween(b, t), oldMonths(b, t));
    assert.strictEqual(SK.ageMonths(iso(b), iso(t)), oldSigned(iso(b), iso(t)), `kinds ${iso(b)} → ${iso(t)}`);
    assert.strictEqual(CT.signedMonths(b, t), oldSigned(iso(b), iso(t)));
  }
  assert.ok(n > 20000, "표본 " + n);
  assert.strictEqual(SK.ageMonths("x", "2026-01-01"), null);
});

test("학년 동치: 조기입학·유예가 없으면 EduTrend.gradeOf = 옛 규칙, ChildTimeline.gradeNumber(정책)·(정책 없음)도 같다", () => {
  for (const [b, t] of pairs()) {
    const old = oldGradeOf(b, t);
    assert.strictEqual(ET.gradeOf(b, t), old, `${iso(b)} → ${iso(t)}`);
    assert.strictEqual(ET.gradeOf(b, t, { policy }), old);
    assert.strictEqual(CT.gradeNumber(b, t, policy, {}), old);
    assert.strictEqual(CT.gradeNumber(b, t, null, {}), old);
    const s = CT.computeSchool(b, t, policy, {});
    assert.strictEqual(typeof s.grade === "number" ? s.grade : s.grade === "AFTER_ELEMENTARY" ? 7 : 0, old, "computeSchool 과 같다");
  }
});

test("바뀌는 동작(허용된 유일한 변경): 조기입학·유예(enrollmentYearOverride)가 교육 트렌드 학년에 반영된다", () => {
  const b = new Date(2019, 5, 1), t = new Date(2026, 9, 5); // 기본 초1(입학 2026)
  assert.strictEqual(ET.gradeOf(b, t), 1);
  assert.strictEqual(ET.gradeOf(b, t, { policy, enrollmentYearOverride: 2025 }), 2, "한 해 일찍 → 초2");
  assert.strictEqual(ET.gradeOf(b, t, { policy, enrollmentYearOverride: 2027 }), 0, "한 해 늦게 → 아직 입학 전");
  assert.strictEqual(ET.gradeOf(b, t, { enrollmentYearOverride: 2025 }), 2, "정책을 못 읽어도 반영");
  assert.strictEqual(ET.gradeOf(b, t, { policy, enrollmentYearOverride: null }), 1, "override 없음(null)은 기본");
  const APP = fs.readFileSync(path.join(ROOT, "js/app.js"), "utf8");
  assert.ok(APP.includes("EduTrend.gradeOf(profile.birthDate, new Date(), { policy: schoolPolicy, enrollmentYearOverride: profile.enrollmentYearOverride })"));
});

test("stageOf 경계: 임신·0·11·12·35·36·59·60·71·72·95·96개월, 초1~초6·중1", () => {
  const asOf = new Date(2026, 9, 15);
  const at = (m) => ({ birthDate: new Date(2026, 9 - m, 1), asOf, stage: "born" });
  const st = (m) => CT.stageOf(at(m));
  assert.deepStrictEqual(CT.stageOf({ birthDate: new Date(2027, 0, 1), asOf, stage: "pregnant" }), { stage: "PREGNANT", ageMonths: null, grade: null, isPregnant: true });
  const expect = { 0: "INFANT", 11: "INFANT", 12: "TODDLER", 35: "TODDLER", 36: "AGE_3_5", 59: "AGE_3_5", 60: "AGE_3_5", 71: "AGE_3_5", 72: "AGE_6_7" };
  for (const [m, want] of Object.entries(expect)) { assert.strictEqual(st(+m).stage, want, m + "개월"); assert.strictEqual(st(+m).ageMonths, +m); assert.strictEqual(st(+m).isPregnant, false); }
  assert.strictEqual(st(95).ageMonths, 95); assert.strictEqual(st(96).ageMonths, 96);
  // 학년이 월령보다 우선: 2026-10 기준 2019년생 = 초1, …, 2014년생 = 초6, 2013년생 = 중1(초등 이후)
  for (let g = 1; g <= 6; g++) {
    const r = CT.stageOf({ birthDate: new Date(2020 - g, 5, 1), asOf, stage: "born", policy });
    assert.deepStrictEqual([r.stage, r.grade], ["ELEMENTARY", g], "초" + g);
  }
  assert.deepStrictEqual(["stage", "grade"].map((k) => CT.stageOf({ birthDate: new Date(2013, 5, 1), asOf, stage: "born", policy })[k]), ["SECONDARY", 7], "중1");
  // 72개월 이상이어도 입학 전이면 만 6~7세
  assert.strictEqual(CT.stageOf({ birthDate: new Date(2020, 1, 1), asOf, stage: "born", policy }).stage, "AGE_6_7", "80개월·아직 입학 전(2027 입학)");
  assert.strictEqual(CT.stageOf({ birthDate: new Date(2020, 1, 1), asOf, stage: "born", policy, enrollmentYearOverride: 2026 }).stage, "ELEMENTARY", "조기입학 → 초1");
  assert.ok(Object.isFrozen(CT.STAGES) && Object.isFrozen(CT.STAGE_EDGES));
});

test("36 상수 한 곳: ChildTimeline.OVER36_FROM_MONTHS 에서 파생, 값은 36 그대로 / 모듈·app.js 에 36 리터럴 판정이 남지 않는다", () => {
  assert.strictEqual(CT.OVER36_FROM_MONTHS, 36);
  assert.strictEqual(CT.LEGACY_TODO_CAP_MONTHS, 36); assert.strictEqual(CT.INFANT_TODDLER_MAX_MONTHS, 36);
  assert.strictEqual(HO.THRESHOLD_MONTHS, 36); assert.strictEqual(ET.MENU_FROM_MONTHS, 36);
  const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
  assert.ok(/const OVER36_FROM_MONTHS = 36;/.test(read("js/child-timeline.js")));
  assert.ok(!/(THRESHOLD_MONTHS|MENU_FROM_MONTHS) = 36/.test(read("js/home-order.js") + read("js/edu-trend.js")));
  assert.ok(!/(?:<|>=)\s*36\b/.test(read("js/app.js").replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "")), "app.js 에 < 36 / >= 36 리터럴 없음");
  assert.ok(!/\bageInMonths\(/.test(read("js/app.js")), "app.js 는 정본(ChildTimeline.completedMonths)을 부른다");
});

test("todo-engine.ageInMonths 는 30일 근사(소수 월령)라 정본과 다른 개념 — 통합하지 않는다(엔진 계산 불변)", () => {
  const TE = require("../js/todo-engine.js");
  const b = new Date(2026, 0, 31), t = new Date(2026, 2, 1);
  assert.ok(Number.isInteger(CT.completedMonths(b, t)) && !Number.isInteger(TE.ageInMonths(b, t)));
});
