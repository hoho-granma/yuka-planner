/*
 * N1 테스트 — 새 아이 추가: 입력하는 동안은 지금 아이를 그대로 두고, 저장(검증 통과)·불러오기 성공 시점에만 비운다.
 * 취소 시 저장소·메모리 불변, 실패 시 이전 아이 유지, 가족코드 없는 오프라인 아이 보호, 입력 중 가구 참여 취소 시 가구 연결 복원, 기존 handleReset 의 데이터 동작 동일.
 * app.js 연결은 소스에서 꺼내 스텁으로 실행한다. 서버 호출 없음. 실행: node test/n1-new-child.test.js
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { execSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
const BASE = "4547cb7"; // C2-b2 커밋(이번 변경 직전)
const headApp = execSync(`git show ${BASE}:js/app.js`, { cwd: ROOT, encoding: "utf8" });
const app = read("js/app.js");
let passed = 0, started = 0, finished = 0;
const pending = [];
function test(name, fn) {
  started++;
  const ok = () => { passed++; finished++; console.log("  ok  - " + name); };
  const bad = (e) => { process.exitCode = 1; finished++; console.log("  FAIL- " + name + "\n      " + (e.stack || e).split("\n").slice(0, 6).join("\n      ")); };
  try { const r = fn(); if (r && typeof r.then === "function") pending.push(r.then(ok, bad)); else ok(); } catch (e) { bad(e); }
}
process.on("exit", () => { if (started !== finished) { console.log(`FAIL- 끝나지 않은 테스트 ${started - finished}개`); process.exitCode = 1; } });

const fnSrc = (src, name, pre = "  function ") => { const a = src.indexOf(`${pre}${name}(`); assert.ok(a >= 0, name); const b = src.indexOf("\n  }\n", a); return src.slice(a, b + 5); };
const a0 = app.indexOf("  // ── N1 새 아이 추가");
const a1 = app.indexOf("  function showNewChildSheet()");
assert.ok(a0 > 0 && a1 > a0);
const blockSrc = app.slice(a0, a1);
const submitSrc = fnSrc(app, "handleSubmit", "  async function ");
const loadSrc = fnSrc(app, "handleLoadCode", "  async function ");

function env(opts) {
  const o = { profile: { name: "은찬", birthOrder: "first", stage: "born", province: "서울특별시", district: "구로구", birthDate: new Date(2026, 5, 20) }, familyCode: "ABC234", completed: { "VX-DTAP__dose-1": { done: true } }, hhOn: false, hhId: null, hhCode: null, ensureOk: true, fetchData: undefined, ...opts };
  const ls = new Map([["hannun_profile", "P"], ["hannun_completed", "C"], ["hannun_family_code", o.familyCode || ""]]);
  if (o.hhId) { ls.set("hannun_household_id", o.hhId); ls.set("hannun_household_code", o.hhCode); }
  const log = { calls: [], sheets: [], shown: [] };
  const els = {};
  const mk = (id) => els[id] || (els[id] = {
    id, value: "", textContent: "", innerHTML: "", cls: new Set(id === "new-child-bar" || id === "code-entry" || id === "code-error" ? ["hidden"] : []), listeners: {},
    classList: { add: (c) => els[id].cls.add(c), remove: (c) => els[id].cls.delete(c), contains: (c) => els[id].cls.has(c), toggle: (c, on) => (on === undefined ? (els[id].cls.has(c) ? els[id].cls.delete(c) : els[id].cls.add(c)) : on ? els[id].cls.add(c) : els[id].cls.delete(c)) },
    addEventListener(t, f) { this.listeners[t] = f; }, reset() { log.calls.push("form-reset"); }, scrollIntoView() {},
  });
  const sb = {
    console: { error() {}, log() {} }, Promise, Date, JSON,
    localStorage: { getItem: (k) => (ls.has(k) ? ls.get(k) : null), setItem: (k, v) => ls.set(k, String(v)), removeItem: (k) => ls.delete(k) },
    PROFILE_KEY: "hannun_profile", HH_ID_KEY: "hannun_household_id", HH_CODE_KEY: "hannun_household_code",
    el: mk, profile: o.profile, familyCode: o.familyCode, completed: o.completed, unsubscribeFamily: () => log.calls.push("unsub"), modalMode: null, landingStage: null,
    saveCompleted: () => { log.calls.push("saveCompleted"); ls.set("hannun_completed", JSON.stringify(sb.completed)); },
    saveProfile: (p) => { log.calls.push("saveProfile"); ls.set("hannun_profile", "NEW"); },
    FamilySync: { clearCode: () => { log.calls.push("clearCode"); ls.delete("hannun_family_code"); }, saveCode: (c) => ls.set("hannun_family_code", c),
      fetchFamily: async (code) => { log.calls.push("fetchFamily"); if (o.fetchData instanceof Error) throw o.fetchData; return o.fetchData; } },
    HNRecords: { clearLocal: () => log.calls.push("records-clear"), use: (c) => log.calls.push("records-use:" + c) },
    hhEnabled: () => o.hhOn, hh: { hid: o.hhId, code: o.hhCode, view: "none" }, HouseholdSync: { stopListening: () => log.calls.push("hh-stop") },
    hhLoadSaved: () => { sb.hh.code = ls.get("hannun_household_code") || null; sb.hh.hid = ls.get("hannun_household_id") || null; log.calls.push("hh-load"); },
    hhStart: () => log.calls.push("hh-start"), hhRender: () => log.calls.push("hh-render"), hhResetEntryMessage: () => log.calls.push("hh-reset-msg"),
    populateDistricts: () => {}, syncOrderChips: () => {}, renderProvinceChips: () => {}, renderDistrictChips: () => {}, setBirthDatePicker: () => log.calls.push("picker"),
    setLandingStage: (s) => { sb.landingStage = s; log.calls.push("stage:" + s); },
    showLandingView: () => log.shown.push("landing"), showCalendarView: () => log.shown.push("calendar"),
    closeDetail: () => log.calls.push("closeDetail"), rememberChild: () => log.calls.push("remember"),
    loadChildren: () => [{}],
    onbMaybeOffer: () => {},
    ensureFamilyCode: async () => { log.calls.push("ensureFamilyCode"); if (o.ensureOk) sb.familyCode = "NEW123"; },
    buildAndRender: async () => log.calls.push("build"), profileFromPlain: (p) => ({ ...p, birthDate: new Date(2025, 0, 1) }), startListeningFamily: () => log.calls.push("listen"),
    HouseholdView: { classifyCode: () => ({ kind: "family" }) },
    hhSetEntryMessage() {},
  };
  sb.globalThis = sb;
  vm.createContext(sb);
  // 입력값: 폼 검증을 통과하는 기본값
  const form = { childName: "하준", birthDate: "2026-09-01", birthOrder: "first", province: "서울특별시", district: "구로구", familyCodeInput: "XYZ789" };
  Object.entries(form).forEach(([k, v]) => (mk(k).value = v));
  ["field-order", "field-region", "birthDateBtn", "btn-new-child-cancel", "new-child-note", "new-child-bar", "code-entry", "code-error"].forEach(mk);
  vm.runInContext(blockSrc + "\n" + submitSrc + "\n" + loadSrc + "\n;Object.assign(globalThis, { enterNewChildEntry, cancelNewChildEntry, applyNewChildReset, finishNewChildEntry, beginNewChildEntry, hhRestoreSaved, handleSubmit, handleLoadCode, fillFormFromProfile, getMode: () => newChildMode });", sb);
  const snap = () => JSON.stringify({ ls: [...ls.entries()].sort(), profile: sb.profile, familyCode: sb.familyCode, completed: sb.completed });
  return { sb, ls, log, els, o, snap };
}

console.log("입력 화면 진입·취소");
test("진입: 저장소·메모리(프로필·완료·가족코드)는 그대로, 랜딩만 열리고 취소 줄이 보이며 현재 아이가 아이 목록에 남는다", () => {
  const e = env();
  const before = e.snap();
  e.sb.enterNewChildEntry({ codeEntry: false });
  assert.strictEqual(e.snap(), before);
  assert.deepStrictEqual(e.log.shown, ["landing"]);
  assert.strictEqual(e.sb.getMode(), true);
  assert.ok(!e.els["new-child-bar"].cls.has("hidden") && e.els["btn-new-child-cancel"].textContent === "← 취소" && e.els["new-child-note"].textContent === "지금 아이 정보는 그대로 있어요.");
  assert.ok(e.log.calls.includes("remember") && e.log.calls.includes("stage:null") && e.log.calls.includes("form-reset"));
  assert.ok(!e.log.calls.some((c) => ["clearCode", "records-clear", "saveCompleted", "unsub"].includes(c)), "아무것도 지우지 않는다");
  assert.ok(e.els["code-entry"].cls.has("hidden"));
  const c = env(); c.sb.enterNewChildEntry({ codeEntry: true });
  assert.ok(!c.els["code-entry"].cls.has("hidden"));
});
test("취소: 저장소·메모리 불변(0 변화), 지금 아이 화면으로 복귀, 취소 줄·코드 입력창 숨김, 폼 칸을 지금 아이 값으로 복원", () => {
  const e = env();
  const before = e.snap();
  e.sb.enterNewChildEntry({ codeEntry: true });
  e.sb.cancelNewChildEntry();
  assert.strictEqual(e.snap(), before);
  assert.deepStrictEqual(e.log.shown, ["landing", "calendar"]);
  assert.strictEqual(e.sb.getMode(), false);
  assert.ok(e.els["new-child-bar"].cls.has("hidden") && e.els["code-entry"].cls.has("hidden"));
  assert.strictEqual(e.els["childName"].value, "은찬");
  assert.ok(!e.log.calls.some((c) => ["clearCode", "records-clear"].includes(c)));
});
test("취소 후 다시 취소하거나 모드 밖에서 취소해도 아무 일도 없다", () => {
  const e = env();
  e.sb.cancelNewChildEntry();
  assert.deepStrictEqual(e.log.shown, []);
});

console.log("저장·불러오기 시점에만 비운다");
test("저장(검증 통과): 그때 이전 아이의 로컬 상태를 비우고(프로필·완료·코드·구독·기록) 새 아이를 만든다 — 기존 handleReset 과 같은 순서", async () => {
  const e = env();
  e.sb.enterNewChildEntry({ codeEntry: false });
  e.log.calls.length = 0;
  await e.sb.handleSubmit({ preventDefault() {} });
  const order = e.log.calls.filter((c) => ["saveCompleted", "clearCode", "unsub", "records-clear", "records-use:null", "saveProfile", "build", "ensureFamilyCode"].includes(c));
  assert.deepStrictEqual(order, ["saveCompleted", "clearCode", "unsub", "records-clear", "records-use:null", "saveProfile", "build", "ensureFamilyCode"]);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(e.sb.completed)), {});
  assert.strictEqual(e.sb.profile.name, "하준");
  assert.strictEqual(e.sb.getMode(), false);
  assert.ok(e.els["new-child-bar"].cls.has("hidden"));
  assert.ok(e.log.shown.includes("calendar"));
});
test("검증 실패(이름 비움 등): 아무것도 지우지 않고 입력 모드 유지 — 이전 아이 그대로", async () => {
  const e = env();
  e.sb.enterNewChildEntry({ codeEntry: false });
  e.els["childName"].value = "";
  const before = e.snap();
  e.log.calls.length = 0;
  await e.sb.handleSubmit({ preventDefault() {} });
  assert.strictEqual(e.snap(), before);
  assert.strictEqual(e.sb.getMode(), true);
  assert.ok(!e.log.calls.some((c) => ["clearCode", "records-clear", "saveProfile"].includes(c)));
});
test("불러오기 성공: 성공한 시점에만 비우고(그 뒤 불러온 아이로 교체), 실패(없는 코드·예외)면 이전 아이 유지", async () => {
  const ok = env({ fetchData: { profile: { name: "둘째" }, completed: { X__y: { done: true } } } });
  ok.sb.enterNewChildEntry({ codeEntry: true });
  ok.log.calls.length = 0;
  await ok.sb.handleLoadCode();
  const i = (c) => ok.log.calls.indexOf(c);
  assert.ok(i("clearCode") >= 0 && i("fetchFamily") < i("clearCode"), "가져오기에 성공한 뒤에 비운다");
  assert.strictEqual(ok.sb.profile.name, "둘째");
  assert.strictEqual(ok.sb.getMode(), false);
  for (const fetchData of [null, { completed: {} }, new Error("offline")]) {
    const bad = env({ fetchData });
    bad.sb.enterNewChildEntry({ codeEntry: true });
    const before = bad.snap();
    bad.log.calls.length = 0;
    await bad.sb.handleLoadCode();
    assert.strictEqual(bad.snap(), before, String(fetchData));
    assert.strictEqual(bad.sb.getMode(), true);
    assert.ok(!bad.els["code-error"].cls.has("hidden"));
    assert.ok(!bad.log.calls.some((c) => ["clearCode", "records-clear"].includes(c)));
  }
});
test("입력 모드 밖(처음 사용자·일반 랜딩)의 저장·불러오기는 이전과 같다: 비우기 호출 없음", async () => {
  const e = env({ profile: null, familyCode: null, completed: {} });
  await e.sb.handleSubmit({ preventDefault() {} });
  assert.ok(!e.log.calls.includes("clearCode") && !e.log.calls.includes("records-clear"));
  const l = env({ fetchData: { profile: { name: "가져옴" }, completed: {} }, profile: null, familyCode: null, completed: {} });
  await l.sb.handleLoadCode();
  assert.ok(!l.log.calls.includes("clearCode") && !l.log.calls.includes("records-clear") && l.sb.profile.name === "가져옴");
});

console.log("가족코드 없는 오프라인 아이 보호");
test("코드가 없으면 먼저 코드를 만들고(서버 백업) 성공하면 입력 화면에 들어간다", async () => {
  const e = env({ familyCode: null, ensureOk: true });
  await e.sb.beginNewChildEntry({ codeEntry: false });
  assert.ok(e.log.calls.includes("ensureFamilyCode"));
  assert.strictEqual(e.sb.getMode(), true);
  assert.ok(e.log.shown.includes("landing"));
});
test("코드를 못 만들면(오프라인) 입력 화면에 들어가지 않고 안내만 — 저장소·메모리 불변, 아무것도 지우지 않음", async () => {
  const e = env({ familyCode: null, ensureOk: false });
  const before = e.snap();
  await e.sb.beginNewChildEntry({ codeEntry: true });
  assert.strictEqual(e.snap(), before);
  assert.strictEqual(e.sb.getMode(), false);
  assert.deepStrictEqual(e.log.shown, []);
  const html = e.els["modal-content"].innerHTML;
  assert.ok(html.includes("지금은 새 아이를 추가할 수 없어요") && html.includes("인터넷에 연결되어 있지 않아 지금 아이 정보를 안전하게 저장해 둘 수 없어요. 연결된 뒤에 다시 시도해 주세요."));
  assert.ok(!e.log.calls.some((c) => ["clearCode", "records-clear", "saveCompleted"].includes(c)));
});
test("코드가 이미 있는 아이는 코드 생성 시도 없이 바로 입력 화면", async () => {
  const e = env();
  await e.sb.beginNewChildEntry({ codeEntry: false });
  assert.ok(!e.log.calls.includes("ensureFamilyCode") && e.sb.getMode());
});

console.log("가구 연결 복원(입력 중 다른 가구에 참여했다가 취소)");
test("가구가 바뀌었으면 취소 시 입력 화면에 들어올 때의 가구(code·id)로 되돌리고 다시 듣기 시작한다", () => {
  const e = env({ hhOn: true, hhId: "H1", hhCode: "AAAA1111" });
  e.sb.enterNewChildEntry({ codeEntry: true });
  // 입력 중 다른 가구에 참여한 것과 같은 상태 변화(hhSetJoined)
  e.sb.hh.hid = "H2"; e.sb.hh.code = "BBBB2222"; e.ls.set("hannun_household_id", "H2"); e.ls.set("hannun_household_code", "BBBB2222");
  e.log.calls.length = 0;
  e.sb.cancelNewChildEntry();
  assert.deepStrictEqual([e.ls.get("hannun_household_id"), e.ls.get("hannun_household_code"), e.sb.hh.hid, e.sb.hh.code], ["H1", "AAAA1111", "H1", "AAAA1111"]);
  assert.ok(e.log.calls.includes("hh-stop") && e.log.calls.includes("hh-start"));
});
test("가구가 없던 기기가 입력 중 참여했다가 취소하면 가구 연결을 지운다, 가구가 그대로면 아무것도 하지 않는다", () => {
  const e = env({ hhOn: true });
  e.sb.enterNewChildEntry({ codeEntry: true });
  e.sb.hh.hid = "H2"; e.sb.hh.code = "BBBB2222"; e.ls.set("hannun_household_id", "H2"); e.ls.set("hannun_household_code", "BBBB2222");
  e.sb.cancelNewChildEntry();
  assert.deepStrictEqual([e.ls.has("hannun_household_id"), e.ls.has("hannun_household_code"), e.sb.hh.hid], [false, false, null]);
  const same = env({ hhOn: true, hhId: "H1", hhCode: "AAAA1111" });
  same.sb.enterNewChildEntry({ codeEntry: false });
  const before = same.snap();
  same.log.calls.length = 0;
  same.sb.cancelNewChildEntry();
  assert.strictEqual(same.snap(), before);
  assert.ok(!same.log.calls.includes("hh-stop"));
});
test("가구 플래그 OFF 면 스냅샷·복원 모두 가구 저장소를 건드리지 않는다", () => {
  const e = env({ hhOn: false, hhId: "H1", hhCode: "AAAA1111" });
  e.sb.enterNewChildEntry({ codeEntry: false });
  e.ls.set("hannun_household_id", "H9");
  e.sb.cancelNewChildEntry();
  assert.strictEqual(e.ls.get("hannun_household_id"), "H9");
  assert.ok(!e.log.calls.includes("hh-stop"));
});

console.log("기존 동작 동일·연결(이전 커밋 소스 대비)");
test("applyNewChildReset 은 기존 handleReset 의 데이터 부분과 글자까지 같다(화면 전환 줄만 빠짐)", () => {
  const old = fnSrc(headApp, "handleReset");
  const stripped = old.replace('    el("query-form").reset();\n    setLandingStage(null);\n    updateBrandText();\n    showLandingView();\n', "").replace("function handleReset()", "function applyNewChildReset()").replace("  function applyNewChildReset() {", "  function applyNewChildReset() {");
  const now = fnSrc(app, "applyNewChildReset").replace("  /** 이전 아이의 로컬 상태 비우기(기존 handleReset 의 데이터 부분). 화면 전환은 하지 않는다. */\n", "");
  assert.strictEqual(now, stripped);
});
test("handleReset 호출은 더 이상 없고, 두 진입점(새 아이 시트·가족코드로 불러오기)이 beginNewChildEntry 로 연결되며 취소 버튼이 연결된다", () => {
  assert.ok(!/handleReset\(/.test(app.replace(/\/\*\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")));
  assert.ok(app.includes('el("btn-confirm-new-child").addEventListener("click", () => beginNewChildEntry({ codeEntry: false }));'));
  assert.ok(app.includes('el("btn-child-code").addEventListener("click", () => beginNewChildEntry({ codeEntry: true }));'));
  assert.ok(app.includes('el("btn-new-child-cancel").addEventListener("click", cancelNewChildEntry);'));
  const html = read("index.html");
  assert.ok(html.includes('id="btn-new-child-cancel"') && html.includes('id="new-child-bar" class="new-child-bar hidden"'));
});
test("handleSubmit·handleLoadCode: 입력 모드 확인 한 줄씩만 추가됐다", () => {
  const strip = (s, re) => s.replace(re, "");
  // 온보딩 가족 단계 훅(첫 아이 기록 3줄·await·onbMaybeOffer)도 함께 걷어 낸 뒤 비교한다
  const noOnb = strip(strip(strip(submitSrc, /    const wasNewChildMode = newChildMode;\n/), /    \/\/ 온보딩 가족 단계:[^\n]*\n    const onbFirstChild[^\n]*\n/), /\n    onbMaybeOffer\(!onbFirstChild\);/).replace("    await ensureFamilyCode();", "    ensureFamilyCode();");
  assert.strictEqual(strip(noOnb, /    \/\/ N1:[^\n]*\n    if \(newChildMode\) finishNewChildEntry\(\);\n/), fnSrc(headApp, "handleSubmit", "  async function "));
  // H1: 계정 모드에서는 입력칸이 없어 가족코드 분기를 건너뛴다(!acctEnabled()) — 비교 전에 되돌린다
  assert.strictEqual(strip(loadSrc, /      if \(newChildMode\) finishNewChildEntry\(\);[^\n]*\n/).replace("if (hhEnabled() && !acctEnabled()) {", "if (hhEnabled()) {").replace(/ \/\/ 계정 모드: 입력칸은[^\n]*\n/, "\n"), fnSrc(headApp, "handleLoadCode", "  async function "));
});
test("저장소 키 상수: HH_CODE_KEY 는 household-sync.js 의 CODE_KEY 와 같다", () => {
  const hs = require("../js/household-sync.js");
  assert.ok(app.includes(`const HH_CODE_KEY = "${hs.CODE_KEY}";`));
});
test("스키마·규칙·AUTO 계산·가구 동기화·완료 동기화 파일은 이 작업에서 바뀌지 않았다", () => {
  const changed = execSync(`git diff --name-only ${BASE} 90c9740`, { cwd: ROOT, encoding: "utf8" }).split("\n");
  ["firestore.rules", "js/user-schedule.js", "js/calendar-model.js", "js/hn-logic.js", "js/todo-engine.js", "js/schedule.js", "js/sync.js", "js/household-sync.js"].forEach((f) => assert.ok(!changed.includes(f), f));
});

Promise.all(pending).then(() => console.log(`\n${passed}개 통과${process.exitCode ? ", 일부 실패" : ""}`));
