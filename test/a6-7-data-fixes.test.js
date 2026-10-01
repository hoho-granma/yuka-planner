/*
 * A6-7 데이터 최소 수정 검증: NAT-007/018/020 conditionLabel(모두에게 "신청 가능"으로 세지 않기), HC-04/05 "동시 진행" 표현 제거,
 * VX-JEV 사백신 2·3차 간격(KDCA 2026 지침 130~131쪽), VX-FLU 초회 2회 조건(133쪽), SF-08 견과류 문구.
 * 실행: node test/a6-7-data-fixes.test.js
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
global.TodoEngine = require("../js/todo-engine.js");
global.DateCalc = require("../js/date-calc.js");
global.ChildTimeline = require("../js/child-timeline.js");
vm.runInThisContext(fs.readFileSync(path.join(ROOT, "js/schedule.js"), "utf8") + "\n;globalThis.__build = buildSchedule;");
const HN = require("../js/hn-logic.js");
const SP = require("../js/school-policy.js");

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log("  ok  - " + name); } catch (e) { process.exitCode = 1; console.log("  FAIL- " + name + "\n      " + (e.stack || e).split("\n").slice(0, 5).join("\n      ")); }
}
const rd = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), "utf8"));
const todoFiles = fs.readdirSync(path.join(ROOT, "data/todos")).filter((f) => f.endsWith(".json") && f !== "_meta.json").map((f) => "data/todos/" + f).concat("data/subsidies/national-todos.json");
const defs = todoFiles.flatMap((f) => rd(f).todos);
const nat = rd("data/subsidies/national.json").subsidies;
const policy = SP.normalize(rd("data/policy/school.json"));

test("NAT-007/018/020 에 conditionLabel 이 있다(지정한 문구) · 다른 NAT 항목의 라벨은 그대로", () => {
  const lab = (id) => nat.find((s) => s.id === id).conditionLabel;
  assert.strictEqual(lab("NAT-007"), "어린이집 이용 시");
  assert.strictEqual(lab("NAT-018"), "양육공백·소득 요건");
  assert.strictEqual(lab("NAT-020"), "유치원 이용 시");
  assert.strictEqual(lab("NAT-031"), "미숙아·선천성이상");
  assert.strictEqual(lab("NAT-005"), "저소득·다자녀 등");
});

test("지원금 분류: NAT-007·018·020 은 '신청 가능'이 아니라 조건부(conditional)로 모인다", () => {
  const birth = new Date(); birth.setMonth(birth.getMonth() - 40);
  const ev = globalThis.__build({ birthDate: birth, province: "서울특별시", district: "구로구", gender: "male", birthOrder: 1, stage: "born", schoolPolicy: policy },
    { todoDefinitions: defs, subsidy: { subsidies: nat } }, []);
  const ctx = { today: new Date(), ageNow: 40, pregnant: false };
  const b = HN.subsidyBuckets(ev, {}, ctx, 30);
  const ids = (list) => list.map((e) => e.id);
  for (const id of ["NAT-007", "NAT-018", "NAT-020"]) {
    assert.ok(ev.some((e) => e.id === id), `${id} 이벤트 존재`);
    assert.ok(!ids(b.available).includes(id), `${id} 는 available 에 없다`);
    assert.ok(ids(b.conditional).includes(id), `${id} 는 conditional 에 있다`);
  }
});

test("HC-04/05: '동시 진행' 표현이 없고 구강검진은 별도 검진(18~29/30~41개월)·구강검진기관 안내이며 '치과의사 실시'는 쓰지 않는다(공식 근거 확인불가)", () => {
  for (const id of ["HC-04", "HC-05"]) {
    const t = defs.find((d) => d.todo_id === id);
    assert.ok(!/동시/.test(t.parentAction + t.about), id);
    assert.ok(/구강검진/.test(t.parentAction) && !/치과의사/.test(t.parentAction) && /별도로 구강검진기관에서 받아요/.test(t.parentAction), id);
    assert.ok(t.parentAction.includes(id === "HC-04" ? "구강검진(18~29개월)" : "구강검진(30~41개월)"), id);
    assert.deepStrictEqual([t.triggerParams.startMonth, t.triggerParams.endMonth], id === "HC-04" ? [18, 24] : [30, 36]); // 시기·ID 불변
  }
});

test("VX-JEV 사백신: 2차 = 1차 후 28일 이상(상한 없음), 3차 = 2차 후 335일 이상(11개월), 나머지 회차·키 불변", () => {
  const jev = defs.find((d) => d.todo_id === "VX-JEV");
  const occ = jev.variants.options.find((o) => o.variantId === "사백신").occurrences;
  assert.deepStrictEqual(occ.map((o) => o.occurrenceKey), ["dose-1", "dose-2", "dose-3", "dose-4", "dose-5"]);
  assert.deepStrictEqual([occ[1].trigger.minOffsetDays, occ[1].trigger.maxOffsetDays], [28, null]);
  assert.deepStrictEqual([occ[2].trigger.minOffsetDays, occ[2].trigger.maxOffsetDays], [335, null]);
  assert.deepStrictEqual([occ[0].trigger.startMonth, occ[0].trigger.endMonth], [12, 24]);
  assert.deepStrictEqual([occ[3].trigger.startMonth, occ[4].trigger.startMonth], [72, 144]);
  const live = jev.variants.options.find((o) => o.variantId === "생백신").occurrences;
  assert.deepStrictEqual(live.map((o) => o.occurrenceKey), ["dose-1", "dose-2"]); // 생백신은 이번에 건드리지 않았다
});

test("VX-FLU: 접종 이력 조건이 문구·firstSeasonRule 에 반영되고 엔진 계산(2회·28일)은 그대로", () => {
  const flu = defs.find((d) => d.todo_id === "VX-FLU");
  assert.ok(/9세 미만/.test(flu.parentAction) && /누적 1회/.test(flu.parentAction) && /최소 4주/.test(flu.parentAction));
  assert.strictEqual(flu.firstSeasonRule.doseCount, 2);
  assert.strictEqual(flu.firstSeasonRule.intervalDays, 28);
  assert.ok(/9세 미만/.test(flu.firstSeasonRule.appliesTo));
  assert.deepStrictEqual(flu.triggerParams, { startMonth: 6, endMonth: null });
});

test("SF-08: 견과류는 '알레르기 확인 후 잘게 부수고 으깨거나 얇게 썰기'(식약처 2025-08-07), 연령 단정·'갈아' 없음, 시기·ID 불변", () => {
  const sf = defs.find((d) => d.todo_id === "SF-08");
  assert.ok(/견과류는 알레르기 확인 후 잘게 부수고 으깨거나 얇게 썰어서 먹이기/.test(sf.parentAction));
  assert.ok(/포도·방울토마토는 세로로 작게 썰거나 2~4등분/.test(sf.parentAction));
  assert.ok(/알레르기 확인 후 잘게 부수고 으깨거나 얇게 썰기/.test(sf.observationGuide[0]));
  assert.ok(/세로로 작게 썰거나 2~4등분/.test(sf.observationGuide[0]));
  assert.ok(!/3세까지|세부터|세 이후|\d+개월부터/.test(sf.parentAction + JSON.stringify(sf.observationGuide || [])));
  assert.ok(/식품의약품안전처/.test(sf.source) && /2025-08-07/.test(sf.source));
  assert.ok(!/갈아/.test(sf.parentAction + JSON.stringify(sf.observationGuide || [])));
  assert.deepStrictEqual([sf.triggerParams.startMonth, sf.triggerParams.endMonth], [6, 36]);
});

test("데이터 구조: 대상 Todo 에 새 top-level 필드가 생기지 않았다(기존 키 집합 안)", () => {
  const known = new Set();
  defs.forEach((d) => Object.keys(d).forEach((k) => known.add(k)));
  for (const id of ["VX-JEV", "VX-FLU", "HC-04", "HC-05", "SF-08"]) {
    const t = defs.find((d) => d.todo_id === id);
    for (const k of Object.keys(t)) assert.ok(["firstSeasonRule", "variants", "repeat", "triggerParams", "about", "why", "abnormalSigns", "observationGuide", "occurrences", "displayMonthLabel", "displayMonthBasis"].includes(k) || known.has(k), `${id}.${k}`);
  }
  const natKeys = new Set(nat.flatMap((s) => Object.keys(s)));
  assert.ok(natKeys.has("conditionLabel"));
});

console.log(`\n${passed} passed`);
