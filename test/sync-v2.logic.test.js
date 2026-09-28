/*
 * js/sync-v2.js의 "순수 로직"(Firestore I/O 없음)만 검증하는 단위 테스트.
 * 실행: node test/sync-v2.logic.test.js
 *
 * 이 환경에는 Firebase CLI/에뮬레이터가 없어 실제 Firestore read/write는
 * 이 테스트로 검증하지 못한다 — 그 부분은 test/firestore-v2-manual-test.html로
 * 사용자가 직접(실제 프로젝트에) 확인해야 한다. docs/Firestore-스키마-설계.md 섹션 7 참고.
 */
const assert = require("assert");
const { buildCompletionId, isLegacyFamilyDoc, planLegacyMigration } = require("../js/sync-v2.js");

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ok  - ${name}`);
  } catch (e) {
    console.error(`FAIL - ${name}`);
    console.error(`       ${e.message}`);
    process.exitCode = 1;
  }
}

console.log("buildCompletionId");
test("단일 Todo 완료 ID 생성", () => {
  assert.strictEqual(buildCompletionId("HC-03", "default", "TODO_COMPLETED"), "HC-03__default__TODO_COMPLETED");
});
test("다회차 접종 ID는 occurrenceKey로 구분된다", () => {
  const a = buildCompletionId("VX-DTAP", "dose-1", "TODO_COMPLETED");
  const b = buildCompletionId("VX-DTAP", "dose-2", "TODO_COMPLETED");
  assert.notStrictEqual(a, b);
});
test("마일스톤 보고와 완료 처리는 같은 todo_id라도 다른 문서가 된다", () => {
  const reported = buildCompletionId("SF-04", "default", "MILESTONE_REPORTED");
  const completed = buildCompletionId("SF-04", "default", "TODO_COMPLETED");
  assert.notStrictEqual(reported, completed);
});
test("같은 조합은 항상 같은 ID(=upsert로 자연 중복방지)", () => {
  const a = buildCompletionId("FD-08", "default", "TODO_COMPLETED");
  const b = buildCompletionId("FD-08", "default", "TODO_COMPLETED");
  assert.strictEqual(a, b);
});
test("알 수 없는 recordType은 에러", () => {
  assert.throws(() => buildCompletionId("HC-03", "default", "WRONG_TYPE"));
});
test("필수값 누락 시 에러", () => {
  assert.throws(() => buildCompletionId("HC-03", "", "TODO_COMPLETED"));
});

console.log("isLegacyFamilyDoc");
test("v1 형태(profile 있음)는 legacy로 판별", () => {
  assert.strictEqual(isLegacyFamilyDoc({ profile: { province: "서울" }, completed: {} }), true);
});
test("v2 형태(currentCode만 있음, profile 없음)는 legacy 아님", () => {
  assert.strictEqual(isLegacyFamilyDoc({ currentCode: "A3F9K2", province: "서울" }), false);
});
test("이미 archived된 문서는 legacy 아님(재이관 방지)", () => {
  assert.strictEqual(isLegacyFamilyDoc({ profile: { province: "서울" }, archived: true }), false);
});
test("빈 문서는 legacy 아님", () => {
  assert.strictEqual(isLegacyFamilyDoc(null), false);
  assert.strictEqual(isLegacyFamilyDoc({}), false);
});

console.log("planLegacyMigration");
test("완료된 항목만 completionWrites로 변환된다(false는 제외)", () => {
  const plan = planLegacyMigration("A3F9K2", {
    profile: { birthDate: "2025-01-01", gender: "F", province: "경기", district: "성남시" },
    completed: { H1: true, H2: false, V1: true },
  });
  assert.strictEqual(plan.completionWrites.length, 2);
  const ids = plan.completionWrites.map((w) => w.todoId).sort();
  assert.deepStrictEqual(ids, ["H1", "V1"]);
});
test("모든 completionWrites는 occurrenceKey=default, recordType=TODO_COMPLETED", () => {
  const plan = planLegacyMigration("A3F9K2", {
    profile: { birthDate: "2025-01-01", province: "경기", district: "성남시" },
    completed: { H1: true },
  });
  assert.strictEqual(plan.completionWrites[0].occurrenceKey, "default");
  assert.strictEqual(plan.completionWrites[0].recordType, "TODO_COMPLETED");
});
test("v1이 아닌 문서를 넣으면 에러", () => {
  assert.throws(() => planLegacyMigration("X", { currentCode: "X" }));
});
test("familyPayload/childPayload가 profile 값을 그대로 옮긴다", () => {
  const plan = planLegacyMigration("A3F9K2", {
    profile: { birthDate: "2025-06-15", gender: "M", province: "서울", district: "강남구" },
    completed: {},
  });
  assert.strictEqual(plan.familyPayload.province, "서울");
  assert.strictEqual(plan.familyPayload.district, "강남구");
  assert.strictEqual(plan.childPayload.birthDate, "2025-06-15");
  assert.strictEqual(plan.childPayload.gender, "M");
});

console.log(`\n${passed}개 통과${process.exitCode ? ", 일부 실패" : ""}`);
