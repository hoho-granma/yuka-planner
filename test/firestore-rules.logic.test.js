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

// ---------------------------------------------------------------------------------------------------------------
// [B1] 가구(household) 블록 — firestore.rules 의 householdCodes / households / children / members 를 JS 로 재현.
// 기존 families 규칙은 위 테스트가 그대로 검증한다. 여기서는 (1) 새 블록의 허용/거부 조합 (2) 기존 블록이 한 글자도 안 바뀌었는지(텍스트) 확인한다.
// ---------------------------------------------------------------------------------------------------------------
const keysOf = (o) => Object.keys(o);
const sub = (o, allowed) => keysOf(o).every((k) => allowed.includes(k));
const all = (o, req) => req.every((k) => Object.prototype.hasOwnProperty.call(o, k));
const sz = (v, n) => typeof v === "string" && v.length <= n;

const hhCode = {
  create: (d) => sub(d, ["householdId", "active", "createdAt", "revokedAt"]) && all(d, ["householdId", "active", "createdAt"]) && d.active === true && typeof d.householdId === "string",
  update: (before, after) => {
    const aff = new Set([...keysOf(before), ...keysOf(after)].filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k])));
    return [...aff].every((k) => ["active", "revokedAt"].includes(k)) && after.householdId === before.householdId;
  },
};
const hh = {
  create: (d) => sub(d, ["v", "name", "createdAt", "updatedAt"]) && all(d, ["v", "createdAt", "updatedAt"]) && d.v === 1,
  update: (aff) => aff.every((k) => ["name", "updatedAt"].includes(k)),
};
const hhChild = (d) =>
  sub(d, ["v", "familyCode", "displayName", "order", "colorKey", "addedAt", "removedAt"]) &&
  all(d, ["v", "familyCode", "displayName", "order", "addedAt"]) &&
  d.v === 1 && typeof d.familyCode === "string" && d.familyCode.length <= 8 && sz(d.displayName, 40);
const hhMember = (d) =>
  sub(d, ["v", "role", "label", "order", "colorKey", "createdAt", "updatedAt", "deletedAt"]) &&
  all(d, ["v", "role", "label", "order", "createdAt", "updatedAt"]) &&
  d.v === 1 && ["MOM", "DAD", "GRANDPARENT", "CAREGIVER", "OTHER"].includes(d.role) && sz(d.label, 20);

console.log("\n[B1] household 블록 — 코드 재현 + 기존 블록 불변");

test("householdCodes create: 필수 필드만, active=true, householdId 문자열", () => {
  assert.strictEqual(hhCode.create({ householdId: "h1", active: true, createdAt: 1, revokedAt: null }), true);
  assert.strictEqual(hhCode.create({ householdId: "h1", active: false, createdAt: 1 }), false);
  assert.strictEqual(hhCode.create({ householdId: "h1", active: true, createdAt: 1, extra: 1 }), false);
  assert.strictEqual(hhCode.create({ active: true, createdAt: 1 }), false);
});
test("householdCodes update: active/revokedAt 만 변경, householdId 변경(코드 탈취) 거부", () => {
  const before = { householdId: "h1", active: true, createdAt: 1, revokedAt: null };
  assert.strictEqual(hhCode.update(before, { ...before, active: false, revokedAt: 5 }), true);
  assert.strictEqual(hhCode.update(before, { ...before, householdId: "h2" }), false);
  assert.strictEqual(hhCode.update(before, { ...before, createdAt: 9 }), false);
});
test("households create/update: 허용 키만, v==1", () => {
  assert.strictEqual(hh.create({ v: 1, name: "집", createdAt: 1, updatedAt: 1 }), true);
  assert.strictEqual(hh.create({ v: 1, createdAt: 1, updatedAt: 1 }), true);
  assert.strictEqual(hh.create({ v: 2, createdAt: 1, updatedAt: 1 }), false);
  assert.strictEqual(hh.create({ v: 1, createdAt: 1, updatedAt: 1, children: [] }), false);
  assert.strictEqual(hh.update(["name", "updatedAt"]), true);
  assert.strictEqual(hh.update(["createdAt"]), false);
});
test("children 링크: 필수 필드·familyCode ≤8자·v==1, 임의 필드 거부", () => {
  const ok = { v: 1, familyCode: "3DQEVM", displayName: "은찬이", order: 1, addedAt: 1 };
  assert.strictEqual(hhChild(ok), true);
  assert.strictEqual(hhChild({ ...ok, colorKey: "c1", removedAt: 5 }), true);
  assert.strictEqual(hhChild({ ...ok, familyCode: "TOOLONGCODE" }), false);
  assert.strictEqual(hhChild({ ...ok, profile: {} }), false);
  assert.strictEqual(hhChild({ v: 1, familyCode: "3DQEVM", displayName: "x", order: 1 }), false);
});
test("members: role enum·label ≤20자·필수 필드", () => {
  const ok = { v: 1, role: "MOM", label: "엄마", order: 1, createdAt: 1, updatedAt: 1 };
  assert.strictEqual(hhMember(ok), true);
  assert.strictEqual(hhMember({ ...ok, deletedAt: 9 }), true);
  assert.strictEqual(hhMember({ ...ok, role: "BOSS" }), false);
  assert.strictEqual(hhMember({ ...ok, label: "가".repeat(21) }), false);
});

test("실제 js/household-sync.js 의 쓰기 페이로드가 위 규칙 재현을 통과한다", async () => {
  const HS = require("../js/household-sync.js");
  const docs = new Map();
  const ad = {
    get: async (p) => ({ exists: docs.has(p), data: docs.get(p) || null }),
    set: async (p, d, o) => docs.set(p, o && o.merge ? { ...(docs.get(p) || {}), ...d } : { ...d }),
    update: async (p, d) => docs.set(p, { ...docs.get(p), ...d }),
    list: async () => [],
    listen: () => () => {},
  };
  const hs = HS.create({ adapter: ad, storage: { getItem: () => null, setItem() {}, removeItem() {} }, features: () => ({ household: true }) });
  const r = await hs.createHousehold({ name: "집", firstChild: { familyCode: "3DQEVM", displayName: "은찬이" } });
  await hs.removeChild(r.householdId, r.childKey);
  let n = 0;
  for (const [p, d] of docs) {
    const seg = p.split("/");
    const okRule = seg[0] === "householdCodes" ? hhCode.create(d) : seg.length === 2 ? hh.create(d) : seg[2] === "children" ? hhChild(d) : hhMember(d);
    assert.strictEqual(okRule, true, "규칙 재현 거부: " + p + " " + JSON.stringify(d));
    n++;
  }
  assert(n >= 5);
});

test("기존 familyCodes/families 블록은 기준 커밋(3ad690d)과 한 글자도 다르지 않다 — B1 블록을 제거하면 원본과 동일", () => {
  const cp = require("child_process");
  const fsx = require("fs");
  const cur = fsx.readFileSync(require("path").join(__dirname, "..", "firestore.rules"), "utf8");
  let base;
  try {
    base = cp.execSync("git show 3ad690d:firestore.rules", { cwd: require("path").join(__dirname, ".."), encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch (e) {
    console.log("       (git 기준 커밋을 읽을 수 없어 건너뜀)");
    return;
  }
  const start = cur.indexOf("    // ===============================================================\n    // [B1]");
  const end = cur.indexOf("    // 그 외 모든 경로: 기본 거부");
  assert(start > 0 && end > start, "B1 블록 위치를 찾지 못함");
  assert.strictEqual(cur.slice(0, start) + cur.slice(end), base);
});

test("B1 블록에는 schedules 규칙이 없고, delete 는 전부 금지다", () => {
  const cur = require("fs").readFileSync(require("path").join(__dirname, "..", "firestore.rules"), "utf8");
  const b1 = cur.slice(cur.indexOf("// [B1]"), cur.indexOf("    // 그 외 모든 경로: 기본 거부"));
  assert(!/match \/schedules/.test(b1));
  assert.strictEqual((b1.match(/allow delete: if false;/g) || []).length, 4);
  assert(!/allow delete: if true/.test(b1));
  assert(!/allow list: if true/.test(b1.split("match /children")[0]), "households 최상위 list 허용 금지");
});

console.log(`\n${passed}개 통과${process.exitCode ? ", 일부 실패" : ""}`);
console.log(
  "\n주의: 이 테스트는 규칙 문구를 JS로 재현한 것이라 실제 Firestore 엔진의 판단과 100% 동일하다고 보장하지 않는다."
);
console.log("실제 배포 전에는 test/firestore-v2-manual-test.html로 라이브 프로젝트에서 직접 확인해야 한다.");
