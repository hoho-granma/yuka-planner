/*
 * F3 빠른 추가 칩 테스트 — 순수 템플릿/렌더(user-schedule-view), prepareSave 검증 통과, app.js 칩 핸들러(소스 추출 스텁), 홈 '일정 추가하기' 날짜.
 * 서버 호출 없음. 실행: node test/f3-quick-chips.test.js
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const V = require("../js/user-schedule-view.js");
const US = require("../js/user-schedule.js");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
let passed = 0, started = 0, finished = 0;
function test(name, fn) {
  started++;
  try { fn(); passed++; console.log("  ok  - " + name); } catch (e) { process.exitCode = 1; console.log("  FAIL- " + name + "\n      " + (e.stack || e).split("\n").slice(0, 6).join("\n      ")); }
  finished++;
}
process.on("exit", () => { if (started !== finished) { console.log(`FAIL- 끝나지 않은 테스트 ${started - finished}개`); process.exitCode = 1; } });

const LINKS = [{ childKey: "c1", displayName: "은찬", order: 1, familyCode: "AAA111" }];
const form = (over) => ({ ...V.newForm({ date: "2026-10-06", activeChildKey: "c1", links: LINKS, defaultAssigneeId: "m1" }), ...over });
const KEYS = ["hospital", "vaccine", "dental", "daycare", "outing"];

console.log("승인 문구·매핑");
test("영역 라벨과 칩 5개의 라벨·제목·분류가 확정본과 같다", () => {
  assert.strictEqual(V.MSG.quickLabel, "자주 쓰는 일정");
  assert.deepStrictEqual(V.QUICK_TEMPLATES.map((t) => [t.key, t.label, t.title, t.category]), [
    ["hospital", "병원 예약", "병원 예약", "MEDICAL"], ["vaccine", "예방접종", "예방접종 병원 예약", "MEDICAL"], ["dental", "치과", "치과 진료", "MEDICAL"],
    ["daycare", "어린이집 행사", "어린이집 행사", "INSTITUTION"], ["outing", "가족 외출", "가족 외출", "FAMILY"],
  ]);
  assert.ok(Object.isFrozen(V.QUICK_TEMPLATES) && V.QUICK_TEMPLATES.every((t) => Object.isFrozen(t)));
});
test("모든 칩의 분류가 기존 스키마 값(UserSchedule.CATEGORIES·화면 CATEGORIES)이다", () => {
  V.QUICK_TEMPLATES.forEach((t) => assert.ok(US.CATEGORIES.includes(t.category) && V.CATEGORIES.some((c) => c.key === t.category), t.key));
});

console.log("applyTemplate");
test("제목이 비었으면 칩 제목과 분류, 입력돼 있으면 제목은 보존하고 분류만 칩을 따른다", () => {
  assert.deepStrictEqual(V.applyTemplate(form(), "dental"), { title: "치과 진료", category: "MEDICAL" });
  assert.deepStrictEqual(V.applyTemplate(form({ title: "   " }), "dental"), { title: "치과 진료", category: "MEDICAL" });
  assert.deepStrictEqual(V.applyTemplate(form({ title: "소아과 김선생님", category: "ETC" }), "dental"), { title: "소아과 김선생님", category: "MEDICAL" });
});
test("폼을 바꾸지 않는다 · 모르는 키/폼 없음은 null", () => {
  const f = form({ title: "x" });
  const snap = JSON.stringify(f);
  V.applyTemplate(f, "outing");
  assert.strictEqual(JSON.stringify(f), snap);
  assert.strictEqual(V.applyTemplate(f, "nope"), null);
  assert.strictEqual(V.applyTemplate(null, "dental"), null);
});
test("5개 칩으로 만든 폼이 prepareSave(UserSchedule 검증)를 통과하고 allDay·날짜·담당·대상은 그대로다", () => {
  for (const k of KEYS) {
    const f = form();
    const next = V.applyTemplate(f, k);
    Object.assign(f, next);
    const r = V.prepareSave(f, 1790000000000);
    assert.ok(r.ok, k + " " + JSON.stringify(r.messages));
    assert.strictEqual(r.input.category, next.category);
    assert.strictEqual(r.input.title, next.title);
    assert.strictEqual(r.input.allDay, true);
    assert.strictEqual(r.input.eventDate, "2026-10-06");
    assert.strictEqual(r.input.assigneeMemberId, "m1");
    assert.strictEqual(r.input.scope, "CHILD");
    assert.deepStrictEqual(r.input.childKeys, ["c1"]);
  }
});

console.log("renderForm 마크업");
const rf = (f) => V.renderForm(f, LINKS, { members: [], messages: [] });
test("추가 모드 폼에만 칩 줄이 있고 제목 입력 위에 놓인다(5개, 라벨 포함)", () => {
  const h = rf(form());
  assert.ok(h.includes("자주 쓰는 일정"));
  KEYS.forEach((k) => assert.ok(h.includes(`data-us-quick="${k}"`), k));
  assert.strictEqual((h.match(/data-us-quick=/g) || []).length, 5);
  assert.ok(h.indexOf("data-us-quick") < h.indexOf('id="us-title"'));
});
test("수정 모드·반복 일정 편집 폼에는 칩이 없다", () => {
  const doc = { title: "수업", category: "LESSON", scope: "FAMILY", dateKind: "FIXED", eventDate: "2026-10-06", allDay: true, id: "s1" };
  assert.ok(!rf(V.formFromSchedule(doc)).includes("data-us-quick"));
  const rec = { ...doc, eventDate: undefined, recurrence: { freq: "WEEKLY", interval: 1, byDay: ["MO"], startDate: "2026-10-05", until: null } };
  assert.ok(!rf(V.formFromSchedule(rec)).includes("data-us-quick"));
});
test("칩 줄을 빼면 추가 폼 마크업은 변경 전과 같다(다른 부분 불변)", () => {
  const h = rf(form());
  const stripped = h.replace(/\s*<div class="us-field us-quick">.*?<\/div><\/div>/s, "");
  assert.ok(!stripped.includes("us-quick") && stripped.includes('id="us-title"') && stripped.includes("data-us-cat="));
});

console.log("app.js 칩 핸들러");
const app = read("js/app.js");
const a = app.indexOf("    const quick = ev.target.closest");
const b = app.indexOf("    const cat = ev.target.closest(\"[data-us-cat]\");", a);
assert.ok(a > 0 && b > a);
const handlerSrc = app.slice(a, b);
function run(f, key, titleInput) {
  const cats = V.CATEGORIES.map((c) => ({ key: c.key, active: c.key === f.category, getAttribute: () => c.key, classList: { toggle(n, on) { this.owner.active = on; }, owner: null } }));
  cats.forEach((c) => (c.classList.owner = c));
  const input = titleInput === null ? null : { value: f.title };
  const root = { querySelector: (s) => (s === "#us-title" ? input : null), querySelectorAll: (s) => (s === "[data-us-cat]" ? cats : []) };
  const ev = { target: { closest: (s) => (s === "[data-us-quick]" ? { getAttribute: () => key } : null) } };
  const us = { form: f };
  const sandbox = { UserScheduleView: V, ev, root, us, result: null };
  vm.createContext(sandbox);
  vm.runInContext(`(function(){\n${handlerSrc}\n result = "continued"; })()`, sandbox);
  return { us, input, cats, handled: sandbox.result === null };
}
test("칩: us.form 제목·분류 갱신, 제목 input.value·분류 칩 active 갱신, 폼 재렌더 없음, 이후 핸들러로 넘어가지 않음", () => {
  const f = form({ title: "" });
  const r = run(f, "vaccine");
  assert.ok(r.handled);
  assert.deepStrictEqual([f.title, f.category], ["예방접종 병원 예약", "MEDICAL"]);
  assert.strictEqual(r.input.value, "예방접종 병원 예약");
  assert.deepStrictEqual(r.cats.filter((c) => c.active).map((c) => c.key), ["MEDICAL"]);
  assert.ok(!/usShowForm|innerHTML/.test(handlerSrc), "재렌더 없음");
});
test("입력한 제목은 덮어쓰지 않고 시간·장소·메모·날짜·담당·대상·allDay 필드는 그대로", () => {
  const f = form({ title: "내 제목", allDay: false, startTime: "14:30", endTime: "15:00", location: "OO병원", memo: "메모", eventDate: "2026-10-09" });
  const before = JSON.stringify(f);
  run(f, "outing");
  const exp = { ...JSON.parse(before), category: "FAMILY" };
  assert.deepStrictEqual(JSON.parse(JSON.stringify(f)), exp);
  assert.strictEqual(f.title, "내 제목");
});
test("모르는 키는 아무것도 바꾸지 않는다 · 제목 input 이 없어도 던지지 않는다", () => {
  const f = form({ title: "", category: "ETC" });
  run(f, "nope");
  assert.deepStrictEqual([f.title, f.category], ["", "ETC"]);
  assert.doesNotThrow(() => run(form({ title: "" }), "dental", null));
});
test("연결: usOnModalClick 안에서 칩을 찾고(closest) 템플릿 적용 후 return 하며, 분류 칩 처리보다 앞에 있다", () => {
  const fn = app.slice(app.indexOf("  function usOnModalClick("), app.indexOf("  function usOnModalChange("));
  assert.ok(fn.includes('ev.target.closest("[data-us-quick]")'));
  assert.ok(/if \(quick\) \{[\s\S]*?UserScheduleView\.applyTemplate\(us\.form, quick\.getAttribute\("data-us-quick"\)\)[\s\S]*?return;\s*\}/.test(fn));
  assert.ok(fn.indexOf('closest("[data-us-quick]")') < fn.indexOf('closest("[data-us-cat]")'));
  assert.ok(app.includes('el("modal-content")') && /m\.addEventListener\("click", usOnModalClick\)/.test(app), "모달 클릭 위임 연결");
});
test("분류 칩은 두 번 눌러도(칩→직접 선택) 기존 분류 핸들러가 그대로 동작한다(소스 유지)", () => {
  assert.ok(/us\.form\.category = cat\.getAttribute\("data-us-cat"\);/.test(app));
});

console.log("홈 '일정 추가하기'(F1 후속)");
test("폼 날짜만 오늘로 열고 캘린더 선택일(selectedCalendarDate)은 바꾸지 않는다", () => {
  const s = app.slice(app.indexOf("      usAddFromHome()"), app.indexOf("      openDetail,"));
  assert.ok(/usOpenForm\(null, toISODate\(new Date\(\)\)\)/.test(s) && !/selectedCalendarDate/.test(s));
  const open = app.slice(app.indexOf("  function usOpenForm("), app.indexOf("  function usShowForm()"));
  assert.ok(/date: dateIso \|\| toISODate\(selectedCalendarDate\)/.test(open));
});

console.log(`\n${passed}개 통과${process.exitCode ? ", 일부 실패" : ""}`);
