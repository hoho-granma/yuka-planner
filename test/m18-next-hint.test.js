// 큐레이션 홈 빈 상태 '다음:' 줄(pending): 앞으로 올 시작·마감일의 N월만, 지난·날짜 없는 항목은 제외, 후보 없으면 다음 단계 문구 → 줄 숨김. 실행: HN_ROOT=<repo> node --test <this>
const test = require("node:test"), assert = require("node:assert");
const V = require(require("path").join(__dirname, "..") + "/js/home-slots-view.js");
const today = new Date(2026, 9, 5), D = (m, d) => new Date(2026, m - 1, d);
const unit = (title, o) => ({ key: title, title, type: "ACT", rule: "L5", daysToEnd: Infinity, actionKind: "apply", reason: { key: "x", text: "" }, items: [{ id: title, category: "생활·수유", detail: {}, ...(o && o.item) }], ...o });
const html = (soon, extra) => V.render({ now: [], soon, know: [], moreCounts: {} }, { today, family: null, ...extra });
test("마감일만 있는 항목도 N월(앞으로 올 때)", () => assert.ok(html([unit("아동수당 신청", { daysToEnd: 70 })]).includes("다음: 12월 아동수당 신청")));
test("시작일이 앞이면 시작 월, 시작이 지났고 마감이 앞이면 마감 월", () => {
  assert.ok(html([unit("입학준비금", { daysToEnd: 120, item: { entryDate: D(11, 2) } })]).includes("다음: 11월 입학준비금"));
  assert.ok(html([unit("접종", { daysToEnd: 40, item: { windowStart: D(8, 1) } })]).includes("다음: 11월 접종"));
});
test("여러 후보 중 가장 이른 날짜의 항목", () => {
  const h = html([unit("먼 것", { daysToEnd: 200 }), unit("가까운 것", { daysToEnd: 30 })]); assert.ok(h.includes("다음: 11월 가까운 것") && !/다음: \d+월 먼 것/.test(h));
});
test("이미 지난 항목·날짜 없는 항목은 후보가 아님 → 다음 단계 문구 → 줄 숨김", () => {
  const none = [unit("국민행복카드"), unit("지난 아동수당", { daysToEnd: -80 })];
  assert.ok(!html(none).includes("다음:"));
  assert.ok(html(none, { nextStage: { title: "다음은 내년 3월" } }).includes("다음: 다음은 내년 3월"));
});
test("nextHint 지정이 우선", () => assert.ok(html([unit("x", { daysToEnd: 30 })], { nextHint: "다음: 직접" }).includes("다음: 직접")));
