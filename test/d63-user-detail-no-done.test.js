// D63: 직접 추가한 일정(USER) 상세에는 '완료했어요' 버튼이 없다. 자동(AUTO) 일정 상세·할 일 체크는 그대로.
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const V = require("../js/user-schedule-view.js");
const read = (f) => fs.readFileSync(path.join(__dirname, "..", f), "utf8");
let passed = 0;
function test(name, fn) { try { fn(); passed++; console.log("  ok  - " + name); } catch (e) { console.log("  FAIL - " + name + "\n" + e.stack); process.exitCode = 1; } }
const card = { key: "k", scheduleId: "s", title: "t", categoryLabel: "", timeText: "", dateText: "", tag: "", color: "#f4e07c" };

test("사용자 일정 상세(단일·반복): 미완료면 완료 버튼 없음(수정·삭제·닫기만), 이미 완료면 '완료 취소'만 남아 되돌릴 수 있고 '완료' 배지 유지", () => {
  for (const rec of [false, true]) {
    const ids = (done) => V.detailView({ ...card, recurring: rec, done }).actions.map((a) => a.id);
    assert.deepStrictEqual(ids(false), ["edit", "delete", "close"]);
    assert.deepStrictEqual(ids(true), ["toggle-done", "edit", "delete", "close"]);
  }
  const html = V.renderDetail({ ...card, done: true });
  assert.ok(html.includes(">완료 취소<") && html.includes('<span class="us-done">완료</span>') && !html.includes(">완료했어요<"));
  assert.ok(!V.renderDetail({ ...card, done: false }).includes("완료했어요"));
});
test("자동(AUTO) 일정 상세의 완료 버튼과 할 일(메모장) 체크는 코드에 그대로 있다", () => {
  const app = read("js/app.js");
  assert.ok(app.includes('id="btn-toggle-complete"') || app.includes("btn-toggle-complete"));
  assert.ok(read("js/over36-view.js").includes("data-a36-toggle"));
});
test("D66: 구성원('나') 일정 상세의 대상 = 그 구성원 이름, 담당 행·'담당' 글자 없음 / 가족 전체 = 가족 일정 / 옛 담당 값이 있는 아이 일정은 그대로 대상=아이", () => {
  const base = { title: "t", categoryLabel: "건강", dateText: "10/6", timeText: "", color: "#aaa", location: "", memo: "", done: false };
  const me = V.renderDetail({ ...base, scope: "FAMILY", tag: "나", targetText: "나", assigneeText: "나" });
  assert.ok(/<div class="label">대상<\/div>나<\/div>/.test(me) && !me.includes(">담당<") && !me.includes("가족 일정"));
  const fam = V.renderDetail({ ...base, scope: "FAMILY", tag: "가족 일정", targetText: "가족 일정", assigneeText: "" });
  assert.ok(/<div class="label">대상<\/div>가족 일정<\/div>/.test(fam));
  const kid = V.renderDetail({ ...base, scope: "CHILD", tag: "수아", targetText: "수아", assigneeText: "아빠" });
  assert.ok(/<div class="label">대상<\/div>수아<\/div>/.test(kid) && !kid.includes(">담당<") && !V.renderCard({ key: "k", scheduleId: "s", title: "t", categoryLabel: "", timeText: "", dateText: "", tag: "수아", assigneeText: "아빠", color: "#aaa" }).includes("담당"));
  assert.strictEqual(V.tagText({ scope: "FAMILY", assigneeLabel: "나" }), "나");
  assert.strictEqual(V.tagText({ scope: "FAMILY", assigneeLabel: "(삭제된 담당자)" }), V.MSG.deletedMember);
});
console.log(`\n${passed}개 통과`);
