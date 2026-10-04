/* G23 탭 좌우 스와이프 + 캘린더 월 보기만(계정 모드). 실행: node test/g23-tab-swipe-month-only.test.js */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const TS = require("../js/tab-swipe.js");
const read = (f) => fs.readFileSync(path.join(__dirname, "..", f), "utf8");
const APP = read("js/app.js"), HTML = read("index.html"), SW = read("sw.js"), CSS = read("css/style.css");
let passed = 0;
function test(name, f) { try { f(); passed++; console.log("  ok  - " + name); } catch (e) { process.exitCode = 1; console.log("  FAIL- " + name + "\n      " + (e.stack || e).split("\n").slice(0, 4).join("\n      ")); } }
function fn(name) { const i = APP.indexOf(`  function ${name}(`); assert.ok(i >= 0, name); return APP.slice(i, APP.indexOf("\n  }\n", i) + 4); }

test("판정: |dx|>60 이고 |dx|>1.5|dy|, 0.7초 이내·0.2px/ms 이상일 때만 — 왼쪽=다음(+1), 오른쪽=이전(-1)", () => {
  assert.strictEqual(TS.direction(-120, 10, 120), 1);
  assert.strictEqual(TS.direction(120, -10, 120), -1);
  assert.strictEqual(TS.direction(-60, 0, 100), 0, "60px 이하는 아님(초과만)");
  assert.strictEqual(TS.direction(-61, 0, 100), 1);
  assert.strictEqual(TS.direction(-120, 90, 120), 0, "세로가 크면(1.5배 미만) 세로 스크롤");
  assert.strictEqual(TS.direction(-120, 79, 120), 1);
  assert.strictEqual(TS.direction(-120, 81, 120), 0);
  assert.strictEqual(TS.direction(-120, 0, 800), 0, "느린 드래그");
  assert.strictEqual(TS.direction(-70, 0, 400), 0, "속도 0.2px/ms 미만");
  assert.strictEqual(TS.direction(-120, 0, 0), 0);
  assert.strictEqual(TS.direction(0, 200, 100), 0);
});
test("가장자리: 양 끝 탭에서는 더 안 넘어가고, 36+ 4탭·미만 5탭 순서를 그대로 따른다, 목록에 없는 탭(기록 화면)은 무시", () => {
  const four = ["home", "calendar", "checklist", "places"], five = ["home", "calendar", "checklist", "subsidy", "places"];
  assert.strictEqual(TS.nextTab(four, "home", -1), null);
  assert.strictEqual(TS.nextTab(four, "places", 1), null);
  assert.strictEqual(TS.nextTab(four, "home", 1), "calendar");
  assert.strictEqual(TS.nextTab(four, "checklist", 1), "places");
  assert.strictEqual(TS.nextTab(five, "checklist", 1), "subsidy");
  assert.strictEqual(TS.nextTab(five, "subsidy", -1), "checklist");
  assert.strictEqual(TS.nextTab(four, "record", 1), null);
  assert.strictEqual(TS.nextTab(four, "home", 0), null);
});
test("무시 조건: 시트·모달·하프 시트가 열림 / 입력 칸 포커스 / 가로 스크롤 영역에서 시작 / 두 손가락 / 비활성(OFF) 중 하나라도 있으면 무시", () => {
  assert.strictEqual(TS.shouldIgnore({}), false);
  for (const k of ["modalOpen", "popupOpen", "inputFocused", "inHorizontalScroll", "multiTouch", "disabled"]) assert.strictEqual(TS.shouldIgnore({ [k]: true }), true, k);
});

// 앱 쪽 DOM 조건(가짜 DOM)
const ctxEnv = (o) => {
  const cls = (hidden) => ({ classList: { contains: (c) => c === "hidden" && hidden } });
  const els = { "detail-modal": cls(!!o.modalHidden === false ? false : true), "view-calendar": cls(!!o.calHidden), "view-landing": cls(o.landingHidden !== false ? true : false) };
  els["detail-modal"] = cls(o.modalOpen ? false : true);
  const sb = { acctEnabled: () => o.on !== false, el: (id) => els[id], document: { activeElement: o.active || null, querySelector: () => (o.popup ? {} : null), body: {} }, acct23InHScroll: () => !!o.hscroll, TabSwipe: TS };
  vm.createContext(sb);
  vm.runInContext(fn("acct23Ctx"), sb);
  return sb.acct23Ctx({}, o.touches || 1);
};
test("앱 판정 컨텍스트: 모달 열림·날짜 팝업·입력 포커스·가로 스크롤·OFF·랜딩 화면이면 무시, 평소 홈이면 통과", () => {
  assert.strictEqual(TS.shouldIgnore(ctxEnv({})), false);
  assert.strictEqual(TS.shouldIgnore(ctxEnv({ modalOpen: true })), true, "바텀시트·모달·하프 시트");
  assert.strictEqual(TS.shouldIgnore(ctxEnv({ popup: true })), true, "날짜 선택기");
  assert.strictEqual(TS.shouldIgnore(ctxEnv({ active: { tagName: "INPUT" } })), true);
  assert.strictEqual(TS.shouldIgnore(ctxEnv({ active: { tagName: "TEXTAREA" } })), true);
  assert.strictEqual(TS.shouldIgnore(ctxEnv({ active: { tagName: "DIV", isContentEditable: true } })), true);
  assert.strictEqual(TS.shouldIgnore(ctxEnv({ active: { tagName: "BUTTON" } })), false);
  assert.strictEqual(TS.shouldIgnore(ctxEnv({ hscroll: true })), true, "가로 스크롤 영역(칩 줄 등)에서 시작");
  assert.strictEqual(TS.shouldIgnore(ctxEnv({ touches: 2 })), true);
  assert.strictEqual(TS.shouldIgnore(ctxEnv({ on: false })), true, "OFF");
  assert.strictEqual(TS.shouldIgnore(ctxEnv({ landingHidden: false })), true, "첫 화면(로그인 전)");
});
test("가로 스크롤 영역 검사: scrollWidth>clientWidth 이고 overflow-x 가 auto/scroll 인 조상에서 시작하면 true", () => {
  const mk = (sw, cw, ox, parent) => ({ nodeType: 1, scrollWidth: sw, clientWidth: cw, ox, parentElement: parent || null });
  const body = {};
  const sb = { document: { body }, getComputedStyle: (n) => ({ overflowX: n.ox }) };
  vm.createContext(sb);
  vm.runInContext(fn("acct23InHScroll"), sb);
  const plain = mk(300, 300, "visible", null);
  assert.strictEqual(sb.acct23InHScroll(mk(100, 100, "visible", plain)), false);
  const chips = mk(500, 300, "auto", { nodeType: 1, scrollWidth: 300, clientWidth: 300, ox: "visible", parentElement: null });
  assert.strictEqual(sb.acct23InHScroll(mk(40, 40, "visible", chips)), true, "칩 줄 안에서 시작");
  assert.strictEqual(sb.acct23InHScroll(mk(40, 40, "visible", mk(500, 300, "hidden", null))), false, "넘치지만 스크롤은 아님");
});
test("이동은 기존 switchTab 을 재사용하고(하단 바 선택 표시도 같이), 짧은 슬라이드 전환 — prefers-reduced-motion 이면 전환 없이 바로", () => {
  const go = fn("acct23Go");
  assert.ok(go.includes("switchTab(name);"));
  assert.ok(/matchMedia\("\(prefers-reduced-motion: reduce\)"\)\.matches\) return;/.test(go) && go.indexOf("switchTab(name)") < go.indexOf("prefers-reduced-motion") && go.includes("panel.animate("));
  const calls = [];
  const sb = { switchTab: (n) => calls.push(n), matchMedia: () => ({ matches: true }), emptyHome: false, profile: {}, currentTab: "calendar", el: () => { calls.push("el"); return null; } };
  vm.createContext(sb);
  vm.runInContext(fn("acct23Go"), sb);
  sb.acct23Go("calendar", 1);
  assert.deepStrictEqual(calls, ["calendar"], "reduced-motion: 전환 코드(패널 조회·애니메이션) 없이 바로");
  const anim = [];
  const sb2 = { switchTab() {}, matchMedia: () => ({ matches: false }), emptyHome: false, profile: {}, currentTab: "calendar", el: () => ({ animate: (kf, o) => anim.push([kf[0].transform, o.duration]), classList: {} }) };
  vm.createContext(sb2);
  vm.runInContext(fn("acct23Go"), sb2);
  sb2.acct23Go("calendar", 1); sb2.acct23Go("home", -1);
  assert.deepStrictEqual(anim, [["translateX(28px)", 220], ["translateX(-28px)", 220]], "다음=오른쪽에서, 이전=왼쪽에서 220ms");
});
test("끝 판정 연결: 터치 시작 때 무시 조건 검사, 끝에서 방향·가장자리 판정 후 이동(하단 바에 보이는 순서)", () => {
  assert.ok(/function acct23Start\(ev\)[\s\S]*?TabSwipe\.shouldIgnore\(acct23Ctx\(ev\.target, ev\.touches\.length\)\)\) return;/.test(APP));
  assert.ok(/function acct23End\(ev\)[\s\S]*?TabSwipe\.direction\([\s\S]*?TabSwipe\.nextTab\(acct23Order\(\), currentTab, dir\)[\s\S]*?acct23Go\(next, dir\)/.test(APP));
  assert.ok(/addEventListener\("touchstart", acct23Start, \{ passive: true \}\)/.test(APP) && /addEventListener\("touchend", acct23End, \{ passive: true \}\)/.test(APP), "passive — 세로 스크롤을 막지 않는다");
  assert.ok(/function acct23Init\(\) \{\n\s*if \(!acctEnabled\(\)/.test(APP), "계정 모드에서만 등록");
  assert.ok(!/function acct23Start[\s\S]{0,400}preventDefault/.test(APP));
  assert.ok(/<script src="js\/tab-swipe\.js\?v=\d+"><\/script>/.test(HTML) && SW.includes('"./js/tab-swipe.js"'));
});
test("캘린더 격자: 월 이동 스와이프는 원래 없었다(touch 핸들러는 새 코드뿐) → 격자 위에서도 탭 스와이프, 날짜 칸 클릭(하프 시트)과 충돌 없음", () => {
  const touchUses = APP.split("\n").filter((l) => /touchstart|touchend/.test(l) && !/acct23|acct36|a36Touch/.test(l));
  assert.deepStrictEqual(touchUses.filter((l) => /addEventListener/.test(l)), [], "기존 touch 리스너 없음");
});
test("월 보기만(계정 모드): 월|주 전환 칩 없음(calWeekAvailable=false), 주 보기 상태가 남아도 월로 그린다, OFF 는 주 보기 그대로", () => {
  assert.ok(/const calWeekAvailable = \(\) => typeof CalendarWeek !== "undefined" && usActive\(\) && !\(typeof acctEnabled === "function" && acctEnabled\(\)\);/.test(APP));
  const mk = (on) => {
    const sb = { CalendarWeek: {}, usActive: () => true, acctEnabled: () => on, calView: "week", el: () => ({}) };
    vm.createContext(sb);
    vm.runInContext(["const calWeekAvailable = () => typeof CalendarWeek !== \"undefined\" && usActive() && !(typeof acctEnabled === \"function\" && acctEnabled());", "const calWeekOn = () => calView === \"week\" && calWeekAvailable();", "globalThis.calWeekAvailable = calWeekAvailable; globalThis.calWeekOn = calWeekOn;"].join("\n"), sb);
    return sb;
  };
  const acct = mk(true);
  assert.strictEqual(acct.calWeekAvailable(), false);
  assert.strictEqual(acct.calWeekOn(), false, "저장돼 있던 주 보기 상태(calView=week)도 월 보기로");
  const off = mk(false);
  assert.strictEqual(off.calWeekAvailable(), true);
  assert.strictEqual(off.calWeekOn(), true, "OFF: 주 보기 그대로");
  // usRenderViewToggle 은 available=false 면 칩을 비운다
  assert.ok(/if \(!calWeekAvailable\(\)\) \{\n\s*slot\.innerHTML = "";/.test(APP));
  assert.ok(/function usSetCalView\(view\) \{\n\s*if \(!calWeekAvailable\(\)/.test(APP));
});
test("OFF 보존: 새 스와이프 코드는 계정 모드 가드 뒤, 정적 HTML·CSS 변경 없음(전환은 JS animate)", () => {
  assert.ok(!HTML.includes("a23") && !CSS.includes("a23"));
  assert.ok(fn("acct23Start").includes("!acctEnabled()") || /if \(!t \|\| !acctEnabled\(\)\) return;/.test(APP));
});
console.log(`\n${passed}개 통과`);
