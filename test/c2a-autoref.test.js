/*
 * C2-a 테스트 — autoRef 스키마·검증(I13)·불변, expandOccurrences 전달, CalendarModel.linksByAutoId·planned 숨김·isLinkableAuto,
 * AUTO 입력 불변(T4 보강), 골든 가족 문서 T1(읽기만), 연결 대상 id 스냅샷. 서버 호출 없음. 실행: node test/c2a-autoref.test.js
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { HN, buildAuto, PROFILES, serialize, ROOT } = require("./tools/load-engine.js");
const US = require("../js/user-schedule.js");
const CM = require("../js/calendar-model.js");

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log("  ok  - " + name); } catch (e) { process.exitCode = 1; console.log("  FAIL- " + name + "\n      " + (e.stack || e).split("\n").slice(0, 6).join("\n      ")); }
}
const NOW = 1790000000000;
const input = (over) => { const o = { sourceType: "MANUAL", title: "예방접종 병원 예약", category: "MEDICAL", scope: "CHILD", childKeys: ["c1"], allDay: true, dateKind: "FIXED", eventDate: "2026-10-14", autoRef: "VX-DTAP__dose-1", ...over }; Object.keys(o).forEach((k) => o[k] === undefined && delete o[k]); return o; };
const mk = (over, now = NOW) => { const r = US.buildCreateDoc(input(over), now); assert(r.ok, JSON.stringify(r.errors)); return { ...r.doc, id: "s" + Math.random().toString(36).slice(2, 7) }; };

// 한계: 규칙(firestore.rules)에 대한 이 파일·firestore-rules.logic.test.js 의 검증은 규칙 문구를 JS 로 재현·텍스트 단언한 것이라,
// 규칙 파일만 바뀌고 재현이 그대로인 변이는 텍스트 단언으로만 잡힌다(실제 Firestore 판정은 배포 후 수동 확인 필요).
console.log("스키마·검증(I13)");
test("autoRef 는 선택 허용 키이고 형식·길이를 지킨 일정은 저장 가능하다", () => {
  assert.ok(US.OPTIONAL_KEYS.includes("autoRef") && US.ALLOWED_KEYS.includes("autoRef") && !US.REQUIRED_KEYS.includes("autoRef"));
  for (const ok of ["VX-DTAP__dose-1", "HC-01__default", "VX-FLU__season-1-dose-1", "OR-04__occ-1"]) assert.ok(US.buildCreateDoc(input({ autoRef: ok }), NOW).ok, ok);
  assert.strictEqual(US.LIMITS.autoRefMax, 80);
});
test("autoRef 없는 일정은 기존과 같다(필드 없음)", () => {
  const r = US.buildCreateDoc(input({ autoRef: undefined }), NOW);
  assert.ok(r.ok && !("autoRef" in r.doc));
});
test("형식 오류·81자·공백·한글·구분자 없음·빈 문자열은 거부(I13)", () => {
  const long = "A".repeat(40) + "__" + "b".repeat(39); // 81자
  assert.strictEqual(long.length, 81);
  for (const bad of ["VX-DTAP", "VX-DTAP_dose-1", "__dose-1", "VX-DTAP__", "VX DTAP__dose-1", "접종__dose-1", "a__b__c", long, 5, ""]) {
    const r = US.buildCreateDoc(input({ autoRef: bad }), NOW);
    assert.ok(!r.ok && r.errors.some((e) => e.field === "autoRef"), JSON.stringify(bad));
  }
  assert.ok(US.buildCreateDoc(input({ autoRef: "A".repeat(39) + "__" + "b".repeat(39) }), NOW).ok, "정확히 80자는 허용");
});
test("scope=FAMILY·childKeys 2개·childKeys 없음·반복 일정이면 거부", () => {
  assert.ok(!US.buildCreateDoc(input({ scope: "FAMILY", childKeys: undefined, category: "FAMILY" }), NOW).ok);
  assert.ok(US.buildCreateDoc(input({ scope: "FAMILY", childKeys: undefined, category: "FAMILY" }), NOW).errors.some((e) => e.code === "I13"));
  assert.ok(US.buildCreateDoc(input({ childKeys: ["c1", "c2"] }), NOW).errors.some((e) => e.code === "I13"));
  const rec = US.buildCreateDoc(input({ eventDate: undefined, recurrence: { freq: "WEEKLY", interval: 1, byDay: ["TU"], startDate: "2026-10-06", until: null } }), NOW);
  assert.ok(!rec.ok && rec.errors.some((e) => e.code === "I13"));
});
test("autoRef 는 기간(PERIOD) 형태에서도 형식 규칙만 적용(날짜 종류 제한 없음 — 규칙과 동일)", () => {
  assert.ok(US.buildCreateDoc(input({ dateKind: "PERIOD", eventDate: undefined, periodStart: "2026-10-01", periodEnd: "2026-10-31" }), NOW).ok);
});

console.log("불변(IMMUTABLE)");
test("autoRef 변경·삭제 패치는 거부, 같은 값을 다시 넣는 패치도 거부(IMMUTABLE)", () => {
  const d = mk();
  for (const v of ["HC-01__default", null, d.autoRef]) { const r = US.buildPatch(d, { autoRef: v }, NOW + 1); assert.ok(!r.ok && r.errors.some((e) => e.code === "IMMUTABLE"), String(v)); }
  assert.ok(US.IMMUTABLE_KEYS.includes("autoRef"));
});
test("수정·완료·소프트 삭제·날짜 이동 패치 뒤에도 autoRef 가 그대로 남는다", () => {
  const { id, ...d } = mk(); // 저장 문서(화면용 id 제외)
  const edit = US.buildPatch(d, { title: "새 제목", memo: "m" }, NOW + 1);
  const done = US.markDone(d, NOW + 2);
  const del = US.softDelete(d, NOW + 3);
  for (const r of [edit, done, del]) { assert.ok(r.ok, JSON.stringify(r.errors)); assert.strictEqual(r.after.autoRef, "VX-DTAP__dose-1"); assert.ok(!("autoRef" in r.patch), "패치에 autoRef 가 들어가지 않는다"); }
});

console.log("expandOccurrences");
test("연결 일정의 회차에 autoRef 가 실리고, 없는 일정의 회차에는 필드 자체가 없다(기존 출력 불변)", () => {
  const linked = US.expandOccurrences(mk(), "2026-10-01", "2026-10-31")[0];
  assert.strictEqual(linked.autoRef, "VX-DTAP__dose-1");
  const plain = US.expandOccurrences(mk({ autoRef: undefined }), "2026-10-01", "2026-10-31")[0];
  assert.ok(!("autoRef" in plain));
  const rec = US.buildCreateDoc(input({ autoRef: undefined, eventDate: undefined, recurrence: { freq: "WEEKLY", interval: 1, byDay: ["TU"], startDate: "2026-10-06", until: null } }), NOW).doc;
  US.expandOccurrences({ ...rec, id: "r" }, "2026-10-01", "2026-10-31").forEach((o) => assert.ok(!("autoRef" in o)));
});

console.log("linksByAutoId");
const link = (over) => mk({ autoRef: "VX-DTAP__dose-1", ...over });
test("아이가 맞는 연결만 모으고, 삭제·취소·다른 아이·autoRef 없음은 제외", () => {
  const a = link({ eventDate: "2026-10-14" });
  const del = { ...link(), deletedAt: 5 };
  const cancelled = { ...link(), status: "CANCELLED" };
  const other = link({ childKeys: ["c2"] });
  const plain = mk({ autoRef: undefined });
  const m = CM.linksByAutoId([a, del, cancelled, other, plain], "c1");
  assert.deepStrictEqual([...m.keys()], ["VX-DTAP__dose-1"]);
  assert.deepStrictEqual(m.get("VX-DTAP__dose-1"), { autoId: "VX-DTAP__dose-1", scheduleId: a.id, date: "2026-10-14", status: "TODO", count: 1 });
});
test("childKey 를 모르면(null/undefined) 빈 Map — 연결을 적용하지 않는다", () => {
  const a = link();
  assert.strictEqual(CM.linksByAutoId([a], null).size, 0);
  assert.strictEqual(CM.linksByAutoId([a], undefined).size, 0);
});
test("childKey 가 없거나 문서의 childKeys 가 [null]·[undefined]·[]·없음이어도 연결 0건 — null 끼리 같다고 보고 연결하지 않는다", () => {
  const raw = (childKeys) => { const d = { ...link(), childKeys }; if (childKeys === undefined) delete d.childKeys; return d; };
  for (const keys of [[null], [undefined], [], undefined]) {
    for (const ck of [null, undefined]) assert.strictEqual(CM.linksByAutoId([raw(keys)], ck).size, 0, `childKeys=${JSON.stringify(keys)} childKey=${ck}`);
    assert.strictEqual(CM.linksByAutoId([raw(keys)], "c1").size, 0, `childKeys=${JSON.stringify(keys)} childKey=c1`);
  }
});
test("RESCHEDULED 상태도 '취소가 아닌 미완료'로 보아 현재 예약 후보가 된다(의도: 일정이 옮겨졌을 뿐 예약은 살아 있다)", () => {
  const moved = { ...link({ eventDate: "2026-10-14" }), status: "RESCHEDULED" };
  const m = CM.linksByAutoId([moved], "c1").get("VX-DTAP__dose-1");
  assert.deepStrictEqual([m.scheduleId, m.status, m.count], [moved.id, "RESCHEDULED", 1]);
  const later = link({ eventDate: "2026-12-01" });
  assert.strictEqual(CM.linksByAutoId([later, moved], "c1").get("VX-DTAP__dose-1").scheduleId, moved.id, "RESCHEDULED 도 미완료로 취급되어 더 이른 쪽이 현재 예약");
});
test("재예약: 미완료 중 날짜가 가장 이른 것이 현재 예약, 전부 완료면 가장 최근 완료, count 는 연결 일정 수(삭제·취소 제외)", () => {
  const late = link({ eventDate: "2026-11-20" }), early = link({ eventDate: "2026-10-14" }), mid = link({ eventDate: "2026-11-02" });
  const m1 = CM.linksByAutoId([late, early, mid], "c1").get("VX-DTAP__dose-1");
  assert.deepStrictEqual([m1.scheduleId, m1.date, m1.count], [early.id, "2026-10-14", 3]);
  const done = (d) => ({ ...d, status: "DONE" });
  const m2 = CM.linksByAutoId([done(early), late, mid], "c1").get("VX-DTAP__dose-1");
  assert.strictEqual(m2.scheduleId, mid.id, "완료된 것보다 미완료 중 이른 것이 우선");
  const m3 = CM.linksByAutoId([done(early), done(late), done(mid)], "c1").get("VX-DTAP__dose-1");
  assert.deepStrictEqual([m3.scheduleId, m3.status], [late.id, "DONE"]);
});
test("같은 날짜면 id 순으로 결정적이고 입력 순서와 무관", () => {
  const a = { ...link({ eventDate: "2026-10-14" }), id: "a1" }, b = { ...link({ eventDate: "2026-10-14" }), id: "b1" };
  assert.strictEqual(CM.linksByAutoId([a, b], "c1").get("VX-DTAP__dose-1").scheduleId, "a1");
  assert.strictEqual(CM.linksByAutoId([b, a], "c1").get("VX-DTAP__dose-1").scheduleId, "a1");
});
test("별칭: 옛 id 로 저장된 연결이 새 id 로 해석된다, 입력 배열·별칭을 바꾸지 않는다", () => {
  const old = link({ autoRef: "VX-OLD__dose-1" });
  const arr = Object.freeze([Object.freeze(old)]);
  const al = Object.freeze({ "VX-OLD__dose-1": "VX-NEW__dose-1" });
  const m = CM.linksByAutoId(arr, "c1", al);
  assert.deepStrictEqual([...m.keys()], ["VX-NEW__dose-1"]);
  assert.strictEqual(CM.linksByAutoId(arr, "c1", {}).has("VX-OLD__dose-1"), true);
});

console.log("추천일 표식 숨김(모델 내부)");
const auto = buildAuto(PROFILES.eunchan);
const before = serialize(auto.events, auto.displayDates);
// 실제 엔진 결과에서 연결 대상(예방접종) 추천일과 그 날짜를 찾는다.
const range = { start: "2026-09-01", end: "2027-03-31" };
const modelFor = (schedules, over = {}) => CM.buildCalendarModel({ view: "month", range, filter: { scope: "ALL", showAuto: true }, auto: { events: auto.events, displayDates: auto.displayDates, completed: {}, childKey: "c1" }, user: { schedules, childLinks: [{ childKey: "c1", displayName: "은찬" }], members: [] }, ...over });
const base0 = modelFor([]);
let target = null;
for (const [day, cell] of base0.days) { const e = cell.planned.find((x) => CM.isLinkableAuto(x)); if (e) { target = { day, id: e.id }; break; } }
test("준비: 골든 프로필에 연결 가능한 추천일 표식이 실제로 있다", () => assert.ok(target, "연결 대상 추천일 없음"));
const refOf = (id) => id;
test("연결 일정이 있으면 그 AUTO 의 추천일 표식만 사라지고 다른 칸·다른 항목·혜택은 그대로", () => {
  const m = modelFor([link({ autoRef: refOf(target.id), eventDate: "2026-10-20" })]);
  for (const [day, cell] of base0.days) {
    const exp = cell.planned.filter((e) => e.id !== target.id).map((e) => e.id);
    assert.deepStrictEqual(m.days.get(day).planned.map((e) => e.id), exp, day);
    assert.deepStrictEqual(m.days.get(day).benefit.map((e) => e.id), cell.benefit.map((e) => e.id), day + " benefit");
  }
  assert.ok(!m.days.get(target.day).planned.some((e) => e.id === target.id));
  assert.ok(m.days.get("2026-10-20").user.some((o) => o.autoRef === target.id), "USER 예약은 그대로 보인다");
});
test("취소·삭제된 연결, 다른 아이의 연결, childKey 없음, 존재하지 않는 AUTO id 는 숨기지 않는다", () => {
  const ids = (m) => m.days.get(target.day).planned.map((e) => e.id);
  const want = ids(base0);
  assert.deepStrictEqual(ids(modelFor([{ ...link({ autoRef: target.id }), status: "CANCELLED" }])), want);
  assert.deepStrictEqual(ids(modelFor([{ ...link({ autoRef: target.id }), deletedAt: 9 }])), want);
  assert.deepStrictEqual(ids(modelFor([link({ autoRef: target.id, childKeys: ["c2"] })])), want);
  const noChild = CM.buildCalendarModel({ view: "month", range, filter: { scope: "ALL", showAuto: true }, auto: { events: auto.events, displayDates: auto.displayDates, completed: {} }, user: { schedules: [link({ autoRef: target.id })], childLinks: [], members: [] } });
  assert.deepStrictEqual(ids(noChild), want);
  assert.deepStrictEqual(ids(modelFor([link({ autoRef: "VX-NOPE__dose-9" })])), want);
});
test("완료된 연결 예약도 추천일 표식을 숨긴다(연결이 살아 있는 동안), 별칭이 새 id 를 가리키면 그 항목을 숨긴다", () => {
  const ids = (m) => m.days.get(target.day).planned.map((e) => e.id);
  assert.ok(!ids(modelFor([{ ...link({ autoRef: target.id }), status: "DONE" }])).includes(target.id));
  const viaAlias = modelFor([link({ autoRef: "VX-OLD__dose-1" })], { auto: { events: auto.events, displayDates: auto.displayDates, completed: {}, childKey: "c1", autoIdAliases: { "VX-OLD__dose-1": target.id } } });
  assert.ok(!ids(viaAlias).includes(target.id));
});
test("숨김은 표시 목록만: 칸 집계(total·marks·counts.planned)가 줄고, AUTO 이벤트·displayDate 는 바이트 동일, 입력은 얼려도 통과", () => {
  const frozen = Object.freeze(auto.events.slice());
  const sch = Object.freeze([Object.freeze(link({ autoRef: target.id, eventDate: "2026-10-20" }))]);
  const m = CM.buildCalendarModel({ view: "month", range, filter: { scope: "ALL", showAuto: true }, auto: { events: frozen, displayDates: auto.displayDates, completed: {}, childKey: "c1" }, user: { schedules: sch, childLinks: [], members: [] } });
  assert.strictEqual(serialize(auto.events, auto.displayDates), before);
  assert.ok(m.counts.planned < base0.counts.planned);
  const c = m.days.get(target.day);
  assert.strictEqual(c.total, c.user.length + c.benefit.length + c.planned.length);
});
test("필터: 가족 보기/AUTO 숨김에서는 숨김 로직과 무관하게 AUTO 칸이 비어 있다", () => {
  const m = modelFor([link({ autoRef: target.id })], { filter: { scope: "ALL", showAuto: false } });
  for (const cell of m.days.values()) assert.deepStrictEqual([cell.benefit.length, cell.planned.length], [0, 0]);
});
test("모델: auto.childKey 가 없는데 문서 childKeys 가 [null]·[undefined] 여도 숨기지 않는다", () => {
  const ids = (m) => m.days.get(target.day).planned.map((e) => e.id);
  const want = ids(base0);
  for (const keys of [[null], [undefined], []]) {
    const doc = { ...link({ autoRef: target.id }), childKeys: keys };
    const m = CM.buildCalendarModel({ view: "month", range, filter: { scope: "ALL", showAuto: true }, auto: { events: auto.events, displayDates: auto.displayDates, completed: {} }, user: { schedules: [doc], childLinks: [], members: [] } });
    assert.deepStrictEqual(ids(m), want, JSON.stringify(keys));
    const m2 = modelFor([doc]); // childKey "c1" 이어도 childKeys 가 비정상이면 숨기지 않는다
    assert.deepStrictEqual(ids(m2), want, "c1 / " + JSON.stringify(keys));
  }
});
test("연결이 없으면 모델 출력이 변경 전과 같다(planned 목록 id 동일)", () => {
  const plainDocs = [mk({ autoRef: undefined })];
  const m = modelFor(plainDocs);
  for (const [day, cell] of base0.days) assert.deepStrictEqual(m.days.get(day).planned.map((e) => e.id), cell.planned.map((e) => e.id));
});

console.log("isLinkableAuto");
test("VX·HC 정의와 OR-03·OR-04 만 연결 대상, 지원금·발달·생활·OR-01/02/05/06 은 아니다", () => {
  const e = (todo_id, category) => ({ detail: { definition: { todo_id, category } } });
  [["VX-DTAP", "VX"], ["HC-03", "HC"], ["OR-03", "OR"], ["OR-04", "OR"]].forEach(([i, c]) => assert.ok(CM.isLinkableAuto(e(i, c)), i));
  [["OR-01", "OR"], ["OR-02", "OR"], ["OR-05", "OR"], ["OR-06", "OR"], ["DV-01", "DV"], ["FD-01", "FD"], ["SB-01", "SB"], ["SF-08", "SF"]].forEach(([i, c]) => assert.ok(!CM.isLinkableAuto(e(i, c)), i));
  [null, undefined, {}, { detail: {} }, { detail: { definition: {} } }].forEach((x) => assert.strictEqual(CM.isLinkableAuto(x), false));
});

console.log("연결 대상 id 안정성 스냅샷");
// 스냅샷 fixture(test/fixtures/linkable-auto-ids.json)는 현재 45개다. VX-RSV__default 는 데이터(vaccination.json)가 아직 커밋 전(작업본 전용)이라 제외했고,
// 커밋되면 fixture 에 추가한다(없어도 이 테스트는 '있던 id 가 사라졌는가'만 보므로 통과한다).
test("스냅샷은 42개이고 VX-RSV__default 는 (데이터 미커밋이라) 아직 포함하지 않는다", () => {
  const ids = JSON.parse(fs.readFileSync(path.join(ROOT, "test/fixtures/linkable-auto-ids.json"), "utf8")).ids;
  assert.strictEqual(ids.length, 42);
  assert.ok(!ids.some((i) => /^HC-0[789]__/.test(i)), "36개월 이상 전용 검진(6~8차)은 없다");
  assert.ok(!ids.includes("VX-RSV__default"));
});
test("스냅샷의 모든 id 가 지금도 엔진 결과(0~72개월 합집합)에 있다 — 사라지면 별칭(data/auto-id-aliases.json) 추가 또는 승인 후 갱신", () => {
  const rd = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), "utf8"));
  const defs = ["health-checkup", "vaccination", "oral"].flatMap((f) => rd(`data/todos/${f}.json`).todos);
  const now = new Set();
  const birth = new Date(2020, 0, 15);
  for (let m = 0; m <= 72; m++) {
    const inst = global.TodoEngine.calculateTodoInstances({ today: new Date(2020, m, 15), child: { birthDate: birth, gender: "M" }, region: { province: "서울특별시", district: "구로구" }, familyDeclaredAttributes: {}, completions: [], todoDefinitions: defs });
    for (const i of inst) { const d = defs.find((x) => x.todo_id === i.todo_id); if (CM.isLinkableAuto({ detail: { definition: d } })) now.add(`${i.todo_id}__${i.occurrenceKey}`); }
  }
  const snap = rd("test/fixtures/linkable-auto-ids.json").ids;
  assert.ok(snap.length >= 40);
  const missing = snap.filter((id) => !now.has(id));
  assert.deepStrictEqual(missing, [], "사라진 연결 대상 id: " + missing.join(", "));
  snap.forEach((id) => assert.ok(US.isAutoRef(id), id + " 는 autoRef 형식·길이를 지킨다"));
});

console.log("골든 가족 문서 T1(읽기만)");
test("얼린 가족 문서(families 골든)를 넣고 연결 색인·모델을 돌려도 문서가 바이트 동일하고 completed·records 를 쓰는 코드가 모델에 없다", () => {
  const fam = JSON.parse(fs.readFileSync(path.join(ROOT, "test/fixtures/family-doc.json"), "utf8"));
  const raw = JSON.stringify(fam);
  const deepFreeze = (o) => (Object.values(o).forEach((v) => v && typeof v === "object" && deepFreeze(v)), Object.freeze(o));
  deepFreeze(fam);
  const completed = fam.completed || {};
  const m = CM.buildCalendarModel({ view: "month", range, filter: { scope: "ALL", showAuto: true }, auto: { events: auto.events, displayDates: auto.displayDates, completed, childKey: "c1" }, user: { schedules: [link({ autoRef: target.id })], childLinks: [], members: [] } });
  CM.linksByAutoId([link()], "c1");
  assert.strictEqual(JSON.stringify(fam), raw);
  assert.ok(m.days.size > 0);
  const src = fs.readFileSync(path.join(ROOT, "js/calendar-model.js"), "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
  ["completed[", "updateCompleted", "FamilySync", "saveCompleted", "records"].forEach((w) => assert.ok(!src.includes(w), w));
});

console.log(`\n${passed}개 통과${process.exitCode ? ", 일부 실패" : ""}`);
