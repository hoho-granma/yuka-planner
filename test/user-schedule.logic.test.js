/*
 * js/user-schedule.js 단위 테스트 — 불변식 I1~I12, 생성/패치/상태/소프트 삭제, 회차 변환, 후보 정규화.
 * 실행: node test/user-schedule.logic.test.js
 */
const assert = require("assert");
const US = require("../js/user-schedule.js");

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ok  - ${name}`);
  } catch (e) {
    console.error(`FAIL - ${name}\n       ${e.message}`);
    process.exitCode = 1;
  }
}
const NOW = 1790000000000;
const base = { sourceType: "MANUAL", title: "피아노", category: "LESSON", scope: "CHILD", childKeys: ["c1"], allDay: false, startTime: "16:00", endTime: "16:50", dateKind: "FIXED", eventDate: "2026-10-06" };
const mk = (over) => {
  const input = { ...base, ...over };
  Object.keys(input).forEach((k) => input[k] === undefined && delete input[k]);
  return US.buildCreateDoc(input, NOW);
};
const codes = (r) => r.errors.map((e) => e.code);
const recur = { freq: "WEEKLY", interval: 1, byDay: ["TU", "TH"], startDate: "2026-10-06", until: null };

console.log("생성·스키마");
test("기본 FIXED 생성: v/createdAt/updatedAt/status 가 채워진다", () => {
  const r = mk({});
  assert(r.ok, JSON.stringify(r.errors));
  assert.strictEqual(r.doc.v, 1);
  assert.strictEqual(r.doc.createdAt, NOW);
  assert.strictEqual(r.doc.status, "TODO");
});
test("null/undefined 필드는 저장 문서에서 생략된다", () => {
  const r = mk({ memo: null, location: undefined });
  assert(!("memo" in r.doc) && !("location" in r.doc));
});
test("scope=FAMILY 면 childKeys 가 제거된다", () => assert(!("childKeys" in mk({ scope: "FAMILY" }).doc)));
test("허용되지 않은 필드(displayDate 포함)는 거부 — I12", () => {
  assert(codes(mk({ displayDate: "2026-10-06" })).includes("I12"));
  assert(codes(mk({ hacked: 1 })).includes("SCHEMA"));
});
test("필드 한도: 제목 0/101자, memo 501, location 101, childKeys 11, tags 11", () => {
  assert(!mk({ title: "" }).ok && !mk({ title: "가".repeat(101) }).ok && mk({ title: "가".repeat(100) }).ok);
  assert(!mk({ memo: "a".repeat(501) }).ok && !mk({ location: "a".repeat(101) }).ok);
  assert(!mk({ childKeys: Array.from({ length: 11 }, (_, i) => "c" + i) }).ok && mk({ childKeys: Array.from({ length: 10 }, (_, i) => "c" + i) }).ok);
  assert(!mk({ tags: Array.from({ length: 11 }, (_, i) => "t" + i) }).ok);
});

console.log("\n불변식");
test("I1 FIXED: eventDate 필수, periodStart/End 금지", () => {
  assert(codes(mk({ eventDate: undefined })).includes("I1"));
  assert(codes(mk({ periodStart: "2026-10-01", periodEnd: "2026-10-31" })).includes("I1"));
});
test("I2 PERIOD: periodStart ≤ periodEnd 필수, eventDate/endDate 금지", () => {
  const p = { dateKind: "PERIOD", eventDate: undefined, allDay: true, startTime: undefined, endTime: undefined, periodStart: "2026-10-01", periodEnd: "2026-10-31" };
  assert(mk(p).ok);
  assert(codes(mk({ ...p, periodStart: "2026-11-01" })).includes("I2"));
  assert(codes(mk({ ...p, periodEnd: undefined })).includes("I2"));
  assert(codes(mk({ ...p, eventDate: "2026-10-05" })).includes("I2"));
});
test("I3 반복: FIXED 만, eventDate·period 금지, 구조 검증", () => {
  const r = { eventDate: undefined, recurrence: recur };
  assert(mk(r).ok);
  assert(codes(mk({ ...r, eventDate: "2026-10-06" })).includes("I3"));
  assert(codes(mk({ ...r, dateKind: "PERIOD", periodStart: "2026-10-01", periodEnd: "2026-10-31" })).includes("I3"));
  assert(codes(mk({ ...r, recurrence: { ...recur, freq: "YEARLY" } })).includes("I3"));
  assert(codes(mk({ ...r, recurrence: { ...recur, byDay: [] } })).includes("I3"));
  assert(codes(mk({ ...r, recurrence: { ...recur, byDay: ["XX"] } })).includes("I3"));
  assert(codes(mk({ ...r, recurrence: { ...recur, until: "2026-09-01" } })).includes("I3"));
  assert(codes(mk({ ...r, recurrence: { ...recur, interval: 0 } })).includes("I3"));
});
test("I4 endDate ≥ eventDate, 반복과 함께 쓰지 않음", () => {
  assert(mk({ endDate: "2026-10-06" }).ok && mk({ endDate: "2026-10-08" }).ok);
  assert(codes(mk({ endDate: "2026-10-05" })).includes("I4"));
  assert(codes(mk({ eventDate: undefined, recurrence: recur, endDate: "2026-10-08" })).includes("I4"));
});
test("I5 allDay=false: startTime 필수, endTime > startTime, HH:mm", () => {
  assert(codes(mk({ startTime: undefined })).includes("I5"));
  assert(codes(mk({ endTime: "16:00" })).includes("I5"));
  assert(codes(mk({ startTime: "25:00" })).includes("I5"));
  assert(mk({ endTime: undefined }).ok);
});
test("I6 allDay=true: 시각 필드 금지", () => {
  assert(mk({ allDay: true, startTime: undefined, endTime: undefined }).ok);
  assert(codes(mk({ allDay: true })).includes("I6"));
});
test("I7 scope=CHILD → childKeys ≥1, FAMILY → 비어 있음", () => {
  assert(codes(mk({ childKeys: [] })).includes("I7"));
  assert(codes(mk({ childKeys: undefined })).includes("I7"));
  assert(US.validate({ ...mk({}).doc, scope: "FAMILY" }).errors.some((e) => e.code === "I7"));
});
test("I8 OCR/VOICE/IMPORT 는 사용자 확인 필수", () => {
  ["OCR", "VOICE", "IMPORT"].forEach((s) => {
    assert(codes(mk({ sourceType: s })).includes("I8"));
    assert(codes(mk({ sourceType: s, provenance: { confirmedByUser: false } })).includes("I8"));
    assert(mk({ sourceType: s, provenance: { confirmedByUser: true } }).ok);
  });
});
test("I9 원문에 없는 날짜 금지: 후보에 날짜가 없으면 doc 입력을 만들지 않고 needsUserInput 으로 돌려준다", () => {
  const r = US.normalizeFromCandidate({ sourceType: "OCR", title: "상담", category: "INSTITUTION", scope: "FAMILY", allDay: true, provenance: { confirmedByUser: true } }, "2026-09-30");
  assert.strictEqual(r.input, null);
  assert(r.needsUserInput.includes("date"));
  const ok = US.normalizeFromCandidate({ sourceType: "OCR", title: "상담", category: "INSTITUTION", scope: "FAMILY", allDay: true, eventDate: "2026-10-15", provenance: { confirmedByUser: true } }, "2026-09-30");
  assert(ok.input && ok.needsUserInput.length === 0);
  const unconf = US.normalizeFromCandidate({ sourceType: "VOICE", title: "x", category: "ETC", scope: "FAMILY", allDay: true, eventDate: "2026-10-15" }, "2026-09-30");
  assert(unconf.needsUserInput.includes("confirmedByUser"));
});
test("I10 exceptions: 키는 실제 YYYY-MM-DD(점·잘못된 날짜 불가), 200개 이하, status enum", () => {
  const r = { eventDate: undefined, recurrence: recur };
  assert(mk({ ...r, exceptions: { "2026-10-08": { status: "CANCELLED" } } }).ok);
  assert(codes(mk({ ...r, exceptions: { "2026.10.08": {} } })).includes("I10"));
  assert(codes(mk({ ...r, exceptions: { "2026-02-30": {} } })).includes("I10"));
  assert(codes(mk({ ...r, exceptions: { "2026-10-08": { status: "X" } } })).includes("I10"));
  const many = {};
  for (let i = 0; i < 201; i++) many[US.addDays("2026-10-06", i)] = { status: "CANCELLED" };
  assert(codes(mk({ ...r, exceptions: many })).includes("I10"));
});
test("I11 날짜는 문자열 그대로 — 존재하지 않는 날짜·타임스탬프 형식 거부, 라운드트립 동일", () => {
  assert(!mk({ eventDate: "2026-02-30" }).ok && !mk({ eventDate: "2026-10-06T00:00:00Z" }).ok);
  const r = mk({ eventDate: "2026-01-31", endDate: "2026-02-01" });
  assert.strictEqual(JSON.parse(JSON.stringify(r.doc)).eventDate, "2026-01-31");
  assert.strictEqual(US.addDays("2026-01-31", 1), "2026-02-01");
  assert.strictEqual(US.addDays("2026-12-31", 1), "2027-01-01");
  assert.strictEqual(US.addDays("2028-02-28", 1), "2028-02-29");
});
test("반복 일정에는 문서 status 를 쓰지 않는다(완료·취소는 exceptions)", () => assert(!mk({ eventDate: undefined, recurrence: recur, status: "DONE" }).ok));

console.log("\n수정 패치·상태·삭제");
const doc = mk({}).doc;
test("buildPatch: 변경 필드와 updatedAt 만 패치에 들어가고, 적용 결과가 검증된다", () => {
  const r = US.buildPatch(doc, { title: "바이올린", memo: "준비물" }, NOW + 1);
  assert(r.ok);
  assert.deepStrictEqual(Object.keys(r.patch).sort(), ["memo", "title", "updatedAt"]);
  assert.strictEqual(r.after.title, "바이올린");
  assert.strictEqual(doc.title, "피아노", "원본 불변");
});
test("buildPatch: null 은 필드 삭제(패치 null, 결과 문서에서 제거)", () => {
  const r = US.buildPatch(mk({ memo: "x" }).doc, { memo: null }, NOW + 1);
  assert.strictEqual(r.patch.memo, null);
  assert(!("memo" in r.after));
});
test("buildPatch: immutable(v/createdAt/sourceType) 변경 거부", () => {
  ["v", "createdAt", "sourceType"].forEach((k) => {
    const r = US.buildPatch(doc, { [k]: k === "sourceType" ? "OCR" : 99 }, NOW + 1);
    assert(!r.ok && r.errors.some((e) => e.code === "IMMUTABLE"), k);
  });
});
test("buildPatch: 결과가 불변식을 깨면 거부(PERIOD 로 바꾸면서 eventDate 유지)", () => {
  assert(!US.buildPatch(doc, { dateKind: "PERIOD" }, NOW + 1).ok);
});
test("markDone(비반복): status=DONE, 반복은 회차 날짜 필요", () => {
  assert.strictEqual(US.markDone(doc, NOW + 1).after.status, "DONE");
  const rec = mk({ eventDate: undefined, recurrence: recur }).doc;
  assert(!US.markDone(rec, NOW + 1).ok);
  const r = US.markDone(rec, NOW + 1, { date: "2026-10-13" });
  assert(r.ok);
  assert.deepStrictEqual(Object.keys(r.patch).sort(), ["exceptions.2026-10-13", "updatedAt"]);
  assert.strictEqual(r.after.exceptions["2026-10-13"].status, "DONE");
  assert(!("status" in r.after), "반복 문서에 문서 status 를 쓰지 않는다");
});
test("예외 추가/제거는 날짜 단위 dot-path, 같은 날 기존 값 보존(note 유지)", () => {
  const rec = mk({ eventDate: undefined, recurrence: recur, exceptions: { "2026-10-08": { status: "CANCELLED", note: "휴강" } } }).doc;
  const r = US.setStatus(rec, "DONE", NOW + 1, { date: "2026-10-08" });
  assert.strictEqual(r.after.exceptions["2026-10-08"].note, "휴강");
  const rm = US.buildPatch(rec, { exceptions: { "2026-10-08": null } }, NOW + 2);
  assert.strictEqual(rm.patch["exceptions.2026-10-08"], null);
  assert(!("exceptions" in rm.after));
});
test("softDelete: deletedAt 만 기록, 원본 데이터 유지", () => {
  const r = US.softDelete(doc, NOW + 5);
  assert.deepStrictEqual(Object.keys(r.patch).sort(), ["deletedAt", "updatedAt"]);
  assert.strictEqual(r.after.title, doc.title);
});

console.log("\n회차(Occurrence)");
const withId = (d, id) => ({ ...d, id });
test("FIXED 단일: key=u:<id>@<날짜>, 범위 밖이면 없음", () => {
  const o = US.expandOccurrences(withId(doc, "s1"), "2026-10-01", "2026-10-31");
  assert.strictEqual(o.length, 1);
  assert.strictEqual(o[0].key, "u:s1@2026-10-06");
  assert.strictEqual(o[0].origin, "USER");
  assert.strictEqual(o[0].date, "2026-10-06");
  assert.deepStrictEqual(US.expandOccurrences(withId(doc, "s1"), "2026-11-01", "2026-11-30"), []);
});
test("endDate 연속 일정: 범위와 겹치기만 해도 포함(범위 시작 전에 시작해도)", () => {
  const camp = withId(mk({ eventDate: "2026-10-30", endDate: "2026-11-02", allDay: true, startTime: undefined, endTime: undefined }).doc, "s2");
  assert.strictEqual(US.expandOccurrences(camp, "2026-11-01", "2026-11-30").length, 1);
  assert.strictEqual(US.expandOccurrences(camp, "2026-11-03", "2026-11-30").length, 0);
});
test("PERIOD: date=null(점 없음), 기간이 범위와 겹치면 포함", () => {
  const p = withId(mk({ dateKind: "PERIOD", eventDate: undefined, allDay: true, startTime: undefined, endTime: undefined, periodStart: "2026-10-01", periodEnd: "2026-10-31" }).doc, "s3");
  const o = US.expandOccurrences(p, "2026-10-15", "2026-11-14");
  assert.strictEqual(o.length, 1);
  assert.strictEqual(o[0].date, null);
  assert.strictEqual(o[0].periodStart, "2026-10-01");
});
test("soft-deleted 는 전개하지 않는다(삭제된 반복 일정 포함)", () => {
  assert.deepStrictEqual(US.expandOccurrences(withId(US.softDelete(doc, NOW + 1).after, "s1"), "2026-10-01", "2026-10-31"), []);
  const rec = withId(mk({ eventDate: undefined, recurrence: recur }).doc, "s4");
  assert.deepStrictEqual(US.expandOccurrences({ ...rec, deletedAt: NOW }, "2026-10-01", "2026-10-31"), []);
});
test("전개 범위 상한(400일) 초과·역순 범위는 RangeError", () => {
  assert.throws(() => US.expandOccurrences(withId(doc, "s1"), "2026-01-01", "2027-03-01"), RangeError);
  assert.throws(() => US.expandOccurrences(withId(doc, "s1"), "2026-10-31", "2026-10-01"), RangeError);
});
test("자동 일정 모듈을 참조하지 않는다(정적 확인)", () => {
  const src = require("fs").readFileSync(require("path").join(__dirname, "..", "js", "user-schedule.js"), "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
  ["TodoEngine", "buildSchedule", "assignDisplayDays", "completed", "localStorage", "firebase", "toISOString"].forEach((w) => assert(!src.includes(w), w + " 참조"));
});

// ════════════════════════════════════════════════════════════════════════
// B5 — 반복 전개 · 예외 · 이 날만 / 전체
// ════════════════════════════════════════════════════════════════════════
console.log("\n반복 전개 (B5)");
// 문서에는 id 를 붙이지 않는다(저장 문서·패치 입력은 id 없음). 전개할 때만 ex() 가 id 를 붙인다.
const rid = (over = {}, rec = recur) => mk({ eventDate: undefined, recurrence: rec, ...over }).doc;
const ex = (d, a, z) => US.expandOccurrences({ ...d, id: "r1" }, a, z);
const dates = (occ) => occ.map((o) => o.date);
const OCT = ["2026-10-01", "2026-10-31"];
const deepFreeze = (o) => (Object.values(o).forEach((v) => v && typeof v === "object" && deepFreeze(v)), Object.freeze(o));

test("규칙 날짜 판정: 요일·interval·startDate·until", () => {
  assert.strictEqual(US.weekdayOf("2026-10-06"), "TU");
  assert(US.isRuleDate(recur, "2026-10-06") && US.isRuleDate(recur, "2026-10-08"));
  assert(!US.isRuleDate(recur, "2026-10-07"), "수요일");
  assert(!US.isRuleDate(recur, "2026-10-01"), "startDate 이전");
  assert(!US.isRuleDate({ ...recur, until: "2026-10-13" }, "2026-10-15"), "until 이후");
  assert(US.isRuleDate({ ...recur, until: "2026-10-15" }, "2026-10-15"), "until 당일 포함");
  assert(!US.isRuleDate({ ...recur, freq: "YEARLY" }, "2026-10-06"), "지원하지 않는 규칙");
});
test("매주 화·목: 10월 8회, key=u:<id>@<원래 날짜>, 시각·제목·반복 표시", () => {
  const occ = ex(rid(), ...OCT);
  assert.deepStrictEqual(dates(occ), ["2026-10-06", "2026-10-08", "2026-10-13", "2026-10-15", "2026-10-20", "2026-10-22", "2026-10-27", "2026-10-29"]);
  assert.strictEqual(occ[0].key, "u:r1@2026-10-06");
  assert(occ.every((o) => o.recurring === true && o.originalDate === o.date && o.status === "TODO" && o.startTime === "16:00" && o.title === "피아노" && o.dateKind === "FIXED" && !o.rescheduled));
});
test("첫 날이 규칙 요일이 아니면 그다음 해당 요일부터", () => {
  const occ = ex(rid({}, { ...recur, startDate: "2026-10-07" }), ...OCT);
  assert.strictEqual(occ[0].date, "2026-10-08");
});
test("until 은 포함, 범위가 규칙 시작 전이면 빈 목록, 범위가 일부만 겹쳐도 정확", () => {
  assert.deepStrictEqual(dates(ex(rid({}, { ...recur, until: "2026-10-15" }), ...OCT)), ["2026-10-06", "2026-10-08", "2026-10-13", "2026-10-15"]);
  assert.deepStrictEqual(ex(rid(), "2026-09-01", "2026-10-05"), []);
  assert.deepStrictEqual(dates(ex(rid(), "2026-10-14", "2026-10-21")), ["2026-10-15", "2026-10-20"]);
});
test("2주마다: 첫 주 기준 격주(월요일 시작 주). 첫 날이 주중이어도 그 주가 0번째 주", () => {
  const every2 = { ...recur, interval: 2 };
  assert.deepStrictEqual(dates(ex(rid({}, every2), ...OCT)), ["2026-10-06", "2026-10-08", "2026-10-20", "2026-10-22"]);
  // 목요일 시작: 같은 주의 화요일(10/6)은 startDate 이전이라 제외, 10/8 이 첫 회차
  assert.deepStrictEqual(dates(ex(rid({}, { ...every2, startDate: "2026-10-08" }), ...OCT)), ["2026-10-08", "2026-10-20", "2026-10-22"]);
  // 일요일(주의 끝)을 고른 격주: 10/11 → 10/25
  assert.deepStrictEqual(dates(ex(rid({}, { freq: "WEEKLY", interval: 2, byDay: ["SU"], startDate: "2026-10-05", until: null }), ...OCT)), ["2026-10-11", "2026-10-25"]);
});
test("연말·연초·윤년(2/29)·월말 경계", () => {
  const sun = { freq: "WEEKLY", interval: 1, byDay: ["SU"], startDate: "2026-12-01", until: null };
  assert.deepStrictEqual(dates(ex(rid({}, sun), "2026-12-20", "2027-01-10")), ["2026-12-20", "2026-12-27", "2027-01-03", "2027-01-10"]);
  const tue = { freq: "WEEKLY", interval: 1, byDay: [US.weekdayOf("2028-02-29")], startDate: "2028-02-01", until: null };
  assert(dates(ex(rid({}, tue), "2028-02-01", "2028-03-05")).includes("2028-02-29"));
  const days31 = dates(ex(rid({}, { ...recur, byDay: ["MO", "TU", "WE", "TH", "FR", "SA", "SU"], startDate: "2026-10-01" }), ...OCT));
  assert.strictEqual(days31.length, 31, "매일 선택 → 31일 모두");
});
test("취소·완료·이동 예외: 취소는 원래 날짜에 status:CANCELLED, 완료는 DONE, 이동은 이동한 날짜에만(원래 날짜에는 없음)", () => {
  const d = rid({ exceptions: {
    "2026-10-08": { status: "CANCELLED", note: "휴강" },
    "2026-10-13": { status: "RESCHEDULED", movedTo: { date: "2026-10-14", startTime: "17:00", endTime: "17:50" } },
    "2026-10-15": { status: "DONE" },
  } });
  const occ = ex(d, ...OCT);
  const by = Object.fromEntries(occ.map((o) => [o.originalDate, o]));
  assert.strictEqual(by["2026-10-08"].status, "CANCELLED");
  assert.strictEqual(by["2026-10-15"].status, "DONE");
  const mv = by["2026-10-13"];
  assert(mv.date === "2026-10-14" && mv.movedFrom === "2026-10-13" && mv.rescheduled && mv.startTime === "17:00" && mv.endTime === "17:50" && mv.status === "TODO");
  assert(!occ.some((o) => o.date === "2026-10-13"), "원래 날짜(10/13)에는 표시하지 않는다");
  assert.strictEqual(by["2026-10-06"].startTime, "16:00", "예외 없는 회차는 문서 시각 그대로");
});
test("이동: 원래 날짜가 범위 밖이어도 이동한 날짜가 범위 안이면 포함, 반대로 안에서 밖으로 나가면 제외", () => {
  const d = rid({ exceptions: {
    "2026-09-29": { status: "RESCHEDULED", movedTo: { date: "2026-10-02" } },   // 9월 회차 → 10/2
    "2026-10-27": { status: "RESCHEDULED", movedTo: { date: "2026-11-02" } },   // 10월 회차 → 11/2
  } }, { ...recur, startDate: "2026-09-29" });
  const oct = ex(d, ...OCT);
  assert(oct.some((o) => o.originalDate === "2026-09-29" && o.date === "2026-10-02"));
  assert(!oct.some((o) => o.originalDate === "2026-10-27"));
  const nov = ex(d, "2026-11-01", "2026-11-07");
  assert(nov.some((o) => o.originalDate === "2026-10-27" && o.date === "2026-11-02"));
});
test("같은 날 시간만 바꾼 이동·이동 후 완료(DONE+movedTo)·종일 회차를 시각 있는 회차로", () => {
  const d = rid({ allDay: true, startTime: undefined, endTime: undefined, exceptions: {
    "2026-10-06": { status: "RESCHEDULED", movedTo: { date: "2026-10-06", startTime: "09:00" } },
    "2026-10-08": { status: "DONE", movedTo: { date: "2026-10-09" } },
  } });
  const occ = ex(d, ...OCT);
  const a = occ.find((o) => o.originalDate === "2026-10-06");
  assert(a.date === "2026-10-06" && a.allDay === false && a.startTime === "09:00" && a.endTime === null && !a.movedFrom && a.rescheduled);
  const b = occ.find((o) => o.originalDate === "2026-10-08");
  assert(b.date === "2026-10-09" && b.status === "DONE" && b.allDay === true);
});
test("규칙에 맞지 않는 날짜의 예외는 무시된다", () => {
  const d = rid({ exceptions: { "2026-10-07": { status: "CANCELLED" }, "2026-09-01": { status: "CANCELLED" }, "2026-10-09": { status: "RESCHEDULED", movedTo: { date: "2026-10-10" } } } });
  const occ = ex(d, ...OCT);
  assert.strictEqual(occ.length, 8);
  assert(occ.every((o) => o.status === "TODO" && !o.rescheduled));
});
test("사용할 수 없는 규칙(YEARLY 등)·삭제된 문서는 []. 입력 문서는 변경되지 않는다. 범위 상한 유지", () => {
  assert.deepStrictEqual(ex({ ...rid(), recurrence: { ...recur, freq: "YEARLY" } }, ...OCT), []);
  assert.deepStrictEqual(ex({ ...rid(), recurrence: { ...recur, byDay: [] } }, ...OCT), []);
  const frozen = deepFreeze(rid({ exceptions: { "2026-10-08": { status: "CANCELLED" } } }));
  assert.doesNotThrow(() => ex(frozen, ...OCT));
  assert.throws(() => ex(rid(), "2026-01-01", "2027-03-01"), RangeError);
});
test("비반복(단일·연속·기간 미정) 전개 결과는 B4 와 같은 모양(recurring/rescheduled 필드가 생기지 않는다)", () => {
  const single = mk({}).doc;
  const o = US.expandOccurrences({ ...single, id: "s9" }, ...OCT)[0];
  assert(!("recurring" in o) && !("rescheduled" in o) && o.key === "u:s9@2026-10-06" && o.status === "TODO");
});

console.log("\n이 날만 (취소·되돌리기·이동·완료)");
const apply = (before, r) => (assert(r.ok, JSON.stringify(r.errors)), r.after);
test("이 날만 취소: exceptions.<날짜> 하나만 쓰고 문서 status·다른 날은 건드리지 않는다", () => {
  const d = rid();
  const r = US.cancelOccurrence(d, "2026-10-08", NOW + 1);
  assert(r.ok);
  assert.deepStrictEqual(Object.keys(r.patch).sort(), ["exceptions.2026-10-08", "updatedAt"]);
  assert.deepStrictEqual(r.patch["exceptions.2026-10-08"], { status: "CANCELLED" });
  assert(!("status" in r.after));
});
test("취소 되돌리기: 이동 정보가 없으면 예외 자체를 삭제(null), 있으면 RESCHEDULED 로 복원", () => {
  const d = apply(rid(), US.cancelOccurrence(rid(), "2026-10-08", NOW + 1));
  const r = US.restoreOccurrence(d, "2026-10-08", NOW + 2);
  assert(r.ok && r.patch["exceptions.2026-10-08"] === null && !r.after.exceptions);
  const moved = apply(rid(), US.moveOccurrence(rid(), "2026-10-13", { date: "2026-10-14", startTime: "17:00" }, NOW + 1));
  const cancelled = apply(moved, US.cancelOccurrence(moved, "2026-10-13", NOW + 2));
  assert.strictEqual(cancelled.exceptions["2026-10-13"].status, "CANCELLED");
  assert(ex(cancelled, ...OCT).some((o) => o.originalDate === "2026-10-13" && o.date === "2026-10-13" && o.status === "CANCELLED"), "취소된 이동 회차는 원래 날짜에 취소로 보인다");
  const restored = US.restoreOccurrence(cancelled, "2026-10-13", NOW + 3);
  assert.deepStrictEqual(restored.after.exceptions["2026-10-13"], { status: "RESCHEDULED", movedTo: { date: "2026-10-14", startTime: "17:00" } });
});
test("이 날만 완료 → 완료 취소(restore). 완료는 문서 status 가 아니라 예외, 다른 날은 영향 없음", () => {
  const d = rid();
  const done = apply(d, US.markDone(d, NOW + 1, { date: "2026-10-15" }));
  assert.deepStrictEqual(done.exceptions, { "2026-10-15": { status: "DONE" } });
  const occ = ex(done, ...OCT);
  assert.strictEqual(occ.filter((o) => o.status === "DONE").length, 1);
  const undone = US.restoreOccurrence(done, "2026-10-15", NOW + 2);
  assert(undone.ok && !undone.after.exceptions);
  assert(!US.restoreOccurrence(d, "2026-10-15", NOW).ok, "되돌릴 상태가 없으면 거부");
});
test("이 날만 이동: 날짜/시간, 이동 후 완료해도 movedTo 유지, 원래 날짜·시각으로 되돌리면 이동 해제", () => {
  const d = rid();
  const m = apply(d, US.moveOccurrence(d, "2026-10-13", { date: "2026-10-14", startTime: "17:00", endTime: "17:50" }, NOW + 1));
  assert.deepStrictEqual(m.exceptions["2026-10-13"], { status: "RESCHEDULED", movedTo: { date: "2026-10-14", startTime: "17:00", endTime: "17:50" } });
  const done = apply(m, US.markDone(m, NOW + 2, { date: "2026-10-13" }));
  assert.deepStrictEqual(done.exceptions["2026-10-13"], { status: "DONE", movedTo: { date: "2026-10-14", startTime: "17:00", endTime: "17:50" } });
  const back = US.moveOccurrence(m, "2026-10-13", { date: "2026-10-13" }, NOW + 3);
  assert(back.ok && back.patch["exceptions.2026-10-13"] === null);
  const reMove = apply(done, US.moveOccurrence(done, "2026-10-13", { date: "2026-10-16" }, NOW + 4));
  assert.strictEqual(reMove.exceptions["2026-10-13"].status, "DONE", "완료 상태는 이동해도 유지");
  assert.strictEqual(reMove.exceptions["2026-10-13"].movedTo.date, "2026-10-16");
});
test("거부: 취소된 회차 이동·규칙에 없는 날짜·비반복 문서·잘못된 날짜/시각", () => {
  const d = rid();
  const c = apply(d, US.cancelOccurrence(d, "2026-10-08", NOW + 1));
  assert(!US.moveOccurrence(c, "2026-10-08", { date: "2026-10-09" }, NOW).ok);
  assert(!US.cancelOccurrence(d, "2026-10-07", NOW).ok, "수요일은 규칙 날짜가 아니다");
  assert(!US.cancelOccurrence(mk({}).doc, "2026-10-06", NOW).ok, "비반복");
  assert(!US.moveOccurrence(d, "2026-10-13", { date: "2026-02-30" }, NOW).ok);
  assert(!US.moveOccurrence(d, "2026-10-13", { date: "2026-10-14", startTime: "25:00" }, NOW).ok);
  assert(!US.moveOccurrence(d, "2026-10-13", { date: "2026-10-14", startTime: "17:00", endTime: "16:00" }, NOW).ok);
});
test("예외 200개 상한: 200개까지 가능, 201번째는 I10 로 거부, 180개부터 경고 기준(EXCEPTION_WARN_AT)", () => {
  const daily = { freq: "WEEKLY", interval: 1, byDay: ["MO", "TU", "WE", "TH", "FR", "SA", "SU"], startDate: "2026-10-01", until: null };
  const exs = {};
  for (let i = 0; i < 199; i++) exs[US.addDays("2026-10-01", i)] = { status: "CANCELLED" };
  const d = rid({ exceptions: exs }, daily);
  assert.strictEqual(US.exceptionCount(d), 199);
  const r200 = US.cancelOccurrence(d, US.addDays("2026-10-01", 199), NOW);
  assert(r200.ok && US.exceptionCount(r200.after) === 200);
  const r201 = US.cancelOccurrence(r200.after, US.addDays("2026-10-01", 200), NOW);
  assert(!r201.ok && r201.errors.some((e) => e.code === "I10"));
  assert.strictEqual(US.EXCEPTION_WARN_AT, 180);
});

console.log("\n전체 수정·삭제 (D6: 예외 정리)");
const withEx = () => rid({ exceptions: {
  "2026-10-06": { status: "DONE" },
  "2026-10-08": { status: "CANCELLED", note: "휴강" },
  "2026-10-13": { status: "RESCHEDULED", movedTo: { date: "2026-10-14", startTime: "17:00" } },
  "2026-10-15": { status: "RESCHEDULED", movedTo: { date: "2026-10-15", startTime: "18:00" } },
} });
test("요일을 화·목 → 화로: 새 규칙에서도 유효한 예외는 유지, 목요일 예외만 null 로 정리(effective 로 표시)", () => {
  const d = withEx();
  const r = US.editAll(d, { recurrence: { ...recur, byDay: ["TU"] } }, NOW + 1);
  assert(r.ok, JSON.stringify(r.errors));
  assert.deepStrictEqual(r.pruned, [{ date: "2026-10-08", effective: true }, { date: "2026-10-15", effective: true }]);
  assert.strictEqual(r.prunedEffective, 2);
  assert.strictEqual(r.patch["exceptions.2026-10-08"], null);
  assert.strictEqual(r.patch["exceptions.2026-10-15"], null);
  assert(!("exceptions.2026-10-06" in r.patch) && !("exceptions.2026-10-13" in r.patch), "유효한 예외는 패치에 나타나지 않는다(그대로)");
  // 보존: 완료·이동 정보가 값 그대로
  assert.deepStrictEqual(r.after.exceptions, { "2026-10-06": { status: "DONE" }, "2026-10-13": { status: "RESCHEDULED", movedTo: { date: "2026-10-14", startTime: "17:00" } } });
});
test("정리 대상 종류별: 취소·시간 이동·날짜 이동·완료 각각 유효하면 값 그대로 보존, 무효면 정리", () => {
  const d = withEx();
  const keepAll = US.editAll(d, { recurrence: { ...recur, byDay: ["TU", "TH", "FR"], interval: 1 } }, NOW);
  assert.deepStrictEqual(keepAll.pruned, []);
  assert.deepStrictEqual(keepAll.after.exceptions, d.exceptions);
  const untilCut = US.editAll(d, { recurrence: { ...recur, until: "2026-10-10" } }, NOW);
  assert.deepStrictEqual(untilCut.pruned.map((p) => p.date), ["2026-10-13", "2026-10-15"], "until 이후 예외만 정리");
  const startLater = US.editAll(d, { recurrence: { ...recur, startDate: "2026-10-12" } }, NOW);
  assert.deepStrictEqual(startLater.pruned.map((p) => p.date), ["2026-10-06", "2026-10-08"], "startDate 이전 예외만 정리");
  const biweekly = US.editAll(d, { recurrence: { ...recur, interval: 2 } }, NOW);
  assert.deepStrictEqual(biweekly.pruned.map((p) => p.date), ["2026-10-13", "2026-10-15"], "격주로 바꾸면 홀수 주 예외 정리");
});
test("규칙을 바꾸지 않는 수정(제목·시각·메모)은 정리하지 않고 recurrence 도 다시 쓰지 않는다", () => {
  const d = withEx();
  const r = US.editAll(d, { title: "바이올린", startTime: "15:00", endTime: "15:50", recurrence: { ...recur } }, NOW);
  assert(r.ok && r.pruned.length === 0);
  assert.deepStrictEqual(Object.keys(r.patch).sort(), ["endTime", "startTime", "title", "updatedAt"]);
  assert.deepStrictEqual(r.after.exceptions, d.exceptions);
});
test("정리 전후 예외 수는 늘지 않고 200 이하 · 이미 무효였던 예외는 effective:false", () => {
  const exs = {};
  for (let i = 0; i < 200; i++) exs[US.addDays("2026-10-01", i)] = { status: "CANCELLED" };
  const daily = { freq: "WEEKLY", interval: 1, byDay: ["MO", "TU", "WE", "TH", "FR", "SA", "SU"], startDate: "2026-10-01", until: null };
  const d = rid({ exceptions: exs }, daily);
  assert.strictEqual(US.exceptionCount(d), 200);
  const r = US.editAll(d, { recurrence: { ...daily, byDay: ["MO"] } }, NOW);
  assert(r.ok && US.exceptionCount(r.after) <= 200 && US.exceptionCount(r.after) < 200);
  assert.strictEqual(r.pruned.length + US.exceptionCount(r.after), 200, "정리된 것 + 남은 것 = 처음 200");
  assert(r.after.exceptions && Object.keys(r.after.exceptions).every((k) => US.weekdayOf(k) === "MO"));
  const orphan = rid({ exceptions: { "2026-10-07": { status: "CANCELLED" } } });
  assert.deepStrictEqual(US.editAll(orphan, { recurrence: { ...recur, byDay: ["TU"] } }, NOW).pruned, [{ date: "2026-10-07", effective: false }]);
});
test("반복 → 단일: 모든 예외 정리, status TODO, eventDate 필요 / 단일 → 반복: eventDate·endDate·status 제거", () => {
  const d = withEx();
  const toSingle = US.editAll(d, { recurrence: null, eventDate: "2026-10-20" }, NOW);
  assert(toSingle.ok, JSON.stringify(toSingle.errors));
  assert.strictEqual(toSingle.pruned.length, 4);
  assert(!toSingle.after.recurrence && !toSingle.after.exceptions && toSingle.after.status === "TODO" && toSingle.after.eventDate === "2026-10-20");
  assert(!US.editAll(d, { recurrence: null }, NOW).ok, "eventDate 없이는 단일이 될 수 없다");
  const single = mk({ endDate: "2026-10-07" }).doc;
  const toRec = US.editAll(single, { recurrence: { ...recur, startDate: "2026-10-06" } }, NOW);
  assert(toRec.ok, JSON.stringify(toRec.errors));
  assert(!("eventDate" in toRec.after) && !("endDate" in toRec.after) && !("status" in toRec.after) && toRec.after.recurrence.byDay.length === 2);
  assert(toRec.patch.eventDate === null && toRec.patch.status === null && toRec.patch.endDate === null);
  const period = mk({ dateKind: "PERIOD", eventDate: undefined, allDay: true, startTime: undefined, endTime: undefined, periodStart: "2026-10-01", periodEnd: "2026-10-31" }).doc;
  const pToRec = US.editAll(period, { recurrence: recur, allDay: false, startTime: "16:00" }, NOW);
  assert(pToRec.ok, JSON.stringify(pToRec.errors));
  assert(pToRec.after.dateKind === "FIXED" && !("periodStart" in pToRec.after));
});
test("전체 삭제 = 문서 deletedAt 소프트 삭제 한 필드, 이후 전개는 []", () => {
  const d = withEx();
  const r = US.softDelete(d, NOW + 9);
  assert(r.ok);
  assert.deepStrictEqual(Object.keys(r.patch).sort(), ["deletedAt", "updatedAt"]);
  assert.deepStrictEqual(ex(r.after, ...OCT), []);
});
test("입력 문서·변경 객체를 변경하지 않는다(deep freeze)", () => {
  const d = deepFreeze(withEx());
  const ch = deepFreeze({ recurrence: { ...recur, byDay: ["TU"] }, title: "x" });
  assert.doesNotThrow(() => US.editAll(d, ch, NOW));
  assert.doesNotThrow(() => US.cancelOccurrence(d, "2026-10-20", NOW));
  assert.doesNotThrow(() => US.moveOccurrence(d, "2026-10-20", { date: "2026-10-21", startTime: "10:00" }, NOW));
  assert.doesNotThrow(() => US.restoreOccurrence(d, "2026-10-06", NOW));
});
test("movedTo 시각 검증(I10)이 validate 에도 적용된다", () => {
  const bad = { ...withEx(), exceptions: { "2026-10-13": { status: "RESCHEDULED", movedTo: { date: "2026-10-14", endTime: "17:50" } } } };
  assert(codes(US.validate(bad)).includes("I10"), "startTime 없이 endTime 만");
});

console.log(`\n${passed}개 통과${process.exitCode ? ", 일부 실패" : ""}`);
