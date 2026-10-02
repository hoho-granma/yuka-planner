/*
 * E(1-2) 캘린더 '이번 달 챙길 것' 한 줄: 순수 마크업·정렬·버튼(예약/신청 링크/완료)·가구 활성일 때만(OFF·가구 없음은 달성률 카드 그대로)·신청 링크 조회.
 * 실행: node test/e12-todo-line.test.js
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const V = require("../js/user-schedule-view.js");
const AL = require("../js/apply-links.js");
const HNLogic = require("../js/hn-logic.js");
const CM = require("../js/calendar-model.js");
const read = (f) => fs.readFileSync(path.join(__dirname, "..", f), "utf8");
const APP = read("js/app.js");
let passed = 0;
function test(name, fn) { try { fn(); passed++; console.log("  ok  - " + name); } catch (e) { process.exitCode = 1; console.log("  FAIL- " + name + "\n      " + (e.stack || e).split("\n").slice(0, 6).join("\n      ")); } }

const IT = (o) => ({ id: "x", title: "항목", deadlineMd: "", done: false, reservedText: "", canReserve: false, apply: null, ...o });
const BOK = { url: "https://www.bokjiro.go.kr/ssis-tbu/twataa/wlfareInfo/moveTWAT52011M.do?wlfareInfoId=WLF00004657", label: "신청하러 가기" };

console.log("마크업");
test("접힘: 헤더 한 줄만(이번 달 챙길 것 N개, 미완료만 센다) · 열면 안내 + 항목 목록, 완료는 접힌 details 아래", () => {
  const items = [IT({ id: "a", title: "A" }), IT({ id: "b", title: "B", done: true }), IT({ id: "c", title: "C" })];
  const closed = V.renderTodoLine({ label: "이번 달", open: false, items });
  assert.ok(closed.includes("이번 달 챙길 것 2개") && closed.includes('aria-expanded="false"') && !closed.includes("cal-todo-list") && !closed.includes("<li"));
  const open = V.renderTodoLine({ label: "이번 달", open: true, items });
  assert.ok(open.includes('aria-expanded="true"') && (open.match(/<li /g) || []).length === 3 && /<details class="cal-todo-done"><summary>완료한 항목 1개<\/summary>/.test(open));
  assert.ok(open.indexOf('data-id="a"') < open.indexOf('data-id="c"') && open.indexOf('data-id="c"') < open.indexOf("<details"), "입력 순서(호출부 정렬) 유지, 완료는 details 안");
  assert.ok(V.renderTodoLine({ label: "11월", open: false, items }).includes("11월 챙길 것 2개"));
  assert.ok(V.renderTodoLine({ label: "이번 달", items: [IT({ done: true })] }).includes("이번 달 챙길 것을 모두 확인했어요"));
  assert.ok(V.renderTodoLine({ label: "이번 달", items: [] }).includes("이번 달 챙길 것이 없어요"));
});
test("항목: 마감·예약됨 표시, [예약 일정 만들기](가능할 때만)·[신청 링크](https 만, 새 탭)·[완료], 복지로 항목은 로그인 안내", () => {
  const h = V.renderTodoLine({ label: "이번 달", open: true, items: [IT({ id: "SB-02__r", title: "부모급여 신청", deadlineMd: "10/31", reservedText: "예약됨 10/14", canReserve: true, apply: BOK }), IT({ id: "VX-1", title: "접종", apply: AL.CATEGORY_DEFAULTS.VX }), IT({ id: "p", title: "그냥" })] });
  assert.ok(h.includes("10/31까지") && h.includes("예약됨 10/14") && h.includes('data-cal-todo-act="reserve" data-id="SB-02__r"'));
  assert.ok(h.includes(`href="${BOK.url.replace(/&/g, "&amp;")}"`) && h.includes('target="_blank" rel="noopener noreferrer">신청하러 가기</a>') && h.includes("공식 사이트에서 로그인 후 신청해요"));
  assert.ok(h.includes(">예방접종도우미 열기</a>") && (h.match(/로그인 후 신청해요/g) || []).length === 1, "복지로 항목에만 로그인 안내");
  assert.strictEqual((h.match(/data-cal-todo-act="reserve"/g) || []).length, 1, "예약 버튼은 canReserve 인 항목에만");
  assert.strictEqual((h.match(/data-cal-todo-act="done"/g) || []).length, 3);
  const bad = V.renderTodoLine({ label: "이번 달", open: true, items: [IT({ apply: { url: "javascript:alert(1)", label: "신청하러 가기" } }), IT({ apply: { url: "http://x.kr/", label: "안내 보기" } })] });
  assert.ok(!bad.includes("btn-apply") && !bad.includes("javascript:"), "https 아닌 링크는 그리지 않는다");
  const done = V.renderTodoLine({ label: "이번 달", open: true, items: [IT({ id: "d", done: true, canReserve: true, apply: BOK })] });
  assert.ok(done.includes(">완료 취소<") && !done.includes("data-cal-todo-act=\"reserve\"") && !done.includes("btn-apply"), "완료 항목엔 예약·신청 버튼 없음, 완료 취소만");
  assert.ok(!V.renderTodoLine({ label: "이번 달", open: true, items: [IT({ title: '<img src=x onerror=1>', id: '"><b>' })] }).match(/<img|<b>/));
});

console.log("app.js 연결");
function env(o) {
  const a = APP.indexOf("  let calTodoOpen = false;"), b = APP.indexOf("  /**\n   * 달력 표시 규칙");
  const els = { "cal-progress-card": { hidden: false, classList: { toggle(n, on) { els["cal-progress-card"].hidden = on; } } }, "cal-todo-slot": { innerHTML: "x" } };
  const log = { form: [], toggled: [] };
  const D = (y, m, d) => new Date(y, m - 1, d);
  const ev = (id, title, extra) => ({ id, title, category: "예방접종", scheduleKind: "window", windowStart: D(2026, 10, 1), windowEnd: D(2026, 10, 20), detail: { definition: { todo_id: id.split("__")[0], category: id.slice(0, 2) } }, ...extra });
  const events = o.events || [ev("VX-A__d1", "접종 A", { windowEnd: D(2026, 10, 25) }), ev("VX-B__d1", "접종 B", { windowEnd: D(2026, 10, 12) }), ev("HC-1__d1", "검진", { windowEnd: D(2026, 10, 12), category: "영유아검진" })];
  const sb = { HNLogic, UserScheduleView: V, CalendarModel: CM, ApplyLinks: AL, el: (id) => els[id] || null, usActive: () => o.active !== false, autoLinkOn: () => o.autoLink !== false, usActiveChildKey: () => (o.childKey === undefined ? "c1" : o.childKey),
    autoLinks: () => (o.links ? new Map(Object.entries(o.links)) : new Map()), usAutoTitleOfEvent: (e) => e.title, completed: o.completed || {}, dataset: { subsidy: { subsidies: o.subsidies || [] } },
    calendarDotSchedule: () => events, calDisplayDays: new Map(events.map((e) => [e.id, [e.windowStart]])), viewMonth: D(2026, 10, 1), schedule: events,
    usOpenFormFromAuto: (e) => log.form.push(e.id), toggleComplete: (id) => log.toggled.push(id), Date, isNaN };
  vm.createContext(sb);
  vm.runInContext(APP.slice(a, b) + "\n;globalThis.__t = { renderCalTodoLine, calTodoItems, calTodoOnClick, usApplyLinkOf, get open() { return calTodoOpen; } };", sb);
  return { els, log, t: sb.__t, events };
}
test("가구 활성: 달성률 카드 숨김 + 한 줄(마감 빠른 순·완료는 아래), 가구 없음·OFF 면 카드 그대로·한 줄 비움(이전 화면)", () => {
  const e = env({ completed: { "VX-B__d1": { done: true } } });
  assert.strictEqual(e.t.renderCalTodoLine(), true);
  assert.strictEqual(e.els["cal-progress-card"].hidden, true);
  assert.ok(e.els["cal-todo-slot"].innerHTML.includes("이번 달 챙길 것 2개"));
  assert.deepStrictEqual(e.t.calTodoItems().map((i) => [i.id, i.done]), [["HC-1__d1", false], ["VX-A__d1", false], ["VX-B__d1", true]], "미완료 마감 빠른 순 → 완료");
  const off = env({ active: false });
  assert.strictEqual(off.t.renderCalTodoLine(), false);
  assert.deepStrictEqual([off.els["cal-progress-card"].hidden, off.els["cal-todo-slot"].innerHTML], [false, ""]);
});
test("예약 버튼 조건: autoLink ON + 아이가 가구에 있음 + 연결 가능한 항목 + 아직 예약 없음 + 미완료 — 예약돼 있으면 '예약됨 M/D' 표시", () => {
  const e = env({ links: { "VX-A__d1": { autoId: "VX-A__d1", scheduleId: "s1", date: "2026-10-14", status: "TODO" } } });
  const items = Object.fromEntries(e.t.calTodoItems().map((i) => [i.id, i]));
  assert.deepStrictEqual([items["VX-A__d1"].canReserve, items["VX-A__d1"].reservedText, items["VX-B__d1"].canReserve, items["HC-1__d1"].canReserve], [false, "예약됨 10/14", true, true]);
  assert.ok(!env({ autoLink: false }).t.calTodoItems().some((i) => i.canReserve));
  assert.ok(!env({ childKey: null }).t.calTodoItems().some((i) => i.canReserve));
});
test("클릭: 헤더는 펼침 토글, 예약=usOpenFormFromAuto, 완료=toggleComplete(기존 완료 토글)", () => {
  const e = env({});
  const click = (act, id) => e.t.calTodoOnClick({ target: { closest: () => ({ getAttribute: (n) => (n === "data-cal-todo-act" ? act : id) }) } });
  click("toggle");
  assert.strictEqual(e.t.open, true);
  assert.ok(e.els["cal-todo-slot"].innerHTML.includes('aria-expanded="true"'));
  click("reserve", "VX-B__d1");
  click("done", "VX-A__d1");
  assert.deepStrictEqual([e.log.form, e.log.toggled], [["VX-B__d1"], ["VX-A__d1"]]);
  assert.doesNotThrow(() => e.t.calTodoOnClick({ target: { closest: () => null } }));
});
test("신청 링크 조회: 정의의 subsidyRef → 지원금 레코드 / 지역 지원금은 레코드 자신 / 접종·검진은 분류 기본값 / 근거 링크(officialUrl)는 쓰지 않는다", () => {
  const nat = JSON.parse(read("data/subsidies/national.json")).subsidies;
  const sb02 = { id: "SB-02__r", title: "부모급여", category: "행정·지원금", scheduleKind: "window", windowStart: new Date(2026, 9, 1), windowEnd: new Date(2026, 9, 30), detail: { definition: { todo_id: "SB-02", category: "SB", subsidyRef: "NAT-001" } } };
  const legacy = { id: "NAT-006", title: "양육수당", category: "행정·지원금", scheduleKind: "fixed", fixedDate: new Date(2026, 9, 5), isLegacySubsidy: true, officialUrl: "https://easylaw.go.kr/x", detail: nat.find((s) => s.id === "NAT-006") };
  const e = env({ events: [sb02, legacy, { id: "VX-A__d1", title: "접종", category: "예방접종", scheduleKind: "window", windowStart: new Date(2026, 9, 1), windowEnd: new Date(2026, 9, 9), detail: { definition: { todo_id: "VX-A", category: "VX" } } }], subsidies: nat });
  assert.strictEqual(e.t.usApplyLinkOf(sb02).url.endsWith("WLF00004657"), true);
  assert.strictEqual(e.t.usApplyLinkOf(legacy).url.endsWith("WLF00003253"), true);
  assert.strictEqual(e.t.usApplyLinkOf(e.events[2]).label, "예방접종도우미 열기");
  assert.strictEqual(e.t.usApplyLinkOf({ id: "z", detail: { definition: { todo_id: "DV-01" } } }), null);
  assert.strictEqual(e.t.usApplyLinkOf(null), null);
});
test("연결: renderCalendarProgress 첫 줄, 클릭 위임 등록, index.html 슬롯·카드 id·스크립트 순서, sw.js 에 apply-links", () => {
  assert.ok(/function renderCalendarProgress\(\) \{\n    if \(renderCalTodoLine\(\)\) return;/.test(APP));
  assert.ok(APP.includes('el("cal-todo-slot").addEventListener("click", calTodoOnClick);'));
  const html = read("index.html");
  assert.ok(html.includes('<div id="cal-todo-slot"></div>') && html.includes('class="card cal-progress-card" id="cal-progress-card"'));
  assert.ok(html.indexOf("js/apply-links.js") > 0 && html.indexOf("js/apply-links.js") < html.indexOf("js/app.js"));
  assert.ok(read("sw.js").includes('"./js/apply-links.js"'));
  const L = HNLogic;
  const cal = [{ id: "a", scheduleKind: "window", windowStart: new Date(2026, 9, 1), windowEnd: new Date(2026, 9, 3) }];
  const days = new Map([["a", [new Date(2026, 9, 2)]]]);
  assert.strictEqual(L.calendarMonthItems(cal, days, 2026, 9).length, L.calendarMonthProgress(cal, days, {}, 2026, 9).total, "항목 집합이 달성률과 같다");
});
console.log(`\n${passed}개 통과${process.exitCode ? ", 일부 실패" : ""}`);
