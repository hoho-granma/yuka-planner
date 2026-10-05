// D57: 36개월 이상 홈의 '놓치기 쉬운 것'(data-a36-auto) 행을 누르면 기존 상세 시트(openDetail)가 열린다(a169685가 지운 핸들러 복구).
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const APP = fs.readFileSync(path.join(__dirname, "..", "js/app.js"), "utf8");
const VIEW = fs.readFileSync(path.join(__dirname, "..", "js/over36-view.js"), "utf8");
let passed = 0;
function test(name, fn) { try { fn(); passed++; console.log("  ok  - " + name); } catch (e) { console.log("  FAIL - " + name + "\n" + e.stack); process.exitCode = 1; } }

const a = APP.indexOf("  function acct36OnClick(ev) {");
const body = APP.slice(a, APP.indexOf("\n  }\n", a) + 4);
function env(extra) {
  const log = { opened: [] };
  const sb = { A36: { swallow: false, menuId: null }, acct36Active: () => true, schedule: [{ id: "SB-04__x" }, { id: "B" }], openDetail: (e) => log.opened.push(e.id), currentTab: "home", ...extra };
  vm.createContext(sb);
  vm.runInContext(body + "\n;globalThis.__f = acct36OnClick;", sb);
  return { f: sb.__f, log, sb };
}
const target = (map) => ({ closest: (sel) => map[sel] || null });

test("자동 일정 행 클릭 → schedule 에서 id 로 찾아 openDetail 호출, 기본 동작 막음", () => {
  const e = env();
  let prevented = 0;
  e.f({ target: target({ "[data-a36-auto]": { dataset: { a36Auto: "SB-04__x" } } }), preventDefault: () => prevented++ });
  assert.deepStrictEqual(e.log.opened, ["SB-04__x"]);
  assert.strictEqual(prevented, 1);
});
test("schedule 에 없는 id 는 열지 않고 조용히 끝남 / 계정 36+ 모드가 아니면 아무것도 안 함", () => {
  const e = env();
  e.f({ target: target({ "[data-a36-auto]": { dataset: { a36Auto: "nope" } } }) });
  assert.deepStrictEqual(e.log.opened, []);
  const off = env({ acct36Active: () => false });
  off.f({ target: target({ "[data-a36-auto]": { dataset: { a36Auto: "B" } } }) });
  assert.deepStrictEqual(off.log.opened, []);
});
test("핸들러는 A36.swallow 줄 바로 뒤, 메모 행([data-a36-row]) 처리보다 앞 · 홈 행 마크업이 같은 data 속성을 쓴다", () => {
  assert.ok(/A36\.swallow = false;[^\n]*\n\s*const autoEl = t\.closest && t\.closest\("\[data-a36-auto\]"\);/.test(APP));
  assert.ok(VIEW.includes('class="a36-row a36-auto" data-a36-auto="'));
});
console.log(`\n${passed}개 통과`);
