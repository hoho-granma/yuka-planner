/*
 * N2 테스트 — 헤더 + 버튼 '추가하기' 시트(일정 추가 / 새 아이 추가): 가구 플래그 OFF 는 이전과 동일(바로 새 아이 시트), 가구 없음은 비활성+안내,
 * 일정 폼은 대상 기본값 가족 전체(옵션이 없으면 기존과 같음)·담당 기본값 유지. app.js 연결은 소스에서 꺼내 스텁으로 실행한다. 서버 호출 없음. 실행: node test/n2-add-menu.test.js
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { execSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const V = require("../js/user-schedule-view.js");
const US = require("../js/user-schedule.js");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
const BASE = "57d2a25"; // N1 커밋(이번 변경 직전)
const baseSrc = (f) => execSync(`git show ${BASE}:${f}`, { cwd: ROOT, encoding: "utf8" });
let passed = 0, started = 0, finished = 0;
function test(name, fn) {
  started++;
  try { fn(); passed++; finished++; console.log("  ok  - " + name); } catch (e) { process.exitCode = 1; finished++; console.log("  FAIL- " + name + "\n      " + (e.stack || e).split("\n").slice(0, 6).join("\n      ")); }
}
process.on("exit", () => { if (started !== finished) { console.log(`FAIL- 끝나지 않은 테스트 ${started - finished}개`); process.exitCode = 1; } });

const app = read("js/app.js");
const headApp = baseSrc("js/app.js");
const fnSrc = (src, name) => { const a = src.indexOf(`  function ${name}(`); assert.ok(a >= 0, name); const b = src.indexOf("\n  }\n", a); return src.slice(a, b + 5); };
function loadBaseView() {
  const m = { exports: {} };
  vm.runInNewContext(baseSrc("js/user-schedule-view.js"), { module: m, require: (p) => require(path.join(ROOT, "js", p.replace("./", ""))), window: undefined, global: {}, console }, {});
  return m.exports;
}
const OLD = loadBaseView();
const J = (x) => JSON.parse(JSON.stringify(x));

console.log("문구");
const a0 = app.indexOf("  // ── N2 헤더 + 버튼");
const a1 = app.indexOf("  function showNewChildSheet()");
assert.ok(a0 > 0 && a1 > a0);
const menuSrc = app.slice(a0, a1);

function env(opts) {
  const o = { hhOn: true, active: true, ...opts };
  const log = { forms: [], newChild: 0, closed: 0 };
  const els = {};
  const mk = (id) => els[id] || (els[id] = { id, innerHTML: "", listeners: {}, classList: { remove() {}, add() {} }, addEventListener(t, f) { this.listeners[t] = f; } });
  const sb = {
    console, acctEnabled: () => false, AccountView: {}, hhEnabled: () => o.hhOn, usActive: () => o.active, el: mk, modalMode: null,
    showNewChildSheet: (...a) => { log.newChild++; log.newChildArgs = a; return "NEW"; }, closeDetail: () => log.closed++,
    usOpenForm: (...a) => log.forms.push(a), toISODate: () => "2026-10-02", Date,
  };
  vm.createContext(sb);
  vm.runInContext(menuSrc + "\n;Object.assign(globalThis, { showAddMenuSheet, ADD_MENU_MSG });", sb);
  // 시트가 렌더되면 버튼 id 를 가진 가짜 요소가 필요 — innerHTML 에서 id 를 찾아 리스너를 모은다
  sb.el = (id) => { const e = mk(id); return e; };
  return { sb, log, els, o };
}
test("문구가 확정본과 같다", () => {
  const e = env();
  assert.deepStrictEqual(J(e.sb.ADD_MENU_MSG), { title: "추가하기", schedule: "일정 추가", child: "새 아이 추가", needHousehold: "일정을 추가하려면 먼저 프로필에서 가족 캘린더를 만들어 주세요", close: "닫기" });
});

console.log("가구 플래그 OFF — 이전과 동일");
test("OFF: 시트 없이 바로 새 아이 시트(N1 진입)로 간다 — 모달 내용·모드 불변", () => {
  const e = env({ hhOn: false });
  const r = e.sb.showAddMenuSheet();
  assert.strictEqual(r, "NEW");
  assert.strictEqual(e.log.newChild, 1);
  assert.strictEqual(e.els["modal-content"], undefined, "선택 시트를 그리지 않는다");
  assert.strictEqual(e.sb.modalMode, null);
});
test("연결: + 버튼 리스너만 showNewChildSheet → showAddMenuSheet 로 바뀌었고 showNewChildSheet 본문은 이전과 동일", () => {
  assert.ok(app.includes('el("btn-add-child").addEventListener("click", showAddMenuSheet);'));
  assert.ok(headApp.includes('el("btn-add-child").addEventListener("click", showNewChildSheet);'));
  assert.strictEqual(fnSrc(app, "showNewChildSheet"), fnSrc(headApp, "showNewChildSheet"));
});

console.log("가구 플래그 ON");
test("ON·가구 있음: '추가하기' 시트에 일정 추가(활성)·새 아이 추가·닫기, 안내 문구 없음", () => {
  const e = env();
  e.sb.showAddMenuSheet();
  const h = e.els["modal-content"].innerHTML;
  assert.ok(h.includes("<h3>추가하기</h3>") && h.includes('id="btn-add-menu-schedule">일정 추가</button>') && h.includes('id="btn-add-menu-child">새 아이 추가</button>') && h.includes('id="btn-add-menu-close">닫기</button>'));
  assert.ok(!h.includes("disabled") && !h.includes("프로필에서 가족 캘린더를 만들어 주세요"));
  assert.strictEqual(e.sb.modalMode, "add-menu");
});
test("일정 추가: 오늘 날짜·대상 기본값 가족 전체(FAMILY)로 기존 일정 폼(usOpenForm)을 연다", () => {
  const e = env();
  e.sb.showAddMenuSheet();
  e.els["btn-add-menu-schedule"].listeners.click();
  assert.deepStrictEqual(J(e.log.forms), [[null, "2026-10-02", { scope: "FAMILY" }]]);
});
test("새 아이 추가: 기존 새 아이 시트(N1 진입)로 · 닫기: 모달 닫기", () => {
  const e = env();
  e.sb.showAddMenuSheet();
  e.els["btn-add-menu-child"].listeners.click();
  assert.strictEqual(e.log.newChild, 1);
  e.els["btn-add-menu-close"].listeners.click();
  assert.strictEqual(e.log.closed, 1);
});
test("ON·가구 없음(usActive 아님): '일정 추가'는 비활성+안내 문구, 눌러도 폼이 열리지 않고, 새 아이 추가는 그대로 동작", () => {
  const e = env({ active: false });
  e.sb.showAddMenuSheet();
  const h = e.els["modal-content"].innerHTML;
  assert.ok(/id="btn-add-menu-schedule" disabled>일정 추가<\/button>/.test(h) || /id="btn-add-menu-schedule"\s+disabled>일정 추가/.test(h));
  assert.ok(h.includes('<p class="fine-print" id="add-menu-note">일정을 추가하려면 먼저 프로필에서 가족 캘린더를 만들어 주세요</p>'));
  e.els["btn-add-menu-schedule"].listeners.click();
  assert.deepStrictEqual(e.log.forms, []);
  e.els["btn-add-menu-child"].listeners.click();
  assert.strictEqual(e.log.newChild, 1);
});

console.log("일정 폼 기본 대상");
const LINKS = [{ childKey: "c1", displayName: "은찬", order: 1, familyCode: "AAA111" }];
const args = (extra) => ({ date: "2026-10-02", activeChildKey: "c1", links: LINKS, defaultAssigneeId: "m1", ...extra });
test("defaultScope 옵션이 없으면 newForm 출력이 이전 커밋과 같다(아이 링크 있음·없음·활성 아이 없음)", () => {
  for (const a of [args(), args({ activeChildKey: null }), args({ links: [] }), { date: "", activeChildKey: "c1", links: LINKS, autoRef: "VX-DTAP__dose-2", title: "DTaP" }]) {
    assert.deepStrictEqual(J(V.newForm(a)), J(OLD.newForm(a)));
  }
});
test("defaultScope:'FAMILY' 면 활성 아이가 링크돼 있어도 대상은 가족 전체(FAMILY, childKeys 비어 있음), 담당 기본값·날짜·그 외 필드는 그대로", () => {
  const f = V.newForm(args({ defaultScope: "FAMILY" }));
  const base = OLD.newForm(args());
  assert.deepStrictEqual([f.scope, f.childKeys, f.assigneeMemberId, f.eventDate], ["FAMILY", [], "m1", "2026-10-02"]);
  const { scope, childKeys, ...rest } = J(f); const { scope: s2, childKeys: c2, ...rest2 } = J(base);
  assert.deepStrictEqual(rest, rest2);
  assert.strictEqual(base.scope, "CHILD");
});
test("가구는 있는데 활성 아이 링크가 없는 경우에도 가족 전체로 열리고 저장 가능(prepareSave 통과), 아이 일정으로 바꿀 대상 칩은 폼에 있다", () => {
  const f = { ...V.newForm(args({ activeChildKey: null, defaultScope: "FAMILY" })), title: "엄마 병원", category: "MEDICAL" };
  assert.strictEqual(f.scope, "FAMILY");
  const r = V.prepareSave(f, 1790000000000);
  assert.ok(r.ok, JSON.stringify(r.messages));
  assert.deepStrictEqual([r.input.scope, "childKeys" in r.input], ["FAMILY", false]);
  assert.ok(US.buildCreateDoc(r.input, 1790000000000).ok);
  const html = V.renderForm(f, LINKS, { members: [{ memberId: "m1", label: "엄마" }], messages: [] });
  assert.ok(html.includes('data-us-target="c1"') && html.includes('data-us-target="FAMILY"') && html.includes('data-us-assignee="m1"'));
});
test("usOpenForm: 새 일정에만 defaultScope 를 넘기고(옵션 없으면 이전과 동일), 수정·AUTO 예약 경로는 그대로", () => {
  const now = fnSrc(app, "usOpenForm");
  assert.ok(now.includes("...(opts && opts.scope ? { defaultScope: opts.scope } : {})"));
  assert.strictEqual(now.replace("usOpenForm(id, dateIso, opts)", "usOpenForm(id, dateIso)").replace(", ...(opts && opts.scope ? { defaultScope: opts.scope } : {})", ""), fnSrc(headApp, "usOpenForm").replace("    us.autoLabel = null;\n", "    us.autoLabel = null;\n"));
  assert.strictEqual(fnSrc(app, "usOpenFormFromAuto"), fnSrc(headApp, "usOpenFormFromAuto"));
  assert.ok(/usOpenForm\(null\)/.test(app) && !/usOpenForm\(null, toISODate\(new Date\(\)\), \{ scope/.test(app.replace(menuSrc, "")), "다른 호출처는 옵션을 쓰지 않는다");
});
test("스키마·규칙·AUTO 계산·가구 동기화·완료 동기화 파일은 바뀌지 않았다", () => {
  const changed = execSync(`git diff --name-only ${BASE} 90c9740`, { cwd: ROOT, encoding: "utf8" }).split("\n");
  ["firestore.rules", "js/user-schedule.js", "js/calendar-model.js", "js/hn-logic.js", "js/todo-engine.js", "js/schedule.js", "js/sync.js", "js/household-sync.js"].forEach((f) => assert.ok(!changed.includes(f), f));
});

console.log(`\n${passed}개 통과${process.exitCode ? ", 일부 실패" : ""}`);
