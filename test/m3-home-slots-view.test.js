const test = require("node:test"), assert = require("node:assert");
const V = require("../js/home-slots-view.js");
const T = new Date(2026, 9, 5);
const u = (o) => ({ key: "k", ids: ["k"], title: "BCG 접종", type: "ACT", level: "L1", rule: "L1", daysToEnd: 13, actionKind: "schedule", applyUrl: "", items: [{ category: "예방접종" }], reason: { rule: "L1", key: "last_chance", params: { days: 13 }, text: "지금이 마지막 기회예요 (13일 남음)" }, ...o });
test("3개월: ①·②·③ 슬롯, 버튼 1개씩, D-N, 와인 변수는 CSS", () => {
  const h = V.render({ now: [u(), u({ key: "k2", title: "건강검진", level: "L4", rule: "L4", daysToEnd: 40, actionKind: "apply", applyUrl: "https://x" })], soon: [u({ key: "s", type: "ACT", level: "L6", rule: "L6", reason: { key: "starting_soon", text: "곧" }, items: [{ windowStart: new Date(2026, 9, 20) }] })], know: [u({ key: "n", type: "KNOW", level: "L5", rule: "L5", reason: { key: "know_now", text: "이 시기에 알아두면 좋아요" } })], moreCounts: { now: 2, soon: 0, know: 1 } }, { today: T, head: { name: "은찬", ageText: "생후 3개월", region: "구로구" }, benefits: { count: 4, check: 1 } });
  assert.match(h, /D-13 · 10월 18일까지/); assert.match(h, /data-hs-act="apply"[^>]*data-hs-url|data-hs-url[^>]*data-hs-act/); assert.equal((h.match(/class="hs-act"/g) || []).length, 2);
  assert.match(h, /10월 20일부터/); assert.match(h, /지금 꼭 할 것 2개 더/); assert.match(h, /이 시기 알아두기 1개 더/); assert.match(h, /받을 수 있는 혜택 4개 · 확인할 것 1개/);
  assert.equal((h.match(/hs-dot on/g) || []).length, 1); assert.ok(h.indexOf("hs-s-now") < h.indexOf("hs-s-fam") && h.indexOf("hs-s-fam") < h.indexOf("hs-s-soon") && h.indexOf("hs-s-soon") < h.indexOf("hs-s-know"));
});
test("21개월 빈 ①: 빈 상태 문구+다음 줄, 점은 가족 일정, ③ 비면 숨김, 슬롯 자르지 않음", () => {
  const h = V.render({ now: [], soon: [], know: [], moreCounts: {} }, { today: T, head: { name: "서윤", ageText: "2세" }, nextStage: { title: "곧 3~5세" } });
  assert.match(h, /이번 달 꼭 할 것은 없어요/); assert.match(h, /다음: 곧 3~5세/); assert.doesNotMatch(h, /hs-s-soon|hs-s-know/);
  assert.match(h, /hs-s-fam[^]*?hs-dot on|hs-dot on[^]*?hs-s-fam/); assert.match(h, /앞으로 7일 안에/);
  const five = V.render({ now: [1, 2, 3, 4, 5].map((i) => u({ key: "q" + i })), soon: [], know: [], moreCounts: {} }, { today: T });
  assert.equal((five.match(/class="hs-row"/g) || []).length, 5);
});
test("초3: 혜택 줄만 있어도 알아두기 마디 유지, 이스케이프, 순수", () => {
  const cur = { now: [], soon: [], know: [], moreCounts: {} };
  const o = { today: T, head: { name: "<b>x</b>", ageText: "초3" }, benefits: { count: 2 }, explore: [{ title: "교육 트렌드", go: "edu" }] };
  const a = V.render(cur, o), b = V.render(cur, o);
  assert.equal(a, b); assert.match(a, /hs-s-know/); assert.doesNotMatch(a, /<b>x<\/b>/); assert.match(a, /hs-exp/);
});
test("N개 더 펼침: cur.overflow 의 숨은 항목이 보인다(개수 일치)", () => {
  const over = [u({ key: "o1", title: "숨은 일 A" }), u({ key: "o2", title: "숨은 일 B" })];
  const h = V.render({ now: [u()], soon: [], know: [], moreCounts: { now: 2 }, overflow: { now: over, soon: [], know: [] } }, { today: T });
  assert.match(h, /지금 꼭 할 것 2개 더/); assert.match(h, /숨은 일 A/); assert.match(h, /숨은 일 B/);
});
