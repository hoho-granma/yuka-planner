/*
 * N3 테스트 — 나이 표기(세는 나이): 36개월 미만 "생후 N개월", 36개월 이상 "N세" = asOf 연도 − 출생 연도 + 1(생일 무관).
 * 36개월 이상 판정은 완료 개월 수 기준. 임신 중 null·ageLabel(개월 전용) 호환·호출처 교체를 확인한다. 실행: node test/n3-age-label.test.js
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const CT = require("../js/child-timeline.js");

const ROOT = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log("  ok  - " + name); } catch (e) { process.exitCode = 1; console.log("  FAIL- " + name + "\n      " + (e.stack || e).split("\n").slice(0, 6).join("\n      ")); }
}
const D = (y, m, d) => new Date(y, m - 1, d);

console.log("경계");
test("35→36개월: 생후 35개월 → (36개월이 되는 날) 4세 — 2023-10-05생", () => {
  assert.strictEqual(CT.ageLabelAt(D(2023, 10, 5), D(2026, 10, 4)), "생후 35개월");
  assert.strictEqual(CT.ageLabelAt(D(2023, 10, 5), D(2026, 10, 5)), "4세");
});
test("같은 해 안에서의 경계(월말 출생): 2023-01-31생은 2026-01-30 생후 35개월, 2026-01-31 4세", () => {
  assert.strictEqual(CT.ageLabelAt(D(2023, 1, 31), D(2026, 1, 30)), "생후 35개월");
  assert.strictEqual(CT.ageLabelAt(D(2023, 1, 31), D(2026, 1, 31)), "4세");
});
test("세는 나이는 생일과 무관: 2017-06-15생은 생일 전(2026-06-14)이든 후(2026-10-02)든 2026년엔 10세", () => {
  assert.strictEqual(CT.ageLabelAt(D(2017, 6, 15), D(2026, 6, 14)), "10세");
  assert.strictEqual(CT.ageLabelAt(D(2017, 6, 15), D(2026, 6, 15)), "10세");
  assert.strictEqual(CT.ageLabelAt(D(2017, 6, 15), D(2026, 10, 2)), "10세");
  assert.strictEqual(CT.ageLabelAt(D(2017, 6, 15), D(2025, 12, 31)), "9세");
});
test("연말연시: 2017-12-31생 — 2025-12-31 9세, 2026-01-01 10세(해가 바뀌면 한 살), 2026-12-31 10세", () => {
  assert.strictEqual(CT.ageLabelAt(D(2017, 12, 31), D(2025, 12, 31)), "9세");
  assert.strictEqual(CT.ageLabelAt(D(2017, 12, 31), D(2026, 1, 1)), "10세");
  assert.strictEqual(CT.ageLabelAt(D(2017, 12, 31), D(2026, 12, 31)), "10세");
  assert.strictEqual(CT.ageLabelAt(D(2017, 1, 1), D(2026, 12, 31)), "10세");
});
test("윤일 출생(2020-02-29): 2023-02-28 생후 35개월, 2023-03-01 4세, 2024-02-29 5세", () => {
  assert.strictEqual(CT.ageLabelAt(D(2020, 2, 29), D(2023, 2, 28)), "생후 35개월");
  assert.strictEqual(CT.ageLabelAt(D(2020, 2, 29), D(2023, 3, 1)), "4세");
  assert.strictEqual(CT.ageLabelAt(D(2020, 2, 29), D(2024, 2, 29)), "5세");
});
test("36개월 미만은 항상 개월 표기(0~35), 출생 전(asOf<출생)은 생후 0개월", () => {
  for (let m = 0; m <= 35; m++) assert.strictEqual(CT.ageLabelAt(D(2025, 1, 15), new Date(2025, 0 + m, 15)), `생후 ${m}개월`);
  assert.strictEqual(CT.ageLabelAt(D(2026, 12, 31), D(2026, 9, 30)), "생후 0개월");
});
test("연령이 큰 아이(111개월·만 12세 근처)도 연도 차 기반", () => {
  assert.strictEqual(CT.ageLabelAt(D(2017, 6, 15), D(2026, 10, 2)), "10세");
  assert.strictEqual(CT.ageLabelAt(D(2014, 3, 1), D(2026, 10, 2)), "13세");
});

console.log("전수 확인");
test("여러 출생일 × 0~215개월: 라벨 = (완료 개월<36 ? 생후 N개월 : asOf연도−출생연도+1 세), 같은 날짜에서 연도 차는 줄지 않는다", () => {
  const births = [D(2017, 6, 15), D(2020, 2, 29), D(2023, 1, 31), D(2023, 12, 31), D(2019, 1, 1), D(2024, 8, 30)];
  for (const b of births) {
    let prevYears = 0;
    for (let days = 0; days <= 216 * 31; days += 9) {
      const asOf = new Date(b.getFullYear(), b.getMonth(), b.getDate() + days);
      const m = CT.completedMonths(b, asOf);
      const exp = m < 36 ? `생후 ${m}개월` : `${asOf.getFullYear() - b.getFullYear() + 1}세`;
      assert.strictEqual(CT.ageLabelAt(b, asOf), exp, `${b.toDateString()} → ${asOf.toDateString()}`);
      if (m >= 36) { const y = Number(CT.ageLabelAt(b, asOf).replace("세", "")); assert.ok(y >= prevYears); prevYears = y; }
    }
  }
});

console.log("호환·연결");
test("ageLabel(개월 전용)은 그대로이고 compute().label 은 ageLabelAt, 임신 중 label 은 null", () => {
  assert.strictEqual(CT.ageLabel(36), "생후 36개월");
  assert.strictEqual(CT.ageLabel(0), "생후 0개월");
  const a = CT.compute({ birthDate: D(2025, 8, 15), asOf: D(2026, 9, 30), stage: "born" });
  assert.strictEqual(a.label, "생후 13개월");
  const b = CT.compute({ birthDate: D(2017, 6, 15), asOf: D(2026, 10, 2), stage: "born" });
  assert.deepStrictEqual([b.label, b.age.totalMonths, b.age.years], ["10세", 111, 9]);
  assert.strictEqual(CT.compute({ birthDate: D(2026, 12, 31), asOf: D(2026, 9, 30), stage: "pregnant" }).label, null);
  assert.deepStrictEqual(Object.keys(CT.compute({ birthDate: D(2017, 6, 15), asOf: D(2026, 10, 2), stage: "born" })), ["age", "label", "school"]);
});
test("호출처(D72a: 기록 화면 삭제): 헤더·프로필 시트 모두 ageLabelAt(생년월일, 기준 날짜)를 쓰고 개월 전용 ageLabel 직접 호출은 남지 않았다", () => {
  const app = read("js/app.js");
  assert.ok((app.match(/ChildTimeline\.ageLabelAt\(profile\.birthDate, today\)/g) || []).length >= 2);
  for (const f of ["js/app.js", "js/home.js", "js/subsidy-view.js", "js/user-schedule-view.js", "js/household-view.js"]) assert.ok(!/ChildTimeline\.ageLabel\(/.test(read(f)), f);
});
test("월령 의미 문구는 그대로: 체크리스트 구간 라벨·지원금 기간 문구('생후 N개월')는 바뀌지 않았다", () => {
  assert.strictEqual(CT.checklistGroupLabel(5), "생후 5개월");
  assert.ok(read("js/schedule.js").includes("`생후 ${s.deadlineValue.minMonths}~${s.deadlineValue.maxMonths}개월 사이 신청`"));
  assert.ok(read("js/app.js").includes("생후 3개월~만 12세 이하, 소득기준 충족 시"));
  assert.deepStrictEqual(CT.CHECKLIST_BUCKETS.slice(0, 6).map((b) => b.label), ["만 1세 (13~17개월)", "만 1세 (18~23개월)", "만 2세 (24~36개월)", "만 3세 (37~47개월)", "만 4세 (48~59개월)", "만 5~6세 (60~72개월)"]);
});
test("AUTO 계산·완료·규칙 파일은 바뀌지 않았다(나이 표기만 변경)", () => {
  const { execSync } = require("child_process");
  const changed = execSync("git diff --name-only 913f9a1 90c9740", { cwd: ROOT, encoding: "utf8" }).split("\n");
  ["firestore.rules", "js/todo-engine.js", "js/schedule.js", "js/hn-logic.js", "js/sync.js", "js/household-sync.js", "js/calendar-model.js", "js/user-schedule.js"].forEach((f) => assert.ok(!changed.includes(f), f));
});

console.log(`\n${passed}개 통과${process.exitCode ? ", 일부 실패" : ""}`);
