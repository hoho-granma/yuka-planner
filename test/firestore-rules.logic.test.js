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
  // [H4] 로 의도해서 바꾼 두 곳(맨 위 공통 판정 함수, families 문서 삭제 허용)만 되돌려 놓고 비교한다 — 그 밖의 글자는 기준 커밋과 같아야 한다.
  const h4a = "    // ---------------------------------------------------------------\n    // [H4] 삭제 허용용 공통 판정";
  const h4b = "    // ---------------------------------------------------------------\n    // familyCodes/{code}";
  const i1 = cur.indexOf(h4a), i2 = cur.indexOf(h4b);
  assert(i1 > 0 && i2 > i1, "H4 공통 판정 블록 위치");
  const j1 = cur.indexOf("      // [H4] 아이 삭제(구성원 관리 > 삭제)");
  const j2 = cur.indexOf("allow delete: if resource == null || isAnyHouseholdMember();", j1) + "allow delete: if resource == null || isAnyHouseholdMember();".length;
  assert(j1 > 0 && j2 > j1, "H4 families 삭제 위치");
  const restored = (cur.slice(0, i1) + cur.slice(i2, j1) + "      allow delete: if false; // 삭제는 이번 단계 기능이 아님(기존 데이터 보존 원칙)" + cur.slice(j2));
  const startR = restored.indexOf("    // ===============================================================\n    // [B1]");
  const endR = restored.indexOf("    // 그 외 모든 경로: 기본 거부");
  assert.strictEqual(restored.slice(0, startR) + restored.slice(endR), base);
});

test("B1 블록(→[B2] 직전까지)에는 schedules 규칙이 없고, delete 는 전부 금지다", () => {
  const cur = require("fs").readFileSync(require("path").join(__dirname, "..", "firestore.rules"), "utf8");
  const b1 = cur.slice(cur.indexOf("// [B1]"), cur.indexOf("// [B2]"));
  assert(!/match \/schedules/.test(b1) && !/schedules\/\{/.test(b1));
  assert.strictEqual((b1.match(/allow delete: if false;/g) || []).length, 3, "householdCodes·households·members 는 계속 삭제 금지");
  assert(/match \/children\/\{childKey\}[\s\S]*allow delete: if resource == null\s*\|\| \(signedIn\(\) && resource\.data\.get\('createdByUid', null\) == request\.auth\.uid\)\s*\|\| \(resource\.data\.get\('createdByUid', null\) == null && isMemberOf\(householdId\)\);/.test(b1), "H4: 아이 링크 삭제는 만든 사람 또는(기록 없는 옛 링크는) 구성원");
  assert(!/allow delete: if true/.test(b1));
  assert(!/allow list: if true/.test(b1.split("match /children")[0]), "households 최상위 list 허용 금지");
});

// ---------------------------------------------------------------------------------------------------------------
// [B2] schedules 블록 — firestore.rules 의 scheduleOk 를 JS 로 재현하고, js/user-schedule.js 가 만든 실제 문서/패치로 검증한다.
// ---------------------------------------------------------------------------------------------------------------
const US = require("../js/user-schedule.js");
const has = (d, k) => k in d && d[k] !== null && d[k] !== undefined;
const dOk = (s) => typeof s === "string" && /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(s);
const tOk = (s) => typeof s === "string" && /^[0-2][0-9]:[0-5][0-9]$/.test(s);
const R_ALLOWED = ["v", "sourceType", "title", "category", "scope", "dateKind", "allDay", "createdAt", "updatedAt", "tags", "childKeys", "eventDate", "endDate", "periodStart", "periodEnd", "startTime", "endTime", "recurrence", "exceptions", "assigneeMemberId", "needsAssignee", "status", "location", "memo", "provenance", "deletedAt", "authorLabel", "splitFromScheduleId", "autoRef"];
const R_REQUIRED = ["v", "sourceType", "title", "category", "scope", "dateKind", "allDay", "createdAt", "updatedAt"];
function schedKeysOk(d) { return R_REQUIRED.every((k) => k in d) && Object.keys(d).every((k) => R_ALLOWED.includes(k)); }
function schedBasicsOk(d) {
  return d.v === 1 && ["MANUAL", "OCR", "VOICE", "IMPORT"].includes(d.sourceType) && ["LESSON", "INSTITUTION", "MEDICAL", "FAMILY", "ETC"].includes(d.category) &&
    ["CHILD", "FAMILY"].includes(d.scope) && ["FIXED", "PERIOD"].includes(d.dateKind) && typeof d.allDay === "boolean" && typeof d.createdAt === "number" && typeof d.updatedAt === "number" &&
    typeof d.title === "string" && d.title.length >= 1 && d.title.length <= 100 &&
    (!has(d, "memo") || (typeof d.memo === "string" && d.memo.length <= 500)) && (!has(d, "location") || (typeof d.location === "string" && d.location.length <= 100)) &&
    (!has(d, "tags") || (Array.isArray(d.tags) && d.tags.length <= 10)) && (!has(d, "status") || ["TODO", "DONE", "CANCELLED", "RESCHEDULED"].includes(d.status)) &&
    (!has(d, "deletedAt") || typeof d.deletedAt === "number") && (!has(d, "exceptions") || (typeof d.exceptions === "object" && !Array.isArray(d.exceptions) && Object.keys(d.exceptions).length <= 200)) &&
    (!has(d, "assigneeMemberId") || typeof d.assigneeMemberId === "string");
}
const schedScopeOk = (d) => (d.scope === "CHILD" && has(d, "childKeys") && Array.isArray(d.childKeys) && d.childKeys.length >= 1 && d.childKeys.length <= 10) || (d.scope === "FAMILY" && (!has(d, "childKeys") || (Array.isArray(d.childKeys) && d.childKeys.length === 0)));
function schedDatesOk(d) {
  if (has(d, "recurrence")) return d.dateKind === "FIXED" && typeof d.recurrence === "object" && ["WEEKLY", "MONTHLY"].includes(d.recurrence.freq) && !has(d, "eventDate") && !has(d, "periodStart") && !has(d, "periodEnd") && !has(d, "endDate") && !has(d, "status");
  if (d.dateKind === "FIXED") return has(d, "eventDate") && dOk(d.eventDate) && !has(d, "periodStart") && !has(d, "periodEnd") && (!has(d, "endDate") || (dOk(d.endDate) && d.endDate >= d.eventDate));
  return has(d, "periodStart") && has(d, "periodEnd") && dOk(d.periodStart) && dOk(d.periodEnd) && d.periodStart <= d.periodEnd && !has(d, "eventDate") && !has(d, "endDate");
}
const schedTimesOk = (d) => (d.allDay ? !has(d, "startTime") && !has(d, "endTime") : has(d, "startTime") && tOk(d.startTime) && (!has(d, "endTime") || (tOk(d.endTime) && d.endTime > d.startTime)));
const schedProvOk = (d) => d.sourceType === "MANUAL" || (has(d, "provenance") && typeof d.provenance === "object" && d.provenance.confirmedByUser === true);
// C2 autoRef: 있으면 "<todo_id>__<occurrenceKey>"(≤80자)·scope=CHILD·childKeys 정확히 1개·반복 아님
const schedAutoRefOk = (d) => !has(d, "autoRef") || (typeof d.autoRef === "string" && d.autoRef.length <= 80 && /^[A-Za-z0-9-]+__[A-Za-z0-9-]+$/.test(d.autoRef) && d.scope === "CHILD" && has(d, "childKeys") && Array.isArray(d.childKeys) && d.childKeys.length === 1 && !has(d, "recurrence"));
const schedOk = (d) => schedKeysOk(d) && schedBasicsOk(d) && schedScopeOk(d) && schedDatesOk(d) && schedTimesOk(d) && schedProvOk(d) && schedAutoRefOk(d);
const schedUpdateOk = (before, after) => schedOk(after) && after.v === before.v && after.createdAt === before.createdAt && after.sourceType === before.sourceType && (after.autoRef ?? null) === (before.autoRef ?? null);

const NOW = 1790000000000;
const base = { sourceType: "MANUAL", title: "피아노", category: "LESSON", scope: "CHILD", childKeys: ["c1"], allDay: false, startTime: "16:00", endTime: "16:50", dateKind: "FIXED", eventDate: "2026-10-06" };
const samples = {
  "FIXED 시각": base,
  "FIXED 종일+endDate": { ...base, allDay: true, startTime: undefined, endTime: undefined, endDate: "2026-10-08", title: "캠프" },
  "PERIOD": { ...base, dateKind: "PERIOD", eventDate: undefined, periodStart: "2026-10-01", periodEnd: "2026-10-31", allDay: true, startTime: undefined, endTime: undefined, title: "부모 상담" },
  "FAMILY": { ...base, scope: "FAMILY", childKeys: undefined, category: "FAMILY" },
  "반복": { ...base, eventDate: undefined, recurrence: { freq: "WEEKLY", interval: 1, byDay: ["TU", "TH"], startDate: "2026-10-06", until: null }, exceptions: { "2026-10-08": { status: "CANCELLED", note: "휴강" } } },
  "매월 반복(D75)": { ...base, eventDate: undefined, recurrence: { freq: "MONTHLY", interval: 1, startDate: "2026-10-31", until: null } },
  "OCR 확인됨": { ...base, sourceType: "OCR", provenance: { confirmedByUser: true } },
};

console.log("\n[B2] schedules 블록 — user-schedule 실제 문서 기준");
for (const [name, input] of Object.entries(samples)) {
  test(`create 허용: ${name} (UserSchedule.buildCreateDoc 결과가 validate·규칙 재현 모두 통과)`, () => {
    const r = US.buildCreateDoc(input, NOW);
    assert.strictEqual(r.ok, true, JSON.stringify(r.errors));
    assert.strictEqual(schedOk(r.doc), true);
  });
}
const mk = (name) => US.buildCreateDoc(samples[name], NOW).doc;
const rejects = {
  "displayDate 필드(I12)": (d) => ({ ...d, displayDate: "2026-10-06" }),
  "허용되지 않은 필드": (d) => ({ ...d, hacked: 1 }),
  "빈 제목": (d) => ({ ...d, title: "" }),
  "제목 101자": (d) => ({ ...d, title: "가".repeat(101) }),
  "memo 501자": (d) => ({ ...d, memo: "a".repeat(501) }),
  "childKeys 11개": (d) => ({ ...d, childKeys: Array.from({ length: 11 }, (_, i) => "c" + i) }),
  "scope=CHILD 인데 childKeys 없음(I7)": (d) => ({ ...d, childKeys: [] }),
  "tags 11개": (d) => ({ ...d, tags: Array.from({ length: 11 }, (_, i) => "t" + i) }),
  "enum category 오류": (d) => ({ ...d, category: "BOSS" }),
  "FIXED 인데 eventDate 없음(I1)": (d) => ({ ...d, eventDate: undefined }),
  "endDate < eventDate(I4)": (d) => ({ ...d, endDate: "2026-10-01" }),
  "날짜 형식 오류": (d) => ({ ...d, eventDate: "2026/10/06" }),
  "allDay=false 인데 startTime 없음(I5)": (d) => ({ ...d, startTime: undefined }),
  "endTime ≤ startTime(I5)": (d) => ({ ...d, endTime: "15:00" }),
  "allDay=true 인데 시각 있음(I6)": (d) => ({ ...d, allDay: true }),
  "OCR 인데 확인 없음(I8)": (d) => ({ ...d, sourceType: "OCR" }),
};
for (const [name, mut] of Object.entries(rejects)) {
  test(`create 거부: ${name} — 규칙 재현과 validate 모두 거부`, () => {
    const d = JSON.parse(JSON.stringify(mut(mk("FIXED 시각"))));
    Object.keys(d).forEach((k) => d[k] === undefined && delete d[k]);
    const bad = mut(mk("FIXED 시각"));
    Object.keys(bad).forEach((k) => bad[k] === undefined && delete bad[k]);
    assert.strictEqual(schedOk(bad), false, "규칙 재현이 허용함");
    assert.strictEqual(US.validate(bad).ok, false, "validate 가 허용함");
  });
}
test("PERIOD 에 eventDate(I2)·반복에 eventDate/status(I3) 거부", () => {
  assert.strictEqual(schedOk({ ...mk("PERIOD"), eventDate: "2026-10-05" }), false);
  assert.strictEqual(schedOk({ ...mk("PERIOD"), periodStart: "2026-11-01" }), false);
  assert.strictEqual(schedOk({ ...mk("반복"), eventDate: "2026-10-06" }), false);
  assert.strictEqual(schedOk({ ...mk("반복"), status: "DONE" }), false);
  assert.strictEqual(schedOk({ ...mk("반복"), recurrence: { freq: "YEARLY" } }), false); // D75: MONTHLY 는 이제 허용(freq 만 검사 — 내부 필드는 클라이언트 검증)
  assert.strictEqual(schedOk(mk("매월 반복(D75)")), true);
  assert.strictEqual(schedOk({ ...mk("매월 반복(D75)"), eventDate: "2026-10-06" }), false);
});
test("exceptions 201개 거부", () => {
  const ex = {};
  for (let i = 0; i < 201; i++) ex[US.addDays("2026-10-06", i)] = { status: "CANCELLED" };
  assert.strictEqual(schedOk({ ...mk("반복"), exceptions: ex }), false);
});

test("update 허용: 완료(DONE)·소프트 삭제·예외 추가/제거·담당자 지정 패치 적용 결과", () => {
  const b = mk("FIXED 시각"), r = mk("반복");
  assert.strictEqual(schedUpdateOk(b, US.markDone(b, NOW + 1).after), true);
  assert.strictEqual(schedUpdateOk(b, US.softDelete(b, NOW + 2).after), true);
  assert.strictEqual(schedUpdateOk(r, US.markDone(r, NOW + 3, { date: "2026-10-13" }).after), true);
  const added = US.buildPatch(r, { exceptions: { "2026-10-15": { status: "CANCELLED" } }, assigneeMemberId: "m1" }, NOW + 4);
  assert.strictEqual(added.ok, true);
  assert.strictEqual(schedUpdateOk(r, added.after), true);
  assert.strictEqual(Object.keys(added.patch).includes("exceptions.2026-10-15"), true);
  const removed = US.buildPatch(added.after, { exceptions: { "2026-10-15": null } }, NOW + 5);
  assert.strictEqual(removed.patch["exceptions.2026-10-15"], null);
  assert.strictEqual(schedUpdateOk(r, removed.after), true);
});
test("update 거부(immutable): v / createdAt / sourceType 변경", () => {
  const b = mk("FIXED 시각");
  assert.strictEqual(schedUpdateOk(b, { ...b, createdAt: b.createdAt + 1 }), false);
  assert.strictEqual(schedUpdateOk(b, { ...b, v: 2 }), false);
  assert.strictEqual(schedUpdateOk(b, { ...b, sourceType: "OCR", provenance: { confirmedByUser: true } }), false);
  ["createdAt", "v", "sourceType"].forEach((k) => assert.strictEqual(US.buildPatch(b, { [k]: b[k] === 1 ? 2 : "x" }, NOW + 1).ok, false, k + " 패치가 허용됨"));
});
test("규칙 텍스트와 UserSchedule 상수 일치: 허용 키·필수 키·한도·불변 필드·delete 금지", () => {
  const cur = require("fs").readFileSync(require("path").join(__dirname, "..", "firestore.rules"), "utf8");
  const b2 = cur.slice(cur.indexOf("// [B2]"), cur.indexOf("    // 그 외 모든 경로: 기본 거부"));
  const listOf = (re) => [...b2.match(re)[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
  assert.deepStrictEqual(listOf(/hasAll\(\[([^\]]+)\]/).sort(), [...US.REQUIRED_KEYS].sort());
  assert.deepStrictEqual(listOf(/hasOnly\(\[([^\]]+)\]/).sort(), [...US.ALLOWED_KEYS].sort());
  assert.deepStrictEqual(R_ALLOWED.slice().sort(), [...US.ALLOWED_KEYS].sort());
  assert(/d\.title\.size\(\) >= 1 && d\.title\.size\(\) <= 100/.test(b2) && /d\.memo\.size\(\) <= 500/.test(b2) && /d\.location\.size\(\) <= 100/.test(b2));
  assert(/d\.exceptions\.size\(\) <= 200/.test(b2) && /d\.tags\.size\(\) <= 10/.test(b2) && /d\.childKeys\.size\(\) <= 10/.test(b2));
  ["v", "createdAt", "sourceType"].forEach((k) => assert(new RegExp(`request\\.resource\\.data\\.${k} == resource\\.data\\.${k}`).test(b2), k));
  assert.deepStrictEqual([...US.IMMUTABLE_KEYS].sort(), ["autoRef", "createdAt", "sourceType", "v"]);
  assert(/request\.resource\.data\.get\('autoRef', null\) == resource\.data\.get\('autoRef', null\)/.test(b2), "autoRef 불변 조건");
  assert(/function autoRefOk\(d\)/.test(b2) && /scopeOk\(d\) && datesOk\(d\) && timesOk\(d\) && provenanceOk\(d\) && autoRefOk\(d\)/.test(b2));
  assert(/d\.autoRef\.size\(\) <= 80/.test(b2) && /\^\[A-Za-z0-9-\]\+__\[A-Za-z0-9-\]\+\$/.test(b2) && /d\.childKeys\.size\(\) == 1/.test(b2) && /!has\(d, 'recurrence'\)/.test(b2));
  assert(/allow delete: if resource == null \|\| isMemberOf\(householdId\);/.test(b2) && !/allow delete: if true/.test(b2), "H4: 일정 삭제는 가구 구성원만");
  assert(!/displayDate/.test(b2.replace(/\/\/.*$/gm, "")), "규칙 코드에 displayDate 허용 없음");
});

console.log("\n[C2] autoRef — 규칙 재현(schedOk/schedUpdateOk)과 validate 가 같은 판정을 한다");
{
  const linked = (over) => { const o = { ...base, allDay: true, startTime: undefined, endTime: undefined, title: "예방접종 병원 예약", category: "MEDICAL", autoRef: "VX-DTAP__dose-1", ...over }; Object.keys(o).forEach((k) => o[k] === undefined && delete o[k]); return o; };
  const both = (doc) => ({ rule: schedOk(doc), client: US.validate(doc).ok });
  test("create 허용: 연결 일정(MEDICAL·CHILD·childKeys 1개·단일) — 규칙 재현·validate 모두 통과, 예방접종·검진·치과 id 형태", () => {
    for (const ref of ["VX-DTAP__dose-1", "HC-01__default", "OR-04__occ-1", "VX-FLU__season-1-dose-1"]) {
      const r = US.buildCreateDoc(linked({ autoRef: ref }), NOW);
      assert.strictEqual(r.ok, true, ref);
      assert.deepStrictEqual(both(r.doc), { rule: true, client: true });
    }
  });
  const bad = {
    "scope=FAMILY": { scope: "FAMILY", childKeys: undefined, category: "FAMILY" },
    "childKeys 2개": { childKeys: ["c1", "c2"] },
    "반복 일정": { eventDate: undefined, recurrence: { freq: "WEEKLY", interval: 1, byDay: ["TU"], startDate: "2026-10-06", until: null } },
    "형식 오류(구분자 하나)": { autoRef: "VX-DTAP_dose-1" },
    "형식 오류(공백)": { autoRef: "VX DTAP__dose-1" },
    "81자": { autoRef: "A".repeat(40) + "__" + "b".repeat(39) },
    "빈 문자열": { autoRef: "" },
    "숫자": { autoRef: 5 },
  };
  for (const [name, over] of Object.entries(bad)) {
    test(`create 거부: autoRef + ${name} — 규칙 재현과 validate 모두 거부`, () => {
      const d = linked(over);
      if (name === "반복 일정") d.exceptions = undefined;
      Object.keys(d).forEach((k) => d[k] === undefined && delete d[k]);
      const doc = { ...d, v: 1, createdAt: NOW, updatedAt: NOW, ...(d.recurrence ? {} : { status: "TODO" }) };
      assert.deepStrictEqual(both(doc), { rule: false, client: false });
      const { autoRef, ...withoutRef } = doc; // autoRef 만 빼면 같은 문서가 통과해야 거부 이유가 autoRef 임이 보장된다
      assert.deepStrictEqual(both(withoutRef), { rule: true, client: true }, "autoRef 외의 이유로 거부되고 있다");
    });
  }
  test("정확히 80자는 허용, autoRef 없는 기존 문서는 그대로 허용(상위 호환)", () => {
    assert.deepStrictEqual(both(US.buildCreateDoc(linked({ autoRef: "A".repeat(39) + "__" + "b".repeat(39) }), NOW).doc), { rule: true, client: true });
    const plain = US.buildCreateDoc(linked({ autoRef: undefined }), NOW).doc;
    assert.deepStrictEqual(both(plain), { rule: true, client: true });
    assert.strictEqual(schedKeysOk(plain), true);
  });
  test("update: autoRef 를 유지한 완료·삭제·수정은 허용, autoRef 변경·삭제·새로 추가는 거부", () => {
    const b = US.buildCreateDoc(linked(), NOW).doc;
    assert.strictEqual(schedUpdateOk(b, US.markDone(b, NOW + 1).after), true);
    assert.strictEqual(schedUpdateOk(b, US.softDelete(b, NOW + 2).after), true);
    assert.strictEqual(schedUpdateOk(b, US.buildPatch(b, { title: "수정", memo: "m" }, NOW + 3).after), true);
    assert.strictEqual(schedUpdateOk(b, { ...b, autoRef: "HC-01__default" }), false);
    const { autoRef, ...removed } = b;
    assert.strictEqual(schedUpdateOk(b, removed), false);
    const plain = US.buildCreateDoc(linked({ autoRef: undefined }), NOW).doc;
    assert.strictEqual(schedUpdateOk(plain, { ...plain, autoRef: "VX-DTAP__dose-1" }), false, "기존 일정에 연결을 나중에 붙일 수 없다");
    assert.strictEqual(US.buildPatch(b, { autoRef: "HC-01__default" }, NOW + 4).ok, false);
  });
}

console.log(`\n${passed}개 통과${process.exitCode ? ", 일부 실패" : ""}`);
console.log(
  "\n주의: 이 테스트는 규칙 문구를 JS로 재현한 것이라 실제 Firestore 엔진의 판단과 100% 동일하다고 보장하지 않는다."
);
console.log("실제 배포 전에는 test/firestore-v2-manual-test.html로 라이브 프로젝트에서 직접 확인해야 한다.");
