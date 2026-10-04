/* v1.12.96: 서울 초6 중학교 배정(SC-13·14) · 초2·3·5·6 구강검진(SC-15~18) · SCHOOL_TERM_WINDOW startDay/endDay · familyLinkable:false.
 * 핵심: 기존 SC-04~11 의 창 계산·일정 넣기는 그대로이고, 새 항목은 해당 학년(·서울)에만 나온다. 실행: node --test test/k9-school-extra.test.js */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
require("./tools/load-engine.js");
const CT = require("../js/child-timeline.js");
const SP = require("../js/school-policy.js");
const AS = require("../js/auto-steps.js");
const ROOT = path.join(__dirname, "..");
const rd = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), "utf8"));

const FILES = ["health-checkup", "vaccination", "development", "feeding", "oral", "sleep", "safety", "daily-life", "childcare", "school", "school-age"].map((f) => `data/todos/${f}.json`).concat("data/subsidies/national-todos.json");
const defs = FILES.flatMap((f) => rd(f).todos);
const SA = rd("data/todos/school-age.json").todos;
const policy = SP.normalize(rd("data/policy/school.json"));
const NOW = new Date();
const SY = NOW.getMonth() + 1 >= 3 ? NOW.getFullYear() : NOW.getFullYear() - 1; // 학년도
const bornForGrade = (g) => new Date(SY - 7 - (g - 1), 5, 10); // 입학 학년도 = 출생연도 + 7
const events = (birth, province) => globalThis.__buildSchedule({ birthDate: birth, province, district: province === "서울특별시" ? "구로구" : "성남시", gender: "male", birthOrder: 1, stage: "born", schoolPolicy: policy }, { todoDefinitions: defs, subsidy: { subsidies: [] } }, []);
const shown = (birth, province) => events(birth, province).filter((e) => CT.isEventVisible(birth, e, NOW));
const todoSet = (evs) => new Set(evs.map((e) => e.id.split("__")[0]));
const NEW = ["SC-13", "SC-14", "SC-15", "SC-16", "SC-17", "SC-18"];

test("서울 초6: 중학교 배정 원서(10.26~11.6)·본배정 발표(1.27)가 나오고 날짜가 정확하다", () => {
  const b = bornForGrade(6);
  const evs = shown(b, "서울특별시");
  const t = todoSet(evs);
  assert.ok(t.has("SC-13") && t.has("SC-14"));
  const r = evs.find((e) => e.id.startsWith("SC-13__"));
  assert.deepStrictEqual([r.date.getFullYear(), r.date.getMonth() + 1, r.date.getDate()], [SY, 10, 26]);
  assert.deepStrictEqual([r.windowEnd.getFullYear(), r.windowEnd.getMonth() + 1, r.windowEnd.getDate()], [SY, 11, 6]);
  const a = evs.find((e) => e.id.startsWith("SC-14__"));
  assert.deepStrictEqual([a.date.getFullYear(), a.date.getMonth() + 1, a.date.getDate()], [SY + 1, 1, 27]);
  assert.deepStrictEqual([a.windowEnd.getFullYear(), a.windowEnd.getMonth() + 1, a.windowEnd.getDate()], [SY + 1, 1, 27]);
});

test("경기·초5·중1에는 중학교 배정 항목이 없다(서울 초6에게만)", () => {
  for (const [g, prov] of [[6, "경기도"], [6, "부산광역시"], [5, "서울특별시"], [4, "서울특별시"], [1, "서울특별시"]]) {
    const t = todoSet(shown(bornForGrade(g), prov));
    assert.ok(!t.has("SC-13") && !t.has("SC-14"), `초${g} ${prov}`);
  }
  const mid = new Date(SY - 7 - 6, 5, 10); // 중1
  assert.ok(![...todoSet(shown(mid, "서울특별시"))].some((id) => id === "SC-13" || id === "SC-14"));
});

test("구강검진 SC-15~18: 초2·3·5·6 각 학년에만 해당 항목 1개, 초1·4·중등에는 없다(서울·경기 모두)", () => {
  const MAP = { 2: "SC-15", 3: "SC-16", 5: "SC-17", 6: "SC-18" };
  for (const prov of ["서울특별시", "경기도"]) {
    for (let g = 1; g <= 6; g++) {
      const t = todoSet(shown(bornForGrade(g), prov));
      const oral = [...t].filter((id) => /^SC-1[5-8]$/.test(id));
      assert.deepStrictEqual(oral, MAP[g] ? [MAP[g]] : [], `${prov} 초${g}`);
    }
  }
});

test("구강검진은 정보 항목: 일정 넣기 불가(familyLinkable:false), 중학교 배정·기존 SC-04~12 는 가능", () => {
  const b = bornForGrade(2);
  const oral = shown(b, "서울특별시").find((e) => e.id.startsWith("SC-15__"));
  oral.autoAfter36 = true; // 36개월 이상 허용 표식이 있어도 정의가 막는다
  assert.strictEqual(AS.isFamilyLinkable(oral, null), false);
  assert.strictEqual(AS.isFamilyLinkable(oral, () => false), false);
  const g6 = shown(bornForGrade(6), "서울특별시").find((e) => e.id.startsWith("SC-13__"));
  assert.strictEqual(AS.isFamilyLinkable(g6, null), true);
  const g1 = shown(bornForGrade(1), "서울특별시");
  for (const id of ["SC-04", "SC-06", "SC-12"]) assert.strictEqual(AS.isFamilyLinkable(g1.find((e) => e.id.startsWith(id + "__")), null), true, id);
  assert.ok(SA.filter((d) => ["SC-15", "SC-16", "SC-17", "SC-18"].includes(d.todo_id)).every((d) => d.familyLinkable === false));
  assert.ok(SA.filter((d) => !["SC-15", "SC-16", "SC-17", "SC-18"].includes(d.todo_id)).every((d) => d.familyLinkable === undefined), "그 밖의 정의에는 필드가 없다");
});

test("기존 SC-04~12: startDay/endDay 없음 → 창 계산이 '시작월 1일~끝월 말일' 그대로", () => {
  const old = SA.filter((d) => /^SC-(0[4-9]|1[0-2])$/.test(d.todo_id));
  assert.strictEqual(old.length, 9);
  old.forEach((d) => assert.ok(d.triggerParams.startDay === undefined && d.triggerParams.endDay === undefined, d.todo_id));
  for (const d of old) {
    const tp = d.triggerParams;
    const g = tp.yearOffset + 1;
    const evs = events(bornForGrade(g), "서울특별시").filter((e) => e.id.startsWith(d.todo_id + "__"));
    assert.ok(evs.length >= 1, d.todo_id);
    const year = SY - 7 - (g - 1) + 7 + tp.yearOffset - (g - 1) + (g - 1); // 입학연도 + yearOffset
    const enroll = SY - (g - 1);
    const y = enroll + tp.yearOffset;
    const start = new Date(y, tp.startMonth - 1, 1);
    const end = new Date(tp.endMonth >= tp.startMonth ? y : y + 1, tp.endMonth, 0);
    assert.strictEqual(evs[0].date.getTime(), start.getTime(), d.todo_id + " 시작");
    assert.strictEqual(evs[0].windowEnd.getTime(), end.getTime(), d.todo_id + " 끝");
    void year;
  }
});

test("startDay/endDay 검증: 범위 밖 값·정수 아님은 정의 오류라 그 항목만 건너뛴다(정상 값은 인스턴스 생성)", () => {
  const TE = globalThis.TodoEngine;
  const b = bornForGrade(6);
  const timeline = CT.compute({ birthDate: b, asOf: NOW, stage: "born", policy });
  const base = SA.find((d) => d.todo_id === "SC-13");
  const run = (tp) => {
    const orig = console.warn; console.warn = () => {};
    try {
      return TE.calculateTodoInstances({ today: NOW, child: { birthDate: b, gender: "male" }, region: { province: "서울특별시", district: "구로구" }, completions: [], timeline,
        todoDefinitions: [{ ...base, triggerParams: { ...base.triggerParams, ...tp }, todo_id: "SC-13X" }] });
    } finally { console.warn = orig; }
  };
  assert.strictEqual(run({}).length, 1);
  assert.strictEqual(run({ startDay: 32 }).length, 0);
  assert.strictEqual(run({ endDay: 0 }).length, 0);
  assert.strictEqual(run({ endDay: 1.5 }).length, 0);
});

test("데이터: 새 id 는 허용 목록에 있고, 서울 항목만 regionCondition 이 있다", () => {
  const allow = rd("data/policy/auto-after36.json").items.map((i) => i.todo_id);
  NEW.forEach((id) => assert.ok(allow.includes(id), id));
  const by = Object.fromEntries(SA.map((d) => [d.todo_id, d]));
  assert.deepStrictEqual(by["SC-13"].regionCondition, { include: ["서울특별시:ALL"] });
  assert.deepStrictEqual(by["SC-14"].regionCondition, { include: ["서울특별시:ALL"] });
  ["SC-15", "SC-16", "SC-17", "SC-18"].forEach((id) => assert.ok(!by[id].regionCondition, id));
  assert.ok(/재배정/.test(by["SC-14"].verificationStatus) && /교육지원청별 상이/.test(by["SC-14"].verificationStatus));
});

test("일정 넣기 날짜 제안: 정확한 날짜(exact)는 시작~끝 기간·확정 표시, 기존(월 창) 항목은 권장일+확인 필요 그대로", () => {
  const p = AS.pickDate({ exact: true, recommendedIso: "2026-10-26", endIso: "2026-11-06", todayIso: "2026-10-05" });
  assert.deepStrictEqual(p, { iso: "2026-10-26", kind: "exact", uncertain: false, endIso: "2026-11-06" });
  assert.deepStrictEqual(AS.pickDate({ exact: true, recommendedIso: "2026-10-26", endIso: "2026-11-06", todayIso: "2026-10-30" }), { iso: "2026-10-30", kind: "exact", uncertain: false, endIso: "2026-11-06" }, "접수 중이면 오늘부터 끝까지");
  assert.strictEqual(AS.pickDate({ exact: true, recommendedIso: "2027-01-27", endIso: "2027-01-27", todayIso: "2026-10-05" }).endIso, "", "하루짜리는 끝 날짜 없음");
  // 기존 경로 불변: exact 없음
  assert.deepStrictEqual(AS.pickDate({ recommendedIso: "2026-03-01", todayIso: "2026-10-05", uncertain: true }), { iso: "2026-10-05", kind: "recommended", uncertain: true });
  assert.deepStrictEqual(AS.pickDate({ deadlineIso: "2026-12-01", todayIso: "2026-10-05" }), { iso: "2026-12-01", kind: "deadline", uncertain: false });
});

test("일정 넣기 시트: 기간이면 끝나는 날 입력과 '확정' 문구, '확인 필요'는 없다 / 기존 확인 필요 표시는 그대로", () => {
  const exact = AS.renderAddSheet({ title: "중학교 배정 원서", date: "2026-10-26", endDate: "2026-11-06", dateKind: "exact", dateUncertain: false, childName: "아이", memo: "" });
  assert.ok(exact.includes('data-as-field="endDate"') && exact.includes("공고로 확정된 날짜") && !exact.includes("확인 필요"));
  const one = AS.renderAddSheet({ title: "발표", date: "2027-01-27", endDate: "", dateKind: "exact", dateUncertain: false, childName: "아이", memo: "" });
  assert.ok(!one.includes('data-as-field="endDate"'));
  const old = AS.renderAddSheet({ title: "검진", date: "2026-10-05", dateKind: "recommended", dateUncertain: true, childName: "아이", memo: "" });
  assert.ok(old.includes("확인 필요") && old.includes("권장일") && !old.includes('data-as-field="endDate"'));
});

test("생년월일 선택기: 초6 졸업 학년도(2014년생)까지 등록 가능 — 연도 하한 올해−13", () => {
  const DP = require("../js/date-picker.js");
  const t = new Date(2026, 9, 5);
  assert.ok(DP.isSelectable(new Date(2014, 0, 1), "born", t, CT.SERVICE_RANGE.pickerYearsBack));
  assert.ok(DP.isSelectable(new Date(2013, 0, 1), "born", t, CT.SERVICE_RANGE.pickerYearsBack));
  assert.ok(!DP.isSelectable(new Date(2012, 11, 31), "born", t, CT.SERVICE_RANGE.pickerYearsBack));
  assert.ok(CT.SERVICE_RANGE.maxMonths === 72, "서비스 상한은 그대로");
});
