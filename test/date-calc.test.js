/*
 * js/date-calc.js (말일 clamp 월 계산) 테스트.
 * 실행: node test/date-calc.test.js
 *
 * 규칙(Q-A): 대상 월에 원래 일자가 있으면 유지, 없으면 대상 월의 마지막 날. 시·분·초는 보존. 항상 원본에서 한 번에 계산.
 */
const assert = require("assert");
const DateCalc = require("../js/date-calc.js");

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log("  ok  - " + name);
  } catch (e) {
    process.exitCode = 1;
    console.log("  FAIL- " + name + "\n      " + (e.stack || e).split("\n").slice(0, 3).join("\n      "));
  }
}

const D = (y, m, d, h = 0, mi = 0, s = 0, ms = 0) => new Date(y, m - 1, d, h, mi, s, ms);
const show = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
const eq = (actual, expected, msg) => assert.strictEqual(actual.getTime(), expected.getTime(), `${msg || ""} 기대 ${show(expected)} / 실제 ${show(actual)}`);

// 수정 전 방식(schedule.js·hn-logic.js의 setMonth 계산) — 28일 이하 출생은 이것과 결과가 같아야 한다.
const legacyAddMonths = (date, n) => {
  const d = new Date(date);
  d.setMonth(d.getMonth() + n);
  return d;
};

// -------------------------------------------------------------------------------------------------
// 1. 규칙 표 (★ = 사용자 필수 케이스: 1/31, 3/31, 8/31, 2/29)
// -------------------------------------------------------------------------------------------------
const CASES = [
  // [번호, 출생, n, 기대, 비고]
  [1, D(2026, 1, 31), 1, D(2026, 2, 28), "★ 평년 2월"],
  [2, D(2028, 1, 31), 1, D(2028, 2, 29), "★ 윤년 2월"],
  [3, D(2026, 1, 31), 2, D(2026, 3, 31), "★ 31일 있는 달은 그대로"],
  [4, D(2026, 1, 31), 3, D(2026, 4, 30), "★ 30일 월"],
  [5, D(2026, 1, 31), 5, D(2026, 6, 30), ""],
  [6, D(2026, 1, 31), 12, D(2027, 1, 31), "연 경계"],
  [7, D(2026, 1, 31), 13, D(2027, 2, 28), ""],
  [8, D(2026, 1, 31), 144, D(2038, 1, 31), "12년"],
  [9, D(2026, 1, 31), 145, D(2038, 2, 28), ""],
  [10, D(2026, 3, 31), 1, D(2026, 4, 30), "★"],
  [11, D(2026, 3, 31), 11, D(2027, 2, 28), ""],
  [12, D(2026, 3, 31), -1, D(2026, 2, 28), "음수"],
  [13, D(2026, 8, 31), 1, D(2026, 9, 30), "★"],
  [14, D(2026, 8, 31), 6, D(2027, 2, 28), ""],
  [15, D(2026, 8, 31), 18, D(2028, 2, 29), "윤년 도달"],
  [16, D(2024, 2, 29), 12, D(2025, 2, 28), "★ Q-B: 평년 2/28"],
  [17, D(2024, 2, 29), 48, D(2028, 2, 29), "★ 윤년 복귀"],
  [18, D(2024, 2, 29), 1, D(2024, 3, 29), "★"],
  [19, D(2024, 2, 29), -12, D(2023, 2, 28), "음수"],
  [20, D(2026, 5, 31), 9, D(2027, 2, 28), ""],
  [21, D(2026, 12, 31), 2, D(2027, 2, 28), "연 경계"],
  [22, D(2026, 10, 30), 4, D(2027, 2, 28), "30일생"],
  [23, D(2026, 1, 29), 1, D(2026, 2, 28), "29일생 평년"],
  [24, D(2028, 1, 29), 1, D(2028, 2, 29), "29일생 윤년 2월에는 29일이 있어 그대로"],
  [25, D(2026, 1, 30), 1, D(2026, 2, 28), "30일생"],
  [26, D(2026, 1, 31), -2, D(2025, 11, 30), "음수·연 경계"],
  [27, D(2026, 1, 31), 0, D(2026, 1, 31), "항등"],
  [28, D(2026, 1, 31, 12), 1, D(2026, 2, 28, 12), "시각 보존"],
  [29, D(2026, 6, 20), 1, D(2026, 7, 20), "일반(20일생, 무변경)"],
  [30, D(2026, 1, 28), 1, D(2026, 2, 28), "경계(28일생, 무변경)"],
];
CASES.forEach(([no, birth, n, expected, note]) =>
  test(`#${no} ${show(birth).slice(0, 10)} ${n >= 0 ? "+" : ""}${n}개월 → ${show(expected).slice(0, 10)} ${note}`, () => eq(DateCalc.addMonthsClamped(birth, n), expected))
);

// -------------------------------------------------------------------------------------------------
// 2. 입력 검증 (핵심 계산과 분리된 assertMonthCount)
// -------------------------------------------------------------------------------------------------
test("정수가 아닌 월 수는 RangeError (1.5, NaN, Infinity, undefined, 문자열)", () => {
  for (const bad of [1.5, NaN, Infinity, -Infinity, undefined, null, "1"]) {
    assert.throws(() => DateCalc.addMonthsClamped(D(2026, 1, 31), bad), RangeError, `n=${String(bad)}`);
  }
});
test("assertMonthCount는 정수를 통과시키고 비정수만 막는다(별도 함수)", () => {
  for (const ok of [0, 1, -1, 156, -0]) assert.doesNotThrow(() => DateCalc.assertMonthCount(ok));
  assert.throws(() => DateCalc.assertMonthCount(0.5), RangeError);
});
test("Date가 아니거나 잘못된 Date면 오류", () => {
  assert.throws(() => DateCalc.addMonthsClamped("2026-01-31", 1), TypeError);
  assert.throws(() => DateCalc.addMonthsClamped(new Date("invalid"), 1), RangeError);
});
test("입력 Date를 변경하지 않는다(순수)", () => {
  const b = D(2026, 1, 31);
  const t = b.getTime();
  DateCalc.addMonthsClamped(b, 1);
  assert.strictEqual(b.getTime(), t);
});

// -------------------------------------------------------------------------------------------------
// 3. lastDayOfMonth
// -------------------------------------------------------------------------------------------------
test("lastDayOfMonth: 평년·윤년·세기 규칙", () => {
  assert.strictEqual(DateCalc.lastDayOfMonth(2026, 1), 28);
  assert.strictEqual(DateCalc.lastDayOfMonth(2028, 1), 29);
  assert.strictEqual(DateCalc.lastDayOfMonth(2100, 1), 28); // 100의 배수(400의 배수 아님)는 평년
  assert.strictEqual(DateCalc.lastDayOfMonth(2000, 1), 29);
  assert.strictEqual(DateCalc.lastDayOfMonth(2026, 0), 31);
  assert.strictEqual(DateCalc.lastDayOfMonth(2026, 3), 30);
  assert.strictEqual(DateCalc.lastDayOfMonth(2026, 11), 31);
});

// -------------------------------------------------------------------------------------------------
// 4. 시각 보존
// -------------------------------------------------------------------------------------------------
test("시·분·초·밀리초를 보존한다(00:00 / 12:00 / 23:59:59.999)", () => {
  eq(DateCalc.addMonthsClamped(D(2026, 1, 31, 0), 1), D(2026, 2, 28, 0));
  eq(DateCalc.addMonthsClamped(D(2026, 1, 31, 12, 30), 1), D(2026, 2, 28, 12, 30));
  eq(DateCalc.addMonthsClamped(D(2026, 1, 31, 23, 59, 59, 999), 1), D(2026, 2, 28, 23, 59, 59, 999));
});

// -------------------------------------------------------------------------------------------------
// 5. 속성 테스트
// -------------------------------------------------------------------------------------------------
test("P1 28일 이하 출생은 수정 전(setMonth) 결과와 완전히 동일 — 2020~2030 전 월 × n∈[-24,200]", () => {
  let checked = 0;
  for (let y = 2020; y <= 2030; y++) {
    for (let m = 1; m <= 12; m++) {
      for (let d = 1; d <= 28; d++) {
        const b = D(y, m, d);
        for (let n = -24; n <= 200; n++) {
          const got = DateCalc.addMonthsClamped(b, n).getTime();
          const want = legacyAddMonths(b, n).getTime();
          if (got !== want) assert.fail(`${show(b)} ${n}개월: 기대(옛 결과) ${show(new Date(want))} / 실제 ${show(new Date(got))}`);
          checked++;
        }
      }
    }
  }
  assert.ok(checked > 800000);
});

test("P2 모든 출생일(2019~2030) × n∈[0,156]: 결과의 (연,월)은 정확히 출생월+n, 일 = min(출생 일, 그 달 말일)", () => {
  const end = D(2030, 12, 31).getTime();
  let checked = 0;
  for (let t = D(2019, 1, 1); t.getTime() <= end; t = D(t.getFullYear(), t.getMonth() + 1, t.getDate() + 1)) {
    for (let n = 0; n <= 156; n++) {
      const r = DateCalc.addMonthsClamped(t, n);
      const idx = t.getFullYear() * 12 + t.getMonth() + n;
      const wantY = Math.floor(idx / 12), wantM = idx % 12;
      const wantD = Math.min(t.getDate(), DateCalc.lastDayOfMonth(wantY, wantM));
      if (r.getFullYear() !== wantY || r.getMonth() !== wantM || r.getDate() !== wantD) {
        assert.fail(`${show(t)} +${n}: 기대 ${wantY}-${wantM + 1}-${wantD} / 실제 ${show(r)}`);
      }
      checked++;
    }
  }
  assert.ok(checked > 600000);
});

test("P3 단조 증가: f(b, n+1) > f(b, n) (모든 출생일, n∈[0,155])", () => {
  const end = D(2030, 12, 31).getTime();
  for (let t = D(2019, 1, 1); t.getTime() <= end; t = D(t.getFullYear(), t.getMonth() + 1, t.getDate() + 1)) {
    let prev = DateCalc.addMonthsClamped(t, 0).getTime();
    for (let n = 1; n <= 156; n++) {
      const cur = DateCalc.addMonthsClamped(t, n).getTime();
      if (!(cur > prev)) assert.fail(`${show(t)}: n=${n - 1} → ${n}에서 증가하지 않음`);
      prev = cur;
    }
  }
});

test("P5 연쇄 호출 금지 문서화: f(f(1/31,+1),+1)=3/28 ≠ f(1/31,+2)=3/31 — 항상 원본 출생일에서 한 번에 계산해야 한다", () => {
  const birth = D(2026, 1, 31);
  const chained = DateCalc.addMonthsClamped(DateCalc.addMonthsClamped(birth, 1), 1);
  const direct = DateCalc.addMonthsClamped(birth, 2);
  eq(chained, D(2026, 3, 28));
  eq(direct, D(2026, 3, 31));
  assert.notStrictEqual(chained.getTime(), direct.getTime());
});

console.log(`\n${passed}개 통과${process.exitCode ? " (실패 있음)" : ""}`);
