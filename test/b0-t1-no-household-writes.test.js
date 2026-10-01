/*
 * B0 / T1 — 가구 기능을 쓰지 않은 세션은 아이(가족) 문서에 가구 관련 필드를 쓰지 않는다.
 * js/sync.js 를 기록용 가짜 Firestore 로 실행해 쓰기 페이로드를 캡처하고, 키가 현재 허용된 집합 안인지 본다.
 * 골든 가족 문서(test/fixtures/family-doc.json)가 있으면 그 문서의 키 집합도 같은 허용 집합 안인지 확인한다(없으면 건너뜀 — B0 사용자 작업 D6).
 * 실행: node test/b0-t1-no-household-writes.test.js
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ALLOWED = ["profile", "completed", "records", "updatedAt"];
const writes = [];
const doc = (p) => ({
  get: async () => ({ exists: false }),
  set: async (d, o) => writes.push({ op: "set", path: p, data: d, opts: o }),
  update: async (d) => writes.push({ op: "update", path: p, data: d }),
  onSnapshot: () => () => {},
});
const fsStub = () => ({ collection: (c) => ({ doc: (id) => doc(c + "/" + id) }) });
fsStub.FieldValue = { serverTimestamp: () => "TS" };
const sandbox = { window: {}, console, localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, firebase: { initializeApp() {}, firestore: fsStub } };
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", "sync.js"), "utf8"), sandbox);
const S = sandbox.FamilySync;

const topKey = (k) => k.split(".")[0];
(async () => {
  const code = await S.createFamily({ name: "x" }, {});
  await S.updateProfile(code, { name: "y" });
  await S.updateCompleted(code, { a: 1 });
  await S.updateRecord(code, "r1", { t: 1 });
  assert(writes.length >= 4);
  for (const w of writes) {
    for (const k of Object.keys(w.data)) assert(ALLOWED.includes(topKey(k)), `허용되지 않은 필드 쓰기: ${w.op} ${w.path} ${k}`);
    assert(!/household|members|userSchedule/i.test(w.path), `가구 경로 쓰기: ${w.path}`);
  }
  console.log(`  ok  - 기존 동기화 쓰기 ${writes.length}건 모두 허용 집합(${ALLOWED.join(",")}) 안`);

  // B1: 플래그 OFF 에서 household-sync 가 로드돼도 families/** 쓰기·Firestore 접근이 늘지 않는다.
  const before = writes.length;
  let dbCalls = 0;
  const origFirestore = sandbox.firebase.firestore;
  sandbox.firebase.firestore = Object.assign(() => (dbCalls++, origFirestore()), origFirestore);
  const load = (f) => vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "js", f), "utf8"), sandbox);
  load("feature-flags.js");
  load("household-sync.js");
  assert.strictEqual(sandbox.FEATURES.household, false);
  const HSY = sandbox.HouseholdSync;
  await HSY.createHousehold({ firstChild: { familyCode: "3DQEVM", displayName: "x" } });
  await HSY.joinHousehold("ABCD2345");
  await HSY.addChild("h1", { familyCode: "3DQEVM", displayName: "x" });
  await HSY.flush("h1");
  assert.strictEqual(writes.length, before, "OFF 인데 쓰기 발생");
  assert.strictEqual(dbCalls, 0, "OFF 인데 firebase.firestore() 호출");
  console.log("  ok  - 플래그 OFF: household-sync 로드·호출 후에도 쓰기 0건, firestore() 접근 0건");

  const fx = path.join(__dirname, "fixtures", "family-doc.json");
  if (fs.existsSync(fx)) {
    const d = JSON.parse(fs.readFileSync(fx, "utf8"));
    const extra = Object.keys(d).filter((k) => !ALLOWED.includes(k));
    console.log(`  ${extra.length ? "참고" : "ok  "} - 골든 문서 최상위 키: ${Object.keys(d).join(",")}${extra.length ? ` (허용 집합 밖: ${extra.join(",")})` : ""}`);
  } else console.log("  skip - test/fixtures/family-doc.json 없음(D6 대기)");
})().catch((e) => { console.error("FAIL", e.message); process.exit(1); });
