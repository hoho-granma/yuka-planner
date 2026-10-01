/*
 * js/user-schedule-view.js 순수 함수 테스트 — 승인 문구(#1~#59, #39·#42·#55 수정 반영)·색 파생·필터·표시 데이터·폼 변환·마크업 이스케이프.
 * UserSchedule(B2)·CalendarModel(B2)·HouseholdView(B3) 의 실제 출력으로 검증한다. 실행: node test/user-schedule-view.logic.test.js
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const V = require("../js/user-schedule-view.js");
const US = require("../js/user-schedule.js");
const CM = require("../js/calendar-model.js");
const HV = require("../js/household-view.js");

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ok  - ${name}`);
  } catch (e) {
    console.error(`FAIL - ${name}\n       ${e.stack || e.message}`);
    process.exitCode = 1;
  }
}
const M = V.MSG;
const deepFreeze = (o) => (Object.values(o).forEach((v) => v && typeof v === "object" && deepFreeze(v)), Object.freeze(o));
const LINKS = [
  { childKey: "c2", familyCode: "BBB222", displayName: "둘째", order: 2, addedAt: 2 },
  { childKey: "c1", familyCode: "AAA111", displayName: "은찬이", order: 1, addedAt: 1 },
  { childKey: "c3", familyCode: "CCC333", displayName: "셋째", order: 3, addedAt: 3 },
  { childKey: "c4", familyCode: "DDD444", displayName: "넷째", order: 4, addedAt: 4 },
  { childKey: "c5", familyCode: "EEE555", displayName: "다섯째", order: 5, addedAt: 5 },
  { childKey: "cx", familyCode: "XXX999", displayName: "분리됨", order: 6, addedAt: 6, removedAt: 9 },
];
const NOW = 1790000000000;
let n = 0;
const sched = (over) => {
  const input = { sourceType: "MANUAL", title: "수업", category: "LESSON", scope: "CHILD", childKeys: ["c1"], allDay: false, startTime: "16:00", endTime: "16:50", dateKind: "FIXED", eventDate: "2026-10-06", ...over };
  Object.keys(input).forEach((k) => input[k] === undefined && delete input[k]);
  const r = US.buildCreateDoc(input, NOW);
  assert(r.ok, JSON.stringify(r.errors));
  return { ...r.doc, id: "s" + ++n };
};
const model = (schedules, filter) =>
  CM.buildCalendarModel({ view: "month", range: { start: "2026-10-01", end: "2026-10-31" }, filter: filter || { scope: "ALL", showAuto: false }, auto: { events: [], displayDates: new Map(), completed: {} }, user: { schedules, childLinks: LINKS, members: [] } });

console.log("승인 문구");
test("#1~#59 주요 문구가 승인본과 같다(#39·#42·#55 는 수정본)", () => {
  assert.strictEqual(M.addButton, "＋ 일정 추가");
  assert.strictEqual(M.needHousehold, '일정을 추가하려면 프로필의 "가족 캘린더"를 먼저 만들어 주세요.');
  assert.strictEqual(M.monthSummary(3, 1), "이번 달 추가 일정 3개 (완료 1)");
  assert.strictEqual(M.monthEmpty, "이번 달에 추가한 일정이 없어요.");
  assert.deepStrictEqual([M.groupAdded, M.groupBenefit, M.groupPlanned], ["추가한 일정", "혜택 신청 시작", "추천 항목 (정해진 날이 아니에요)"]);
  assert.strictEqual(M.dayEmpty, "이 날 추가한 일정이 없어요.");
  assert.deepStrictEqual([M.periodTitle, M.periodNote, M.periodRow("10/1~10/31")], ["이번 달 기간 일정", "날짜는 아직 정해지지 않았어요.", "날짜 미정 · 10/1~10/31"]);
  assert.strictEqual(M.legend, "막대는 추가한 일정 · 원은 혜택과 추천 항목");
  assert.deepStrictEqual([M.filterAll, M.filterFamily, M.toggleAuto], ["전체", "가족", "자동 일정 함께 보기"]);
  assert.strictEqual(M.recurringSkipped, "반복 일정은 아직 표시되지 않아요.");
  assert.deepStrictEqual([M.sheetAdd, M.sheetEdit], ["일정 추가", "일정 수정"]);
  assert.deepStrictEqual([M.kindFixed, M.kindPeriod, M.multiDay, M.allDay], ["날짜 정함", "날짜 미정 (기간)", "여러 날에 걸쳐요", "종일"]);
  assert.strictEqual(M.periodHint, '정해지지 않은 일정은 달력 칸에는 찍히지 않고 "이번 달 기간 일정"에 모여요.');
  assert.deepStrictEqual([M.locationLabel, M.locationHint, M.memoLabel, M.memoHint], ["장소 (선택)", "예: 구로 음악학원", "메모 (선택)", "준비물이나 참고할 점"]);
  assert.deepStrictEqual([M.save, M.cancel, M.saving], ["저장", "취소", "저장하는 중이에요…"]);
  assert.strictEqual(M.saveFail, "저장하지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.");
  assert.strictEqual(M.cardFamily, "가족 일정");
  assert.deepStrictEqual([M.btnDone, M.btnUndone, M.btnEdit, M.btnDelete, M.btnClose, M.done], ["완료했어요", "완료 취소", "수정", "삭제", "닫기", "완료"]);
  assert.strictEqual(M.deleteTitle, "이 일정을 삭제할까요?");
  assert.strictEqual(M.actionFail, "처리하지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.");
});
test("승인 수정본: #39 대상 오류 · #42 기간 순서 · #55 삭제 안내", () => {
  assert.strictEqual(M.errTarget, '대상을 골라 주세요. 가족 모두와 관련된 일정은 "가족 전체"를 눌러 주세요.');
  assert.strictEqual(M.errPeriodOrder, "기간의 시작은 끝보다 같거나 앞서야 해요.");
  assert.strictEqual(M.deleteBody, "삭제하면 가족 모두의 캘린더에서 사라져요. 지금은 복구할 수 없어요.");
  assert(!M.errTarget.includes("모두에게 해당하면") && M.errPeriodOrder.includes("같거나"));
  assert(!M.deleteBody.includes("되돌릴 수 없어요"));
});
test("입력 오류 문구 #36~#46", () => {
  assert.deepStrictEqual([M.errTitleEmpty, M.errTitleLong, M.errCategory, M.errDate, M.errEndBeforeStart], ["제목을 입력해 주세요.", "제목은 100자까지 쓸 수 있어요.", "분류를 골라 주세요.", "날짜를 골라 주세요.", "마지막 날은 시작하는 날과 같거나 이후여야 해요."]);
  assert.deepStrictEqual([M.errStartTime, M.errEndTime, M.errLength, M.errGeneric], ['시작 시각을 골라 주세요. 하루 종일이면 "종일"을 눌러 주세요.', "종료 시각은 시작 시각보다 늦어야 해요.", "메모는 500자, 장소는 100자까지 쓸 수 있어요.", "입력한 내용을 다시 확인해 주세요."]);
});
test("분류 5종 라벨 #20", () => {
  assert.deepStrictEqual(V.CATEGORIES.map((c) => [c.key, c.label]), [["LESSON", "수업·학원"], ["INSTITUTION", "어린이집·학교"], ["MEDICAL", "병원·검진"], ["FAMILY", "가족"], ["ETC", "기타"]]);
  assert.strictEqual(V.categoryLabel("MEDICAL"), "병원·검진");
});
test("#58·#59 오프라인 대기·쓰기 거부 문구는 B3 HouseholdView 것을 그대로 쓴다", () => {
  assert.strictEqual(HV.MSG.pending(2), "이 기기에만 저장됨 · 인터넷이 연결되면 자동으로 올라가요. (2건 대기)");
  assert.strictEqual(HV.MSG.denied, "지금은 서버에 저장할 수 없어요. 이 기기에만 저장돼 있어요.");
  assert(!("pending" in M) && !("denied" in M), "중복 정의하지 않는다");
});
test('"내 일정"·"개인" 표현이 문구·마크업 어디에도 없다', () => {
  const texts = JSON.stringify(Object.values(M).map((v) => (typeof v === "function" ? v(1, 1) : v)));
  const f = V.newForm({ date: "2026-10-06", activeChildKey: "c1", links: LINKS });
  const html = [V.renderForm(f, LINKS), V.renderAddButton({ enabled: true, hasHousehold: true }), V.renderAddButton({ enabled: true, hasHousehold: false }), V.renderDeleteConfirm(), V.renderFilterChips(V.filterChips(LINKS, "ALL"), true)].join("");
  [texts, html].forEach((t) => assert(!/내 일정|개인/.test(t)));
  const src = fs.readFileSync(path.join(__dirname, "..", "js", "user-schedule-view.js"), "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
  assert(!/내 일정|개인|PERSONAL/.test(src), "코드(주석 제외)에도 없다");
});

console.log("\n아이색(order 파생)");
test("order 1~4 → 코랄·틸·핑크·브라운, 5 이상은 넷째 색(브라운)", () => {
  const c = V.childColors(LINKS);
  assert.deepStrictEqual([c.c1, c.c2, c.c3, c.c4, c.c5], ["#ff7a59", "#14b8a6", "#ec4899", "#a16207", "#a16207"]);
});
test("링크 배열 순서와 무관하고, 분리된 아이도 자기 색을 유지한다", () => {
  const rev = [...LINKS].reverse();
  assert.deepStrictEqual(V.childColors(rev), V.childColors(LINKS));
  assert.strictEqual(V.childColors(LINKS).cx, "#a16207");
});
test("order 가 없는 링크는 목록 순서로 색을 준다", () => {
  const c = V.childColors([{ childKey: "a" }, { childKey: "b" }]);
  assert.deepStrictEqual([c.a, c.b], ["#ff7a59", "#14b8a6"]);
});
test("일정 막대 색: 가족 일정=가족색, 아이 일정=그 아이색, 공동 일정=order 가 앞선 아이색", () => {
  assert.strictEqual(V.occurrenceColor({ scope: "FAMILY", childKeys: [] }, LINKS), V.FAMILY_COLOR);
  assert.strictEqual(V.occurrenceColor({ scope: "CHILD", childKeys: ["c2"] }, LINKS), "#14b8a6");
  assert.strictEqual(V.occurrenceColor({ scope: "CHILD", childKeys: ["c3", "c2"] }, LINKS), "#14b8a6");
  assert.strictEqual(V.occurrenceColor({ scope: "CHILD", childKeys: ["unknown"] }, LINKS), V.FAMILY_COLOR, "알 수 없는 아이는 중립색");
});
test("자동 일정 색 6가지와 겹치지 않는다(파랑·보라·초록·노랑·빨강·슬레이트)", () => {
  const auto = ["#22c55e", "#3b82f6", "#a855f7", "#eab308", "#ef4444", "#475569"];
  [...V.CHILD_PALETTE, V.FAMILY_COLOR].forEach((c) => assert(!auto.includes(c), c));
});

console.log("\n필터 로직");
test("칩: 전체 · 아이들(order 순, 분리된 아이 제외) · 가족, 선택 상태", () => {
  const chips = V.filterChips(LINKS, "CHILD:c2");
  assert.deepStrictEqual(chips.map((c) => c.id), ["ALL", "CHILD:c1", "CHILD:c2", "CHILD:c3", "CHILD:c4", "CHILD:c5", "FAMILY"]);
  assert.deepStrictEqual(chips.filter((c) => c.selected).map((c) => c.id), ["CHILD:c2"]);
  assert.strictEqual(chips[0].label, "전체");
  assert.strictEqual(chips.at(-1).label, "가족");
});
test("정규화: 분리된 아이·모르는 값은 전체로", () => {
  ["CHILD:cx", "CHILD:none", "", null, undefined, "weird"].forEach((s) => assert.strictEqual(V.normalizeSelection(s, LINKS), "ALL", String(s)));
  assert.strictEqual(V.normalizeSelection("FAMILY", LINKS), "FAMILY");
  assert.strictEqual(V.normalizeSelection("CHILD:c1", LINKS), "CHILD:c1");
});
test("toModelFilter: 선택 → CalendarModel 필터(scope·childKey·showAuto)", () => {
  assert.deepStrictEqual(V.toModelFilter("ALL", true, LINKS), { scope: "ALL", showAuto: true });
  assert.deepStrictEqual(V.toModelFilter("FAMILY", false, LINKS), { scope: "FAMILY", showAuto: false });
  assert.deepStrictEqual(V.toModelFilter("CHILD:c2", true, LINKS), { scope: "CHILD", childKey: "c2", showAuto: true });
  assert.deepStrictEqual(V.toModelFilter("CHILD:cx", undefined, LINKS), { scope: "ALL", showAuto: true }, "분리된 아이 선택은 전체로, showAuto 기본 true");
});
test("실제 CalendarModel 과 연결: 전체/아이별/가족 필터 결과", () => {
  const docs = [sched({ title: "첫째만", childKeys: ["c1"] }), sched({ title: "둘째만", childKeys: ["c2"] }), sched({ title: "형제공동", childKeys: ["c1", "c2"] }), sched({ title: "가족행사", scope: "FAMILY", childKeys: undefined, category: "FAMILY" })];
  const titles = (sel) => model(docs, V.toModelFilter(sel, false, LINKS)).days.get("2026-10-06").user.map((o) => o.title).sort();
  assert.deepStrictEqual(titles("ALL"), ["가족행사", "둘째만", "첫째만", "형제공동"]);
  assert.deepStrictEqual(titles("CHILD:c2"), ["둘째만", "형제공동"]);
  assert.deepStrictEqual(titles("FAMILY"), ["가족행사"]);
});
test("필터 칩 마크업: 선택 표시·토글 aria-pressed·아이 이름 이스케이프", () => {
  const evilLinks = [{ childKey: "c1", displayName: '<img src=x onerror="alert(1)">', order: 1 }];
  const html = V.renderFilterChips(V.filterChips(evilLinks, "ALL"), false);
  assert(!html.includes("<img") && html.includes("&lt;img"));
  assert(html.includes('data-us-filter="ALL"') && html.includes("us-chip active"));
  assert(html.includes('data-us-action="toggle-auto"') && html.includes('aria-pressed="false"'));
  assert(V.renderFilterChips(V.filterChips(LINKS, "ALL"), true).includes('aria-pressed="true"'));
});

console.log("\n표시 데이터 변환(완료·삭제 포함)");
const occOf = (doc, links) => model([doc]).days.get(doc.eventDate || "2026-10-06").user[0];
test("카드 데이터: 분류 라벨·시각·태그·색·미완료", () => {
  const c = V.cardData(occOf(sched({ title: "피아노", category: "LESSON" })), LINKS);
  assert.deepStrictEqual({ title: c.title, label: c.categoryLabel, time: c.timeText, date: c.dateText, tag: c.tag, color: c.color, done: c.done, doneLabel: c.doneLabel }, { title: "피아노", label: "수업·학원", time: "16:00 ~ 16:50", date: "", tag: "은찬이", color: "#ff7a59", done: false, doneLabel: "" });
});
test("시각 표기: 종일 / 시작~종료 / 시작만(…부터)", () => {
  const T = (over) => V.cardData(occOf(sched(over)), LINKS).timeText;
  assert.strictEqual(T({ allDay: true, startTime: undefined, endTime: undefined }), "종일");
  assert.strictEqual(T({ endTime: undefined }), "16:00부터");
  assert.strictEqual(T({}), "16:00 ~ 16:50");
});
test("연속 일정 표기 '10/16 ~ 10/17', 단일 일정은 날짜 표기 없음", () => {
  const d = sched({ eventDate: "2026-10-16", endDate: "2026-10-17", allDay: true, startTime: undefined, endTime: undefined });
  assert.strictEqual(V.cardData(model([d]).days.get("2026-10-16").user[0], LINKS).dateText, "10/16 ~ 10/17");
  assert.strictEqual(V.cardData(occOf(sched({})), LINKS).dateText, "");
});
test("가족 일정 태그 '가족 일정', 공동 일정 '은찬이 · 둘째', 분리된 아이 '(분리된 아이)'", () => {
  assert.strictEqual(V.cardData(occOf(sched({ scope: "FAMILY", childKeys: undefined, category: "FAMILY" })), LINKS).tag, "가족 일정");
  assert.strictEqual(V.cardData(occOf(sched({ childKeys: ["c1", "c2"] })), LINKS).tag, "은찬이 · 둘째");
  assert.strictEqual(V.cardData(occOf(sched({ childKeys: ["cx"] })), LINKS).tag, "(분리된 아이)");
});
test("완료 표시: status=DONE → done·'완료' 라벨, 아직이면 없음 — 모델 counts 와 일치", () => {
  const d = sched({ title: "끝남" });
  const done = { ...d, status: "DONE" };
  const m = model([done, sched({ title: "미완" })]);
  const cards = m.days.get("2026-10-06").user.map((o) => V.cardData(o, LINKS));
  assert.deepStrictEqual(cards.map((c) => [c.title, c.done, c.doneLabel]).sort(), [["끝남", true, "완료"], ["미완", false, ""]]);
  assert.strictEqual(V.monthSummary(m.counts), "이번 달 추가 일정 2개 (완료 1)");
});
test("삭제 표시: 소프트 삭제(deletedAt)된 일정은 카드·개수·기간 목록에서 모두 사라진다(데이터는 유지)", () => {
  const d = sched({ title: "지울것" });
  const deleted = { ...d, deletedAt: NOW + 5 };
  const p = sched({ title: "기간", dateKind: "PERIOD", eventDate: undefined, allDay: true, startTime: undefined, endTime: undefined, periodStart: "2026-10-01", periodEnd: "2026-10-31" });
  const m = model([deleted, { ...p, deletedAt: NOW + 6 }]);
  assert.strictEqual(m.days.get("2026-10-06").user.length, 0);
  assert.strictEqual(V.monthSummary(m.counts), "이번 달에 추가한 일정이 없어요.");
  assert.strictEqual(V.periodSection(m.periodList, LINKS).empty, true);
  assert.strictEqual(deleted.title, "지울것");
});
test("개수 줄: 0개면 #4, 아니면 #3(퍼센트 없음)", () => {
  assert.strictEqual(V.monthSummary({ userItems: 0, userDone: 0 }), "이번 달에 추가한 일정이 없어요.");
  assert.strictEqual(V.monthSummary({ userItems: 5, userDone: 2 }), "이번 달 추가 일정 5개 (완료 2)");
  assert(!V.monthSummary({ userItems: 5, userDone: 2 }).includes("%"));
  assert.strictEqual(V.monthSummary(undefined), "이번 달에 추가한 일정이 없어요.");
});
test("날짜 칸 표식: 추가한 일정=막대(아이색), 혜택·추천=원, 완료 표시, +N", () => {
  const docs = ["a", "b", "c", "d"].map((t, i) => ({ ...sched({ title: t, childKeys: [i === 1 ? "c2" : "c1"] }), ...(i === 2 ? { status: "DONE" } : {}) }));
  const day = model(docs).days.get("2026-10-06");
  const cm = V.cellMarks(day, LINKS);
  assert.strictEqual(cm.marks.length, 3);
  assert(cm.marks.every((m) => m.kind === "user" && m.shape === "bar"));
  assert.strictEqual(cm.more, 1);
  assert.strictEqual(cm.total, 4);
  assert(cm.marks.some((m) => m.done) || docs.length === 4);
  const fakeAuto = V.cellMarks({ marks: [{ kind: "benefit", ref: { id: "B1" } }, { kind: "planned", ref: { id: "P1" } }], more: 0, total: 2 }, LINKS);
  assert.deepStrictEqual(fakeAuto.marks.map((m) => [m.kind, m.shape]), [["benefit", "dot"], ["planned", "dot"]]);
});
test("선택일 패널: 추가한 일정 카드 + 혜택·추천 구역은 제목과 개수만, 빈 상태 문구", () => {
  const day = model([sched({})]).days.get("2026-10-06");
  const p = V.dayPanel({ ...day, benefit: [1, 2], planned: [3] }, LINKS);
  assert.deepStrictEqual([p.added.title, p.benefit.title, p.planned.title], ["추가한 일정", "혜택 신청 시작", "추천 항목 (정해진 날이 아니에요)"]);
  assert.strictEqual(p.added.cards.length, 1);
  assert.deepStrictEqual([p.benefit.count, p.planned.count, p.emptyAdded], [2, 1, false]);
  const e = V.dayPanel({ user: [], benefit: [], planned: [] }, LINKS);
  assert.deepStrictEqual([e.emptyAdded, e.emptyText], [true, "이 날 추가한 일정이 없어요."]);
});
test("이번 달 기간 일정: 날짜 미정 · 10/1~10/31, 정렬은 모델 그대로", () => {
  const p = sched({ title: "부모 상담", dateKind: "PERIOD", eventDate: undefined, allDay: true, startTime: undefined, endTime: undefined, periodStart: "2026-10-01", periodEnd: "2026-10-31" });
  const sec = V.periodSection(model([p]).periodList, LINKS);
  assert.deepStrictEqual([sec.title, sec.note, sec.empty], ["이번 달 기간 일정", "날짜는 아직 정해지지 않았어요.", false]);
  assert.strictEqual(sec.rows[0].dateText, "날짜 미정 · 10/1~10/31");
  assert.strictEqual(sec.rows[0].timeText, "");
  assert(V.renderPeriodSection(sec).includes("부모 상담"));
  assert.strictEqual(V.renderPeriodSection(V.periodSection([], LINKS)), "");
});
test("반복 일정 건너뜀 안내", () => {
  const rec = sched({ eventDate: undefined, recurrence: { freq: "WEEKLY", interval: 1, byDay: ["TU"], startDate: "2026-10-06", until: null } });
  assert.strictEqual(V.skippedNote(model([rec]).skipped), "반복 일정은 아직 표시되지 않아요.");
  assert.strictEqual(V.skippedNote([]), "");
});
test("입력 객체를 변경하지 않는다(deep freeze 한 모델·링크)", () => {
  const m = model([sched({})]);
  const links = deepFreeze(JSON.parse(JSON.stringify(LINKS)));
  const frozenModel = deepFreeze({ days: [...m.days.values()], periodList: m.periodList, counts: m.counts, skipped: m.skipped });
  V.cardData(frozenModel.days[5].user[0] || { title: "x", dateKind: "FIXED", date: "2026-10-06", badges: [] }, links);
  V.cellMarks(frozenModel.days[5], links);
  V.dayPanel(frozenModel.days[5], links);
  V.filterChips(links, "ALL");
  V.childColors(links);
  V.monthSummary(frozenModel.counts);
});

console.log("\n마크업·이스케이프");
const EVIL = '<img src=x onerror="alert(1)">&"\'';
test("카드: 제목·태그·분류·ID·키의 HTML 은 실행되지 않는다", () => {
  const html = V.renderCard({ key: EVIL, scheduleId: EVIL, title: EVIL, categoryLabel: EVIL, timeText: EVIL, dateText: EVIL, tag: EVIL, color: "#ff7a59", done: true, doneLabel: "완료" });
  assert(!html.includes("<img"), html);
  assert(html.includes("&lt;img") && html.includes("&quot;"));
});
test("카드: 팔레트에 없는 색(스타일 주입 시도)은 중립색으로 바뀐다", () => {
  const html = V.renderCard({ key: "k", scheduleId: "s", title: "t", categoryLabel: "", timeText: "", dateText: "", tag: "", color: 'red;background:url(javascript:alert(1))', done: false });
  assert(!html.includes("javascript:") && html.includes("--us-color:#6b5b53"));
});
test("카드: 완료면 done 클래스와 '완료' 표시, 미완료면 없음", () => {
  const base = { key: "k", scheduleId: "s", title: "t", categoryLabel: "수업·학원", timeText: "종일", dateText: "", tag: "가족 일정", color: "#6b5b53" };
  const d = V.renderCard({ ...base, done: true, doneLabel: "완료" });
  const u = V.renderCard({ ...base, done: false, doneLabel: "" });
  assert(d.includes("us-card done") && d.includes('<span class="us-done">완료</span>'));
  assert(!u.includes("done") && !u.includes("us-done"));
  assert(u.includes("수업·학원 · 종일") && u.includes("가족 일정"));
});
test("추가 버튼: 플래그 OFF → '', 가구 없음 → 안내만, 가구 있음 → 버튼", () => {
  assert.strictEqual(V.renderAddButton({ enabled: false, hasHousehold: true }), "");
  assert.strictEqual(V.renderAddButton(null), "");
  assert.strictEqual(V.renderAddButton({ enabled: "true", hasHousehold: true }), "");
  const none = V.renderAddButton({ enabled: true, hasHousehold: false });
  assert(none.includes(V.esc(M.needHousehold)) && !none.includes("<button"), "따옴표는 이스케이프되어 들어간다");
  const on = V.renderAddButton({ enabled: true, hasHousehold: true });
  assert(on.includes('data-us-action="add"') && on.includes("＋ 일정 추가"));
});
test("상세: 미완료는 '완료했어요', 완료는 '완료 취소', 수정·삭제·닫기, 본문 이스케이프", () => {
  const c = { key: "k", scheduleId: "s", title: EVIL, categoryLabel: "병원·검진", timeText: "종일", dateText: "", tag: "은찬이", color: "#ff7a59", done: false, location: EVIL, memo: EVIL };
  const html = V.renderDetail(c);
  assert(!html.includes("<img") && html.includes("&lt;img"));
  assert(html.includes(">완료했어요<") && !html.includes("완료 취소"));
  ["toggle-done", "edit", "delete", "close"].forEach((a) => assert(html.includes(`data-us-action="${a}"`), a));
  const done = V.renderDetail({ ...c, done: true });
  assert(done.includes(">완료 취소<") && !done.includes(">완료했어요<") && done.includes('<span class="us-done">완료</span>'));
  assert.deepStrictEqual(V.detailView({ ...c, done: false }).actions.map((a) => a.id), ["toggle-done", "edit", "delete", "close"]);
});
test("삭제 확인: 승인 문구(#54~#56)와 버튼", () => {
  const h = V.renderDeleteConfirm();
  assert(h.includes("이 일정을 삭제할까요?") && h.includes("삭제하면 가족 모두의 캘린더에서 사라져요. 지금은 복구할 수 없어요."));
  assert(h.includes('data-us-action="confirm-delete"') && h.includes('data-us-action="cancel-delete"') && h.includes(">삭제<") && h.includes(">취소<"));
});

console.log("\n입력 폼");
const F = (o) => ({ ...V.newForm({ date: "2026-10-06", activeChildKey: "c1", links: LINKS }), ...o });
test("새 폼 기본값: 선택한 날짜·종일·날짜 정함, 대상=지금 보는 아이(링크돼 있으면) 아니면 가족 전체", () => {
  const f = V.newForm({ date: "2026-10-06", activeChildKey: "c2", links: LINKS });
  assert.deepStrictEqual([f.mode, f.eventDate, f.dateKind, f.allDay, f.scope, f.childKeys, f.category], ["create", "2026-10-06", "FIXED", true, "CHILD", ["c2"], ""]);
  [undefined, "unlinked", "cx"].forEach((k) => {
    const g = V.newForm({ date: "2026-10-06", activeChildKey: k, links: LINKS });
    assert.deepStrictEqual([g.scope, g.childKeys], ["FAMILY", []], String(k));
  });
});
test("검증 문구 #36~#45: 각 입력 오류가 승인된 문구로 나온다", () => {
  const msg = (o) => V.validateForm(F({ category: "LESSON", ...o })).errors.map((e) => e.message);
  assert.deepStrictEqual(msg({ title: "  " }), [M.errTitleEmpty]);
  assert.deepStrictEqual(msg({ title: "가".repeat(101) }), [M.errTitleLong]);
  assert.deepStrictEqual(V.validateForm(F({ title: "x" })).errors.map((e) => e.message), [M.errCategory]);
  assert.deepStrictEqual(msg({ title: "x", scope: "CHILD", childKeys: [] }), [M.errTarget]);
  assert.deepStrictEqual(msg({ title: "x", eventDate: "" }), [M.errDate]);
  assert.deepStrictEqual(msg({ title: "x", multiDay: true, endDate: "2026-10-01" }), [M.errEndBeforeStart]);
  assert.deepStrictEqual(msg({ title: "x", dateKind: "PERIOD", periodStart: "", periodEnd: "2026-10-31" }), [M.errDate]);
  assert.deepStrictEqual(msg({ title: "x", dateKind: "PERIOD", periodStart: "2026-11-01", periodEnd: "2026-10-31" }), [M.errPeriodOrder]);
  assert.deepStrictEqual(msg({ title: "x", allDay: false, startTime: "" }), [M.errStartTime]);
  assert.deepStrictEqual(msg({ title: "x", allDay: false, startTime: "16:00", endTime: "15:00" }), [M.errEndTime]);
  assert.deepStrictEqual(msg({ title: "x", memo: "a".repeat(501) }), [M.errLength]);
  assert.deepStrictEqual(msg({ title: "x", location: "a".repeat(101) }), [M.errLength]);
});
test("경계값: 제목 100자·메모 500자·장소 100자·기간 시작=끝·마지막 날=시작일은 통과(#42 '같거나')", () => {
  const ok = (o) => V.validateForm(F({ category: "LESSON", title: "x", ...o })).ok;
  assert(ok({ title: "가".repeat(100) }) && ok({ memo: "a".repeat(500) }) && ok({ location: "a".repeat(100) }));
  assert(ok({ dateKind: "PERIOD", periodStart: "2026-10-05", periodEnd: "2026-10-05" }));
  assert(ok({ multiDay: true, endDate: "2026-10-06" }));
  assert(!ok({ allDay: false, startTime: "16:00", endTime: "16:00" }), "종료=시작은 불가(#44)");
});
test("여러 오류가 한꺼번에 나오고 순서가 안정적이다", () => {
  const r = V.validateForm(F({ title: "", category: "", scope: "CHILD", childKeys: [], eventDate: "" }));
  assert.deepStrictEqual(r.errors.map((e) => e.field), ["title", "category", "target", "date"]);
});
test("formToInput → UserSchedule.buildCreateDoc 통과(날짜 정함/종일, 시각, 연속, 기간 미정, 가족)", () => {
  const cases = [
    F({ title: "  피아노  ", category: "LESSON", allDay: false, startTime: "16:00", endTime: "16:50", location: "음악학원", memo: "악보" }),
    F({ title: "캠프", category: "FAMILY", multiDay: true, endDate: "2026-10-08" }),
    F({ title: "상담", category: "INSTITUTION", dateKind: "PERIOD", periodStart: "2026-10-01", periodEnd: "2026-10-31" }),
    F({ title: "외식", category: "FAMILY", scope: "FAMILY", childKeys: [] }),
  ];
  cases.forEach((f) => {
    const r = US.buildCreateDoc(V.formToInput(f), NOW);
    assert(r.ok, JSON.stringify(r.errors));
    assert.strictEqual(r.doc.sourceType, "MANUAL");
  });
  const i0 = V.formToInput(cases[0]);
  assert.strictEqual(i0.title, "피아노");
  assert.deepStrictEqual([i0.location, i0.memo, i0.endTime], ["음악학원", "악보", "16:50"]);
  assert(!("endDate" in V.formToInput(F({ title: "x", category: "ETC", multiDay: false, endDate: "2026-10-09" }))), "여러 날 해제 시 endDate 제외");
  assert(!("startTime" in V.formToInput(F({ title: "x", category: "ETC", allDay: true, startTime: "09:00" }))), "종일이면 시각 제외");
  assert(!("childKeys" in V.formToInput(cases[3])), "가족 일정은 childKeys 없음");
  assert(!("displayDate" in i0));
});
test("prepareSave: 화면 검증 → 문서 불변식 순서, 성공 시 입력 반환", () => {
  const bad = V.prepareSave(F({ title: "", category: "LESSON" }), NOW);
  assert.deepStrictEqual([bad.ok, bad.messages], [false, [M.errTitleEmpty]]);
  const good = V.prepareSave(F({ title: "피아노", category: "LESSON" }), NOW);
  assert.strictEqual(good.ok, true);
  assert.strictEqual(good.input.title, "피아노");
});
test("messagesFromErrors: UserSchedule 의 실제 오류를 승인 문구로 바꾼다(중복 제거, 모르면 #46)", () => {
  const e = (doc) => V.messagesFromErrors(US.validate(doc).errors);
  const base = US.buildCreateDoc(V.formToInput(F({ title: "x", category: "LESSON", allDay: false, startTime: "16:00" })), NOW).doc;
  assert.deepStrictEqual(e({ ...base, scope: "CHILD", childKeys: [] }), [M.errTarget]);
  assert.deepStrictEqual(e({ ...base, endDate: "2026-10-01" }), [M.errEndBeforeStart]);
  assert.deepStrictEqual(e({ ...base, startTime: undefined }), [M.errStartTime]);
  assert.deepStrictEqual(e({ ...base, endTime: "15:00" }), [M.errEndTime]);
  assert.deepStrictEqual(e({ ...base, eventDate: undefined }), [M.errDate]);
  assert.deepStrictEqual(e({ ...base, memo: "a".repeat(501) }), [M.errLength]);
  assert.deepStrictEqual(e({ ...base, hacked: 1 }), [M.errGeneric]);
  const period = { ...base, dateKind: "PERIOD", eventDate: undefined, allDay: true, startTime: undefined, endTime: undefined, periodStart: "2026-11-01", periodEnd: "2026-10-01" };
  assert.deepStrictEqual(e(period), [M.errPeriodOrder]);
  assert.deepStrictEqual(V.messagesFromErrors([{ code: "X", field: "zzz" }, { code: "Y", field: "yyy" }]), [M.errGeneric], "같은 문구는 한 번만");
  assert.deepStrictEqual(V.messagesFromErrors(undefined), []);
});
test("수정: formFromSchedule ↔ formToInput 왕복 후 변경 없음, changesFromForm 은 바뀐 필드만", () => {
  const withId = sched({ title: "피아노", memo: "악보", location: "음악학원" });
  const doc = V.stripId(withId);
  assert.strictEqual(US.validate(withId).ok, false, "id 가 붙은 채로는 UserSchedule 이 거부한다(앱은 stripId 를 거쳐야 한다)");
  assert.strictEqual(US.validate(doc).ok, true);
  assert.strictEqual(V.formFromSchedule(withId).scheduleId, withId.id);
  const f = V.formFromSchedule(doc);
  assert.deepStrictEqual(V.changesFromForm(f, doc), {}, "그대로면 변경 없음");
  const ch = V.changesFromForm({ ...f, title: "바이올린", memo: "" }, doc);
  assert.deepStrictEqual(ch, { title: "바이올린", memo: null });
  const r = US.buildPatch(doc, ch, NOW + 1);
  assert(r.ok, JSON.stringify(r.errors));
  assert.deepStrictEqual(Object.keys(r.patch).sort(), ["memo", "title", "updatedAt"]);
  assert(!("memo" in r.after));
});
test("수정: 날짜 정함 → 기간 미정 / 아이 → 가족 로 바꾸면 쓰지 않게 된 필드가 null 로 지워지고 결과가 유효하다", () => {
  const doc = V.stripId(sched({ title: "수업" }));
  const f = { ...V.formFromSchedule(doc), dateKind: "PERIOD", periodStart: "2026-10-01", periodEnd: "2026-10-31", allDay: true, scope: "FAMILY", childKeys: [] };
  const ch = V.changesFromForm(f, doc);
  assert.strictEqual(ch.eventDate, null);
  assert.strictEqual(ch.startTime, null);
  assert.strictEqual(ch.endTime, null);
  assert.strictEqual(ch.childKeys, null);
  assert.strictEqual(ch.dateKind, "PERIOD");
  const r = US.buildPatch(doc, ch, NOW + 1);
  assert(r.ok, JSON.stringify(r.errors));
  assert.strictEqual(r.after.periodStart, "2026-10-01");
  assert(!("eventDate" in r.after) && !("childKeys" in r.after));
  assert(!("sourceType" in ch) && !("createdAt" in ch) && !("v" in ch), "불변 필드는 절대 포함하지 않는다");
});
test("폼 마크업: 분류·대상·날짜 종류 칩의 선택 상태, 분리된 아이는 선택지에서 제외", () => {
  const f = F({ category: "MEDICAL", scope: "CHILD", childKeys: ["c1", "c2"] });
  const h = V.renderForm(f, LINKS);
  assert(/data-us-cat="MEDICAL"[^>]*>/.test(h) && h.match(/us-chip active" data-us-cat="MEDICAL"/));
  assert(h.match(/us-chip active" data-us-target="c1"/) && h.match(/us-chip active" data-us-target="c2"/));
  assert(!/us-chip active" data-us-target="c3"/.test(h) && !/us-chip active" data-us-target="FAMILY"/.test(h));
  assert(!h.includes('data-us-target="cx"') && !h.includes("분리됨"), "분리된 아이는 선택지에 없다");
  assert(h.includes('data-us-target="FAMILY"') && h.includes(">가족 전체<"));
  assert(/us-chip active" data-us-kind="FIXED"/.test(h));
  ["수업·학원", "어린이집·학교", "병원·검진", "가족", "기타"].forEach((l) => assert(h.includes(`>${l}<`), l));
});
test("폼 마크업: 모드별 제목, 종일/시각 선택, 여러 날/기간 미정 전환, 달력 요소 ID", () => {
  const add = V.renderForm(F({}), LINKS);
  assert(add.includes("<h3>일정 추가</h3>") && add.includes('id="usd-date"') && add.includes('id="usd-dp-btn"'));
  assert(!add.includes('id="us-start-h"'), "종일이면 시각 선택 없음");
  assert(!add.includes('id="use-date"'), "여러 날이 아니면 마지막 날 없음");
  const timed = V.renderForm(F({ allDay: false, startTime: "16:05", endTime: "17:00", multiDay: true, endDate: "2026-10-08" }), LINKS);
  assert(timed.includes('id="us-start-h"') && timed.includes('id="us-end-m"') && timed.includes('id="use-date"'));
  assert(/<option value="16" selected>/.test(timed) && /<option value="05" selected>/.test(timed));
  assert.strictEqual((timed.match(/<option value="\d\d">/g) || []).length + (timed.match(/<option value="\d\d" selected>/g) || []).length, 2 * (24 + 12), "시 24 + 분 12(5분 단위) × 시작·종료");
  const edit = V.renderForm({ ...F({}), mode: "edit" }, LINKS);
  assert(edit.includes("<h3>일정 수정</h3>") && edit.includes('data-us-mode="edit"'));
  const period = V.renderForm(F({ dateKind: "PERIOD", periodStart: "2026-10-01", periodEnd: "2026-10-31" }), LINKS);
  assert(period.includes('id="usps-date" value="2026-10-01"') && period.includes('id="uspe-date" value="2026-10-31"') && period.includes(V.esc(M.periodHint)));
  assert(!period.includes('id="us-allday"') && !period.includes('id="usd-date"'));
});
test("폼 마크업: 5분 단위가 아닌 기존 시각(16:07)도 선택된 채 보인다", () => {
  const h = V.renderForm(F({ allDay: false, startTime: "16:07" }), LINKS);
  assert(/<option value="07" selected>/.test(h));
  assert.deepStrictEqual(V.minuteOptions("07").includes("07"), true);
  assert.deepStrictEqual(V.minuteOptions("10"), V.MINUTES);
  assert.deepStrictEqual(V.splitTime("09:30"), { h: "09", m: "30" });
  assert.deepStrictEqual(V.splitTime(""), { h: "", m: "" });
});
test("폼 마크업: 제목·장소·메모·아이 이름의 HTML 은 실행되지 않고, 오류·저장 중 상태가 표시된다", () => {
  const links = [{ childKey: "c1", displayName: EVIL, order: 1 }];
  const f = F({ title: EVIL, location: EVIL, memo: EVIL, scope: "FAMILY", childKeys: [] });
  const h = V.renderForm(f, links, { messages: [M.errTitleEmpty, EVIL], saving: true });
  assert(!h.includes("<img"), "원문 태그가 그대로 들어가면 안 된다");
  assert(h.includes("&lt;img"));
  assert(h.includes(M.errTitleEmpty) && h.includes(M.saving) && /data-us-action="save" disabled/.test(h));
  assert(!V.renderForm(F({}), LINKS).includes(M.saving));
});
test("pickerInitials: 폼의 날짜 값을 달력 컴포넌트 초기값으로", () => {
  assert.deepStrictEqual(V.pickerInitials(F({})), { usd: "2026-10-06" });
  assert.deepStrictEqual(V.pickerInitials(F({ multiDay: true, endDate: "2026-10-08" })), { usd: "2026-10-06", use: "2026-10-08" });
  assert.deepStrictEqual(V.pickerInitials(F({ dateKind: "PERIOD", periodStart: "2026-10-01", periodEnd: "2026-10-31" })), { usps: "2026-10-01", uspe: "2026-10-31" });
});

console.log("\n안전성");
test("정적 확인: DOM·저장소·네트워크·Firestore·자동 일정 완료(completed)를 참조하지 않는다", () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "js", "user-schedule-view.js"), "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
  ["document.", "window.", "localStorage", "sessionStorage", "firebase", "fetch(", "FamilySync", "HouseholdSync", "navigator", "innerHTML", "addEventListener", "completed", "toISOString", "new Date"].forEach((w) => assert(!src.includes(w), w + " 참조"));
});
test("data-us-action 은 정해진 값만 쓴다", () => {
  const all = [V.renderForm(F({}), LINKS), V.renderDetail({ key: "k", scheduleId: "s", title: "t", categoryLabel: "", timeText: "", dateText: "", tag: "", color: "#ff7a59", done: false }), V.renderDeleteConfirm(), V.renderAddButton({ enabled: true, hasHousehold: true }), V.renderFilterChips(V.filterChips(LINKS, "ALL"), true)].join("");
  const acts = new Set([...all.matchAll(/data-us-action="([^"]+)"/g)].map((m) => m[1]));
  assert.deepStrictEqual([...acts].sort(), ["add", "cancel", "cancel-delete", "close", "confirm-delete", "delete", "edit", "save", "toggle-auto", "toggle-done"]);
});

console.log(`\n${passed}개 통과${process.exitCode ? ", 일부 실패" : ""}`);
