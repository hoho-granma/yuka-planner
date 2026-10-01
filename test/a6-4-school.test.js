/*
 * A6-4 테스트: data/todos/school.json (학교 Todo 3건 — 취학통지서·예비소집·입학연기) + 학교 단계 기반 노출.
 * 실제 엔진·schedule.js·실제 데이터·실제 학교 정책(data/policy/school.json)을 Node에서 실행한다.
 * 학교 단계는 schedule.js 가 실제 현재 시각(new Date())으로 판정하므로, 아래 출생연도는 "지금" 기준으로 계산한다(3월 경계에서도 같은 코드가 통과).
 * 실행: node test/a6-4-school.test.js
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
const CT = global.ChildTimeline;
const SP = require("../js/school-policy.js");

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log("  ok  - " + name); } catch (e) { process.exitCode = 1; console.log("  FAIL- " + name + "\n      " + (e.stack || e).split("\n").slice(0, 5).join("\n      ")); }
}

const rd = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), "utf8"));
const OTHER_FILES = ["health-checkup", "vaccination", "development", "feeding", "oral", "sleep", "safety", "daily-life", "childcare"].map((f) => `data/todos/${f}.json`).concat("data/subsidies/national-todos.json");
const otherDefs = OTHER_FILES.flatMap((f) => rd(f).todos);
const school = rd("data/todos/school.json");
const schoolDefs = school.todos;
const allDefs = otherDefs.concat(schoolDefs);
const policy = SP.normalize(rd("data/policy/school.json"));
const D = (y, m, d) => new Date(y, m - 1, d);
const ymd = (d) => (d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}` : null);

const build = (birth, extra = {}) =>
  globalThis.__build({ birthDate: birth, province: "서울특별시", district: "구로구", gender: "male", birthOrder: 1, stage: "born", ...extra }, { todoDefinitions: allDefs, subsidy: { subsidies: [] } }, []);
const scEvents = (ev) => ev.filter((e) => e.isEngineEvent && e.detail.definition.category === "SC");
const visibleSc = (birth, ev) => scEvents(ev).filter((e) => CT.isEventVisible(birth, e)).map((e) => e.detail.definition.todo_id).sort();

// 지금 기준 학교 단계별 출생연도: 입학 학년도 = 출생연도 + 7, 학년도는 3월 시작
const now = new Date();
const schoolYear = now.getMonth() + 1 >= 3 ? now.getFullYear() : now.getFullYear() - 1;
const PRE_YEAR = schoolYear - 6; // 입학 직전 학년도(예비초등) 출생연도
const COHORTS = {
  예비초등: [D(PRE_YEAR, 1, 10), D(PRE_YEAR, 6, 15), D(PRE_YEAR, 12, 31)],
  학령전_1년전: [D(PRE_YEAR + 1, 1, 1), D(PRE_YEAR + 1, 12, 31)],
  학령전_2년전: [D(PRE_YEAR + 2, 6, 1)],
  영유아: [new Date(now.getFullYear(), now.getMonth() - 3, 15), D(now.getFullYear() - 2, 3, 3)],
  초1: [D(PRE_YEAR - 1, 1, 15), D(PRE_YEAR - 1, 12, 20)],
  초2이상: [D(PRE_YEAR - 2, 6, 6), D(PRE_YEAR - 5, 11, 11)],
};

// ── 1. 데이터 가드 ───────────────────────────────────────────────────────────────────────
test("school.json: 정의는 정확히 3건(SC-01 취학통지서 / SC-02 예비소집 / SC-03 입학연기)이고 count 가 맞다", () => {
  assert.strictEqual(school.count, 3);
  assert.deepStrictEqual(schoolDefs.map((d) => d.todo_id), ["SC-01", "SC-02", "SC-03"]);
  assert.deepStrictEqual(schoolDefs.map((d) => d.title), ["취학통지서 확인", "예비소집 확인", "입학연기 신청 여부 확인"]);
});

test("school.json 필드 규약: SCHOOL_TERM_WINDOW·yearOffset -1·달력 월, 상위 그룹은 기존 값, 학교 필드, 확인필요 아님", () => {
  const MONTHS = { "SC-01": [12, 12], "SC-02": [12, 1], "SC-03": [10, 12] };
  const ids = new Set(otherDefs.map((d) => d.todo_id));
  for (const d of schoolDefs) {
    assert.ok(!ids.has(d.todo_id), "기존 ID와 겹치지 않음 " + d.todo_id);
    assert.strictEqual(d.category, "SC");
    assert.strictEqual(d.categoryGroup, "생활·수유"); // 기존 6개 상위 그룹 그대로
    assert.strictEqual(d.schoolGroup, "학교·입학");
    assert.strictEqual(d.triggerType, "SCHOOL_TERM_WINDOW");
    assert.strictEqual(d.triggerParams.anchor, "ENROLLMENT");
    assert.strictEqual(d.triggerParams.yearOffset, -1);
    assert.deepStrictEqual([d.triggerParams.startMonth, d.triggerParams.endMonth], MONTHS[d.todo_id]);
    for (const k of ["startMonth", "endMonth"]) assert.ok(Number.isInteger(d.triggerParams[k]) && d.triggerParams[k] >= 1 && d.triggerParams[k] <= 12, `${d.todo_id} ${k} 는 달력 월(1~12)`);
    assert.deepStrictEqual(d.visibleStages, ["PRE_ELEMENTARY"]);
    assert.ok(["SCHEDULED", "CHECK", "EVERGREEN"].includes(d.guideType));
    assert.strictEqual(d.displayMonth, null);
    assert.strictEqual(d.leadDays, 0);
    assert.ok(d.source && d.parentAction && d.why && Array.isArray(d.observationGuide) && d.observationGuide.length > 0);
    assert.ok(!/확인필요/.test(d.verificationStatus), "확인필요면 화면에서 숨겨진다");
    assert.ok(Object.prototype.hasOwnProperty.call(d.triggerParams, "endMonth") && d.triggerParams.endMonth !== null);
  }
  assert.deepStrictEqual(schoolDefs.map((d) => d.guideType), ["SCHEDULED", "CHECK", "CHECK"]);
});

test("범위 밖 항목 문구가 들어가지 않았다: 조기입학·늘봄·돌봄·방학·휴업일·통학 안전·접종 신규 항목 없음", () => {
  const text = JSON.stringify(school);
  for (const w of ["조기입학", "늘봄", "돌봄", "방과후", "방과 후", "방학", "휴업", "스쿨존", "어린이 보호구역"]) assert.ok(!text.includes(w), `포함되면 안 되는 문구: ${w}`);
  assert.ok(!schoolDefs.some((d) => d.category === "VX"));
  // S2 는 정확한 날짜를 전국 공통으로 단정하지 않고 학교·교육청 안내 확인을 명시한다
  const s2 = schoolDefs.find((d) => d.todo_id === "SC-02");
  assert.ok(s2.parentAction.includes("학교·교육청 안내를 확인하세요"));
  assert.ok(!/\d{1,2}월 \d{1,2}일/.test(s2.parentAction + s2.cardSummary), "예비소집 구체 날짜 없음");
});

test("A6-3 보존 규칙은 그대로: 36개월 보존 정의는 school.json 을 포함해도 정확히 10개, 학교 정의는 해당 없음", () => {
  const ids = allDefs.filter(CT.isLegacyCappedDefinition).map((d) => d.todo_id).sort();
  assert.deepStrictEqual(ids, ["DV-09", "FD-05", "FD-09", "FD-10", "OR-01", "OR-04", "SF-02", "SF-04", "SF-05", "VX-FLU"]);
  schoolDefs.forEach((d) => assert.strictEqual(CT.isLegacyCappedDefinition(d), false, d.todo_id));
});

// ── 2. 날짜 창과 표시 종류 ───────────────────────────────────────────────────────────────
test("예비초등 아이: 입학 전년도 창 — SC-01 12/1~12/31(window), SC-02 12/1~다음 해 1/31(monthly), SC-03 10/1~12/31(monthly)", () => {
  for (const b of COHORTS.예비초등) {
    const E = b.getFullYear() + 7;
    const by = Object.fromEntries(scEvents(build(b, { schoolPolicy: policy })).map((e) => [e.detail.definition.todo_id, e]));
    assert.deepStrictEqual(Object.keys(by).sort(), ["SC-01", "SC-02", "SC-03"]);
    assert.deepStrictEqual([ymd(by["SC-01"].windowStart), ymd(by["SC-01"].windowEnd)], [`${E - 1}-12-01`, `${E - 1}-12-31`]);
    assert.deepStrictEqual([ymd(by["SC-02"].windowStart), ymd(by["SC-02"].windowEnd)], [`${E - 1}-12-01`, `${E}-01-31`]); // 연도 경계
    assert.deepStrictEqual([ymd(by["SC-03"].windowStart), ymd(by["SC-03"].windowEnd)], [`${E - 1}-10-01`, `${E - 1}-12-31`]);
    assert.deepStrictEqual([by["SC-01"].scheduleKind, by["SC-01"].isDateSpecific], ["window", true]);
    assert.deepStrictEqual([by["SC-02"].scheduleKind, by["SC-02"].isDateSpecific], ["monthly", false]); // 61일 > 60일
    assert.deepStrictEqual([by["SC-03"].scheduleKind, by["SC-03"].isDateSpecific], ["monthly", false]); // 91일
    assert.strictEqual(by["SC-01"].category, "생활·수유");
    assert.strictEqual(by["SC-01"].subcategoryLabel, "학교·입학");
    assert.ok(by["SC-01"].id === "SC-01__default");
  }
});

// ── 3. 노출 규칙: 예비초등만 3건, 그 밖은 0건 ─────────────────────────────────────────────
test("예비초등 단계 아이는 학교 Todo 3건이 보이고, 그 밖의 모든 단계(영유아·학령 전·초1·초2 이상)는 0건", () => {
  for (const [name, births] of Object.entries(COHORTS)) {
    for (const b of births) {
      const got = visibleSc(b, build(b, { schoolPolicy: policy }));
      assert.deepStrictEqual(got, name === "예비초등" ? ["SC-01", "SC-02", "SC-03"] : [], `${name} ${ymd(b)}`);
    }
  }
});

test("서비스 상한(72개월)이 아니라 학교 단계로 판정: 72개월을 넘는 예비초등 아이도 보이고, 72개월 이하여도 예비초등이 아니면 안 보인다", () => {
  const over72 = COHORTS.예비초등[0]; // 1월생 — 예비초등 중에서 월령이 가장 크다
  const ev = build(over72, { schoolPolicy: policy });
  assert.ok(CT.completedMonths(over72, new Date()) > 72, "월령 " + CT.completedMonths(over72, new Date()));
  assert.deepStrictEqual(visibleSc(over72, ev), ["SC-01", "SC-02", "SC-03"]);
  // 월령 규칙만 쓰던 A6-3 의 isWithinServiceRange 로는 SC-01 이 72개월을 넘어 보이지 않았을 위치
  const sc1 = scEvents(ev).find((e) => e.detail.definition.todo_id === "SC-01");
  assert.strictEqual(CT.isWithinServiceRange(over72, sc1.date), false);
  const younger = COHORTS.학령전_1년전[0]; // 월령 69개월 안팎(72 이하)이지만 아직 예비초등이 아님
  assert.deepStrictEqual(visibleSc(younger, build(younger, { schoolPolicy: policy })), []);
});

test("정책이 없거나 확인되지 않으면(빈 정책·정책 인자 없음) 학교 이벤트 자체가 만들어지지 않는다 · 임신 중도 없음", () => {
  const b = COHORTS.예비초등[1];
  assert.strictEqual(scEvents(build(b)).length, 0); // schoolPolicy 없음
  assert.strictEqual(scEvents(build(b, { schoolPolicy: SP.normalize(null) })).length, 0); // 읽기 실패 → 빈 정책
  const unconfirmed = { ...policy, enrollmentOffsetYears: { ...policy.enrollmentOffsetYears, verificationStatus: "확인필요" } };
  assert.strictEqual(scEvents(build(b, { schoolPolicy: unconfirmed })).length, 0);
  assert.strictEqual(scEvents(build(D(now.getFullYear() + 1, 3, 1), { schoolPolicy: policy, stage: "pregnant" })).length, 0);
});

test("isEventVisible 학교 분기: visibleStages 값(PRE_ELEMENTARY / GRADE_1)과 stage 입력에 따라서만 결정된다(초1 구조는 준비, 데이터는 없음)", () => {
  const b = D(2000, 1, 1); // 학교 정의는 날짜가 아니라 단계로 본다
  const ev = (stages, stage) => ({ isEngineEvent: true, date: D(2090, 1, 1), schoolStage: stage, detail: { definition: { triggerType: "SCHOOL_TERM_WINDOW", visibleStages: stages } } });
  const pre = { stageBand: "PRE_ELEMENTARY", grade: "PRESCHOOL" }, g1 = { stageBand: "ELEMENTARY_LOW", grade: 1 }, g2 = { stageBand: "ELEMENTARY_LOW", grade: 2 };
  assert.strictEqual(CT.isEventVisible(b, ev(["PRE_ELEMENTARY"], pre)), true);
  assert.strictEqual(CT.isEventVisible(b, ev(["PRE_ELEMENTARY"], g1)), false);
  assert.strictEqual(CT.isEventVisible(b, ev(["GRADE_1"], g1)), true);
  assert.strictEqual(CT.isEventVisible(b, ev(["GRADE_1"], g2)), false);
  assert.strictEqual(CT.isEventVisible(b, ev(["PRE_ELEMENTARY", "GRADE_1"], g1)), true);
  assert.strictEqual(CT.isEventVisible(b, ev(["PRE_ELEMENTARY"], null)), false);
  assert.strictEqual(CT.isEventVisible(b, ev(undefined, pre)), false);
  assert.strictEqual(CT.isEventVisible(b, ev([], pre)), false);
});

// ── 4. 기존 일정은 학교 Todo 때문에 달라지지 않는다 ───────────────────────────────────────
test("학교 정의를 더해도 기존 정의의 이벤트(id·날짜·유형·노출)는 모든 단계에서 그대로다", () => {
  const all = Object.values(COHORTS).flat();
  const sig = (events, b) => events
    .filter((e) => !(e.isEngineEvent && e.detail.definition.category === "SC"))
    .map((e) => [e.id, e.scheduleKind, e.category, ymd(e.windowStart), ymd(e.windowEnd), CT.isEventVisible(b, e)])
    .sort((a, c) => (a[0] < c[0] ? -1 : 1));
  for (const b of all) {
    const withSchool = build(b, { schoolPolicy: policy });
    const without = globalThis.__build({ birthDate: b, province: "서울특별시", district: "구로구", gender: "male", birthOrder: 1, stage: "born", schoolPolicy: policy }, { todoDefinitions: otherDefs, subsidy: { subsidies: [] } }, []);
    // 마일스톤 대기(날짜=호출 시각)는 시간 의존이라 id·유형만 비교한다
    const norm = (x) => JSON.stringify(x.map((r) => (r[3] === null ? [r[0], r[1], r[2], r[5]] : r)));
    assert.strictEqual(norm(sig(withSchool, b)), norm(sig(without, b)), ymd(b));
  }
});

// ── 5. app.js 연결(Node 에서 실행 불가한 부분은 소스 고정) ────────────────────────────────
test("app.js: 반복 행 계산이 SCHOOL_TERM_WINDOW 를 먼저 제외하고, 학교 그룹 키·로더가 연결되어 있다", () => {
  const src = fs.readFileSync(path.join(ROOT, "js/app.js"), "utf8");
  const fn = src.slice(src.indexOf("function repeatMonthRangeOf"), src.indexOf("function monthKeysOf"));
  const guard = fn.indexOf('triggerType === "SCHOOL_TERM_WINDOW") return null');
  assert.ok(guard > 0, "가드가 있어야 한다");
  assert.ok(guard < fn.indexOf("tp.startMonth"), "startMonth 를 월령으로 읽기 전에 제외해야 한다");
  assert.ok(src.includes('"data/todos/school.json"'));
  assert.ok(/const SCHOOL_GROUP = "SCHOOL"/.test(src));
  assert.ok(/if \(td\.schoolGroup\) return SCHOOL_GROUP/.test(src));
  assert.ok(/key === NEED_CHECK_GROUP \|\| key === SCHOOL_GROUP\) return false/.test(src), "달력의 월령 계산에서 학교 키 제외");
});

console.log(`${passed}개 통과`);
