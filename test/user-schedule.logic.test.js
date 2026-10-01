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
  assert(codes(mk({ ...r, recurrence: { ...recur, freq: "MONTHLY" } })).includes("I3"));
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
test("soft-deleted 와 반복 문서는 전개하지 않는다(반복은 B5)", () => {
  assert.deepStrictEqual(US.expandOccurrences(withId(US.softDelete(doc, NOW + 1).after, "s1"), "2026-10-01", "2026-10-31"), []);
  assert.deepStrictEqual(US.expandOccurrences(withId(mk({ eventDate: undefined, recurrence: recur }).doc, "s4"), "2026-10-01", "2026-10-31"), []);
});
test("전개 범위 상한(400일) 초과·역순 범위는 RangeError", () => {
  assert.throws(() => US.expandOccurrences(withId(doc, "s1"), "2026-01-01", "2027-03-01"), RangeError);
  assert.throws(() => US.expandOccurrences(withId(doc, "s1"), "2026-10-31", "2026-10-01"), RangeError);
});
test("자동 일정 모듈을 참조하지 않는다(정적 확인)", () => {
  const src = require("fs").readFileSync(require("path").join(__dirname, "..", "js", "user-schedule.js"), "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
  ["TodoEngine", "buildSchedule", "assignDisplayDays", "completed", "localStorage", "firebase", "toISOString"].forEach((w) => assert(!src.includes(w), w + " 참조"));
});

console.log(`\n${passed}개 통과${process.exitCode ? ", 일부 실패" : ""}`);
