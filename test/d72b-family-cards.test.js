const assert = require("assert"), fs = require("fs"), path = require("path");
const AV = require("../js/account-view.js"), HV = require("../js/household-view.js");
const APP = fs.readFileSync(path.join(__dirname, "../js/app.js"), "utf8");
let fail = 0;
function test(n, f) { try { f(); console.log("  ok  -", n); } catch (e) { fail++; console.log("  FAIL-", n, "\n", e.message); } }
test("D72b: 얼굴은 버튼, 아이 등록 버튼, 카드 extraHtml·액션 순서", () => {
  const card = AV.renderFamCard({ kind: "child", name: "은찬", extraHtml: '<div class="enr">등록</div>', actions: [{ label: "수정", attrs: "a" }, { label: "삭제", attrs: "b", danger: true }] });
  assert.ok(card.indexOf('class="enr"') > 0 && card.indexOf("enr") < card.indexOf("fam-actions"));
  assert.ok(card.indexOf(">수정<") < card.indexOf(">삭제<") && card.includes("fam-actions fam-danger"));
  assert.strictEqual(AV.MSG.famAddChild, "아이 등록");
});
test("D72b: famPick·orphans·bare members", () => {
  assert.ok(APP.includes("async function famPick(") && APP.includes('fam-add-child') && APP.includes("beginNewChildEntry()"));
  assert.strictEqual(typeof HV.renderOrphans, "function");
  assert.ok(!/<h\d[^>]*>\s*<\/h\d>/.test(HV.renderMembers({ bare: true, members: [], me: null }) || ""));
});
process.exit(fail ? 1 : 0);
