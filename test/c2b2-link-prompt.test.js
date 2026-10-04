/*
 * C2-b2 테스트 — 연결된 AUTO·USER 완료 제안: 승인 문구 #6~#10(자동 완료·공식 연동 표현 금지), 제안 조건(U8 포함), 시트 선택별 동작,
 * 완료 객체 모양(toggleComplete 와 동일, 골든 T1)·C1-a 필드 단위 저장 경로, 중복 시트 가드, autoLink OFF·연결 없음 불변(이전 커밋 소스 대비).
 * app.js 연결은 소스에서 꺼내 스텁으로 실행한다. 서버 호출 없음. 실행: node test/c2b2-link-prompt.test.js
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
// sync.js 는 스텁 firebase 위에서 실행한다(diffCompleted 는 순수 함수 — 서버 호출 없음).
const FamilySync = (() => {
  class FieldPath {}
  const firebase = { initializeApp() {}, firestore: Object.assign(() => ({ collection: () => ({ doc: () => ({}) }) }), { FieldValue: { serverTimestamp: () => 0, delete: () => 0 }, FieldPath }) };
  const win = {};
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/sync.js"), "utf8"), vm.createContext({ firebase, window: win, localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} }, console }));
  return win.FamilySync;
})();
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
const BASE = "a9a0719"; // C2-b1 커밋(이번 변경 직전)
const baseSrc = (f) => execSync(`git show ${BASE}:${f}`, { cwd: ROOT, encoding: "utf8" });
let passed = 0, started = 0, finished = 0;
function test(name, fn) {
  started++;
  const ok = () => { passed++; finished++; console.log("  ok  - " + name); };
  const bad = (e) => { process.exitCode = 1; finished++; console.log("  FAIL- " + name + "\n      " + (e.stack || e).split("\n").slice(0, 6).join("\n      ")); };
  try { const r = fn(); if (r && typeof r.then === "function") r.then(ok, bad); else ok(); } catch (e) { bad(e); }
}
process.on("exit", () => { if (started !== finished) { console.log(`FAIL- 끝나지 않은 테스트 ${started - finished}개`); process.exitCode = 1; } });

const app = read("js/app.js");
const headApp = baseSrc("js/app.js");
const fnSrc = (src, name, pre = "  function ") => { const a = src.indexOf(`${pre}${name}(`); assert.ok(a >= 0, name); const b = src.indexOf("\n  }\n", a); return src.slice(a, b + 5).replace(/ChildTimeline\.completedMonths\(/g, "ageInMonths("); }; // W1: 월령 호출이 정본(ChildTimeline.completedMonths)으로 바뀐 것은 같은 동작이라 옛 이름으로 맞춰 비교한다

console.log("승인 문구 #6~#10");
test("제목·본문·버튼 문구가 확정본과 같고, 접종/검진/그 밖 분기", () => {
  const M = V.MSG;
  assert.strictEqual(M.linkRecordTitle("접종"), "접종 기록도 남길까요?");
  assert.strictEqual(M.linkRecordTitle("검진"), "검진 기록도 남길까요?");
  assert.strictEqual(M.linkRecordTitle(""), "기록도 남길까요?");
  assert.strictEqual(M.linkRecordBody("예방접종 병원 예약", "10/14", "DTaP 접종 (2차)"), "‘예방접종 병원 예약’(10/14)을 완료로 표시했어요. ‘DTaP 접종 (2차)’도 완료로 기록할까요?");
  assert.deepStrictEqual([M.linkRecordYes, M.linkRecordNo], ["예, 기록할게요", "아니요"]);
  assert.strictEqual(M.linkKeepTitle, "예약 일정은 어떻게 할까요?");
  assert.strictEqual(M.linkKeepBody("DTaP 접종 (2차)", "10/14"), "‘DTaP 접종 (2차)’을 완료했어요. 예약 일정(10/14)은 그대로 둘까요?");
  assert.deepStrictEqual([M.linkKeepStay, M.linkKeepDone], ["그대로 두기", "일정도 완료"]);
  assert.deepStrictEqual([V.linkKindWord("예방접종"), V.linkKindWord("영유아검진"), V.linkKindWord("생활·수유"), V.linkKindWord(undefined)], ["접종", "검진", "", ""]);
});
test("문구 어디에도 '자동 완료'·'공식 기록 연동' 류 표현이 없다(사용자가 답하는 방식만)", () => {
  const all = [V.MSG.linkRecordTitle("접종"), V.MSG.linkRecordBody("a", "1/1", "b"), V.MSG.linkRecordYes, V.MSG.linkRecordNo, V.MSG.linkKeepTitle, V.MSG.linkKeepBody("b", "1/1"), V.MSG.linkKeepStay, V.MSG.linkKeepDone].join(" ");
  assert.ok(!/자동|연동|공식|질병관리|예방접종도우미|동기화/.test(all), all);
});
test("시트 마크업: 버튼 액션 4종, 이스케이프, 중복 방지 표식(us-link-prompt)", () => {
  const r = V.renderLinkRecordSheet({ word: "접종", scheduleTitle: '<b>"예약"</b>', date: "2026-10-14", item: "DTaP & <i>" });
  assert.ok(r.includes("us-link-prompt") && r.includes('data-us-action="link-record"') && r.includes('data-us-action="link-skip"') && r.includes("접종 기록도 남길까요?"));
  assert.ok(!r.includes("<b>") && !r.includes("<i>") && r.includes("&lt;b&gt;") && r.includes("(10/14)"));
  const k = V.renderLinkKeepSheet({ item: "DTaP", date: "2026-10-14" });
  assert.ok(k.includes("us-link-prompt") && k.includes('data-us-action="link-keep"') && k.includes('data-us-action="link-complete"') && k.includes("예약 일정(10/14)은 그대로 둘까요?"));
});

console.log("제안 조건(autoCompleteTarget)");
const EV = (id, category, def) => ({ id, category, detail: { definition: def || { todo_id: id.split("__")[0], category: "VX" } } });
const DTAP = EV("VX-DTAP__dose-2", "예방접종");
const ctx = (over) => ({ activeChildKey: "c1", resolveId: (r) => r, eventOf: (id) => (id === DTAP.id ? DTAP : null), isLinkable: CM.isLinkableAuto, isDone: () => false, todayIso: "2026-10-14", ...over });
const doc = (over) => ({ ...US.buildCreateDoc({ sourceType: "MANUAL", title: "예약", category: "MEDICAL", scope: "CHILD", childKeys: ["c1"], allDay: true, dateKind: "FIXED", eventDate: "2026-10-14", autoRef: "VX-DTAP__dose-2", ...over }, 1).doc, status: "DONE", id: "s1" });
test("조건을 모두 만족하면 AUTO id, 일정 날짜가 오늘이면 포함(≤ 오늘)", () => {
  assert.strictEqual(V.autoCompleteTarget(doc(), ctx()), DTAP.id);
  assert.strictEqual(V.autoCompleteTarget(doc({ eventDate: "2026-09-01" }), ctx()), DTAP.id);
});
test("미래 날짜 일정(U8)·완료 아님·기간(PERIOD)·날짜 없음은 제안 안 함", () => {
  assert.strictEqual(V.autoCompleteTarget(doc({ eventDate: "2026-10-15" }), ctx()), null);
  assert.strictEqual(V.autoCompleteTarget({ ...doc(), status: "TODO" }, ctx()), null);
  assert.strictEqual(V.autoCompleteTarget(doc({ eventDate: undefined, dateKind: "PERIOD", periodStart: "2026-10-01", periodEnd: "2026-10-30" }), ctx()), null);
  assert.strictEqual(V.autoCompleteTarget({ ...doc(), eventDate: undefined }, ctx()), null);
});
test("autoRef 없음·다른 아이·활성 아이 없음·해석 안 됨·연결 대상 아님·이미 완료면 제안 안 함", () => {
  assert.strictEqual(V.autoCompleteTarget({ ...doc(), autoRef: undefined }, ctx()), null);
  assert.strictEqual(V.autoCompleteTarget(doc({ childKeys: ["c2"] }), ctx()), null);
  assert.strictEqual(V.autoCompleteTarget(doc(), ctx({ activeChildKey: null })), null);
  assert.strictEqual(V.autoCompleteTarget(doc({ autoRef: "VX-NOPE__dose-1" }), ctx()), null);
  assert.strictEqual(V.autoCompleteTarget(doc(), ctx({ eventOf: () => EV("SF-08__default", "안전·돌봄", { todo_id: "SF-08", category: "SF" }) })), null);
  assert.strictEqual(V.autoCompleteTarget(doc(), ctx({ isDone: (id) => id === DTAP.id })), null);
  assert.strictEqual(V.autoCompleteTarget(null, ctx()), null);
  assert.strictEqual(V.autoCompleteTarget(doc(), null), null);
});
test("별칭으로 해석된 새 id 를 쓴다", () => {
  assert.strictEqual(V.autoCompleteTarget(doc({ autoRef: "VX-OLD__dose-9" }), ctx({ resolveId: (r) => (r === "VX-OLD__dose-9" ? DTAP.id : r) })), DTAP.id);
});

console.log("app.js 연결(소스 추출 스텁)");
const a0 = app.indexOf("  // ── C2-b2 완료 제안");
const a1 = app.indexOf("  /** 홈 '다가오는 가족 일정' 카드(F1).");
assert.ok(a0 > 0 && a1 > a0);
const blockSrc = app.slice(a0, a1);
const toggleSrc = fnSrc(app, "toggleComplete");
const patchSrc = app.slice(app.indexOf("  async function usPatchAction("), app.indexOf("\n  }\n", app.indexOf("  async function usPatchAction(")) + 5);

function mkEl() {
  const dom = { content: { innerHTML: "", querySelector(sel) { return sel === ".us-link-prompt" && this.innerHTML.includes("us-link-prompt") ? {} : null; } }, modalHidden: true };
  return {
    dom,
    el: (id) => (id === "modal-content" ? dom.content : { classList: { contains: () => dom.modalHidden, remove: () => (dom.modalHidden = false), add: () => (dom.modalHidden = true) } }),
  };
}
function env(opts) {
  const o = { flag: true, completed: {}, docs: [], events: [DTAP], childKey: "c1", aliases: {}, today: new Date(2026, 9, 14), ...opts };
  const log = { save: 0, sync: [], refresh: 0, close: 0, patch: [], suggest: [] };
  const { dom, el } = mkEl();
  const completed = o.completed;
  const sandbox = {
    console, Promise, JSON, Object, RegExp, String, Number,
    Date: class FixedDate extends Date { constructor(...a) { if (a.length) super(...a); else super(o.today.getTime()); } }, // "지금"을 고정(제안 조건의 일정 날짜 ≤ 오늘)
    CalendarModel: CM, UserScheduleView: V, UserSchedule: US,
    el, completed, schedule: o.events, autoIdAliases: o.aliases, NA_SUFFIX: "__na", modalMode: null, currentDayContext: null,
    us: { linkPrompt: null }, autoLinkOn: () => o.flag, autoLinks: () => (o.flag ? CM.linksByAutoId(o.docs, o.childKey, o.aliases) : null),
    usActiveChildKey: () => o.childKey, usAutoTitleOfEvent: (e) => `${e.id} 제목`, toISODate: (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
    saveCompleted: () => log.save++, syncCompletedChanges: (b) => log.sync.push({ ...b }), refreshSchedule: () => log.refresh++, closeDetail: () => { log.close++; dom.modalHidden = true; dom.content.innerHTML = ""; },
    usPatchAction: (id, build, opts2) => { log.patch.push({ id, build, opts: opts2 }); },
    renderDayList() {}, openDetail() {}, usRefreshCalendar() {}, usModalNote() {},
    usSuggestAutoComplete: undefined, // 아래에서 실제 블록이 정의
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(blockSrc + "\n" + toggleSrc + "\n;Object.assign(globalThis, { usSuggestAutoComplete, applyAutoCompleteFromLink, usLinkRecordYes, usAfterAutoComplete, usLinkCompleteSchedule, usLinkPromptOpen, toggleComplete });", sandbox);
  return { sb: sandbox, log, dom, o };
}

test("USER→AUTO(autoLink ON·조건 충족): 시트만 열고 completed 는 아직 그대로, 동기화·저장 호출 없음", () => {
  const e = env();
  e.sb.usSuggestAutoComplete(doc());
  assert.ok(e.dom.content.innerHTML.includes("접종 기록도 남길까요?") && e.dom.content.innerHTML.includes("‘예약’(10/14)을 완료로 표시했어요."));
  assert.deepStrictEqual(Object.keys(e.o.completed), []);
  assert.deepStrictEqual([e.log.save, e.log.sync.length, e.log.refresh], [0, 0, 0]);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(e.sb.us.linkPrompt)), { kind: "toAuto", autoId: DTAP.id, date: "2026-10-14" });
});
test("'예, 기록할게요': 일정 날짜 정오로 완료 기록 1건 · 저장 1회 · 필드 단위 동기화 1회(변경 전 복사본) · 전체 갱신 1회 · 시트 닫힘", () => {
  const e = env({ completed: { "OTHER__default": { done: true } } });
  e.sb.usSuggestAutoComplete(doc());
  e.sb.usLinkRecordYes();
  const rec = e.o.completed[DTAP.id];
  assert.deepStrictEqual(Object.keys(rec).sort(), ["done", "occurrenceKey", "recordType", "recordedAt", "todo_id"]);
  assert.deepStrictEqual([rec.done, rec.todo_id, rec.occurrenceKey, rec.recordType], [true, "VX-DTAP", "dose-2", "TODO_COMPLETED"]);
  assert.strictEqual(rec.recordedAt, new Date(2026, 9, 14, 12, 0, 0).toISOString());
  assert.deepStrictEqual([e.log.save, e.log.sync.length, e.log.refresh, e.log.close], [1, 1, 1, 1]);
  assert.deepStrictEqual(Object.keys(e.log.sync[0]), ["OTHER__default"], "동기화에 넘긴 before 에는 새 키가 없다 → 새 키만 diff");
  assert.deepStrictEqual(Object.keys(e.o.completed).sort(), ["OTHER__default", DTAP.id]);
  assert.strictEqual(e.sb.us.linkPrompt, null);
});
test("골든 T1: 새 완료 객체는 toggleComplete 가 만든 객체와 키·값이 같고 recordedAt 형식만 일정 날짜 정오다", () => {
  const a = env();
  a.sb.toggleComplete(DTAP.id);
  const viaToggle = JSON.parse(JSON.stringify(a.o.completed[DTAP.id]));
  const b = env();
  b.sb.applyAutoCompleteFromLink(DTAP.id, "2026-10-14");
  const viaLink = JSON.parse(JSON.stringify(b.o.completed[DTAP.id]));
  const { recordedAt: r1, ...t } = viaToggle;
  const { recordedAt: r2, ...l } = viaLink;
  assert.deepStrictEqual(l, t);
  assert.ok(!isNaN(Date.parse(r1)) && !isNaN(Date.parse(r2)));
  assert.strictEqual(Object.keys(a.o.completed).length, Object.keys(b.o.completed).length, "milestone 등 부가 키 없음");
  // 저장 경로는 둘 다 C1-a(syncCompletedChanges 1회)
  assert.deepStrictEqual([a.log.save, a.log.sync.length, a.log.refresh], [b.log.save, b.log.sync.length, b.log.refresh]);
});
test("실제 sync.js diffCompleted 로 보면 새 완료 키 하나만 set, remove 없음(필드 단위)", () => {
  const e = env({ completed: { "OTHER__default": { done: true, x: 1 } } });
  const before = { ...e.o.completed };
  e.sb.applyAutoCompleteFromLink(DTAP.id, "2026-10-14");
  const d = FamilySync.diffCompleted(before, e.o.completed);
  assert.deepStrictEqual(JSON.parse(JSON.stringify([Object.keys(d.set), d.remove])), [[DTAP.id], []]); // 다른 vm 영역의 배열이라 JSON 으로 비교
});
test("applyAutoCompleteFromLink: 이미 완료·없는 항목·연결 대상 아님·날짜 형식 오류는 아무것도 쓰지 않는다(false)", () => {
  const e = env({ completed: { [DTAP.id]: { done: true } } });
  assert.strictEqual(e.sb.applyAutoCompleteFromLink(DTAP.id, "2026-10-14"), false);
  const e2 = env();
  assert.strictEqual(e2.sb.applyAutoCompleteFromLink("VX-NOPE__dose-1", "2026-10-14"), false);
  assert.strictEqual(env({ events: [EV("SF-08__default", "안전·돌봄", { todo_id: "SF-08", category: "SF" })] }).sb.applyAutoCompleteFromLink("SF-08__default", "2026-10-14"), false);
  assert.strictEqual(e2.sb.applyAutoCompleteFromLink(DTAP.id, "2026/10/14"), false);
  assert.strictEqual(e2.sb.applyAutoCompleteFromLink(DTAP.id, ""), false);
  assert.deepStrictEqual([e.log.save, e2.log.save, e2.log.sync.length], [0, 0, 0]);
});
test("미응답 처리 삭제: 완료 기록 시 같은 항목의 '미해당(__na)' 표시는 toggleComplete 처럼 지운다", () => {
  const e = env({ completed: { [DTAP.id + "__na"]: { done: true } } });
  e.sb.applyAutoCompleteFromLink(DTAP.id, "2026-10-14");
  assert.ok(!(DTAP.id + "__na" in e.o.completed) && e.o.completed[DTAP.id]);
});
test("'아니요': USER 만 DONE — completed 불변, 저장·동기화·갱신 없음, 시트 닫힘(link-skip 은 closeDetail 만)", () => {
  assert.ok(/if \(act === "link-skip" \|\| act === "link-keep"\) return closeDetail\(\);/.test(app));
  const e = env();
  e.sb.usSuggestAutoComplete(doc());
  e.sb.closeDetail();
  assert.deepStrictEqual([Object.keys(e.o.completed).length, e.log.save, e.log.sync.length, e.log.refresh], [0, 0, 0, 0]);
});
test("제안 안 함: 플래그 OFF·이미 완료·미래 날짜·다른 아이·연결 없는 일정 → 시트도 쓰기도 없음", () => {
  for (const [name, e, d] of [
    ["OFF", env({ flag: false }), doc()],
    ["이미 완료", env({ completed: { [DTAP.id]: { done: true } } }), doc()],
    ["미래", env(), doc({ eventDate: "2026-10-15" })],
    ["다른 아이", env(), doc({ childKeys: ["c2"] })],
    ["연결 없음", env(), { ...doc(), autoRef: undefined }],
  ]) {
    e.sb.usSuggestAutoComplete(d);
    assert.strictEqual(e.dom.content.innerHTML, "", name);
    assert.deepStrictEqual([e.log.save, e.log.sync.length, e.log.refresh], [0, 0, 0], name);
  }
});
test("중복 시트 가드: 시트가 열려 있으면 다른 제안을 열지 않고, 닫히면 다시 열린다", () => {
  const todoDoc = doc(); todoDoc.status = "TODO";
  const e = env({ docs: [todoDoc] }); // 연결된 미완료 예약이 있어 가드가 없으면 AUTO→USER 시트가 덮어쓰게 되는 상황
  e.sb.usSuggestAutoComplete(doc());
  const first = e.dom.content.innerHTML;
  e.sb.usSuggestAutoComplete(doc({ title: "다른 일정" }));
  assert.strictEqual(e.dom.content.innerHTML, first);
  e.sb.usAfterAutoComplete(DTAP.id); // AUTO→USER 제안도 막힌다
  assert.strictEqual(e.dom.content.innerHTML, first);
  e.sb.closeDetail();
  e.sb.usSuggestAutoComplete(doc({ title: "다른 일정" }));
  assert.ok(e.dom.content.innerHTML.includes("다른 일정"));
});
test("별칭(usResolveAutoId): 옛 id 로 저장된 연결이 새 AUTO 로 해석돼 제안·안내가 작동하고, 해석되지 않으면 제안이 없다", () => {
  const OLD_ID = "VX-OLD__dose-9";
  const oldDoc = (status) => ({ ...doc({ autoRef: OLD_ID }), status });
  // 별칭 있음: USER→AUTO 제안이 새 AUTO(DTAP)로 열리고, 예를 누르면 새 id 로 완료 기록
  const withAlias = env({ aliases: { [OLD_ID]: DTAP.id } });
  withAlias.sb.usSuggestAutoComplete(oldDoc("DONE"));
  assert.ok(withAlias.dom.content.innerHTML.includes("접종 기록도 남길까요?"));
  assert.strictEqual(withAlias.sb.us.linkPrompt.autoId, DTAP.id);
  withAlias.sb.usLinkRecordYes();
  assert.ok(withAlias.o.completed[DTAP.id] && !(OLD_ID in withAlias.o.completed));
  // 별칭 없음: 옛 id 는 해석되지 않아 제안 없음·쓰기 없음
  const noAlias = env({ aliases: {} });
  noAlias.sb.usSuggestAutoComplete(oldDoc("DONE"));
  assert.strictEqual(noAlias.dom.content.innerHTML, "");
  assert.deepStrictEqual([Object.keys(noAlias.o.completed).length, noAlias.log.save], [0, 0]);
  // AUTO→USER 안내: 옛 autoRef 일정도 별칭으로 새 AUTO 의 연결로 잡힌다
  const keep = env({ docs: [oldDoc("TODO")], aliases: { [OLD_ID]: DTAP.id } });
  keep.sb.usAfterAutoComplete(DTAP.id);
  assert.ok(keep.dom.content.innerHTML.includes("예약 일정은 어떻게 할까요?"));
  const keepNo = env({ docs: [oldDoc("TODO")], aliases: {} });
  keepNo.sb.usAfterAutoComplete(DTAP.id);
  assert.strictEqual(keepNo.dom.content.innerHTML, "");
});
test("AUTO→USER: 연결된 미완료 예약이 있으면 시트(#9), 완료된 예약·연결 없음·OFF·날짜 없음은 시트 없음", () => {
  const d = doc(); d.status = "TODO";
  const e = env({ docs: [d] });
  e.sb.usAfterAutoComplete(DTAP.id);
  assert.ok(e.dom.content.innerHTML.includes("예약 일정은 어떻게 할까요?") && e.dom.content.innerHTML.includes("예약 일정(10/14)은 그대로 둘까요?"));
  assert.deepStrictEqual(JSON.parse(JSON.stringify(e.sb.us.linkPrompt)), { kind: "toUser", scheduleId: "s1" });
  for (const [name, x] of [["완료된 예약", env({ docs: [doc()] })], ["연결 없음", env({ docs: [] })], ["OFF", env({ flag: false, docs: [d] })], ["다른 아이", env({ docs: [{ ...d, childKeys: ["c2"] }] })]]) {
    x.sb.usAfterAutoComplete(DTAP.id);
    assert.strictEqual(x.dom.content.innerHTML, "", name);
  }
});
test("AUTO→USER 시트 선택: '그대로 두기'는 아무 쓰기 없음, '일정도 완료'는 기존 patch 경로(usPatchAction + markDone, suggestOnDone 없음 → 시트 재발화 없음)", () => {
  const d = doc(); d.status = "TODO";
  const e = env({ docs: [d] });
  e.sb.usAfterAutoComplete(DTAP.id);
  e.sb.usLinkCompleteSchedule();
  assert.strictEqual(e.log.patch.length, 1);
  const p = e.log.patch[0];
  assert.deepStrictEqual([p.id, p.opts], ["s1", undefined]);
  const { id, ...before } = d;
  const r = p.build(before, 1790000000000);
  assert.ok(r.ok && r.after.status === "DONE" && r.after.autoRef === d.autoRef && !("autoRef" in r.patch));
  assert.strictEqual(e.sb.us.linkPrompt, null);
  assert.deepStrictEqual([Object.keys(e.o.completed).length, e.log.save], [0, 0], "AUTO 쪽은 건드리지 않는다");
  // 그대로 두기
  const k = env({ docs: [d] });
  k.sb.usAfterAutoComplete(DTAP.id);
  k.sb.closeDetail();
  assert.strictEqual(k.log.patch.length, 0);
});
test("toggleComplete: 완료 방향에서만 연결 예약 안내를 부르고, 완료 취소 방향은 아무것도 부르지 않는다", () => {
  const d = doc(); d.status = "TODO";
  const e = env({ docs: [d] });
  e.sb.toggleComplete(DTAP.id); // 완료 방향
  assert.ok(e.dom.content.innerHTML.includes("예약 일정은 어떻게 할까요?"));
  const prompts = [];
  e.sb.closeDetail();
  e.sb.toggleComplete(DTAP.id); // 완료 취소 방향
  assert.strictEqual(e.dom.content.innerHTML, "");
  assert.ok(!e.o.completed[DTAP.id]);
  assert.ok(prompts.length === 0);
});
test("toggleComplete 완료 방향: 연결이 없거나 autoLink OFF 면 시트 없이 이전과 같은 결과", () => {
  for (const e of [env({ docs: [] }), env({ flag: false, docs: [(() => { const d = doc(); d.status = "TODO"; return d; })()] })]) {
    e.sb.toggleComplete(DTAP.id);
    assert.strictEqual(e.dom.content.innerHTML, "");
    assert.ok(e.o.completed[DTAP.id]);
  }
});

console.log("usPatchAction 훅");
function patchEnv(res) {
  const log = { suggest: [], notes: [], closed: 0, refreshed: 0 };
  const sb = {
    console: { error() {}, log() {} }, Date, Promise, UserScheduleView: { stripId: (d) => { const { id, ...r } = d; return r; }, MSG: { exceptionsFull: "x", actionFail: "fail" }, messagesFromErrors: () => [] },
    usDocById: (id) => (id === "s1" ? { id: "s1", status: "TODO" } : null), HouseholdSync: { patchSchedule: async () => ({ ok: true }) }, hh: { hid: "h" },
    closeDetail: () => log.closed++, usRefreshCalendar: () => log.refreshed++, usModalNote: (t) => log.notes.push(t),
    usSuggestAutoComplete: (d) => log.suggest.push(d),
  };
  vm.createContext(sb);
  vm.runInContext(patchSrc + ";globalThis.usPatchAction = usPatchAction;", sb);
  return { sb, log, res };
}
test("usPatchAction: suggestOnDone ∧ 결과가 DONE 일 때만 제안 호출(원래 id 포함), 닫기·갱신 뒤에 호출", async () => {
  const p = patchEnv();
  await p.sb.usPatchAction("s1", () => ({ ok: true, patch: {}, after: { status: "DONE", autoRef: "A__b" } }), { suggestOnDone: true });
  assert.strictEqual(p.log.suggest.length, 1);
  assert.deepStrictEqual([p.log.suggest[0].id, p.log.suggest[0].autoRef, p.log.closed, p.log.refreshed], ["s1", "A__b", 1, 1]);
  const q = patchEnv();
  await q.sb.usPatchAction("s1", () => ({ ok: true, patch: {}, after: { status: "DONE" } })); // 옵션 없음(삭제·복원·일정도 완료)
  await q.sb.usPatchAction("s1", () => ({ ok: true, patch: {}, after: { status: "TODO" } }), { suggestOnDone: true }); // 되돌림
  assert.strictEqual(q.log.suggest.length, 0);
});
test("usPatchAction: 실패(invalid-patch·서버 거부)면 제안하지 않고 오류 안내만", async () => {
  const p = patchEnv();
  await p.sb.usPatchAction("s1", () => ({ ok: false, errors: [] }), { suggestOnDone: true });
  p.sb.HouseholdSync.patchSchedule = async () => ({ ok: false, reason: "denied" });
  await p.sb.usPatchAction("s1", () => ({ ok: true, patch: {}, after: { status: "DONE" } }), { suggestOnDone: true });
  assert.strictEqual(p.log.suggest.length, 0);
  assert.strictEqual(p.log.notes.length, 2);
});
test("연결: 비반복 일정의 '완료' 버튼만 suggestOnDone 을 켠다(반복 회차·복원·삭제는 아님) · 시트 버튼 4종이 모달 클릭 처리에 연결", () => {
  assert.ok(app.includes("UserSchedule.markDone(before, now)), { suggestOnDone: true });"));
  assert.ok(!/suggestOnDone/.test(app.slice(app.indexOf("if (rec) return usPatchAction"), app.indexOf("if (rec) return usPatchAction") + 330)));
  assert.strictEqual((app.match(/suggestOnDone: true/g) || []).length, 1);
  ["link-record", "link-skip", "link-keep", "link-complete"].forEach((a) => assert.ok(app.includes(`"${a}"`), a));
  assert.ok(/if \(act === "link-record"\) return usLinkRecordYes\(\);/.test(app) && /if \(act === "link-complete"\) return usLinkCompleteSchedule\(\);/.test(app));
});

console.log("OFF·연결 없음 불변(이전 커밋 소스 대비)");
test("toggleComplete: 훅 한 줄만 다르다", () => {
  assert.strictEqual(toggleSrc.replace(/\n    if \(!wasDone && completed\[id\]\) usAfterAutoComplete\(id\);[^\n]*/, ""), fnSrc(headApp, "toggleComplete"));
});
test("usPatchAction: opts 인자와 제안 호출 한 줄만 다르다", () => {
  const headPatch = headApp.slice(headApp.indexOf("  async function usPatchAction("), headApp.indexOf("\n  }\n", headApp.indexOf("  async function usPatchAction(")) + 5);
  assert.strictEqual(patchSrc.replace("usPatchAction(id, build, opts)", "usPatchAction(id, build)").replace(/\n      if \(opts && opts\.suggestOnDone[^\n]*/, ""), headPatch);
});
test("completed 를 쓰는 기존 함수(setCompletionDate·setNotApplicable·openDetail)는 이전 커밋과 글자까지 같다", () => {
  ["setCompletionDate", "setNotApplicable", "openDetail", "eventItemHtml"].forEach((n) => assert.strictEqual(fnSrc(app, n), fnSrc(headApp, n), n));
});
test("스키마·규칙·AUTO 계산·모델 파일은 이 작업에서 바뀌지 않았다(C2-b1 커밋 이후 작업본 diff)", () => {
  const changed = execSync(`git diff --name-only ${BASE} 90c9740`, { cwd: ROOT, encoding: "utf8" });
  ["firestore.rules", "js/user-schedule.js", "js/calendar-model.js", "js/hn-logic.js", "js/todo-engine.js", "js/schedule.js", "js/sync.js", "js/household-sync.js"].forEach((f) => assert.ok(!changed.split("\n").includes(f), f));
});

console.log(`\n${passed}개 통과${process.exitCode ? ", 일부 실패" : ""}`);
