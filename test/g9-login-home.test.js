/* G9 로그인 직후: 첫 화면(옛 아이 입력 화면 '가입 없이 먼저 써 볼게요')에 남지 않고 홈으로. 실행: node test/g9-login-home.test.js */
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
  hidden.cal = 1; hidden.landing = 0; // 로그아웃 상태 첫 화면
  const els = { "view-landing": mk("landing"), "view-calendar": mk("cal"), "new-child-bar": mk("bar"), "empty-panel": { ...mk("empty"), innerHTML: "" } };
  const log = [];
  const sb = {
    profile: o.profile || null, newChildMode: !!o.newChildMode, emptyHome: false, currentTab: "home", TAB_NAMES: [],
    acct: { user: { uid: "u1", displayName: "주연" }, account: o.account || null }, el: (id) => els[id], document: { querySelectorAll: () => [] }, window: { scrollTo() {} },
    AccountView: AV, acctExpecting: () => false, acctEnabled: () => true, buildAndRender: async () => log.push("render"), acctRenderMeLine: () => log.push("me-line"), console,
  };
  vm.createContext(sb);
  vm.runInContext([fn("showCalendarView"), fn("emptyRender"), fn("showEmptyHome"), fn("hideEmptyHome"), fn("acctGoHome", true)].join("\n"), sb);
  return { sb, hidden, els, log };
}
(async () => {
  await test("재현① 아이가 있는 기기: 로그아웃 상태 첫 화면 → 로그인 → 캘린더 홈(첫 화면 숨김, 내 이름 줄 갱신)", async () => {
    const t = setup({ profile: { name: "은찬" } });
    await t.sb.acctGoHome();
    assert.deepStrictEqual([t.hidden.landing, t.hidden.cal], [1, 0]);
    assert.ok(t.log.includes("render") && t.log.includes("me-line"));
  });
  await test("재현② 아이가 없는 기기: 로그인 → '아이를 등록해 주세요' 빈 홈(주연 카드 + 등록 버튼), 첫 화면 숨김", async () => {
    const t = setup({ account: { householdCode: "A8RZ7Q9X" } });
    await t.sb.acctGoHome();
    assert.deepStrictEqual([t.hidden.landing, t.hidden.cal, t.hidden.empty], [1, 0, 0]);
    assert.ok(t.els["empty-panel"].innerHTML.includes('data-acct-action="empty-register"') && t.sb.emptyHome === true);
  });
  await test("아이 추가 입력 중·로그인 전·이미 홈이면 화면을 옮기지 않는다", async () => {
    const a = setup({ profile: {}, newChildMode: true }); await a.sb.acctGoHome(); assert.strictEqual(a.hidden.landing, 0);
    const b = setup({ profile: {} }); b.sb.acct.user = null; await b.sb.acctGoHome(); assert.strictEqual(b.hidden.landing, 0);
    const c = setup({ profile: {} }); c.hidden.landing = 1; c.hidden.cal = 0; await c.sb.acctGoHome(); assert.strictEqual(c.log.length, 0);
  });
  await test("계정 모드 화면 문구에 '가입 없이 먼저 써 볼게요'·'가입하지 않아도 써 볼 수 있어요'가 없다(첫 화면 제목·안내)", () => {
    const O = AV.MSG.onboard;
    assert.ok(![O.browseHeroTitle, O.formNote].some((t) => /가입 없이|가입하지 않아도/.test(t)));
    assert.ok(/acctGoHome\(\)/.test(APP.slice(APP.indexOf("async function acctRestore"), APP.indexOf("function acctOpenInvite"))));
  });
  console.log(`\n${passed}개 통과`);
})();
