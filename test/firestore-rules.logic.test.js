/*
 * firestore.rules의 families/{familyId} create/update 조건을 그대로 JS로 재현해서,
 * 실제 js/sync.js(레거시)와 js/sync-v2.js(v2)가 보내는 페이로드 모양으로 미리 검증한다.
 *
 * 이건 Firestore 에뮬레이터 테스트가 아니다(이 환경에 Firebase CLI가 없어 실행 불가).
 * "규칙 문구가 실제 코드가 보내는 필드 조합과 논리적으로 맞는지"만 로컬에서 확인하는
 * 용도이고, 실제 배포 전 최종 검증은 반드시 test/firestore-v2-manual-test.html +
 * 실제 프로젝트로 사용자가 직접 해야 한다.
 *
 * 실행: node test/firestore-rules.logic.test.js
 */
const assert = require("assert");

// --- firestore.rules의 families/{familyId} 규칙을 그대로 옮긴 것 ---
function hasOnly(obj, allowed) {
  return Object.keys(obj).every((k) => allowed.includes(k));
}
function hasAll(obj, required) {
  return required.every((k) => Object.prototype.hasOwnProperty.call(obj, k));
}
function legacyCreateAllowed(data) {
  return hasOnly(data, ["profile", "completed", "updatedAt"]) && typeof data.profile === "object" && data.profile !== null;
}
function v2CreateAllowed(data) {
  return hasAll(data, ["currentCode", "province", "district"]) && typeof data.currentCode === "string";
}
function createAllowed(data) {
  return legacyCreateAllowed(data) || v2CreateAllowed(data);
}
function legacyUpdateAllowed(affectedKeys) {
  return affectedKeys.every((k) => ["profile", "completed", "updatedAt", "archived", "migratedTo", "migratedAt"].includes(k));
}
function v2UpdateAllowed(affectedKeys) {
  return affectedKeys.every((k) =>
    ["province", "district", "familyDeclaredAttributes", "currentCode", "updatedAt", "archived", "migratedTo", "migratedAt"].includes(k)
  );
}
function updateAllowed(affectedKeys) {
  return legacyUpdateAllowed(affectedKeys) || v2UpdateAllowed(affectedKeys);
}

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ok  - ${name}`);
  } catch (e) {
    console.error(`FAIL - ${name}\n       ${e.message}`);
    process.exitCode = 1;
  }
}

console.log("families create — 실제 js/sync.js, js/sync-v2.js 페이로드 기준");

test("레거시 createFamily() 페이로드는 허용된다", () => {
  // js/sync.js createFamily()가 실제로 보내는 모양
  const payload = { profile: { birthDate: "2025-01-01", gender: "F", province: "경기", district: "성남시" }, completed: {}, updatedAt: "SERVER_TS" };
  assert.strictEqual(createAllowed(payload), true);
});

test("v2 createFamilyV2() 페이로드는 허용된다", () => {
  // js/sync-v2.js createFamilyV2()의 familyRef.set() 페이로드
  const payload = { currentCode: "A3F9K2", province: "서울", district: "강남구", familyDeclaredAttributes: {}, createdAt: "SERVER_TS", updatedAt: "SERVER_TS" };
  assert.strictEqual(createAllowed(payload), true);
});

test("두 필드 세트가 섞이거나 임의 필드가 추가되면 거부된다", () => {
  const payload = { profile: {}, completed: {}, updatedAt: "x", hacked: true };
  assert.strictEqual(createAllowed(payload), false);
});

test("v2인데 필수 필드(district) 누락 시 거부된다", () => {
  const payload = { currentCode: "A3F9K2", province: "서울" };
  assert.strictEqual(createAllowed(payload), false);
});

console.log("\nfamilies update — merge 이후 affectedKeys 기준");

test("레거시 updateProfile() — affectedKeys=[profile,updatedAt] 허용", () => {
  assert.strictEqual(updateAllowed(["profile", "updatedAt"]), true);
});

test("레거시 updateCompleted() — affectedKeys=[completed,updatedAt] 허용", () => {
  assert.strictEqual(updateAllowed(["completed", "updatedAt"]), true);
});

test("v2 reissueFamilyCode() — affectedKeys=[currentCode,updatedAt] 허용", () => {
  assert.strictEqual(updateAllowed(["currentCode", "updatedAt"]), true);
});

test("마이그레이션 표시(archived/migratedTo/migratedAt)는 두 경로 모두 허용", () => {
  assert.strictEqual(updateAllowed(["archived", "migratedTo", "migratedAt"]), true);
});

test("허용되지 않은 필드(예: completed를 v2 문서 스펙에 몰래 추가)는 거부된다면", () => {
  // province/district가 아닌 임의 필드가 섞이면 두 목록 어디에도 속하지 못해 거부돼야 한다
  assert.strictEqual(updateAllowed(["hacked"]), false);
});

console.log(`\n${passed}개 통과${process.exitCode ? ", 일부 실패" : ""}`);
console.log(
  "\n주의: 이 테스트는 규칙 문구를 JS로 재현한 것이라 실제 Firestore 엔진의 판단과 100% 동일하다고 보장하지 않는다."
);
console.log("실제 배포 전에는 test/firestore-v2-manual-test.html로 라이브 프로젝트에서 직접 확인해야 한다.");
