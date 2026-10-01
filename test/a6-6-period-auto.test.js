/*
 * §14 기간형 AUTO 테스트 (js/hn-logic.js periodRangeOf · classifyHomeItems 의 period · 달력 점 제외 · 기존 0~36개월 보존).
 * 실제 엔진·schedule.js·실제 데이터(data/todos/*.json)를 Node 에서 실행한다. app.js 의 monthKeysOf 는 DOM 에 묶여 있어 읽지 않고,
 * 같은 규칙의 복제(baseKeys: 다회차 = 회차 시작월령, 반복 = repeatMonthRangeOf)를 아래에 둔다(A6-3 auto-diff 복제와 같은 방식).
 * 실행: node test/a6-6-period-auto.test.js
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
const HN = require("../js/hn-logic.js");
const SP = require("../js/school-policy.js");

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log("  ok  - " + name); } catch (e) { process.exitCode = 1; console.log("  FAIL- " + name + "\n      " + (e.stack || e).split("\n").slice(0, 5).join("\n      ")); }
}

const rd = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), "utf8"));
const FILES = ["health-checkup", "vaccination", "development", "feeding", "oral", "sleep", "safety", "daily-life", "childcare", "school"].map((f) => `data/todos/${f}.json`).concat("data/subsidies/national-todos.json");
const defs = FILES.flatMap((f) => rd(f).todos);
const policy = SP.normalize(rd("data/policy/school.json"));
const TARGET = ["VX-DTAP__dose-5", "VX-IPV__dose-4", "VX-MMR__dose-2"];
const BIRTH = new Date(2021, 5, 15);
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const atMonths = (m, plusDays = 10) => { const d = DateCalc.addMonthsClamped(BIRTH, m); return new Date(d.getFullYear(), d.getMonth(), d.getDate() + plusDays); };

const events = globalThis.__build({ birthDate: BIRTH, province: "서울특별시", district: "구로구", gender: "male", birthOrder: 1, stage: "born", schoolPolicy: policy }, { todoDefinitions: defs, subsidy: { subsidies: [] } }, []);
const vis = events.filter((e) => CT.isEventVisible(BIRTH, e));

// ---- app.js displayMonthKeyOf / repeatMonthRangeOf 복제 (엔진 이벤트 한정) ----
function occStart(td, key) {
  const lists = [];
  if (Array.isArray(td.occurrences)) lists.push(td.occurrences);
  if (td.variants && td.variants.options) td.variants.options.forEach((o) => o.occurrences && lists.push(o.occurrences));
  for (const l of lists) { const o = l.find((x) => x.occurrenceKey === key); if (o && o.trigger && o.trigger.type === "AGE_WINDOW" && typeof o.trigger.startMonth === "number") return Math.round(o.trigger.startMonth); }
  return null;
}
function monthKeysOf(e) {
  if (!(e.isEngineEvent && e.detail && e.detail.definition)) return [typeof e.minAgeMonths === "number" ? e.minAgeMonths : "NEED"];
  const td = e.detail.definition, inst = e.detail.instance;
  if (e.category !== "행정·지원금" && e.isDateSpecific === false && !(inst.occurrenceKey && inst.occurrenceKey !== "default") && td.triggerType !== "SCHOOL_TERM_WINDOW") {
    const tp = td.triggerParams;
    if (tp && typeof tp.startMonth === "number") {
      const ws = Math.max(0, Math.floor(tp.startMonth));
      const cap = CT.effectiveMaxMonths(e);
      const end = tp.endMonth == null ? cap : Math.min(cap, Math.ceil(tp.endMonth));
      const start = typeof td.displayMonth === "number" && td.displayMonth > ws && td.displayMonth <= end ? Math.floor(td.displayMonth) : ws;
      if (end > start) { const r = []; for (let m = start; m <= end; m++) r.push(m); return r; }
    }
  }
  if (td.schoolGroup) return ["SCHOOL"];
  if (inst.occurrenceKey && inst.occurrenceKey !== "default") { const o = occStart(td, inst.occurrenceKey); return [o !== null ? o : Math.max(0, CT.completedMonths(BIRTH, e.date))]; }
  return [td.displayMonth == null ? "NEED" : td.displayMonth];
}
const popts = { birthDate: BIRTH, monthKeysOf, guardMonths: CT.LEGACY_TODO_CAP_MONTHS, maxMonths: CT.SERVICE_RANGE.maxMonths };
const periodRangeOf = (e) => HN.periodRangeOf(e, popts);
const classify = (m, done = {}, withPeriod = true) => HN.classifyHomeItems(vis, done, { today: atMonths(m), birthDate: BIRTH, monthKeysOf, ...(withPeriod ? { periodRangeOf } : {}) });
const idsOf = (list) => list.map((x) => x.e.id).sort();

test("기간형 대상은 정확히 4~6세 추가접종 3건(시작 월령 48, 달력 점 없음)", () => {
  const hit = vis.filter((e) => periodRangeOf(e)).map((e) => e.id).sort();
  assert.deepStrictEqual(hit, [...TARGET].sort());
  for (const e of vis.filter((x) => TARGET.includes(x.id))) assert.strictEqual(periodRangeOf(e).startKey, 48);
});

test("검진 6~8차(HC-07~09, 엔진 window 끝 월령 48/60/71 < 서비스 상한 72)는 기간형이 아니다 — periodRangeOf null, 월령 칸 분류에 들어간다, 기존 3건은 그대로", () => {
  const hc = vis.filter((e) => /^HC-0[789]__/.test(e.id));
  assert.deepStrictEqual(hc.map((e) => e.id).sort(), ["HC-07__default", "HC-08__default", "HC-09__default"]);
  hc.forEach((e) => assert.strictEqual(periodRangeOf(e), null, e.id));
  assert.deepStrictEqual(vis.filter((e) => periodRangeOf(e)).map((e) => e.id).sort(), [...TARGET].sort()); // 기존 3건 불변
  // 월령 칸 분류: 창 안(HC-07 42~48개월)에서는 thisMonth, 시작 전은 upcoming, 지나면 past, period 에는 한 번도 안 들어간다.
  const where = (m, id) => { const c = classify(m); return ["thisMonth", "upcoming", "past", "period"].filter((k) => c[k].some((x) => x.e.id === id)); };
  assert.ok(where(44, "HC-07__default").includes("thisMonth"), "44개월 HC-07 thisMonth");
  assert.deepStrictEqual(where(30, "HC-07__default"), ["upcoming"]);
  assert.deepStrictEqual(where(66, "HC-07__default"), ["past"]);
  for (const m of [30, 42, 44, 54, 60, 66, 71, 72]) for (const id of ["HC-07__default", "HC-08__default", "HC-09__default"]) assert.ok(!where(m, id).includes("period"), `${m}개월 ${id}`);
});

test("기간: 시작 = 출생일+48개월, 끝 = 72개월이 끝나는 날(isEventVisible 의 completedMonths<=72 와 같은 기준)", () => {
  const r = periodRangeOf(vis.find((e) => e.id === TARGET[0]));
  assert.strictEqual(ymd(r.start), "2025-06-15");
  assert.strictEqual(ymd(r.end), "2027-07-14"); // 출생 2021-06-15 + 73개월(2027-07-15) 전날
  assert.strictEqual(CT.completedMonths(BIRTH, r.end), 72);
  assert.strictEqual(CT.completedMonths(BIRTH, new Date(r.end.getFullYear(), r.end.getMonth(), r.end.getDate() + 1)), 73);
});

test("가드: 시작 월령 ≤ 36 인 항목·지원금·학교·window 항목은 기간형이 아니다(0~36개월 보존)", () => {
  for (const e of vis) {
    if (TARGET.includes(e.id)) continue;
    assert.strictEqual(periodRangeOf(e), null, e.id);
  }
});

test("홈: 48~72개월은 period 3건, 47개월·73개월은 0건 — 엔진 window 가 먼저 끝나는 71~72개월에도 유지", () => {
  const n = (m) => classify(m).period.length;
  assert.strictEqual(n(47), 0);
  for (const m of [48, 55, 59, 60, 63, 71, 72]) assert.strictEqual(n(m), 3, `${m}개월`);
  assert.strictEqual(n(73), 0);
  assert.strictEqual(n(80), 0);
  const w = vis.find((e) => e.id === TARGET[0]);
  assert.ok(w.windowEnd < atMonths(72, 0), "전제: 엔진 window 는 72개월 전에 끝난다");
});

test("홈: 기간형 항목은 thisMonth·upcoming·past 에 들어가지 않는다(월령 칸 분류와 분리)", () => {
  for (const m of [40, 48, 63, 72]) {
    const c = classify(m);
    for (const k of ["thisMonth", "upcoming", "past"]) for (const x of c[k]) assert.ok(!TARGET.includes(x.e.id), `${m}개월 ${k} ${x.e.id}`);
  }
});

test("0~36개월 분류는 periodRangeOf 유무와 무관하게 같다(기존 UX 보존)", () => {
  const strip = (c) => JSON.stringify(["thisMonth", "upcoming", "past"].map((k) => c[k].map((x) => x.e.id + "|" + ymd(x.start) + "|" + ymd(x.end))));
  for (let m = 0; m <= 36; m += 1) {
    const a = HN.classifyHomeItems(vis.filter((e) => !TARGET.includes(e.id)), {}, { today: atMonths(m), birthDate: BIRTH, monthKeysOf });
    const b = HN.classifyHomeItems(vis.filter((e) => !TARGET.includes(e.id)), {}, { today: atMonths(m), birthDate: BIRTH, monthKeysOf, periodRangeOf });
    assert.strictEqual(strip(a), strip(b), `${m}개월`);
  }
});

test("완료하면 홈 기간 카드에서 빠지고, 3건 모두 완료하면 카드가 사라진다", () => {
  const done = (...ids) => Object.fromEntries(ids.map((i) => [i, { todo_id: i }]));
  assert.strictEqual(classify(63, done(TARGET[0])).period.length, 2);
  assert.deepStrictEqual(idsOf(classify(63, done(TARGET[0])).period), [TARGET[1], TARGET[2]].sort());
  assert.strictEqual(classify(63, done(...TARGET)).period.length, 0);
});

test("달력: 기간형을 뺀 목록은 추천일(점)이 0건, 나머지 항목의 추천일은 그대로", () => {
  const dots = (list) => HN.assignDisplayDays(list, { birthDate: BIRTH, monthKeysOf });
  const without = vis.filter((e) => !periodRangeOf(e));
  const a = dots(vis), b = dots(without);
  for (const id of TARGET) assert.ok(!b.has(id) || b.get(id).length === 0, id);
  for (const e of without) assert.deepStrictEqual((b.get(e.id) || []).map(ymd), (a.get(e.id) || []).map(ymd), e.id);
});

test("48개월 불일치 해소: 기존은 홈 3건/달력 이번 달 0건(월령 한 달이 두 달력 월에 걸침), 기간형은 월령 칸 0건·달력 점 0건·홈=기간 카드 3건", () => {
  // 2026-10-01 에 만 48개월인 아이(출생 2022-09-15): 48개월째 기간 9/15~10/14 — 홈은 10월과 겹쳐 노출, 달력 추천일은 9월 슬롯에만 찍힌다.
  const b = new Date(2022, 8, 15), today = new Date(2026, 9, 1);
  const ev = globalThis.__build({ birthDate: b, province: "서울특별시", district: "구로구", gender: "male", birthOrder: 1, stage: "born", schoolPolicy: policy }, { todoDefinitions: defs, subsidy: { subsidies: [] } }, []).filter((e) => CT.isEventVisible(b, e));
  const keys = (e) => monthKeysOf(e);
  const per = (e) => HN.periodRangeOf(e, { birthDate: b, monthKeysOf: keys, guardMonths: 36, maxMonths: 72 });
  const T = (list) => list.filter((e) => TARGET.includes(e.id));
  const before = HN.classifyHomeItems(ev, {}, { today, birthDate: b, monthKeysOf: keys });
  const dd = HN.assignDisplayDays(ev, { birthDate: b, monthKeysOf: keys });
  const calNow = T(ev).map((e) => (dd.get(e.id) || []).filter((d) => d.getFullYear() === 2026 && d.getMonth() === 9).length).reduce((a, c) => a + c, 0);
  assert.strictEqual(before.thisMonth.filter((x) => TARGET.includes(x.e.id)).length, 3); // 홈 3건
  assert.strictEqual(calNow, 0); // 달력 0건 — 기존 불일치
  const after = HN.classifyHomeItems(ev, {}, { today, birthDate: b, monthKeysOf: keys, periodRangeOf: per });
  assert.strictEqual(after.thisMonth.filter((x) => TARGET.includes(x.e.id)).length, 0);
  assert.strictEqual(after.period.length, 3);
  const dd2 = HN.assignDisplayDays(ev.filter((e) => !per(e)), { birthDate: b, monthKeysOf: keys });
  assert.strictEqual(T(ev).filter((e) => (dd2.get(e.id) || []).length).length, 0);
});

test("ID·occurrenceKey 보존: 이벤트 id 는 ${todo_id}__${occurrenceKey} 그대로, 기간형이 새 id 를 만들지 않는다", () => {
  const ids = vis.map((e) => e.id);
  assert.strictEqual(new Set(ids).size, ids.length);
  for (const id of TARGET) { const e = vis.find((x) => x.id === id); assert.strictEqual(e.id, `${e.detail.instance.todo_id}__${e.detail.instance.occurrenceKey}`); }
  assert.strictEqual(vis.filter((e) => TARGET.includes(e.id)).length, 3);
});

test("periodRangeOf 는 입력 이벤트를 바꾸지 않는다(저장·필드 추가 없음)", () => {
  const e = vis.find((x) => x.id === TARGET[0]);
  const before = JSON.stringify(Object.keys(e).sort());
  periodRangeOf(e);
  assert.strictEqual(JSON.stringify(Object.keys(e).sort()), before);
});

console.log(`\n${passed} passed`);
if (process.exitCode) console.log("FAILED");
