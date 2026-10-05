// 마감 표기(hn_pm #1): '마감'은 신청 기한에만, 나이 상한은 '○○년 ○월까지 받을 수 있어요', 올해 안 6개월 이내는 M월 D일·해 넘김/6개월 초과는 연도. 실행: node --test test/m12-deadline-text.test.js
const test = require("node:test"), assert = require("node:assert");
const V = require("../js/home-slots-view.js");
const today = new Date(2026, 9, 5);
const unit = (dt, days, extra) => ({ key: "k", title: "아동수당", type: "ACT", rule: "L4", daysToEnd: days, actionKind: "apply", reason: { key: "x", text: "" }, items: [{ id: "SB-04", detail: { deadlineType: dt } }], ...extra });
const html = (u) => V.render({ now: [], soon: [u], know: [], moreCounts: {} }, { today, family: null });
test("신청 기한(soon): 올해 안 → M월 D일 마감, 해 넘김 → 연도 포함", () => {
  assert.ok(html(unit("birth_relative_days", 20, { reason: { key: "deadline_soon", text: "" } })).includes("10월 25일 마감"));
  assert.ok(html(unit("birth_relative_days", 100, { reason: { key: "deadline_soon", text: "" } })).includes("2027년 1월 13일 마감"));
});
test("나이 상한(age_window): '마감' 없이 ○○년 ○월까지 받을 수 있어요", () => {
  const h = html(unit("age_window", 400, { reason: { key: "deadline_soon", text: "" } }));
  assert.ok(h.includes("2027년 11월까지 받을 수 있어요") && !/마감<|마감\b/.test(h.replace(/아동수당/g, "")), h);
});
