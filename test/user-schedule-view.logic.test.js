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
  { childKey: "c2", familyCode: "BBB222", displayName: "둘째", order: 2, addedAt: 2, colorKey: "p2" },
  { childKey: "c1", familyCode: "AAA111", displayName: "은찬이", order: 1, addedAt: 1, colorKey: "p1" },
  { childKey: "c3", familyCode: "CCC333", displayName: "셋째", order: 3, addedAt: 3, colorKey: "p3" },
  { childKey: "c4", familyCode: "DDD444", displayName: "넷째", order: 4, addedAt: 4, colorKey: "p4" },
  { childKey: "c5", familyCode: "EEE555", displayName: "다섯째", order: 5, addedAt: 5, colorKey: "p5" },
  { childKey: "cx", familyCode: "XXX999", displayName: "분리됨", order: 6, addedAt: 6, removedAt: 9, colorKey: "p6" },
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
  assert.strictEqual(M.needHousehold, "일정을 추가하려면 프로필에서 가족 캘린더를 만들거나, 가족에게 받은 코드로 참여해 주세요.");
  assert.strictEqual(M.monthSummary(3, 1), "이번 달 추가 일정 3개 (완료 1)");
  assert.strictEqual(M.monthEmpty, "이번 달에 추가한 일정이 없어요.");
  assert.deepStrictEqual([M.groupAdded, M.groupBenefit, M.groupPlanned], ["추가한 일정", "혜택 신청 시작", "추천 항목 (정해진 날이 아니에요)"]);
  assert.strictEqual(M.dayEmpty, "이 날 추가한 일정이 없어요.");
  assert.deepStrictEqual([M.periodTitle, M.periodNote, M.periodRow("10/1~10/31")], ["이번 달 기간 일정", "날짜는 아직 정해지지 않았어요.", "날짜 미정 · 10/1~10/31"]);
  assert.strictEqual(M.legend, "꽉 찬 칩은 직접 등록한 일정, 테두리만 있는 칩은 자동 일정이에요.");
  assert.deepStrictEqual([M.filterAll, M.filterFamily, M.toggleAuto], ["전체", "가족", "자동 일정 함께 보기"]);
  assert.strictEqual(M.recurringSkipped, undefined, "#15 는 B5 R38 로 폐기");
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
  assert.strictEqual(M.errTarget, '대상을 골라 주세요. 가족 모두와 관련된 일정은 "가족"을 눌러 주세요.');
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
  const html = [V.renderForm(f, LINKS), V.renderAddButton({ enabled: true, hasHousehold: true }), V.renderAddButton({ enabled: true, hasHousehold: false }), V.renderDeleteConfirm(), V.renderFilterChips(V.filterChips(LINKS, []), { mode: "kids" })].join("");
  [texts, html].forEach((t) => assert(!/내 일정|개인/.test(t)));
  const src = fs.readFileSync(path.join(__dirname, "..", "js", "user-schedule-view.js"), "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
  assert(!/내 일정|개인|PERSONAL/.test(src), "코드(주석 제외)에도 없다");
});

console.log("\n아이색(order 파생)");
test("아이 색: 링크의 colorKey(p1~p10) → 10색 팔레트, 아이마다 서로 다르다(order 로 정하지 않는다)", () => {
  const c = V.childColors(LINKS);
  assert.deepStrictEqual([c.c1, c.c2, c.c3, c.c4, c.c5], ["#a1e3f7", "#f4e07c", "#f47ca8", "#7c90f4", "#d2f7a1"]);
  assert.strictEqual(new Set(Object.values(c)).size, 6);
});
test("링크 배열 순서와 무관하고, 분리된 아이도 자기 색을 유지한다", () => {
  const rev = [...LINKS].reverse();
  assert.deepStrictEqual(V.childColors(rev), V.childColors(LINKS));
  assert.strictEqual(V.childColors(LINKS).cx, "#f7b5a1");
});
test("colorKey 가 없는 옛 링크는 childKey 해시로 항상 같은 색(목록 순서·인원이 바뀌어도 불변)", () => {
  const c = V.childColors([{ childKey: "a" }, { childKey: "b" }]);
  const c2 = V.childColors([{ childKey: "z" }, { childKey: "b" }, { childKey: "a" }]);
  assert.deepStrictEqual([c2.a, c2.b], [c.a, c.b]);
  assert.ok(V.PALETTE.includes(c.a) && V.PALETTE.includes(c.b));
});
test("일정 막대 색: 가족 일정=가족색, 아이 일정=그 아이색, 공동 일정=order 가 앞선 아이색", () => {
  assert.strictEqual(V.occurrenceColor({ scope: "FAMILY", childKeys: [] }, LINKS), V.FAMILY_COLOR);
  assert.strictEqual(V.occurrenceColor({ scope: "CHILD", childKeys: ["c2"] }, LINKS), "#f4e07c");
  assert.strictEqual(V.occurrenceColor({ scope: "CHILD", childKeys: ["c3", "c2"] }, LINKS), "#f4e07c");
  assert.strictEqual(V.occurrenceColor({ scope: "CHILD", childKeys: ["unknown"] }, LINKS), "#c9b8ff", "알 수 없는 아이는 중립색(라벤더, 가족색 아님)");
});
test("자동 일정 색 6가지와 겹치지 않는다(파랑·보라·초록·노랑·빨강·슬레이트)", () => {
  const auto = ["#23935a", "#3f6fe0", "#8a5ae0", "#a87700", "#d94545", "#4a45c8"];
  [...V.CHILD_PALETTE, V.FAMILY_COLOR].forEach((c) => assert(!auto.includes(c), c));
});

console.log("\n필터 로직");
const MEMBERS = [{ memberId: "m1", role: "MOM", label: "엄마" }, { memberId: "m2", role: "DAD", label: "아빠" }, { memberId: "m3", role: "GRANDMA", label: "할머니" }];
test("칩: (전체 버튼 없음) · 엄마·아빠(있는 구성원만) · 아이들(order 순, 분리된 아이 제외) · 가족, 복수 선택 상태", () => {
  const chips = V.filterChips(LINKS, ["CHILD:c2", "CHILD:c1"], MEMBERS);
  assert.deepStrictEqual(chips.map((c) => c.id), ["MOM", "DAD", "CHILD:c1", "CHILD:c2", "CHILD:c3", "CHILD:c4", "CHILD:c5", "FAMILY"]);
  assert.deepStrictEqual(chips.filter((c) => c.selected).map((c) => c.id), ["CHILD:c1", "CHILD:c2"]);
  assert.deepStrictEqual([chips[0].color, chips[1].color, chips.at(-1).color], ["#f7b5a1", "#7cf4c8", V.PALETTE[5]]); // D46: 가족 칩 = 팔레트 6번
  assert.ok(!chips.some((c) => c.id === "ALL" || c.label === "전체"), "'전체' 버튼은 없다");
  assert.ok(chips.every((c) => /^#[0-9a-f]{6}$/i.test(c.color)), "칩마다 대표색이 있다");
  assert.strictEqual(chips.at(-1).label, "가족");
  assert.deepStrictEqual(V.filterChips(LINKS, [], [{ memberId: "m1", role: "MOM", label: "엄마" }]).map((c) => c.id).slice(0, 2), ["MOM", "CHILD:c1"], "아빠 구성원이 없으면 아빠 칩도 없다");
});
test("정규화: 분리된 아이·모르는 값은 빠지고, 전부 고르면 전체, 옛 단일 값도 1개짜리 배열로", () => {
  ["CHILD:cx", "CHILD:none", "", null, undefined, "weird", "ALL"].forEach((s) => assert.deepStrictEqual(V.normalizeSelection(s, LINKS, MEMBERS), [], String(s)));
  assert.deepStrictEqual(V.normalizeSelection("FAMILY", LINKS, MEMBERS), ["FAMILY"]);
  assert.deepStrictEqual(V.normalizeSelection("CHILD:c1", LINKS, MEMBERS), ["CHILD:c1"]);
  assert.deepStrictEqual(V.normalizeSelection(["FAMILY", "MOM", "CHILD:cx"], LINKS, MEMBERS), ["MOM", "FAMILY"]);
  const all = ["MOM", "DAD", "CHILD:c1", "CHILD:c2", "CHILD:c3", "CHILD:c4", "CHILD:c5", "FAMILY"];
  assert.deepStrictEqual(V.normalizeSelection(all, LINKS, MEMBERS), []);
});
test("토글: ALL=비우기, 그 밖은 추가/제거, 마지막까지 고르면 전체", () => {
  assert.deepStrictEqual(V.toggleSelection([], "MOM", LINKS, MEMBERS), ["MOM"]);
  assert.deepStrictEqual(V.toggleSelection(["MOM"], "CHILD:c1", LINKS, MEMBERS), ["MOM", "CHILD:c1"]);
  assert.deepStrictEqual(V.toggleSelection(["MOM", "CHILD:c1"], "MOM", LINKS, MEMBERS), ["CHILD:c1"]);
  assert.deepStrictEqual(V.toggleSelection(["MOM", "CHILD:c1"], "ALL", LINKS, MEMBERS), []);
  assert.deepStrictEqual(V.toggleSelection(["CHILD:c1"], "CHILD:c1", LINKS, MEMBERS), []);
});
test("모드: 선택 없음=all, 아이만=kids, 엄마·아빠·가족이 하나라도 있으면 member", () => {
  assert.deepStrictEqual([[], ["CHILD:c1"], ["CHILD:c1", "CHILD:c2"], ["MOM"], ["CHILD:c1", "FAMILY"]].map(V.selectionMode), ["all", "kids", "kids", "member", "member"]);
});
test("toModelFilter: 선택 → CalendarModel 필터(owners·showAuto) — '직접 등록한 일정만'은 아이만 선택했을 때만 효력", () => {
  assert.deepStrictEqual(V.toModelFilter([], true, LINKS, MEMBERS), { scope: "ALL", showAuto: true });
  assert.deepStrictEqual(V.toModelFilter(["FAMILY"], true, LINKS, MEMBERS), { scope: "ALL", showAuto: true, owners: ["FAMILY"] });
  assert.deepStrictEqual(V.toModelFilter(["CHILD:c2"], false, LINKS, MEMBERS), { scope: "ALL", showAuto: true, owners: ["CHILD:c2"] });
  assert.deepStrictEqual(V.toModelFilter(["CHILD:c2"], true, LINKS, MEMBERS), { scope: "ALL", showAuto: false, owners: ["CHILD:c2"] });
  assert.deepStrictEqual(V.toModelFilter(["MOM", "CHILD:c2"], true, LINKS, MEMBERS), { scope: "ALL", showAuto: true, owners: ["MOM", "CHILD:c2"] });
  assert.deepStrictEqual(V.toModelFilter(["CHILD:cx"], true, LINKS, MEMBERS), { scope: "ALL", showAuto: true }, "분리된 아이 선택은 전체로");
});
test("실제 CalendarModel 과 연결: 복수 선택(엄마·아이·가족) 필터 결과, 담당자 역할 반영", () => {
  const docs = [sched({ title: "첫째만", childKeys: ["c1"] }), sched({ title: "둘째만", childKeys: ["c2"] }), sched({ title: "형제공동", childKeys: ["c1", "c2"] }), sched({ title: "가족행사", scope: "FAMILY", childKeys: undefined, category: "FAMILY" }), sched({ title: "엄마치과", scope: "FAMILY", childKeys: undefined, category: "MEDICAL", assigneeMemberId: "m1" })];
  const run = (sel, only) => {
    const m = CM.buildCalendarModel({ view: "month", range: { start: "2026-10-01", end: "2026-10-31" }, filter: V.toModelFilter(sel, only, LINKS, MEMBERS), auto: { events: [], displayDates: new Map(), completed: {} }, user: { schedules: docs, childLinks: LINKS, members: MEMBERS } });
    return m.days.get("2026-10-06").user.map((o) => o.title).sort();
  };
  assert.deepStrictEqual(run([]), ["가족행사", "둘째만", "엄마치과", "첫째만", "형제공동"]);
  assert.deepStrictEqual(run(["CHILD:c2"]), ["둘째만", "형제공동"]);
  assert.deepStrictEqual(run(["CHILD:c1", "CHILD:c2"]), ["둘째만", "첫째만", "형제공동"]);
  assert.deepStrictEqual(run(["FAMILY"]), ["가족행사", "엄마치과"]);
  assert.deepStrictEqual(run(["MOM"]), ["엄마치과"]);
  assert.deepStrictEqual(run(["MOM", "CHILD:c1"]), ["엄마치과", "첫째만", "형제공동"]);
  assert.deepStrictEqual(run(["DAD"]), []);
});
test("AUTO 표시 규칙: 현재 아이가 선택에 포함될 때만(엄마·아빠·가족만 고르면 없음, 둘째만이면 없음), 아이만 선택+직접 등록만 켜면 없음", () => {
  const ev = { id: "A1", scheduleKind: "fixed", fixedDate: new Date(2026, 9, 6), windowStart: new Date(2026, 9, 6), windowEnd: new Date(2026, 9, 6), category: "예방접종", title: "x" };
  const autoCount = (sel, only, childKey) => {
    const m = CM.buildCalendarModel({ view: "month", range: { start: "2026-10-01", end: "2026-10-31" }, filter: V.toModelFilter(sel, only, LINKS, MEMBERS), auto: { events: [ev], displayDates: new Map(), completed: {}, childKey }, user: { schedules: [], childLinks: LINKS, members: MEMBERS } });
    return m.days.get("2026-10-06").benefit.length;
  };
  assert.strictEqual(autoCount([], false, "c1"), 1);
  assert.strictEqual(autoCount(["CHILD:c1"], false, "c1"), 1);
  assert.strictEqual(autoCount(["CHILD:c2"], false, "c1"), 0, "둘째만 선택하면 현재 아이(첫째)의 자동 일정은 숨김");
  assert.strictEqual(autoCount(["MOM"], false, "c1"), 0);
  assert.strictEqual(autoCount(["FAMILY"], false, "c1"), 0);
  assert.strictEqual(autoCount(["MOM", "CHILD:c1"], false, "c1"), 1);
  assert.strictEqual(autoCount(["CHILD:c1"], true, "c1"), 0, "직접 등록한 일정만 보기 ON");
  assert.strictEqual(autoCount(["MOM", "CHILD:c1"], true, "c1"), 1, "엄마가 같이 선택되면 이 스위치는 효력 없음(스위치도 안 보임)");
  assert.strictEqual(autoCount(["CHILD:c2"], false, null), 1, "현재 아이를 모르면 아이 칩이 선택된 경우 보임");
});
test("필터 칩 마크업: 복수 선택(aria-pressed)·아이 이름 이스케이프·토글 칩은 아이만 선택했을 때 한 줄에 2개", () => {
  const evilLinks = [{ childKey: "c1", displayName: '<img src=x onerror="alert(1)">', order: 1 }];
  const html = V.renderFilterChips(V.filterChips(evilLinks, ["CHILD:c1"], MEMBERS), { mode: "member" });
  assert(!html.includes("<img") && html.includes("&lt;img"));
  assert(!html.includes('data-us-filter="ALL"') && html.includes("--us-color") && html.includes("us-chip active") && html.includes('aria-pressed="true"') && html.includes('aria-pressed="false"'));
  assert(!html.includes("us-tchip"), "아이만 선택이 아니면 토글 칩 없음");
  const kids = V.renderFilterChips(V.filterChips(LINKS, ["CHILD:c1", "CHILD:c2"], MEMBERS), { mode: "kids", onlyUser: false, catColor: true });
  assert.strictEqual((kids.match(/class="us-tchip"/g) || []).length, 2);
  assert(kids.includes('data-us-action="toggle-only-user"') && kids.includes("직접 등록한 일정만 보기") && kids.includes('data-us-action="toggle-cat-color"') && kids.includes("카테고리별 색깔 다르게 하기"));
  assert(/data-us-action="toggle-only-user"/.test(kids) && /role="switch" aria-checked="false" data-us-action="toggle-only-user"/.test(kids) && /role="switch" aria-checked="true" data-us-action="toggle-cat-color"/.test(kids));
  assert(!/<p|fine-print|us-note/.test(kids.split("us-optrows")[1] || ""), "토글 칩 줄에는 보조 설명 문구가 없다");
});
test("색 모드(D40): 홈·주·상세 기본 = 일정의 '누구'(대상) 대표색 — 아이 일정=그 아이색(만든 사람·옛 담당과 무관), 구성원 일정(FAMILY+구성원)=그 구성원 색, 그 밖=가족색, 아이만 선택=아이색, 카테고리=분류색", () => {
  const o = (x) => ({ scope: "CHILD", childKeys: ["c1"], category: "LESSON", ...x });
  const fam = (x) => ({ scope: "FAMILY", category: "LESSON", ...x });
  assert.strictEqual(V.occurrenceColor(o({ assigneeRole: "MOM", assigneeMemberId: "m1", assigneeColorKey: "p5" }), LINKS), V.childColors(LINKS).c1, "아이 일정은 옛 담당 값이 있어도 그 아이 색");
  assert.strictEqual(V.occurrenceColor(fam({ assigneeRole: "MOM", assigneeMemberId: "m1", assigneeColorKey: "p5" }), LINKS), "#d2f7a1");
  assert.strictEqual(V.occurrenceColor(fam({ assigneeRole: "DAD", assigneeMemberId: "m2", assigneeColorKey: "p4" }), LINKS), "#7c90f4");
  assert.strictEqual(V.occurrenceColor(fam({ assigneeRole: "GRANDMA", assigneeMemberId: "m3", assigneeColorKey: "p6" }), LINKS), "#f7b5a1", "조부모 등 다른 역할도 자기 색");
  assert.strictEqual(V.occurrenceColor(fam({ assigneeRole: null, assigneeMemberId: "gone" }), LINKS), V.familyColor(), "삭제된 구성원 일정은 가족색(팔레트 6번)");
  assert.strictEqual(V.occurrenceColor({ scope: "FAMILY" }, LINKS), V.familyColor(), "담당자 없는 가족 일정=가족색(팔레트 6번)");
  assert.strictEqual(V.occurrenceColor(fam({ assigneeRole: "MOM", assigneeMemberId: "m1", assigneeColorKey: "p5" }), LINKS, "child"), V.familyColor(), "child 모드는 아이 색만(가족 일정은 아이가 없어 가족색)");
  assert.deepStrictEqual(["MEDICAL", "LESSON", "INSTITUTION", "FAMILY", "ETC"].map((c) => V.occurrenceColor(o({ category: c }), LINKS, "category")), ["#9b26d1", "#ffb87a", "#ffb87a", "#d8cdc4", "#d8cdc4"]);
  assert.deepStrictEqual(["예방접종", "영유아검진", "발달관찰", "생활·수유", "안전·돌봄", "행정·지원금"].map((c) => V.CATEGORY_COLORS[V.autoCategoryGroup({ category: c })]), ["#294ee1", "#9b26d1", "#199d5a", "#a58815", "#f31664", "#281cdc"]);
});
test("칩 칸 마크업: 직접=꽉 찬 칩·자동=옅은 칩, 최대 2개+N, 완료 흐림, 카테고리 모드는 자동 칩에 분류명, 이스케이프", () => {
  const u = (title, extra) => ({ t: "u", occ: { title, scope: "CHILD", childKeys: ["c1"], category: "MEDICAL", status: "TODO", ...extra } });
  const a = (title, extra) => ({ t: "a", title, category: "예방접종", done: false, ...extra });
  const ctx = { links: LINKS, mode: "member", catColor: false, autoColor: "#f4e07c" };
  const h = V.cellChips([a("자동1"), u("직접1"), u("직접2"), a("자동2")], ctx);
  assert.strictEqual((h.match(/class="cal-chip /g) || []).length, 2);
  assert(h.indexOf("직접1") < h.indexOf("직접2") && !h.includes("자동1") && h.includes("cal-chip-more\">+2<"), "직접 등록이 앞, 나머지는 +N");
  assert(/cal-chip u" style="background:#a1e3f7;color:#1a1410">직접1/.test(h));
  const auto = V.cellChips([a("접종", { done: true })], ctx);
  assert(auto.includes("cal-chip a done") && auto.includes("--chip-c:#f4e07c"));
  const cat = V.cellChips([a("접종 제목"), u("병원")], { ...ctx, mode: "kids", catColor: true });
  assert(cat.includes("background:#9b26d1") && cat.includes("--chip-c:#294ee1") && cat.includes(">접종<") && !cat.includes("접종 제목"));
  const noCat = V.cellChips([a("접종 제목")], { ...ctx, mode: "member", catColor: true });
  assert(noCat.includes("접종 제목"), "카테고리 색은 아이만 선택했을 때만");
  const evil = V.cellChips([u('<img src=x onerror="a">', { scope: "FAMILY", childKeys: [], assigneeRole: "MOM", assigneeMemberId: "m1", assigneeColorKey: "p5" })], ctx);
  assert(!evil.includes("<img") && evil.includes("&lt;img") && evil.includes("#d2f7a1"));
  assert.strictEqual(V.cellChips([], ctx), "");
});

console.log("\n표시 데이터 변환(완료·삭제 포함)");
const occOf = (doc, links) => model([doc]).days.get(doc.eventDate || "2026-10-06").user[0];
test("카드 데이터: 분류 라벨·시각·태그·색·미완료", () => {
  const c = V.cardData(occOf(sched({ title: "피아노", category: "LESSON" })), LINKS);
  assert.deepStrictEqual({ title: c.title, label: c.categoryLabel, time: c.timeText, date: c.dateText, tag: c.tag, color: c.color, done: c.done, doneLabel: c.doneLabel }, { title: "피아노", label: "수업·학원", time: "오후 4:00 ~ 4:50 (50분)", date: "", tag: "은찬이", color: "#a1e3f7", done: false, doneLabel: "" });
});
test("시각 표기(D): 종일 / 오후 4:00 ~ 4:50 (50분) / 끝이 없으면 시작만", () => {
  const T = (over) => V.cardData(occOf(sched(over)), LINKS).timeText;
  assert.strictEqual(T({ allDay: true, startTime: undefined, endTime: undefined }), "종일");
  assert.strictEqual(T({ endTime: undefined }), "오후 4:00");
  assert.strictEqual(T({}), "오후 4:00 ~ 4:50 (50분)");
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
test("반복 일정 건너뜀 안내는 폐기(B5 R38): 항상 빈 문자열", () => {
  const weekly = sched({ eventDate: undefined, recurrence: { freq: "WEEKLY", interval: 1, byDay: ["TU"], startDate: "2026-10-06", until: null } });
  const rec = { ...weekly, recurrence: { ...weekly.recurrence, freq: "MONTHLY" } };
  assert.strictEqual(V.skippedNote(model([rec]).skipped), "");
  assert.strictEqual(V.skippedNote([]), "");
});
test("입력 객체를 변경하지 않는다(deep freeze 한 모델·링크)", () => {
  const m = model([sched({})]);
  const links = deepFreeze(JSON.parse(JSON.stringify(LINKS)));
  const frozenModel = deepFreeze({ days: [...m.days.values()], periodList: m.periodList, counts: m.counts, skipped: m.skipped });
  V.cardData(frozenModel.days[5].user[0] || { title: "x", dateKind: "FIXED", date: "2026-10-06", badges: [] }, links);
  V.cellMarks(frozenModel.days[5], links);
  V.dayPanel(frozenModel.days[5], links);
  V.filterChips(links, []);
  V.childColors(links);
  V.monthSummary(frozenModel.counts);
});

console.log("\n마크업·이스케이프");
const EVIL = '<img src=x onerror="alert(1)">&"\'';
test("카드: 제목·태그·분류·ID·키의 HTML 은 실행되지 않는다", () => {
  const html = V.renderCard({ key: EVIL, scheduleId: EVIL, title: EVIL, categoryLabel: EVIL, timeText: EVIL, dateText: EVIL, tag: EVIL, color: "#f4e07c", done: true, doneLabel: "완료" });
  assert(!html.includes("<img"), html);
  assert(html.includes("&lt;img") && html.includes("&quot;"));
});
test("카드: 팔레트에 없는 색(스타일 주입 시도)은 중립색으로 바뀐다", () => {
  const html = V.renderCard({ key: "k", scheduleId: "s", title: "t", categoryLabel: "", timeText: "", dateText: "", tag: "", color: 'red;background:url(javascript:alert(1))', done: false });
  assert(!html.includes("javascript:") && html.includes("--us-color:#c9b8ff"));
});
test("카드: 완료면 done 클래스와 '완료' 표시, 미완료면 없음", () => {
  const base = { key: "k", scheduleId: "s", title: "t", categoryLabel: "수업·학원", timeText: "종일", dateText: "", tag: "가족 일정", color: "#c9b8ff" };
  const d = V.renderCard({ ...base, done: true, doneLabel: "완료" });
  const u = V.renderCard({ ...base, done: false, doneLabel: "" });
  assert(d.includes("us-card done") && d.includes('<span class="us-done">완료</span>'));
  assert(!u.includes("done") && !u.includes("us-done"));
  assert(u.includes("종일 · 수업·학원 · 가족 일정"), "D74: 내용 한 줄 = 시간·기간·분류·대상 순");
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
  const c = { key: "k", scheduleId: "s", title: EVIL, categoryLabel: "병원·검진", timeText: "종일", dateText: "", tag: "은찬이", color: "#f4e07c", done: false, location: EVIL, memo: EVIL };
  const html = V.renderDetail(c);
  assert(!html.includes("<img") && html.includes("&lt;img"));
  assert(!html.includes(">완료했어요<") && !html.includes("완료 취소") && !html.includes('data-us-action="toggle-done"')); // D63: 직접 추가한 일정 상세에는 완료 버튼 없음
  ["edit", "delete", "close"].forEach((a) => assert(html.includes(`data-us-action="${a}"`), a));
  const done = V.renderDetail({ ...c, done: true });
  assert(done.includes(">완료 취소<") && !done.includes(">완료했어요<") && done.includes('<span class="us-done">완료</span>'));
  assert.deepStrictEqual(V.detailView({ ...c, done: false }).actions.map((a) => a.id), ["edit", "delete", "close"]);
  assert.deepStrictEqual(V.detailView({ ...c, done: true }).actions.map((a) => a.id), ["toggle-done", "edit", "delete", "close"]); // 이미 완료된 일정: 되돌리기(완료 취소)는 유지
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
  assert(h.includes('data-us-target="FAMILY"') && h.includes(">가족<"));
  assert(!h.includes("data-us-kind"), "D75: 날짜 정함/미정 칩 없음");
  ["수업·학원", "어린이집·학교", "병원·검진", "가족", "기타"].forEach((l) => assert(h.includes(`>${l}<`), l));
});
test("폼 마크업: 모드별 제목, 종일/시각 선택, 여러 날/기간 미정 전환, 달력 요소 ID", () => {
  const add = V.renderForm(F({}), LINKS);
  assert(add.includes("<h3>일정 추가</h3>") && add.includes('id="usd-date"') && add.includes('id="usd-dp-btn"'));
  assert(!add.includes('data-tw="us"'), "종일이면 시간 입력 없음");
  assert(!add.includes('id="use-date"'), "여러 날이 아니면 마지막 날 없음");
  const timed = V.renderForm(F({ allDay: false, startTime: "16:05", endTime: "17:00", multiDay: true, endDate: "2026-10-08" }), LINKS);
  assert(timed.includes('data-tw="us"') && timed.includes('data-tw-field="end"') && !timed.includes('id="use-date"') && !timed.includes('id="us-multi"'), "시간 입력은 한 줄 범위 + 휠(시안 B), D75: 여러 날 입력칸은 폼에 없다(endDate 는 저장 때 유지)");
  assert(timed.includes(">오후 4:05<") && timed.includes(">5:00<"), "시작·끝이 한 줄에 보인다(기존 5분 단위 값도 그대로)");
  assert.strictEqual((timed.match(/data-tw-col="/g) || []).length, 3, "오전/오후·시·분 휠 3열");
  const edit = V.renderForm({ ...F({}), mode: "edit" }, LINKS);
  assert(edit.includes("<h3>일정 수정</h3>") && edit.includes('data-us-mode="edit"'));
  const period = V.renderForm(F({ dateKind: "PERIOD", periodStart: "2026-10-01", periodEnd: "2026-10-31" }), LINKS);
  assert(period.includes('id="usps-date" value="2026-10-01"') && period.includes('id="uspe-date" value="2026-10-31"') && period.includes(V.esc(M.periodHint)));
  assert(!period.includes('id="us-allday"') && !period.includes('id="usd-date"'));
});
test("폼 마크업: 15분 단위가 아닌 기존 시각(16:07)도 그대로 보인다", () => {
  const h = V.renderForm(F({ allDay: false, startTime: "16:07" }), LINKS);
  assert(h.includes(">오후 4:07<") && h.includes('<b class="tw-v cur" aria-live="polite">07</b>'));
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
  const all = [V.renderForm(F({}), LINKS), V.renderDetail({ key: "k", scheduleId: "s", title: "t", categoryLabel: "", timeText: "", dateText: "", tag: "", color: "#f4e07c", done: false }), V.renderDetail({ key: "k", scheduleId: "s", title: "t", categoryLabel: "", timeText: "", dateText: "", tag: "", color: "#f4e07c", done: true }), V.renderDeleteConfirm(), V.renderAddButton({ enabled: true, hasHousehold: true }), V.renderFilterChips(V.filterChips(LINKS, []), { mode: "kids" })].join("");
  const acts = new Set([...all.matchAll(/data-us-action="([^"]+)"/g)].map((m) => m[1]));
  assert.deepStrictEqual([...acts].sort(), ["add", "cancel", "cancel-delete", "close", "confirm-delete", "delete", "edit", "save", "toggle-cat-color", "toggle-done", "toggle-only-user"]);
});

// ════════════════════════════════════════════════════════════════════════
// B5 2단계 — 반복 일정 뷰 (승인된 R1~R41 / G1~G3 / R30)
// ════════════════════════════════════════════════════════════════════════
console.log("\nB5 반복 일정 문구 (R1~R37)");
const REC = { freq: "WEEKLY", interval: 1, byDay: ["TU", "TH"], startDate: "2026-10-06", until: null };
const recDoc = (over = {}) => sched({ eventDate: undefined, recurrence: REC, ...over });
const noId = (d) => V.stripId(d);
test("승인 문구 R1~R35 가 승인본과 글자까지 같다", () => {
  assert.deepStrictEqual([M.repeatLabel, M.repeatNone, M.repeatWeekly, M.repeatBiweekly], ["반복", "반복 안 함", "매주", "2주마다"]); // R1·R2
  assert.strictEqual(M.repeatDaysLabel, "반복 요일"); // R3
  assert.deepStrictEqual(V.WEEKDAY_KEYS.map((k) => V.WEEKDAY_LABELS[k]), ["월", "화", "수", "목", "금", "토", "일"]); // R4
  assert.strictEqual(M.firstDayLabel, "첫 날"); // R5
  assert.strictEqual(M.firstDayHint, "첫 날이 고른 요일이 아니면, 그다음 해당 요일부터 시작돼요."); // R6
  assert.deepStrictEqual([M.untilLabel, M.untilNone, M.untilDate, M.lastRepeatLabel], ["끝나는 날", "계속 반복", "날짜까지", "마지막 반복일"]); // R7~R9
  assert.strictEqual(M.repeatHint, undefined); // R10: D75 — 폼에서 '여러 날'·'날짜 미정' 안내가 사라져 삭제
  assert.strictEqual(M.repeatBadge, "반복"); // R12
  assert.deepStrictEqual([M.errNoWeekday, M.errUntilBeforeStart, M.errUntilMissing], ["반복할 요일을 하나 이상 골라 주세요.", "끝나는 날은 첫 날과 같거나 이후여야 해요.", "마지막 반복일을 골라 주세요."]); // R13~R15
  assert.strictEqual(M.exceptionsMany(183), "이 일정은 날짜별 변경이 많아요. (183/200)"); // R16
  assert.strictEqual(M.exceptionsFull, "날짜별 변경을 더 저장할 수 없어요. 전체 수정으로 정리해 주세요."); // R17
  assert.deepStrictEqual([M.btnDoneDay, M.btnUndoneDay], ["이 날 완료했어요", "이 날 완료 취소"]); // R18
  assert.deepStrictEqual([M.btnEdit, M.btnDelete, M.btnClose], ["수정", "삭제", "닫기"]); // R19
  assert.strictEqual(M.editScopeTitle, "반복 일정을 어떻게 수정할까요?"); // R20
  assert.deepStrictEqual([M.editDayLabel, M.editDayDesc("10/13(화)")], ["이 날만 수정", "10/13(화) 하루만 날짜나 시간을 바꿔요. 다른 날은 그대로예요."]); // R21
  assert.deepStrictEqual([M.editAllLabel, M.editAllDesc], ["전체 수정", "지난 날짜를 포함해 이 반복 일정 전체가 바뀌어요."]); // R22
  assert.strictEqual(M.editScopeNote, "이 날 이후만 바꾸는 기능은 아직 없어요."); // R23
  assert.strictEqual(M.deleteScopeTitle, "반복 일정을 어떻게 삭제할까요?"); // R24
  assert.deepStrictEqual([M.cancelDayLabel, M.cancelDayDesc("10/13(화)")], ["이 날만 취소", "10/13(화) 하루만 빼요. 취소한 날은 다시 되돌릴 수 있어요."]); // R25
  assert.deepStrictEqual([M.deleteAllLabel, M.deleteAllDesc], ["전체 삭제", "지난 날짜와 앞으로의 모든 반복이 가족 모두의 캘린더에서 사라져요."]); // R26
  assert.strictEqual(M.scopeBack, "돌아가기"); // R27
  assert.deepStrictEqual([M.cancelDayTitle("10/13(화)"), M.cancelDayBody, M.cancelDayConfirm], ["10/13(화) 일정만 취소할까요?", "다른 날은 그대로예요. 취소한 날은 그날 목록에서 되돌릴 수 있어요.", "이 날만 취소"]); // R28
  assert.deepStrictEqual([M.deleteAllTitle, M.deleteAllBody, M.deleteAllConfirm], ["반복 일정 전체를 삭제할까요?", "삭제하면 가족 모두의 캘린더에서 지난 날짜와 앞으로의 모든 반복이 사라져요. 지금은 복구할 수 없어요.", "전체 삭제"]); // R29
  assert.deepStrictEqual([M.ruleChangeTitle, M.ruleChangeBody(3), M.ruleChangeConfirm], ["반복 규칙을 바꿀까요?", "바뀐 규칙에 맞지 않는 날짜의 취소·변경 기록 3개가 함께 정리돼요.", "바꾸기"]); // R30
  assert.deepStrictEqual([M.editDayTitle, M.editDayNote("10/13(화)"), M.editDaySave], ["이 날만 수정", "10/13(화) 하루만 바뀌어요.", "이 날만 저장"]); // R31
  assert.deepStrictEqual([M.editAllTitle, M.editAllNote, M.editAllSave], ["반복 일정 전체 수정", "지난 날짜를 포함해 모든 반복에 적용돼요.", "전체 저장"]); // R32
  assert.deepStrictEqual([M.cancelledBadge, M.btnRestore], ["취소됨", "취소 되돌리기"]); // R33·R34
  assert.strictEqual(M.movedFrom("10/13(화)"), "10/13(화)에서 옮겨 왔어요"); // R35
  assert.strictEqual(M.done, "완료"); // R37 = #52
});
test("{날짜} 표기: dayLabel — 요일은 Date 없이 계산(윤년·연초 경계 포함), 잘못된 값은 빈 문자열", () => {
  assert.strictEqual(V.dayLabel("2026-10-13"), "10/13(화)");
  assert.strictEqual(V.dayLabel("2026-10-11"), "10/11(일)");
  assert.strictEqual(V.dayLabel("2028-02-29"), "2/29(화)");
  assert.strictEqual(V.dayLabel("2027-01-01"), "1/1(금)");
  assert.strictEqual(V.dayLabel("2026-12-31"), "12/31(목)");
  assert.strictEqual(V.dayLabel(""), "");
  assert.strictEqual(V.dayLabel(null), "");
  // 실제 달력과 일치(모든 날짜 2026~2028)
  for (let d = new Date(2026, 0, 1); d < new Date(2028, 11, 31); d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    assert.strictEqual(V.dayLabel(iso).slice(-2, -1), ["일", "월", "화", "수", "목", "금", "토"][d.getDay()], iso);
  }
});
test("R11 반복 요약: 매주/2주마다 + 요일 + 시작·끝(끝나는 해가 다르면 연도)", () => {
  assert.strictEqual(V.repeatSummary(REC), "매주 화·목 · 10/6부터");
  assert.strictEqual(V.repeatSummary({ ...REC, interval: 2, byDay: ["MO"], until: "2026-12-28" }), "2주마다 월 · 10/6~12/28");
  assert.strictEqual(V.repeatSummary({ ...REC, interval: 2, byDay: ["MO"], until: "2027-02-26" }), "2주마다 월 · 10/6~2027/2/26");
  assert.strictEqual(V.repeatSummary({ ...REC, byDay: ["SU", "MO"] }), "매주 월·일 · 10/6부터", "요일은 월~일 순서");
  assert.strictEqual(V.repeatSummary(null), "");
});

console.log("\n반복 카드·달력·패널 (B5)");
const occsOf = (docs, filter) => {
  const m = model(docs, filter);
  return m;
};
test("반복 회차 cardData: 배지·요약·원래 날짜·취소·이동 / 단일 일정 cardData 는 B4 와 같은 키만", () => {
  const d = recDoc({ exceptions: { "2026-10-08": { status: "CANCELLED" }, "2026-10-13": { status: "RESCHEDULED", movedTo: { date: "2026-10-14", startTime: "17:00" } }, "2026-10-15": { status: "DONE" } } });
  const m = occsOf([d]);
  const cell = (k) => m.days.get(k);
  const moved = V.cardData(cell("2026-10-14").user[0], LINKS, { recurrence: d.recurrence, exceptionCount: 3 });
  assert(moved.recurring && moved.repeatBadge === "반복" && moved.repeatSummary === "매주 화·목 · 10/6부터" && moved.originalDate === "2026-10-13" && moved.date === "2026-10-14");
  assert.strictEqual(moved.movedText, "10/13(화)에서 옮겨 왔어요");
  assert.strictEqual(moved.dayLabel, "10/14(수)", "상세의 날짜 줄은 옮겨진 날짜");
  assert.strictEqual(moved.timeText, "오후 5:00");
  const canc = V.cardData(cell("2026-10-08").cancelled[0], LINKS, { recurrence: d.recurrence });
  assert(canc.cancelled && canc.cancelledLabel === "취소됨" && !canc.done && canc.doneLabel === "");
  const done = V.cardData(cell("2026-10-15").user[0], LINKS);
  assert(done.done && done.doneLabel === "완료" && !done.cancelled);
  const single = V.cardData(model([sched({})]).days.get("2026-10-06").user[0], LINKS);
  assert.deepStrictEqual(Object.keys(single).sort(), ["assigneeText", "categoryKey", "categoryLabel", "color", "dateText", "done", "doneLabel", "isPeriod", "key", "location", "memo", "scheduleId", "scope", "tag", "targetText", "timeText", "title"]);
});
test("renderCard: 반복 카드는 data-us-date·반복 배지, 취소 카드는 .cancelled+취소됨, 이동 카드는 옮겨 왔어요 / 단일 카드에는 반복 흔적이 없다", () => {
  const d = recDoc({ exceptions: { "2026-10-08": { status: "CANCELLED" }, "2026-10-13": { status: "RESCHEDULED", movedTo: { date: "2026-10-14" } } } });
  const m = occsOf([d]);
  const html = (k, list = "user") => V.renderCard(V.cardData(m.days.get(k)[list][0], LINKS, { recurrence: d.recurrence }));
  const normal = html("2026-10-06");
  assert(normal.includes('data-us-date="2026-10-06"') && normal.includes("us-repeat") && normal.includes(">반복<") && !normal.includes("cancelled"));
  const canc = html("2026-10-08", "cancelled");
  assert(canc.includes("us-card cancelled") && canc.includes("취소됨"));
  const mv = html("2026-10-14");
  assert(mv.includes("10/13(화)에서 옮겨 왔어요"));
  const single = V.renderCard(V.cardData(model([sched({})]).days.get("2026-10-06").user[0], LINKS));
  assert(!single.includes("data-us-date") && !single.includes("us-repeat") && !single.includes("cancelled") && !single.includes("us-moved"));
});
test("선택일 패널: 취소 회차는 일반 카드 뒤에 흐리게, 취소만 있어도 '비어 있음'이 아니다 / 취소 없는 날은 B4 와 같다", () => {
  const d = recDoc({ exceptions: { "2026-10-08": { status: "CANCELLED" } } });
  const other = sched({ eventDate: "2026-10-08" });
  const m = occsOf([d, other]);
  const panel = V.dayPanel(m.days.get("2026-10-08"), LINKS, { docById: (id) => (id === d.id ? d : null) });
  assert.deepStrictEqual(panel.added.cards.map((c) => c.cancelled === true), [false, true]);
  assert.strictEqual(panel.added.cards[1].repeatSummary, "매주 화·목 · 10/6부터");
  const onlyCancel = V.dayPanel(occsOf([d]).days.get("2026-10-08"), LINKS);
  assert.strictEqual(onlyCancel.added.cards.length, 1);
  assert.strictEqual(onlyCancel.emptyAdded, false);
  const plain = V.dayPanel({ user: [], benefit: [], planned: [] }, LINKS);
  assert.deepStrictEqual([plain.added.cards.length, plain.emptyAdded], [0, true]);
});
test("칸 표식: 반복 회차는 막대로 나오고 취소 회차는 표식에 없다 / 완료 회차는 done", () => {
  const d = recDoc({ exceptions: { "2026-10-08": { status: "CANCELLED" }, "2026-10-15": { status: "DONE" } } });
  const m = occsOf([d]);
  assert.deepStrictEqual(V.cellMarks(m.days.get("2026-10-06"), LINKS).marks.map((x) => [x.kind, x.shape]), [["user", "bar"]]);
  assert.strictEqual(V.cellMarks(m.days.get("2026-10-08"), LINKS).marks.length, 0);
  assert.strictEqual(V.cellMarks(m.days.get("2026-10-15"), LINKS).marks[0].done, true);
});
test("월 요약은 회차 수(D3): 매주 화·목 + 단일 1개 = 9개, 취소 1개 빼고 완료 1개", () => {
  const d = recDoc({ exceptions: { "2026-10-08": { status: "CANCELLED" }, "2026-10-15": { status: "DONE" } } });
  const m = occsOf([d, sched({})]);
  assert.strictEqual(V.monthSummary(m.counts), "이번 달 추가 일정 8개 (완료 1)");
});

console.log("\n회차 상세·범위 시트·확인창 (R18~R30)");
test("회차 상세 버튼: 이 날 완료/취소, 수정, 삭제, 닫기 / 취소된 회차는 취소 되돌리기+닫기 / 단일 일정은 B4 그대로", () => {
  const d = recDoc({ exceptions: { "2026-10-08": { status: "CANCELLED" }, "2026-10-15": { status: "DONE" } } });
  const m = occsOf([d]);
  const view = (k, list = "user") => V.detailView(V.cardData(m.days.get(k)[list][0], LINKS, { recurrence: d.recurrence }));
  assert.deepStrictEqual(view("2026-10-06").actions.map((a) => [a.id, a.label]), [["edit", "수정"], ["delete", "삭제"], ["close", "닫기"]]); // D63: 완료 버튼 없음
  assert.deepStrictEqual(view("2026-10-15").actions.map((a) => a.id), ["toggle-done", "edit", "delete", "close"]);
  assert.strictEqual(view("2026-10-15").actions[0].label, "이 날 완료 취소");
  assert.deepStrictEqual(view("2026-10-08", "cancelled").actions.map((a) => [a.id, a.label]), [["restore", "취소 되돌리기"], ["close", "닫기"]]);
  const single = V.detailView(V.cardData(model([sched({})]).days.get("2026-10-06").user[0], LINKS));
  assert.deepStrictEqual(single.actions.map((a) => a.label), ["수정", "삭제", "닫기"]);
});
test("회차 상세 HTML: 반복 배지·요약 행·날짜 행(원래 날짜)·취소됨 / 날짜별 변경 많음 안내(180/200)", () => {
  const d = recDoc({ exceptions: { "2026-10-08": { status: "CANCELLED" } } });
  const m = occsOf([d]);
  const c = V.cardData(m.days.get("2026-10-08").cancelled[0], LINKS, { recurrence: d.recurrence, exceptionCount: 183 });
  const h = V.renderDetail(c);
  assert(h.includes("us-repeat") && h.includes("매주 화·목 · 10/6부터") && h.includes("10/8(목)") && h.includes("취소됨") && h.includes("취소 되돌리기"));
  assert(h.includes("이 일정은 날짜별 변경이 많아요. (183/200)"));
  assert(V.renderDetail({ ...c, exceptionsNotice: V.exceptionsNotice(200) }).includes("날짜별 변경을 더 저장할 수 없어요. 전체 수정으로 정리해 주세요."));
  assert.strictEqual(V.exceptionsNotice(179), "");
  assert.strictEqual(V.exceptionsNotice(180), "이 일정은 날짜별 변경이 많아요. (180/200)");
});
test("수정 시트: 이 날만 수정 / 전체 수정 두 선택지 + R23 안내 + 돌아가기. '이후' 선택지는 없다(G1)", () => {
  const h = V.renderEditScopeSheet("2026-10-13");
  assert(h.includes("반복 일정을 어떻게 수정할까요?") && h.includes("이 날만 수정") && h.includes("10/13(화) 하루만 날짜나 시간을 바꿔요. 다른 날은 그대로예요."));
  assert(h.includes("전체 수정") && h.includes("지난 날짜를 포함해 이 반복 일정 전체가 바뀌어요.") && h.includes("이 날 이후만 바꾸는 기능은 아직 없어요.") && h.includes("돌아가기"));
  assert.deepStrictEqual([...h.matchAll(/data-us-action="([a-z-]+)"/g)].map((x) => x[1]), ["edit-day", "edit-all", "scope-back"]);
  assert(!/이후 모두|이후 일정|이 일정 이후/.test(h));
});
test("삭제 시트: 이 날만 취소 / 전체 삭제 + 돌아가기, 확인창 2종과 규칙 변경 확인창(R30: n>0 본문, n=0 은 R32 안내 문장)", () => {
  const h = V.renderDeleteScopeSheet("2026-10-13");
  assert(h.includes("반복 일정을 어떻게 삭제할까요?") && h.includes("이 날만 취소") && h.includes("10/13(화) 하루만 빼요. 취소한 날은 다시 되돌릴 수 있어요.") && h.includes("전체 삭제") && h.includes("지난 날짜와 앞으로의 모든 반복이 가족 모두의 캘린더에서 사라져요."));
  assert.deepStrictEqual([...h.matchAll(/data-us-action="([a-z-]+)"/g)].map((x) => x[1]), ["cancel-day", "delete-all", "scope-back"]);
  const c1 = V.renderCancelDayConfirm("2026-10-13");
  assert(c1.includes("10/13(화) 일정만 취소할까요?") && c1.includes("다른 날은 그대로예요. 취소한 날은 그날 목록에서 되돌릴 수 있어요.") && c1.includes("confirm-cancel-day") && c1.includes("돌아가기"));
  const c2 = V.renderDeleteAllConfirm();
  assert(c2.includes("반복 일정 전체를 삭제할까요?") && c2.includes("지금은 복구할 수 없어요.") && c2.includes("confirm-delete-all"));
  const c3 = V.renderRuleChangeConfirm(4);
  assert(c3.includes("반복 규칙을 바꿀까요?") && c3.includes("취소·변경 기록 4개가 함께 정리돼요.") && c3.includes("confirm-rule-change") && c3.includes("바꾸기"));
  const c0 = V.renderRuleChangeConfirm(0);
  assert(c0.includes("반복 규칙을 바꿀까요?") && c0.includes("지난 날짜를 포함해 모든 반복에 적용돼요.") && !c0.includes("0개"));
});
test("XSS: 제목·장소·메모·아이 이름·요일이 마크업에 이스케이프된다(카드·상세·시트)", () => {
  const evil = '<img src=x onerror=alert(1)>"\'&';
  const d = recDoc({ title: evil, location: evil, memo: evil });
  const m = occsOf([d]);
  const c = V.cardData(m.days.get("2026-10-06").user[0], LINKS, { recurrence: d.recurrence });
  for (const h of [V.renderCard(c), V.renderDetail(c)]) assert(!h.includes("<img") && h.includes("&lt;img"));
  const evilKey = { ...c, key: evil, scheduleId: evil, originalDate: evil };
  assert(!V.renderCard(evilKey).includes("<img"));
  assert(!V.repeatSummary({ ...REC, startDate: evil, byDay: [evil, "TU"] }).includes("<"), "요일은 고정 표에서만");
});

console.log("\n반복 입력 폼 ↔ 문서 (B5)");
const RF = (o) => ({ ...V.newForm({ date: "2026-10-06", activeChildKey: "c1", links: LINKS }), title: "피아노", category: "LESSON", allDay: false, startTime: "16:00", endTime: "16:50", ...o });
test("newForm: 반복 안 함이 기본, 기존 필드는 그대로", () => {
  const f = V.newForm({ date: "2026-10-06", activeChildKey: "c1", links: LINKS });
  assert.deepStrictEqual([f.repeat, f.byDay, f.untilMode, f.until, f.wasRecurring], ["NONE", [], "NONE", "", false]);
  assert.deepStrictEqual([f.mode, f.dateKind, f.eventDate, f.allDay, f.scope], ["create", "FIXED", "2026-10-06", true, "CHILD"]);
});
test("formToInput(반복): recurrence 만 있고 eventDate·endDate 없음, 매주=1·2주마다=2, 요일은 월~일 순서, 끝 없음=null", () => {
  const w = V.formToInput(RF({ repeat: "WEEKLY", byDay: ["TH", "TU"] }));
  assert.deepStrictEqual(w.recurrence, { freq: "WEEKLY", interval: 1, byDay: ["TU", "TH"], startDate: "2026-10-06", until: null });
  assert(!("eventDate" in w) && !("endDate" in w) && w.dateKind === "FIXED" && w.startTime === "16:00");
  const b = V.formToInput(RF({ repeat: "BIWEEKLY", byDay: ["MO"], untilMode: "DATE", until: "2027-02-26", multiDay: true, endDate: "2026-10-08" }));
  assert.deepStrictEqual(b.recurrence, { freq: "WEEKLY", interval: 2, byDay: ["MO"], startDate: "2026-10-06", until: "2027-02-26" });
  assert(!("endDate" in b), "반복과 여러 날은 함께 쓰지 않는다");
  const none = V.formToInput(RF({ repeat: "NONE" }));
  assert(!("recurrence" in none) && none.eventDate === "2026-10-06");
});
test("prepareSave(반복): UserSchedule.buildCreateDoc 를 통과하는 문서, 전개하면 회차가 나온다", () => {
  const r = V.prepareSave(RF({ repeat: "WEEKLY", byDay: ["TU", "TH"] }), NOW);
  assert(r.ok, JSON.stringify(r.messages));
  const doc = { ...US.buildCreateDoc(r.input, NOW).doc, id: "z1" };
  assert.strictEqual(US.expandOccurrences(doc, "2026-10-01", "2026-10-31").length, 8);
});
test("validateForm(반복): 요일 없음 R13 · 끝나는 날 없음 R15 · 끝이 첫 날 앞 R14 · 첫 날 없음 · 시각 규칙은 그대로", () => {
  const msgs = (f) => V.validateForm(f).errors.map((e) => e.message);
  assert.deepStrictEqual(msgs(RF({ repeat: "WEEKLY", byDay: [] })), ["반복할 요일을 하나 이상 골라 주세요."]);
  assert.deepStrictEqual(msgs(RF({ repeat: "WEEKLY", byDay: ["TU"], untilMode: "DATE", until: "" })), ["마지막 반복일을 골라 주세요."]);
  assert.deepStrictEqual(msgs(RF({ repeat: "WEEKLY", byDay: ["TU"], untilMode: "DATE", until: "2026-10-05" })), ["끝나는 날은 첫 날과 같거나 이후여야 해요."]);
  assert.deepStrictEqual(msgs(RF({ repeat: "WEEKLY", byDay: ["TU"], untilMode: "DATE", until: "2026-10-06" })), [], "같은 날은 허용");
  assert.deepStrictEqual(msgs(RF({ repeat: "WEEKLY", byDay: ["TU"], eventDate: "" })), ["날짜를 골라 주세요."]);
  assert.deepStrictEqual(msgs(RF({ repeat: "WEEKLY", byDay: ["TU"], allDay: false, startTime: "" })), ['시작 시각을 골라 주세요. 하루 종일이면 "종일"을 눌러 주세요.']);
  assert.deepStrictEqual(msgs(RF({ repeat: "NONE" })), [], "반복 안 함은 B4 와 같다");
});
test("messagesFromErrors: 반복 규칙 오류가 R13·R14·R17 로 번역된다(실제 UserSchedule 오류)", () => {
  const bad = (rec) => V.messagesFromErrors(US.buildCreateDoc({ ...V.formToInput(RF({})), eventDate: undefined, recurrence: rec }, NOW).errors);
  assert(bad({ ...REC, byDay: [] }).includes("반복할 요일을 하나 이상 골라 주세요."));
  assert(bad({ ...REC, until: "2026-09-01" }).includes("끝나는 날은 첫 날과 같거나 이후여야 해요."));
  assert(bad({ ...REC, startDate: "2026-02-30" }).includes("날짜를 골라 주세요."));
  const many = {};
  for (let i = 0; i < 201; i++) many[US.addDays("2026-10-01", i)] = { status: "CANCELLED" };
  const r = US.buildCreateDoc({ ...V.formToInput(RF({})), eventDate: undefined, recurrence: { ...REC, byDay: ["MO", "TU", "WE", "TH", "FR", "SA", "SU"], startDate: "2026-10-01" }, exceptions: many }, NOW);
  assert(V.messagesFromErrors(r.errors).includes("날짜별 변경을 더 저장할 수 없어요. 전체 수정으로 정리해 주세요."));
});
test("formFromSchedule(반복 문서): 첫 날=startDate, 격주/매주, 요일, 끝나는 날, wasRecurring / 왕복 후 변경 없음(키 순서가 달라도)", () => {
  const d = recDoc({ memo: "메모" });
  const f = V.formFromSchedule(d);
  assert.deepStrictEqual([f.repeat, f.byDay, f.untilMode, f.until, f.eventDate, f.wasRecurring, f.dateKind], ["WEEKLY", ["TU", "TH"], "NONE", "", "2026-10-06", true, "FIXED"]);
  const biweek = V.formFromSchedule(recDoc({ recurrence: { ...REC, interval: 2, until: "2027-01-05" } }));
  assert.deepStrictEqual([biweek.repeat, biweek.untilMode, biweek.until], ["BIWEEKLY", "DATE", "2027-01-05"]);
  assert.deepStrictEqual(V.changesFromForm(f, noId(d)), {});
  const shuffled = { ...noId(d), recurrence: { byDay: ["TH", "TU"], until: null, startDate: "2026-10-06", interval: 1, freq: "WEEKLY" } }; // Firestore 가 키를 정렬해 돌려줘도
  assert.deepStrictEqual(V.changesFromForm(f, shuffled), {}, "의미가 같은 규칙은 변경이 아니다");
  assert.deepStrictEqual(V.changesFromForm(V.formFromSchedule(sched({})), noId(sched({}))) , { }, "단일 일정 왕복은 B4 와 같다") ;
});
test("changesFromForm: 요일/간격/끝/첫 날 변경은 recurrence, 반복 → 안 함은 recurrence:null+eventDate, 안 함 → 반복은 eventDate:null", () => {
  const d = noId(recDoc());
  const f = V.formFromSchedule(d);
  assert.deepStrictEqual(V.changesFromForm({ ...f, byDay: ["TU"] }, d).recurrence.byDay, ["TU"]);
  assert.strictEqual(V.changesFromForm({ ...f, repeat: "BIWEEKLY" }, d).recurrence.interval, 2);
  assert.strictEqual(V.changesFromForm({ ...f, untilMode: "DATE", until: "2026-12-01" }, d).recurrence.until, "2026-12-01");
  assert.strictEqual(V.changesFromForm({ ...f, eventDate: "2026-10-07" }, d).recurrence.startDate, "2026-10-07");
  assert.deepStrictEqual(V.changesFromForm({ ...f, title: "다른 제목" }, d), { title: "다른 제목" }, "규칙을 안 바꾸면 recurrence 를 보내지 않는다");
  const toSingle = V.changesFromForm({ ...f, repeat: "NONE" }, d);
  assert(toSingle.recurrence === null && toSingle.eventDate === "2026-10-06");
  const single = noId(sched({}));
  const toRepeat = V.changesFromForm({ ...V.formFromSchedule(sched({})), repeat: "WEEKLY", byDay: ["TU"] }, single);
  assert(toRepeat.eventDate === null && toRepeat.recurrence.byDay[0] === "TU");
});
test("planFullEdit: 규칙 유지 → 확인창 없음 / 규칙 변경 → 확인창 + 화면에 영향 있던 예외만 센 정리 개수(R30) / 검증 실패는 문구 반환", () => {
  const d = noId(recDoc({ exceptions: { "2026-10-08": { status: "CANCELLED" }, "2026-10-13": { status: "DONE" }, "2026-10-07": { status: "CANCELLED" } } })); // 10/7(수)은 원래부터 무효
  const f = V.formFromSchedule(d);
  const keep = V.planFullEdit({ ...f, title: "바이올린" }, d, NOW + 1);
  assert(keep.ok && keep.confirm === false && keep.ruleChanged === false && keep.prunedEffective === 0 && keep.patch.title === "바이올린");
  const cut = V.planFullEdit({ ...f, byDay: ["TU"] }, d, NOW + 1);
  assert(cut.ok && cut.confirm === true && cut.ruleChanged === true);
  assert.strictEqual(cut.prunedEffective, 1, "10/8(목) 취소만 화면에 영향이 있었다. 10/7 은 원래 무효라 세지 않는다");
  assert.deepStrictEqual(cut.pruned.map((p) => [p.date, p.effective]), [["2026-10-07", false], ["2026-10-08", true]]);
  assert(cut.patch["exceptions.2026-10-08"] === null && cut.patch["exceptions.2026-10-07"] === null && !("exceptions.2026-10-13" in cut.patch));
  const bad = V.planFullEdit({ ...f, byDay: [] }, d, NOW);
  assert(!bad.ok && bad.messages[0] === "반복할 요일을 하나 이상 골라 주세요." && bad.confirm === false);
  const toRepeat = V.planFullEdit({ ...V.formFromSchedule(sched({})), repeat: "WEEKLY", byDay: ["TU"] }, noId(sched({})), NOW);
  assert(toRepeat.ok && toRepeat.confirm === true && toRepeat.prunedEffective === 0);
});

console.log("\n반복 입력 화면·이 날만 수정 폼 (B5)");
test("renderForm: 반복 선택(R2)·요일 칩 7개(R4)·끝나는 날(R8) — 반복 안 함에서는 요일·끝 숨김, 날짜 미정에서는 반복 선택 숨김", () => {
  const off = V.renderForm(RF({}), LINKS);
  assert(off.includes('data-us-repeat="NONE"') && off.includes("반복 안 함") && off.includes("매주") && off.includes("2주마다") && !off.includes('data-us-day='));
  assert(!off.includes("여러 날에 걸쳐요") && off.includes(">날짜<"), "D75: 여러 날 입력 삭제");
  const on = V.renderForm(RF({ repeat: "BIWEEKLY", byDay: ["MO", "WE"], untilMode: "DATE", until: "2027-02-26" }), LINKS);
  assert.strictEqual((on.match(/data-us-day="/g) || []).length, 7);
  assert((on.match(/data-us-day="(MO|WE)"[^>]*>/g) || []).length === 2 && /us-chip active" data-us-day="MO"/.test(on) && /us-chip active" data-us-day="WE"/.test(on) && !/active" data-us-day="TU"/.test(on));
  for (const t of ["반복 요일", "첫 날", "끝나는 날", "계속 반복", "날짜까지", "마지막 반복일", "첫 날이 고른 요일이 아니면, 그다음 해당 요일부터 시작돼요."]) assert(on.includes(t), t);
  assert(!on.includes("함께 쓸 수 없어요"), "D75: repeatHint 삭제");
  assert(!on.includes('id="us-multi"'), "반복 중에는 여러 날 체크박스를 숨긴다");
  assert(on.includes('id="usu-date"') && on.includes('value="2027-02-26"'), "마지막 반복일 달력");
  assert(!V.renderForm(RF({ repeat: "WEEKLY", byDay: ["TU"] }), LINKS).includes('id="usu-date"'), "끝나는 날을 '계속 반복'이면 달력 없음");
  assert(!on.includes("날짜 미정") && !on.includes("data-us-kind="), "D75: 날짜 정함/미정 칩 자체가 없다");
  const period = V.renderForm(RF({ dateKind: "PERIOD", periodStart: "2026-10-01", periodEnd: "2026-10-31", allDay: true }), LINKS);
  assert(!period.includes("data-us-repeat") && !period.includes("반복 요일"));
});
test("renderForm 제목·버튼: 반복 일정 수정은 R32(전체 수정 제목·안내·전체 저장), 단일 수정은 B4 그대로(일정 수정·저장), 새 일정은 일정 추가", () => {
  const editRec = V.renderForm(V.formFromSchedule(recDoc()), LINKS);
  assert(editRec.includes("<h3>반복 일정 전체 수정</h3>") && editRec.includes("지난 날짜를 포함해 모든 반복에 적용돼요.") && editRec.includes(">전체 저장<"));
  const editOne = V.renderForm(V.formFromSchedule(sched({})), LINKS);
  assert(editOne.includes("<h3>일정 수정</h3>") && editOne.includes(">저장<") && !editOne.includes("전체 저장"));
  assert(V.renderForm(V.newForm({ date: "2026-10-06", activeChildKey: "c1", links: LINKS }), LINKS).includes("<h3>일정 추가</h3>"));
});
test("pickerInitials: 반복이면 첫 날(+끝나는 날), 이 날만 수정이면 날짜 하나, 기존 형태는 그대로", () => {
  assert.deepStrictEqual(V.pickerInitials(RF({ repeat: "WEEKLY", byDay: ["TU"] })), { usd: "2026-10-06" });
  assert.deepStrictEqual(V.pickerInitials(RF({ repeat: "WEEKLY", byDay: ["TU"], untilMode: "DATE", until: "2027-01-05" })), { usd: "2026-10-06", usu: "2027-01-05" });
  assert.deepStrictEqual(V.pickerInitials({ mode: "day", date: "2026-10-14" }), { usdy: "2026-10-14" });
  assert.deepStrictEqual(V.pickerInitials(RF({})), { usd: "2026-10-06" });
  assert.deepStrictEqual(V.pickerInitials(RF({ multiDay: true, endDate: "2026-10-08" })), { usd: "2026-10-06", use: "2026-10-08" });
});
test("이 날만 수정 폼: 회차에서 만들고, 문서가 시각 있으면 종일 선택 없음(canAllDay=false), 검증·이동 변환", () => {
  const timed = recDoc();
  const ex = { ...timed, exceptions: {} };
  const occ = occsOf([ex]).days.get("2026-10-13").user[0];
  const f = V.dayFormFromOccurrence(occ, timed);
  assert.deepStrictEqual([f.mode, f.originalDate, f.date, f.allDay, f.startTime, f.endTime, f.canAllDay], ["day", "2026-10-13", "2026-10-13", false, "16:00", "16:50", false]);
  const h = V.renderDayForm(f);
  assert(h.includes("<h3>이 날만 수정</h3>") && h.includes("10/13(화) 하루만 바뀌어요.") && h.includes(">이 날만 저장<") && h.includes('data-us-action="save-day"') && !h.includes('id="us-allday"') && h.includes('id="usdy-date"'));
  assert.deepStrictEqual(V.validateDayForm({ ...f, date: "" }).errors.map((e) => e.message), ["날짜를 골라 주세요."]);
  assert.deepStrictEqual(V.validateDayForm({ ...f, startTime: "" }).errors.map((e) => e.message), ['시작 시각을 골라 주세요. 하루 종일이면 "종일"을 눌러 주세요.']);
  assert.deepStrictEqual(V.validateDayForm({ ...f, endTime: "15:00" }).errors.map((e) => e.message), ["종료 시각은 시작 시각보다 늦어야 해요."]);
  assert(V.validateDayForm(f).ok);
  // 이동 변환: 날짜만 바꾸고 시각이 같으면 시각을 보내지 않는다 / 시각을 바꾸면 보낸다 / 원래 날짜·시각 그대로면 {date} 만
  assert.deepStrictEqual(V.dayFormToMove({ ...f, date: "2026-10-14" }, timed), { date: "2026-10-14", startTime: "16:00", endTime: "16:50" });
  assert.deepStrictEqual(V.dayFormToMove(f, timed), { date: "2026-10-13" }, "아무것도 안 바꿨으면 이동 해제와 같은 입력");
  assert.deepStrictEqual(V.dayFormToMove({ ...f, startTime: "17:00", endTime: "" }, timed), { date: "2026-10-13", startTime: "17:00" });
  // 종일 문서는 종일 선택이 있고, 시각을 주면 시각 있는 회차로 옮길 수 있다
  const allDayDoc = recDoc({ allDay: true, startTime: undefined, endTime: undefined });
  const occ2 = occsOf([allDayDoc]).days.get("2026-10-13").user[0];
  const f2 = V.dayFormFromOccurrence(occ2, allDayDoc);
  assert(f2.canAllDay && f2.allDay && V.renderDayForm(f2).includes('id="us-allday"'));
  assert.deepStrictEqual(V.dayFormToMove(f2, allDayDoc), { date: "2026-10-13" });
  assert.deepStrictEqual(V.dayFormToMove({ ...f2, allDay: false, startTime: "09:00" }, allDayDoc), { date: "2026-10-13", startTime: "09:00" });
});
test("엔드투엔드(순수): 이 날만 수정 폼 → moveOccurrence, 취소/되돌리기, 전체 수정 계획 → 전개 결과가 기대대로", () => {
  const d = noId(recDoc());
  const occ = occsOf([{ ...d, id: "e1" }]).days.get("2026-10-13").user[0];
  const f = { ...V.dayFormFromOccurrence(occ, d), date: "2026-10-14", startTime: "17:00", endTime: "17:50" };
  const mv = US.moveOccurrence(d, f.originalDate, V.dayFormToMove(f, d), NOW);
  assert(mv.ok, JSON.stringify(mv.errors));
  const after = { ...mv.after, id: "e1" };
  const m2 = occsOf([after]);
  assert.strictEqual(m2.days.get("2026-10-13").user.length, 0, "옮긴 회차는 원래 날짜에 표시하지 않는다(G3)");
  assert.strictEqual(m2.days.get("2026-10-13").cancelled.length, 0);
  assert.strictEqual(V.cardData(m2.days.get("2026-10-14").user[0], LINKS).timeText, "오후 5:00 ~ 5:50 (50분)");
  const c = US.cancelOccurrence(mv.after, "2026-10-15", NOW + 1);
  assert.strictEqual(occsOf([{ ...c.after, id: "e1" }]).days.get("2026-10-15").cancelled.length, 1);
  const back = US.restoreOccurrence(c.after, "2026-10-15", NOW + 2);
  assert.strictEqual(occsOf([{ ...back.after, id: "e1" }]).days.get("2026-10-15").user.length, 1);
});
test("입력을 변경하지 않는다(deep freeze: 문서·폼·모델·링크)", () => {
  const d = deepFreeze(noId(recDoc({ exceptions: { "2026-10-08": { status: "CANCELLED" }, "2026-10-13": { status: "DONE" } } })));
  const f = deepFreeze(V.formFromSchedule(d));
  const links = deepFreeze(JSON.parse(JSON.stringify(LINKS)));
  assert.doesNotThrow(() => {
    V.planFullEdit({ ...f, byDay: ["TU"] }, d, NOW);
    V.changesFromForm(f, d);
    V.renderForm(f, links);
    const m = occsOf([{ ...d, id: "f1" }]);
    deepFreeze(m);
    const occ = m.days.get("2026-10-06").user[0];
    V.renderDetail(V.cardData(occ, links, { recurrence: d.recurrence, exceptionCount: 2 }));
    V.dayPanel(m.days.get("2026-10-08"), links, { docById: () => d });
    V.dayFormFromOccurrence(occ, d);
  });
});

console.log(`\n${passed}개 통과${process.exitCode ? ", 일부 실패" : ""}`);
