/*
 * UX 개편 순수 로직(js/hn-logic.js) + 일정 3유형 분류(js/schedule.js) 테스트. 실제 데이터 파일을 그대로 쓴다.
 * 실행: node test/hn-logic.test.js
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const ROOT = path.join(__dirname, "..");
const rd = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), "utf8"));

global.TodoEngine = require("../js/todo-engine.js");
global.DateCalc = require("../js/date-calc.js"); // schedule.js의 addMonths가 쓴다(브라우저에서는 index.html이 먼저 로드)
vm.runInThisContext(fs.readFileSync(path.join(ROOT, "js/schedule.js"), "utf8") + "\n;globalThis.__buildSchedule = buildSchedule; globalThis.__ageInMonths = ageInMonths;");
const L = require("../js/hn-logic.js");

const FILES = ["health-checkup", "vaccination", "development", "feeding", "oral", "sleep", "safety", "daily-life", "childcare"].map((f) => `data/todos/${f}.json`).concat("data/subsidies/national-todos.json");
const todoDefinitions = FILES.flatMap((f) => rd(f).todos);
const subsidies = ["data/subsidies/national.json", "data/subsidies/seoul/city.json", "data/subsidies/seoul/districts/구로구.json"]
  .filter((p) => fs.existsSync(path.join(ROOT, p)))
  .flatMap((p) => rd(p).subsidies);

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log("  ok  - " + name); } catch (e) { process.exitCode = 1; console.log("  FAIL- " + name + "\n      " + (e.stack || e).split("\n").slice(0, 3).join("\n      ")); }
}

const birth = new Date("2026-06-20T00:00:00");
function build(completed, stage) {
  const profile = { birthDate: birth, province: "서울특별시", district: "구로구", gender: null, birthOrder: "first", stage: stage || "born" };
  return __buildSchedule(profile, { todoDefinitions, subsidy: { subsidies } }, completed || []);
}
const events = build();
const today = new Date("2026-09-29T10:00:00");
const ctx = { today, ageNow: __ageInMonths(birth, today), pregnant: false };

test("모든 일정이 3유형 중 하나로 분류된다", () => {
  assert.ok(events.length > 50);
  for (const e of events) assert.ok(["fixed", "window", "monthly"].includes(e.scheduleKind), e.id);
});

test("fixed는 지원금뿐이고, 지원금은 전부 fixed(신청 시작일)다", () => {
  for (const e of events) assert.strictEqual(e.scheduleKind === "fixed", e.category === "행정·지원금", e.id);
  for (const e of events.filter((x) => x.scheduleKind === "fixed")) assert.ok(e.fixedDate, e.id);
});

test("window는 windowStart가 있고 폭 60일 이하, monthly는 달력 칸(dayRange)이 없다", () => {
  for (const e of events.filter((x) => x.scheduleKind === "window")) {
    assert.ok(e.windowStart, e.id);
    assert.ok(!e.windowEnd || (e.windowEnd - e.windowStart) / L.DAY <= 60, e.id);
  }
  for (const e of events.filter((x) => x.scheduleKind === "monthly")) assert.strictEqual(L.dayRange(e), null, e.id);
});

test("지원금은 신청 시작일 하루에만 찍히고, 신청 기간(시작~끝)을 계산해 준다", () => {
  const f = events.find((e) => e.scheduleKind === "fixed" && e.isLegacySubsidy);
  assert.ok(f, "지역 지원금 샘플 없음");
  assert.ok(L.coversDay(f, f.fixedDate));
  assert.ok(!L.coversDay(f, new Date(f.fixedDate.getTime() + L.DAY)));
  const per = L.subsidyPeriod(f);
  assert.ok(per.start && per.start.getTime() === f.entryDate.getTime());
  const eng = events.find((e) => e.scheduleKind === "fixed" && e.isEngineEvent);
  assert.ok(eng && L.subsidyPeriod(eng).start, "전국 공통(엔진) 지원금 신청 시작일 없음");
});

const monthKeysOf = (e) => (e.detail && e.detail.definition && typeof e.detail.definition.displayMonth === "number" ? [e.detail.definition.displayMonth] : []);
const cal = events.filter((e) => __ageInMonths(birth, e.date) <= 36);
const days = L.assignDisplayDays(cal, { birthDate: birth, monthKeysOf });
const sod = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

test("추천일: window는 자기 권장 기간 안에만 놓인다", () => {
  let n = 0;
  for (const e of cal.filter((x) => x.scheduleKind === "window")) {
    const ds = days.get(e.id);
    assert.ok(ds && ds.length === 1, e.id);
    assert.ok(ds[0] >= sod(e.windowStart) && ds[0] <= sod(e.windowEnd || e.windowStart), e.id + " 기간 밖");
    n++;
  }
  assert.ok(n > 10);
});

test("추천일: monthly는 자기 대표 월령 한 달 안에만 놓인다", () => {
  let n = 0;
  for (const e of cal.filter((x) => x.scheduleKind === "monthly")) {
    for (const k of monthKeysOf(e)) {
      const s0 = sod(new Date(new Date(birth).setMonth(birth.getMonth() + k)));
      const e0 = new Date(new Date(birth).setMonth(birth.getMonth() + k + 1));
      const ds = (days.get(e.id) || []).filter((d) => d >= s0 && d < e0);
      assert.strictEqual(ds.length, 1, e.id + " k=" + k);
      n++;
    }
  }
  assert.ok(n > 10);
});

test("추천일: 지원금은 배치하지 않는다", () => {
  for (const e of cal.filter((x) => x.category === "행정·지원금")) assert.ok(!days.has(e.id), e.id);
});

test("추천일: 같은 시기 접종(권장 기간이 같은 것)은 같은 날로 묶인다", () => {
  const vx = cal.filter((e) => e.category === "예방접종" && e.scheduleKind === "window");
  const byWin = new Map();
  for (const e of vx) {
    const k = e.windowStart.getTime() + "|" + (e.windowEnd ? e.windowEnd.getTime() : "");
    if (!byWin.has(k)) byWin.set(k, []);
    byWin.get(k).push(e);
  }
  const multi = [...byWin.values()].filter((g) => g.length > 1);
  assert.ok(multi.length > 0, "같은 시기 접종 묶음 샘플 없음");
  for (const g of multi) assert.strictEqual(new Set(g.map((e) => days.get(e.id)[0].getTime())).size, 1);
});

test("추천일: 접종·검진은 (기간이 하루가 아니면) 평일에 놓인다", () => {
  for (const e of cal.filter((x) => (x.category === "예방접종" || x.category === "영유아검진") && x.scheduleKind === "window" && x.windowEnd && x.windowEnd - x.windowStart > 6 * L.DAY)) {
    const d = days.get(e.id)[0];
    assert.ok(d.getDay() !== 0 && d.getDay() !== 6, e.id + " " + d);
  }
});

test("추천일: 하루에 몰리지 않는다(접종 묶음 제외 한 날 최대 3개)", () => {
  const per = new Map();
  for (const e of cal.filter((x) => x.category !== "예방접종" && x.category !== "행정·지원금")) for (const d of days.get(e.id) || []) per.set(d.getTime(), (per.get(d.getTime()) || 0) + 1);
  const max = Math.max(...per.values());
  assert.ok(max <= 3, "최대 " + max);
});

test("추천일: 항상 같은 결과(결정적)이고 완료 처리해도 위치가 바뀌지 않는다", () => {
  const again = L.assignDisplayDays(cal, { birthDate: birth, monthKeysOf });
  for (const [id, ds] of days) assert.deepStrictEqual(again.get(id).map(Number), ds.map(Number));
  const evDone = build(cal.slice(0, 3).map((e) => ({ todo_id: e.id.split("__")[0], occurrenceKey: e.id.split("__")[1] || "default", recordType: "TODO_COMPLETED", recordedAt: new Date() })));
  const cal2 = evDone.filter((e) => __ageInMonths(birth, e.date) <= 36);
  const d2 = L.assignDisplayDays(cal2, { birthDate: birth, monthKeysOf });
  assert.ok([...days.keys()].filter((id) => d2.has(id)).length > 20);
});

test("달력 진행률: 완료 처리한 항목 수만큼만 오른다", () => {
  let y = 2026, m = 9;
  const p0 = L.calendarMonthProgress(cal, days, {}, y, m);
  assert.ok(p0.total > 0);
  const item = L.plannedInMonth(cal, days, y, m)[0];
  const p1 = L.calendarMonthProgress(cal, days, { [item.id]: { done: true } }, y, m);
  assert.strictEqual(p0.done, 0);
  assert.strictEqual(p1.done, 1);
  assert.strictEqual(p0.total, p1.total);
});

test("오늘의 할 일: 지원금 제외·미완료만·DUE/OVERDUE_CATCHUP만", () => {
  const t0 = L.todayItems(events, {});
  for (const e of t0) {
    assert.notStrictEqual(e.category, "행정·지원금");
    assert.ok(["DUE", "OVERDUE_CATCHUP"].includes(e.engineStatus));
  }
  if (t0.length) {
    const t1 = L.todayItems(events, { [t0[0].id]: { done: true } });
    assert.strictEqual(t1.length, t0.length - 1);
  }
});

test("지원금 분류: 모든 지원금이 정확히 한 상태에 들어가고, 완료하면 applied로 이동", () => {
  const b = L.subsidyBuckets(events, {}, ctx, 30);
  const total = events.filter((e) => e.category === "행정·지원금").length;
  assert.strictEqual(b.available.length + b.upcoming.length + b.expired.length + b.applied.length, total);
  assert.strictEqual(b.applied.length, 0);
  assert.ok(b.available.length > 0, "신청 가능 지원금 없음");
  const id = b.available[0].id;
  const b2 = L.subsidyBuckets(events, { [id]: { done: true } }, ctx, 30);
  assert.strictEqual(b2.applied.length, 1);
  assert.strictEqual(b2.available.length, b.available.length - 1);
});

test("마감 임박은 신청 가능 상태의 부분집합이고 마감일 순", () => {
  const b = L.subsidyBuckets(events, {}, ctx, 60);
  for (const e of b.urgent) assert.ok(b.available.includes(e));
  const days = b.urgent.map((e) => L.daysLeft(e, today));
  assert.deepStrictEqual(days, [...days].sort((a, z) => a - z));
});

test("마감 당일 오후에도 아직 신청 가능(경계값)", () => {
  const e = { id: "X", isLegacySubsidy: true, category: "행정·지원금", minAgeMonths: 0, maxAgeMonths: 99, deadlineDate: new Date("2026-09-29T00:00:00") };
  assert.strictEqual(L.subsidyStatus(e, {}, { today: new Date("2026-09-29T18:00:00"), ageNow: 3 }), "available");
  assert.strictEqual(L.subsidyStatus(e, {}, { today: new Date("2026-09-30T00:00:01"), ageNow: 3 }), "expired");
});

test("자동 기록: 기존 완료 내역이 마이그레이션 없이 그대로 기록이 된다", () => {
  const vx = events.find((e) => e.category === "예방접종" && e.isEngineEvent);
  const done = { [vx.id]: { done: true, todo_id: vx.detail.instance.todo_id, occurrenceKey: "default", recordType: "TODO_COMPLETED", recordedAt: "2026-09-01T03:00:00.000Z", memo: "왼쪽 다리" } };
  const { records, orphanCount } = L.deriveAutoRecords(events, done, birth);
  assert.strictEqual(records.length, 1);
  assert.strictEqual(records[0].category, "건강");
  assert.strictEqual(records[0].memo, "왼쪽 다리");
  assert.strictEqual(records[0].ageMonths, 2);
  assert.strictEqual(orphanCount, 0);
});

test("옛 형식 완료 키(일정에 없음)는 기록을 지어내지 않고 orphan으로만 센다", () => {
  const { records, orphanCount } = L.deriveAutoRecords(events, { "OLD-ID": true }, birth);
  assert.strictEqual(records.length, 0);
  assert.strictEqual(orphanCount, 1);
});

test("직접 기록: 삭제 표시는 목록에서 빠지고, 월령은 날짜로 계산", () => {
  const map = {
    a: { category: "활동", title: "첫 물놀이", date: "2026-09-10", memo: "좋아함", updatedAt: 1 },
    b: { category: "활동", title: "삭제됨", date: "2026-09-11", updatedAt: 2, deletedAt: 2 },
  };
  const list = L.manualRecordList(map, birth);
  assert.strictEqual(list.length, 1);
  assert.strictEqual(list[0].ageMonths, 2);
});

test("기록 필터·시간순 정렬", () => {
  const manual = L.manualRecordList({ a: { category: "활동", title: "A", date: "2026-09-10", updatedAt: 1 }, b: { category: "건강", title: "B", date: "2026-09-20", updatedAt: 1 } }, birth);
  const all = L.mergeRecords([], manual, "전체");
  assert.deepStrictEqual(all.map((r) => r.title), ["B", "A"]);
  assert.deepStrictEqual(L.mergeRecords([], manual, "활동").map((r) => r.title), ["A"]);
});

test("다음 일정: 같은 Todo의 다음 회차만 연결, 없으면 null", () => {
  const multi = events.filter((e) => e.isEngineEvent && e.detail.instance.todo_id === "VX-HEPB");
  if (multi.length > 1) {
    const sorted = multi.slice().sort((a, b) => (a.windowStart || a.date) - (b.windowStart || b.date));
    const nx = L.nextRelatedEvent(events, sorted[0].id, {});
    assert.ok(nx && nx.detail.instance.todo_id === "VX-HEPB" && nx.id !== sorted[0].id);
    assert.strictEqual(L.nextRelatedEvent(events, sorted[sorted.length - 1].id, {}), null);
  }
  assert.strictEqual(L.nextRelatedEvent(events, "없는-id", {}), null);
});

test("records 병합: 더 새로운 updatedAt이 이기고 삭제가 부활하지 않는다", () => {
  const local = { a: { title: "로컬", updatedAt: 5 }, b: { title: "로컬만", updatedAt: 1 } };
  const remote = { a: { title: "서버", updatedAt: 9 }, c: { title: "서버만", updatedAt: 1 }, b: { title: "삭제", updatedAt: 7, deletedAt: 7 } };
  const m = L.mergeRecordMaps(local, remote);
  assert.strictEqual(m.a.title, "서버");
  assert.strictEqual(m.b.deletedAt, 7);
  assert.strictEqual(m.c.title, "서버만");
  const back = L.mergeRecordMaps(remote, local);
  assert.strictEqual(back.a.title, "서버");
  assert.strictEqual(back.b.deletedAt, 7);
});

test("임신 중 프로필도 3유형 분류·지원금 분류가 깨지지 않는다", () => {
  const due = new Date("2026-12-15T00:00:00");
  const profile = { birthDate: due, province: "서울특별시", district: "구로구", birthOrder: "first", stage: "pregnant" };
  const ev = __buildSchedule(profile, { todoDefinitions, subsidy: { subsidies } }, []);
  for (const e of ev) assert.ok(["fixed", "window", "monthly"].includes(e.scheduleKind), e.id);
  const b = L.subsidyBuckets(ev, {}, { today, ageNow: 0, pregnant: true }, 30);
  assert.ok(b.available.length + b.upcoming.length + b.expired.length >= 0);
});

// ── 홈 분류(이번 달 / 다가오는 일정 / 지난 일정) ─────────────────────────
const NOW = new Date();
const monthStartNow = new Date(NOW.getFullYear(), NOW.getMonth(), 1);
const monthEndNow = new Date(NOW.getFullYear(), NOW.getMonth() + 1, 0);
function homeFor(ageMonths, completedMap, stage) {
  const b = new Date(NOW.getFullYear(), NOW.getMonth() - ageMonths, Math.min(NOW.getDate(), 28));
  const profile = { birthDate: b, province: "서울특별시", district: "구로구", birthOrder: "first", stage: stage || "born" };
  const ev = __buildSchedule(profile, { todoDefinitions, subsidy: { subsidies } }, []).filter((e) => __ageInMonths(b, e.date) <= 36);
  const keys = (e) => (e.detail && e.detail.definition && typeof e.detail.definition.displayMonth === "number" ? [e.detail.definition.displayMonth] : []);
  return { ev, res: L.classifyHomeItems(ev, completedMap || {}, { today: NOW, birthDate: b, monthKeysOf: keys }), b };
}

for (const age of [1, 6, 12, 24]) {
  test(`홈 분류(${age}개월 신규 가입): 세 영역이 겹치지 않고 기준대로 나뉜다`, () => {
    const { res } = homeFor(age);
    const ids = [...res.thisMonth, ...res.upcoming, ...res.past].map((x) => x.e.id);
    assert.strictEqual(new Set(ids).size, ids.length, "영역 간 중복");
    for (const x of res.thisMonth) assert.ok(x.start <= monthEndNow && x.end >= monthStartNow, x.e.id + " 이번 달 아님");
    for (const x of res.upcoming) assert.ok(x.start > monthEndNow && !x.done, x.e.id + " 미래 아님");
    for (const x of res.past) assert.ok(x.end < monthStartNow && !x.done, x.e.id + " 과거 아님");
    for (const x of [...res.thisMonth, ...res.upcoming, ...res.past]) assert.notStrictEqual(x.e.category, "행정·지원금");
    assert.ok(res.thisMonth.length + res.upcoming.length + res.past.length > 0);
  });
}

test("홈 분류: 월령이 클수록 지난 일정이 늘고, 정렬은 최근 종료 순 / 가까운 시작 순", () => {
  const a1 = homeFor(1).res.past.length;
  const a12 = homeFor(12).res.past.length;
  const a24 = homeFor(24).res;
  assert.ok(a12 > a1, `12개월(${a12}) > 1개월(${a1})`);
  assert.ok(a24.past.length > 3, "과거 미완료가 많은 사용자(홈은 3개만 노출)");
  const ends = a24.past.map((x) => x.end.getTime());
  assert.deepStrictEqual(ends, [...ends].sort((a, b) => b - a));
  const up = homeFor(6).res.upcoming.map((x) => x.start.getTime());
  assert.deepStrictEqual(up, [...up].sort((a, b) => a - b));
});

test("홈 분류: 이번 달 항목을 전부 완료해도 이번 달에 남고(완료 표시), 다른 영역은 그대로", () => {
  const base = homeFor(12);
  const done = {};
  for (const x of base.res.thisMonth) done[x.e.id] = { done: true, recordedAt: new Date().toISOString() };
  const after = L.classifyHomeItems(base.ev, done, { today: NOW, birthDate: base.b, monthKeysOf: (e) => (e.detail && e.detail.definition && typeof e.detail.definition.displayMonth === "number" ? [e.detail.definition.displayMonth] : []) });
  assert.strictEqual(after.thisMonth.length, base.res.thisMonth.length);
  assert.ok(after.thisMonth.every((x) => x.done));
  assert.strictEqual(after.past.length, base.res.past.length);
  assert.strictEqual(after.upcoming.length, base.res.upcoming.length);
});

test("홈 분류: 지난 일정을 완료하면 지난 일정에서만 빠지고 일정 데이터는 그대로", () => {
  const base = homeFor(12);
  assert.ok(base.res.past.length > 0);
  const id = base.res.past[0].e.id;
  const after = L.classifyHomeItems(base.ev, { [id]: { done: true } }, { today: NOW, birthDate: base.b, monthKeysOf: (e) => (e.detail && e.detail.definition && typeof e.detail.definition.displayMonth === "number" ? [e.detail.definition.displayMonth] : []) });
  assert.strictEqual(after.past.length, base.res.past.length - 1);
  assert.ok(base.ev.some((e) => e.id === id), "일정 자체는 삭제되지 않음");
});

test("홈 분류: 임신 중 — 지난 일정이 없고 출산 후 항목은 다가오는 일정으로 간다", () => {
  const due = new Date(NOW.getFullYear(), NOW.getMonth() + 3, 15);
  const profile = { birthDate: due, province: "서울특별시", district: "구로구", birthOrder: "first", stage: "pregnant" };
  const ev = __buildSchedule(profile, { todoDefinitions, subsidy: { subsidies } }, []);
  const res = L.classifyHomeItems(ev, {}, { today: NOW, birthDate: due, monthKeysOf: (e) => (e.detail && e.detail.definition && typeof e.detail.definition.displayMonth === "number" ? [e.detail.definition.displayMonth] : []) });
  assert.strictEqual(res.past.length, 0);
  assert.ok(res.upcoming.length > 0);
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Q-A: 말일생 월 계산(js/date-calc.js) — 월령 슬롯·혜택 날짜·엔진 창 불변
// ─────────────────────────────────────────────────────────────────────────────────────────────
const ymdStr = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const legacySetMonth = (date, n) => {
  const d = new Date(date);
  d.setMonth(d.getMonth() + n);
  return d;
};

/** 대표 월령 k 하나짜리 monthly 이벤트의 [시작, 끝](classifyHomeItems가 계산하는 기간). */
function slotOf(birthDate, k) {
  const ev = { id: `slot-${k}`, category: "생활·수유", scheduleKind: "monthly" };
  const res = L.classifyHomeItems([ev], {}, { today: new Date(2026, 8, 30), birthDate, monthKeysOf: () => [k] });
  const item = [...res.thisMonth, ...res.upcoming, ...res.past][0];
  assert.ok(item, `k=${k} 슬롯이 어느 분류에도 없음`);
  return [item.start, item.end];
}

test("Q-A 슬롯: 1/31생 — 월령 슬롯이 실제 달력 월마다 하나씩(2월에도 있다)", () => {
  const b = new Date(2026, 0, 31);
  const expected = { 0: ["2026-01-31", "2026-02-27"], 1: ["2026-02-28", "2026-03-30"], 2: ["2026-03-31", "2026-04-29"], 3: ["2026-04-30", "2026-05-30"], 4: ["2026-05-31", "2026-06-29"], 5: ["2026-06-30", "2026-07-30"] };
  for (const [k, [s, e]] of Object.entries(expected)) {
    const [gs, ge] = slotOf(b, Number(k));
    assert.deepStrictEqual([ymdStr(gs), ymdStr(ge)], [s, e], `k=${k}`);
  }
});

test("Q-A 슬롯: assignDisplayDays — 1/31생 k=1 항목의 추천일이 2/28~3/30 안(수정 전에는 3/3 이후에만 가능했다)", () => {
  const b = new Date(2026, 0, 31);
  const ev = { id: "slot-1", category: "생활·수유", scheduleKind: "monthly" };
  const days = L.assignDisplayDays([ev], { birthDate: b, monthKeysOf: () => [1] }).get("slot-1");
  assert.strictEqual(days.length, 1);
  assert.ok(ymdStr(days[0]) >= "2026-02-28" && ymdStr(days[0]) <= "2026-03-30", ymdStr(days[0]));
});

test("Q-A 슬롯 P4: 모든 출생일(2026 전체 + 2024-02-29) × k∈[0,72] — 빈틈·겹침 없이 이어지고 시작 달이 출생월+k", () => {
  const births = [];
  for (let t = new Date(2026, 0, 1); t.getFullYear() === 2026; t = new Date(t.getFullYear(), t.getMonth(), t.getDate() + 1)) births.push(t);
  births.push(new Date(2024, 1, 29));
  for (const b of births) {
    let prevEnd = null;
    for (let k = 0; k <= 72; k++) {
      const [s, e] = slotOf(b, k);
      const idx = b.getFullYear() * 12 + b.getMonth() + k;
      assert.strictEqual(s.getFullYear() * 12 + s.getMonth(), idx, `${ymdStr(b)} k=${k}: 시작 달이 출생월+k가 아님(${ymdStr(s)})`);
      if (prevEnd) assert.strictEqual(ymdStr(new Date(prevEnd.getFullYear(), prevEnd.getMonth(), prevEnd.getDate() + 1)), ymdStr(s), `${ymdStr(b)} k=${k}: 앞 슬롯과 이어지지 않음`);
      assert.ok(e >= s);
      prevEnd = e;
    }
  }
});

test("Q-A 슬롯: 28일 이하 출생은 수정 전(setMonth) 슬롯과 동일", () => {
  for (const b of [new Date(2026, 5, 20), new Date(2026, 0, 28), new Date(2026, 1, 28), new Date(2026, 4, 15), new Date(2025, 11, 1)]) {
    for (let k = 0; k <= 72; k++) {
      const [s, e] = slotOf(b, k);
      const os = new Date(legacySetMonth(b, k).getFullYear(), legacySetMonth(b, k).getMonth(), legacySetMonth(b, k).getDate());
      const ne = legacySetMonth(b, k + 1);
      const oe = new Date(ne.getFullYear(), ne.getMonth(), ne.getDate() - 1);
      assert.deepStrictEqual([ymdStr(s), ymdStr(e)], [ymdStr(os), ymdStr(oe)], `${ymdStr(b)} k=${k}`);
    }
  }
});

// 테스트 전용 합성 혜택(서비스 데이터가 아님) — 혜택 신청 시작일·마감일 계산만 확인한다.
const fx = (id, extra) => ({ id, name: id, status: "확인완료", applicableRegions: ["ALL"], amountText: "테스트", sourceName: "테스트", officialUrl: null, minAgeMonths: 0, maxAgeMonths: 999, deadlineType: "ongoing", deadlineValue: null, ...extra });
function subsidyDates(birthDate, subs) {
  const profile = { birthDate, province: "서울특별시", district: "구로구", gender: null, birthOrder: null, stage: "born" };
  const out = {};
  for (const e of __buildSchedule(profile, { todoDefinitions: [], subsidy: { subsidies: subs } }, [])) out[e.id] = e;
  return out;
}
const SUBS = [
  fx("MIN3", { minAgeMonths: 3 }),
  fx("REL1", { deadlineType: "birth_relative_months", deadlineValue: 1 }),
  fx("REL12", { deadlineType: "birth_relative_months", deadlineValue: 12 }),
  fx("WIN2", { deadlineType: "age_window", deadlineValue: { minMonths: 0, maxMonths: 2 } }),
];

test("Q-A 혜택 날짜: 2026-01-31생 — 신청 시작일·마감일이 말일로 보정된다", () => {
  const r = subsidyDates(new Date(2026, 0, 31), SUBS);
  assert.strictEqual(ymdStr(r.MIN3.entryDate), "2026-04-30"); // 수정 전 05-01
  assert.strictEqual(ymdStr(r.MIN3.fixedDate), "2026-04-30");
  assert.strictEqual(ymdStr(r.REL1.deadlineDate), "2026-02-28"); // 수정 전 03-03
  assert.strictEqual(ymdStr(r.WIN2.deadlineDate), "2026-03-31"); // 31일 있는 달은 수정 전과 동일
});

test("Q-A 혜택 날짜: 2024-02-29생 — 12개월 뒤 마감일은 2025-02-28(Q-B)", () => {
  const r = subsidyDates(new Date(2024, 1, 29), SUBS);
  assert.strictEqual(ymdStr(r.REL12.deadlineDate), "2025-02-28"); // 수정 전 2025-03-01
});

test("Q-A 혜택 날짜: 28일 이하 출생은 수정 전(setMonth)과 동일 — 2026-06-20, 2026-01-28, 2026-02-28", () => {
  for (const b of [new Date(2026, 5, 20), new Date(2026, 0, 28), new Date(2026, 1, 28)]) {
    const r = subsidyDates(b, SUBS);
    assert.strictEqual(ymdStr(r.MIN3.entryDate), ymdStr(legacySetMonth(b, 3)), ymdStr(b));
    assert.strictEqual(ymdStr(r.REL1.deadlineDate), ymdStr(legacySetMonth(b, 1)), ymdStr(b));
    assert.strictEqual(ymdStr(r.REL12.deadlineDate), ymdStr(legacySetMonth(b, 12)), ymdStr(b));
    assert.strictEqual(ymdStr(r.WIN2.deadlineDate), ymdStr(legacySetMonth(b, 2)), ymdStr(b));
  }
});

test("Q-A 엔진 무접촉: todo-engine.js는 DateCalc를 쓰지 않고, 1/31생의 엔진 창은 30일 근사 그대로(HC-01: 출생+0.47×30일)", () => {
  assert.ok(!/DateCalc/.test(fs.readFileSync(path.join(ROOT, "js/todo-engine.js"), "utf8")));
  const b = new Date(2026, 0, 31);
  const profile = { birthDate: b, province: "서울특별시", district: "구로구", gender: null, birthOrder: "first", stage: "born" };
  const ev = __buildSchedule(profile, { todoDefinitions, subsidy: { subsidies: [] } }, []).find((e) => e.id === "HC-01__default");
  assert.ok(ev, "HC-01 없음");
  assert.strictEqual(ev.windowStart.getTime(), b.getTime() + 0.47 * 30 * 86400000);
  assert.strictEqual(ev.windowEnd.getTime(), b.getTime() + 1.17 * 30 * 86400000);
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Q-A 안전장치(I-4): 잘못된 월 값은 그 항목만 Invalid Date로 남기고 일정 계산 전체는 중단시키지 않는다
// ─────────────────────────────────────────────────────────────────────────────────────────────
function captureWarn(fn) {
  const warns = [];
  const orig = console.warn;
  console.warn = (...a) => warns.push(a.join(" "));
  try {
    return { result: fn(), warns };
  } finally {
    console.warn = orig;
  }
}

test("Q-A I-4: 월 값이 잘못된 혜택(문자열·객체 아님)이 있어도 buildSchedule이 중단되지 않고, 그 항목만 Invalid Date", () => {
  const subs = [
    fx("BAD-STR-WINDOW", { deadlineType: "age_window", deadlineValue: "96~155개월(만 8세~13세 미만)" }), // 과천시 GGM-GWACHEON-03 유형
    fx("BAD-NUM-WINDOW", { deadlineType: "age_window", deadlineValue: 36 }), // 양주시 GGM-YANGJU-04 유형
    fx("BAD-STR-REL", { deadlineType: "birth_relative_months", deadlineValue: "12" }), // 마포구 MAPO-001 유형
    fx("GOOD-MIN3", { minAgeMonths: 3 }),
    fx("GOOD-WIN2", { deadlineType: "age_window", deadlineValue: { minMonths: 0, maxMonths: 2 } }),
  ];
  const { result: r, warns } = captureWarn(() => subsidyDates(new Date(2026, 5, 20), subs));
  for (const id of ["BAD-STR-WINDOW", "BAD-NUM-WINDOW", "BAD-STR-REL"]) {
    assert.ok(r[id], `${id} 이벤트가 사라짐`);
    assert.ok(isNaN(r[id].deadlineDate), `${id}: 임의의 정상 날짜로 보정하면 안 됨(Invalid Date여야 함) — ${r[id].deadlineDate}`);
  }
  assert.strictEqual(ymdStr(r["GOOD-MIN3"].entryDate), "2026-09-20", "정상 항목은 영향 없음");
  assert.strictEqual(ymdStr(r["GOOD-WIN2"].deadlineDate), "2026-08-20");
  // 경고: 항목 id로 식별 가능
  for (const id of ["BAD-STR-WINDOW", "BAD-NUM-WINDOW", "BAD-STR-REL"]) assert.ok(warns.some((w) => w.includes(id)), `경고에 ${id}가 없음: ${warns.join(" / ")}`);
  assert.ok(!warns.some((w) => w.includes("GOOD-")), "정상 항목에는 경고가 없어야 함");
});

test("Q-A I-4: 같은 경고는 반복해서 남기지 않는다(화면을 다시 그릴 때마다 콘솔이 넘치지 않게)", () => {
  const subs = [fx("BAD-DEDUPE", { deadlineType: "age_window", deadlineValue: "0~12개월" })];
  const first = captureWarn(() => subsidyDates(new Date(2026, 5, 20), subs));
  const second = captureWarn(() => subsidyDates(new Date(2026, 5, 20), subs));
  assert.strictEqual(first.warns.length, 1);
  assert.strictEqual(second.warns.length, 0);
});

test("Q-A I-4: 래퍼는 RangeError(잘못된 월 수)만 격리하고 다른 오류(Date가 아닌 입력 등)는 그대로 드러낸다", () => {
  assert.doesNotThrow(() => captureWarn(() => addMonths(new Date(2026, 0, 31), undefined, "T")));
  assert.throws(() => addMonths("2026-01-31", 1), TypeError);
  assert.strictEqual(ymdStr(addMonths(new Date(2026, 0, 31), 1)), "2026-02-28"); // 정상 경로(label 생략 가능)
});

test("Q-A I-4: assignDisplayDays — 월 값이 잘못된 슬롯만 건너뛰고 다른 항목은 정상 배치", () => {
  const b = new Date(2026, 0, 31);
  const evBad = { id: "bad", category: "생활·수유", scheduleKind: "monthly" };
  const evOk = { id: "ok", category: "생활·수유", scheduleKind: "monthly" };
  const { result: days } = captureWarn(() => L.assignDisplayDays([evBad, evOk], { birthDate: b, monthKeysOf: (e) => (e.id === "bad" ? [1.5] : [1]) }));
  assert.ok(!days.has("bad"), "잘못된 월 값의 슬롯은 배치되지 않아야 함");
  assert.ok(days.has("ok") && ymdStr(days.get("ok")[0]) >= "2026-02-28");
});

console.log(`\n${passed}개 통과${process.exitCode ? ", 일부 실패" : ""}`);
