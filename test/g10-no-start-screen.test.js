/* G10 계정 모드: 옛 시작 화면(제목·아이 상황 선택)·상황 선택 화면 삭제, 아이 등록은 바로 입력 폼(생년월일/출산 예정일 전환). 실행: node test/g10-no-start-screen.test.js */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const AV = require("../js/account-view.js");
const read = (f) => fs.readFileSync(path.join(__dirname, "..", f), "utf8");
const APP = read("js/app.js"), CSS = read("css/style.css"), HTML = read("index.html");
let passed = 0;
function test(name, f) { try { f(); passed++; console.log("  ok  - " + name); } catch (e) { process.exitCode = 1; console.log("  FAIL- " + name + "\n      " + (e.stack || e).split("\n").slice(0, 4).join("\n      ")); } }
function fn(name) { const i = APP.indexOf(`  function ${name}(`); assert.ok(i >= 0, name); return APP.slice(i, APP.indexOf("\n  }\n", i) + 4); }

function mkEl(id) {
  const cls = new Set(["hidden"]);
  const kids = [];
  const e = { id, textContent: "", innerHTML: "", placeholder: "", value: "", cls, listeners: {}, kids, children: kids,
    classList: { add: (c) => cls.add(c), remove: (c) => cls.delete(c), toggle: (c, on) => (on === undefined ? (cls.has(c) ? cls.delete(c) : cls.add(c)) : on ? cls.add(c) : cls.delete(c)), contains: (c) => cls.has(c) },
    addEventListener: (t, f) => (e.listeners[t] = f), insertBefore: (n) => kids.unshift(n), reset() {}, setAttribute() {}, getAttribute() {}, querySelectorAll: () => [] };
  return e;
}
function boot(opts) {
  const els = {};
  const get = (id) => (els[id] = els[id] || mkEl(id));
  ["stage-choice", "query-form", "hero-sub", "lbl-name", "childName", "lbl-birth", "lbl-order", "btn-submit", "beta-preview-slot", "new-child-bar", "btn-new-child-cancel", "new-child-note", "code-entry", "view-landing", "view-calendar"].forEach(get);
  const toggleBtns = {};
  const sb = {
    landingStage: undefined, newChildMode: false, newChildSnapshot: null, hh: {}, document: { createElement: () => { const b = mkEl("acct-stage-toggle"); b.querySelectorAll = () => Object.values(toggleBtns); return b; } },
    el: (id) => get(id), AccountView: AV, acct: { account: opts.account || null }, acctExpecting: () => !!(opts.account && opts.account.situation === "EXPECTING"),
    acctEnabled: () => opts.on !== false, hhEnabled: () => false, rememberChild() {}, resetBirthDatePicker() {}, showLandingView() {}, acctPrefillRegion() {}, console,
    NEW_CHILD_MSG: { cancel: "취소", note: "n" },
    STAGE_TEXT: { born: { sub: "s", name: "n", placeholder: "p", birth: "생년월일", order: "o", submit: "저장" }, pregnant: { sub: "s", name: "태명", placeholder: "p", birth: "출산 예정일", order: "o", submit: "저장" } },
  };
  vm.createContext(sb);
  vm.runInContext("let landingStage = null;\n" + [fn("setLandingStage"), fn("acctEnsureStageToggle"), fn("acctSyncStageToggle"), fn("enterNewChildEntry")].join("\n") + "\nthis.getStage = () => landingStage;", sb);
  return { sb, els, get };
}

test("아이 등록(계정 모드): 상황 선택 없이 바로 입력 폼, 기본은 생년월일(자녀 '있어요')", () => {
  const t = boot({ account: { situation: "HAS_CHILD" } });
  t.sb.enterNewChildEntry();
  assert.strictEqual(t.sb.getStage(), "born");
  assert.deepStrictEqual([t.els["stage-choice"].cls.has("hidden"), t.els["query-form"].cls.has("hidden")], [true, false]);
  assert.strictEqual(t.els["lbl-birth"].innerHTML.includes("생년월일"), true);
});
test("자녀 '없어요'(예비 부모)면 출산 예정일이 기본, 계정 정보가 없으면 생년월일", () => {
  const a = boot({ account: { situation: "EXPECTING" } }); a.sb.enterNewChildEntry();
  assert.strictEqual(a.sb.getStage(), "pregnant");
  assert.ok(a.els["lbl-birth"].innerHTML.includes("출산 예정일") && a.els["lbl-name"].innerHTML.includes("태명"));
  const b = boot({ account: null }); b.sb.enterNewChildEntry();
  assert.strictEqual(b.sb.getStage(), "born");
});
test("폼 안 전환: setLandingStage 로 born↔pregnant 바뀌고 라벨·저장 stage 가 따라간다(저장은 기존 handleSubmit 의 landingStage)", () => {
  const t = boot({ account: { situation: "HAS_CHILD" } });
  t.sb.enterNewChildEntry();
  t.sb.setLandingStage("pregnant");
  assert.ok(t.els["lbl-birth"].innerHTML.includes("출산 예정일") && t.els["query-form"].cls.has("hidden") === false);
  assert.ok(APP.includes('stage: landingStage || "born"'));
  assert.ok(/data-acct-stage="born">\$\{AccountView\.esc\(O\.dateKindBorn\)\}[\s\S]*data-acct-stage="pregnant"/.test(APP) && AV.MSG.onboard.dateKindBorn === "생년월일" && AV.MSG.onboard.dateKindDue === "출산 예정일");
});
test("플래그 OFF: 입장 시 기존처럼 상황 선택(stage null)에서 시작한다", () => {
  const t = boot({ on: false }); t.sb.enterNewChildEntry();
  assert.strictEqual(t.sb.getStage(), null);
  assert.deepStrictEqual([t.els["stage-choice"].cls.has("hidden"), t.els["query-form"].cls.has("hidden")], [false, true]);
});
test("+ 메뉴 [아이 등록하기]·빈 홈 [아이 등록하기]는 시트·상황 선택을 거치지 않고 같은 입력 폼으로(beginNewChildEntry)", () => {
  assert.ok(fn("showAddChildSheet").includes("beginNewChildEntry({ codeEntry: false })") && !fn("showAddChildSheet").includes("modal-content"));
  assert.ok(/action === "empty-register"[\s\S]{0,120}beginNewChildEntry\(\)/.test(APP));
});
test("CSS: 계정 모드(acct-on)에서 옛 제목·상황 선택·'← 상황 다시 선택'·베타 카드는 항상 숨김, acctApplyLandingMode 가 클래스를 붙인다, index.html OFF 원문은 그대로", () => {
  assert.ok(/#view-landing\.acct-on > \.hero, #view-landing\.acct-on #stage-choice, #view-landing\.acct-on #btn-stage-back[^}]*display: none !important/.test(CSS));
  assert.ok(fn("acctApplyLandingMode").includes('v.classList.add("acct-on")'));
  assert.ok(HTML.includes('data-stage="pregnant"') && HTML.includes("임신 중이에요") && HTML.includes("지금 어떤 상황이세요?") && HTML.includes("아이 키우면서 챙겨야 할 모든 것"));
});
test("문구 확인: 계정 모드에서 쓰는 문구(MSG 전체·DOM에 넣는 문구)에 '가입 없이'·'가입하지 않아도'·'아이 상황을 알려 주세요'가 없다", () => {
  const all = JSON.stringify(AV.MSG);
  assert.ok(!/가입 없이|가입하지 않아도|아이 상황을 알려 주세요/.test(all));
  const landing = AV.renderLanding({}) + AV.renderEmptyHome({}) + AV.renderInvite({ code: "A8RZ7Q9X", role: "" });
  assert.ok(!/가입 없이|가입하지 않아도|아이 상황을 알려 주세요/.test(landing));
  const acctRender = fn("acctRenderLanding");
  assert.ok(!acctRender.includes("stageQuestion") && !acctRender.includes("stage-question") && !acctRender.includes("stage-btn"));
});
console.log(`\n${passed}개 통과`);
