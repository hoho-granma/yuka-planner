/* G16 로그인 직후 아이 입력 폼에 남지 않는 경로 + 계정 모드 입력 폼 안내문. 실행: node test/g16-login-home-paths.test.js */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const AV = require("../js/account-view.js");
const APP = fs.readFileSync(path.join(__dirname, "..", "js/app.js"), "utf8");
let passed = 0;
async function test(name, f) { try { await f(); passed++; console.log("  ok  - " + name); } catch (e) { process.exitCode = 1; console.log("  FAIL- " + name + "\n      " + (e.stack || e).split("\n").slice(0, 4).join("\n      ")); } }
function fn(name, async_) { const i = APP.indexOf(`  ${async_ ? "async " : ""}function ${name}(`); assert.ok(i >= 0, name); return APP.slice(i, APP.indexOf("\n  }\n", i) + 4); }

function setup(o) {
  const hidden = { landing: 0, cal: 1, bar: 0, empty: 1 };
  const mk = (k) => ({ classList: { add: (c) => c === "hidden" && (hidden[k] = 1), remove: (c) => c === "hidden" && (hidden[k] = 0), contains: (c) => c === "hidden" && !!hidden[k] } });
  const els = { "view-landing": mk("landing"), "view-calendar": mk("cal"), "new-child-bar": mk("bar"), "empty-panel": { ...mk("empty"), innerHTML: "" } };
  const sheets = [];
  const sb = {
    profile: null, newChildMode: false, emptyHome: false, currentTab: "home", TAB_NAMES: [], RESTORE: 0,
    hh: { code: o.hhCode || "" },
    acct: { user: { uid: "u1", displayName: "주연" }, account: null, sync: o.noSync ? null : { restore: async () => o.restore }, recoverShown: false },
    el: (id) => els[id], document: { querySelectorAll: () => [] }, window: { scrollTo() {} }, AccountView: AV, console,
    acctExpecting: () => false, acctEnabled: () => true, buildAndRender: async () => {}, acctRenderMeLine() {},
    acctReadIntent: () => null, acctShowSheet: (m) => sheets.push(m), acctFinishSignup: async () => {}, acctRenderSlot() {}, acctRefreshCalendar() {}, acctMaybeShowMigrate() {},
    acctAfterHousehold: async () => {}, acctPlanKids: async () => {}, hhSetJoined() {}, acctDeviceKids: () => [],
    HouseholdSync: { joinHousehold: async () => o.join || { ok: false } },
  };
  vm.createContext(sb);
  vm.runInContext([fn("showCalendarView"), fn("emptyRender"), fn("showEmptyHome"), fn("hideEmptyHome"), fn("acctGoHome", true), fn("acctRestore", true)].join("\n"), sb);
  return { sb, hidden, els, sheets };
}
const emptyHomeShown = (t) => t.hidden.landing === 1 && t.hidden.empty === 0 && t.els["empty-panel"].innerHTML.includes('data-acct-action="empty-register"');

(async () => {
  await test("① Auth 계정은 있는데 accounts 문서가 없다 → 복구 시트 + 빈 홈(아이 입력 폼 숨김)", async () => {
    const t = setup({ restore: { ok: true, account: null } });
    await t.sb.acctRestore({ uid: "u1" });
    assert.deepStrictEqual(t.sheets, ["recover"]);
    assert.ok(emptyHomeShown(t));
  });
  await test("② accounts 의 가구가 없다(가입 실패·삭제) → 빈 홈", async () => {
    const t = setup({ restore: { ok: true, account: { householdCode: "GONE0000" } }, join: { ok: false } });
    await t.sb.acctRestore({ uid: "u1" });
    assert.ok(emptyHomeShown(t));
  });
  await test("③ 가구는 있는데 아이가 없다 → 빈 홈", async () => {
    const t = setup({ restore: { ok: true, account: { householdCode: "A8RZ7Q9X" } }, join: { ok: true, householdId: "h1" } });
    await t.sb.acctRestore({ uid: "u1" });
    assert.ok(emptyHomeShown(t));
  });
  await test("④ 복원 실패(규칙 미배포·오프라인) 또는 계정 동기화 모듈 없음 → 빈 홈", async () => {
    const a = setup({ restore: { ok: false } }); await a.sb.acctRestore({ uid: "u1" }); assert.ok(emptyHomeShown(a));
    const b = setup({ noSync: true }); await b.sb.acctRestore({ uid: "u1" }); assert.ok(emptyHomeShown(b));
  });
  await test("⑤ 화면 갱신 함수가 던져도 홈 이동은 일어난다", async () => {
    const t = setup({ restore: { ok: true, account: null } });
    t.sb.acctRefreshCalendar = () => { throw new Error("boom"); };
    t.sb.console = { error() {} };
    await t.sb.acctRestore({ uid: "u1" });
    assert.ok(emptyHomeShown(t));
  });
  await test("⑥ 계정 모드 시작(acctInit)에서 입력 폼 안내문을 중립 문구로 바꾼다(OFF 원문은 index.html 에만)", () => {
    assert.ok(APP.includes('el("entry-fine-print").textContent = AccountView.MSG.onboard.formNote'));
    assert.ok(!/가입 없이|가입하지 않아도/.test(AV.MSG.onboard.formNote));
    assert.ok(fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8").includes("회원가입 없이 바로 시작해요"), "OFF 화면 원문 유지");
  });
  await test("⑦ 로그인 직후 복원이 느리면 끝날 때까지 스플래시가 덮고(입력 폼이 비치지 않음), 끝나면 걷고 빈 홈", async () => {
    const t = setup({ restore: { ok: true, account: { householdCode: "A8RZ7Q9X" } }, join: { ok: true, householdId: "h1" } });
    let release; const gate = new Promise((r) => (release = r));
    t.sb.acct.sync.restore = async () => { await gate; return { ok: true, account: { householdCode: "A8RZ7Q9X" } }; };
    const splash = { on: false };
    Object.assign(t.sb, { RESTORE_MAX_MS: 10000, acctRestoreSlow() {}, acctSplashShow: () => (splash.on = true), acctSplashArm() {}, acctSplashHide: () => (splash.on = false) });
    vm.runInContext([fn("acctLoginRestore"), fn("acctRestoreThenHide")].join("\n"), t.sb);
    const p = t.sb.acctLoginRestore({ uid: "u1" });
    await new Promise((r) => setImmediate(r));
    assert.ok(splash.on === true && t.hidden.landing === 0, "복원 대기 중: 스플래시가 덮고 있다(입력 폼 뒤에 있음)");
    release();
    await p;
    assert.ok(splash.on === false && emptyHomeShown(t), "복원 뒤: 스플래시를 걷고 빈 홈");
  });
  for (const order of ["Auth 콜백 먼저", "signIn 응답 먼저"]) {
    await test(`⑨ 복원 지연 중 두 번째 호출이 스플래시를 걷지 않는다 — ${order}`, async () => {
      const t = setup({ restore: { ok: true, account: { householdCode: "A8RZ7Q9X" } }, join: { ok: true, householdId: "h1" } });
      let release; const gate = new Promise((r) => (release = r));
      t.sb.acct.sync.restore = async () => { await gate; return { ok: true, account: { householdCode: "A8RZ7Q9X" } }; };
      const splash = { on: false };
      Object.assign(t.sb, { RESTORE_MAX_MS: 10000, acctRestoreSlow() {}, acctSplashShow: () => (splash.on = true), acctSplashArm() {}, acctSplashHide: () => (splash.on = false) });
      vm.runInContext([fn("acctLoginRestore"), fn("acctRestoreThenHide")].join("\n"), t.sb);
      const u = { uid: "u1" };
      const first = order === "signIn 응답 먼저" ? t.sb.acctLoginRestore(u) : (t.sb.acctSplashShow(), t.sb.acctRestoreThenHide(u));
      await new Promise((r) => setImmediate(r));
      const second = order === "signIn 응답 먼저" ? t.sb.acctRestoreThenHide(u) : t.sb.acctLoginRestore(u);
      await new Promise((r) => setImmediate(r));
      assert.ok(splash.on === true && t.hidden.landing === 0, "지연 중: 스플래시 유지(입력 폼 노출 없음)");
      release();
      await Promise.all([first, second]);
      assert.ok(splash.on === false && emptyHomeShown(t), "끝나면 걷고 빈 홈");
    });
  }
  await test("⑩ onChange 는 acctRestoreThenHide 를 쓴다(정적)", () => {
    assert.ok(APP.includes("if (u) acctRestoreThenHide(u);") && !APP.includes("Promise.resolve(acctRestore(u)).then(acctSplashHide, acctSplashHide)"));
  });
  await test("⑧ 로그인 제출은 acctLoginRestore 를, 가입 마무리는 acctGoHome 을 부른다(정적)", () => {
    assert.ok(APP.includes("acctLoginRestore(r.user);"));
    const tail = APP.slice(APP.indexOf("async function acctSignupTail"), APP.indexOf("async function acctOnClick"));
    assert.ok(tail.includes("await acctGoHome()"));
  });
  console.log(`\n${passed}개 통과`);
})();
