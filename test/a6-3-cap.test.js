/*
 * A6-3 테스트: 서비스 상한 36 → 72개월, 기존 Todo·지원금 36개월 보존(LEGACY_TODO_CAP_MONTHS), 체크리스트 구간 3개 추가.
 * 실제 엔진·schedule.js·실제 Todo 데이터를 Node에서 실행한다(app.js 는 Node 에서 못 돌려서 repeatMonthRangeOf/체크리스트 그룹 계산은 아래에 복제하되,
 * cap·가시성·그룹 판정은 전부 ChildTimeline 의 함수를 호출한다). 실행: node test/a6-3-cap.test.js
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

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log("  ok  - " + name); } catch (e) { process.exitCode = 1; console.log("  FAIL- " + name + "\n      " + (e.stack || e).split("\n").slice(0, 5).join("\n      ")); }
}

const rd = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), "utf8"));
const TODO_FILES = ["health-checkup", "vaccination", "development", "feeding", "oral", "sleep", "safety", "daily-life", "childcare"].map((f) => `data/todos/${f}.json`).concat("data/subsidies/national-todos.json", "data/todos/school.json"); // A6-4: 학교 정의를 포함해도 36 보존 대상이 정확히 10개여야 한다
const defs = TODO_FILES.flatMap((f) => rd(f).todos);
const D = (y, m, d) => new Date(y, m - 1, d);
const REGIONS = {
  "서울특별시|구로구": ["data/subsidies/national.json", "data/subsidies/seoul/city.json", "data/subsidies/seoul/districts/구로구.json"],
  "경기도|수원시": ["data/subsidies/national.json", "data/subsidies/gyeonggi/city.json", "data/subsidies/gyeonggi/수원시/subsidies.json"],
  "경기도|과천시": ["data/subsidies/national.json", "data/subsidies/gyeonggi/city.json", "data/subsidies/gyeonggi/과천시/subsidies.json"],
};
const subsidiesOf = (region) => REGIONS[region].filter((p) => fs.existsSync(path.join(ROOT, p))).flatMap((p) => rd(p).subsidies);
const build = (birth, region = "서울특별시|구로구", completions = []) => {
  const [province, district] = region.split("|");
  return globalThis.__build({ birthDate: birth, province, district, gender: "male", birthOrder: 1, stage: "born" }, { todoDefinitions: defs, subsidy: { subsidies: subsidiesOf(region) } }, completions);
};
const cm = (b, d) => CT.completedMonths(b, d);
const defOf = (e) => (e.isEngineEvent && e.detail ? e.detail.definition : null);
const evKey = (e) => (e.isEngineEvent ? `${defOf(e).todo_id}${e.detail.instance.occurrenceKey && e.detail.instance.occurrenceKey !== "default" ? "__" + e.detail.instance.occurrenceKey : ""}` : e.id);

// ── 1. cap 대상 규칙: 정확히 10개, undefined 와 null 구분 ─────────────────────────────────────
const CAPPED = ["DV-09", "FD-05", "FD-09", "FD-10", "OR-01", "OR-04", "SF-02", "SF-04", "SF-05", "VX-FLU"];

test("36개월 보존 대상 정의는 정확히 10개(마일스톤 5 + endMonth null 5)", () => {
  const ids = defs.filter(CT.isLegacyCappedDefinition).map((d) => d.todo_id).sort();
  assert.deepStrictEqual(ids, CAPPED);
  assert.deepStrictEqual(defs.filter((d) => d.triggerType === "MILESTONE_EVENT").map((d) => d.todo_id).sort(), ["DV-09", "OR-01", "SF-02", "SF-04", "SF-05"]);
});

test("isLegacyCappedDefinition: endMonth null 만 해당 — undefined·0·숫자·빈 triggerParams·정의 없음은 해당하지 않는다", () => {
  const f = CT.isLegacyCappedDefinition;
  assert.strictEqual(f({ triggerType: "AGE_WINDOW", triggerParams: { startMonth: 12, endMonth: null } }), true);
  assert.strictEqual(f({ triggerType: "MILESTONE_EVENT", triggerParams: { event: "x" } }), true);
  assert.strictEqual(f({ triggerType: "AGE_WINDOW", triggerParams: { startMonth: 12 } }), false); // undefined
  assert.strictEqual(f({ triggerType: "AGE_WINDOW", triggerParams: { startMonth: 0, endMonth: 0 } }), false);
  assert.strictEqual(f({ triggerType: "AGE_WINDOW", triggerParams: { startMonth: 0, endMonth: 72 } }), false);
  assert.strictEqual(f({ triggerType: "AGE_WINDOW", triggerParams: {} }), false);
  assert.strictEqual(f({ triggerType: "AGE_WINDOW" }), false); // 다회차 접종처럼 triggerParams 없음
  assert.strictEqual(f(null), false);
});

test("effectiveMaxMonths: 엔진 이벤트는 정의 규칙, 엔진이 아닌 이벤트(지원금)는 36", () => {
  const ev = build(D(2026, 6, 20));
  const by = (id) => ev.find((e) => e.isEngineEvent && defOf(e).todo_id === id);
  assert.strictEqual(CT.effectiveMaxMonths(by("SF-01")), 72);
  assert.strictEqual(CT.effectiveMaxMonths(by("LF-02")), 72); // 상한 72 안에서 자기 endMonth(48)까지는 repeat 계산이 정한다
  assert.strictEqual(CT.effectiveMaxMonths(by("FD-05")), 36);
  assert.strictEqual(CT.effectiveMaxMonths(by("SF-02")), 36);
  const subs = ev.filter((e) => !e.isEngineEvent);
  assert.ok(subs.length > 0);
  subs.forEach((e) => assert.strictEqual(CT.effectiveMaxMonths(e), 36, e.id));
});

// ── 2. 가시성: 기존 0~36개월 결과 불변, 신규 노출은 Todo 4건뿐 ─────────────────────────────────
const BIRTHS = [D(2026, 6, 20), D(2026, 1, 31), D(2024, 2, 29), D(2023, 9, 30), D(2023, 6, 20), D(2021, 3, 15), D(2020, 7, 31), D(2018, 1, 15), D(2015, 5, 5)];

test("모든 출생일·지역: 기존(날짜 월령 ≤ 36) 노출은 그대로이고, 새로 노출되는 것은 월령 > 36 인 Todo 회차 7건뿐(다회차 4 + 검진 HC-07~09, 지원금 0건)", () => {
  for (const region of Object.keys(REGIONS)) {
    for (const b of BIRTHS) {
      const ev = build(b, region);
      const oldVis = new Set(ev.filter((e) => cm(b, e.date) <= 36).map((e) => e.id));
      const newVis = new Set(ev.filter((e) => CT.isEventVisible(b, e)).map((e) => e.id));
      for (const id of oldVis) assert.ok(newVis.has(id), `${region} ${b.toDateString()}: 사라짐 ${id}`);
      // 학령기 확장(옵트인 규칙: VX-JEV dose-5 등)은 이 테스트의 범위 밖 — 72개월 이하 아이에게 안 보인다는 것은 school-age-2.test.js 가 확인한다
      const added = ev.filter((e) => newVis.has(e.id) && !oldVis.has(e.id) && !CT.extendedRuleOf(e));
      added.forEach((e) => assert.ok(cm(b, e.date) > 36 && cm(b, e.date) <= 72, `${e.id} 월령 ${cm(b, e.date)}`));
      assert.deepStrictEqual(added.filter((e) => !e.isEngineEvent).map((e) => e.id), [], `지원금 신규 노출: ${region}`);
      assert.deepStrictEqual(added.map(evKey).sort(), ["HC-07", "HC-08", "HC-09", "VX-DTAP__dose-5", "VX-IPV__dose-4", "VX-JEV__dose-4", "VX-MMR__dose-2"], `${region} ${b.toDateString()}`);
    }
  }
});

test("상한만 72로 올렸다면(보존 규칙 없이) 더 노출됐을 항목: 36 보존 규칙이 실제로 막고 있다 (지원금·마일스톤·null 정의)", () => {
  const b = D(2023, 6, 20); // 39개월
  const ev = build(b, "경기도|수원시");
  const plain72 = ev.filter((e) => CT.isWithinServiceRange(b, e.date));
  const guarded = ev.filter((e) => CT.isEventVisible(b, e));
  const hidden = plain72.filter((e) => !guarded.includes(e));
  assert.ok(hidden.some((e) => e.isEngineEvent && defOf(e).triggerType === "MILESTONE_EVENT"), "마일스톤 대기가 36 보존으로 가려짐");
});

// ── 3. OR-04 / VX-FLU: 엔진 계산은 그대로, 보이는지만 36에서 끊는다 ─────────────────────────────
test("OR-04: 완료 이력으로 다음 회차는 정상 계산되고(엔진 무접촉), 36개월 이내면 보이고 36개월을 넘으면 기존처럼 숨는다", () => {
  const b = D(2019, 1, 15);
  const done = (dates) => dates.map((d, i) => ({ todo_id: "OR-04", occurrenceKey: `occ-${i + 1}`, recordType: "TODO_COMPLETED", recordedAt: d }));
  const three = build(b, undefined, done([D(2020, 3, 1), D(2020, 9, 1), D(2021, 3, 1)])).filter((e) => e.isEngineEvent && defOf(e).todo_id === "OR-04");
  const o4 = three.find((e) => e.detail.instance.occurrenceKey === "occ-4");
  assert.ok(o4, "occ-4 계산됨");
  assert.ok(cm(b, o4.date) <= 36 && CT.isEventVisible(b, o4), `월령 ${cm(b, o4.date)}`);
  const five = build(b, undefined, done([D(2020, 3, 1), D(2020, 9, 1), D(2021, 3, 1), D(2021, 9, 1), D(2022, 3, 1)])).filter((e) => e.isEngineEvent && defOf(e).todo_id === "OR-04");
  const o6 = five.find((e) => e.detail.instance.occurrenceKey === "occ-6");
  assert.ok(o6, "occ-6 계산됨(숨겨도 엔진은 계산한다)");
  assert.ok(cm(b, o6.date) > 36 && cm(b, o6.date) <= 72, `월령 ${cm(b, o6.date)}`);
  assert.ok(CT.isWithinServiceRange(b, o6.date), "상한 72만 보면 보이는 위치");
  assert.strictEqual(CT.isEventVisible(b, o6), false, "36 보존으로 숨김(기존과 같음)");
});

// ── 4. 달력·체크리스트 행 수: +52 / +9 (app.js repeatMonthRangeOf·체크리스트 그룹 복제) ──────────
const LEGACY_BUCKETS = CT.CHECKLIST_BUCKETS.slice(0, 3);
const bucketWith = (buckets) => (m) => (typeof m !== "number" || m <= 12 ? m : (buckets.find((x) => m >= x.start && m <= x.end) || buckets[buckets.length - 1]).start);
const occStart = (td, key) => {
  const lists = [];
  if (Array.isArray(td.occurrences)) lists.push(td.occurrences);
  if (td.variants && Array.isArray(td.variants.options)) td.variants.options.forEach((o) => Array.isArray(o.occurrences) && lists.push(o.occurrences));
  for (const l of lists) { const o = l.find((x) => x.occurrenceKey === key); if (o && o.trigger && o.trigger.type === "AGE_WINDOW" && typeof o.trigger.startMonth === "number") return Math.round(o.trigger.startMonth); }
  return null;
};
function monthKeys(e, b, capOf) {
  // app.js repeatMonthRangeOf
  const def = defOf(e);
  const inst = e.detail && e.detail.instance;
  if (def && e.category !== "행정·지원금" && e.isDateSpecific === false && !(inst.occurrenceKey && inst.occurrenceKey !== "default")) {
    const tp = def.triggerParams;
    if (tp && typeof tp.startMonth === "number") {
      const cap = capOf(e), dm = def.displayMonth, ws = Math.max(0, Math.floor(tp.startMonth));
      const end = tp.endMonth == null ? cap : Math.min(cap, Math.ceil(tp.endMonth));
      const start = typeof dm === "number" && dm > ws && dm <= end ? Math.floor(dm) : ws;
      if (end > start) { const r = []; for (let m = start; m <= end; m++) r.push(m); return r; }
    }
  }
  if (!def) return [typeof e.minAgeMonths === "number" ? e.minAgeMonths : "NEED"];
  if (inst.occurrenceKey && inst.occurrenceKey !== "default") { const o = occStart(def, inst.occurrenceKey); return [o !== null ? o : Math.max(0, cm(b, e.date))]; }
  return [def.displayMonth == null ? "NEED" : def.displayMonth];
}
function rows(b, region, mode) {
  const ev = build(b, region);
  const legacy = mode === "legacy";
  const vis = ev.filter((e) => (legacy ? cm(b, e.date) <= 36 : CT.isEventVisible(b, e)));
  const bucket = bucketWith(legacy ? LEGACY_BUCKETS : CT.CHECKLIST_BUCKETS);
  const per = {};
  let cal = 0, chk = 0;
  for (const e of vis) {
    const ks = monthKeys(e, b, legacy ? () => 36 : CT.effectiveMaxMonths);
    const c = ks.filter((k) => k !== "NEED").length;
    const g = new Set(ks.map((k) => (k === "NEED" ? "NEED" : bucket(k)))).size;
    per[evKey(e)] = { c, g };
    cal += c; chk += g;
  }
  return { cal, chk, per, n: vis.length };
}

test("신규 노출 Todo 7건(다회차 4 + 검진 HC-07~09) / SF-01 달력 +36 / LF-02 달력 +12 / HC-07·08 달력 +7·HC-09 +6 / 달력 총 +102(KG-01 +30 포함) / 체크리스트 +17(KG-01 +3 포함), 그 밖의 항목 행 수는 불변", () => {
  for (const region of Object.keys(REGIONS)) {
    const b = D(2026, 6, 20);
    const A = rows(b, region, "legacy"), N = rows(b, region, "new");
    assert.strictEqual(N.n - A.n, 7, `${region} 신규 이벤트`);
    const diff = {};
    for (const k of new Set([...Object.keys(A.per), ...Object.keys(N.per)])) {
      const a = A.per[k] || { c: 0, g: 0 }, n = N.per[k] || { c: 0, g: 0 };
      if (a.c !== n.c || a.g !== n.g) diff[k] = { c: n.c - a.c, g: n.g - a.g };
    }
    assert.deepStrictEqual(diff, {
      "SF-01": { c: 36, g: 3 }, "LF-02": { c: 12, g: 2 },
      "KG-01": { c: 30, g: 3 }, // A3(2026-10-05 사용자 승인): 유치원 입학 신청 정보 항목(36+ 허용 목록, KNOW/INFO) — 36~65개월 월령 칸에 노출(캐시 36→72 확장분)
      "HC-07": { c: 7, g: 2 }, "HC-08": { c: 7, g: 2 }, "HC-09": { c: 6, g: 1 }, // 6·7·8차 검진(창 42~48/54~60/66~71) — 기간형이 아니라 월령 칸 항목
      "VX-DTAP__dose-5": { c: 1, g: 1 }, "VX-IPV__dose-4": { c: 1, g: 1 }, "VX-MMR__dose-2": { c: 1, g: 1 }, "VX-JEV__dose-4": { c: 1, g: 1 },
    }, region);
    assert.strictEqual(N.cal - A.cal, 102, `${region} 달력`);
    assert.strictEqual(N.chk - A.chk, 17, `${region} 체크리스트`);
  }
});

test("다회차 신규 4건의 그룹은 이벤트 날짜(47개월)가 아니라 회차 시작 월령 기준: 48 → 만 4세, JEV 4차(72) → 만 5~6세", () => {
  const b = D(2026, 6, 20);
  const ev = build(b).filter((e) => e.isEngineEvent && ["dose-5", "dose-4", "dose-2"].includes(e.detail.instance.occurrenceKey));
  const key = (id) => monthKeys(ev.find((e) => evKey(e) === id), b, CT.effectiveMaxMonths)[0];
  assert.strictEqual(CT.checklistGroupLabel(CT.checklistBucket(key("VX-DTAP__dose-5"))), "만 4세 (48~59개월)");
  assert.strictEqual(CT.checklistGroupLabel(CT.checklistBucket(key("VX-MMR__dose-2"))), "만 4세 (48~59개월)");
  assert.strictEqual(CT.checklistGroupLabel(CT.checklistBucket(key("VX-JEV__dose-4"))), "만 5~6세 (60~72개월)");
});

// ── 5. stageBand 경계는 서비스 상한과 분리 ───────────────────────────────────────────────────
test("stageBand 영유아/학령전 경계는 INFANT_TODDLER_MAX_MONTHS(36) — 서비스 상한 72를 따라가지 않는다", () => {
  const SP = require("../js/school-policy.js");
  const policy = {
    enrollmentOffsetYears: { value: 7, verificationStatus: "확인됨", source: "테스트 전용" },
    schoolYearStartMonth: { value: 3, verificationStatus: "확인됨", source: "테스트 전용" },
    preElementaryYearsBefore: { value: 1, verificationStatus: "제품정의", kind: "PRODUCT_DEFINITION", source: "테스트 전용" },
  };
  assert.ok(SP && policy);
  const c = D(2024, 6, 1);
  const sch = (asOf) => CT.computeSchool(c, asOf, policy, {});
  assert.strictEqual(sch(D(2027, 6, 1)).stageBand, "INFANT_TODDLER"); // 36개월
  assert.strictEqual(sch(D(2027, 7, 1)).stageBand, "PRESCHOOL"); // 37개월
  assert.strictEqual(sch(D(2029, 10, 1)).stageBand, "PRESCHOOL"); // 64개월(72 이하여도 PRESCHOOL)
});

console.log(`${passed}개 통과`);
