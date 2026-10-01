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
const US = require("../js/user-schedule.js");
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
      await hs.createSchedule("h1", { v: 1 }),
      await hs.patchSchedule("h1", "s1", { title: "x" }),
      await hs.flush("h1"),
      hs.startListening("h1"),
    ];
    r.forEach((x) => assert.deepStrictEqual({ ok: x.ok, reason: x.reason }, { ok: false, reason: "disabled" }));
    assert.strictEqual(hs.getMirror("h1"), null);
    assert.deepStrictEqual(hs.getSchedules("h1"), []);
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
    const sc = await hs.createSchedule(r.householdId, US.buildCreateDoc({ sourceType: "MANUAL", title: "수업", category: "LESSON", scope: "FAMILY", allDay: true, dateKind: "FIXED", eventDate: "2026-10-06" }, 1).doc);
    await hs.patchSchedule(r.householdId, sc.scheduleId, { title: "수정", updatedAt: 2 });
    assert(adapter.writes().length >= 10);
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

  await test("리스너: 4개 등록(가구·아이·담당자·일정), stopListening 이 모두 해제하고 재시작 시 중복 등록하지 않는다", async () => {
    const A = mk(true);
    A.hs.startListening("h1");
    assert.strictEqual(A.adapter.listeners.length, 4);
    assert(A.adapter.listeners.some((l) => l.p === "households/h1/schedules"));
    A.hs.startListening("h1");
    assert.strictEqual(A.adapter.listeners.filter((x) => !x.off).length, 4);
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

  console.log("\n사용자 일정 I/O (B4)");
  const mkDoc = (over = {}) => {
    const r = US.buildCreateDoc({ sourceType: "MANUAL", title: "피아노", category: "LESSON", scope: "CHILD", childKeys: ["c1"], allDay: false, startTime: "16:00", dateKind: "FIXED", eventDate: "2026-10-06", ...over }, 1000);
    assert(r.ok, JSON.stringify(r.errors));
    return r.doc;
  };

  await test("createSchedule: households/{hid}/schedules/{sid} 에 전체 문서를 set(병합 없음)하고 미러에 반영, 문서 ID 반환", async () => {
    const A = mk(true);
    const doc = mkDoc();
    const r = await A.hs.createSchedule("h1", doc);
    assert(r.ok && r.scheduleId && !r.pending);
    const w = A.adapter.writes().filter((c) => c[1].includes("/schedules/"));
    assert.strictEqual(w.length, 1);
    assert.strictEqual(w[0][0], "set");
    assert.strictEqual(w[0][1], `households/h1/schedules/${r.scheduleId}`);
    assert.strictEqual(w[0][3], undefined, "merge 옵션 없음");
    assert.deepStrictEqual(A.adapter.docs.get(w[0][1]), doc);
    assert.deepStrictEqual(A.hs.getSchedules("h1").map((x) => x.id), [r.scheduleId]);
    assert.strictEqual(A.hs.getSchedules("h1")[0].title, "피아노");
  });

  await test("patchSchedule: update 로 보내고(dot-path 포함), 미러 결과가 UserSchedule.buildPatch().after 와 같다", async () => {
    const A = mk(true);
    const recurring = mkDoc({ eventDate: undefined, recurrence: { freq: "WEEKLY", interval: 1, byDay: ["TU"], startDate: "2026-10-06", until: null } });
    const { scheduleId } = await A.hs.createSchedule("h1", recurring);
    const b1 = US.buildPatch(recurring, { exceptions: { "2026-10-13": { status: "CANCELLED", note: "휴강" } }, memo: "메모" }, 2000);
    assert(b1.ok);
    await A.hs.patchSchedule("h1", scheduleId, b1.patch);
    assert.deepStrictEqual(A.hs.getSchedules("h1")[0], { ...b1.after, id: scheduleId });
    const up = A.adapter.writes().find((c) => c[0] === "update");
    assert.deepStrictEqual(Object.keys(up[2]).sort(), ["exceptions.2026-10-13", "memo", "updatedAt"]);
    // 예외 제거(null) + memo 삭제(null) → 필드가 사라진다
    const b2 = US.buildPatch(b1.after, { exceptions: { "2026-10-13": null }, memo: null }, 3000);
    assert(b2.ok && b2.patch["exceptions.2026-10-13"] === null && b2.patch.memo === null);
    await A.hs.patchSchedule("h1", scheduleId, b2.patch);
    assert.deepStrictEqual(A.hs.getSchedules("h1")[0], { ...b2.after, id: scheduleId });
    assert(!("memo" in A.hs.getSchedules("h1")[0]) && !("exceptions" in A.hs.getSchedules("h1")[0]));
  });

  await test("완료·소프트 삭제 패치도 미러에 같은 결과로 반영된다(status DONE → deletedAt)", async () => {
    const A = mk(true);
    const doc = mkDoc();
    const { scheduleId } = await A.hs.createSchedule("h1", doc);
    const done = US.markDone(doc, 2000);
    await A.hs.patchSchedule("h1", scheduleId, done.patch);
    const del = US.softDelete(done.after, 3000);
    await A.hs.patchSchedule("h1", scheduleId, del.patch);
    assert.deepStrictEqual(A.hs.getSchedules("h1")[0], { ...del.after, id: scheduleId });
    assert.strictEqual(A.hs.getSchedules("h1")[0].status, "DONE");
    assert.strictEqual(A.hs.getSchedules("h1")[0].deletedAt, 3000);
    assert(A.adapter.docs.has(`households/h1/schedules/${scheduleId}`), "하드 삭제 없음");
    assert(!A.adapter.calls.some((c) => c[0] === "delete"));
  });

  await test("오프라인: 일정 생성·수정이 순서대로 대기열에 쌓이고 복구 후 flush 로 서버에 같은 결과", async () => {
    const A = mk(true);
    A.adapter.fail = "unavailable";
    const doc = mkDoc();
    const { scheduleId, pending } = await A.hs.createSchedule("h1", doc);
    assert.strictEqual(pending, true);
    const p = US.buildPatch(doc, { title: "바이올린" }, 2000);
    const r2 = await A.hs.patchSchedule("h1", scheduleId, p.patch);
    assert.strictEqual(r2.pending, true);
    assert.strictEqual(A.hs.getStatus("h1").pending, 2);
    assert.strictEqual(A.hs.getSchedules("h1")[0].title, "바이올린", "로컬 즉시 반영");
    A.adapter.fail = null;
    A.adapter.calls.length = 0;
    const f = await A.hs.flush("h1");
    assert.strictEqual(f.remaining, 0);
    assert.deepStrictEqual(A.adapter.writes().map((c) => c[0]), ["set", "update"], "생성 → 수정 순서");
    assert.deepStrictEqual(A.adapter.docs.get(`households/h1/schedules/${scheduleId}`), p.after);
  });

  await test("서버 스냅샷: 대기열에 없는 일정은 서버 값, 대기열에 있는 일정은 로컬 그대로(지운 필드가 되살아나지 않음)", async () => {
    const A = mk(true);
    const doc = mkDoc({ memo: "서버메모" });
    const { scheduleId } = await A.hs.createSchedule("h1", doc);
    A.adapter.fail = "unavailable";
    const p = US.buildPatch(doc, { memo: null, title: "로컬수정" }, 2000);
    await A.hs.patchSchedule("h1", scheduleId, p.patch);
    A.adapter.fail = null;
    A.hs.startListening("h1");
    const l = A.adapter.listeners.find((x) => x.p.endsWith("/schedules"));
    l.onData([{ id: scheduleId, data: doc }, { id: "other", data: mkDoc({ title: "다른 기기 일정" }) }]);
    const got = Object.fromEntries(A.hs.getSchedules("h1").map((x) => [x.id, x]));
    assert.strictEqual(got[scheduleId].title, "로컬수정");
    assert(!("memo" in got[scheduleId]), "서버의 옛 memo 가 되살아나면 안 된다");
    assert.strictEqual(got.other.title, "다른 기기 일정");
    // flush 후에는 서버 값이 이긴다
    await A.hs.flush("h1");
    l.onData([{ id: scheduleId, data: p.after }]);
    assert.deepStrictEqual(A.hs.getSchedules("h1").map((x) => x.id), [scheduleId], "서버 목록에 없는 다른 기기 일정은 사라진다(서버가 기준)");
  });

  await test("참여(joinHousehold): 가구의 일정 목록도 미러에 들어온다 / 다른 기기가 보낸 일정이 getSchedules 에 보인다", async () => {
    const A = mk(true);
    const r = await A.hs.createHousehold({});
    const { scheduleId } = await A.hs.createSchedule(r.householdId, mkDoc({ scope: "FAMILY", childKeys: undefined, category: "FAMILY", title: "가족 외식" }));
    const B = mk(true, { adapter: A.adapter });
    const j = await B.hs.joinHousehold(r.code);
    assert(j.ok);
    assert.deepStrictEqual(B.hs.getSchedules(r.householdId).map((x) => [x.id, x.title]), [[scheduleId, "가족 외식"]]);
    assert(A.adapter.calls.some((c) => c[0] === "list" && c[1].endsWith("/schedules")));
  });

  await test("예전 미러(schedules 필드 없음)도 안전하게 읽는다", async () => {
    const storage = memStorage();
    storage.setItem("hannun_household:h1", JSON.stringify({ householdId: "h1", household: null, children: {}, members: {} }));
    const A = mk(true, { storage });
    assert.deepStrictEqual(A.hs.getSchedules("h1"), []);
    assert.deepStrictEqual(A.hs.getMirror("h1").schedules, {});
  });

  await test("일정 쓰기 경로는 households/** 뿐 — families/** 쓰기 0건(생성·수정·완료·삭제·오프라인 flush 모두)", async () => {
    const A = mk(true);
    const doc = mkDoc();
    const { scheduleId } = await A.hs.createSchedule("h1", doc);
    A.adapter.fail = "unavailable";
    await A.hs.patchSchedule("h1", scheduleId, US.markDone(doc, 2000).patch);
    A.adapter.fail = null;
    await A.hs.flush("h1");
    await A.hs.patchSchedule("h1", scheduleId, US.softDelete(US.markDone(doc, 2000).after, 3000).patch);
    assert(A.adapter.writes().length >= 3);
    A.adapter.writes().forEach((w) => assert(/^households\/h1\/schedules\//.test(w[1]), w[1]));
  });

  await test("실제 Firestore 어댑터: update 패치의 null 은 FieldValue.delete() 로 바뀌고 나머지 값은 그대로", async () => {
    const SENTINEL = { __delete: true };
    global.firebase = { firestore: { FieldValue: { delete: () => SENTINEL } } };
    let sent = null;
    const node = (path) => ({ collection: (c) => node(path + "/" + c), doc: (d) => node(path + "/" + d), update: async (d) => ((sent = d), (sent.__path = path)) });
    const fakeDb = { collection: (c) => node(c) };
    const ad = HS.firestoreAdapter(() => fakeDb);
    await ad.update("households/h1/schedules/s1", { title: "x", memo: null, "exceptions.2026-10-13": null, "exceptions.2026-10-14": { status: "DONE" }, updatedAt: 5 });
    delete global.firebase;
    assert.strictEqual(sent.__path, "households/h1/schedules/s1");
    assert.strictEqual(sent.memo, SENTINEL);
    assert.strictEqual(sent["exceptions.2026-10-13"], SENTINEL);
    assert.deepStrictEqual(sent["exceptions.2026-10-14"], { status: "DONE" });
    assert.strictEqual(sent.title, "x");
    assert.strictEqual(sent.updatedAt, 5);
  });

  console.log("\n반복 일정 예외 정리 × 오프라인 (B5 D6)");
  /** Firestore update 의미를 따르는 어댑터: "a.b.c" dot-path 로 중첩 필드를 쓰고 null 은 필드 삭제로 받는다(실제 어댑터는 null→FieldValue.delete()). */
  const pathAwareUpdate = (adapter) => {
    adapter.update = async (p, d) => {
      adapter.calls.push(["update", p, d]);
      if (adapter.fail) throw Object.assign(new Error(adapter.fail), { code: adapter.fail });
      const cur = JSON.parse(JSON.stringify(adapter.docs.get(p)));
      for (const [key, val] of Object.entries(d)) {
        const parts = key.split(".");
        let o = cur;
        for (let i = 0; i < parts.length - 1; i++) o = o[parts[i]] = o[parts[i]] || {};
        if (val === null) delete o[parts[parts.length - 1]];
        else o[parts[parts.length - 1]] = val;
      }
      adapter.docs.set(p, cur);
    };
  };
  const REC2 = { freq: "WEEKLY", interval: 1, byDay: ["TU", "TH"], startDate: "2026-10-06", until: null };

  await test("D6: 오프라인에서 보낸 '예외 정리' 패치는 서버에 새로 생긴 다른 날짜 예외를 덮어쓰지 않는다(날짜별 dot-path)", async () => {
    const A = mk(true);
    pathAwareUpdate(A.adapter);
    const doc = mkDoc({ eventDate: undefined, recurrence: REC2, exceptions: { "2026-10-08": { status: "CANCELLED" }, "2026-10-13": { status: "DONE" } } });
    const { scheduleId } = await A.hs.createSchedule("h1", doc);
    const P = `households/h1/schedules/${scheduleId}`;
    // A: 오프라인으로 전환 → 요일을 화로 바꾼다(목요일 예외 10/8 정리)
    A.adapter.fail = "unavailable";
    const r = US.editAll(doc, { recurrence: { ...REC2, byDay: ["TU"] } }, 2000);
    assert(r.ok && r.pruned.length === 1);
    const res = await A.hs.patchSchedule("h1", scheduleId, r.patch);
    assert.strictEqual(res.pending, true);
    // 그 사이 다른 기기가 서버에 예외를 추가: 새 규칙에서도 유효한 10/20(화) 취소, 옛 규칙에서만 유효한 10/22(목) 취소
    const server = JSON.parse(JSON.stringify(A.adapter.docs.get(P)));
    server.exceptions["2026-10-20"] = { status: "CANCELLED" };
    server.exceptions["2026-10-22"] = { status: "CANCELLED" };
    A.adapter.docs.set(P, server);
    // 복구 후 flush
    A.adapter.fail = null;
    const f = await A.hs.flush("h1");
    assert.strictEqual(f.remaining, 0);
    const got = A.adapter.docs.get(P);
    assert.deepStrictEqual(got.recurrence.byDay, ["TU"], "규칙 변경은 서버에 반영");
    assert.deepStrictEqual(got.exceptions["2026-10-13"], { status: "DONE" }, "유효한 예외는 그대로");
    assert(!("2026-10-08" in got.exceptions), "정리 대상 날짜 예외만 삭제");
    assert.deepStrictEqual(got.exceptions["2026-10-20"], { status: "CANCELLED" }, "다른 기기가 새로 만든 유효 예외는 살아남는다");
    assert.deepStrictEqual(got.exceptions["2026-10-22"], { status: "CANCELLED" }, "내가 몰랐던 옛 규칙 예외는 무효가 되어 무시될 뿐 삭제되지 않는다");
    const occ = US.expandOccurrences({ ...got, id: scheduleId }, "2026-10-01", "2026-10-31");
    assert(occ.some((o) => o.originalDate === "2026-10-20" && o.status === "CANCELLED"));
    assert(!occ.some((o) => o.originalDate === "2026-10-22"), "화요일 규칙에서 22일(목)은 회차가 아니다");
    // 패치에 쓴 키는 정리한 날짜뿐(문서 전체 교체가 아님)
    const sent = A.adapter.writes().filter((c) => c[0] === "update").pop()[2];
    assert.deepStrictEqual(Object.keys(sent).sort(), ["exceptions.2026-10-08", "recurrence", "updatedAt"]);
  });

  await test("오프라인 이 날만 취소/이동은 서로 다른 날짜끼리 합쳐진다(두 기기가 각자 다른 날을 바꿔도 둘 다 남음)", async () => {
    const A = mk(true);
    pathAwareUpdate(A.adapter);
    const doc = mkDoc({ eventDate: undefined, recurrence: REC2 });
    const { scheduleId } = await A.hs.createSchedule("h1", doc);
    const P = `households/h1/schedules/${scheduleId}`;
    A.adapter.fail = "unavailable";
    const c = US.cancelOccurrence(doc, "2026-10-13", 2000);
    await A.hs.patchSchedule("h1", scheduleId, c.patch);
    const mv = US.moveOccurrence(c.after, "2026-10-15", { date: "2026-10-16", startTime: "10:00" }, 2001);
    await A.hs.patchSchedule("h1", scheduleId, mv.patch);
    assert.strictEqual(A.hs.getStatus("h1").pending, 2);
    const mine = US.expandOccurrences({ ...A.hs.getSchedules("h1")[0] }, "2026-10-01", "2026-10-31");
    assert(mine.some((o) => o.originalDate === "2026-10-13" && o.status === "CANCELLED") && mine.some((o) => o.originalDate === "2026-10-15" && o.date === "2026-10-16"), "오프라인 중에도 로컬 화면에 즉시 반영");
    const server = JSON.parse(JSON.stringify(A.adapter.docs.get(P)));
    server.exceptions = { "2026-10-20": { status: "DONE" } };           // 다른 기기가 같은 시각에 10/20 을 완료
    A.adapter.docs.set(P, server);
    A.adapter.fail = null;
    await A.hs.flush("h1");
    const got = A.adapter.docs.get(P).exceptions;
    assert.deepStrictEqual(Object.keys(got).sort(), ["2026-10-13", "2026-10-15", "2026-10-20"]);
    assert.strictEqual(got["2026-10-20"].status, "DONE");
  });

  await test("(한계 기록) 대기열에 있는 동안 미러는 로컬 문서를 그대로 보여 준다 — 서버의 새 예외는 flush 후 스냅샷에서 보인다(데이터 유실 아님)", async () => {
    const A = mk(true);
    pathAwareUpdate(A.adapter);
    const doc = mkDoc({ eventDate: undefined, recurrence: REC2 });
    const { scheduleId } = await A.hs.createSchedule("h1", doc);
    const P = `households/h1/schedules/${scheduleId}`;
    A.adapter.fail = "unavailable";
    await A.hs.patchSchedule("h1", scheduleId, US.cancelOccurrence(doc, "2026-10-13", 2000).patch);
    A.hs.startListening("h1");
    const l = A.adapter.listeners.find((x) => x.p.endsWith("/schedules"));
    l.onData([{ id: scheduleId, data: { ...doc, exceptions: { "2026-10-20": { status: "DONE" } } } }]);
    const during = A.hs.getSchedules("h1")[0];
    assert(during.exceptions["2026-10-13"] && !during.exceptions["2026-10-20"], "대기 중에는 로컬 문서만 보인다");
    A.adapter.fail = null;
    A.adapter.docs.set(P, { ...doc, exceptions: { "2026-10-20": { status: "DONE" } } });
    await A.hs.flush("h1");
    l.onData([{ id: scheduleId, data: A.adapter.docs.get(P) }]);
    const after = A.hs.getSchedules("h1")[0];
    assert(after.exceptions["2026-10-13"] && after.exceptions["2026-10-20"], "flush 후 스냅샷에서는 둘 다 보인다");
  });

  console.log(`\n${passed}개 통과${process.exitCode ? ", 일부 실패" : ""}`);
})();
