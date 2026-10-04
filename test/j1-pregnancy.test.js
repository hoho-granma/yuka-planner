/* W3: 임신 단계 — 출생신고(PG-01)·국민행복카드 바우처 신청(PG-02) + 지원금 알림 시점 보정(data/policy/pregnancy-timing.json).
 * 임신 중 프로필에서만 달라지고, 36개월 미만·이상 아이의 일정은 pregnancy.json 이 있든 없든 같다. 실행: node --test test/j1-pregnancy.test.js */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const cp = require("child_process");
require("./tools/load-engine.js");
const ROOT = path.join(__dirname, "..");
const rd = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), "utf8"));
const BASE = ["health-checkup", "vaccination", "development", "feeding", "oral", "sleep", "safety", "daily-life", "childcare", "school", "school-age"].flatMap((f) => rd(`data/todos/${f}.json`).todos).concat(rd("data/subsidies/national-todos.json").todos);
const PG = rd("data/todos/pregnancy.json").todos;
const TIMING = rd("data/policy/pregnancy-timing.json").items;
const subs = rd("data/subsidies/national.json").subsidies;
const SP = require("../js/school-policy.js");
const policy = SP.normalize(rd("data/policy/school.json"));
const now = new Date();
const build = (birthDate, stage, { withPg = true, timing = TIMING } = {}) => global.__buildSchedule({ birthDate, province: "서울특별시", district: "구로구", gender: "M", birthOrder: "first", stage, schoolPolicy: policy },
  { todoDefinitions: withPg ? BASE.concat(PG) : BASE, subsidy: { subsidies: subs }, pregnancyTiming: timing }, []);
const due = new Date(now.getFullYear(), now.getMonth() + 4, 15); // 출산 예정일 4개월 뒤
const day = (d) => Math.round(d.getTime() / 86400000);

test("임신 중: 출생신고(PG-01)는 출산 예정일부터 1개월(달력) 안, 법정 근거·확인완료", () => {
  const ev = build(due, "pregnant").find((e) => e.id === "PG-01__default");
  assert.ok(ev, "PG-01 이 있다");
  assert.strictEqual(ev.category, "행정·지원금");
  assert.deepStrictEqual([ev.windowStart.getFullYear(), ev.windowStart.getMonth(), ev.windowStart.getDate()], [due.getFullYear(), due.getMonth(), due.getDate()]);
  assert.deepStrictEqual([ev.windowEnd.getMonth(), ev.windowEnd.getDate()], [(due.getMonth() + 1) % 12, due.getDate()], "1개월 뒤 같은 일");
  const t = PG.find((d) => d.todo_id === "PG-01");
  assert.ok(/제44조/.test(t.source) && t.verificationStatus === "확인완료");
});

test("임신 중: 바우처 신청(PG-02)은 임신 확인 직후 시점(출산 예정일 252일 전)~출산 예정일, 금액·사용기한 수치는 데이터에 넣지 않았다(근사 시작점은 verificationNote 에 표시)", () => {
  const ev = build(due, "pregnant").find((e) => e.id === "PG-02__default");
  assert.ok(ev);
  assert.strictEqual(day(due) - day(ev.windowStart), 252);
  assert.strictEqual(day(ev.windowEnd), day(due));
  const t = PG.find((d) => d.todo_id === "PG-02");
  assert.ok(!/\d+\s*(만\s*원|원|년)/.test(JSON.stringify(t).replace(/252/g, "")), "금액·사용기한 수치 없음");
  assert.ok(/근사값/.test(t.verificationNote) && t.subsidyRef === "NAT-008");
});

test("임신 중이 아니면 PG 항목이 일정에 없다 — 0개월·24개월·35개월·40개월·초등 아이의 일정은 pregnancy.json 유무와 무관하게 같다", () => {
  for (const m of [0, 3, 24, 35, 40, 100]) {
    const b = new Date(now.getFullYear(), now.getMonth() - m, 1);
    const a = build(b, "born", { withPg: true }), z = build(b, "born", { withPg: false });
    assert.ok(!a.some((e) => /^PG-/.test(e.id)), `${m}개월에 PG 없음`);
    assert.strictEqual(JSON.stringify(a.map((e) => [e.id, Math.floor(e.date.getTime() / 86400000), e.windowEnd && e.windowEnd.getTime()])), JSON.stringify(z.map((e) => [e.id, Math.floor(e.date.getTime() / 86400000), e.windowEnd && e.windowEnd.getTime()])));
  }
});

test("임신 중에만 보정이 적용된다: NAT-008 은 임신 중 달력에서 빠지고(PG-02 로 대체) 아이가 태어난 뒤에는 그대로, 보정 정보가 없으면 보정도 없다", () => {
  assert.ok(!build(due, "pregnant").some((e) => e.id === "NAT-008"));
  const b = new Date(now.getFullYear(), now.getMonth() - 2, 1);
  assert.ok(build(b, "born").some((e) => e.id === "NAT-008"), "출생 후에는 그대로");
  assert.ok(build(due, "pregnant", { timing: null }).some((e) => e.id === "NAT-008"), "보정 파일 없으면 기존 동작");
  assert.ok(build(due, "pregnant", { timing: null }).every((e) => !(e.id === "PREG-001" && day(due) - day(e.date) === 252)));
});

test("PREG-001·007 은 임신 확인 후 시점(-252일), PREG-005 독감은 절기(2026-09-21~2027-04-30) 날짜에 놓이고 출산 예정일이 절기 시작 전이면 나오지 않는다", () => {
  const ev = build(due, "pregnant");
  const get = (id) => ev.find((e) => e.id === id);
  assert.strictEqual(day(due) - day(get("PREG-001").date), 252);
  assert.strictEqual(day(due) - day(get("PREG-007").date), 252);
  assert.strictEqual(get("PREG-001").deadlineDate && day(due) - day(get("PREG-001").deadlineDate), 196, "12주 이내 = 출산 예정일 196일 전");
  const flu = get("PREG-005");
  assert.deepStrictEqual([flu.date.getFullYear(), flu.date.getMonth() + 1, flu.date.getDate()], [2026, 9, 21]);
  assert.deepStrictEqual([flu.deadlineDate.getFullYear(), flu.deadlineDate.getMonth() + 1, flu.deadlineDate.getDate()], [2027, 4, 30]);
  assert.ok(!build(new Date(2026, 5, 1), "pregnant").some((e) => e.id === "PREG-005"), "예정일 2026-06 은 절기 전");
});

test("엔진·골든은 건드리지 않았다: todo-engine.js 는 HEAD 와 동일, legacy 골든 파일 변경 없음, 새 데이터는 별도 파일", () => {
  const out = cp.execSync("git diff --name-only HEAD -- test/golden data/todos/vaccination.json.nothing", { cwd: ROOT }).toString().trim();
  assert.strictEqual(out, ""); // todo-engine.js 는 v1.12.96 의 SCHOOL_TERM_WINDOW 선택 필드 외 변경 없음(test/n4 가 고정)
  assert.ok(fs.existsSync(path.join(ROOT, "data/todos/pregnancy.json")) && fs.existsSync(path.join(ROOT, "data/policy/pregnancy-timing.json")));
  const APP = fs.readFileSync(path.join(ROOT, "js/app.js"), "utf8");
  assert.ok(APP.includes('"data/todos/pregnancy.json"') && APP.includes("pregnancyTiming"));
});

test("정보 카드 분류(임신초기검사 PREG-003, 임신 중 Tdap)는 이번에 AUTO 로 만들지 않았다", () => {
  assert.ok(!PG.some((d) => /Tdap|초기검사/.test(d.title)));
  assert.ok(!TIMING["PREG-003"]);
});
