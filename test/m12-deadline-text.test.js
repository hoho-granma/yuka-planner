// 마감 표기(hn_pm #1): '마감'은 신청 기한에만, 나이 상한은 '○○년 ○월까지 받을 수 있어요', 올해 안 6개월 이내는 M월 D일·해 넘김/6개월 초과는 연도. 실행: node --test test/m12-deadline-text.test.js
const test = require("node:test"), assert = require("node:assert");
const V = require("../js/home-slots-view.js");
const today = new Date(2026, 9, 5);
const unit = (dt, days, extra) => ({ key: "k", title: "아동수당", type: "ACT", rule: "L4", daysToEnd: days, actionKind: "apply", reason: { key: "x", text: "" }, items: [{ id: "SB-04", category: "행정·지원금", detail: { deadlineType: dt } }], ...extra });
const html = (u) => V.render({ now: [], soon: [u], know: [], moreCounts: {} }, { today, family: null });
test("신청 기한(soon): 올해 안 → M월 D일 마감, 해 넘김 → 연도 포함", () => {
  assert.ok(html(unit("birth_relative_days", 20, { reason: { key: "deadline_soon", text: "" } })).includes("10월 25일 마감"));
  assert.ok(html(unit("birth_relative_days", 100, { reason: { key: "deadline_soon", text: "" } })).includes("2027년 1월 13일 마감"));
});
test("나이 상한(age_window): '마감' 없이 ○○년 ○월까지 받을 수 있어요", () => {
  const h = html(unit("age_window", 400, { reason: { key: "deadline_soon", text: "" } }));
  assert.ok(h.includes("2027년 11월까지 받을 수 있어요") && !/마감<|마감\b/.test(h.replace(/아동수당/g, "")), h);
});

const ent = (cat, def, dt) => ({ id: "X", category: cat, detail: { ...(dt ? { deadlineType: dt } : {}), ...(def ? { definition: { triggerType: def } } : {}) } });
const u2 = (item, days, rule) => ({ key: "k", title: "항목", type: "ACT", rule: rule || "L4", daysToEnd: days, actionKind: "apply", reason: { key: "deadline_soon", text: "" }, items: [item] });
const soon = (u) => V.render({ now: [], soon: [u], know: [], moreCounts: {} }, { today, family: null });
test("엔진 지원금 AGE_WINDOW(SB-04 0~108개월)도 나이 상한: '마감' 없이 ○○년 ○월까지 받을 수 있어요, 지난 날짜는 숨김", () => {
  const h = soon(u2(ent("행정·지원금", "AGE_WINDOW"), 1700)); assert.ok(h.includes("까지 받을 수 있어요") && !h.includes("마감"), h);
  const past = soon(u2(ent("행정·지원금", "AGE_WINDOW"), -80)); assert.ok(!/\d월/.test(past.replace(/아동수당/g, "")) && !past.includes("마감") && !past.includes("지금도 할 수 있어요"), past);
});
test("접종·검진·방문 권고 기간은 '마감' 대신 '까지', 이미 지난 날짜는 날짜 없이 '기한이 지났지만 지금도 할 수 있어요'", () => {
  const h = soon(u2(ent("예방접종", "AGE_WINDOW"), 700)); assert.ok(h.includes("2028년 9월 4일까지") && !h.includes("마감"), h);
  const p = soon(u2(ent("건강검진", null), -300)); assert.ok(p.includes("기한이 지났지만 지금도 할 수 있어요") && !/\d{4}년/.test(p) && !p.includes("마감"), p);
  const now = V.render({ now: [{ ...u2(ent("건강검진", null), 5, "L2"), rule: "L2" }], soon: [], know: [], moreCounts: {} }, { today, family: null }); assert.ok(now.includes("D-5 · 10월 10일까지") && !now.includes("마감"), now);
  const nowPast = V.render({ now: [{ ...u2(ent("건강검진", null), -3, "L2"), rule: "L2" }], soon: [], know: [], moreCounts: {} }, { today, family: null }); assert.ok(nowPast.includes("기한이 지났지만 지금도 할 수 있어요") && !/D-/.test(nowPast), nowPast);
});
test("신청 기한(지원금 birth_relative)은 그대로 '마감'", () => {
  assert.ok(soon(u2(ent("행정·지원금", null, "birth_relative_days"), 20)).includes("10월 25일 마감"));
});

test("SC-03(입학연기 신청, 지원금 분류 아님)은 신청 기한이라 '마감', 같은 학교 항목 SC-01은 '까지'", () => {
  const sc3 = soon(u2({ id: "SC-03__default", category: "생활·수유", detail: {} }, 20)), sc1 = soon(u2({ id: "SC-01__default", category: "생활·수유", detail: {} }, 20));
  assert.ok(sc3.includes("10월 25일 마감"), sc3); assert.ok(sc1.includes("10월 25일까지") && !sc1.includes("마감"), sc1);
});
