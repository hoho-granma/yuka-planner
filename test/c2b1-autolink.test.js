/*
 * C2-b1 테스트 — AUTO 항목 연결의 연결 생성 진입점·표시(autoLink 서브 플래그): 승인 문구 #1~#4, 폼(autoRef 잠금), 배지, 보조 문구, 별칭 로더, 플래그 OFF 불변(HEAD 소스 대비), 수동 서버 검증 페이지.
 * app.js 연결은 소스에서 꺼내 스텁으로 실행한다. 서버 호출 없음. 실행: node test/c2b1-autolink.test.js
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { execSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const V = require("../js/user-schedule-view.js");
const US = require("../js/user-schedule.js");
const CM = require("../js/calendar-model.js");
const HNLogic = require("../js/hn-logic.js");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
const BASE = "84286f3"; // C2-a 커밋(이번 변경 직전)
const baseSrc = (f) => execSync(`git show ${BASE}:${f}`, { cwd: ROOT, encoding: "utf8" });
let passed = 0, started = 0, finished = 0;
function test(name, fn) {
  started++;
  try { fn(); passed++; console.log("  ok  - " + name); } catch (e) { process.exitCode = 1; console.log("  FAIL- " + name + "\n      " + (e.stack || e).split("\n").slice(0, 6).join("\n      ")); }
  finished++;
}
process.on("exit", () => { if (started !== finished) { console.log(`FAIL- 끝나지 않은 테스트 ${started - finished}개`); process.exitCode = 1; } });

const app = read("js/app.js");
const headApp = baseSrc("js/app.js");
const fnSrc = (src, name) => { const a = src.indexOf(`  function ${name}(`); assert.ok(a >= 0, name); const b = src.indexOf("\n  }\n", a); return src.slice(a, b + 5); };
// 이전 커밋의 view 모듈을 그대로 불러 현재 것과 출력을 비교한다.
function loadBaseView() {
  const m = { exports: {} };
  const req = (p) => require(path.join(ROOT, "js", p.replace("./", "")));
  vm.runInNewContext(baseSrc("js/user-schedule-view.js"), { module: m, require: req, window: undefined, global: {}, console }, {});
  return m.exports;
}
const OLD = loadBaseView();
const J = (x) => JSON.parse(JSON.stringify(x)); // 다른 vm 영역에서 만든 객체와 비교할 때 프로토타입 차이를 없앤다

console.log("승인 문구 #1~#4");
test("버튼·예약됨·폼 안내·배지 문구가 확정본과 같다", () => {
  assert.strictEqual(V.MSG.autoReserve, "예약 일정 만들기");
  assert.strictEqual(V.MSG.autoReserved("10/14"), "예약됨 10/14 · 일정 보기");
  assert.strictEqual(V.MSG.autoReservedNote("10/14"), "예약됨 10/14");
  assert.strictEqual(V.MSG.autoFormNote("DTaP 접종 (2차)"), "‘DTaP 접종 (2차)’ 예약 일정이에요. 날짜와 시간을 입력해 주세요.");
  assert.strictEqual(V.MSG.autoLinkBadge("DTaP 접종 (2차)"), "DTaP 접종 (2차) 연결");
});

console.log("폼(autoRef 잠금)");
const LINKS = [{ childKey: "c1", displayName: "은찬", order: 1, familyCode: "AAA111" }, { childKey: "c2", displayName: "둘째", order: 2, familyCode: "BBB222" }];
const af = () => V.newForm({ date: "", activeChildKey: "c1", links: LINKS, defaultAssigneeId: "m1", autoRef: "VX-DTAP__dose-2", title: "DTaP 접종 (2차)" });
const render = (f, o) => V.renderForm(f, LINKS, { members: [{ memberId: "m1", label: "엄마" }], messages: [], ...(o || {}) });
test("newForm: autoRef 가 있으면 제목·분류(MEDICAL)·아이·담당이 채워지고 날짜·시각은 비어 있다(I9)", () => {
  const f = af();
  assert.deepStrictEqual([f.autoRef, f.title, f.category, f.scope, f.childKeys, f.assigneeMemberId, f.eventDate, f.allDay, f.startTime], ["VX-DTAP__dose-2", "DTaP 접종 (2차)", "MEDICAL", "CHILD", ["c1"], "m1", "", true, ""]);
  assert.strictEqual(V.newForm({ date: "", activeChildKey: "c1", links: LINKS, autoRef: "X__y", title: "가".repeat(150) }).title.length, 100);
});
test("autoRef 가 없으면 newForm·formFromSchedule 은 이전 커밋과 같은 모양(필드 추가 없음)", () => {
  const args = { date: "2026-10-06", activeChildKey: "c1", links: LINKS, defaultAssigneeId: "m1" };
  assert.deepStrictEqual(J(V.newForm(args)), J(OLD.newForm(args)));
  const doc = { id: "s1", title: "수업", category: "LESSON", scope: "FAMILY", dateKind: "FIXED", eventDate: "2026-10-06", allDay: true };
  assert.deepStrictEqual(J(V.formFromSchedule(doc)), J(OLD.formFromSchedule(doc)));
  assert.ok(!("autoRef" in V.newForm(args)) && !("autoRef" in V.formFromSchedule(doc)));
});
test("연결 폼: 안내 문구 · 대상/날짜 종류/반복/빠른 추가 칩이 없고 날짜·시간·제목·분류·담당은 있다", () => {
  const h = render(af(), { autoLabel: "DTaP 접종 (2차)" });
  assert.ok(h.includes("‘DTaP 접종 (2차)’ 예약 일정이에요. 날짜와 시간을 입력해 주세요."));
  assert.ok(!h.includes("data-us-target") && !h.includes("data-us-kind") && !h.includes("data-us-repeat") && !h.includes("data-us-quick"));
  assert.ok(h.includes('id="us-title"') && h.includes("data-us-cat") && h.includes("data-us-assignee") && h.includes('id="us-allday"') && h.includes("us-location"));
});
test("라벨이 없으면(수정 폼 등) 안내 문구 없이 잠금만, 수정 모드도 잠금", () => {
  const f = af();
  assert.ok(!render(f).includes("예약 일정이에요"));
  const edit = V.formFromSchedule({ id: "s1", title: "예약", category: "MEDICAL", scope: "CHILD", childKeys: ["c1"], dateKind: "FIXED", eventDate: "2026-10-14", allDay: true, autoRef: "VX-DTAP__dose-2" });
  const h = render(edit, { autoLabel: "DTaP 접종 (2차)" });
  assert.strictEqual(edit.autoRef, "VX-DTAP__dose-2");
  assert.ok(!h.includes("data-us-target") && !h.includes("data-us-kind") && !h.includes("data-us-repeat") && !h.includes("예약 일정이에요"));
});
test("autoRef 없는 폼 렌더(추가·수정·기간·반복·다자녀)는 이전 커밋과 글자까지 같다", () => {
  const forms = [
    V.newForm({ date: "2026-10-06", activeChildKey: "c1", links: LINKS, defaultAssigneeId: "m1" }),
    V.newForm({ date: "2026-10-06", activeChildKey: null, links: LINKS }),
    { ...V.newForm({ date: "2026-10-06", activeChildKey: "c1", links: LINKS }), dateKind: "PERIOD", periodStart: "2026-10-01", periodEnd: "2026-10-30" },
    { ...V.newForm({ date: "2026-10-06", activeChildKey: "c1", links: LINKS }), repeat: "WEEKLY", byDay: ["TU"] },
    V.formFromSchedule({ id: "s1", title: "수업", category: "LESSON", scope: "CHILD", childKeys: ["c1", "c2"], dateKind: "FIXED", eventDate: "2026-10-06", allDay: false, startTime: "16:00", endTime: "16:50" }),
  ];
  const opts = { members: [{ memberId: "m1", label: "엄마" }], messages: ["x"], saving: false };
  forms.forEach((f, i) => assert.strictEqual(V.renderForm(f, LINKS, opts), OLD.renderForm(f, LINKS, opts), "form " + i));
});
test("저장: 날짜를 넣으면 prepareSave 통과·autoRef 포함 입력, 날짜 없으면 거부, scope/childKeys 가 어긋나면 거부(I13)", () => {
  const f = af();
  assert.strictEqual(V.prepareSave(f, 1790000000000).ok, false, "날짜 미입력");
  f.eventDate = "2026-10-14";
  const r = V.prepareSave(f, 1790000000000);
  assert.ok(r.ok, JSON.stringify(r.messages));
  assert.deepStrictEqual([r.input.autoRef, r.input.scope, r.input.childKeys, r.input.category, r.input.title], ["VX-DTAP__dose-2", "CHILD", ["c1"], "MEDICAL", "DTaP 접종 (2차)"]);
  assert.ok(US.buildCreateDoc(r.input, 1790000000000).ok);
  assert.strictEqual(V.prepareSave({ ...f, scope: "FAMILY", childKeys: [] }, 1).ok, false);
  assert.strictEqual(V.prepareSave({ ...f, childKeys: ["c1", "c2"] }, 1).ok, false);
});
test("수정: 연결 일정의 changesFromForm 에 autoRef 가 없고 제목 변경만 패치로 나간다(autoRef 불변)", () => {
  const before = { v: 1, sourceType: "MANUAL", title: "예약", category: "MEDICAL", scope: "CHILD", childKeys: ["c1"], dateKind: "FIXED", eventDate: "2026-10-14", allDay: true, status: "TODO", createdAt: 1, updatedAt: 1, autoRef: "VX-DTAP__dose-2" };
  const form = V.formFromSchedule({ ...before, id: "s1" });
  assert.deepStrictEqual(V.changesFromForm(form, before), {});
  const changed = V.changesFromForm({ ...form, title: "새 제목" }, before);
  assert.deepStrictEqual(changed, { title: "새 제목" });
  assert.ok(US.buildPatch(before, changed, 2).ok);
});

console.log("보조 문구·버튼·배지(순수)");
test("autoLinkNote: 미완료 예약만 '예약됨 10/14', 완료·날짜 없음·연결 없음은 빈 문자열", () => {
  assert.strictEqual(V.autoLinkNote({ date: "2026-10-14", status: "TODO" }), "예약됨 10/14");
  assert.strictEqual(V.autoLinkNote({ date: "2026-10-04", status: "RESCHEDULED" }), "예약됨 10/4");
  assert.strictEqual(V.autoLinkNote({ date: "2026-10-14", status: "DONE" }), "");
  assert.strictEqual(V.autoLinkNote({ date: "", status: "TODO" }), "");
  assert.strictEqual(V.autoLinkNote(undefined), "");
});
test("renderAutoLinkButton: 예약이 없으면 '예약 일정 만들기', 있으면 '예약됨 10/14 · 일정 보기'(일정 id 전달), 이스케이프", () => {
  assert.ok(V.renderAutoLinkButton(undefined).includes('id="btn-auto-reserve"') && V.renderAutoLinkButton(undefined).includes("예약 일정 만들기"));
  const v = V.renderAutoLinkButton({ date: "2026-10-14", scheduleId: 's"1', status: "TODO" });
  assert.ok(v.includes('id="btn-auto-view"') && v.includes("예약됨 10/14 · 일정 보기") && v.includes('data-auto-schedule="s&quot;1"'));
});
test("일정 카드 배지: autoTitleOf 가 제목을 주면 '{항목} 연결', 없거나 못 찾으면 배지 없음, 옵션이 없으면 이전 커밋과 같은 출력", () => {
  const doc = { ...US.buildCreateDoc({ sourceType: "MANUAL", title: "예약", category: "MEDICAL", scope: "CHILD", childKeys: ["c1"], allDay: true, dateKind: "FIXED", eventDate: "2026-10-14", autoRef: "VX-DTAP__dose-2" }, 1).doc, id: "s1" };
  const model = CM.buildCalendarModel({ view: "month", range: { start: "2026-10-01", end: "2026-10-31" }, filter: { scope: "ALL", showAuto: false }, auto: { events: [], displayDates: new Map(), completed: {} }, user: { schedules: [doc], childLinks: [{ childKey: "c1", displayName: "은찬" }], members: [] } });
  const day = model.days.get("2026-10-14");
  const docById = () => doc;
  const withBadge = V.dayPanel(day, LINKS, { docById, autoTitleOf: () => "DTaP 접종 (2차)" });
  assert.strictEqual(withBadge.added.cards[0].autoLinkText, "DTaP 접종 (2차) 연결");
  assert.ok(V.renderCard(withBadge.added.cards[0]).includes("us-autolink") && V.renderCard(withBadge.added.cards[0]).includes("DTaP 접종 (2차) 연결"));
  const none = V.dayPanel(day, LINKS, { docById, autoTitleOf: () => "" });
  assert.ok(!("autoLinkText" in none.added.cards[0]));
  assert.deepStrictEqual(J(V.dayPanel(day, LINKS, { docById })), J(OLD.dayPanel(day, LINKS, { docById })));
  assert.strictEqual(V.renderCard(V.dayPanel(day, LINKS, { docById }).added.cards[0]), OLD.renderCard(OLD.dayPanel(day, LINKS, { docById }).added.cards[0]));
});

console.log("플래그(FEATURES.autoLink)");
function flags(store) {
  const calls = [];
  const sb = { localStorage: { getItem: (k) => (calls.push(k), store[k] === undefined ? null : store[k]) } };
  sb.window = sb;
  vm.createContext(sb);
  vm.runInContext(read("js/feature-flags.js"), sb);
  return { F: sb.FEATURES, calls };
}
test("기본 OFF · household 와 autolink 가 모두 정확히 '1' 일 때만 ON · household 가 꺼져 있으면 autolink 키를 읽지도 않는다", () => {
  assert.deepStrictEqual(J(flags({}).F), { household: false, autoLink: false });
  assert.deepStrictEqual(J(flags({ hannun_feature_household: "1" }).F), { household: true, autoLink: false });
  assert.deepStrictEqual(J(flags({ hannun_feature_household: "1", hannun_feature_autolink: "1" }).F), { household: true, autoLink: true });
  assert.deepStrictEqual(J(flags({ hannun_feature_household: "1", hannun_feature_autolink: "true" }).F), { household: true, autoLink: false });
  const off = flags({ hannun_feature_autolink: "1" });
  assert.deepStrictEqual(J(off.F), { household: false, autoLink: false });
  assert.deepStrictEqual(off.calls, ["hannun_feature_household"]);
});

console.log("app.js 연결(소스 추출 스텁)");
const a0 = app.indexOf("  // ── C2-b1 AUTO 항목 연결");
const a1 = app.indexOf("  /** 홈 '다가오는 가족 일정' 카드(F1).");
assert.ok(a0 > 0 && a1 > a0);
const blockSrc = app.slice(a0, a1);
const DEF = (todo_id, category) => ({ todo_id, category });
const EV = (id, title, def) => ({ id, title, detail: { definition: def } });
function env(opts) {
  const o = { flag: true, active: true, childKey: "c1", docs: [], aliases: {}, events: [], ...opts };
  const calls = { shown: 0, ids: [] };
  const sb = {
    console, window: { FEATURES: { autoLink: o.flag } }, CalendarModel: CM, UserScheduleView: V, Promise,
    usActive: () => o.active, usDocs: () => o.docs, usActiveChildKey: () => o.childKey, usLinks: () => LINKS, memActiveId: () => "m1",
    autoIdAliases: o.aliases, schedule: o.events, esc: (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;"),
    us: { form: null, messages: [], saving: false, dayForm: null, plan: null, autoLabel: null },
    usShowForm: () => calls.shown++,
  };
  vm.createContext(sb);
  vm.runInContext(blockSrc + "\n;Object.assign(globalThis, { autoLinkOn, autoLinks, usAutoLinkSig, usAutoTitleOf, autoLinkNoteHtml, autoLinkInlineHtml, autoLinkButtonHtml, usOpenFormFromAuto });", sb);
  return { sb, calls, o };
}
const linkedDoc = (over) => ({ ...US.buildCreateDoc({ sourceType: "MANUAL", title: "예약", category: "MEDICAL", scope: "CHILD", childKeys: ["c1"], allDay: true, dateKind: "FIXED", eventDate: "2026-10-14", autoRef: "VX-DTAP__dose-2", ...over }, 1).doc, id: "s" + Math.random().toString(36).slice(2, 6) });
const DTAP = EV("VX-DTAP__dose-2", "⚠️ 확인 필요 · DTaP 접종 (2차)", DEF("VX-DTAP", "VX"));

test("플래그 OFF: 연결 색인 null, 보조 문구·버튼·시그니처 모두 빈 문자열, 예약 폼도 열리지 않는다(연결 일정이 있어도)", () => {
  const e = env({ flag: false, docs: [linkedDoc()], events: [DTAP] });
  assert.strictEqual(e.sb.autoLinkOn(), false);
  assert.strictEqual(e.sb.autoLinks(), null);
  assert.deepStrictEqual([e.sb.autoLinkNoteHtml(DTAP), e.sb.autoLinkInlineHtml(DTAP), e.sb.autoLinkButtonHtml(DTAP, false), e.sb.usAutoLinkSig()], ["", "", "", ""]);
  e.sb.usOpenFormFromAuto(DTAP);
  assert.strictEqual(e.sb.us.form, null);
  assert.strictEqual(e.calls.shown, 0);
});
test("가구 없음(usActive false): 플래그가 켜져도 아무것도 하지 않는다", () => {
  const e = env({ active: false, docs: [linkedDoc()], events: [DTAP] });
  assert.strictEqual(e.sb.autoLinks(), null);
  assert.deepStrictEqual([e.sb.autoLinkNoteHtml(DTAP), e.sb.autoLinkButtonHtml(DTAP, false)], ["", ""]);
  e.sb.usOpenFormFromAuto(DTAP);
  assert.strictEqual(e.calls.shown, 0);
});
test("ON: 연결된 항목에 '예약됨 10/14' 문단·인라인 문구, 연결 없는 항목·완료된 예약·다른 아이 예약은 문구 없음", () => {
  const OTHER = EV("VX-IPV__dose-1", "IPV 접종 (1차)", DEF("VX-IPV", "VX"));
  const e = env({ docs: [linkedDoc(), linkedDoc({ autoRef: "VX-IPV__dose-1", childKeys: ["c2"] })], events: [DTAP, OTHER] });
  assert.strictEqual(e.sb.autoLinkNoteHtml(DTAP), '<p class="auto-link-note">예약됨 10/14</p>');
  assert.strictEqual(e.sb.autoLinkInlineHtml(DTAP), '<span class="ri-reserved">예약됨 10/14</span>');
  assert.strictEqual(e.sb.autoLinkNoteHtml(OTHER), "");
  const done = env({ docs: [{ ...linkedDoc(), status: "DONE" }], events: [DTAP] });
  assert.strictEqual(done.sb.autoLinkNoteHtml(DTAP), "");
});
test("상세 버튼: 연결 가능·미완료·활성 아이가 있을 때만, 예약이 있으면 보기 버튼 — 완료된 항목·연결 대상 아님·아이 없음은 버튼 없음", () => {
  const e = env({ events: [DTAP] });
  assert.ok(e.sb.autoLinkButtonHtml(DTAP, false).includes('id="btn-auto-reserve"'));
  assert.strictEqual(e.sb.autoLinkButtonHtml(DTAP, true), "");
  assert.strictEqual(e.sb.autoLinkButtonHtml(EV("SF-08__default", "안전", DEF("SF-08", "SF")), false), "");
  assert.strictEqual(env({ childKey: null }).sb.autoLinkButtonHtml(DTAP, false), "");
  const d = linkedDoc();
  const reserved = env({ docs: [d], events: [DTAP] }).sb.autoLinkButtonHtml(DTAP, false);
  assert.ok(reserved.includes('id="btn-auto-view"') && reserved.includes("예약됨 10/14 · 일정 보기") && reserved.includes(`data-auto-schedule="${d.id}"`));
  assert.ok(env({ events: [EV("OR-04__occ-1", "정기 치과검진", DEF("OR-04", "OR"))] }).sb.autoLinkButtonHtml(EV("OR-04__occ-1", "정기 치과검진", DEF("OR-04", "OR")), false).includes("btn-auto-reserve"));
});
test("예약 폼 열기: autoRef=항목 id·제목(확인 필요 표식 제거)·MEDICAL·활성 아이·날짜 비움, 안내 라벨 설정, 폼 1회 표시", () => {
  const e = env({ events: [DTAP] });
  e.sb.usOpenFormFromAuto(DTAP);
  const f = e.sb.us.form;
  assert.deepStrictEqual([f.autoRef, f.title, f.category, f.scope, f.childKeys, f.eventDate, f.assigneeMemberId, f.mode], ["VX-DTAP__dose-2", "DTaP 접종 (2차)", "MEDICAL", "CHILD", ["c1"], "", "m1", "create"]);
  assert.strictEqual(e.sb.us.autoLabel, "DTaP 접종 (2차)");
  assert.strictEqual(e.calls.shown, 1);
  e.sb.usOpenFormFromAuto(EV("SF-08__default", "안전", DEF("SF-08", "SF")));
  assert.strictEqual(e.calls.shown, 1, "연결 대상이 아니면 열지 않는다");
});
test("제목 조회 usAutoTitleOf: 별칭을 따라가고 항목을 못 찾으면 ''(배지 없음 — 끊긴 연결은 일반 일정)", () => {
  const e = env({ events: [DTAP], aliases: { "VX-OLD__dose-9": "VX-DTAP__dose-2" } });
  assert.strictEqual(e.sb.usAutoTitleOf("VX-DTAP__dose-2"), "DTaP 접종 (2차)");
  assert.strictEqual(e.sb.usAutoTitleOf("VX-OLD__dose-9"), "DTaP 접종 (2차)");
  assert.strictEqual(e.sb.usAutoTitleOf("VX-NOPE__dose-1"), "");
  const viaAlias = env({ docs: [linkedDoc({ autoRef: "VX-OLD__dose-9" })], events: [DTAP], aliases: { "VX-OLD__dose-9": "VX-DTAP__dose-2" } });
  assert.strictEqual(viaAlias.sb.autoLinkNoteHtml(DTAP), '<p class="auto-link-note">예약됨 10/14</p>');
});
test("연결 색인은 같은 동기 구간에서는 재사용되고 다음 틱에 새로 계산된다 · 시그니처는 연결이 바뀌면 달라진다", async () => {
  const e = env({ docs: [linkedDoc()], events: [DTAP] });
  const m1 = e.sb.autoLinks();
  assert.strictEqual(e.sb.autoLinks(), m1);
  const s1 = e.sb.usAutoLinkSig();
  e.o.docs.push(linkedDoc({ autoRef: "VX-IPV__dose-1", eventDate: "2026-10-20" }));
  await Promise.resolve(); await Promise.resolve();
  assert.notStrictEqual(e.sb.autoLinks(), m1);
  assert.notStrictEqual(e.sb.usAutoLinkSig(), s1);
});

console.log("앱 연결 존재 단언(변이 방지)");
test("선택일 패널은 autoLink ON 일 때 배지 옵션(autoTitleOf)을 dayPanel 에 넘기고, 월령 칸·기간 카드(remainingItemHtml)는 인라인 문구를 호출한다", () => {
  const panel = fnSrc(app, "usRenderDayPanel");
  assert.ok(/UserScheduleView\.dayPanel\(day, usLinks\(\), \{ docById: usDocById, \.\.\.\(autoLinkOn\(\) \? \{ autoTitleOf: usAutoTitleOf \} : \{\}\) \}\)/.test(panel));
  assert.ok(fnSrc(app, "remainingItemHtml").includes("${autoLinkInlineHtml(e)}"));
  assert.ok(fnSrc(app, "eventItemHtml").includes("${autoLinkNoteHtml(e)}"));
  assert.ok(fnSrc(app, "openDetail").includes("${autoLinkButtonHtml(e, isDone)}") && fnSrc(app, "openDetail").includes('el("btn-auto-reserve").addEventListener("click", () => usOpenFormFromAuto(e))') && fnSrc(app, "openDetail").includes('usOpenDetail(el("btn-auto-view").getAttribute("data-auto-schedule"), null)'));
});

console.log("플래그 OFF 불변(이전 커밋 소스 대비)");
test("eventItemHtml: 보조 문구 삽입 한 곳만 다르다", () => {
  assert.strictEqual(fnSrc(app, "eventItemHtml").replace("</p>${autoLinkNoteHtml(e)}\n", "</p>\n"), fnSrc(headApp, "eventItemHtml"));
});
test("remainingItemHtml: 인라인 문구 삽입 한 곳만 다르다", () => {
  assert.strictEqual(fnSrc(app, "remainingItemHtml").replace("${autoLinkInlineHtml(e)}", ""), fnSrc(headApp, "remainingItemHtml"));
});
test("openDetail: 버튼 자리와 핸들러 두 줄만 다르다", () => {
  const now = fnSrc(app, "openDetail").replace("      ${autoLinkButtonHtml(e, isDone)}\n", "").replace(/    if \(el\("btn-auto-reserve"\)\)[^\n]*\n    if \(el\("btn-auto-view"\)\)[^\n]*\n/, "");
  assert.strictEqual(now, fnSrc(headApp, "openDetail"));
});
test("usOpenForm·usShowForm: 라벨 초기화/전달만 다르다 · usSave 는 변경 없음", () => {
  assert.strictEqual(fnSrc(app, "usOpenForm").replace("    us.autoLabel = null;\n", ""), fnSrc(headApp, "usOpenForm"));
  assert.strictEqual(fnSrc(app, "usShowForm").replace(", autoLabel: us.autoLabel", ""), fnSrc(headApp, "usShowForm"));
  assert.strictEqual(app.slice(app.indexOf("  async function usSave()"), app.indexOf("\n  }\n", app.indexOf("  async function usSave()"))), headApp.slice(headApp.indexOf("  async function usSave()"), headApp.indexOf("\n  }\n", headApp.indexOf("  async function usSave()"))));
});
test("홈: ctx 에 autoLinkText 가 없거나 ''면 홈 HTML 이 이전 커밋과 글자까지 같다", () => {
  const run = (src, extra) => {
    const out = { html: null };
    const wrap = { set innerHTML(v) { out.html = v; }, get innerHTML() { return out.html; }, querySelectorAll: () => [] };
    const sb = { HNLogic, document: { getElementById: (id) => (id === "home-body" ? wrap : null) }, window: {} };
    vm.createContext(sb);
    vm.runInContext(src, sb);
    const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    const ev = (id, title, cat) => ({ id, title, category: cat, scheduleKind: "window", windowStart: new Date(2026, 9, 1), windowEnd: new Date(2026, 9, 20) });
    const events = [ev("VX-DTAP__dose-2", "DTaP 접종", "예방접종"), ev("b", "생활 점검", "생활")];
    sb.window.HNHome.render({
      profile: { birthDate: new Date(2026, 5, 20) }, completed: {}, today: new Date(2026, 9, 5), pregnant: false, ageNow: 3, events,
      CATEGORY_META: { 예방접종: { label: "접종", color: "#111" }, 생활: { label: "생활", color: "#222" } },
      esc, formatDateKR: () => "10월 1일", calGroupFor: () => ({ color: "#333" }), kindTagHtml: () => "", monthKeysOf: () => [3], periodRangeOf: () => null, periodGroupLabel: () => "기간", monthPeriodText: () => "3~5개월",
      bindOpen() {}, openTodos() {}, switchTab() {}, goCalendar() {}, showModal() {}, ...extra,
    });
    return out.html;
  };
  const oldHome = baseSrc("js/home.js");
  const base = run(oldHome);
  assert.ok(base.includes("DTaP 접종"));
  assert.strictEqual(run(read("js/home.js")), base);
  assert.strictEqual(run(read("js/home.js"), { autoLinkText: () => "" }), base);
  const withNote = run(read("js/home.js"), { autoLinkText: (e) => (e.id === "VX-DTAP__dose-2" ? "예약됨 10/14" : "") });
  assert.ok(withNote.includes("DTaP 접종 (예약됨 10/14)") && !withNote.includes("생활 점검 (예약됨"));
});
test("모델: hideLinked:false 면 연결이 있어도 추천일 표식을 숨기지 않는다(기본·true 는 숨김) — 앱은 autoLink 플래그를 넘긴다", () => {
  const { buildAuto, PROFILES } = require("./tools/load-engine.js");
  const auto = buildAuto(PROFILES.eunchan);
  const range = { start: "2026-09-01", end: "2027-03-31" };
  const run = (extra, docs) => CM.buildCalendarModel({ view: "month", range, filter: { scope: "ALL", showAuto: true }, auto: { events: auto.events, displayDates: auto.displayDates, completed: {}, childKey: "c1", ...extra }, user: { schedules: docs, childLinks: [], members: [] } });
  const base0 = run({}, []);
  let target = null;
  for (const [day, cell] of base0.days) { const e = cell.planned.find((x) => CM.isLinkableAuto(x)); if (e) { target = { day, id: e.id }; break; } }
  assert.ok(target);
  const docs = [linkedDoc({ autoRef: target.id })];
  const ids = (m) => m.days.get(target.day).planned.map((e) => e.id);
  assert.ok(!ids(run({}, docs)).includes(target.id) && !ids(run({ hideLinked: true }, docs)).includes(target.id));
  assert.deepStrictEqual(ids(run({ hideLinked: false }, docs)), ids(base0));
  assert.ok(/hideLinked: autoLinkOn\(\)/.test(app));
});

console.log("별칭 로더·데이터");
test("data/auto-id-aliases.json 은 빈 맵이고, 로더는 autoLink 플래그가 켜졌을 때만 읽으며 형식이 틀린 쌍은 버린다", () => {
  assert.deepStrictEqual(JSON.parse(read("data/auto-id-aliases.json")), {});
  assert.ok(/autoIdAliases = window\.FEATURES && window\.FEATURES\.autoLink === true \? sanitizeAliases\(await loadJsonOrNull\("data\/auto-id-aliases\.json"\)\) : \{\};/.test(app));
  const sb = {};
  vm.createContext(sb);
  vm.runInContext(fnSrc(app, "sanitizeAliases") + ";globalThis.f = sanitizeAliases;", sb);
  const clean = (x) => JSON.parse(JSON.stringify(x));
  assert.deepStrictEqual(clean(sb.f({})), {});
  assert.deepStrictEqual(clean(sb.f(null)), {});
  assert.deepStrictEqual(clean(sb.f([1])), {});
  assert.deepStrictEqual(clean(sb.f({ "VX-OLD__dose-1": "VX-NEW__dose-1", "bad": "VX-NEW__dose-1", "VX-A__dose-1": 5, "VX-B__dose-1": "x y" })), { "VX-OLD__dose-1": "VX-NEW__dose-1" });
  assert.ok(read("sw.js").includes('url.pathname.includes("/data/") && url.pathname.endsWith(".json")'), "data/*.json 은 서비스워커가 캐시하지 않는다(네트워크)");
});

console.log("수동 서버 검증 페이지");
test("test/firestore-autoref-manual-test.html: 자동 실행 없음(확인란+버튼), 일회용 가구 ID, 실제 user-schedule.js 사용, 시나리오(허용·거부·불변) 포함", () => {
  const h = read("test/firestore-autoref-manual-test.html");
  assert.ok(/<button id="run" disabled>/.test(h) && /id="ack"/.test(h));
  assert.ok(h.includes("../js/user-schedule.js") && h.includes("zz-autoref-") && h.includes("buildCreateDoc"));
  assert.ok(!/households\/(?!"|\$|'|\{)[A-Za-z0-9]{6,}/.test(h.replace(/zz-autoref-/g, "")), "실제 가구 ID 를 하드코딩하지 않는다");
  ["대조", "허용", "거부", "autoRef 변경", "autoRef 삭제", "scope=FAMILY", "childKeys 2개", "반복", "81자", "형식", "삭제"].forEach((w) => assert.ok(h.includes(w), w));
  assert.ok(h.includes("Firebase 콘솔") && h.includes("delete: false"), "정리 안내");
});

console.log(`\n${passed}개 통과${process.exitCode ? ", 일부 실패" : ""}`);
