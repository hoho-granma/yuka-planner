/*
 * household-sync 논리 테스트 — 가짜 Firestore 어댑터(메모리)로 실행. 실제 Firestore/브라우저를 쓰지 않는다.
 * 핵심: ① 플래그 OFF 에서는 어댑터·firebase·localStorage 호출 0건 ② families/** 에는 절대 쓰지 않음 ③ 오프라인 대기열·순서·재시도.
 * 실행: node test/household-sync.logic.test.js
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const HS = require("../js/household-sync.js");
const FEATURES_SRC = fs.readFileSync(path.join(__dirname, "..", "js", "feature-flags.js"), "utf8");

let passed = 0;
async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ok  - ${name}`);
  } catch (e) {
    console.error(`FAIL - ${name}\n       ${e.stack || e.message}`);
    process.exitCode = 1;
  }
}

function memStorage() {
  const m = new Map();
  const calls = [];
  return {
    calls,
    getItem: (k) => (calls.push(["get", k]), m.has(k) ? m.get(k) : null),
    setItem: (k, v) => (calls.push(["set", k]), m.set(k, String(v))),
    removeItem: (k) => (calls.push(["remove", k]), m.delete(k)),
    dump: () => m,
  };
}

/** 메모리 어댑터. fail 이 설정되면 쓰기가 그 code 로 실패한다. */
function fakeAdapter() {
  const docs = new Map();
  const calls = [];
  const listeners = [];
  const a = {
    calls,
    docs,
    fail: null,
    listeners,
    async get(p) {
      calls.push(["get", p]);
      return docs.has(p) ? { exists: true, data: JSON.parse(JSON.stringify(docs.get(p))) } : { exists: false, data: null };
    },
    async set(p, d, o) {
      calls.push(["set", p, d, o]);
      if (a.fail) throw Object.assign(new Error(a.fail), { code: a.fail });
      docs.set(p, o && o.merge ? { ...(docs.get(p) || {}), ...d } : { ...d });
    },
    async update(p, d) {
      calls.push(["update", p, d]);
      if (a.fail) throw Object.assign(new Error(a.fail), { code: a.fail });
      if (!docs.has(p)) throw Object.assign(new Error("nf"), { code: "not-found" });
      docs.set(p, { ...docs.get(p), ...d });
    },
    async list(p) {
      calls.push(["list", p]);
      return [...docs.entries()].filter(([k]) => k.startsWith(p + "/") && k.split("/").length === p.split("/").length + 1).map(([k, v]) => ({ id: k.split("/").pop(), data: { ...v } }));
    },
    listen(p, onData, onErr) {
      calls.push(["listen", p]);
      const l = { p, onData, onErr, off: false };
      listeners.push(l);
      return () => (l.off = true);
    },
    writes: () => calls.filter((c) => c[0] === "set" || c[0] === "update"),
  };
  return a;
}

let T = 1000;
const mk = (flag, extra = {}) => {
  const adapter = extra.adapter || fakeAdapter();
  const storage = extra.storage || memStorage();
  const hs = HS.create({ adapter, storage, features: () => ({ household: flag }), now: () => ++T, rand: (() => { let i = 0; return () => ((i++ * 7919) % 1000) / 1000; })() });
  return { hs, adapter, storage };
};

(async () => {
  console.log("플래그 OFF — 읽기/쓰기/로컬 접근 0건");

  await test("OFF: 모든 공개 메서드가 어댑터·localStorage 를 한 번도 호출하지 않는다", async () => {
    const { hs, adapter, storage } = mk(false);
    const r = [
      await hs.createHousehold({ name: "x", firstChild: { familyCode: "ABC123", displayName: "은찬" } }),
      await hs.joinHousehold("ABCD2345"),
      await hs.addChild("h1", { familyCode: "ABC123", displayName: "a" }),
      await hs.updateChild("h1", "c1", { colorKey: "x" }),
      await hs.removeChild("h1", "c1"),
      await hs.upsertMember("h1", { role: "MOM", label: "엄마" }),
      await hs.removeMember("h1", "m1"),
      await hs.reissueCode("h1", "OLD"),
      await hs.flush("h1"),
      hs.startListening("h1"),
    ];
    r.forEach((x) => assert.deepStrictEqual({ ok: x.ok, reason: x.reason }, { ok: false, reason: "disabled" }));
    assert.strictEqual(hs.getMirror("h1"), null);
    assert.strictEqual(hs.getSavedCode(), null);
    assert.strictEqual(hs.attachLifecycle({ addEventListener() { throw new Error("등록됨"); } }, () => "h1"), false);
    assert.deepStrictEqual(hs.getStatus("h1").pending, 0);
    assert.strictEqual(adapter.calls.length, 0, "어댑터 호출: " + JSON.stringify(adapter.calls));
    assert.strictEqual(storage.calls.length, 0, "storage 호출: " + JSON.stringify(storage.calls));
  });

  await test("OFF(실제 feature-flags.js + 브라우저식 로드): firebase.firestore() 를 만들지 않는다", async () => {
    let firestoreCalls = 0;
    const sb = { console, localStorage: memStorage(), firebase: { firestore: () => (firestoreCalls++, {}) } };
    sb.window = sb;
    vm.createContext(sb);
    vm.runInContext(FEATURES_SRC, sb);
    assert.strictEqual(sb.FEATURES.household, false);
    assert.deepStrictEqual(Object.keys(sb.FEATURES), ["household"]);
    // 플래그 파일은 개발용 override 키 하나만 읽는다. 그 이후(household-sync 로드·호출)에는 localStorage 접근이 0건이어야 한다.
    assert.deepStrictEqual(sb.localStorage.calls, [["get", "hannun_feature_household"]]);
    const afterFlags = sb.localStorage.calls.length;
    // 브라우저 경로: window 에 HouseholdSync 기본 인스턴스가 만들어진다
    const code = fs.readFileSync(path.join(__dirname, "..", "js", "household-sync.js"), "utf8");
    vm.runInContext(code, sb);
    const r = await sb.HouseholdSync.createHousehold({ name: "x" });
    await sb.HouseholdSync.joinHousehold("ABCD2345");
    assert.strictEqual(r.reason, "disabled");
    assert.strictEqual(firestoreCalls, 0);
    assert.strictEqual(sb.localStorage.calls.length, afterFlags);
  });

  await test("개발용 override: localStorage hannun_feature_household 가 정확히 '1' 일 때만 ON", async () => {
    const load = (val) => {
      const sb = { console, localStorage: { getItem: () => val } };
      sb.window = sb;
      vm.createContext(sb);
      vm.runInContext(FEATURES_SRC, sb);
      return sb.FEATURES.household;
    };
    assert.strictEqual(load("1"), true);
    ["0", "true", "yes", "", null, undefined, 1].forEach((v) => assert.strictEqual(load(v), false, String(v)));
    const throwing = { console, localStorage: { getItem() { throw new Error("blocked"); } } };
    throwing.window = throwing;
    vm.createContext(throwing);
    vm.runInContext(FEATURES_SRC, throwing);
    assert.strictEqual(throwing.FEATURES.household, false, "저장소 접근이 막혀도 OFF");
  });

  console.log("\n플래그 ON — 가짜 어댑터");

  await test("가구 생성: 문서·코드·아이 링크·기본 담당자 2명이 설계 스키마로 써진다", async () => {
    const { hs, adapter, storage } = mk(true);
    const r = await hs.createHousehold({ name: "우리집", firstChild: { familyCode: "3DQEVM", displayName: "은찬이" } });
    assert(r.ok && r.householdId && /^[2-9A-HJKMNP-Z]{8}$/.test(r.code), r.code);
    const hd = adapter.docs.get("households/" + r.householdId);
    assert.deepStrictEqual(Object.keys(hd).sort(), ["createdAt", "name", "updatedAt", "v"]);
    assert.strictEqual(hd.v, 1);
    const cd = adapter.docs.get("householdCodes/" + r.code);
    assert.deepStrictEqual(cd, { householdId: r.householdId, active: true, createdAt: cd.createdAt, revokedAt: null });
    const kid = adapter.docs.get(`households/${r.householdId}/children/${r.childKey}`);
    assert.deepStrictEqual(Object.keys(kid).sort(), ["addedAt", "displayName", "familyCode", "order", "v"]);
    const members = [...adapter.docs.keys()].filter((k) => k.includes("/members/"));
    assert.strictEqual(members.length, 2);
    assert.strictEqual(storage.dump().get("hannun_household_code"), r.code);
  });

  await test("families/** 에는 어떤 경우에도 쓰지 않는다(쓰기 경로 전부 검사)", async () => {
    const { hs, adapter } = mk(true);
    const r = await hs.createHousehold({ firstChild: { familyCode: "3DQEVM", displayName: "은찬이" } });
    await hs.addChild(r.householdId, { familyCode: "ZZZ999", displayName: "둘째" });
    await hs.removeChild(r.householdId, r.childKey);
    await hs.reissueCode(r.householdId, r.code);
    assert(adapter.writes().length >= 8);
    adapter.writes().forEach((w) => assert(/^(households|householdCodes)\//.test(w[1]), "허용 밖 경로: " + w[1]));
    assert(!adapter.writes().some((w) => /^families\//.test(w[1])));
  });

  await test("쓰기 허용 루트는 householdCodes·households 두 개뿐이다(상수 확인; 실제 경로 검사는 바로 위 테스트)", async () => {
    assert.deepStrictEqual(HS.WRITE_ROOTS, ["householdCodes", "households"]);
  });

  await test("재발급: 새 코드 생성 + 이전 코드 active:false/revokedAt", async () => {
    const { hs, adapter } = mk(true);
    const r = await hs.createHousehold({});
    const r2 = await hs.reissueCode(r.householdId, r.code);
    assert.notStrictEqual(r2.code, r.code);
    assert.strictEqual(adapter.docs.get("householdCodes/" + r.code).active, false);
    assert.strictEqual(typeof adapter.docs.get("householdCodes/" + r.code).revokedAt, "number");
    assert.strictEqual(adapter.docs.get("householdCodes/" + r2.code).householdId, r.householdId);
  });

  await test("참여: 코드로 가구·아이 링크·담당자를 읽어 미러에 저장하고 코드를 기억한다", async () => {
    const A = mk(true);
    const r = await A.hs.createHousehold({ name: "우리집", firstChild: { familyCode: "3DQEVM", displayName: "은찬이" } });
    const B = mk(true, { adapter: A.adapter });
    const j = await B.hs.joinHousehold(r.code.toLowerCase());
    assert(j.ok);
    assert.strictEqual(Object.keys(j.mirror.children).length, 1);
    assert.strictEqual(Object.keys(j.mirror.members).length, 2);
    assert.strictEqual(B.hs.getSavedCode(), r.code);
    assert.strictEqual((await B.hs.joinHousehold("NOSUCHCD")).reason, "not-found");
  });

  await test("비활성화된 코드로는 참여할 수 없다", async () => {
    const A = mk(true);
    const r = await A.hs.createHousehold({});
    await A.hs.reissueCode(r.householdId, r.code);
    assert.strictEqual((await A.hs.joinHousehold(r.code)).reason, "not-found");
  });

  await test("오프라인: 쓰기는 로컬 미러에 즉시 반영되고 대기열에 순서대로 쌓인다(실패를 삼키지 않음)", async () => {
    const A = mk(true);
    A.adapter.fail = "unavailable";
    const r = await A.hs.createHousehold({ firstChild: { familyCode: "3DQEVM", displayName: "은찬이" } });
    assert(r.ok);
    const st = A.hs.getStatus(r.householdId);
    assert(st.pending >= 5, "pending=" + st.pending);
    assert.strictEqual(st.lastError, "unavailable");
    assert.strictEqual(st.permissionDenied, false);
    assert.strictEqual(Object.keys(A.hs.getMirror(r.householdId).children).length, 1);
    assert.strictEqual(A.adapter.docs.size, 0);
    // 첫 실패 이후에는 순서를 지키려고 서버를 다시 시도하지 않는다
    assert.strictEqual(A.adapter.writes().length, 1);
  });

  await test("복구: flush 가 대기열을 입력 순서대로 보내고 비운다", async () => {
    const A = mk(true);
    A.adapter.fail = "unavailable";
    const r = await A.hs.createHousehold({ firstChild: { familyCode: "3DQEVM", displayName: "은찬이" } });
    A.adapter.fail = null;
    A.adapter.calls.length = 0;
    const f = await A.hs.flush(r.householdId);
    assert.strictEqual(f.remaining, 0);
    const paths = A.adapter.writes().map((w) => w[1]);
    assert.strictEqual(paths[0], "households/" + r.householdId);
    assert(paths[1].startsWith("householdCodes/"));
    assert.strictEqual(A.hs.getStatus(r.householdId).pending, 0);
    assert(A.adapter.docs.has("households/" + r.householdId));
  });

  await test("flush 중 실패하면 거기서 멈추고 남은 항목을 보존한다", async () => {
    const A = mk(true);
    A.adapter.fail = "unavailable";
    const r = await A.hs.createHousehold({});
    const total = A.hs.getStatus(r.householdId).pending;
    A.adapter.fail = null;
    let n = 0;
    const origSet = A.adapter.set;
    A.adapter.set = async (...a) => (++n === 2 ? Promise.reject(Object.assign(new Error("x"), { code: "unavailable" })) : origSet(...a));
    const f = await A.hs.flush(r.householdId);
    assert.strictEqual(f.sent, 1);
    assert.strictEqual(f.remaining, total - 1);
  });

  await test("permission-denied: 상태로 노출되고 이후 쓰기는 서버 시도 없이 대기열로(규칙 미배포 감지)", async () => {
    const A = mk(true);
    A.adapter.fail = "permission-denied";
    const r = await A.hs.createHousehold({});
    const st = A.hs.getStatus(r.householdId);
    assert.strictEqual(st.permissionDenied, true);
    assert(st.pending >= 3);
    assert.strictEqual(A.adapter.writes().length, 1, "첫 거부 이후 재시도 폭주 금지");
  });

  await test("서버 스냅샷을 받아도 대기열에 있는 문서는 로컬이 이긴다", async () => {
    const A = mk(true);
    const r = await A.hs.createHousehold({ firstChild: { familyCode: "3DQEVM", displayName: "은찬이" } });
    A.adapter.fail = "unavailable";
    await A.hs.updateChild(r.householdId, r.childKey, { displayName: "은찬(로컬)" });
    A.adapter.fail = null;
    A.hs.startListening(r.householdId);
    const l = A.adapter.listeners.find((x) => x.p.endsWith("/children"));
    l.onData([{ id: r.childKey, data: { v: 1, familyCode: "3DQEVM", displayName: "서버값", order: 1, addedAt: 1 } }]);
    assert.strictEqual(A.hs.getMirror(r.householdId).children[r.childKey].displayName, "은찬(로컬)");
  });

  await test("리스너: 3개 등록, stopListening 이 모두 해제하고 재시작 시 중복 등록하지 않는다", async () => {
    const A = mk(true);
    A.hs.startListening("h1");
    assert.strictEqual(A.adapter.listeners.length, 3);
    A.hs.startListening("h1");
    assert.strictEqual(A.adapter.listeners.filter((x) => !x.off).length, 3);
    A.hs.stopListening();
    assert(A.adapter.listeners.every((x) => x.off));
  });

  await test("소프트 삭제만 한다: removeChild/removeMember 는 removedAt/deletedAt 표시", async () => {
    const A = mk(true);
    const r = await A.hs.createHousehold({ firstChild: { familyCode: "3DQEVM", displayName: "은찬이" } });
    await A.hs.removeChild(r.householdId, r.childKey);
    const mid = Object.keys(A.hs.getMirror(r.householdId).members)[0];
    await A.hs.removeMember(r.householdId, mid);
    assert.strictEqual(typeof A.adapter.docs.get(`households/${r.householdId}/children/${r.childKey}`).removedAt, "number");
    assert.strictEqual(typeof A.adapter.docs.get(`households/${r.householdId}/members/${mid}`).deletedAt, "number");
    assert(!A.adapter.calls.some((c) => c[0] === "delete"));
  });

  console.log(`\n${passed}개 통과${process.exitCode ? ", 일부 실패" : ""}`);
})();
