const assert = require("assert"), fs = require("fs"), path = require("path");
const US = require("../js/user-schedule.js"), V = require("../js/user-schedule-view.js");
let fail = 0;
function test(n, f) { try { f(); console.log("  ok  -", n); } catch (e) { fail++; console.log("  FAIL-", n, "\n", e.stack.split("\n").slice(0, 3).join("\n")); } }
const NOW = 1790000000000;
const base = { sourceType: "MANUAL", title: "관리비 납부", category: "FAMILY", scope: "FAMILY", allDay: true, dateKind: "FIXED" };
const rec = (startDate, extra) => ({ freq: "MONTHLY", interval: 1, startDate, until: null, ...extra });
const mk = (r, over) => US.buildCreateDoc({ ...base, recurrence: r, ...over }, NOW);
const docOf = (r) => ({ ...mk(r).doc, id: "s1" });
const datesOf = (r, a, b) => US.expandOccurrences(docOf(r), a, b).map((o) => o.date);
const read = (f) => fs.readFileSync(path.join(__dirname, "..", f), "utf8");

test("검증: MONTHLY 허용(byDay 없음), byDay 가 있으면 거부, startDate 필수, until 은 startDate 이후", () => {
  assert.ok(mk(rec("2026-10-15")).ok);
  assert.ok(!mk(rec("2026-10-15", { byDay: ["MO"] })).ok);
  assert.ok(!mk({ freq: "MONTHLY", interval: 1, until: null }).ok);
  assert.ok(!mk(rec("2026-10-15", { until: "2026-09-01" })).ok);
  assert.ok(!mk({ freq: "YEARLY", startDate: "2026-10-15" }).ok);
  assert.ok(US.recurrenceUsable(rec("2026-10-15")) && !US.recurrenceUsable({ freq: "YEARLY", startDate: "2026-10-15" }));
});
test("전개: 매월 15일 — 매달 15일, 시작 전·until 이후 없음", () => {
  assert.deepStrictEqual(datesOf(rec("2026-10-15"), "2026-09-01", "2027-01-31"), ["2026-10-15", "2026-11-15", "2026-12-15", "2027-01-15"]);
  assert.deepStrictEqual(datesOf(rec("2026-10-15", { until: "2026-11-15" }), "2026-10-01", "2027-06-30"), ["2026-10-15", "2026-11-15"]);
});
test("말일 없는 달은 말일로 보정(★A): 31일 규칙", () => {
  assert.deepStrictEqual(datesOf(rec("2026-10-31"), "2026-10-01", "2027-03-31"), ["2026-10-31", "2026-11-30", "2026-12-31", "2027-01-31", "2027-02-28", "2027-03-31"]);
  assert.deepStrictEqual(datesOf(rec("2027-01-30"), "2027-01-01", "2027-03-31"), ["2027-01-30", "2027-02-28", "2027-03-30"]);
  assert.deepStrictEqual(datesOf(rec("2027-12-29"), "2028-01-01", "2028-03-31"), ["2028-01-29", "2028-02-29", "2028-03-29"]); // 윤년 2월 29일
  assert.deepStrictEqual(datesOf(rec("2026-10-29"), "2027-02-01", "2027-02-28"), ["2027-02-28"]);
});
test("isRuleDate·isMonthEndAdjusted: 보정은 계산값(저장 불변), 보정된 날만 true", () => {
  const r = rec("2026-10-31"), before = JSON.stringify(docOf(r));
  assert.ok(US.isRuleDate(r, "2026-11-30") && !US.isRuleDate(r, "2026-11-29") && !US.isRuleDate(r, "2026-11-15") && !US.isRuleDate(r, "2026-09-30"));
  assert.ok(US.isMonthEndAdjusted(r, "2026-11-30") && !US.isMonthEndAdjusted(r, "2026-12-31") && !US.isMonthEndAdjusted(rec("2026-10-15"), "2026-11-15") && !US.isMonthEndAdjusted({ freq: "WEEKLY" }, "2026-11-30"));
  datesOf(r, "2026-10-01", "2027-03-31");
  assert.strictEqual(JSON.stringify(docOf(r)), before);
});
test("interval 2: 2개월마다", () => {
  assert.deepStrictEqual(datesOf(rec("2026-10-15", { interval: 2 }), "2026-10-01", "2027-02-28"), ["2026-10-15", "2026-12-15", "2027-02-15"]);
});
test("회차 key·예외: 이 날만 취소·완료·이동, 보정된 날짜가 원래 날짜(key)", () => {
  const d = docOf(rec("2026-10-31"));
  const occ = (doc, a, b) => US.expandOccurrences(doc, a, b);
  assert.strictEqual(occ(d, "2026-11-01", "2026-11-30")[0].key, "u:s1@2026-11-30");
  const done = { ...US.buildPatch(mk(rec("2026-10-31")).doc, { exceptions: { "2026-11-30": { status: "DONE" } } }, NOW).after, id: "s1" };
  assert.strictEqual(occ(done, "2026-11-01", "2026-12-31").map((o) => o.status).join(), "DONE,TODO");
  const raw = mk(rec("2026-10-31")).doc; // 패치 함수는 저장 필드만 받는다(id 없음)
  assert.ok(US.cancelOccurrence(raw, "2026-11-30", NOW).ok);
  assert.ok(US.moveOccurrence(raw, "2026-11-30", { date: "2026-12-02" }, NOW).ok);
  assert.ok(!US.cancelOccurrence(raw, "2026-11-29", NOW).ok, "규칙에 없는 날짜의 예외는 거부");
});
test("폼: 매월 칩 4개 공용, 매월은 요일 칩·첫 날 안내 없음·끝나는 날 있음·설명(일) 표시, 29~31일 안내, repeatHint 없음", () => {
  const LINKS = [{ childKey: "c1", displayName: "은찬", order: 1 }];
  const f = { ...V.newForm({ date: "2026-10-15", activeChildKey: "c1", links: LINKS }), title: "x", category: "ETC", repeat: "MONTHLY", untilMode: "NONE" };
  const old = V.renderForm(f, LINKS, {});
  const g13 = V.renderFormG13({ ...V.upgradeFormG13(f, { meId: "m1" }), repeat: "MONTHLY" }, LINKS, { members: [{ memberId: "m1", label: "엄마" }], ctx: { meId: "m1" } });
  for (const h of [old, g13]) {
    ["NONE", "WEEKLY", "BIWEEKLY", "MONTHLY"].forEach((k) => assert.ok(h.includes(`data-us-repeat="${k}"`), k));
    assert.ok(/active" data-us-repeat="MONTHLY"/.test(h) && !h.includes("data-us-day=") && !h.includes("첫 날이 고른 요일") && h.includes("끝나는 날") && h.includes("매월 15일에 반복돼요") && !h.includes("말일에 표시돼요") && !h.includes("함께 쓸 수 없어요") && !h.includes("곧 추가돼요") && !h.includes("매월 같은 요일"));
  }
  assert.ok(V.renderForm({ ...f, eventDate: "2026-10-31" }, LINKS, {}).includes("31일이 없는 달은 말일에 표시돼요"));
  assert.ok(!V.renderForm({ ...f, eventDate: "2026-10-28" }, LINKS, {}).includes("말일에 표시돼요"));
  assert.strictEqual(V.monthlyNoteInner("2026-10-30"), "매월 30일에 반복돼요<br>30일이 없는 달은 말일에 표시돼요");
  assert.ok(V.renderForm({ ...f, repeat: "WEEKLY", byDay: ["TU"] }, LINKS, {}).includes('data-us-day="TU"'));
});
test("폼↔문서: formToInput 매월 규칙(byDay 없음)·formFromSchedule 왕복·검증은 요일 없이 통과", () => {
  const f = { ...V.newForm({ date: "2026-10-31", activeChildKey: null, links: [] }), title: "관리비", category: "FAMILY", repeat: "MONTHLY", byDay: [], untilMode: "DATE", until: "2027-03-31" };
  assert.ok(V.validateForm(f).ok);
  const input = V.formToInput(f);
  assert.deepStrictEqual(input.recurrence, { freq: "MONTHLY", interval: 1, startDate: "2026-10-31", until: "2027-03-31" });
  const doc = { ...US.buildCreateDoc(input, NOW).doc, id: "s1" };
  const back = V.formFromSchedule(doc);
  assert.strictEqual(back.repeat, "MONTHLY"); assert.strictEqual(back.eventDate, "2026-10-31"); assert.deepStrictEqual(back.byDay, []);
  assert.ok(!V.validateForm({ ...f, repeat: "WEEKLY", byDay: [] }).ok, "매주는 요일 필수 유지");
});
test("요약·상세: 매월 15일 · 10/15부터, 보정 회차에만 '이 달은 31일이 없어 말일에 표시돼요'", () => {
  assert.strictEqual(V.repeatSummary(rec("2026-10-15")), "매월 15일 · 10/15부터");
  assert.strictEqual(V.repeatSummary(rec("2026-10-15", { until: "2027-03-15" })), "매월 15일 · 10/15~2027/3/15");
  const d = docOf(rec("2026-10-31"));
  const occs = US.expandOccurrences(d, "2026-10-01", "2026-12-31").map((o) => V.cardData({ ...o, badges: [] }, [], { recurrence: d.recurrence }));
  assert.strictEqual(occs.map((c) => c.adjustedText).join("|"), "|이 달은 31일이 없어 말일에 표시돼요|");
  assert.ok(V.renderDetail(V.cardData({ ...US.expandOccurrences(d, "2026-11-01", "2026-11-30")[0], badges: [] }, [], { recurrence: d.recurrence }), {}).includes("이 달은 31일이 없어 말일에 표시돼요"));
  assert.ok(!V.renderDetail(V.cardData({ ...US.expandOccurrences(d, "2026-10-01", "2026-10-31")[0], badges: [] }, [], { recurrence: d.recurrence }), {}).includes("말일에 표시돼요"));
});
test("전체 수정: 매주→매월 전환은 규칙 변경 확인창(R30) 대상, 맞지 않게 된 예외 정리", () => {
  const weekly = { ...mk({ freq: "WEEKLY", interval: 1, byDay: ["TU"], startDate: "2026-10-06", until: null }, { exceptions: { "2026-10-13": { status: "CANCELLED" } } }).doc, id: "s1" };
  const f = { ...V.formFromSchedule(weekly), repeat: "MONTHLY", byDay: [] };
  assert.ok(!V.sameRule(weekly.recurrence, V.formToInput(f).recurrence));
  const { id, ...weeklyRaw } = weekly;
  const plan = V.planFullEdit(f, weeklyRaw, NOW);
  assert.ok(plan.ok && plan.ruleChanged && plan.confirm && plan.pruned.some((p) => p.date === "2026-10-13"), JSON.stringify(plan.messages));
});
test("규칙 파일·앱 연결: firestore.rules 는 freq WEEKLY/MONTHLY, 매월 첫 날 변경 시 설명 제자리 갱신, 기간(endDate)과 반복은 함께 쓰지 않음", () => {
  assert.ok(read("firestore.rules").includes("d.recurrence.get('freq', null) in ['WEEKLY', 'MONTHLY']"));
  assert.ok(read("js/app.js").includes('form.repeat === "MONTHLY"') && read("js/app.js").includes("monthlyNoteInner"));
  const bad = US.buildCreateDoc({ ...base, recurrence: rec("2026-10-15"), endDate: "2026-10-20" }, NOW);
  assert.ok(!bad.ok, "I4: 반복 일정엔 endDate 불가");
});
process.exit(fail ? 1 : 0);
