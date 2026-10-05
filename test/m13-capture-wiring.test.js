// 2-1 붙여넣기 연결: 후보→폼은 값만 옮기고(날짜·담당을 채우지 않음), 날짜 없는 후보는 등록하지 않으며, 원문은 저장하지 않는다. 실행: node --test test/m13-capture-wiring.test.js
const test = require("node:test"), assert = require("node:assert"), fs = require("fs"), path = require("path");
const P = require("../js/capture/parse-ko.js"), M = require("../js/capture/capture-model.js"), V = require("../js/user-schedule-view.js");
const app = fs.readFileSync(path.join(__dirname, "..", "js/app.js"), "utf8");
const today = new Date(2026, 9, 5);
test("후보→폼: 날짜·시각·반복을 그대로, 담당은 비움, 날짜 없는 후보는 등록 대상이 아님", () => {
  const cands = P.parse("10월 14일(수) 오후 3시 30분 하린 치과 예약입니다. 이번 달 안에 서류 내기", { today, children: [] });
  const s = M.fromParse(cands); const base = V.newForm({ date: "", activeChildKey: null, links: [], defaultAssigneeId: "" });
  const f = M.formFromCandidate(s.cands[0], base);
  assert.strictEqual(f.eventDate, s.cands[0].eventDate); assert.strictEqual(f.assigneeMemberId, ""); assert.ok(f.title.includes("치과"));
  assert.ok(M.registrable(s).every((c) => !!c.eventDate));
  const none = M.fromParse([{ title: "서류", eventDate: "" }]); assert.strictEqual(M.registrable(none).length, 0);
});
test("체크·빼기·되돌리기", () => {
  const s = M.fromParse([{ title: "a", eventDate: "2026-10-14" }]);
  M.toggle(s, 0); assert.strictEqual(M.registrable(s).length, 0); M.toggle(s, 0); M.remove(s, 0); assert.strictEqual(M.registrable(s).length, 0); M.undo(s); assert.strictEqual(M.registrable(s).length, 1);
});
test("앱 연결: 진입점은 새 일정 시트(계정 모드)에만, 저장은 기존 경로, 원문·localStorage·Firestore 직접 쓰기 없음", () => {
  const i = app.indexOf("// ═══ 2-1 붙여넣기로 추가"), blk = app.slice(i, app.indexOf("usSave = async function usSave()", i));
  assert.ok(/capInjectEntry\(\);\n  \};/.test(app) && blk.includes("acctEnabled()") && blk.includes("us.form.mode !== \"create\""));
  assert.ok(blk.includes("UserScheduleView.prepareSave") && blk.includes("UserSchedule.buildCreateDoc") && blk.includes("HouseholdSync.createSchedule"));
  assert.ok(!/localStorage|sessionStorage|setDoc|updateDoc|console\.log\(CAP/.test(blk));
});
