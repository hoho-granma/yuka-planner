/*
 * auto-diff — 기준선 커밋 대비 "자동 일정(AUTO)" 결과 비교 도구. 소스를 수정하지 않는다(읽기 전용). 골든 JSON을 만들지 않는다.
 *
 *   node test/tools/auto-diff.js [--base <커밋>] [--allow-birth-day-ge <일>] [--report <파일>]
 *
 * "전" = 기준선 커밋(기본 479d68e)의 js/*.js 를 `git show`로 읽어 계산, "후" = 현재 작업 트리. 둘 다 **지금의 데이터**로 계산하므로
 * data/subsidies 가 다른 트랙에서 바뀌어도 코드 변경만 비교된다.
 *
 * 비교 대상(고정 픽스처마다)
 *   - 이벤트 날짜 필드(date, fixedDate, windowStart, windowEnd, entryDate, deadlineDate), 유형, 카테고리
 *   - 추천일(displayDate = assignDisplayDays 결과, 순서 무관), 홈 분류(classifyHomeItems)
 *   - 표시 범위: visibleSchedule 이 통과시키는 이벤트 id 목록          (app.js:764 공식을 복제)
 *   - 체크리스트: 이벤트별 대표 월령 키·그룹 라벨                        (app.js checklistBucket/checklistGroupLabel 복제)
 *   - 헤더 "생후 N개월" 문자열, 월령 0~48 의 그룹 키·라벨 표, 생년월일 선택기 연도 수
 * app.js 는 Node 에서 실행할 수 없어 위 공식은 이 파일에 **복제**했다(기준선 공식). "후"는 js/child-timeline.js 가 있으면 그 모듈의
 * 함수를, 없으면 같은 복제 공식을 쓴다 → 모듈로 옮긴 뒤에도 값이 같아야 통과.
 *
 * 판정
 *   STOP(종료코드 3): 엔진 windowStart/windowEnd 변경 · 이벤트 집합 변경 · 유형/카테고리 변경
 *   FAIL(종료코드 1): 그 밖의 모든 차이. 단 --allow-birth-day-ge N 이면 "출생 일자 ≥ N 인 픽스처"의 차이는 승인된 차이 목록으로 보고만 한다.
 *   대조군(출생 일자 ≤ 28)은 항상 차이 0 이어야 한다.
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const cp = require("child_process");

const ROOT = path.join(__dirname, "..", "..");
const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : dflt;
};
const BASE = opt("--base", "479d68e");
const ALLOW_DAY_GE = Number(opt("--allow-birth-day-ge", "0")) || 0;
const REPORT = opt("--report", path.join(ROOT, "test", "golden", "auto-diff-report.md"));

const git = (a) => cp.execFileSync("git", a, { cwd: ROOT, encoding: "utf8", maxBuffer: 1 << 28, stdio: ["ignore", "pipe", "ignore"] });
const rdText = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const rd = (p) => JSON.parse(rdText(p));

// ---------------------------------------------------------------- 데이터
const TODO_FILES = ["health-checkup", "vaccination", "development", "feeding", "oral", "sleep", "safety", "daily-life", "childcare"].map((f) => `data/todos/${f}.json`).concat("data/subsidies/national-todos.json");
const defs = TODO_FILES.flatMap((f) => rd(f).todos);
const REGIONS = {
  "서울특별시|구로구": ["data/subsidies/national.json", "data/subsidies/seoul/city.json", "data/subsidies/seoul/districts/구로구.json"],
  "경기도|수원시": ["data/subsidies/national.json", "data/subsidies/gyeonggi/city.json", "data/subsidies/gyeonggi/수원시/subsidies.json"],
  "경기도|과천시": ["data/subsidies/national.json", "data/subsidies/gyeonggi/city.json", "data/subsidies/gyeonggi/과천시/subsidies.json"],
};
const subsidiesOf = (region) => REGIONS[region].filter((p) => fs.existsSync(path.join(ROOT, p))).flatMap((p) => rd(p).subsidies);

// [출생일(임신이면 출산예정일), stage, 지역]  — 출생 일자 ≤28 = 대조군
const G = "서울특별시|구로구";
const FIXTURES = [
  ["2026-06-20", "born", G], ["2026-01-28", "born", G], ["2026-05-15", "born", G], ["2026-02-28", "born", G],
  ["2023-09-30", "born", G], // 오늘(2026-09-30) 기준 정확히 36개월
  ["2023-10-01", "born", G], // 35개월
  ["2023-09-28", "born", G], // 36개월 + 2일
  ["2023-06-20", "born", G], // 39개월(36 초과)
  ["2026-01-29", "born", G], ["2026-01-30", "born", G], ["2026-01-31", "born", G], ["2026-03-31", "born", G], ["2026-08-31", "born", G], ["2024-02-29", "born", G],
  ["2026-12-31", "pregnant", G],
  ["2026-06-20", "born", "경기도|수원시"], ["2026-06-20", "born", "경기도|과천시"],
];
const TODAY = new Date(2026, 8, 30);

// ---------------------------------------------------------------- 파이프라인 적재
function makePipeline(src) {
  const sandbox = { Date, console, TodoEngine: require(path.join(ROOT, "js/todo-engine.js")) };
  const mods = {};
  const loadMod = (name, code) => {
    const m = { exports: {} };
    new Function("module", "exports", "require", "global", code)(m, m.exports, (p) => {
      const k = path.basename(p, ".js");
      if (mods[k]) return mods[k];
      throw new Error("예상하지 못한 require: " + p);
    }, globalThis);
    mods[name] = m.exports;
    return m.exports;
  };
  loadMod("date-calc", src["js/date-calc.js"]);
  sandbox.DateCalc = mods["date-calc"];
  if (src["js/child-timeline.js"]) sandbox.ChildTimeline = loadMod("child-timeline", src["js/child-timeline.js"]);
  vm.createContext(sandbox);
  vm.runInContext(src["js/schedule.js"] + "\n;this.__api = { buildSchedule, ageInMonths };", sandbox);
  const L = loadMod("hn-logic", src["js/hn-logic.js"]);
  return { api: sandbox.__api, L, CT: sandbox.ChildTimeline || null };
}
const FILES = ["js/date-calc.js", "js/schedule.js", "js/hn-logic.js", "js/child-timeline.js"];
const baseSrc = () => {
  const o = {};
  for (const f of FILES) {
    try {
      o[f] = git(["show", `${BASE}:${f}`]);
    } catch (e) {
      /* 기준선에 없는 파일(child-timeline 등) */
    }
  }
  return o;
};
const currentSrc = () => {
  const o = {};
  for (const f of FILES) if (fs.existsSync(path.join(ROOT, f))) o[f] = rdText(f);
  return o;
};

// ---------------------------------------------------------------- app.js 공식 복제(기준선) — 모듈이 있으면 "후"는 모듈을 쓴다
const NEED_CHECK_GROUP = "NEED_CHECK";
const LEGACY_BUCKETS = [
  { start: 13, end: 17, label: "만 1세 (13~17개월)" },
  { start: 18, end: 23, label: "만 1세 (18~23개월)" },
  { start: 24, end: 36, label: "만 2세 (24~36개월)" },
];
const legacy = {
  isVisible: (P, birth, eventDate) => P.api.ageInMonths(birth, eventDate) <= 36,
  bucket: (m) => {
    if (typeof m !== "number" || m <= 12) return m;
    const b = LEGACY_BUCKETS.find((x) => m >= x.start && m <= x.end);
    return b ? b.start : LEGACY_BUCKETS[LEGACY_BUCKETS.length - 1].start;
  },
  groupLabel: (key) => {
    const b = LEGACY_BUCKETS.find((x) => x.start === key);
    return b && key > 12 ? b.label : `생후 ${key}개월`;
  },
  headerLabel: (months) => `생후 ${months}개월`,
  pickerYears: () => 9, // app.js:618 thisYear..thisYear-8
  repeatCap: () => 36, // app.js:1412
};
function impl(P) {
  const CT = P.CT;
  if (!CT) return legacy;
  const pick = (name, fallback) => (typeof CT[name] === "function" ? CT[name] : fallback);
  const rng = CT.SERVICE_RANGE || null;
  return {
    isVisible: CT.isWithinServiceRange ? (P2, birth, eventDate) => CT.isWithinServiceRange(birth, eventDate) : legacy.isVisible,
    bucket: pick("checklistBucket", legacy.bucket),
    groupLabel: pick("checklistGroupLabel", legacy.groupLabel),
    headerLabel: pick("ageLabel", legacy.headerLabel),
    pickerYears: () => (rng && rng.pickerYearsBack !== undefined ? rng.pickerYearsBack + 1 : legacy.pickerYears()),
    repeatCap: () => (rng && rng.maxMonths !== undefined ? rng.maxMonths : legacy.repeatCap()),
  };
}

function makeMonthKeysOf(P, birth, I) {
  const occurrenceStartMonth = (td, occurrenceKey) => {
    if (!td || !occurrenceKey) return null;
    const lists = [];
    if (Array.isArray(td.occurrences)) lists.push(td.occurrences);
    if (td.variants && Array.isArray(td.variants.options)) td.variants.options.forEach((o) => Array.isArray(o.occurrences) && lists.push(o.occurrences));
    for (const list of lists) {
      const occ = list.find((o) => o.occurrenceKey === occurrenceKey);
      if (occ && occ.trigger && occ.trigger.type === "AGE_WINDOW" && typeof occ.trigger.startMonth === "number") return Math.round(occ.trigger.startMonth);
    }
    return null;
  };
  const displayMonthKeyOf = (e) => {
    if (e.isLegacySubsidy) return typeof e.minAgeMonths === "number" ? e.minAgeMonths : NEED_CHECK_GROUP;
    if (!(e.isEngineEvent && e.detail && e.detail.definition)) return NEED_CHECK_GROUP;
    const td = e.detail.definition;
    const inst = e.detail.instance;
    if (inst.occurrenceKey && inst.occurrenceKey !== "default") {
      const occ = occurrenceStartMonth(td, inst.occurrenceKey);
      if (occ !== null) return occ;
      return Math.max(0, P.api.ageInMonths(birth, e.date));
    }
    return td.displayMonth === null || td.displayMonth === undefined ? NEED_CHECK_GROUP : td.displayMonth;
  };
  const repeatMonthRangeOf = (e) => {
    if (!(e.isEngineEvent && e.detail && e.detail.definition)) return null;
    if (e.category === "행정·지원금") return null;
    if (e.isDateSpecific !== false) return null;
    const inst = e.detail.instance;
    if (inst.occurrenceKey && inst.occurrenceKey !== "default") return null;
    const tp = e.detail.definition.triggerParams;
    if (!tp || typeof tp.startMonth !== "number") return null;
    const cap = I.repeatCap();
    const dm = e.detail.definition.displayMonth;
    const windowStart = Math.max(0, Math.floor(tp.startMonth));
    const end = tp.endMonth == null ? cap : Math.min(cap, Math.ceil(tp.endMonth));
    const start = typeof dm === "number" && dm > windowStart && dm <= end ? Math.floor(dm) : windowStart;
    if (end <= start) return null;
    const months = [];
    for (let m = start; m <= end; m++) months.push(m);
    return months;
  };
  return (e) => repeatMonthRangeOf(e) || [displayMonthKeyOf(e)];
}

// ---------------------------------------------------------------- 스냅샷
const pad = (n) => String(n).padStart(2, "0");
const ds = (d) => (d instanceof Date && !isNaN(d) ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` : null);

function snapshot(P, [birthStr, stage, region]) {
  const [province, district] = region.split("|");
  const I = impl(P);
  const birth = new Date(birthStr + "T00:00:00");
  const profile = { birthDate: birth, province, district, gender: null, birthOrder: "first", stage };
  const events = P.api.buildSchedule(profile, { todoDefinitions: defs, subsidy: { subsidies: subsidiesOf(region) } }, []);
  const visible = events.filter((e) => I.isVisible(P, birth, e.date));
  const monthKeysOf = makeMonthKeysOf(P, birth, I);
  const evs = {};
  for (const e of events) {
    const dateStable = !e.isEngineEvent || !!e.windowStart; // windowStart 없는 엔진 항목의 date 는 "지금"이라 시간 의존 → 제외
    evs[e.id] = { kind: e.scheduleKind, category: e.category, date: dateStable ? ds(e.date) : null, fixedDate: ds(e.fixedDate), windowStart: ds(e.windowStart), windowEnd: ds(e.windowEnd), entryDate: ds(e.entryDate), deadlineDate: ds(e.deadlineDate) };
  }
  const dd = P.L.assignDisplayDays(visible, { birthDate: birth, monthKeysOf });
  const displayDays = {};
  for (const [id, days] of dd) displayDays[id] = days.map(ds).sort();
  const home = P.L.classifyHomeItems(visible, {}, { today: TODAY, birthDate: birth, monthKeysOf });
  const homeOut = {};
  for (const k of ["thisMonth", "upcoming", "past"]) homeOut[k] = home[k].map((x) => `${x.e.id}|${ds(x.start)}|${ds(x.end)}|${x.done}`).sort();
  const checklist = {};
  for (const e of visible) checklist[e.id] = monthKeysOf(e).map((k) => [k, typeof k === "number" ? I.groupLabel(I.bucket(k)) : k]);
  const months = P.api.ageInMonths(birth, TODAY);
  return {
    events: evs, displayDays, home: homeOut,
    visibleIds: visible.map((e) => e.id).sort(),
    checklist,
    header: stage === "born" ? I.headerLabel(Math.max(0, months)) : null, // 임신 표기는 이번 비교 범위 밖
    currentBucket: stage === "born" ? [I.bucket(Math.max(0, months)), I.groupLabel(I.bucket(Math.max(0, months)))] : null,
  };
}

function tables(P) {
  const I = impl(P);
  const t = { bucketTable: {}, headerTable: {}, pickerYears: I.pickerYears(), repeatCap: I.repeatCap() };
  for (let m = 0; m <= 48; m++) {
    t.bucketTable[m] = [I.bucket(m), I.groupLabel(I.bucket(m))];
    t.headerTable[m] = I.headerLabel(m);
  }
  return t;
}

function snapshotAll(P) {
  const out = { fixtures: {}, tables: tables(P) };
  for (const f of FIXTURES) out.fixtures[f.join("|")] = snapshot(P, f);
  return out;
}

// ---------------------------------------------------------------- 비교
const before = snapshotAll(makePipeline(baseSrc()));
const after = snapshotAll(makePipeline(currentSrc()));

const stop = [];
const diffs = []; // {fixture, area, id, before, after}
const per = [];
const add = (fx, area, id, b, a) => diffs.push({ fixture: fx, area, id, before: b, after: a });

for (const key of Object.keys(before.fixtures)) {
  const [birthStr] = key.split("|");
  const B = before.fixtures[key], A = after.fixtures[key];
  const start = diffs.length;
  const bi = Object.keys(B.events).sort(), ai = Object.keys(A.events).sort();
  if (JSON.stringify(bi) !== JSON.stringify(ai)) stop.push(`${key}: 이벤트 집합 변경`);
  for (const id of bi) {
    const b = B.events[id], a = A.events[id];
    if (!a) continue;
    for (const f of ["kind", "category"]) if (b[f] !== a[f]) stop.push(`${key} ${id}: ${f} 변경 ${b[f]} → ${a[f]}`);
    for (const f of ["windowStart", "windowEnd"]) if (b[f] !== a[f]) stop.push(`${key} ${id}: ${f} 변경 ${b[f]} → ${a[f]}  ← 엔진 무접촉 조건 위반`);
    for (const f of ["date", "fixedDate", "entryDate", "deadlineDate"]) if (b[f] !== a[f]) add(key, `날짜 필드 ${f}`, id, b[f], a[f]);
  }
  for (const id of new Set([...Object.keys(B.displayDays), ...Object.keys(A.displayDays)])) {
    const b = JSON.stringify(B.displayDays[id] || []), a = JSON.stringify(A.displayDays[id] || []);
    if (b !== a) add(key, "추천일", id, b, a);
  }
  for (const k of ["thisMonth", "upcoming", "past"]) {
    const bs = new Set(B.home[k]), as = new Set(A.home[k]);
    for (const x of bs) if (!as.has(x)) add(key, `홈 ${k}`, x.split("|")[0], x, "(없음)");
    for (const x of as) if (!bs.has(x)) add(key, `홈 ${k}`, x.split("|")[0], "(없음)", x);
  }
  if (JSON.stringify(B.visibleIds) !== JSON.stringify(A.visibleIds)) {
    const bs = new Set(B.visibleIds), as = new Set(A.visibleIds);
    for (const id of bs) if (!as.has(id)) add(key, "표시 범위", id, "표시", "숨김");
    for (const id of as) if (!bs.has(id)) add(key, "표시 범위", id, "숨김", "표시");
  }
  for (const id of new Set([...Object.keys(B.checklist), ...Object.keys(A.checklist)])) {
    const b = JSON.stringify(B.checklist[id]), a = JSON.stringify(A.checklist[id]);
    if (b !== a) add(key, "체크리스트 그룹", id, b, a);
  }
  if (B.header !== A.header) add(key, "헤더 표기", "-", B.header, A.header);
  if (JSON.stringify(B.currentBucket) !== JSON.stringify(A.currentBucket)) add(key, "현재 월령 그룹", "-", JSON.stringify(B.currentBucket), JSON.stringify(A.currentBucket));
  per.push({ key, day: Number(birthStr.slice(8, 10)), n: diffs.length - start });
}
for (const k of Object.keys(before.tables.bucketTable)) {
  if (JSON.stringify(before.tables.bucketTable[k]) !== JSON.stringify(after.tables.bucketTable[k])) add("표", "그룹 표", `월령 ${k}`, JSON.stringify(before.tables.bucketTable[k]), JSON.stringify(after.tables.bucketTable[k]));
  if (before.tables.headerTable[k] !== after.tables.headerTable[k]) add("표", "헤더 표", `월령 ${k}`, before.tables.headerTable[k], after.tables.headerTable[k]);
}
if (before.tables.pickerYears !== after.tables.pickerYears) add("표", "선택기 연도 수", "-", before.tables.pickerYears, after.tables.pickerYears);
if (before.tables.repeatCap !== after.tables.repeatCap) add("표", "반복 월령 상한", "-", before.tables.repeatCap, after.tables.repeatCap);

// 대조군(출생 일자 ≤ 28)은 항상 차이 0, 그 밖의 차이는 --allow-birth-day-ge 로 승인된 범위만 허용
const violations = [];
for (const d of diffs) {
  if (d.fixture === "표") { violations.push(`${d.area} ${d.id}: ${d.before} → ${d.after}`); continue; }
  const day = Number(d.fixture.slice(8, 10));
  if (!(ALLOW_DAY_GE && day >= ALLOW_DAY_GE)) violations.push(`${d.fixture} ${d.area} ${d.id}: ${d.before} → ${d.after}`);
}

// ---------------------------------------------------------------- 리포트
const L = [`# auto-diff 리포트`, "", `- 기준선: ${BASE} ↔ 현재 작업 트리 (같은 데이터로 계산)`, `- 승인된 차이 범위: ${ALLOW_DAY_GE ? `출생 일자 ≥ ${ALLOW_DAY_GE}` : "없음(모든 차이 = 실패)"}`, `- 이벤트 총 ${Object.values(after.fixtures).reduce((s, x) => s + Object.keys(x.events).length, 0)}건, 픽스처 ${FIXTURES.length}개`, "", "## 픽스처별 차이 건수", "", "| 픽스처 | 출생 일자 | 차이 |", "|---|---|---|"];
per.forEach((p) => L.push(`| ${p.key} | ${p.day} | ${p.n} |`));
const areas = [...new Set(diffs.map((d) => d.area.replace(/ .*/, "")))];
L.push("", "## 차이 목록", "");
if (!diffs.length) L.push("차이 없음.");
else {
  L.push("| 픽스처 | 영역 | id | 전 | 후 |", "|---|---|---|---|---|");
  diffs.slice(0, 400).forEach((d) => L.push(`| ${d.fixture} | ${d.area} | ${d.id} | ${d.before} | ${d.after} |`));
  if (diffs.length > 400) L.push(`| … | | | | (이하 ${diffs.length - 400}건 생략) |`);
}
L.push("", "## 판정", "", `- STOP(엔진 창·이벤트 집합·유형): ${stop.length}건`, `- 승인 범위 밖 차이: ${violations.length}건`);
stop.forEach((x) => L.push(`  - STOP: ${x}`));
violations.slice(0, 50).forEach((x) => L.push(`  - 실패: ${x}`));
fs.mkdirSync(path.dirname(REPORT), { recursive: true });
fs.writeFileSync(REPORT, L.join("\n") + "\n");

console.log(`기준선 ${BASE} ↔ 작업 트리 · 픽스처 ${FIXTURES.length}개`);
per.forEach((p) => console.log(`  ${p.key.padEnd(30)} 출생일자 ${String(p.day).padStart(2)} · 차이 ${p.n}`));
console.log(`\nSTOP ${stop.length}건 · 승인 범위 밖 차이 ${violations.length}건 · 전체 차이 ${diffs.length}건 (${areas.join(", ") || "-"}) → ${path.relative(ROOT, REPORT)}`);
stop.slice(0, 10).forEach((x) => console.log("  STOP:", x));
violations.slice(0, 10).forEach((x) => console.log("  실패:", x));
if (stop.length) process.exit(3);
if (violations.length) process.exit(1);
console.log("통과: 기준선과 동일");
