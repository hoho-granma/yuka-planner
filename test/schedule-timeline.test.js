"use strict";
// A6-2: schedule.js 가 학교 정책으로 만든 timeline 을 엔진에 넘기는 경로 (+ 정책 없을 때 이전과 동일)
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const ROOT = path.join(__dirname, "..");
global.DateCalc = require("../js/date-calc.js");
global.ChildTimeline = require("../js/child-timeline.js");
const SP = require("../js/school-policy.js");
const RealEngine = require("../js/todo-engine.js");
let lastInput = null;
global.TodoEngine = { ...RealEngine, calculateTodoInstances: (input) => { lastInput = input; return RealEngine.calculateTodoInstances(input); } };
vm.runInThisContext(fs.readFileSync(path.join(ROOT, "js/schedule.js"), "utf8") + "\n;globalThis.__buildSchedule = buildSchedule;");

const fileFetch = async (p) => { const f = path.join(ROOT, p); return fs.existsSync(f) ? { ok: true, json: async () => JSON.parse(fs.readFileSync(f, "utf8")) } : { ok: false }; };
const defs = ["health-checkup", "vaccination", "development", "feeding", "oral", "sleep", "safety", "daily-life", "childcare"].flatMap((n) => JSON.parse(fs.readFileSync(path.join(ROOT, `data/todos/${n}.json`), "utf8")).todos);
const dataset = { todoDefinitions: defs, subsidy: { subsidies: [] } };
const base = (birth, extra = {}) => ({ birthDate: birth, province: "서울특별시", district: "구로구", gender: "male", birthOrder: 1, stage: "born", ...extra });
const D = (y, m, d) => new Date(y, m - 1, d);
const run = (p) => { lastInput = null; return __buildSchedule(p, dataset, []); };
const strip = (ev) => JSON.stringify(ev.map((e) => [e.id, e.engineStatus === "PENDING_MILESTONE" ? 0 : e.date.getTime(), e.engineStatus, e.title]) /* 마일스톤 대기는 날짜가 호출 시각(new Date())이라 비교에서 제외 */);

(async () => {
  const policy = await SP.load(fileFetch); // 실제 data/policy/school.json
  assert.deepStrictEqual(Object.keys(policy).sort(), SP.KEYS.slice().sort());

  // 1) 정책 주입 → 엔진 입력에 timeline.school 이 실제 출생일 기준으로 들어간다
  const bday = new Date(); bday.setFullYear(bday.getFullYear() - 6); // 대략 6세
  run(base(bday, { schoolPolicy: policy }));
  const sc = lastInput.timeline.school;
  assert.strictEqual(sc.enrollmentYear, bday.getFullYear() + 7);
  assert.ok(lastInput.timeline.age && sc.grade !== undefined);
  // 학년 전환: 같은 정책으로 asOf 별 기대값은 child-timeline 이 이미 검증, 여기선 연결 값이 compute 결과와 같은지
  const expect = ChildTimeline.compute({ birthDate: bday, asOf: lastInput.today, stage: "born", policy });
  assert.deepStrictEqual(lastInput.timeline, expect);

  // 2) 현재 아이 학년별 연결(오늘 기준 출생연도를 바꿔서)
  const y = new Date().getFullYear(), m = new Date().getMonth() + 1;
  const schoolYear = m >= 3 ? y : y - 1;
  const cases = [[schoolYear - 5 - 1, "PRESCHOOL"], [schoolYear - 6, "PRESCHOOL"], [schoolYear - 7, 1], [schoolYear - 8, 2]]; // 출생연도 = schoolYear-(n-1)-7 → 1학년:-7, 2학년:-8, 예비초등: -6
  for (const [by, grade] of cases) { run(base(D(by, 7, 1), { schoolPolicy: policy })); assert.strictEqual(lastInput.timeline.school.grade, grade, `birthYear ${by}`); }
  run(base(D(schoolYear - 6, 7, 1), { schoolPolicy: policy })); assert.strictEqual(lastInput.timeline.school.stageBand, "PRE_ELEMENTARY");
  run(base(D(schoolYear - 7, 7, 1), { schoolPolicy: policy })); assert.strictEqual(lastInput.timeline.school.gradeLabel, "초1");
  run(base(D(schoolYear - 8, 7, 1), { schoolPolicy: policy })); assert.strictEqual(lastInput.timeline.school.gradeLabel, "초2");

  // 3) enrollmentYearOverride 우선
  run(base(D(schoolYear - 6, 7, 1), { schoolPolicy: policy, enrollmentYearOverride: schoolYear })); // 조기입학: 1학년
  assert.deepStrictEqual([lastInput.timeline.school.enrollmentYear, lastInput.timeline.school.grade], [schoolYear, 1]);

  // 4) 정책 로딩 실패 → 빈 정책 → school=null (예외 없음)
  for (const f of [async () => ({ ok: false }), async () => { throw new Error("x"); }, async () => ({ ok: true, json: async () => ({}) })]) {
    const bad = await SP.load(f);
    run(base(D(2020, 5, 1), { schoolPolicy: bad }));
    assert.strictEqual(lastInput.timeline.school, null);
  }

  // 5) 임신 중 → school null
  run(base(D(schoolYear + 1, 3, 1), { schoolPolicy: policy, stage: "pregnant" }));
  assert.strictEqual(lastInput.timeline.school, null);

  // 6) 정책 인자가 없으면 이전과 같은 입력(timeline 키 자체가 없음 → 엔진은 null)
  run(base(D(2025, 1, 15)));
  assert.ok(!("timeline" in lastInput));

  // 7) 0~36개월 일정 결과는 정책 유무와 무관하게 동일(현재 timeline 을 쓰는 정의가 없으므로)
  for (const b of [D(2025, 8, 20), D(2024, 2, 29), D(2023, 11, 30)]) {
    const a = strip(run(base(b))), c = strip(run(base(b, { schoolPolicy: policy }))), d = strip(run(base(b, { schoolPolicy: {} })));
    assert.strictEqual(a, c); assert.strictEqual(a, d);
  }
  console.log("schedule-timeline.test.js: 통과");
})().catch((e) => { console.error(e); process.exit(1); });
