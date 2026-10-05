/* v1.12.98 단계 0 코드 묶음: 0-A1 홈 자동 카드 끝 기준 · 0-A3 마감 있는 지역 지원금 일정 넣기 · 0-B1 36+ 홈 머리 줄 · 0-B2 SC·CR 상세 라벨 · 0-B3 어디갈까 기준 줄·빈 칩 · 0-B4 트렌드 정리 · 0-C1 담당 칩 · 0-C2 접종 후보. 실행: node --test test/k11-stage0.test.js */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
require("./tools/load-engine.js");
const CT = require("../js/child-timeline.js");
const AS = require("../js/auto-steps.js");
const OV = require("../js/over36-view.js");
const PV = require("../js/places-view.js");
const V = require("../js/user-schedule-view.js");
const APP = fs.readFileSync(path.join(__dirname, "../js/app.js"), "utf8");
const T0 = new Date(2026, 9, 5);

test("0-A1: 기간이 열린 날 카드에서 사라지지 않는다 — 시작(date)이 지났어도 끝(endOf)이 오늘 이후면 유지, 끝이 지나면 제외", () => {
  const birth = new Date(2019, 5, 1);
  const open = { isEngineEvent: true, date: new Date(2026, 9, 1), windowEnd: new Date(2026, 10, 30), detail: { definition: { todo_id: "HC-08" } } };
  assert.ok(open.date < T0, "옛 필터(date ≥ 오늘)는 이 항목을 뺐다");
  assert.strictEqual(CT.isOpenAutoItem(open, birth, T0), true);
  assert.strictEqual(CT.isOpenAutoItem({ ...open, windowEnd: new Date(2026, 8, 30) }, birth, T0), false);
  const subsidy = { isLegacySubsidy: true, date: new Date(2026, 2, 1), deadlineDate: null, maxAgeMonths: 155, detail: { deadlineType: "ongoing" } };
  assert.strictEqual(CT.isOpenAutoItem(subsidy, birth, T0), true, "상시 지원금은 연령 상한 안이면 유지");
  assert.strictEqual(CT.isOpenAutoItem({ ...subsidy, maxAgeMonths: 60 }, birth, T0), false);
  assert.ok(/ChildTimeline\.isOpenAutoItem\(e, profile\.birthDate, t0\)/.test(APP), "홈 카드가 이 판정을 쓴다");
});

test("0-A3: 마감일이 있는 지역 지원금만 일정 넣기 가능(날짜=마감일), 마감 없는 건 불가", () => {
  const withDl = { id: "SEOUL-001", category: "행정·지원금", isLegacySubsidy: true, deadlineDate: new Date(2026, 11, 31), detail: { id: "SEOUL-001" } };
  assert.strictEqual(AS.isFamilyLinkable(withDl, () => false), true);
  assert.strictEqual(AS.isFamilyLinkable({ ...withDl, deadlineDate: null }, () => false), false);
  assert.strictEqual(AS.autoRefOf(withDl), "SEOUL-001__default");
});

test("0-B1: 36개월 이상 홈 머리 줄(이름 · 나이(초N) · 지역)", () => {
  const h = OV.renderHome({ kids: [], name: "은찬", headText: "은찬 · 10세(초4) · 구로구", familyHtml: "", autoItems: [], todos: { open: [], done: [] }, canTodo: true });
  assert.ok(h.includes('<p class="home-child-line">은찬 · 10세(초4) · 구로구</p>'));
  assert.ok(!OV.renderHome({ kids: [], name: "", familyHtml: "", autoItems: [], todos: { open: [], done: [] } }).includes("home-child-line"));
  assert.ok(/function acct36HeadText\(\)/.test(APP));
});

test("0-B2: SC·CR 정의는 관찰 항목이 아니다(상세에 '관찰 포인트' 라벨 없음) — 분류 코드로 가른다", () => {
  assert.ok(/const isObservationType = isObservationDetail\(e, td\);/.test(APP) && /function isObservationDetail\(e, td\) \{[^}]*"SC"[^}]*"CR"[^}]*return false;/.test(APP));
});

test("0-B3: 어디갈까 기준 줄과 데이터 0인 분류 칩 숨김", () => {
  const html = PV.render({ places: [], category: "ALL", filters: {}, basis: { name: "수아", age: "8개월", region: "구로구" }, catCounts: { PARK: 3 } });
  assert.ok(html.includes('<p class="places-basis">수아(8개월) · 구로구 기준</p>'));
  const chips = [...html.matchAll(/data-places-cat="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(chips.includes("ALL") && chips.includes("PARK") && chips.length === 2, chips.join(","));
  const all = PV.render({ places: [], category: "ALL", filters: {} });
  assert.ok(!all.includes("places-basis") && (all.match(/data-places-cat=/g) || []).length > 2, "정보가 없으면 기존 그대로");
});

test("0-B4: 교육 트렌드 빈 틀 한 문장, 숫자·통계 없음", () => {
  const h = OV.renderTrend({ region: "구로구", gradeLabel: "초4", inRange: true, mine: { count: 0, lessons: [] }, status: { key: "INSUFFICIENT", label: "데이터 부족" } });
  assert.ok(h.includes("트렌드는 데이터가 모이면 여기에 나와요.") && !h.includes("a36t-ghost") && !h.includes("<h4>"));
});

const kids = [{ memberId: "m1", role: "MOM", label: "엄마" }, { memberId: "m2", role: "DAD", label: "아빠" }];
const links = [{ childKey: "c1", displayName: "수아", colorKey: "p2" }];
const ctx = { links, meId: "m1", ageOf: () => 8 };
const form = () => { const f = V.newForm({ date: "2026-10-06", activeChildKey: "c1", links, defaultAssigneeId: "m1" }); return V.upgradeFormG13(f, ctx); };

test("0-C1→D40: '담당' 입력 칩은 없앴다(누구 일정 칩 하나로 정함). 옛 일정 카드·상세의 담당 이름 표시는 그대로 읽힌다", () => {
  const f = form(); V.g13ApplyWho(f, "CHILD:c1", ctx);
  const h = V.renderFormG13(f, links, { members: kids, ctx });
  assert.ok(!h.includes("누가 데려가나요?") && !h.includes("data-us-assignee"));
  assert.ok(V.renderCard({ key: "k", scheduleId: "s", title: "치과", categoryLabel: "병원", timeText: "", dateText: "", tag: "수아", assigneeText: "아빠", color: "#aaa" }).includes("담당 아빠"));
});

test("0-C2: '예방접종' 종류를 고르면 미완료 접종·검진 후보 칩(자동 선택 없음), 고르지 않고 직접 입력도 가능", () => {
  const f = form(); f.kindPick = "예방접종";
  const h = V.renderFormG13(f, links, { members: kids, ctx, autoCandidates: [{ id: "VX-MMR__dose-1", title: "MMR 1차" }, { id: "HC-02__default", title: "영유아 검진 2차" }] });
  assert.ok(h.includes("data-us-autocand") && h.includes('data-us-autoref="VX-MMR__dose-1"') && h.includes("직접 입력해도 돼요"));
  assert.ok(!/us-chip active"[^>]*data-us-autoref/.test(h), "후보는 자동으로 선택되지 않는다");
  f.kindPick = "병원·검진";
  assert.ok(!V.renderFormG13(f, links, { members: kids, ctx, autoCandidates: [{ id: "x", title: "x" }] }).includes("data-us-autocand"));
  assert.ok(/data-us-autoref/.test(APP) && /usOpenFormFromAuto\(e\)/.test(APP), "고르면 기존 예약 폼(제목·분류·아이·autoRef, 날짜 비움)으로 이어진다");
});
