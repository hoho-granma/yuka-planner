/*
 * N4: 아동수당(SB-04) 나이 상한 — 연도별 상한표 + 2017년생 특례. data/subsidies/national-todos.json 의 SB-04.ageCap 과
 * js/hn-logic.js ageCapExceeded / subsidyStatus 를 실제 엔진·실제 데이터로 확인한다(엔진 todo-engine 은 무변경).
 * 실행: node test/n4-subsidy-age-cap.test.js
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { HN, ROOT } = require("./tools/load-engine.js");

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log("  ok  - " + name); } catch (e) { process.exitCode = 1; console.log("  FAIL- " + name + "\n      " + (e.stack || e).split("\n").slice(0, 5).join("\n      ")); }
}

const rd = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), "utf8"));
const NAT = rd("data/subsidies/national-todos.json").todos;
const SB04 = NAT.find((t) => t.todo_id === "SB-04");
const completedMonths = (b, t) => { let m = (t.getFullYear() - b.getFullYear()) * 12 + (t.getMonth() - b.getMonth()); if (t.getDate() < b.getDate()) m--; return m; };

function status(birth, today, defs, id) {
  const evs = global.__buildSchedule({ birthDate: birth, province: "서울특별시", district: "구로구", gender: "M", birthOrder: "first", stage: "born" }, { todoDefinitions: defs || NAT, subsidy: { subsidies: [] } }, []);
  const e = evs.find((x) => x.id.startsWith((id || "SB-04") + "__"));
  if (!e) return null;
  return { e, st: HN.subsidyStatus(e, {}, { today, ageNow: completedMonths(birth, today), pregnant: false, birthDate: birth }), stNoBirth: HN.subsidyStatus(e, {}, { today, ageNow: completedMonths(birth, today), pregnant: false }) };
}

test("데이터: SB-04.ageCap 표·특례·출처가 계획대로", () => {
  assert.deepStrictEqual(JSON.parse(JSON.stringify(SB04.ageCap.maxMonthsByYear)), { 2026: 107, 2027: 119, 2028: 131, 2029: 143, 2030: 155 });
  assert.deepStrictEqual(JSON.parse(JSON.stringify(SB04.ageCap.exceptions)), [{ birthYear: 2017, fromYear: 2026, toYear: 2029 }]);
  assert.ok(/아동수당법/.test(SB04.ageCap.source) && /2026-10-02/.test(SB04.ageCap.source));
  assert.strictEqual(SB04.catchUp, "ALLOWED"); // 엔진 입력은 그대로
  assert.strictEqual(SB04.triggerParams.endMonth, 108);
  assert.ok(NAT.filter((t) => t.ageCap).length === 1, "ageCap 은 SB-04 에만");
});

test("판정표(2026-10-02): 2018년생 이후 신청 가능 · 2017년생 특례 신청 가능 · 2016·2015년생 만료", () => {
  const today = new Date(2026, 9, 2);
  const cases = [[2026, 3, "available"], [2024, 5, "available"], [2019, 0, "available"], [2018, 9, "available"], [2018, 0, "available"], [2017, 11, "available"], [2017, 0, "available"], [2016, 11, "expired"], [2016, 0, "expired"], [2015, 5, "expired"], [2013, 5, "expired"]];
  for (const [y, m, want] of cases) {
    const r = status(new Date(y, m, 15), today);
    assert.ok(r && r.e, `${y}-${m + 1} 이벤트 없음`);
    if (y <= 2026 && y >= 2018 && completedMonths(new Date(y, m, 15), today) > 107) assert.fail("표 오류");
    assert.strictEqual(r.st, want, `${y}-${m + 1} → ${r.st}`);
  }
});

test("2017년생 111개월(사용자 시나리오)은 2026년에 신청 가능, 상한표만 쓰면 만료가 되는 구조(대조)", () => {
  const b = new Date(2017, 6, 1);
  const today = new Date(2026, 9, 2);
  assert.strictEqual(completedMonths(b, today), 111);
  assert.strictEqual(status(b, today).st, "available");
  assert.strictEqual(HN.ageCapExceeded({ ageCap: { maxMonthsByYear: SB04.ageCap.maxMonthsByYear } }, b, today), true); // 특례를 빼면 초과
});

test("기준연도는 today: 2027·2028·2029·2030 및 표 밖(2031) 판정", () => {
  const ex = (b, t) => HN.ageCapExceeded(SB04, b, t);
  // 2027: 상한 119개월. 2016-12-15생은 2027-10-02에 129개월 → 초과 / 2018-01-15생은 117개월 → 가능
  assert.strictEqual(ex(new Date(2016, 11, 15), new Date(2027, 9, 2)), true);
  assert.strictEqual(ex(new Date(2018, 0, 15), new Date(2027, 9, 2)), false);
  // 2017년생: 2029까지 특례, 2030부터는 표(155)만 — 2017-01-15생은 2030-10-02에 165개월 → 초과
  assert.strictEqual(ex(new Date(2017, 0, 15), new Date(2029, 11, 31)), false);
  assert.strictEqual(ex(new Date(2017, 0, 15), new Date(2030, 0, 2)), false); // 156개월 아님: 2030-01-02 는 155개월 이하
  assert.strictEqual(ex(new Date(2017, 0, 15), new Date(2030, 9, 2)), true);
  // 표 앞쪽 연도(2025)는 첫 값(107)을 쓴다: 2017-01-15생은 107개월(가능), 2016-01-15생은 119개월(초과)
  assert.strictEqual(ex(new Date(2017, 0, 15), new Date(2025, 11, 31)), false);
  assert.strictEqual(ex(new Date(2016, 0, 15), new Date(2025, 11, 31)), true);
  // 표 밖 뒤쪽 연도(2031)는 마지막 값(155): 2020-01-15생 136개월(가능), 2015-01-15생 197개월(초과)
  assert.strictEqual(ex(new Date(2020, 0, 15), new Date(2031, 5, 1)), false);
  assert.strictEqual(ex(new Date(2015, 0, 15), new Date(2031, 5, 1)), true);
});

test("ageCap 이 없거나 생일을 모르면 기존 판정 그대로(OVERDUE_CATCHUP→available), 임신 중도 영향 없음", () => {
  const today = new Date(2026, 9, 2);
  const r = status(new Date(2015, 5, 15), today);
  assert.strictEqual(r.st, "expired");
  assert.strictEqual(r.stNoBirth, "available"); // birthDate 미전달 → 비활성(호출부가 항상 전달해야 함)
  assert.strictEqual(HN.ageCapExceeded(null, new Date(2015, 0, 1), today), false);
  assert.strictEqual(HN.ageCapExceeded({}, new Date(2015, 0, 1), today), false);
  assert.strictEqual(HN.ageCapExceeded(SB04, null, today), false);
  assert.strictEqual(HN.ageCapExceeded(SB04, new Date(2027, 0, 1), today), false); // 출산 예정(미래)
  assert.strictEqual(HN.ageCapExceeded(SB04, new Date(2015, 0, 1), undefined), false);
});

test("신청 완료(applied)·만료(OVERDUE_FINAL)·예정(upcoming)은 상한 판정과 무관하게 기존대로", () => {
  const today = new Date(2026, 9, 2);
  const r = status(new Date(2015, 5, 15), today);
  assert.strictEqual(HN.subsidyStatus(r.e, { [r.e.id]: { done: true } }, { today, ageNow: 136, pregnant: false, birthDate: new Date(2015, 5, 15) }), "applied");
  const nb = status(new Date(2026, 8, 1), today);
  assert.strictEqual(nb.st, "available");
});

test("호출부 전수: subsidyBuckets/subsidyStatus 를 부르는 곳(home.js·subsidy-view.js)은 모두 birthDate 를 넘긴다", () => {
  const calls = [];
  for (const f of fs.readdirSync(path.join(ROOT, "js")).filter((x) => x.endsWith(".js"))) {
    const src = fs.readFileSync(path.join(ROOT, "js", f), "utf8");
    if (f !== "hn-logic.js" && /subsidyBuckets\(|subsidyStatus\(/.test(src)) calls.push(f);
  }
  assert.deepStrictEqual(calls.sort(), ["home.js", "subsidy-view.js"]);
  for (const f of calls) {
    const src = fs.readFileSync(path.join(ROOT, "js", f), "utf8");
    const m = src.match(/const sctx = \{[^}]*\};/g) || [];
    assert.strictEqual(m.length, 1, f);
    assert.ok(/birthDate: ctx\.profile && ctx\.profile\.birthDate/.test(m[0]), f + ": " + m[0]);
  }
});

// ── 전수 스윕: 0~215개월 × 엔진 전체 지원금 정의 × today 주입 ──
const oracle = (b, today) => {
  const m = completedMonths(b, today);
  const y = today.getFullYear();
  const cap = { 2026: 107, 2027: 119, 2028: 131, 2029: 143, 2030: 155 }[Math.min(2030, Math.max(2026, y))];
  if (b.getFullYear() === 2017 && y >= 2026 && y <= 2029) return false;
  return m > cap;
};
test("스윕: 0~215개월(월 경계 포함) × today(2026·2027·2029·2030) — SB-04 만 상한을 적용하고 나머지 SB 정의는 판정이 상한 유무와 무관", () => {
  let n = 0;
  const noCap = NAT.map((t) => { const c = { ...t }; delete c.ageCap; return c; });
  for (const today of [new Date(2026, 9, 2), new Date(2027, 2, 31), new Date(2029, 0, 1), new Date(2029, 11, 31), new Date(2030, 5, 30)]) {
    for (let m = 0; m <= 215; m++) {
      for (const day of [1, 15, 28, 31]) {
        const b = new Date(today.getFullYear(), today.getMonth() - m, day);
        if (b > today) continue;
        const evs = global.__buildSchedule({ birthDate: b, province: "서울특별시", district: "구로구", gender: "M", birthOrder: "first", stage: "born" }, { todoDefinitions: NAT, subsidy: { subsidies: [] } }, []);
        const evs0 = global.__buildSchedule({ birthDate: b, province: "서울특별시", district: "구로구", gender: "M", birthOrder: "first", stage: "born" }, { todoDefinitions: noCap, subsidy: { subsidies: [] } }, []);
        const ctx = { today, ageNow: completedMonths(b, today), pregnant: false, birthDate: b };
        assert.strictEqual(evs.length, evs0.length);
        for (const e of evs) {
          const base = evs0.find((x) => x.id === e.id);
          const s1 = HN.subsidyStatus(e, {}, ctx), s0 = HN.subsidyStatus(base, {}, ctx);
          if (e.id.startsWith("SB-04__")) {
            const cand = s0 === "available";
            const want = cand && oracle(b, today) ? "expired" : s0;
            assert.strictEqual(s1, want, `SB-04 ${b.toDateString()} @${today.toDateString()} base=${s0}`);
          } else assert.strictEqual(s1, s0, `${e.id} ${b.toDateString()}`);
          n++;
        }
      }
    }
  }
  assert.ok(n > 5000, "스윕 규모: " + n);
});

test("엔진 무변경: todo-engine.js·schedule.js 는 HEAD 와 동일(이 변경이 건드리지 않음)", () => {
  const { execSync } = require("child_process");
  const out = execSync("git diff --name-only HEAD -- js/todo-engine.js js/schedule.js", { cwd: ROOT }).toString().trim();
  assert.strictEqual(out, "");
});

test("레거시·지역 지원금: 나이 상한 판정이 바뀌지 않는다(상한 필드 없음 → 기존 min/max 판정 그대로)", () => {
  const files = [];
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith(".json") && files.push(path.join(d, e.name))));
  walk(path.join(ROOT, "data/subsidies"));
  let n = 0;
  for (const f of files) {
    if (f.endsWith("national-todos.json")) continue;
    let d; try { d = JSON.parse(fs.readFileSync(f, "utf8")); } catch (e) { continue; }
    if (!Array.isArray(d.subsidies)) continue;
    d.subsidies.forEach((s) => { assert.ok(!s.ageCap, f + " " + s.id); n++; });
  }
  assert.ok(n > 0);
});

console.log(`\n${passed}개 통과${process.exitCode ? ", 일부 실패" : ""}`);
