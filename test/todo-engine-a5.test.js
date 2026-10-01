/*
 * A5 2단계 — js/todo-engine.js 확장 메커니즘 테스트: basis · AGE_CALENDAR_WINDOW · SCHOOL_TERM_WINDOW · eligibilityCondition.requiredValues · timeline 입력.
 * 핵심: ① 기존 정의 78건(data/todos + 전국 SB)이 새 필드를 하나도 쓰지 않고 ② 기존 결과(골든 test/fixtures/todo-engine-legacy-windows.json, A5 이전 엔진으로 생성)가 한 칸도 달라지지 않는다.
 * 실행: node test/todo-engine-a5.test.js
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const Engine = require("../js/todo-engine.js");
const CT = require("../js/child-timeline.js");

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ok  - ${name}`);
  } catch (e) {
    process.exitCode = 1;
    console.log(`FAIL - ${name}\n       ${(e.stack || e).split("\n").slice(0, 4).join("\n       ")}`);
  }
}

const FILES = ["health-checkup", "vaccination", "development", "feeding", "oral", "sleep", "safety", "daily-life", "childcare"].map((f) => `../data/todos/${f}.json`).concat("../data/subsidies/national-todos.json");
const DEFS = FILES.flatMap((f) => require(f).todos);
const D = (y, m, d) => new Date(y, m - 1, d);
const ymd = (d) => (d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}` : null);
const deepFreeze = (o) => (Object.values(o).forEach((v) => v && typeof v === "object" && !(v instanceof Date) && deepFreeze(v)), Object.freeze(o));

/** 경고를 모아서 돌려준다(console.warn 을 잠시 가로챔). */
function captureWarn(fn) {
  const orig = console.warn;
  const logs = [];
  console.warn = (...a) => logs.push(a.join(" "));
  try {
    return { result: fn(), logs };
  } finally {
    console.warn = orig;
  }
}
let seq = 0;
const td = (over) => ({ todo_id: `T-${++seq}`, category: "SF", title: "시험 항목", exposureLevel: "MUST", priority: 1, catchUp: "NOT_APPLICABLE", leadDays: 0, verificationStatus: "확인됨", ...over });
const run = (defs, over) =>
  Engine.calculateTodoInstances({
    today: D(2026, 10, 1),
    child: { birthDate: D(2025, 1, 31), gender: "F" },
    region: { province: "서울특별시", district: "구로구" },
    familyDeclaredAttributes: {},
    completions: [],
    todoDefinitions: defs,
    ...over,
  });
const win = (i) => [ymd(i.windowStart), ymd(i.windowEnd)];

// ─────────────────────────────────────────────────────────────────────────────
console.log("기존 결과 불변");
const GOLDEN = require("./fixtures/todo-engine-legacy-windows.json");
// 골든은 data/todos 를 파일명 순으로 읽어 만들었다 — 정의 로드 순서와 무관하게 비교하려고 행을 (id, 회차)로 정렬한다.
const sortRows = (rows) => rows.slice().sort((a, b) => (a[0] + "|" + a[1] < b[0] + "|" + b[1] ? -1 : 1));
for (const p of Object.values(GOLDEN.windows)) for (const k of Object.keys(p)) p[k] = sortRows(p[k]);
// 골든 비교는 "골든에 있는 정의 ∩ 현재 DEFS" 로 한정한다(양쪽 같은 id 집합). 골든은 VX-RSV 포함 78건 시점에 만들어졌고, 이후 정의가 추가(예: HC-07~09)돼도 골든 대상이 아니다.
const LEGACY_IDS = new Set();
for (const p of Object.values(GOLDEN.windows)) for (const rows of Object.values(p)) for (const r of rows) LEGACY_IDS.add(r[0]);
const DEF_IDS = new Set(DEFS.map((t) => t.todo_id));
const DEFS_LEGACY = DEFS.filter((t) => LEGACY_IDS.has(t.todo_id));
const GOLDEN_CMP = {};
for (const [pn, p] of Object.entries(GOLDEN.windows)) { GOLDEN_CMP[pn] = {}; for (const [k, rows] of Object.entries(p)) GOLDEN_CMP[pn][k] = rows.filter((r) => DEF_IDS.has(r[0])); }
// 골든에는 있으나 DEFS 에 없어도 되는 id — VX-RSV 는 미커밋 보류 중이라 커밋된 data 에는 없을 수 있다. (VX-RSV 처리 결정 시 이 목록에서 제거)
const ALLOWED_MISSING_FROM_DEFS = ["VX-RSV"];
function snapshot(defs, extra) {
  const out = {};
  for (const [pn, [y, m, d]] of Object.entries(GOLDEN.meta.profiles)) {
    out[pn] = {};
    for (const [ty, tm, tdd] of GOLDEN.meta.todays) {
      const inst = Engine.calculateTodoInstances({
        today: D(ty, tm, tdd),
        child: { birthDate: D(y, m, d) },
        region: { province: "서울특별시", district: "구로구" },
        familyDeclaredAttributes: {},
        completions: [],
        todoDefinitions: defs,
        ...extra,
      });
      out[pn][`${ty}-${tm}-${tdd}`] = sortRows(inst.map((i) => [i.todo_id, i.occurrenceKey, i.status, ymd(i.windowStart), ymd(i.windowEnd), i.eligibility]));
    }
  }
  return out;
}

test("골든: 골든에 있는 기존 정의(현재 DEFS 와의 교집합) × 프로필 4종 × 기준일 3개가 A5 이전 엔진 결과와 한 칸도 다르지 않다", () => {
  // 골든 정의 중 DEFS 에 없는 것은 허용 목록(VX-RSV 미커밋 보류)뿐이어야 한다 — 다른 정의가 사라지면 실패.
  const missing = [...LEGACY_IDS].filter((id) => !DEF_IDS.has(id)).sort();
  assert.ok(missing.every((id) => ALLOWED_MISSING_FROM_DEFS.includes(id)), `골든에는 있으나 DEFS 에 없는 정의: ${missing.join(",")}`);
  // 골든에 없는 새 정의(예: HC-07~09)는 골든 비교 대상이 아니다 — DEFS_LEGACY 에 들어가지 않는다.
  const fresh = DEFS.filter((t) => !LEGACY_IDS.has(t.todo_id)).map((t) => t.todo_id);
  assert.ok(DEFS_LEGACY.every((t) => LEGACY_IDS.has(t.todo_id)) && fresh.every((id) => !DEFS_LEGACY.some((t) => t.todo_id === id)));
  assert.strictEqual(DEFS_LEGACY.length + missing.length, GOLDEN.meta.definitions);
  assert.deepStrictEqual(snapshot(DEFS_LEGACY), GOLDEN_CMP);
});

test("골든: 모든 정의에 basis:\"LEGACY_30D\" 를 명시하고 빈 timeline 을 줘도 결과가 같다(명시 기본값 = 미지정)", () => {
  const explicit = DEFS_LEGACY.map((t) => ({ ...t, basis: "LEGACY_30D" }));
  assert.deepStrictEqual(snapshot(explicit, { timeline: { school: null } }), GOLDEN_CMP);
  assert.deepStrictEqual(snapshot(DEFS_LEGACY, { timeline: CT.compute({ birthDate: D(2026, 6, 20), asOf: D(2026, 10, 1), stage: "born" }) }), GOLDEN_CMP);
});

test("정적: 기존 정의 78건은 basis·requiredValues·새 트리거를 하나도 쓰지 않는다. eligibilityCondition 은 단일 requiredValue 형식만 쓴다(새 코드 경로가 실행되지 않음)", () => {
  const triggers = (t) => [t.triggerType, ...(t.occurrences || []).map((o) => o.trigger.type), ...((t.variants || { options: [] }).options || []).flatMap((v) => v.occurrences.map((o) => o.trigger.type))];
  for (const t of DEFS) {
    assert.ok(!("basis" in t), `${t.todo_id} basis`);
    if (t.eligibilityCondition) assert.ok("requiredValue" in t.eligibilityCondition && !("requiredValues" in t.eligibilityCondition), `${t.todo_id} eligibilityCondition 은 단일 requiredValue`);
    assert.ok(!triggers(t).some((x) => x === "AGE_CALENDAR_WINDOW" || x === "SCHOOL_TERM_WINDOW"), `${t.todo_id} 새 트리거`);
  }
});

test("정적: 분수 월령 정의(HC-01·SL-02·VX-ROTA)는 basis 가 없어 LEGACY_30D 로 남는다 — CALENDAR 전환 대상이 아니다", () => {
  for (const id of ["HC-01", "SL-02", "VX-ROTA"]) assert.ok(!("basis" in DEFS.find((t) => t.todo_id === id)));
});

test("엔진 소스: DateCalc 는 주입 getter 로만 쓰고 DOM·저장소·네트워크·toISOString 을 쓰지 않는다", () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "js", "todo-engine.js"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  assert.ok(!/localStorage|firebase|document\.|window\.|toISOString/.test(src.replace(/typeof window/g, "")));
  assert.ok((src.match(/require\(/g) || []).length === 1 && /require\("\.\/date-calc\.js"\)/.test(src));
});

// ─────────────────────────────────────────────────────────────────────────────
console.log("\nbasis");
test("basis 미지정 = LEGACY_30D: 출생+n×30일 / CALENDAR: 말일 보정 달력 기준", () => {
  const legacy = td({ triggerType: "AGE_WINDOW", triggerParams: { startMonth: 1, endMonth: 2 } });
  const cal = td({ triggerType: "AGE_WINDOW", triggerParams: { startMonth: 1, endMonth: 2 }, basis: "CALENDAR" });
  const [a, b] = run([legacy, cal]); // 출생 2025-01-31
  assert.deepStrictEqual(win(a), ["2025-03-02", "2025-04-01"]); // 31+30일, 31+60일
  assert.deepStrictEqual(win(b), ["2025-02-28", "2025-03-31"]); // 1/31+1개월 = 2/28, +2개월 = 3/31
});

test("CALENDAR: 윤일생·연말·긴 개월(36·72)·endMonth null", () => {
  const mk = (s, e) => td({ triggerType: "AGE_WINDOW", triggerParams: { startMonth: s, endMonth: e }, basis: "CALENDAR" });
  const leap = run([mk(12, 24)], { child: { birthDate: D(2024, 2, 29) } })[0]; // 2/29생: 평년 2/28
  assert.deepStrictEqual(win(leap), ["2025-02-28", "2026-02-28"]);
  const far = run([mk(36, 72)], { child: { birthDate: D(2020, 1, 31) } })[0];
  assert.deepStrictEqual(win(far), ["2023-01-31", "2026-01-31"]);
  const open = run([mk(6, null)], { child: { birthDate: D(2025, 8, 31) } })[0];
  assert.deepStrictEqual(win(open), ["2026-02-28", null]);
  // 같은 정의의 legacy 는 36개월 = 1080일로 달라진다(전환 시 차이표가 필요한 이유)
  const legacy36 = run([td({ triggerType: "AGE_WINDOW", triggerParams: { startMonth: 36, endMonth: 72 } })], { child: { birthDate: D(2020, 1, 31) } })[0];
  assert.notDeepStrictEqual(win(legacy36), win(far));
});

test("basis 는 AGE_WINDOW 월 값에만 적용: DATE_FROM_BIRTH(일수)는 basis 가 CALENDAR 여도 같다", () => {
  const p = { offsetDays: 45, deadlineDays: 30 };
  const [a, b] = run([td({ triggerType: "DATE_FROM_BIRTH", triggerParams: p }), td({ triggerType: "DATE_FROM_BIRTH", triggerParams: p, basis: "CALENDAR" })]);
  assert.deepStrictEqual(win(a), win(b));
});

test("정의 오류: CALENDAR + 분수 월(0.47)·음수·문자열, 알 수 없는 basis 값 → 그 항목만 건너뛰고 경고(다른 항목은 정상)", () => {
  const ok = td({ triggerType: "AGE_WINDOW", triggerParams: { startMonth: 1, endMonth: 2 } });
  const bad = [
    td({ triggerType: "AGE_WINDOW", triggerParams: { startMonth: 0.47, endMonth: 1.17 }, basis: "CALENDAR" }),
    td({ triggerType: "AGE_WINDOW", triggerParams: { startMonth: -1, endMonth: 2 }, basis: "CALENDAR" }),
    td({ triggerType: "AGE_WINDOW", triggerParams: { startMonth: "3", endMonth: 4 }, basis: "CALENDAR" }),
    td({ triggerType: "AGE_WINDOW", triggerParams: { startMonth: 1, endMonth: 2 }, basis: "calendar" }),
    td({ triggerType: "AGE_WINDOW", triggerParams: { startMonth: 1, endMonth: 2 }, basis: null }),
  ];
  const { result, logs } = captureWarn(() => run([...bad, ok]));
  assert.deepStrictEqual(result.map((i) => i.todo_id), [ok.todo_id]);
  assert.strictEqual(logs.length, bad.length);
  assert.ok(logs.every((l) => l.includes("정의 오류로 건너뜀")));
  assert.deepStrictEqual(win(result[0]), win(run([ok])[0]), "정상 항목 결과는 영향받지 않는다");
});

test("같은 정의 오류 경고는 한 번만(반복 호출해도 로그가 쌓이지 않음)", () => {
  const bad = td({ triggerType: "AGE_WINDOW", triggerParams: { startMonth: 0.5, endMonth: 2 }, basis: "CALENDAR" });
  const { logs } = captureWarn(() => { run([bad]); run([bad]); run([bad]); });
  assert.strictEqual(logs.length, 1);
});

test("정의 오류가 아닌 기존 오류는 그대로 던진다: 알 수 없는 trigger.type", () => {
  assert.throws(() => run([td({ triggerType: "NO_SUCH_TRIGGER", triggerParams: {} })]), /알 수 없는 trigger.type/);
});

// ─────────────────────────────────────────────────────────────────────────────
console.log("\nAGE_CALENDAR_WINDOW");
const acw = (start, end, over) => td({ triggerType: "AGE_CALENDAR_WINDOW", triggerParams: { start, end }, ...over });
test("{years, months} → 총 월수 달력 계산. 만 3세 생일(36개월), 만 2세 6개월, end null", () => {
  const [a, b, c] = run([acw({ years: 3, months: 0 }, { years: 4, months: 0 }), acw({ years: 2, months: 6 }, { years: 3, months: 0 }), acw({ years: 1, months: 0 }, null)], { child: { birthDate: D(2024, 2, 29) } });
  assert.deepStrictEqual(win(a), ["2027-02-28", "2028-02-29"]); // 평년 2/28, 윤년 2/29 로 복귀
  assert.deepStrictEqual(win(b), ["2026-08-29", "2027-02-28"]);
  assert.deepStrictEqual(win(c), ["2025-02-28", null]);
});

test("정수 월에서는 AGE_WINDOW + CALENDAR 와 같은 결과(출생 800일 × 월 0~160 스윕) — 새 계산 경로가 아니다", () => {
  let n = 0;
  for (let k = 0; k < 800; k += 7) {
    const birth = new Date(2018, 0, 1 + k);
    for (const [s, e] of [[0, 1], [1, 12], [6, 18], [12, 36], [25, 60], [36, 84], [96, 155], [143, 160]]) {
      const x = run([acw({ years: Math.floor(s / 12), months: s % 12 }, { years: Math.floor(e / 12), months: e % 12 }), td({ triggerType: "AGE_WINDOW", triggerParams: { startMonth: s, endMonth: e }, basis: "CALENDAR" })], { child: { birthDate: birth } });
      assert.deepStrictEqual([win(x[0]), x[0].status], [win(x[1]), x[1].status], `${ymd(birth)} ${s}~${e}`);
      n++;
    }
  }
  assert.ok(n > 800);
});

test("basis 와 무관하게 항상 달력 기반이고, leadDays·catchUp·상태 계산을 그대로 쓴다", () => {
  const t = (basis, over) => acw({ years: 0, months: 8 }, { years: 0, months: 9 }, { basis, ...over });
  const a = run([t("LEGACY_30D")], { child: { birthDate: D(2026, 1, 31) } })[0]; // 8개월 = 2026-09-30, 9개월 = 2026-10-31
  assert.deepStrictEqual(win(a), ["2026-09-30", "2026-10-31"]);
  assert.strictEqual(a.status, "DUE");
  const early = { child: { birthDate: D(2026, 3, 1) }, today: D(2026, 10, 25) }; // 창 시작 2026-11-01 이전
  assert.strictEqual(run([t(undefined)], early)[0].status, "SCHEDULED");
  assert.strictEqual(run([t(undefined, { leadDays: 30 })], early)[0].status, "UPCOMING"); // leadDays 적용
  assert.strictEqual(run([t(undefined, { catchUp: "NOT_ALLOWED" })], { child: { birthDate: D(2025, 1, 1) }, today: D(2026, 10, 1) })[0].status, "OVERDUE_FINAL");
});

test("정의 오류: start/end 가 {years, months} 정수쌍이 아니면 그 항목만 건너뛰고 경고", () => {
  const ok = td({ triggerType: "AGE_WINDOW", triggerParams: { startMonth: 1, endMonth: 2 } });
  const bad = [acw(null, null), acw({ years: 1 }, null), acw({ years: -1, months: 0 }, null), acw({ years: 1, months: 2.5 }, null), acw({ years: 1, months: 0 }, { years: "2", months: 0 })];
  const { result, logs } = captureWarn(() => run([...bad, ok]));
  assert.deepStrictEqual(result.map((i) => i.todo_id), [ok.todo_id]);
  assert.strictEqual(logs.length, bad.length);
});

// ─────────────────────────────────────────────────────────────────────────────
console.log("\nSCHOOL_TERM_WINDOW");
const TIMELINE = { school: { enrollmentYear: 2027 } };
const stw = (over, params) => td({ triggerType: "SCHOOL_TERM_WINDOW", triggerParams: { anchor: "ENROLLMENT", yearOffset: -1, startMonth: 9, endMonth: 12, ...params }, ...over });
test("입학 학년도 + yearOffset 의 시작월 1일 ~ 끝월 말일(예: 입학 직전 해 9~12월)", () => {
  const i = run([stw()], { timeline: TIMELINE })[0];
  assert.deepStrictEqual(win(i), ["2026-09-01", "2026-12-31"]);
  assert.strictEqual(i.status, "DUE"); // 기준일 2026-10-01 은 창 안
  assert.strictEqual(run([stw()], { timeline: TIMELINE, today: D(2026, 8, 20) })[0].status, "SCHEDULED");
  assert.strictEqual(run([stw({ leadDays: 30 })], { timeline: TIMELINE, today: D(2026, 8, 20) })[0].status, "UPCOMING");
  assert.strictEqual(run([stw({ catchUp: "NOT_ALLOWED" })], { timeline: TIMELINE, today: D(2027, 1, 5) })[0].status, "OVERDUE_FINAL");
});

test("끝월이 시작월보다 앞서면 다음 해로 넘어가고(11~2월), 말일·윤일(2/29)·yearOffset 0/+1 을 정확히 계산한다", () => {
  assert.deepStrictEqual(win(run([stw({}, { startMonth: 11, endMonth: 2 })], { timeline: TIMELINE })[0]), ["2026-11-01", "2027-02-28"]);
  assert.deepStrictEqual(win(run([stw({}, { yearOffset: 0, startMonth: 2, endMonth: 2 })], { timeline: { school: { enrollmentYear: 2028 } } })[0]), ["2028-02-01", "2028-02-29"]);
  assert.deepStrictEqual(win(run([stw({}, { yearOffset: 1, startMonth: 3, endMonth: 3 })], { timeline: TIMELINE })[0]), ["2028-03-01", "2028-03-31"]);
});

test("timeline 이 없거나 school 이 null(정책 없음·확인필요)이면 날짜를 만들지 않고 status:null + eligibility:UNKNOWN — schedule.js 가 이미 화면에서 제외하는 형태", () => {
  for (const timeline of [undefined, null, {}, { school: null }, { school: {} }, { school: { enrollmentYear: "2027" } }, { school: { enrollmentYear: 2027.5 } }]) {
    const i = run([stw()], timeline === undefined ? {} : { timeline })[0];
    assert.deepStrictEqual([i.status, i.windowStart, i.windowEnd, i.eligibility], [null, null, null, "UNKNOWN"]);
  }
});

test("ChildTimeline.compute(정책 주입)와 이어서 쓴다: 2020-05-10생(입학 2027)은 예비초등 시기에 창이 열린다 — 정책 값은 테스트 전용 가정", () => {
  const policy = {
    enrollmentOffsetYears: { value: 7, verificationStatus: "확인됨", source: "테스트 전용" },
    schoolYearStartMonth: { value: 3, verificationStatus: "확인됨", source: "테스트 전용" },
    preElementaryYearsBefore: { value: 1, kind: "PRODUCT_DEFINITION", verificationStatus: "제품정의", source: "테스트 전용" },
  };
  const birth = D(2020, 5, 10);
  const timeline = CT.compute({ birthDate: birth, asOf: D(2026, 10, 15), stage: "born", policy });
  const i = run([stw()], { child: { birthDate: birth }, timeline, today: D(2026, 10, 15) })[0];
  assert.deepStrictEqual([win(i), i.status], [["2026-09-01", "2026-12-31"], "DUE"]);
  // 정책이 확인필요면 school 이 null → 항목은 UNKNOWN 으로 숨는다
  const unverified = CT.compute({ birthDate: birth, asOf: D(2026, 10, 15), stage: "born", policy: { ...policy, enrollmentOffsetYears: { value: 7, verificationStatus: "확인필요" } } });
  assert.strictEqual(run([stw()], { child: { birthDate: birth }, timeline: unverified })[0].status, null);
});

test("occurrences 안의 SCHOOL_TERM_WINDOW 도 같은 방식(정보 없음 → UNKNOWN, 있으면 창 계산)", () => {
  const series = td({ triggerType: "AGE_WINDOW", triggerParams: {}, occurrences: [{ occurrenceKey: "pre", trigger: { type: "SCHOOL_TERM_WINDOW", anchor: "ENROLLMENT", yearOffset: -1, startMonth: 1, endMonth: 2 } }] });
  assert.strictEqual(run([series])[0].status, null);
  assert.deepStrictEqual(win(run([series], { timeline: TIMELINE })[0]), ["2026-01-01", "2026-02-28"]);
});

test("정의 오류: anchor·yearOffset·월 범위가 올바르지 않으면 그 항목만 건너뛰고 경고(timeline 이 있을 때)", () => {
  const ok = td({ triggerType: "AGE_WINDOW", triggerParams: { startMonth: 1, endMonth: 2 } });
  const bad = [stw({}, { anchor: "BIRTH" }), stw({}, { yearOffset: 0.5 }), stw({}, { startMonth: 0 }), stw({}, { endMonth: 13 }), stw({}, { startMonth: "9" })];
  const { result, logs } = captureWarn(() => run([...bad, ok], { timeline: TIMELINE }));
  assert.deepStrictEqual(result.map((i) => i.todo_id), [ok.todo_id]);
  assert.strictEqual(logs.length, bad.length);
});

// ─────────────────────────────────────────────────────────────────────────────
console.log("\nrequiredValues");
const elig = (cond, over) => td({ triggerType: "AGE_WINDOW", triggerParams: { startMonth: 0, endMonth: 12 }, eligibilityCondition: cond, ...over });
test("requiredValues: 목록에 있으면 통과, 없으면 목록에서 제외(FAIL), 미선언이면 UNKNOWN(status null)", () => {
  const t = elig({ attribute: "care", requiredValues: ["DAYCARE", "KINDERGARTEN"] });
  assert.deepStrictEqual(run([t], { familyDeclaredAttributes: { care: "DAYCARE" } }).map((i) => [i.eligibility, i.status]), [["PASS", "DUE"]]);
  assert.strictEqual(run([t], { familyDeclaredAttributes: { care: "KINDERGARTEN" } })[0].eligibility, "PASS");
  assert.deepStrictEqual(run([t], { familyDeclaredAttributes: { care: "HOME" } }), []);
  const u = run([t], { familyDeclaredAttributes: {} })[0];
  assert.deepStrictEqual([u.eligibility, u.status, u.windowStart], ["UNKNOWN", null, null]);
});

test("단일 requiredValue 는 기존과 똑같이 동작(통과·제외·UNKNOWN)", () => {
  const t = elig({ attribute: "care", requiredValue: "DAYCARE" });
  assert.strictEqual(run([t], { familyDeclaredAttributes: { care: "DAYCARE" } })[0].eligibility, "PASS");
  assert.deepStrictEqual(run([t], { familyDeclaredAttributes: { care: "KINDERGARTEN" } }), []);
  assert.strictEqual(run([t], {})[0].eligibility, "UNKNOWN");
});

test("기존 정의 5건(SB-05~09)의 단일 requiredValue: 선언값이 같으면 통과·다르면 제외·없으면 UNKNOWN — 이전 엔진의 판정과 같다", () => {
  const sb = DEFS.filter((t) => t.eligibilityCondition);
  assert.deepStrictEqual(sb.map((t) => t.todo_id), ["SB-05", "SB-06", "SB-07", "SB-08", "SB-09"]);
  for (const t of sb) {
    const { attribute, requiredValue } = t.eligibilityCondition;
    const at = (v) => run([t], { child: { birthDate: D(2026, 6, 20) }, familyDeclaredAttributes: v === undefined ? {} : { [attribute]: v }, region: { province: "서울특별시", district: "구로구" } });
    assert.ok(at(requiredValue).every((i) => i.eligibility === "PASS"), `${t.todo_id} 통과`);
    assert.deepStrictEqual(at(typeof requiredValue === "boolean" ? !requiredValue : "다른 값"), [], `${t.todo_id} 제외`);
    assert.ok(at(undefined).every((i) => i.eligibility === "UNKNOWN" && i.status === null), `${t.todo_id} UNKNOWN`);
  }
});

test("정의 오류: requiredValue 와 requiredValues 동시 지정, 빈 배열, 배열이 아닌 값 → 그 항목만 건너뛰고 경고", () => {
  const ok = elig({ attribute: "care", requiredValue: "HOME" }, { todo_id: "OK-1" });
  const bad = [elig({ attribute: "care", requiredValue: "A", requiredValues: ["A"] }), elig({ attribute: "care", requiredValues: [] }), elig({ attribute: "care", requiredValues: "A" })];
  const { result, logs } = captureWarn(() => run([...bad, ok], { familyDeclaredAttributes: { care: "HOME" } }));
  assert.deepStrictEqual(result.map((i) => i.todo_id), ["OK-1"]);
  assert.strictEqual(logs.length, bad.length);
});

// ─────────────────────────────────────────────────────────────────────────────
console.log("\ntimeline 입력 · 순수성");
test("timeline 입력은 선택: 없을 때와 있을 때 모두 LEGACY 항목 결과가 같다 / 입력 객체(정의·timeline·completions)를 변경하지 않는다", () => {
  const defs = deepFreeze([
    td({ triggerType: "AGE_WINDOW", triggerParams: { startMonth: 2, endMonth: 4 } }),
    acw({ years: 0, months: 3 }, { years: 0, months: 5 }),
    stw(),
    elig({ attribute: "care", requiredValues: ["A", "B"] }),
  ]);
  const timeline = deepFreeze({ school: { enrollmentYear: 2027 }, age: { totalMonths: 20 } });
  const completions = deepFreeze([]);
  const a = run(defs, { timeline, completions, familyDeclaredAttributes: Object.freeze({ care: "A" }) });
  const b = run(defs, { completions, familyDeclaredAttributes: Object.freeze({ care: "A" }) });
  assert.deepStrictEqual(a.filter((i) => i.todo_id === defs[0].todo_id), b.filter((i) => i.todo_id === defs[0].todo_id));
  assert.strictEqual(a.find((i) => i.todo_id === defs[2].todo_id).status !== null, true);
  assert.strictEqual(b.find((i) => i.todo_id === defs[2].todo_id).status, null);
});

test("건너뛴(정의 오류) 항목이 있어도 나머지 78건 결과는 골든과 같다", () => {
  const bad = td({ triggerType: "AGE_WINDOW", triggerParams: { startMonth: 0.5, endMonth: 1 }, basis: "CALENDAR" });
  const { result } = captureWarn(() => snapshot([...DEFS_LEGACY, bad]));
  assert.deepStrictEqual(result, GOLDEN_CMP);
});

console.log(`\n${passed}개 통과${process.exitCode ? ", 일부 실패" : ""}`);
