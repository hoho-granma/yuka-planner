/* D33 A안: 탭 위 '지금 보는 아이' 칩 줄 — 2명 이상일 때만, 4개 탭에 1개씩, 칩을 눌러도 탭 유지, 1명·임신 중이면 DOM 불변. 실행: node test/m24-tab-child-bar.test.js */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const TCB = require("../js/tab-child-bar.js");
const CTm = require("../js/child-timeline.js");
const read = (f) => fs.readFileSync(path.join(__dirname, "..", f), "utf8");
const APP = read("js/app.js");
let passed = 0;
function test(name, f) { try { f(); passed++; console.log("  ok  - " + name); } catch (e) { process.exitCode = 1; console.log("  FAIL- " + name + "\n      " + (e.stack || e).split("\n").slice(0, 3).join("\n      ")); } }
function fn(name, async_) { const i = APP.indexOf(`  ${async_ ? "async " : ""}function ${name}(`); assert.ok(i >= 0, name); return APP.slice(i, APP.indexOf("\n  }\n", i) + 4); }

// 아주 작은 가짜 DOM: 부모 children 배열 + insertBefore/remove/getElementById/classList
function mkNode(id) {
  const n = { id, children: [], parentNode: null, innerHTML: "", className: "", attrs: {}, _hidden: false,
    setAttribute(k, v) { n.attrs[k] = v; }, remove() { if (n.parentNode) n.parentNode.children = n.parentNode.children.filter((c) => c !== n); n.parentNode = null; },
    insertBefore(x, ref) { x.parentNode = n; n.children.splice(n.children.indexOf(ref), 0, x); },
    classList: { toggle: (c, on) => { if (c === "hidden") n._hidden = !!on; } } };
  return n;
}
const at = (months) => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth() - months, 1); };
function world(o) {
  const main = mkNode("main"), panels = {};
  for (const t of ["home", "calendar", "checklist", "trend", "places", "record"]) { const p = mkNode("tab-" + t); p.parentNode = main; main.children.push(p); panels[t] = p; }
  const all = () => main.children;
  const births = o.births || {};
  const sb = { TabChildBar: TCB, ChildTimeline: CTm, Date, JSON, CHILD_BIRTHS_KEY: "b", localStorage: { getItem: () => JSON.stringify(births) },
    acctEnabled: () => o.on !== false, profile: o.profile === undefined ? { birthDate: at(124), stage: "born" } : o.profile, isPregnant: () => !!o.pregnant, familyCode: "A", currentTab: o.tab || "calendar",
    acctHomeChildren: () => o.kids, childDisplayName: () => "큰애", el: (id) => (id === "tab-trend" && o.noTrend ? null : main.children.find((c) => c.id === id) || null),
    document: { createElement: () => mkNode(""), getElementById: (id) => all().find((c) => c.id === id) || null }, switched: [], switchToChild: (c) => sb.switched.push(c) };
  vm.createContext(sb);
  vm.runInContext([fn("tcbAgeText"), fn("tabChildBarSync")].join("\n"), sb);
  return { sb, main, panels, bars: () => all().filter((c) => /^tcb-/.test(c.id)) };
}
const two = [{ code: "A", name: "", current: true }, { code: "B", name: "작은애", current: false }];
const births = { A: "2016-06-15", B: new Date(at(64)).toISOString().slice(0, 10) };

console.log("탭 위 아이 칩 줄");
test("순수 마크업: 2명 미만이면 빈 문자열, 2명이면 이름·나이 칩(지금 아이 active, data-home-child)", () => {
  assert.strictEqual(TCB.render([{ code: "A", name: "a", current: true }]), "");
  const h = TCB.render([{ code: "A", name: "큰애", ageText: "10세", current: true }, { code: "B", name: "작은애", ageText: "", current: false }]);
  assert.ok(/class="home-child-chip tcb-chip active" data-home-child="A"><b>큰애<\/b><small> · 10세<\/small>/.test(h) && /data-home-child="B"><b>작은애<\/b><\/button>/.test(h) && !/<small>[^<]*<\/small><\/button>$/.test(h));
});
test("아이 2명: 캘린더·체크리스트·교육 트렌드·어디갈까 4개 탭 패널 바로 앞에 칩 줄이 1개씩, 홈·기록 탭에는 없고 지금 탭에서만 보인다", () => {
  const w = world({ kids: two, births, tab: "calendar" }); w.sb.tabChildBarSync();
  assert.strictEqual(w.bars().length, 4);
  for (const t of TCB.TABS) { const bar = w.main.children.find((c) => c.id === "tcb-" + t); assert.ok(bar && w.main.children[w.main.children.indexOf(bar) + 1] === w.panels[t], t + ": 패널 바로 앞"); assert.ok((bar.innerHTML.match(/data-home-child=/g) || []).length === 2 && /active" data-home-child="A"/.test(bar.innerHTML)); assert.strictEqual(bar._hidden, t !== "calendar", t + " 표시는 지금 탭만"); }
  assert.ok(!w.main.children.some((c) => /^tcb-(home|record)$/.test(c.id)));
  w.sb.tabChildBarSync(); assert.strictEqual(w.bars().length, 4, "다시 맞춰도 늘어나지 않는다");
});
test("칩을 눌러 아이를 바꾸면(profile 교체 후 다시 맞춤) 같은 탭에 머물고 active 만 옮겨 간다", () => {
  const w = world({ kids: two, births, tab: "checklist" }); w.sb.tabChildBarSync();
  const kids2 = [{ code: "A", name: "", current: false }, { code: "B", name: "작은애", current: true }];
  w.sb.acctHomeChildren = () => kids2; w.sb.familyCode = "B"; w.sb.profile = { birthDate: at(64), stage: "born" };
  w.sb.tabChildBarSync();
  assert.strictEqual(w.sb.currentTab, "checklist"); assert.strictEqual(w.bars().length, 4);
  const bar = w.main.children.find((c) => c.id === "tcb-checklist"); assert.ok(!bar._hidden && /active" data-home-child="B"/.test(bar.innerHTML) && !/active" data-home-child="A"/.test(bar.innerHTML));
});
test("아이 1명·임신 중·계정 모드 아님·아이 없음: 아무것도 만들지 않고, 있던 줄은 지운다(DOM 불변)", () => {
  for (const o of [{ kids: [two[0]] }, { kids: two, pregnant: true }, { kids: two, on: false }, { kids: two, profile: null }]) {
    const w = world({ ...o, births }); const before = JSON.stringify(w.main.children.map((c) => c.id)); w.sb.tabChildBarSync();
    assert.strictEqual(JSON.stringify(w.main.children.map((c) => c.id)), before);
  }
  const w = world({ kids: two, births }); w.sb.tabChildBarSync(); assert.strictEqual(w.bars().length, 4);
  w.sb.acctHomeChildren = () => [two[0]]; w.sb.tabChildBarSync(); assert.strictEqual(w.bars().length, 0, "한 명이 되면 줄이 사라진다");
});
test("교육 트렌드 탭이 아직 없으면(36개월 미만) 그 탭 줄은 만들지 않는다", () => {
  const w = world({ kids: two, births, noTrend: true }); w.sb.tabChildBarSync(); assert.strictEqual(w.bars().length, 3);
});
test("앱 연결: renderAll·switchTab 끝에서 맞추고, 칩 클릭은 전용 핸들러(tcbChipClick)·홈 칩과 같은 data-home-child·새 색 없음", () => {
  assert.ok(/renderAllTcbBase\.apply\(this, arguments\);\n\s*tabChildBarSync\(\);/.test(APP) && /switchTabTcbBase\.apply\(this, arguments\);\n\s*tabChildBarSync\(\);/.test(APP));
  assert.ok(/document\.addEventListener\("click", tcbChipClick\)/.test(APP) && /async function tcbChipClick/.test(APP) && /\.tab-childbar \[data-home-child\]/.test(APP));
  assert.ok(/tab-child-bar\.js/.test(read("index.html")) && /tab-child-bar\.js/.test(read("sw.js")));
  const css = read("css/style.css"), i0 = css.indexOf("/* D33 탭 위 아이 칩 줄"), c = css.slice(i0, css.indexOf("\n", css.indexOf(".tcb-chip b {", i0))); assert.ok(!/#[0-9a-f]{3,6}\b/i.test(c.replace(/\(#\w+\)/g, "").replace(/\/\*.*?\*\//g, "")), "새 hex 없음");
});
// 실제 클릭 경로: 칩 클릭 → switchToChild(= buildAndRender 가 홈으로 보낸다) → 끝난 뒤 보던 탭 복원
function clickWorld(o) {
  const navs = {}; for (const t of ["home", "calendar", "checklist", "trend", "places"]) navs[t] = { hidden: o.hiddenNav === t, classList: { contains: (c) => c === "hidden" && navs[t].hidden } };
  const sb = { currentTab: o.tab, familyCode: "A", log: [], navs,
    document: { querySelector: (q) => navs[(q.match(/data-nav="(\w+)"/) || [])[1]] || null },
    switchTab: (t) => { sb.currentTab = t; sb.log.push("tab:" + t); },
    switchToChild: async (c) => { sb.log.push("child:" + c); if (o.fail) return; sb.familyCode = c; sb.currentTab = "home"; /* buildAndRender 의 switchTab("home") */ } };
  vm.createContext(sb);
  vm.runInContext(fn("tcbChipClick", true), sb);
  const chip = (code) => ({ closest: (q) => (/tab-childbar/.test(q) ? { dataset: { homeChild: code } } : null) });
  return { sb, click: (code) => sb.tcbChipClick({ target: chip(code) }) };
}
(async () => {
  const t2 = async (name, f) => { try { await f(); passed++; console.log("  ok  - " + name); } catch (e) { process.exitCode = 1; console.log("  FAIL- " + name + "\n      " + (e.stack || e).split("\n").slice(0, 3).join("\n      ")); } };
  console.log("칩 클릭 경로(탭 유지)");
  for (const tab of ["calendar", "checklist", "trend", "places"]) await t2(`${tab} 탭에서 다른 아이 칩 → 아이가 바뀌고 같은 ${tab} 탭에 머문다`, async () => { const w = clickWorld({ tab }); await w.click("B"); assert.deepStrictEqual(w.sb.log, ["child:B", "tab:" + tab]); assert.strictEqual(w.sb.currentTab, tab); });
  await t2("지금 아이 칩·바뀐 뒤 그 탭이 없는 아이(36개월 미만의 교육 탭 등)는 홈에 남고, 전환 실패는 탭을 건드리지 않는다", async () => {
    const a = clickWorld({ tab: "trend", hiddenNav: "trend" }); await a.click("B"); assert.strictEqual(a.sb.currentTab, "home"); assert.deepStrictEqual(a.sb.log, ["child:B"]);
    const b = clickWorld({ tab: "calendar" }); await b.click("A"); assert.deepStrictEqual(b.sb.log, [], "지금 아이는 무시");
    const c = clickWorld({ tab: "calendar", fail: true }); await c.click("B"); assert.deepStrictEqual(c.sb.log, ["child:B"]); assert.strictEqual(c.sb.currentTab, "calendar");
  });
  console.log(`\n${passed} passed`);
})();
