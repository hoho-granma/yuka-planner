const assert = require("assert"), fs = require("fs"), path = require("path");
const CSS = fs.readFileSync(path.join(__dirname, "../css/style.css"), "utf8");
let fail = 0;
function test(n, f) { try { f(); console.log("  ok  -", n); } catch (e) { fail++; console.log("  FAIL-", n, "\n", e.message); } }
const rule = (sel) => { const i = CSS.indexOf(sel + " {"); assert.ok(i >= 0, sel); return CSS.slice(i + sel.length + 2, CSS.indexOf("}", i)); };
test("캘린더 .us-add 는 홈 .home-more 와 같은 색 토큰(--nd-soft 면·--nd-ink 글자·--nd-soft 테두리)", () => {
  const home = rule(":is(#tab-home, #empty-panel) .sec-us-upcoming .home-more"), cal = rule(".us-btn.us-primary.us-add");
  ["background", "color", "border-color"].forEach((k) => {
    const g = (t) => (t.match(new RegExp("(?:^|[ ;])" + k + ": ([^;]+);")) || [])[1];
    assert.ok(g(home) && g(home) === g(cal), k + " " + g(home) + " / " + g(cal));
  });
});
test(".us-add 한정: 다른 .us-primary 규칙은 건드리지 않는다", () => {
  assert.ok(/\.us-btn\.us-primary\.us-add \{/.test(CSS) && !/\n\.us-btn\.us-primary \{[^}]*--nd-soft/.test(CSS));
});
test("제목 입력칸만 테두리 없음(연한 면), 포커스 때만 선, 다른 입력칸 규칙 유지, 제목 id 는 두 폼 공통", () => {
  assert.ok(/\.modal-panel:has\(\.us-form\) #us-title \{ background: var\(--bg\); border: 0;/.test(CSS) && /#us-title:focus-visible \{ outline: 2px solid var\(--c-select-border\)/.test(CSS));
  assert.ok(/:is\(input:not\(#us-title\), textarea, select\)[^}]*border: 1\.5px solid var\(--line\)/.test(CSS));
  const V = fs.readFileSync(path.join(__dirname, "../js/user-schedule-view.js"), "utf8");
  assert.strictEqual((V.match(/id="us-title"/g) || []).length, 2);
});
test("저장 버튼 색 = 선택한 '누구'(--us-fx), 없으면 기존 주색", () => {
  const U = require("../js/user-schedule-view.js"), links = [{ childKey: "c1", displayName: "은찬", order: 1 }];
  const members = [{ memberId: "m1", label: "엄마", role: "MOM" }];
  const fam = U.renderFormG13({ mode: "create", scope: "FAMILY", dateKind: "FIXED", title: "" }, links, { members, ctx: { meId: "m1" } });
  assert.ok(fam.includes('style="--us-fx:' + U.familyColor() + ";--us-fx-ink:" + U.inkOn(U.familyColor()) + '"'));
  const kid = U.renderFormG13({ mode: "create", scope: "CHILD", childKeys: ["c1"], dateKind: "FIXED", title: "" }, links, { members, ctx: { meId: "m1" } });
  const kc = U.childColors(links).c1;
  assert.ok(kid.includes("--us-fx:" + kc + ";--us-fx-ink:" + U.inkOn(kc)));
  const mem = U.renderFormG13({ mode: "create", scope: "FAMILY", whoPerson: true, assigneeMemberId: "m1", dateKind: "FIXED", title: "" }, links, { members, ctx: { meId: "m1" } });
  assert.ok(mem.includes("--us-fx:" + U.memberColor(members[0])));
  const old = U.renderForm({ mode: "create", scope: "CHILD", childKeys: ["c1"], dateKind: "FIXED", title: "" }, links, {});
  assert.ok(old.includes("--us-fx:" + kc));
  assert.ok(!U.renderForm({ mode: "create", dateKind: "FIXED", title: "" }, links, {}).includes("--us-fx"));
  assert.ok(/\.modal-panel:has\(\.us-form\) \.us-form \.us-actions \.us-btn\.us-primary\[data-us-action="save"\] \{ background: var\(--us-fx, var\(--nd-indigo\)\); color: var\(--us-fx-ink, var\(--on-accent\)\)/.test(CSS));
});
process.exit(fail ? 1 : 0);
