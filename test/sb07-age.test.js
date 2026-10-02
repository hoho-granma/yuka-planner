/*
 * SB-07(어린이집 보육료 지원 확인) 연령 데이터 정리: 0~71개월(만 0~5세, NAT-007과 일치)·소급 불가(NOT_ALLOWED).
 * 이 항목은 eligibilityCondition(daycareEnrolled) 때문에 화면에 나오지 않으므로(SB-08 포함) 어떤 월령에서도 화면 변화가 없다.
 * 실행: node test/sb07-age.test.js
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { ROOT } = require("./tools/load-engine.js");

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log("  ok  - " + name); } catch (e) { process.exitCode = 1; console.log("  FAIL- " + name + "\n      " + (e.stack || e).split("\n").slice(0, 4).join("\n      ")); }
}
const rd = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), "utf8"));
const FILES = ["health-checkup", "vaccination", "development", "feeding", "oral", "sleep", "safety", "daily-life", "childcare", "school"].map((f) => `data/todos/${f}.json`).concat("data/subsidies/national-todos.json");
const defs = FILES.flatMap((f) => rd(f).todos);
const sb7 = defs.find((d) => d.todo_id === "SB-07");

test("SB-07: AGE_WINDOW 0~71개월, 소급 불가(NOT_ALLOWED), 출처·열람일 — NAT-007 범위와 일치", () => {
  assert.deepStrictEqual(JSON.parse(JSON.stringify(sb7.triggerParams)), { startMonth: 0, endMonth: 71 });
  assert.strictEqual(sb7.catchUp, "NOT_ALLOWED");
  assert.ok(/2026-10-02/.test(sb7.source) && /소급 불가/.test(sb7.verificationNote));
  const nat7 = rd("data/subsidies/national.json").subsidies.find((s) => s.id === "NAT-007");
  assert.deepStrictEqual([nat7.minAgeMonths, nat7.maxAgeMonths], [sb7.triggerParams.startMonth, sb7.triggerParams.endMonth]);
});
test("화면 변화 없음: 어떤 월령(0~144개월)에서도 SB-07·SB-08 일정이 생기지 않는다(daycareEnrolled 미선언 → 제외)", () => {
  const now = new Date();
  for (let m = 0; m <= 144; m++) {
    const b = new Date(now.getFullYear(), now.getMonth() - m, 10);
    const ev = globalThis.__buildSchedule({ birthDate: b, province: "서울특별시", district: "구로구", gender: "male", birthOrder: 1, stage: "born" }, { todoDefinitions: defs, subsidy: { subsidies: [] } }, []);
    assert.deepStrictEqual(ev.filter((e) => /^SB-0[78]__/.test(e.id)).map((e) => e.id), [], `${m}개월`);
  }
});
test("기간 행 문구(app.js SB-07): 0~5세·신청일부터 적용(소급 불가)", () => {
  const app = fs.readFileSync(path.join(ROOT, "js/app.js"), "utf8");
  assert.ok(app.includes('"SB-07": [{ label: "지원 기간", start: M(0), end: M(72, -1), note: "만 0~5세, 어린이집 입소 후 신청일부터 적용(소급 불가)" }],'));
});
console.log(`\n${passed}개 통과${process.exitCode ? ", 일부 실패" : ""}`);
