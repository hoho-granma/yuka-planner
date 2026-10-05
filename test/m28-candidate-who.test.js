/* D40: 붙여넣기·사진 후보 카드의 '누구 일정' 칩(아이·구성원·가족 전체) → 저장 필드. 실행: node test/m28-candidate-who.test.js */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const M = require("../js/capture/capture-model.js");
const DV = require("../js/capture/draft-view.js");
const V = require("../js/user-schedule-view.js");
const read = (f) => fs.readFileSync(path.join(__dirname, "..", f), "utf8");
let passed = 0;
function test(name, f) { try { f(); passed++; console.log("  ok  - " + name); } catch (e) { process.exitCode = 1; console.log("  FAIL- " + name + "\n      " + (e.stack || e).split("\n").slice(0, 3).join("\n      ")); } }
const base = () => V.newForm({ date: "", activeChildKey: "c1", links: [{ childKey: "c1" }, { childKey: "c2" }], defaultAssigneeId: "" });
const WHO = [{ key: "CHILD:c1", label: "하린" }, { key: "CHILD:c2", label: "서윤" }, { key: "MEMBER:m1", label: "나" }, { key: "MEMBER:m2", label: "아빠" }, { key: "FAMILY", label: "가족" }];

test("기본 '누구': 글에서 찾은 아이가 있으면 그 아이, 없으면 지금 보는 아이(없으면 가족 전체), 사용자가 고른 값은 덮지 않는다", () => {
  const s = { cands: [{ title: "a" }, { title: "b", childKeys: ["c2"] }, { title: "c", who: "MEMBER:m2" }] };
  M.withDefaultWho(s, "CHILD:c1"); assert.deepStrictEqual(s.cands.map((c) => c.who), ["CHILD:c1", "CHILD:c2", "MEMBER:m2"]);
  const t = { cands: [{ title: "x" }] }; M.withDefaultWho(t, ""); assert.strictEqual(t.cands[0].who, "FAMILY");
});
test("칩 선택 → 저장 입력: 아이=CHILD+childKeys(담당 없음), 구성원=FAMILY+assigneeMemberId, 가족 전체=FAMILY(담당 없음)", () => {
  const input = (who) => V.formToInput(M.formFromCandidate({ title: "치과", eventDate: "2026-10-14", who }, base()));
  const kid = input("CHILD:c2"); assert.deepStrictEqual([kid.scope, kid.childKeys, "assigneeMemberId" in kid], ["CHILD", ["c2"], false]);
  const mem = input("MEMBER:m2"); assert.deepStrictEqual([mem.scope, mem.assigneeMemberId, "childKeys" in mem], ["FAMILY", "m2", false]);
  const fam = input("FAMILY"); assert.deepStrictEqual([fam.scope, "assigneeMemberId" in fam, "childKeys" in fam], ["FAMILY", false, false]);
  const none = M.formFromCandidate({ title: "치과", eventDate: "2026-10-14" }, base()); assert.strictEqual(none.scope, "CHILD", "who 가 없으면 기존 동작(폼 기본 대상)");
});
test("후보 카드: '누구 일정' 칩 줄(선택됨 표시·data-cap-who), '담당 미정' 칩은 없고, whoOptions 가 없으면 옛 마크업 그대로", () => {
  const s = { cands: [{ title: "치과", eventDate: "2026-10-14", allDay: true, who: "MEMBER:m1", index: 0 }] };
  const h = DV.renderCandidates(s, { whoOptions: WHO });
  assert.ok(/aria-label="누구 일정"/.test(h) && /us-chip us-chip-sm active" data-cap-who="0" data-cap-who-key="MEMBER:m1" aria-pressed="true">나</.test(h) && /data-cap-who-key="FAMILY"[^>]*>가족</.test(h));
  assert.ok(!h.includes("담당 미정"));
  const old = DV.renderCandidates(s, {}); assert.ok(old.includes("담당 미정") && !old.includes("data-cap-who"));
});
test("후보 → 폼 인계(capKeep)와 등록 경로가 '누구'를 그대로 쓴다·붙여넣기·사진은 같은 화면(후보 카드 하나)", () => {
  const APP = read("js/app.js");
  assert.ok(/capShowCands = \(\) => \{ CaptureModel\.withDefaultWho\(CAP\.s, capDefaultWho\(\)\); capShow\(CaptureDraftView\.renderCandidates\(CAP\.s, \{ childName: capChildName, whoOptions: capWhoOptions\(\)/.test(APP));
  assert.ok(/data-cap-who\]"/.test(APP) || /\[data-cap-who\]/.test(APP)); assert.ok(APP.includes('if (t.hasAttribute("data-cap-who"))'));
  assert.ok(APP.includes("Object.assign(us.form, us.form.capKeep); delete us.form.capKeep;"));
});
console.log(`\n${passed} passed`);
