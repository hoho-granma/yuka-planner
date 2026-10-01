/*
 * C1-a: 완료 상태(completed) 필드 단위 갱신 로직 테스트.
 * 실행: node test/c1-completed-fieldwise.test.js
 *
 * - Firebase 실제 호출은 하지 않는다. js/sync.js 를 vm 에서 스텁 firebase(FieldPath·FieldValue·db)로 실행해 update/set 인자를 기록한다.
 * - 실제 Firestore 서버 동작(FieldPath+delete 센티널 혼합, 한 update 의 여러 필드 쌍, 서로 다른 키 동시 쓰기)은 이 테스트로 확인할 수 없다 —
 *   일회용 테스트 가족 코드에서 서버 검증이 별도로 필요하다(설계서 §5).
 * - 호출부 4곳은 app.js 대형 IIFE 라 직접 import 할 수 없어, 소스에서 함수 본문을 꺼내 스텁 환경에서 실행한다(변경 전 = git HEAD 의 app.js 와 같은 시나리오로 비교).
 * - "서버 모사" 는 Firestore 호출이 아니라 의미 모사다: 기록된 payload 를 메모리 맵에 적용해 로컬 completed 와 같아지는지 본다.
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
// "변경 전" 기준은 C1-a 커밋(7ec0392)의 부모다 — HEAD 로 두면 커밋 뒤에는 변경 후 코드와 같아져 비교가 무의미해진다.
const C1_BASE = "7ec0392^";
let passed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log("  ok  - " + name); } catch (e) { process.exitCode = 1; console.log("  FAIL- " + name + "\n      " + (e.stack || e).split("\n").slice(0, 6).join("\n      ")); }
}

// ───────────────────────── sync.js 스텁 로드 ─────────────────────────
class FieldPath { constructor(...parts) { this.parts = parts; } }
const TS = { sentinel: "serverTimestamp" };
const DEL = { sentinel: "delete" };

function loadSync({ failUpdateWith } = {}) {
  const log = [];
  const ref = {
    update: async (...args) => { log.push({ op: "update", args }); if (failUpdateWith) { const e = new Error("x"); e.code = failUpdateWith; throw e; } },
    set: async (...args) => { log.push({ op: "set", args }); },
  };
  const firebase = {
    initializeApp() {},
    firestore: Object.assign(() => ({ collection: () => ({ doc: (code) => { log.push({ op: "doc", code }); return ref; } }) }), {
      FieldValue: { serverTimestamp: () => TS, delete: () => DEL },
      FieldPath,
    }),
  };
  const win = {};
  const ctx = vm.createContext({ firebase, window: win, localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} }, console });
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/sync.js"), "utf8"), ctx);
  return { S: win.FamilySync, log, writes: () => log.filter((l) => l.op !== "doc") };
}

/** vm 컨텍스트에서 만든 객체는 프로토타입이 달라 deepStrictEqual 이 실패하므로 JSON 형태로 비교한다(센티널 객체도 직렬화됨). */
const eq = (a, b, m) => assert.deepStrictEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)), m);
const ENTRY = { done: true, todo_id: "VX-DTAP", occurrenceKey: "dose-5", recordType: "TODO_COMPLETED", recordedAt: "2026-10-01T03:00:00.000Z" };
const KEY = "VX-DTAP__dose-5";

(async () => {
  console.log("sync.js — updateCompletedEntries / setCompletedEntry / removeCompletedEntry");

  await test("setCompletedEntry: 한 번의 update(FieldPath('completed', key), 값, 'updatedAt', 서버시각) — 하이픈·__ 키도 문자열 이어 붙임 없음", async () => {
    const { S, writes } = loadSync();
    await S.setCompletedEntry("ABC234", KEY, ENTRY);
    const w = writes();
    assert.strictEqual(w.length, 1);
    assert.strictEqual(w[0].op, "update");
    const a = w[0].args;
    assert.strictEqual(a.length, 4);
    assert.ok(a[0] instanceof FieldPath); assert.deepStrictEqual(a[0].parts, ["completed", KEY]);
    assert.strictEqual(a[1], ENTRY);
    assert.strictEqual(a[2], "updatedAt"); assert.strictEqual(a[3], TS);
    assert.ok(a.every((x) => typeof x !== "string" || !x.startsWith("completed.")), "completed.<key> 문자열 금지");
  });

  await test("removeCompletedEntry: 같은 경로에 FieldValue.delete() 센티널", async () => {
    const { S, writes } = loadSync();
    await S.removeCompletedEntry("ABC234", KEY);
    const a = writes()[0].args;
    assert.deepStrictEqual(a[0].parts, ["completed", KEY]); assert.strictEqual(a[1], DEL); assert.strictEqual(a[2], "updatedAt"); assert.strictEqual(a[3], TS);
    assert.strictEqual(writes().length, 1);
  });

  await test("updateCompletedEntries: set·remove 를 한 번의 update 로(원자적) — set 먼저, remove 다음, updatedAt 마지막", async () => {
    const { S, writes } = loadSync();
    const m = { ...ENTRY, recordType: "MILESTONE_REPORTED" };
    await S.updateCompletedEntries("ABC234", { set: { [KEY]: ENTRY, [KEY + "__milestone"]: m }, remove: [KEY + "__na"] });
    assert.strictEqual(writes().length, 1);
    const a = writes()[0].args;
    assert.strictEqual(a.length, 8);
    assert.deepStrictEqual([a[0].parts, a[2].parts, a[4].parts], [["completed", KEY], ["completed", KEY + "__milestone"], ["completed", KEY + "__na"]]);
    assert.deepStrictEqual([a[1], a[3], a[5]], [ENTRY, m, DEL]);
    assert.deepStrictEqual([a[6], a[7]], ["updatedAt", TS]);
  });

  await test("빈 변경은 아무것도 보내지 않는다(update·set 호출 0, 오류 없음)", async () => {
    const { S, writes } = loadSync();
    await S.updateCompletedEntries("ABC234", { set: {}, remove: [] });
    await S.updateCompletedEntries("ABC234", {});
    await S.updateCompletedEntries("ABC234");
    assert.strictEqual(writes().length, 0);
  });

  await test("같은 키가 set 과 remove 에 겹치면 거부하고 아무것도 보내지 않는다", async () => {
    const { S, writes } = loadSync();
    await assert.rejects(S.updateCompletedEntries("ABC234", { set: { [KEY]: ENTRY }, remove: [KEY] }), /set 과 remove/);
    assert.strictEqual(writes().length, 0);
  });

  await test("빈 키·문자열이 아닌 키·undefined 값은 거부한다(Firestore 는 undefined 값을 거부)", async () => {
    const { S, writes } = loadSync();
    await assert.rejects(S.updateCompletedEntries("ABC234", { set: { "": ENTRY } }), /키/);
    await assert.rejects(S.updateCompletedEntries("ABC234", { remove: [""] }), /키/);
    await assert.rejects(S.updateCompletedEntries("ABC234", { remove: [123] }), /키/);
    await assert.rejects(S.updateCompletedEntries("ABC234", { set: { [KEY]: undefined } }), /undefined/);
    assert.strictEqual(writes().length, 0);
  });

  await test("remove 목록의 중복 키는 한 번만 보낸다", async () => {
    const { S, writes } = loadSync();
    await S.updateCompletedEntries("ABC234", { remove: [KEY, KEY] });
    assert.strictEqual(writes()[0].args.length, 4);
  });

  await test("문서가 없으면(not-found) update 대신 set({merge:true})로 만든다 — 삭제할 키는 없으므로 set 값만, updateRecord 와 같은 방식", async () => {
    const { S, writes } = loadSync({ failUpdateWith: "not-found" });
    await S.updateCompletedEntries("ABC234", { set: { [KEY]: ENTRY }, remove: ["X__na"] });
    const w = writes();
    assert.deepStrictEqual(w.map((x) => x.op), ["update", "set"]);
    eq(w[1].args[0], { completed: { [KEY]: ENTRY }, updatedAt: TS });
    eq(w[1].args[1], { merge: true });
  });

  await test("다른 오류는 그대로 던진다(삼키지 않음)", async () => {
    const { S } = loadSync({ failUpdateWith: "permission-denied" });
    await assert.rejects(S.updateCompletedEntries("ABC234", { set: { [KEY]: ENTRY } }), (e) => e.code === "permission-denied");
  });

  await test("기존 updateCompleted(맵 통째 교체)는 그대로 있다 — update({completed 맵, updatedAt})", async () => {
    const { S, writes } = loadSync();
    await S.updateCompleted("ABC234", { [KEY]: ENTRY });
    eq(writes()[0].args, [{ completed: { [KEY]: ENTRY }, updatedAt: TS }]);
    ["createFamily", "fetchFamily", "updateProfile", "updateRecord", "listen", "getSavedCode", "saveCode", "clearCode"].forEach((n) => assert.strictEqual(typeof S[n], "function", n));
  });

  await test("diffCompleted: 새 키·바뀐 키는 set, 사라진 키는 remove, 그대로인 키는 제외", async () => {
    const { S } = loadSync();
    const a = { k1: { v: 1 }, k2: { v: 2 }, k3: { v: 3 } };
    const b = { k1: a.k1, k2: { v: 22 }, k4: { v: 4 } };
    eq(S.diffCompleted(a, b), { set: { k2: { v: 22 }, k4: { v: 4 } }, remove: ["k3"] });
    eq(S.diffCompleted(a, a), { set: {}, remove: [] });
    eq(S.diffCompleted(undefined, undefined), { set: {}, remove: [] });
  });

  // ───────────────────────── 호출부 4곳 (app.js 소스에서 함수를 꺼내 실행) ─────────────────────────
  console.log("app.js 호출부 4곳 — 전송 payload·로컬 상태");

  function extractFn(src, header) {
    const i = src.indexOf(header);
    assert.ok(i >= 0, "함수를 찾지 못함: " + header);
    const open = src.indexOf("{", src.indexOf(")", i));
    let depth = 0, j = open;
    for (; j < src.length; j++) { if (src[j] === "{") depth++; else if (src[j] === "}") { depth--; if (depth === 0) break; } }
    return src.slice(i, j + 1);
  }
  const NEW_SRC = fs.readFileSync(path.join(ROOT, "js/app.js"), "utf8");
  const OLD_SRC = execFileSync("git", ["show", C1_BASE + ":js/app.js"], { cwd: ROOT, maxBuffer: 1 << 26 }).toString("utf8");

  /** src 의 호출부 4곳(+ saveCompleted/syncCompletedChanges)을 스텁 환경에 올려 시나리오를 돌린다. */
  function makeEnv(src, { milestoneIds = [], familyCode = "FAM234", legacySync = false } = {}) {
    const calls = []; // 변경 전: {kind:"replace", map} / 변경 후: {kind:"entries", changes}
    const FamilySyncStub = {
      updateCompleted: (code, map) => { calls.push({ kind: "replace", code, map: JSON.parse(JSON.stringify(map)) }); return Promise.resolve(); },
      updateCompletedEntries: (code, changes) => { calls.push({ kind: "entries", code, changes: JSON.parse(JSON.stringify(changes)) }); return Promise.resolve(); },
      diffCompleted: loadSync().S.diffCompleted,
    };
    if (legacySync) { delete FamilySyncStub.updateCompletedEntries; delete FamilySyncStub.diffCompleted; } // 옛 sync.js: 새 함수 없음
    const parts = [
      extractFn(src, "function setNotApplicable("),
      extractFn(src, "function toggleComplete("),
      extractFn(src, "function setCompletionDate("),
      "function " + extractFn(src, "setCompletionMemo(id, memo)"),
    ];
    if (src.includes("function syncCompletedChanges(")) parts.push(extractFn(src, "function syncCompletedChanges("));
    const code = `
      let completed = {};
      let familyCode = ${JSON.stringify(familyCode)};
      const NA_SUFFIX = "__na";
      let modalMode = "detail"; let currentDayContext = null;
      const schedule = ${JSON.stringify(milestoneIds.map((id) => ({ id, detail: { definition: { triggerType: "MILESTONE_EVENT" } } })))};
      const saved = [];
      function saveCompleted() { saved.push(JSON.stringify(completed)); }
      function refreshSchedule() {} function closeDetail() {} function renderHome() {} function renderRecordTab() {} function renderDayList() {} function openDetail() {}
      function el() { return { classList: { contains: () => true } }; }
      ${parts.join("\n")}
      globalThis.__api = { setNotApplicable, toggleComplete, setCompletionDate, setCompletionMemo, get completed() { return completed; }, set completed(v) { completed = v; }, saved };
    `;
    // 두 번 돌린 결과를 비교하려고 시각을 고정한다(recordedAt).
    class FixedDate extends Date { constructor(...a) { if (a.length) super(...a); else super(1790000000000); } static now() { return 1790000000000; } }
    const ctx = vm.createContext({ FamilySync: FamilySyncStub, console, Date: FixedDate, JSON, Object, Math });
    vm.runInContext(code, ctx);
    return { api: ctx.__api, calls };
  }

  /** 같은 시나리오(완료→메모→완료일 수정→해당 없음→되돌리기→취소→마일스톤형 포함)를 돌리고 단계마다 [로컬 completed, 서버 모사]를 기록한다. */
  function runScenario(src) {
    const MS = "SF-04__default";
    const { api, calls } = makeEnv(src, { milestoneIds: [MS] });
    const server = {}; let n = 0;
    const apply = () => { // 새로 생긴 호출을 서버 모사 맵에 적용
      for (; n < calls.length; n++) {
        const c = calls[n];
        if (c.kind === "replace") { for (const k of Object.keys(server)) delete server[k]; Object.assign(server, c.map); }
        else { Object.assign(server, c.changes.set); for (const k of c.changes.remove) delete server[k]; }
      }
    };
    const steps = [];
    const snap = (label) => { apply(); steps.push({ label, local: JSON.parse(JSON.stringify(api.completed)), server: JSON.parse(JSON.stringify(server)) }); };
    const D = "VX-DTAP__dose-5";
    api.toggleComplete(D); snap("완료");
    api.setCompletionMemo(D, "왼팔"); snap("메모");
    api.setCompletionDate(D, "2026-09-15"); snap("완료일 수정");
    api.setCompletionMemo(D, ""); snap("메모 지움");
    api.toggleComplete(D); snap("취소");
    api.setNotApplicable(D, true); snap("해당 없음 켜기");
    api.toggleComplete(D); snap("해당 없음 상태에서 완료(→__na 삭제)");
    api.setNotApplicable(D, false); snap("해당 없음 끄기(해제 대상 없음)");
    api.setNotApplicable("NAT-001", true); snap("지원금 해당 없음 켜기");
    api.setNotApplicable("NAT-001", false); snap("지원금 해당 없음 끄기");
    api.toggleComplete(MS); snap("마일스톤형 완료(2키)");
    api.setCompletionDate(MS, "2026-08-01"); snap("마일스톤형 완료일 수정(2키)");
    api.toggleComplete(MS); snap("마일스톤형 취소(__milestone 잔존 — 기존 동작)");
    api.setCompletionDate("없는키__x", "2026-01-01"); snap("없는 키 완료일 수정(무시)");
    api.setCompletionMemo("없는키__x", "m"); snap("없는 키 메모(무시)");
    return { steps, calls };
  }

  const OLD = runScenario(OLD_SRC);
  const NEW = runScenario(NEW_SRC);

  await test("로컬 completed 최종·단계별 상태가 변경 전 코드와 같다(완료→메모→완료일→해당 없음→취소→마일스톤형 포함)", () => {
    assert.strictEqual(NEW.steps.length, OLD.steps.length);
    OLD.steps.forEach((o, i) => assert.deepStrictEqual(NEW.steps[i].local, o.local, `${i} ${o.label}`));
  });

  await test("서버 모사: 매 단계 뒤 서버(기록한 payload 적용) = 로컬 completed — 변경 전 통째 교체와 같은 결과", () => {
    NEW.steps.forEach((s, i) => assert.deepStrictEqual(s.server, s.local, `${i} ${s.label}`));
    OLD.steps.forEach((s, i) => assert.deepStrictEqual(s.server, s.local, `old ${i} ${s.label}`));
  });

  await test("변경 전 코드는 호출마다 맵 전체(updateCompleted), 변경 후는 updateCompletedEntries 만 쓴다(통째 교체 호출 0)", () => {
    assert.ok(OLD.calls.length > 0 && OLD.calls.every((c) => c.kind === "replace"));
    assert.ok(NEW.calls.length > 0 && NEW.calls.every((c) => c.kind === "entries"));
  });

  // 호출별 기대 payload (set 키 / remove 키). 값은 별도 검증.
  const D = "VX-DTAP__dose-5", MS = "SF-04__default";
  const EXPECT = [
    ["완료", [D], []],
    ["메모", [D], []],
    ["완료일 수정", [D], []],
    ["메모 지움", [D], []],
    ["취소", [], [D]],
    ["해당 없음 켜기", [D + "__na"], []],                 // completed[id] 는 이미 없으므로 remove 없음(실제로 바뀐 키만)
    ["해당 없음 상태에서 완료(→__na 삭제)", [D], [D + "__na"]],
    ["해당 없음 끄기(해제 대상 없음)", [], []],             // 바뀐 게 없으면 빈 변경 → updateCompletedEntries 가 아무것도 보내지 않는다
    ["지원금 해당 없음 켜기", ["NAT-001__na"], []],
    ["지원금 해당 없음 끄기", [], ["NAT-001__na"]],
    ["마일스톤형 완료(2키)", [MS, MS + "__milestone"], []],
    ["마일스톤형 완료일 수정(2키)", [MS, MS + "__milestone"], []],
    ["마일스톤형 취소(__milestone 잔존 — 기존 동작)", [], [MS]],
    ["없는 키 완료일 수정(무시)", null, null],
    ["없는 키 메모(무시)", null, null],
  ];
  await test("호출부별 전송 payload: 조작마다 update 1회(바뀐 키의 set/remove 집합만) — 맵 전체가 아니다", () => {
    // 변경 후 코드는 각 조작이 familyCode 가 있으면 syncCompletedChanges 를 정확히 1번 부른다(무시되는 조작 제외).
    const live = EXPECT.filter((e) => e[1] !== null);
    assert.strictEqual(NEW.calls.length, live.length, "호출 횟수");
    live.forEach((e, i) => {
      const c = NEW.calls[i].changes;
      assert.deepStrictEqual(Object.keys(c.set).sort(), e[1].slice().sort(), `${e[0]} set`);
      assert.deepStrictEqual(c.remove.slice().sort(), e[2].slice().sort(), `${e[0]} remove`);
      assert.strictEqual(NEW.calls[i].code, "FAM234");
    });
  });

  await test("set 값은 로컬 completed 의 값 그대로(형식 불변): done·todo_id·occurrenceKey·recordType·recordedAt(+memo)", () => {
    const first = NEW.calls[0].changes.set[D];
    assert.deepStrictEqual(Object.keys(first).sort(), ["done", "occurrenceKey", "recordType", "recordedAt", "todo_id"]);
    assert.deepStrictEqual([first.done, first.todo_id, first.occurrenceKey, first.recordType], [true, "VX-DTAP", "dose-5", "TODO_COMPLETED"]);
    assert.strictEqual(NEW.calls[1].changes.set[D].memo, "왼팔");
    assert.ok(!("memo" in NEW.calls[3].changes.set[D]), "메모를 지우면 필드를 지운다(undefined 전송 없음)");
    const ms = NEW.calls[10].changes.set; // 마일스톤형 완료(EXPECT 10번째)
    assert.strictEqual(Object.values(ms).length, 2);
  });

  await test("가족코드가 없으면(familyCode 빈 값) 서버로 아무것도 보내지 않는다 — 로컬 저장만", () => {
    const env = makeEnv(NEW_SRC, { familyCode: "" });
    env.api.toggleComplete(D);
    assert.strictEqual(env.calls.length, 0);
    assert.ok(Object.keys(env.api.completed).includes(D));
  });

  await test("캐시 혼재 폴백: 새 함수가 없는 옛 FamilySync 면 예외 없이 옛 updateCompleted(맵 전체)를 조작당 1회 호출하고 로컬 상태는 같다", () => {
    const legacy = makeEnv(NEW_SRC, { milestoneIds: ["SF-04__default"], legacySync: true });
    assert.doesNotThrow(() => { legacy.api.toggleComplete(D); legacy.api.setCompletionMemo(D, "m"); legacy.api.toggleComplete(D); legacy.api.toggleComplete("SF-04__default"); });
    assert.deepStrictEqual(legacy.calls.map((c) => c.kind), ["replace", "replace", "replace", "replace"]);
    assert.deepStrictEqual(Object.keys(legacy.calls[1].map), [D]); // 맵 전체(그 시점의 completed)
    assert.deepStrictEqual(Object.keys(legacy.calls[3].map).sort(), Object.keys(legacy.api.completed).sort()); // 마지막 호출 = 그 시점 맵 전체
    // 같은 조작을 정상 sync.js 로 돌렸을 때와 로컬 completed 가 같다
    const normal = makeEnv(NEW_SRC, { milestoneIds: ["SF-04__default"] });
    normal.api.toggleComplete(D); normal.api.setCompletionMemo(D, "m"); normal.api.toggleComplete(D); normal.api.toggleComplete("SF-04__default");
    assert.deepStrictEqual(JSON.parse(JSON.stringify(legacy.api.completed)), JSON.parse(JSON.stringify(normal.api.completed)));
    assert.ok(normal.calls.every((c) => c.kind === "entries")); // 정상 경로 유지
  });

  await test("캐시 혼재: 한쪽 함수만 없어도(diffCompleted 없음) 폴백한다 · familyCode 없으면 폴백에서도 전송 0", () => {
    const only = makeEnv(NEW_SRC, { legacySync: true });
    assert.strictEqual(only.calls.length, 0);
    const none = makeEnv(NEW_SRC, { legacySync: true, familyCode: "" });
    none.api.toggleComplete(D);
    assert.strictEqual(none.calls.length, 0);
  });

  await test("호출부 4곳에 맵 전체 전송이 남아 있지 않다(app.js 의 FamilySync.updateCompleted( 는 캐시 혼재 폴백 1곳뿐, createFamily 의 최초 업로드는 sync.js 내부)", () => {
    assert.strictEqual((NEW_SRC.match(/FamilySync\.updateCompleted\(/g) || []).length, 1);
    assert.ok(/function syncCompletedChanges[\s\S]*?typeof FamilySync\.updateCompletedEntries !== "function"[\s\S]*?FamilySync\.updateCompleted\(/.test(NEW_SRC));
    assert.strictEqual((NEW_SRC.match(/syncCompletedChanges\(before\);/g) || []).length, 4);
  });

  console.log("서버 모사(의미 모사 — Firestore 호출 아님): 두 기기가 서로 다른 키를 체크해도 둘 다 남고, 취소가 되살아나지 않는다");

  /** 필드 단위 의미를 모사한 서버: set 은 그 키만, remove 는 그 키만 건드린다. 통째 교체 서버(옛 동작)와 비교한다. */
  const fieldServer = () => { const m = {}; return { m, apply: (c) => { Object.assign(m, c.set); c.remove.forEach((k) => delete m[k]); } }; };
  const replaceServer = () => { let m = {}; return { get m() { return m; }, apply: (map) => { m = { ...map }; } }; };

  await test("동시: 기기 A·B 가 스냅샷을 받기 전에 각각 X·Y 체크 → 필드 단위는 {X,Y}, 통째 교체는 마지막 쓰기만 남음(옛 유실 재현)", () => {
    const S = loadSync().S;
    const f = fieldServer(); const r = replaceServer();
    const a = {}, b = {};
    const beforeA = { ...a }; a.X = { v: "X" }; f.apply(S.diffCompleted(beforeA, a)); r.apply(a);
    const beforeB = { ...b }; b.Y = { v: "Y" }; f.apply(S.diffCompleted(beforeB, b)); r.apply(b);
    assert.deepStrictEqual(Object.keys(f.m).sort(), ["X", "Y"]);
    assert.deepStrictEqual(Object.keys(r.m), ["Y"]);
  });

  await test("취소 + 타 기기 체크: A 가 X 를 취소하고 B(옛 스냅샷 {X})가 Y 를 체크해도 X 는 되살아나지 않는다(필드 단위), 통째 교체는 되살림", () => {
    const S = loadSync().S;
    const f = fieldServer(); const r = replaceServer();
    f.m.X = { v: "X" }; r.apply({ X: { v: "X" } });
    const a = { X: { v: "X" } }, b = { X: { v: "X" } };       // 둘 다 {X} 를 본 상태
    const beforeA = { ...a }; delete a.X; f.apply(S.diffCompleted(beforeA, a)); r.apply(a);          // A: X 취소
    const beforeB = { ...b }; b.Y = { v: "Y" }; f.apply(S.diffCompleted(beforeB, b)); r.apply(b);    // B: 옛 {X} 위에 Y 체크
    assert.deepStrictEqual(Object.keys(f.m), ["Y"]);
    assert.deepStrictEqual(Object.keys(r.m).sort(), ["X", "Y"]);
  });

  await test("같은 키를 동시에 쓰면 마지막 쓰기가 이긴다(허용 — 설계 §3-6)", () => {
    const S = loadSync().S;
    const f = fieldServer();
    f.apply({ set: { X: { v: "A" } }, remove: [] }); f.apply({ set: { X: { v: "B" } }, remove: [] });
    assert.deepStrictEqual(f.m.X, { v: "B" });
    void S;
  });

  await test("읽는 쪽·로컬 저장·createFamily·rules 는 변경하지 않았다(소스 해시: 변경 전 HEAD 와 같은 부분)", () => {
    const body = (s) => s.slice(s.indexOf("async function createFamily"), s.indexOf("async function fetchFamily"));
    const oldSync = execFileSync("git", ["show", C1_BASE + ":js/sync.js"], { cwd: ROOT }).toString("utf8");
    const newSync = fs.readFileSync(path.join(ROOT, "js/sync.js"), "utf8");
    assert.strictEqual(body(newSync), body(oldSync));
    // 기존 updateCompleted·updateRecord·listen 본문도 그대로
    ["async function updateCompleted(", "async function updateRecord(", "function listen("].forEach((h) => {
      const cut = (s) => { const i = s.indexOf(h); return s.slice(i, i + 400); };
      assert.strictEqual(cut(newSync), cut(oldSync), h);
    });
  });

  console.log(`\n${passed}개 통과${process.exitCode ? ", 일부 실패" : ""}`);
})();
