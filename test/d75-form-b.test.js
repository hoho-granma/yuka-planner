const assert = require("assert"), fs = require("fs"), path = require("path");
const V = require("../js/user-schedule-view.js");
const CSS = fs.readFileSync(path.join(__dirname, "../css/style.css"), "utf8");
let fail = 0;
function test(n, f) { try { f(); console.log("  ok  -", n); } catch (e) { fail++; console.log("  FAIL-", n, "\n", e.stack.split("\n").slice(0, 3).join("\n")); } }
const LINKS = [{ childKey: "c1", displayName: "수아", order: 1 }], members = [{ memberId: "m1", label: "엄마", role: "MOM" }, { memberId: "m2", label: "아빠", role: "DAD" }];
const O = { members, ctx: { meId: "m1" } };
const head = (h) => (/<div class="us-fx-head"><h3>([^<]*)<\/h3>(?:<span class="us-fx-who"><i><\/i>([^<]*)<\/span>)?<\/div>/.exec(h) || []).slice(1);
test("헤더: 두 폼 모두 제목 + 선택 칩 라벨 알약(나·아빠·아이 이름·가족)", () => {
  const g = (o) => V.renderFormG13({ mode: "create", scope: "FAMILY", dateKind: "FIXED", title: "", ...o }, LINKS, O);
  assert.deepStrictEqual(head(g({})), ["일정 추가", "가족"]);
  assert.deepStrictEqual(head(g({ whoPerson: true, assigneeMemberId: "m1" })), ["일정 추가", "나"]);
  assert.deepStrictEqual(head(g({ whoPerson: true, assigneeMemberId: "m2" })), ["일정 추가", "아빠"]);
  assert.deepStrictEqual(head(g({ scope: "CHILD", childKeys: ["c1"], mode: "edit" })), ["일정 수정", "수아"]);
  assert.deepStrictEqual(head(V.renderForm({ mode: "create", scope: "CHILD", childKeys: ["c1"], dateKind: "FIXED", title: "" }, LINKS, {})), ["일정 추가", "수아"]);
  assert.deepStrictEqual(head(V.renderForm({ mode: "create", scope: "FAMILY", dateKind: "FIXED", title: "" }, LINKS, {})), ["일정 추가", "가족"]);
});
test("CSS: 헤더 면=--us-fx, 시트 흰 면, 진한 포커스색 --us-fx-deep, 활성 칩=--us-fx, 모든 규칙 .modal-panel:has(.us-form) 범위", () => {
  assert.ok(/\.modal-panel:has\(\.us-form\) \.us-fx-head \{[^}]*background: var\(--us-fx, var\(--nd-yellow\)\)/.test(CSS));
  assert.ok(/\.modal-panel:has\(\.us-form\) \.us-form \{ --us-fx-deep: color-mix\(in srgb, var\(--us-fx, var\(--nd-yellow\)\) 50%, var\(--chip-ink\)\)/.test(CSS));
  assert.ok(/\.us-chip\.active:not\(\[style\*="--us-color"\]\) \{ background: var\(--us-fx, var\(--nd-yellow\)\); border: 1\.5px solid var\(--us-fx-line, var\(--nd-yellow-line\)\); color: var\(--us-fx-ink, var\(--nd-ink\)\)/.test(CSS));
  assert.ok(/:focus-visible \{ border: 2px solid var\(--us-fx-deep, var\(--nd-indigo\)\); outline: none; \}/.test(CSS) && /\.tw-tm\.on \{ border-color: var\(--us-fx-deep\)/.test(CSS) && /\.us-check input \{ accent-color: var\(--us-fx-deep\)/.test(CSS));
  assert.ok(/\.us-recommend \.us-chip \{[^}]*var\(--us-fx-deep, var\(--nd-yellow-line\)\); color: var\(--nd-ink\)/.test(CSS));
});
process.exit(fail ? 1 : 0);
