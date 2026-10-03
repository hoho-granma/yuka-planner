/* G19 계정 모드(기본 ON)에서는 옛 상황 선택 화면(임신 중/아이가 태어났어요)이 어떤 순간에도 그려지지 않는다. 실행: node test/g19-no-stage-screen.test.js */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const read = (f) => fs.readFileSync(path.join(__dirname, "..", f), "utf8");
const HTML = read("index.html"), CSS = read("css/style.css"), APP = read("js/app.js");
let passed = 0;
function test(name, f) { try { f(); passed++; console.log("  ok  - " + name); } catch (e) { process.exitCode = 1; console.log("  FAIL- " + name + "\n      " + (e.stack || e).split("\n").slice(0, 4).join("\n      ")); } }

const bootClass = (store, throwing) => {
  const m = HTML.match(/<script>\/\* G19:[\s\S]*?<\/script>/);
  assert.ok(m, "head 부팅 스크립트");
  const cls = new Set();
  const sb = { localStorage: { getItem: (k) => { if (throwing) throw new Error("x"); return k in store ? store[k] : null; } }, document: { documentElement: { classList: { add: (c) => cls.add(c) } } } };
  vm.createContext(sb);
  vm.runInContext(m[0].replace(/^<script>|<\/script>$/g, ""), sb);
  return [...cls];
};
test("첫 그림 전 head 스크립트: 저장소가 비어 있거나 접근이 막혀도 계정 기본 ON 클래스, accounts='0' 일 때만 붙지 않는다(OFF)", () => {
  assert.deepStrictEqual(bootClass({}), ["hnacc-default"]);
  assert.deepStrictEqual(bootClass({}, true), ["hnacc-default"]);
  assert.deepStrictEqual(bootClass({ hannun_feature_accounts: "1" }), ["hnacc-default"]);
  assert.deepStrictEqual(bootClass({ hannun_feature_accounts: "0" }), []);
  assert.ok(HTML.indexOf("G19:") < HTML.indexOf('css/style.css'), "스타일 시트보다 먼저");
});
test("CSS: 계정 기본 ON 클래스가 있으면 제목·상황 선택·뒤로·미리 써 보기를 항상 숨긴다(!important, G14 블록보다 앞)", () => {
  const i = CSS.indexOf("html.hnacc-default #view-landing > .hero");
  assert.ok(i > 0 && i < CSS.indexOf("/* ===== G14:"));
  const rule = CSS.slice(i, CSS.indexOf("}", i));
  ["#stage-choice", "#btn-stage-back", "#beta-preview-slot", "display: none !important"].forEach((t) => assert.ok(rule.includes(t), t));
  assert.ok(/#view-landing\.acct-on > \.hero, #view-landing\.acct-on #stage-choice/.test(CSS), "기존 acct-on 규칙도 유지");
});
test("acctInit 은 계정 모드가 확인되면 곧바로(인증 응답을 기다리지 않고) view-landing 에 acct-on 을 붙인다", () => {
  const blk = APP.slice(APP.indexOf("function acctInit()"), APP.indexOf("acct.svc = AuthService.create();"));
  assert.ok(blk.indexOf("if (!acctEnabled()) return;") < blk.indexOf('classList.add("acct-on")'));
});
test("상황 선택 화면을 그리는 유일한 경로(setLandingStage)는 hidden 토글뿐이라 acct-on/기본 ON CSS 의 !important 를 이기지 못한다(정적)", () => {
  const f = APP.slice(APP.indexOf("function setLandingStage("), APP.indexOf("async function handleSubmit"));
  assert.ok(f.includes('el("stage-choice").classList.toggle("hidden", !!stage)'));
  assert.ok(!/stage-choice"\)\.style|stage-choice[^\n]*display/.test(APP), "인라인 display 로 되살리는 코드가 없다");
});
test("OFF 기본 경로(accounts='0')의 옛 첫 화면 마크업은 그대로(index.html 에 상황 선택 존재)", () => {
  assert.ok(HTML.includes('id="stage-choice"') && HTML.includes("임신 중이에요") && HTML.includes("아이가 태어났어요"));
});

// ── 가입·로그인 직후 지연 + 콜백 순서: view-landing 이 비치지 않는다(스플래시가 홈이 그려질 때까지 유지) ──
const AV = require("../js/account-view.js");
function fnA(name, async_) { const i = APP.indexOf(`  ${async_ ? "async " : ""}function ${name}(`); assert.ok(i >= 0, name); return APP.slice(i, APP.indexOf("\n  }\n", i) + 4); }
function world(o) {
  const hidden = { landing: 0, cal: 1, bar: 0, empty: 1 };
  const mk = (k) => ({ classList: { add: (c) => c === "hidden" && (hidden[k] = 1), remove: (c) => c === "hidden" && (hidden[k] = 0), contains: (c) => c === "hidden" && !!hidden[k] } });
  const els = { "view-landing": mk("landing"), "view-calendar": mk("cal"), "new-child-bar": mk("bar"), "empty-panel": { ...mk("empty"), innerHTML: "" } };
  const splash = { on: false }; const spEl = { remove: () => (splash.on = false) };
  const exposed = []; // 스플래시도 없고 입력 폼(view-landing)이 보이는 순간
  const probe = (tag) => { if (hidden.landing === 0 && !splash.on) exposed.push(tag); };
  const sb = {
    console, setTimeout, profile: null, newChildMode: false, emptyHome: false, currentTab: "home", TAB_NAMES: [], RESTORE_MAX_MS: 10000,
    hh: { code: "" }, acct: { user: { uid: "u1" }, account: null, sync: { restore: async () => { await o.restoreGate; return { ok: true, account: { householdCode: "A8RZ7Q9X" } }; } }, busy: true, restoring: false, completing: false },
    el: (id) => (id === "acct-splash" && splash.on ? spEl : els[id]), document: { querySelectorAll: () => [] }, window: { scrollTo() {} }, AccountView: AV,
    acctExpecting: () => false, acctEnabled: () => true, buildAndRender: async () => {}, acctRenderMeLine() {}, acctReadIntent: () => null, acctShowSheet() {}, acctRenderSlot() {}, acctRefreshCalendar() {}, acctMaybeShowMigrate() {},
    acctAfterHousehold: async () => {}, acctPlanKids: async () => {}, hhSetJoined() {}, acctDeviceKids: () => [], HouseholdSync: { joinHousehold: async () => ({ ok: false }) },
    acctSplashShow: () => (splash.on = true), acctSplashArm() {}, acctRestoreSlow() { sb.acct.splashHold = false; sb.acctSplashHide(); },
    acctRenderLanding: () => probe("renderLanding"), closeDetail: () => probe("closeDetail"), acctFinishSignup: async () => { await o.finishGate; return o.fin || { ok: true }; },
    localStorage: { setItem() {} }, ACCT_INTENT_KEY: "k",
  };
  vm.createContext(sb);
  vm.runInContext("let acctSplashTimer = null;\n" + [fnA("showCalendarView"), fnA("emptyRender"), fnA("showEmptyHome"), fnA("hideEmptyHome"), fnA("acctGoHome", true), fnA("acctRestore", true), fnA("acctRestoreThenHide"), fnA("acctLoginRestore", true), fnA("acctSplashHold"), fnA("acctSplashRelease"), fnA("acctSplashHide"), fnA("acctSignupTail", true)].join("\n"), sb);
  return { sb, hidden, splash, exposed, probe };
}
const tick = () => new Promise((r) => setImmediate(r));
const defer = () => { let f; const p = new Promise((r) => (f = r)); return [p, f]; };
(async () => {
  await (async () => {
    const name = "가입 직후(가구 생성·accounts 쓰기 3초 지연 모사): 지연 내내 스플래시가 덮고, 끝나면 빈 홈 — view-landing 이 한 번도 노출되지 않는다";
    try {
      const [finishGate, finish] = defer(); const [restoreGate, rest] = defer();
      const w = world({ finishGate, restoreGate });
      const p = w.sb.acctSignupTail({ displayName: "주연" });
      await tick(); w.probe("during-finish");
      await w.sb.acctRestoreThenHide({ uid: "u1" }); // 가입 중 도착한 Auth 콜백(acct.busy 라 복원은 건너뜀)이 스플래시를 걷지 못한다
      w.probe("after-callback");
      assert.strictEqual(w.splash.on, true);
      finish(); rest(); await p; w.probe("end");
      assert.deepStrictEqual(w.exposed, [], "노출 순간: " + w.exposed.join(","));
      assert.ok(w.hidden.landing === 1 && w.hidden.empty === 0 && w.splash.on === false);
      passed++; console.log("  ok  - " + name);
    } catch (e) { process.exitCode = 1; console.log("  FAIL- " + name + "\n      " + (e.stack || e).split("\n").slice(0, 4).join("\n      ")); }
  })();
  await (async () => {
    const name = "가입 실패(서버 오류)면 스플래시를 풀고 시트로 돌려보낸다";
    try {
      const [finishGate, finish] = defer(); const w = world({ finishGate, restoreGate: Promise.resolve(), fin: { ok: false } });
      const p = w.sb.acctSignupTail({}); await tick(); assert.strictEqual(w.splash.on, true); finish(); await p;
      assert.strictEqual(w.splash.on, false);
      passed++; console.log("  ok  - " + name);
    } catch (e) { process.exitCode = 1; console.log("  FAIL- " + name + "\n      " + (e.stack || e).split("\n").slice(0, 4).join("\n      ")); }
  })();
  for (const order of ["Auth 콜백 먼저", "signIn 응답 먼저"]) {
    const name = `로그인 직후(복원 3초 지연 모사) — ${order}: 지연 내내 스플래시, 끝나면 빈 홈, view-landing 노출 없음`;
    try {
      const [restoreGate, rest] = defer(); const w = world({ restoreGate, finishGate: Promise.resolve() });
      w.sb.acct.busy = false;
      let p1, p2;
      if (order === "Auth 콜백 먼저") { p1 = w.sb.acctRestoreThenHide({ uid: "u1" }); await tick(); p2 = w.sb.acctLoginRestore({ uid: "u1" }); }
      else { p1 = w.sb.acctLoginRestore({ uid: "u1" }); await tick(); p2 = w.sb.acctRestoreThenHide({ uid: "u1" }); }
      await tick(); w.probe("during"); assert.strictEqual(w.splash.on, true);
      rest(); await Promise.all([p1, p2]); await tick(); w.probe("end");
      assert.deepStrictEqual(w.exposed, [], "노출 순간: " + w.exposed.join(","));
      assert.ok(w.hidden.landing === 1 && w.hidden.empty === 0 && w.splash.on === false);
      passed++; console.log("  ok  - " + name);
    } catch (e) { process.exitCode = 1; console.log("  FAIL- " + name + "\n      " + (e.stack || e).split("\n").slice(0, 4).join("\n      ")); }
  }
  console.log(`\n${passed}개 통과(비동기 포함)`);
})();
