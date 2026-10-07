const { test } = require("node:test");
const assert = require("node:assert/strict");
const G = require("../js/growth-records.js");
const E = require("../js/edu-trend.js");
const base = { group: "academy", activity: "피아노", title: "두 손으로 끝까지 연주했어요", text: "선생님 메시지\n오늘은 끝까지 이어서 쳤어요.", date: "2026-10-04" };
test("36개월 경계, 임신·아이 없음·나이 모름은 성장기록 제외", () => {
  assert.equal(G.eligible({ stage: "born" }, 35), false);
  assert.equal(G.eligible({ stage: "born" }, 36), true);
  assert.equal(G.eligible({ stage: "pregnant" }, 40), false);
  assert.equal(G.eligible(null, 40), false);
  assert.equal(G.eligible({}, null), false);
});
test("메시지 원문과 날짜 유지, 아이·계정 범위 분리, 날짜 내림차순", () => {
  const a = G.prepare(base, "user-a/child-a", 10);
  const b = G.prepare({ ...base, date: "2026-09-28" }, "user-a/child-a", 20);
  const otherChild = G.prepare(base, "user-a/child-b", 30);
  const otherUser = G.prepare(base, "user-b/child-a", 40);
  assert.equal(a.text, base.text);
  assert.deepEqual(G.list([b, otherChild, otherUser, a], a.scope, "academy", "피아노"), [a, b]);
  assert.deepEqual(G.list([a], a.scope, "school"), []);
});
test("존재하지 않는 날짜·빈 기록·잘못된 분류·과대 첨부는 저장 거부", () => {
  assert.throws(() => G.prepare({ ...base, date: "2026-02-30" }, "a", 1));
  assert.throws(() => G.prepare({ ...base, text: "" }, "a", 1));
  assert.throws(() => G.prepare({ ...base, group: "bad" }, "a", 1));
  assert.throws(() => G.prepare({ ...base, image: { type: "image/png", size: 16 * 1024 * 1024 } }, "a", 1));
  const image = new Blob(["image"], { type: "image/png" });
  assert.equal(G.prepare({ ...base, text: "", image }, "a", 1).image, image);
});
test("교육트렌드의 학원 일정과 같은 필터로 활동 연결, 중복 없이 기록 없는 활동도 표시", () => {
  const docs = [
    { id: "p", category: "LESSON", scope: "CHILD", childKeys: ["a"], title: "피아노", recurrence: { byDay: ["MO", "WE"] } },
    { id: "s", category: "LESSON", scope: "CHILD", childKeys: ["a"], title: "수영" },
    { id: "other", category: "LESSON", scope: "CHILD", childKeys: ["b"], title: "영어" },
    { id: "deleted", category: "LESSON", scope: "CHILD", childKeys: ["a"], title: "미술", deletedAt: 1 },
    { id: "cancelled", category: "LESSON", scope: "CHILD", childKeys: ["a"], title: "태권도", status: "CANCELLED" }
  ];
  const mine = E.myLessons(docs, ["a"]);
  const records = [G.prepare(base, "scope", 1)];
  assert.deepEqual(G.linkedActivities(records, "scope", "academy", mine.lessons), ["수영", "피아노"]);
  assert.equal(mine.lessons.find((l) => l.title === "피아노").weekly, 2);
  assert.deepEqual(G.list(records, "scope", "academy", "수영"), []);
  assert.deepEqual(G.linkedActivities(records, "scope", "school", mine.lessons), []);
  assert.deepEqual(G.linkedActivities(records, "scope", "academy", []), ["피아노"]);
});
test('메인 잎만 표시, 저장 기록으로 크기 결정, 아이 범위 유지', () => {
  const records = [G.prepare(base, 'a', 1), G.prepare({...base,title:'다른 순간'}, 'a', 2), G.prepare({...base,group:'home',activity:'요리'}, 'other', 3)];
  const html = G.treeMarkup(records,'a',[{title:'독서'}],'수아','academy','');
  assert.equal((html.match(/data-gr-group=/g)||[]).length,4);
  assert.equal((html.match(/data-gr-activity=/g)||[]).length,0);
  assert.ok(html.includes('data-gr-record-count="2"'));
  assert.ok(html.includes('0개 기록'));
  assert.ok(!html.includes('요리'));
  const noLessons = G.treeMarkup(records,'a',[],'수아','academy','');
  assert.equal(html,noLessons);
  const other = G.treeMarkup(records,'other',[],'다른 아이','home','');
  assert.ok(other.includes('data-gr-record-count="1"'));
  assert.ok(html.includes('tabindex="0"'));
});
test('아이 이름은 마크업으로 실행되지 않음',()=>{
  const html=G.treeMarkup([],'a',[],'<img src=x onerror=alert(1)>','academy','');
  assert.ok(!html.includes('<img src=x'));
  assert.ok(html.includes('&lt;img'));
});
