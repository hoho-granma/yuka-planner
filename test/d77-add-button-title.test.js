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
  assert.ok(/\.modal-panel:has\(\.us-form\) #us-title \{ background: var\(--bg\); border: 0;/.test(CSS) && /#us-title:focus-visible \{ outline: 2px solid var\(--us-fx-deep, var\(--c-select-border\)\)/.test(CSS)); // D75 B: 포커스 선은 구성원 진한 색
  assert.ok(/:is\(input:not\(#us-title\), textarea, select\)[^}]*border: 1\.5px solid var\(--line\)/.test(CSS));
  const V = fs.readFileSync(path.join(__dirname, "../js/user-schedule-view.js"), "utf8");
  assert.strictEqual((V.match(/id="us-title"/g) || []).length, 2);
});
test("저장 버튼 변수 == 선택 칩 변수: 구성원·아이=칩 색·자동 글자색, 가족 전체·미선택=노랑 토큰(주색으로 나오지 않음)", () => {
  const U = require("../js/user-schedule-view.js"), links = [{ childKey: "c1", displayName: "은찬", order: 1 }];
  const members = [{ memberId: "m1", label: "엄마", role: "MOM" }], O = { members, ctx: { meId: "m1" } };
  const root = (h) => (h.match(/<div class="us-form[^>]*? style="([^"]*)"/) || [])[1];
  const YEL = "--us-fx:var(--nd-yellow);--us-fx-ink:var(--nd-ink);--us-fx-line:var(--nd-yellow-line)";
  const chipVars = (h, attr) => { const m = new RegExp('<button[^>]*class="us-chip active"[^>]*' + attr + '[^>]*style="--us-color:(#[0-9a-f]{6});--us-ink:(#[0-9a-f]{6})"').exec(h); return m ? m[1] + "|" + m[2] : null; };
  const fx = (st) => { const m = /--us-fx:(#[0-9a-f]{6});--us-fx-ink:(#[0-9a-f]{6});--us-fx-line:(#[0-9a-f]{6})/.exec(st); return m ? m[1] + "|" + m[2] + "|" + m[3] : null; };
  const fam = U.renderFormG13({ mode: "create", scope: "FAMILY", dateKind: "FIXED", title: "" }, links, O);
  assert.strictEqual(root(fam), YEL);
  assert.ok(/class="us-chip active" data-us-who="FAMILY"/.test(fam) && !/data-us-who="FAMILY" style=/.test(fam), "가족 전체 활성 칩은 색 변수 없음 → 칩 CSS 의 노랑");
  const none = U.renderForm({ mode: "create", dateKind: "FIXED", title: "" }, links, {});
  assert.strictEqual(root(none), YEL);
  const kid = U.renderFormG13({ mode: "create", scope: "CHILD", childKeys: ["c1"], dateKind: "FIXED", title: "" }, links, O);
  const kc = chipVars(kid, 'data-us-who="CHILD:c1"'); assert.ok(kc);
  const [c1, i1] = kc.split("|"); assert.strictEqual(fx(root(kid)), [c1, i1, c1].join("|"));
  const mem = U.renderFormG13({ mode: "create", scope: "FAMILY", whoPerson: true, assigneeMemberId: "m1", dateKind: "FIXED", title: "" }, links, O);
  const mc = chipVars(mem, 'data-us-who="MEMBER:m1"'); assert.ok(mc);
  const [c2, i2] = mc.split("|"); assert.strictEqual(fx(root(mem)), [c2, i2, c2].join("|"));
  const old = U.renderForm({ mode: "create", scope: "CHILD", childKeys: ["c1"], dateKind: "FIXED", title: "" }, links, {});
  assert.strictEqual(fx(root(old)), [kc.split("|")[0], kc.split("|")[1], kc.split("|")[0]].join("|"));
  assert.ok(/\[data-us-action="save"\] \{ background: var\(--us-fx, var\(--nd-yellow\)\); color: var\(--us-fx-ink, var\(--nd-ink\)\); border: 1\.5px solid var\(--us-fx-line, var\(--nd-yellow-line\)\)/.test(CSS));
  assert.ok(!/save"\] \{[^}]*--nd-indigo/.test(CSS), "저장 버튼이 주색으로 폴백하지 않는다");
});
process.exit(fail ? 1 : 0);
