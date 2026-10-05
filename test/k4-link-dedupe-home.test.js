/*
 * K4 — 일정으로 넣으면 자동 추천 표시를 뺀다(중복 제거) / 홈 카드 문구·재등장 / 달력 아래 안내 문구 삭제.
 * 실행: node test/k4-link-dedupe-home.test.js
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const CM = require("../js/calendar-model.js");
const US = require("../js/user-schedule.js");
const AS = require("../js/auto-steps.js");
const OV = require("../js/over36-view.js");
const ROOT = path.join(__dirname, "..");
const APP = fs.readFileSync(path.join(ROOT, "js/app.js"), "utf8");
let passed = 0;
function test(name, fn) { try { fn(); passed++; console.log("  ok  - " + name); } catch (e) { process.exitCode = 1; console.log("  FAIL- " + name + "\n      " + (e.stack || e).split("\n").slice(0, 3).join("\n      ")); } }

const D = (y, m, d) => new Date(y, m - 1, d);
const mk = (id, extra) => ({ id, title: id, category: "지원금", scheduleKind: "fixed", fixedDate: D(2026, 10, 20), date: D(2026, 10, 20), ...extra });
const linkedDoc = (autoRef, over) => ({ ...US.buildCreateDoc({ sourceType: "MANUAL", title: "일정", category: "ETC", scope: "CHILD", childKeys: ["c1"], allDay: true, dateKind: "FIXED", eventDate: "2026-10-20", autoRef, ...over }, 1).doc, id: "s-" + autoRef });
const model = (events, docs, extra) => CM.buildCalendarModel({
  view: "month", range: { start: "2026-10-01", end: "2026-10-31" }, filter: { scope: "ALL", showAuto: true },
  auto: { events, displayDates: new Map(events.map((e) => [e.id, [D(2026, 10, 20)]])), completed: {}, childKey: "c1", hideLinked: true, ...extra },
  user: { schedules: docs, childLinks: [], members: [] },
});
const cell = (m) => m.days.get("2026-10-20");

console.log("1. 일정으로 넣으면 자동 추천 표시를 뺀다");
test("엔진형 id(autoRef=id)·'__default' id(지역 지원금·학교)·'__key' id 모두 칸의 혜택·추천일 표식이 빠지고, 안 넣은 항목은 그대로", () => {
  const evs = [mk("GG-016"), mk("SC-03__default"), mk("PG-01__x"), mk("OTHER")];
  const none = cell(model(evs, []));
  assert.strictEqual(none.benefit.length, 4);
  const linked = cell(model(evs, [linkedDoc("GG-016__default"), linkedDoc("SC-03__default"), linkedDoc("PG-01__x")]));
  assert.deepStrictEqual(linked.benefit.map((e) => e.id), ["OTHER"]);
  assert.deepStrictEqual(linked.planned.map((e) => e.id), ["OTHER"]);
  assert.strictEqual(linked.user.length, 3, "사용자 일정은 그대로 보인다");
});
test("연결을 끊으면(일정 삭제·취소) 자동 추천이 다시 나온다 / hideLinked:false 면 숨기지 않는다", () => {
  const evs = [mk("GG-016")];
  const doc = linkedDoc("GG-016__default");
  assert.strictEqual(cell(model(evs, [{ ...doc, deletedAt: 5 }])).benefit.length, 1);
  assert.strictEqual(cell(model(evs, [{ ...doc, status: "CANCELLED" }])).planned.length, 1);
  assert.strictEqual(cell(model(evs, [doc], { hideLinked: false })).benefit.length, 1);
});
test("다른 아이에게 연결된 일정은 이 아이 칸의 자동 추천을 숨기지 않는다", () => {
  const other = linkedDoc("GG-016__default", { childKeys: ["c2"] });
  assert.strictEqual(cell(model([mk("GG-016")], [other])).benefit.length, 1);
});
test("앱: 달력 아래 패널·날짜 칸(calendarDayItems) 경로도 같은 판정(autoLinkedHidden)을 쓴다", () => {
  assert.ok(/function autoLinkedHidden\(e\) \{[^}]*AutoSteps\.linkOf\(m, e\)/.test(APP));
  assert.ok(/e\.scheduleKind === "fixed" && HNLogic\.coversDay\(e, date\) && !autoLinkedHidden\(e\)/.test(APP));
  assert.ok(/plannedOnDay\(cal, calDisplayDays, date\)\.filter\(\(e\) => !autoLinkedHidden\(e\)\)/.test(APP));
});

console.log("2. 홈 카드 문구");
test("36개월 이상 홈 카드 제목은 알림·감시처럼 읽히지 않는다", () => {
  assert.strictEqual(OV.MSG.homeAutoTitle, "놓치기 쉬운 것, 챙겨 드려요");
  assert.ok(!/곧 챙길|알림|감시/.test(fs.readFileSync(path.join(ROOT, "js/over36-view.js"), "utf8").match(/homeAutoTitle: "[^"]*"/)[0]));
});

console.log("4. 달력 아래 안내 문구");
test("'혜택은 신청 시작일' 문구와 그 조건 코드는 없다", () => {
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  assert.ok(!html.includes("혜택은 신청 시작일") && !html.includes("cal-kind-legend"));
  assert.ok(!APP.includes("calAutoLegendOn") && !APP.includes("calUpdateKindLegend"));
});

console.log("3. 홈 카드: 넣은 항목은 빠지고 날짜가 가까워지면 다시 나온다");
const policy = JSON.parse(fs.readFileSync(path.join(ROOT, "data/policy/home-reappear.json"), "utf8"));
const a36Env = (o) => {
  const a = APP.indexOf("  function acct36AutoItems(limit) {");
  const src = APP.slice(a, APP.indexOf("\n  }\n", a) + 4);
  const sb = {
    acct36Active: () => true, homeReappearDays: policy.reappearDaysBefore, completed: o.completed || {}, AutoSteps: AS,
    autoLinks: () => (o.links === undefined ? new Map() : o.links), visibleSchedule: () => o.events, Date, ChildTimeline: require("../js/child-timeline.js"), profile: { birthDate: new Date(2016, 5, 10) },
  };
  vm.createContext(sb);
  vm.runInContext(src + ";globalThis.run=acct36AutoItems", sb);
  return () => sb.run(3).map((e) => e.id);
};
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const today = new Date(); today.setHours(0, 0, 0, 0);
const plus = (n) => new Date(today.getTime() + n * 86400000);
const ev = (id, n) => ({ id, title: id, date: plus(n) });
const link = (id, n) => ({ autoId: id, scheduleId: "s", date: iso(plus(n)), status: "TODO", count: 1 });
test("정책 값: reappearDaysBefore 는 0 이상 정수(제안값 7)", () => {
  assert.ok(Number.isInteger(policy.reappearDaysBefore) && policy.reappearDaysBefore === 7);
});
test("안 넣은 항목은 계속 보이고, 먼 날짜에 넣은 항목은 빠진다", () => {
  const events = [ev("A", 5), ev("B", 200)];
  assert.deepStrictEqual(a36Env({ events })(), ["A", "B"]);
  assert.deepStrictEqual(a36Env({ events, links: new Map([["B", link("B", 120)]]) })(), ["A"]);
});
test("등록 일정 날짜 7일 전부터(8일 전은 아직) 다시 나온다 — 당일·지난 뒤(완료 전)에도 보인다", () => {
  const events = [ev("B", 200)];
  assert.deepStrictEqual(a36Env({ events, links: new Map([["B", link("B", 8)]]) })(), []);
  assert.deepStrictEqual(a36Env({ events, links: new Map([["B", link("B", 7)]]) })(), ["B"]);
  assert.deepStrictEqual(a36Env({ events, links: new Map([["B", link("B", 0)]]) })(), ["B"]);
  assert.deepStrictEqual(a36Env({ events, links: new Map([["B", link("B", -3)]]) })(), ["B"]);
});
test("'__default' autoRef 연결도 같은 규칙, 완료 체크한 항목은 계속 빠진다", () => {
  const events = [ev("GG-016", 200)];
  assert.deepStrictEqual(a36Env({ events, links: new Map([["GG-016__default", link("GG-016", 90)]]) })(), []);
  assert.deepStrictEqual(a36Env({ events, completed: { "GG-016": true }, links: new Map([["GG-016__default", link("GG-016", 3)]]) })(), []);
});
test("연결을 끊으면(색인에 없음) 다시 나온다", () => {
  assert.deepStrictEqual(a36Env({ events: [ev("GG-016", 200)], links: new Map() })(), ["GG-016"]);
});

console.log("W5 저장 뒤 시트");
const NS = require("../js/next-stage.js");
test("항목을 다 넣어 남은 줄이 없으면 저장 버튼 없이 '다 넣었어요'와 돌아가기 한 개만 보인다", () => {
  const html = NS.renderPlanSheet({ stageLabel: "곧 3~5세", kidName: "은찬" }, [], { message: NS.MSG.planDone(3) });
  assert.ok(!html.includes('data-ns="save"') && html.includes(NS.MSG.planAllDone) && html.includes("3개를 일정으로 넣었어요"));
  assert.strictEqual((html.match(/data-ns="back"/g) || []).length, 1);
  const open = NS.renderPlanSheet({ stageLabel: "x", kidName: "" }, [{ id: "a", label: "A", sub: "", checked: true, disabled: false }], {});
  assert.ok(open.includes('data-ns="save"'));
});
test("앱: 방금 넣은 항목은 연결 색인이 늦어도 '일정 있음'으로 덮고(10분), 되돌아가기는 계산 실패여도 직전 모델로 연다", () => {
  assert.ok(/NSS\.saved\.set\(r\.id, Date\.now\(\)\)/.test(APP));
  assert.ok(/it\.state = "planned"/.test(APP) && /NSS\.m = nsKeepModel\(m\);\n\s+if \(!NSS\.m\) return closeDetail\(\);/.test(APP));
});


console.log("W5 저장 흐름(중복 생성 방지·즉시 표시·되돌아가기)");
const nsEnv = (o = {}) => {
  const a = APP.indexOf("  const NSS = {"), b = APP.indexOf("  function nsOnClick(");
  const src = APP.slice(a, b);
  const rawPolicy = JSON.parse(fs.readFileSync(path.join(ROOT, "data/policy/next-stage.json"), "utf8"));
  const day = (n) => new Date(Date.now() + n * 86400000);
  const ids = ["VX-DTAP__dose-5", "VX-IPV__dose-4", "VX-MMR__dose-2"];
  const events = ids.map((id, i) => ({ id, title: id, windowStart: day(5 + i), windowEnd: day(60 + i), scheduleKind: "window", date: day(5 + i) }));
  const nodes = {}; const el = (id) => (nodes[id] = nodes[id] || { innerHTML: "", classList: { add() {}, remove() {} }, querySelector: () => null, insertAdjacentHTML() {} });
  const docs = []; const calls = [];
  const sb = {
    console, Date, Map, Set, Promise, setTimeout, el, modalMode: null, completed: {}, profile: { birthDate: new Date(2020, 0, 1) }, schoolPolicy: null, hh: { hid: "h1" },
    acctEnabled: () => true, isPregnant: () => false, childDisplayName: () => "서윤", ChildTimeline: { stageOf: () => ({ stage: "AGE_3_5", ageMonths: 69 }) },
    schedule: events, nextStagePolicy: NS.normalizePolicy(rawPolicy), NextStage: NS, AutoSteps: AS, UserSchedule: US, isNotApplicable: () => false,
    autoLinkOn: () => true, usActiveChildKey: () => "c1", toISODate: (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
    autoLinks: () => (o.lag ? new Map() : new Map(docs.map((d) => [d.autoRef, { autoId: d.autoRef, scheduleId: "s", date: d.eventDate || d.periodStart, status: "TODO", count: 1 }]))),
    usAutoTitleOfEvent: (e) => e.title, usRefreshCalendar() {}, usApplyLinkOf: () => null, closeDetail() { sb.closed = true; }, nsSync() {},
    HouseholdSync: { createSchedule: async (hid, doc) => { calls.push(doc.autoRef); if (o.delay) await new Promise((r) => setTimeout(r, o.delay)); if (o.fail && o.fail(doc.autoRef, calls.length)) return { ok: false, reason: "x" }; docs.push(doc); return { ok: true, scheduleId: "s" + calls.length }; } },
  };
  vm.createContext(sb);
  vm.runInContext(src + ";globalThis.NSS=NSS;globalThis.api={nsOpenSheet,nsOpenPlan,nsSavePlan,nsPlanRows,nsModel};", sb);
  sb.api.nsOpenSheet(); sb.api.nsOpenPlan();
  const html = () => nodes["modal-content"].innerHTML;
  return { sb, api: sb.api, NSS: sb.NSS, calls, docs, html, ids };
};
const countSave = (h) => (h.match(/data-ns="save"/g) || []).length;
const tick = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  await (async () => { // 연결 색인이 바로 따라잡는 실서버 모양(미러 즉시 반영): 저장 뒤 목록 비움·완료 문구·되돌아가기에서 3개 '일정 있음'
    const e = nsEnv(); e.NSS.checked = new Set(e.ids);
    const p = e.api.nsSavePlan(); assert.ok(/disabled/.test(e.html()) && e.NSS.saving, "첫 클릭에서 동기적으로 비활성");
    await p;
    assert.strictEqual(e.calls.length, 3);
    assert.ok(countSave(e.html()) === 0 && e.html().includes("다 넣었어요. 캘린더에서 확인해요.") && e.html().includes("3개를 일정으로 넣었어요"));
    assert.strictEqual((e.html().match(/data-ns="back"/g) || []).length, 1);
    await e.api.nsSavePlan(); assert.strictEqual(e.calls.length, 3, "다시 눌러도 더 만들지 않는다");
    e.api.nsOpenSheet(); assert.strictEqual(e.html().split(NS.MSG.planned).length - 1, 3, "타임라인에서 3개가 일정 있음");
    passed++; console.log("  ok  - 색인이 즉시 따라잡아도 완료 문구·저장 버튼 없음·되돌아가기 정상, 재저장 없음");
  })().catch((err) => { process.exitCode = 1; console.log("  FAIL- 즉시 색인\n      " + err.stack.split("\n").slice(0, 3).join("\n      ")); });
  await (async () => { // 색인이 늦는 하네스 모양 + 느린 응답 + 저장 중 재클릭
    const e = nsEnv({ lag: true, delay: 30 }); e.NSS.checked = new Set(e.ids);
    const p1 = e.api.nsSavePlan(); const p2 = e.api.nsSavePlan(); const p3 = e.api.nsSavePlan();
    await Promise.all([p1, p2, p3]);
    assert.strictEqual(e.calls.length, 3, "저장 중 재클릭은 무시");
    assert.strictEqual(countSave(e.html()), 0);
    await e.api.nsSavePlan(); assert.strictEqual(e.calls.length, 3);
    e.api.nsOpenSheet();
    assert.strictEqual(e.html().split(NS.MSG.planned).length - 1, 3, "색인이 아직 비어 있어도 타임라인에서 일정 있음");
    passed++; console.log("  ok  - 색인이 늦고 응답이 느려도(재클릭 3번) 3건만 만들고 일정 있음 표시");
  })().catch((err) => { process.exitCode = 1; console.log("  FAIL- 색인 지연\n      " + err.stack.split("\n").slice(0, 3).join("\n      ")); });
  await (async () => { // 일부 실패: 실패 항목만 다시 시도
    const e = nsEnv({ lag: true, fail: (ref, n) => ref === "VX-IPV__dose-4" && n === 2 }); e.NSS.checked = new Set(e.ids);
    await e.api.nsSavePlan();
    assert.strictEqual(e.calls.length, 3); assert.strictEqual(e.docs.length, 2);
    assert.ok(e.html().includes("1개는 넣지 못했어요") && e.html().includes("2개를 일정으로 넣었어요") && countSave(e.html()) === 1);
    assert.strictEqual(e.api.nsPlanRows().length, 1);
    e.NSS.checked = new Set(["VX-IPV__dose-4"]);
    await e.api.nsSavePlan();
    assert.strictEqual(e.calls.length, 4); assert.strictEqual(e.docs.length, 3);
    assert.strictEqual(countSave(e.html()), 0);
    passed++; console.log("  ok  - 일부 실패: 성공 항목은 다시 만들지 않고 실패 항목만 재시도");
  })().catch((err) => { process.exitCode = 1; console.log("  FAIL- 일부 실패\n      " + err.stack.split("\n").slice(0, 3).join("\n      ")); });
  console.log(`\n${passed}개 통과(저장 흐름 포함)`);
})();

