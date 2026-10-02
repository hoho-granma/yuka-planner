/*
 * 학령기 확장 2단계: data/todos/school-age.json(VX-TDAP·VX-HPV·SC-04~12) + VX-JEV dose-5 옵트인.
 * 핵심: 73개월 이상 아이에게만 새 항목이 나오고(학년별로 맞는 것만), 0~72개월 아이의 노출은 신규 데이터 추가 전과 같다.
 * 실행: node test/school-age-2.test.js
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { HN, ROOT } = require("./tools/load-engine.js"); // 전역 TodoEngine/__buildSchedule 설정
const CT = require("../js/child-timeline.js");
const SP = require("../js/school-policy.js");

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log("  ok  - " + name); } catch (e) { process.exitCode = 1; console.log("  FAIL- " + name + "\n      " + (e.stack || e).split("\n").slice(0, 4).join("\n      ")); }
}
const rd = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), "utf8"));
const FILES = ["health-checkup", "vaccination", "development", "feeding", "oral", "sleep", "safety", "daily-life", "childcare", "school"].map((f) => `data/todos/${f}.json`).concat("data/subsidies/national-todos.json");
const baseDefs = FILES.flatMap((f) => rd(f).todos);
const SA = rd("data/todos/school-age.json");
const newDefs = [...baseDefs, ...SA.todos];
// 신규 데이터가 없던 때의 정의: school-age 파일 없음 + VX-JEV 옵트인 규칙 제거
const oldDefs = baseDefs.map((d) => { if (d.todo_id !== "VX-JEV") return d; const c = JSON.parse(JSON.stringify(d)); delete c.extendedVisibility; return c; });
const policy = SP.normalize(rd("data/policy/school.json"));
const NOW = new Date();
const monthsAgo = (m) => new Date(NOW.getFullYear(), NOW.getMonth() - m, 10);

function visible(defs, birth) {
  const ev = globalThis.__buildSchedule({ birthDate: birth, province: "서울특별시", district: "구로구", gender: "male", birthOrder: 1, stage: "born", schoolPolicy: policy }, { todoDefinitions: defs, subsidy: { subsidies: [] } }, []);
  return ev.filter((e) => CT.isEventVisible(birth, e, NOW));
}
const ids = (evs) => evs.map((e) => e.id).sort();
const todoIds = (evs) => new Set(evs.map((e) => e.id.split("__")[0]));
const NEW_IDS = ["VX-TDAP", "VX-HPV", "SC-04", "SC-05", "SC-06", "SC-07", "SC-08", "SC-09", "SC-10", "SC-11", "SC-12"];

test("데이터: 11개 신규 정의·ID 중복 없음·출처(법령/지침 쪽수)와 열람일·확인필요(숨김) 아님·배지 없음", () => {
  assert.strictEqual(SA.todos.length, 11);
  assert.strictEqual(SA.count, 11);
  assert.deepStrictEqual(SA.todos.map((d) => d.todo_id), NEW_IDS);
  const base = new Set(baseDefs.map((d) => d.todo_id));
  SA.todos.forEach((d) => {
    assert.ok(!base.has(d.todo_id), d.todo_id);
    assert.ok(/2026-10-02/.test(d.source), d.todo_id + " 열람일");
    assert.ok(d.verificationStatus.startsWith("확인됨") && d.verificationStatus !== "확인필요", d.todo_id);
    assert.ok(d.parentAction && d.why && d.categoryGroup);
  });
  assert.ok(/117·118쪽/.test(SA.todos[0].source) && /106·132쪽/.test(SA.todos[1].source));
  assert.ok(/확인 필요/.test(SA.todos[1].parentAction) && /확인 필요/.test(SA.todos[1].verificationStatus)); // HPV 무료 대상은 단정하지 않음
  assert.ok(/법/.test(SA.todos.find((d) => d.todo_id === "SC-04").source));
});
test("로더: app.js TODO_CATEGORY_FILES 에 school-age.json 이 있고, vaccination.json 은 VX-JEV 규칙 1줄만 추가", () => {
  const app = fs.readFileSync(path.join(ROOT, "js/app.js"), "utf8");
  assert.ok(app.includes('"data/todos/school.json",\n    "data/todos/school-age.json",'));
  const jev = baseDefs.find((d) => d.todo_id === "VX-JEV");
  assert.deepStrictEqual(JSON.parse(JSON.stringify(jev.extendedVisibility)), [{ occurrenceKeys: ["dose-5"], fromAgeMonths: 73, maxVisibleMonths: 144 }]);
});
test("0~72개월 아이: 신규 데이터 추가 전과 노출 항목이 완전히 같다(월령 0~72 전수, 날짜 경계 3종)", () => {
  for (let m = 0; m <= 72; m++) {
    for (const day of [1, 15, 28]) {
      const b = new Date(NOW.getFullYear(), NOW.getMonth() - m, day);
      if (b > NOW) continue;
      assert.deepStrictEqual(ids(visible(newDefs, b)), ids(visible(oldDefs, b)), `${m}개월 ${day}일`);
    }
  }
});
test("73개월+: 2017·2018·2019년생에게 Tdap·HPV·JEV 5차가 나오고 학년에 맞는 학교 항목만 나온다", () => {
  const byYear = (y, mo) => new Date(y, mo, 10);
  for (const [y, grade] of [[2017, null], [2018, null], [2019, null]]) {
    const b = byYear(y, 5);
    const age = CT.completedMonths(b, NOW);
    assert.ok(age >= 73, `${y} 월령 ${age}`);
    const v = visible(newDefs, b);
    const t = todoIds(v);
    for (const id of ["VX-TDAP", "VX-HPV"]) assert.ok(t.has(id), `${y}: ${id}`);
    assert.ok(v.some((e) => e.id.startsWith("VX-JEV__dose-5")), `${y}: JEV dose-5`);
    // 학교 항목: 현재 학년에 맞는 신체발달 검사 1개만(초N → SC-(5+N)), 다른 학년 것은 안 나옴
    const school = [...t].filter((id) => /^SC-(0[6-9]|1[01])$/.test(id));
    const stage = CT.compute({ birthDate: b, asOf: NOW, stage: "born", policy }).school;
    if (typeof stage.grade === "number") assert.deepStrictEqual(school, [`SC-${String(5 + stage.grade).padStart(2, "0")}`], `${y} 초${stage.grade}`);
    else assert.deepStrictEqual(school, [], `${y} stage ${stage.grade}`);
    assert.strictEqual(t.has("SC-04"), stage.grade === 1);
    assert.strictEqual(t.has("SC-05"), stage.grade === 4);
    assert.strictEqual(t.has("SC-12"), stage.grade === 1);
  }
});
test("초1(2019년생 등 입학 학년도): 건강검진 초1·신체발달 초1·입학 후 예방접종 확인이 함께 나온다", () => {
  const sy = NOW.getMonth() + 1 >= 3 ? NOW.getFullYear() : NOW.getFullYear() - 1; // 학년도
  const b = new Date(sy - 7, 5, 10); // 입학 학년도 = 출생연도 + 7
  const t = todoIds(visible(newDefs, b));
  assert.ok(t.has("SC-04") && t.has("SC-06") && t.has("SC-12"));
  assert.ok(!t.has("SC-05") && !t.has("SC-07"));
});
test("체크리스트 그룹: Tdap(132)·HPV(144)는 '만 10~12세' 구간, 72 초과 월령 키라 N5 숨김에서 유지", () => {
  for (const id of ["VX-TDAP", "VX-HPV"]) {
    const d = SA.todos.find((x) => x.todo_id === id);
    assert.strictEqual(CT.checklistGroupLabel(CT.checklistBucket(d.displayMonth)), "만 10~12세 (120~144개월)");
    assert.ok(d.displayMonth > CT.SERVICE_RANGE.maxMonths);
  }
});
test("제외 확인: 구강검진·돌봄·늘봄·인플루엔자 항목은 없다", () => {
  const txt = JSON.stringify(SA.todos);
  assert.ok(!/구강|늘봄|돌봄교실|인플루엔자/.test(SA.todos.map((d) => d.title).join("")));
  assert.ok(!/VX-FLU/.test(txt));
});
console.log(`\n${passed}개 통과${process.exitCode ? ", 일부 실패" : ""}`);
