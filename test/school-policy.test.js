"use strict";
// A6-1: data/policy/school.json + SchoolPolicy 로더 + computeSchool 키별 상태 검증
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const CT = require("../js/child-timeline.js");
const SP = require("../js/school-policy.js");

const D = (y, m, d) => new Date(y, m - 1, d);
const raw = JSON.parse(fs.readFileSync(path.join(__dirname, "../data/policy/school.json"), "utf8"));
const clone = (o) => JSON.parse(JSON.stringify(o));
const sch = (policy, b, a, over = {}) => CT.compute({ birthDate: b, asOf: a, stage: "born", policy, ...over }).school;
const t = (name, fn) => fn();

t("school.json 형식: 세 키, kind/상태/출처/시행일", () => {
  assert.deepStrictEqual(Object.keys(raw).sort(), SP.KEYS.slice().sort());
  assert.deepStrictEqual([raw.enrollmentOffsetYears.value, raw.schoolYearStartMonth.value, raw.preElementaryYearsBefore.value], [7, 3, 1]);
  for (const k of ["enrollmentOffsetYears", "schoolYearStartMonth"]) {
    assert.strictEqual(raw[k].kind, "OFFICIAL_POLICY"); assert.strictEqual(raw[k].verificationStatus, "확인됨");
    assert.ok(raw[k].source && raw[k].effectiveDate === "2026-09-11");
  }
  assert.strictEqual(raw.preElementaryYearsBefore.kind, "PRODUCT_DEFINITION");
  assert.strictEqual(raw.preElementaryYearsBefore.verificationStatus, "제품정의");
});

const pol = SP.normalize(raw);
t("normalize 정상", () => { assert.deepStrictEqual(Object.keys(pol).sort(), SP.KEYS.slice().sort()); assert.ok(Object.isFrozen(pol)); });

(async () => {
  const ok = await SP.load(async (p) => { assert.strictEqual(p, "data/policy/school.json"); return { ok: true, json: async () => raw }; });
  assert.deepStrictEqual(ok, pol);
  assert.deepStrictEqual(await SP.load(async () => ({ ok: false })), {});
  assert.deepStrictEqual(await SP.load(async () => { throw new Error("offline"); }), {});
  assert.deepStrictEqual(await SP.load(async () => ({ ok: true, json: async () => { throw new Error("bad json"); } })), {});
  assert.deepStrictEqual(await SP.load(async () => ({ ok: true, json: async () => [1] })), {});

  // 로더 형식 검증: 잘못된 항목은 버려진다
  const bad = (k, f) => { const r = clone(raw); f(r[k]); return SP.normalize(r); };
  assert.ok(!bad("enrollmentOffsetYears", (e) => { e.kind = "PRODUCT_DEFINITION"; }).enrollmentOffsetYears, "kind/상태 불일치");
  assert.ok(!bad("preElementaryYearsBefore", (e) => { e.kind = "OFFICIAL_POLICY"; }).preElementaryYearsBefore, "제품정의 값을 공식 kind 로");
  assert.ok(!bad("schoolYearStartMonth", (e) => { e.value = "3"; }).schoolYearStartMonth, "문자열 값");
  assert.ok(!bad("schoolYearStartMonth", (e) => { delete e.source; }).schoolYearStartMonth, "출처 없음");
  assert.ok(!bad("schoolYearStartMonth", (e) => { delete e.effectiveDate; }).schoolYearStartMonth, "공식 값은 시행일 필수");
  assert.ok(!bad("schoolYearStartMonth", (e) => { e.verificationStatus = "제품정의"; }).schoolYearStartMonth, "공식 kind 에 제품정의");
  assert.ok(bad("schoolYearStartMonth", (e) => { e.verificationStatus = "확인필요"; }).schoolYearStartMonth, "확인필요는 형식상 유효(계산에서 거부)");

  // computeSchool 정상 (로드된 정책)
  const s = sch(pol, D(2020, 5, 10), D(2026, 10, 1));
  assert.deepStrictEqual([s.enrollmentYear, s.schoolYear, s.grade, s.stageBand], [2027, 2026, "PRESCHOOL", "PRE_ELEMENTARY"]);
  const s2 = sch(pol, D(2019, 12, 31), D(2026, 10, 1));
  assert.deepStrictEqual([s2.enrollmentYear, s2.grade, s2.stageBand, s2.gradeLabel], [2026, 1, "ELEMENTARY_LOW", "초1"]);
  assert.strictEqual(sch(pol, D(2020, 1, 1), D(2026, 2, 28)).schoolYear, 2025, "2월은 전 학년도");
  assert.strictEqual(sch(pol, D(2020, 1, 1), D(2026, 3, 1)).schoolYear, 2026, "3월 1일 새 학년도");

  // 누락 / 잘못된 값 → null (A5 안전 동작)
  const b = D(2020, 5, 10), a = D(2026, 10, 1);
  for (const k of SP.KEYS) {
    const r = clone(raw); delete r[k];
    assert.strictEqual(sch(r, b, a), null, `${k} 누락(원본 JSON 그대로)`);
    assert.strictEqual(sch(SP.normalize(r), b, a), null, `${k} 누락(로더 경유)`);
  }
  assert.strictEqual(sch({}, b, a), null); assert.strictEqual(sch(undefined, b, a), null);
  const wrong = (k, f) => { const r = clone(raw); f(r[k]); return r; };
  assert.strictEqual(sch(wrong("enrollmentOffsetYears", (e) => { e.value = 0; }), b, a), null);
  assert.strictEqual(sch(wrong("schoolYearStartMonth", (e) => { e.value = 13; }), b, a), null);
  assert.strictEqual(sch(wrong("preElementaryYearsBefore", (e) => { e.value = 0; }), b, a), null);
  assert.strictEqual(sch(wrong("preElementaryYearsBefore", (e) => { e.value = 1.5; }), b, a), null);

  // 키별 상태 검증
  const st = (k, v) => sch(wrong(k, (e) => { e.verificationStatus = v; }), b, a);
  for (const k of ["enrollmentOffsetYears", "schoolYearStartMonth"]) {
    for (const v of ["제품정의", "확인필요", "", undefined, "unknown"]) assert.strictEqual(st(k, v), null, `${k}=${v}`);
  }
  for (const v of ["확인필요", "", undefined, "unknown"]) assert.strictEqual(st("preElementaryYearsBefore", v), null, `pre=${v}`);
  assert.ok(st("preElementaryYearsBefore", "제품정의"), "pre 제품정의 허용");
  assert.strictEqual(st("preElementaryYearsBefore", "확인됨"), null, "pre 확인됨은 거부");
  assert.strictEqual(sch(wrong("preElementaryYearsBefore", (e) => { e.kind = "OFFICIAL_POLICY"; }), b, a), null, "pre kind 불일치 거부");
  assert.strictEqual(sch(wrong("preElementaryYearsBefore", (e) => { delete e.kind; }), b, a), null, "pre kind 없음 거부");

  // enrollmentYearOverride 우선
  const o = sch(raw, D(2020, 5, 10), D(2027, 10, 1), { enrollmentYearOverride: 2028 });
  assert.deepStrictEqual([o.enrollmentYear, o.grade, o.stageBand], [2028, "PRESCHOOL", "PRE_ELEMENTARY"]);
  const o2 = sch(raw, D(2020, 5, 10), D(2027, 10, 1), { enrollmentYearOverride: 2026 });
  assert.deepStrictEqual([o2.enrollmentYear, o2.grade], [2026, 2]);
  const noOff = clone(raw); delete noOff.enrollmentOffsetYears;
  assert.strictEqual(sch(noOff, D(2020, 5, 10), D(2027, 10, 1), { enrollmentYearOverride: 2027 }).enrollmentYear, 2027, "오프셋 없어도 override 로 계산");
  assert.strictEqual(sch(raw, D(2020, 5, 10), D(2027, 10, 1), { enrollmentYearOverride: 2027.5 }), null, "정수 아닌 override");
  assert.strictEqual(sch(raw, D(2020, 5, 10), D(2027, 10, 1), { enrollmentYearOverride: null }).enrollmentYear, 2027, "null = override 없음");

  // 정책 없이 호출하면 기존과 동일
  assert.strictEqual(CT.compute({ birthDate: b, asOf: a, stage: "born" }).school, null);
  assert.strictEqual(sch(raw, D(2026, 12, 31), D(2026, 9, 30), { stage: "pregnant" }), null, "임신 중 null");
  console.log("school-policy.test.js: 통과");
})().catch((e) => { console.error(e); process.exit(1); });
