/*
 * K8 — 임신 입력 방식(예정일 / 지금 몇 주 / 임신 확인일): 계산, 확인일 앵커(PREG-001·007), 앱 연결(기기 로컬 저장·마지막 입력 우선). 실행: node test/k8-pregnancy-basis.test.js
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
require("./tools/load-engine.js");
const PB = require("../js/pregnancy-basis.js");
const SP = require("../js/school-policy.js");
const ROOT = path.join(__dirname, "..");
const rd = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), "utf8"));
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const APP = read("js/app.js");
let passed = 0;
function test(name, fn) { try { fn(); passed++; console.log("  ok  - " + name); } catch (e) { process.exitCode = 1; console.log("  FAIL- " + name + "\n      " + (e.stack || e).split("\n").slice(0, 3).join("\n      ")); } }
const T = "2026-10-05";

console.log("계산(순수)");
test("지금 12주 3일 → 예정일 = 오늘 + (280 − 87)일, 임신 주수 되돌려 보면 같다", () => {
  const r = PB.resolve({ kind: "WEEKS", weeks: 12, days: 3, todayIso: T });
  assert.deepStrictEqual([r.ok, r.dueIso, r.basis], [true, "2027-04-16", { kind: "WEEKS", weeks: 12, days: 3, asOf: T }]);
  assert.deepStrictEqual(PB.gestationNow(r.dueIso, T), { weeks: 12, days: 3 });
});
test("임신 확인일 + 그날 주수: 예정일 = 확인일 + (280 − 확인 당시 임신일수), basis 에 확인일이 남는다", () => {
  const r = PB.resolve({ kind: "CONFIRM", confirmIso: "2026-09-01", weeks: 6, days: 0, todayIso: T });
  assert.deepStrictEqual([r.ok, r.dueIso, r.basis], [true, "2027-04-27", { kind: "CONFIRM", confirmDate: "2026-09-01", weeks: 6, days: 0 }]);
  assert.strictEqual(PB.confirmDateOf(r.basis), "2026-09-01");
  assert.strictEqual(PB.confirmDateOf({ kind: "WEEKS", weeks: 12, days: 3, asOf: T }), null);
});
test("예정일로 입력하면 basis 는 null(지움) — 마지막에 입력한 방식이 우선, 언제든 예정일로 되돌린다", () => {
  assert.deepStrictEqual(PB.resolve({ kind: "DUE", dueIso: "2027-01-15", todayIso: T }), { ok: true, dueIso: "2027-01-15", basis: null });
  assert.strictEqual(PB.resolve({ kind: "DUE", dueIso: "", todayIso: T }).error, "due");
});
test("검증: 주수 4~42·일 0~6, 확인일은 오늘 이전, 계산한 예정일이 너무 멀거나 지났으면 거부", () => {
  const w = (weeks, days) => PB.resolve({ kind: "WEEKS", weeks, days, todayIso: T });
  assert.strictEqual(w(3, 0).error, "weeks"); assert.strictEqual(w(43, 0).error, "weeks"); assert.strictEqual(w(12, 7).error, "weeks"); assert.strictEqual(w("x", 0).error, "weeks");
  assert.ok(w(4, 0).ok && w(42, 6).error === "range" && w(42, 0).ok);
  assert.strictEqual(PB.resolve({ kind: "CONFIRM", confirmIso: "2026-10-06", weeks: 6, days: 0, todayIso: T }).error, "confirm");
  assert.strictEqual(PB.resolve({ kind: "CONFIRM", confirmIso: "", weeks: 6, days: 0, todayIso: T }).error, "confirm");
  assert.strictEqual(PB.resolve({ kind: "CONFIRM", confirmIso: "2025-01-01", weeks: 6, days: 0, todayIso: T }).error, "range");
  assert.strictEqual(PB.resolve({ kind: "WEEKS", weeks: 12, days: 0, todayIso: "bad" }).error, "range");
});
test("저장값 정규화: 형식이 틀리면 버린다", () => {
  assert.deepStrictEqual(PB.normalizeBasis({ kind: "WEEKS", weeks: "12", days: 3, asOf: T }), { kind: "WEEKS", weeks: 12, days: 3, asOf: T });
  for (const bad of [null, {}, { kind: "WEEKS", weeks: 3, days: 0, asOf: T }, { kind: "CONFIRM", weeks: 6, days: 0, confirmDate: "2026-02-31" }, { kind: "DUE" }, "x"]) assert.strictEqual(PB.normalizeBasis(bad), null);
});

console.log("확인일 앵커(일정 엔진)");
const defs = ["health-checkup", "vaccination", "development", "feeding", "oral", "sleep", "safety", "daily-life", "childcare", "school", "school-age", "pregnancy"].flatMap((f) => rd(`data/todos/${f}.json`).todos).concat(rd("data/subsidies/national-todos.json").todos);
const subs = rd("data/subsidies/national.json").subsidies;
const timing = rd("data/policy/pregnancy-timing.json").items;
const schoolPolicy = SP.normalize(rd("data/policy/school.json"));
const build = (stage, extra) => global.__buildSchedule({ birthDate: new Date(2027, 3, 16), province: "서울특별시", district: "구로구", gender: "M", birthOrder: "first", stage, schoolPolicy, ...extra }, { todoDefinitions: defs, subsidy: { subsidies: subs }, pregnancyTiming: timing }, []);
const iso = (d) => d.toISOString ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}` : "";
const find = (ev, id) => ev.find((e) => e.id === id);
test("정책: PREG-001·007 만 startFrom:confirmDate (다른 항목 불변)", () => {
  assert.deepStrictEqual(Object.keys(timing).filter((k) => timing[k].startFrom === "confirmDate").sort(), ["PREG-001", "PREG-007"]);
  assert.strictEqual(timing["PREG-001"].endDays, -196); assert.strictEqual(timing["PREG-001"].startDays, -252);
});
test("임신 중 + 확인일 있음: PREG-001·007 의 시작이 그 날짜(끝 -196일은 그대로), 없으면 예정일 −252일 가정 그대로", () => {
  const base = build("pregnant", {});
  const withC = build("pregnant", { pregnancyConfirmDate: "2026-09-01" });
  assert.strictEqual(iso(find(base, "PREG-001").fixedDate), "2026-08-07", "가정값: 2027-04-16 −252일");
  for (const id of ["PREG-001", "PREG-007"]) {
    assert.strictEqual(iso(find(withC, id).fixedDate), "2026-09-01", id); assert.strictEqual(iso(find(withC, id).entryDate), "2026-09-01", id);
  }
  assert.strictEqual(iso(find(withC, "PREG-001").deadlineDate), iso(find(base, "PREG-001").deadlineDate), "끝(임신 12주)은 예정일 기준 그대로");
  for (const id of ["PREG-002", "PREG-005", "PREG-008"]) { const a = find(base, id), b = find(withC, id); if (a || b) assert.strictEqual(iso((a || {}).fixedDate), iso((b || {}).fixedDate), id + " 불변"); }
});
test("임신이 아니면 확인일 값은 무시, 확인일 형식이 틀리면 가정값으로", () => {
  const born = build("born", { pregnancyConfirmDate: "2026-09-01" }), born0 = build("born", {});
  assert.strictEqual(born.length, born0.length);
  assert.strictEqual(iso(find(build("pregnant", { pregnancyConfirmDate: "2026-02-31x" }), "PREG-001").fixedDate), "2026-08-07");
});

console.log("앱 연결");
const seg = () => {
  const a = APP.indexOf("  function pregnancyInfo(dueDate, today) {"), b = APP.indexOf("  function childDisplayName() {");
  const store = new Map();
  const sb = { PregnancyBasis: PB, esc: (s) => String(s), HNDatePicker: { markup: () => "", bindById: () => ({ set() {} }) }, formatDateKR: (d) => d.toISOString().slice(0, 10), datePickerOpts: () => ({}), toISODate: (d) => d.toISOString().slice(0, 10), JSON, Math, Date, Number, localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) }, familyCode: "F1", el: () => null };
  vm.createContext(sb);
  vm.runInContext(APP.slice(a, b) + ";globalThis.g={savePregBasis,pregBasisOf,pregConfirmIso,pbInitialState,pbMarkup,pbCollect};Object.defineProperty(globalThis,'reg',{get:()=>pregRegBasis,set:(v)=>{pregRegBasis=v}});", sb);
  return { sb, g: sb.g, store };
};
test("저장: 가족코드별로 기기 로컬에만(아이를 바꿔도 따로), 예정일로 입력하면 지운다, 형식이 깨진 값은 읽지 않는다", () => {
  const { g, store, sb } = seg();
  g.savePregBasis("F1", { kind: "CONFIRM", confirmDate: "2026-09-01", weeks: 6, days: 0 }); g.savePregBasis("F2", { kind: "WEEKS", weeks: 12, days: 3, asOf: T });
  assert.strictEqual(g.pregBasisOf("F1").confirmDate, "2026-09-01"); assert.strictEqual(g.pregBasisOf("F2").kind, "WEEKS");
  assert.strictEqual(g.pregConfirmIso(), "2026-09-01");
  sb.familyCode = "F2"; assert.strictEqual(g.pregConfirmIso(), null, "주수 방식은 확인일 앵커 없음");
  g.savePregBasis("F1", null); assert.strictEqual(g.pregBasisOf("F1"), null); assert.strictEqual(g.pregBasisOf("F2").kind, "WEEKS");
  store.set("hannun_preg_basis", "{깨짐"); assert.strictEqual(g.pregBasisOf("F1"), null);
  assert.ok(!APP.includes("FamilySync.updateProfile(familyCode, { ...") && /function profileToPlain\(p\) \{[^}]*birthDate: toISODate\(p\.birthDate\)/s.test(APP), "서버로 보내는 프로필 모양은 그대로(입력 방식은 서버에 안 감)");
});
test("아이 등록 중(pregRegBasis)에는 이전 아이의 값이 새지 않고 등록 중 값을 쓴다", () => {
  const { g, sb } = seg();
  g.savePregBasis("F1", { kind: "CONFIRM", confirmDate: "2026-09-01", weeks: 6, days: 0 });
  assert.strictEqual(g.pregConfirmIso(), "2026-09-01");
  sb.reg = null; assert.strictEqual(g.pregConfirmIso(), null, "새 아이를 예정일로 등록 중: 이전 아이(F1)의 확인일 무시");
  sb.reg = { kind: "CONFIRM", confirmDate: "2026-10-01", weeks: 5, days: 0 }; assert.strictEqual(g.pregConfirmIso(), "2026-10-01");
  sb.reg = undefined; assert.strictEqual(g.pregConfirmIso(), "2026-09-01");
});
test("블록 초기 상태: 저장된 방식 복원, 없으면 예정일 방식(주수는 지금 주수로 채움), 주수는 4~42로 자른다", () => {
  const { g } = seg();
  const due = new Date(Date.now() + 100 * 86400000);
  const s = g.pbInitialState("F9", due);
  assert.strictEqual(s.kind, "DUE"); assert.ok(s.weeks >= 4 && s.weeks <= 42 && s.days >= 0 && s.days <= 6);
  g.savePregBasis("F9", { kind: "CONFIRM", confirmDate: "2026-09-01", weeks: 6, days: 2 });
  assert.deepStrictEqual(JSON.parse(JSON.stringify(g.pbInitialState("F9", due))), { kind: "CONFIRM", weeks: 6, days: 2, confirmIso: "2026-09-01" });
  g.savePregBasis("F9", { kind: "WEEKS", weeks: 12, days: 3, asOf: "2026-09-01" });
  assert.strictEqual(g.pbInitialState("F9", due).kind, "WEEKS");
});
test("마크업: 세 방식 칩·주수/일 선택·확인일 달력, 기존 공통 클래스만(새 CSS 없음)", () => {
  const { g } = seg();
  const h = g.pbMarkup("epb", { kind: "WEEKS", weeks: 12, days: 3, confirmIso: "" });
  for (const t of ["예정일로 입력", "지금 몇 주예요", "임신 확인일로 입력", 'data-pb-kind="WEEKS"', 'id="epb-pb-w"', 'id="epb-pb-d"', 'value="12" selected', 'value="3" selected']) assert.ok(h.includes(t), t);
  assert.ok(/data-pb-kind="WEEKS" aria-pressed="true"/.test(h) && /id="epb-pb-confirm" class="hidden"/.test(h) && !/id="epb-pb-weeks" class="hidden"/.test(h));
  assert.ok(/id="epb-pb-weeks" class="hidden"/.test(g.pbMarkup("epb", { kind: "DUE", weeks: 12, days: 0, confirmIso: "" })));
});
test("연결(코드 단언): 등록 시트·수정 시트에 블록, 저장 때 계산한 예정일·입력 방식 저장, 일정 계산에 확인일 전달, 프로필 시트에 확인일 표시", () => {
  assert.ok(/function crMountPregBasis\(\)/.test(APP) && /crMountPregBasis\(\);\s*\n\s*const syncName/.test(APP));
  assert.ok(/pregRegBasis = kind === "pregnant" \? regBasis : null;/.test(APP) && /if \(familyCode && pregRegBasis !== undefined\) savePregBasis\(familyCode, profile\.stage === "pregnant" \? pregRegBasis : null\)/.test(APP));
  assert.ok(/if \(!byWeeks && !HNDatePicker\.isSelectable\(/.test(APP), "주수·확인일로 계산한 예정일은 범위 검사를 resolve 에 맡긴다");
  assert.ok(/pbMarkup\("epb", epPb\)/.test(APP) && /if \(preg\) savePregBasis\(familyCode, newBasis\);/.test(APP) && /dateStr = r\.dueIso; newBasis = r\.basis;/.test(APP));
  assert.strictEqual((APP.match(/pregnancyConfirmDate: pregConfirmIso\(\)/g) || []).length, 2, "buildAndRender·refreshSchedule 모두");
  assert.ok(/PregnancyBasis\.MSG\.confirmDate/.test(APP));
  const html = read("index.html"), sw = read("sw.js");
  assert.ok(/pregnancy-basis\.js\?v=\d+"><\/script>\s*<script src="js\/time-range\.js/.test(html) && sw.includes('"./js/pregnancy-basis.js"'));
});
test("임신 주수 표시·단계 판정·일정 엔진은 예정일(birthDate) 기반 그대로 — 입력 방식은 예정일을 만드는 입력일 뿐", () => {
  assert.ok(/const elapsed = 280 - daysToDue;/.test(APP));
  const sched = read("js/schedule.js");
  assert.ok(/pregnancyConfirmDate/.test(sched) && !/pregnancyBasis/.test(sched));
});

console.log(`\n${passed}개 통과`);
