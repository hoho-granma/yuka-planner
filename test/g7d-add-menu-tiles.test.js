/* G7-4 + 메뉴(B): 타일 3개 메뉴 + 접이식 시트(아이 등록하기·가족 추가), 초대 문구 미리보기. 실행: node test/g7d-add-menu-tiles.test.js */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const AV = require("../js/account-view.js");
const read = (f) => fs.readFileSync(path.join(__dirname, "..", f), "utf8");
const APP = read("js/app.js"), CSS = read("css/style.css");
let passed = 0;
function test(name, fn) { try { fn(); passed++; console.log("  ok  - " + name); } catch (e) { process.exitCode = 1; console.log("  FAIL- " + name + "\n      " + (e.stack || e).split("\n").slice(0, 4).join("\n      ")); } }
const fn = (name) => { const s = APP.indexOf(`  function ${name}(`); assert.ok(s >= 0, name); return APP.slice(s, APP.indexOf("\n  }\n", s) + 5); };

test("+ 메뉴: 타일 3개(일정 추가·아이 등록하기·가족 추가, 기존 버튼 id 유지), 가구가 없으면 일정 타일 비활성+안내", () => {
  const h = AV.renderAddMenu({ canSchedule: true });
  assert.deepStrictEqual([...h.matchAll(/id="(btn-add-menu-[a-z]+)" data-add-tab="(\w+)"/g)].map((m) => [m[1], m[2]]), [["btn-add-menu-schedule", "schedule"], ["btn-add-menu-child", "child"], ["btn-add-menu-invite", "invite"]]);
  assert.ok(["일정 추가", "아이 등록하기", "가족 추가"].every((t) => h.includes(`<span>${t}</span>`)) && h.includes('id="btn-add-menu-close"') && !/ disabled/.test(h) && !h.includes("acct-tile on"));
  const no = AV.renderAddMenu({ canSchedule: false });
  assert.ok(/id="btn-add-menu-schedule"[^>]*disabled/.test(no) && no.includes('id="add-menu-note"') && no.includes("먼저 프로필에서 가족 캘린더를 만들어 주세요"));
});
test("G10 아이 등록하기: 안내 시트 없이 바로 입력 폼(renderAddChild·[아이 입력하기] 삭제)", () => {
  assert.strictEqual(typeof AV.renderAddChild, "undefined");
  assert.ok(!/addChildGo|addChildLead|addChildFields/.test(JSON.stringify(AV.MSG)));
});
test("가족 추가 시트: 타일(가족 추가 선택) + 아빠/자녀/기타 라디오 + 초대 문구 미리보기 + [초대 보내기](역할 선택 전 비활성)", () => {
  const empty = AV.renderInvite({ code: "A8RZ7Q9X", role: "" });
  assert.ok(/acct-tile on" id="btn-add-menu-invite"/.test(empty) && empty.includes('data-acct-radio="inviteRole"') && empty.includes("역할을 고르면 보낼 초대 문구가 여기에 보여요.") && /data-acct-action="send-invite" disabled/.test(empty));
  const text = AV.inviteText("주연", "엄마", AV.inviteLink("A8RZ7Q9X", "DAD", "m1"), "A8RZ7Q9X");
  const h = AV.renderInvite({ code: "A8RZ7Q9X", role: "DAD", preview: text });
  assert.ok(h.includes("초대 문구 미리보기") && h.includes("주연(엄마)님이 한눈육아 가족 캘린더에 초대했어요<br>") && h.includes("가족코드: A8RZ7Q9X") && h.includes("?join=A8RZ7Q9X&amp;role=DAD&amp;from=m1") && !/send-invite" disabled/.test(h));
  assert.ok(!AV.renderInvite({ code: "A", role: "DAD", preview: "<img src=x>" }).includes("<img"), "이스케이프");
  assert.ok(!AV.renderInvite({}).includes("acct-tiles"), "가구 없으면 기존 안내만");
});
test("미리보기는 실제로 보내는 문구와 같다(acctInvitePreview 한 곳), 역할을 고르기 전엔 빈 문자열", () => {
  const sb = { acct: { form: { inviteRole: "CHILD" } }, hh: { code: "A8RZ7Q9X" }, AccountView: AV, acctIdentity: () => ({ name: "주연", roleName: "엄마" }), usMeId: () => "m1" };
  vm.createContext(sb); vm.runInContext(fn("acctInvitePreview") + ";globalThis.p = acctInvitePreview;", sb);
  assert.strictEqual(sb.p(), "주연(엄마)님이 한눈육아 가족 캘린더에 초대했어요\nhttps://hoho-granma.github.io/yuka-planner/?join=A8RZ7Q9X&role=CHILD&from=m1\n가족코드: A8RZ7Q9X");
  sb.acct.form.inviteRole = ""; assert.strictEqual(sb.p(), "");
  assert.ok(APP.includes("const text = acctInvitePreview(); // 미리보기와 같은 문구"));
});
test("앱 연결: 계정 모드 메뉴·아이 등록 시트만 새 타일 UI, 비계정(가구만 켠) 메뉴·'새 아이 추가' 시트는 이전 그대로, 타일 이동(addTabGo)·가족 추가 시트 타일 바인딩", () => {
  const menu = fn("showAddMenuSheet");
  assert.ok(menu.includes("if (acctOn) {") && menu.includes("AccountView.renderAddMenu({ canSchedule: can })") && menu.includes('<button class="btn-complete" id="btn-add-menu-schedule"') && menu.includes("if (!hhEnabled()) return showNewChildSheet();"));
  assert.ok(fn("showAddChildSheet").includes("beginNewChildEntry({ codeEntry: false })") && !fn("showAddChildSheet").includes("modal-content") && fn("showNewChildSheet").includes("<h3>새 아이 추가</h3>") && !fn("showNewChildSheet").includes("renderAddChild"));
  const go = fn("addTabGo");
  assert.ok(go.includes('tab === "schedule"') && go.includes("showAddChildSheet()") && go.includes("acctOpenInvite()"));
  assert.ok(APP.includes('if (acct.mode === "invite" && typeof addTilesBind === "function") addTilesBind();'));
});
test("CSS: 타일 3열 그리드·선택 강조·비활성, 접이식 시트·미리보기 상자", () => {
  assert.ok(/\.acct-tiles \{[^}]*grid-template-columns: repeat\(3, 1fr\)/.test(CSS) && /\.acct-tile\.on \{[^}]*border-color: var\(--accent-dark\)/.test(CSS) && /\.acct-tile:disabled/.test(CSS) && CSS.includes(".acct-add-sheet") && CSS.includes(".acct-preview-b"));
});
console.log(`\n${passed}개 통과${process.exitCode ? ", 일부 실패" : ""}`);
