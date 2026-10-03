/* G8 로그아웃/새로고침/재실행: 계정 모드에서 로그인하지 않은 상태는 항상 첫 화면(온보딩). 기기의 아이 데이터는 그대로. 실행: node test/g8-logout-onboarding.test.js */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const APP = fs.readFileSync(path.join(__dirname, "..", "js/app.js"), "utf8");
let passed = 0;
async function test(name, fn) { try { await fn(); passed++; console.log("  ok  - " + name); } catch (e) { process.exitCode = 1; console.log("  FAIL- " + name + "\n      " + (e.stack || e).split("\n").slice(0, 4).join("\n      ")); } }
function fn(name) { const i = APP.indexOf(`  function ${name}(`); assert.ok(i >= 0, name); return APP.slice(i, APP.indexOf("\n  }\n", i) + 4); }

// 실제 소스(showCalendarView·showLandingView·acctGateHome·acctInit)를 가짜 화면·가짜 Auth 로 돌린다.
function boot(opts) {
  const view = { landing: opts.landingHidden ? 1 : 0, cal: opts.landingHidden ? 0 : 1 };
  const mk = (key) => ({ classList: { add: (c) => c === "hidden" && (view[key] = 1), remove: (c) => c === "hidden" && (view[key] = 0), contains: (c) => c === "hidden" && !!view[key] } });
  const els = { "view-landing": mk("landing"), "view-calendar": mk("cal") };
  els["view-landing"] = (() => { const o = mk("landing"); return o; })();
  const ls = new Map(opts.signedOut ? [["hannun_acct_signed_out", "1"]] : []);
  let cb = null; const log = []; const store = { profile: opts.profile };
  const sb = {
    localStorage: { getItem: (k) => (ls.has(k) ? ls.get(k) : null), setItem: (k, v) => ls.set(k, String(v)), removeItem: (k) => ls.delete(k) },
    acct: { svc: null, user: opts.user || null, pendingLink: opts.pendingLink || null },
    newChildMode: false, hh: {}, AccountSync: undefined,
    el: (id) => els[id] || null, window: { scrollTo() {} },
    acctEnabled: () => true, acctJoinLinkStart: () => false, acctRenderLanding: () => log.push("landing-card"), acctRenderSlot() {},
    acctApplyLandingMode() {}, previewRender() {}, hideEmptyHome: () => log.push("hide-empty"), acctOpenLinkSignup: () => log.push("link-sheet"), acctRestore() {},
    AuthService: { create: () => ({ onChange: (f) => (cb = f), signOut: async () => ({ ok: true }) }) }, HouseholdSync: { firestoreAdapter: () => ({}) }, firebase: {}, console,
  };
  vm.createContext(sb);
  vm.runInContext(["const SIGNED_OUT_KEY = \"hannun_acct_signed_out\";", fn("showCalendarView"), fn("showLandingView"), fn("acctSignedOutMark"), fn("acctGateHome"), fn("acctInit")].join("\n"), sb);
  return { sb, view, log, fire: (u, info) => cb(u, info), ls, store };
}
(async () => {
  await test("로그아웃 순서: 홈(로그인 상태) → signOut → onAuthStateChanged(null) → 첫 화면, 아이 프로필은 그대로", async () => {
    const t = boot({ profile: { name: "은찬" }, user: { uid: "u1" } });
    t.sb.acctInit(); t.fire({ uid: "u1" }); t.sb.showCalendarView();
    assert.deepStrictEqual([t.view.landing, t.view.cal], [1, 0]);
    await t.sb.acct.svc.signOut(); t.fire(null);
    assert.deepStrictEqual([t.view.landing, t.view.cal], [0, 1], "랜딩 보임·캘린더 숨김");
    assert.deepStrictEqual(t.store.profile, { name: "은찬" });
  });
  await test("새로고침/재실행: 기기에 아이가 있어 캘린더가 먼저 그려져도 인증이 '로그인 없음'으로 확인되면 첫 화면", () => {
    const t = boot({ profile: { name: "은찬" } });
    t.sb.acctInit(); t.sb.showCalendarView(); // init() 이 프로필 때문에 캘린더를 띄운 상태
    assert.strictEqual(t.view.cal, 0);
    t.fire(null);
    assert.deepStrictEqual([t.view.landing, t.view.cal], [0, 1]);
  });
  await test("인증이 렌더보다 먼저 끝난 경우(null 먼저 → 그 뒤 init 이 캘린더를 띄움)도 acctGateHome 으로 첫 화면", () => {
    const t = boot({ profile: { name: "은찬" } });
    t.sb.acctInit(); t.fire(null); t.sb.showCalendarView(); t.sb.acctGateHome();
    assert.deepStrictEqual([t.view.landing, t.view.cal], [0, 1]);
  });
  await test("로그인된 기기는 홈 그대로, 인증 확인 전에는 화면을 옮기지 않는다, 아이 추가 입력 중에는 그대로", () => {
    const a = boot({ profile: {} }); a.sb.acctInit(); a.sb.showCalendarView(); a.sb.acctGateHome();
    assert.strictEqual(a.view.cal, 0, "인증 확인 전엔 그대로");
    a.fire({ uid: "u1" }); assert.deepStrictEqual([a.view.landing, a.view.cal], [1, 0]);
    const b = boot({ profile: {} }); b.sb.acctInit(); b.sb.showCalendarView(); b.sb.newChildMode = true; b.fire(null);
    assert.strictEqual(b.view.cal, 0);
  });
  await test("초대 링크: 로그아웃 상태로 들어오면 첫 화면 위에 가입 시트가 열린다", () => {
    const t = boot({ profile: {}, pendingLink: { code: "X" } });
    t.sb.acctInit(); t.sb.showCalendarView(); t.fire(null);
    assert.ok(t.log.includes("link-sheet") && t.view.cal === 1);
  });
  await test("OFF: acctInit 은 아무 것도 하지 않고(acctEnabled false) 화면을 옮기지 않는다", () => {
    const t = boot({ profile: {} }); t.sb.acctEnabled = () => false; t.sb.acctInit(); t.sb.showCalendarView(); t.sb.acctGateHome();
    assert.strictEqual(t.view.cal, 0);
  });
  await test("① 로그인했던 기기 + SDK 로드 실패(확인 불가) → 홈 유지(온보딩으로 쫓겨나지 않는다)", () => {
    const t = boot({ profile: { name: "은찬" } });
    t.sb.acctInit(); t.sb.showCalendarView(); t.fire(null, { unknown: true });
    assert.deepStrictEqual([t.view.landing, t.view.cal], [1, 0]);
  });
  await test("② 로그아웃한 기기('signedOut' 표시) + SDK 로드 실패 → 온보딩, 표시는 로그아웃 때 남고 로그인하면 지워진다", () => {
    const t = boot({ profile: { name: "은찬" }, signedOut: true });
    t.sb.acctInit(); t.sb.showCalendarView(); t.fire(null, { unknown: true });
    assert.deepStrictEqual([t.view.landing, t.view.cal], [0, 1]);
    t.fire({ uid: "u1" });
    assert.strictEqual(t.ls.has("hannun_acct_signed_out"), false);
    assert.ok(/acctSignedOutMark\(true\)/.test(APP.slice(APP.indexOf('action === "logout"'), APP.indexOf('action === "migrate-add"'))));
  });
  await test("AuthService.onChange: 어댑터(SDK) 로드 실패면 cb(null, {unknown:true}) — 정상 로그아웃 cb(null)과 구분", async () => {
    const AS = require("../js/auth-service.js"); const seen = [];
    const s = AS.create({ features: () => ({ accounts: true }), loadSdk: () => Promise.reject(new Error("sdk")), firebase: {} });
    s.onChange((u, info) => seen.push([u, info && info.unknown === true]));
    await new Promise((r) => setTimeout(r, 20));
    assert.deepStrictEqual(seen, [[null, true]]);
  });
  console.log(`\n${passed}개 통과`);
})();
