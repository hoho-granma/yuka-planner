/*
 * I-4 재발 방지: 경기 과천시 GGM-GWACHEON-03 · 양주시 GGM-YANGJU-04 (deadlineType age_window)의 deadlineValue 가
 * {minMonths, maxMonths} 정수 객체여야 하고, 실제 일정 계산(js/schedule.js buildSchedule)이 모든 출생일에서 Invalid Date/NaN 없이 끝나는지 본다.
 * (data-month-integers.test.js 는 전체 데이터의 모양을 검사하고, 이 파일은 두 항목을 실제 계산 경로로 확인한다.)
 * 실행: node test/subsidy-age-window-regions.test.js
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

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log("  ok  - " + name); } catch (e) { process.exitCode = 1; console.log("  FAIL- " + name + "\n      " + (e.stack || e).split("\n").slice(0, 5).join("\n      ")); }
}

const load = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), "utf8")).subsidies;
const CASES = [
  { id: "GGM-GWACHEON-03", file: "data/subsidies/gyeonggi/과천시/subsidies.json", district: "과천시", min: 96, max: 155 },
  { id: "GGM-YANGJU-04", file: "data/subsidies/gyeonggi/양주시/subsidies.json", district: "양주시", min: 0, max: 36 },
];
const item = (c) => load(c.file).find((s) => s.id === c.id);
const valid = (d) => d instanceof Date && !isNaN(d.getTime());

// 출생일: 0~180개월(월 단위 간격) + 말일 경계
const births = [];
for (let m = 0; m <= 180; m += 3) { const d = new Date(2026, 9, 1); d.setMonth(d.getMonth() - m); births.push(d); }
births.push(new Date(2024, 1, 29), new Date(2026, 0, 31), new Date(2020, 7, 31));

const build = (district, subsidies, b) => globalThis.__build({ birthDate: b, province: "경기도", district, gender: "male", birthOrder: "second", stage: "born" }, { todoDefinitions: [], subsidy: { subsidies } }, []);

for (const c of CASES) {
  test(`${c.id}: age_window 의 deadlineValue 는 {minMonths:${c.min}, maxMonths:${c.max}} 정수 객체이고 minAgeMonths·maxAgeMonths 와 같다`, () => {
    const s = item(c);
    assert.strictEqual(s.deadlineType, "age_window");
    assert.deepStrictEqual(s.deadlineValue, { minMonths: c.min, maxMonths: c.max });
    assert.ok(Number.isInteger(s.deadlineValue.minMonths) && Number.isInteger(s.deadlineValue.maxMonths));
    assert.deepStrictEqual([s.minAgeMonths, s.maxAgeMonths], [c.min, c.max]);
  });

  test(`${c.id}: 모든 출생일(0~180개월·말일 경계)에서 일정 날짜·마감·안내 문구가 Invalid Date/NaN 없이 계산된다`, () => {
    const s = item(c);
    for (const b of births) {
      const ev = build(c.district, [s], b).find((e) => e.id === c.id);
      assert.ok(ev, `${c.id} 이벤트 없음 (${b.toDateString()})`);
      assert.ok(valid(ev.date) && valid(ev.entryDate) && valid(ev.deadlineDate), `${c.id} ${b.toDateString()}: date=${ev.date} entry=${ev.entryDate} deadline=${ev.deadlineDate}`);
      assert.ok(!/NaN|undefined|Invalid/.test(String(ev.dateLabel)), `${c.id} dateLabel=${ev.dateLabel}`);
    }
  });
}

test("대조군: 예전 잘못된 값(문자열·숫자)이면 같은 경로에서 Invalid Date 가 되어 위 검사가 실제로 실패를 잡는다", () => {
  const broken = [
    { ...item(CASES[0]), deadlineValue: "96~155개월(만 8세~13세 미만)" },
    { ...item(CASES[1]), deadlineValue: 36 },
  ];
  const warn = console.warn; console.warn = () => {}; // schedule.js 가 잘못된 값을 경고로 알린다(예상된 동작)
  try {
  broken.forEach((s, i) => {
    const b = new Date(2026, 0, 15);
    let bad = false;
    try {
      const ev = build(CASES[i].district, [s], b).find((e) => e.id === s.id);
      bad = !ev || !valid(ev.deadlineDate) || /NaN|undefined|Invalid/.test(String(ev.dateLabel));
    } catch (e) { bad = true; } // 계산 중 예외도 실패로 본다
    assert.ok(bad, `${s.id}: 잘못된 값인데도 정상 계산됨 — 검사가 무력합니다`);
  });
  } finally { console.warn = warn; }
});

console.log(`\n${passed}개 통과${process.exitCode ? ", 일부 실패" : ""}`);
