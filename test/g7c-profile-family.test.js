/* G7-3 프로필 시트(D 가족 중심): 가족 얼굴·가족코드 맨 위 → 내 계정 줄 → 아이 정보 → 구성원 관리(접이식) → [아이 전환][기록 보기]. 실행: node test/g7c-profile-family.test.js */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const AV = require("../js/account-view.js");
const HV = require("../js/household-view.js");
const read = (f) => fs.readFileSync(path.join(__dirname, "..", f), "utf8");
const APP = read("js/app.js"), CSS = read("css/style.css");
let passed = 0;
function test(name, fn) { try { fn(); passed++; console.log("  ok  - " + name); } catch (e) { process.exitCode = 1; console.log("  FAIL- " + name + "\n      " + (e.stack || e).split("\n").slice(0, 4).join("\n      ")); } }
const family = { members: [{ memberId: "m1", role: "MOM", label: "엄마" }, { memberId: "m2", role: "DAD", label: "아빠" }, { memberId: "m3", role: "GRANDPARENT", label: "할머니" }], meId: "m1", meName: "주연", children: [{ childKey: "c1", displayName: "은찬" }] };
const slot = (o) => AV.renderAccountSlot({ user: { email: "test1@example.com" }, account: { displayName: "주연", role: "MOM" }, code: "A8RZ7Q9X", withCode: true, family, ...o });

test("가족 얼굴(구성원·아이)·[가족 추가] 얼굴·가족코드 알약+복사 아이콘이 맨 위, 내 줄은 '주연 (나)'(accounts 이름 우선), 역할 색(엄마·아빠·그 외·아이)", () => {
  const h = slot();
  assert.ok(h.indexOf("우리 가족") < h.indexOf("acct-faces") && h.indexOf("acct-faces") < h.indexOf("A8RZ7Q9X") && h.indexOf("A8RZ7Q9X") && !h.includes("acct-fam-me"), "D72b: 내 계정 줄은 '나' 카드로 이동");
  assert.ok(h.includes('class="acct-face acct-face-pick on" data-acct-action="fam-pick" data-fam-kind="member" data-fam-id="m1" aria-pressed="true"') && h.includes('data-fam-kind="child" data-fam-id="c1" aria-pressed="false"') && h.includes('data-fam-id="m2" aria-pressed="false"'), "얼굴은 버튼(기본 선택=나, aria-pressed)");
  assert.ok(slot({ sel: { kind: "child", id: "c1" } }).includes('data-fam-kind="child" data-fam-id="c1" aria-pressed="true"') && /acct-face-add" data-acct-action="fam-add-child"><span class="acct-face-dot">\+<\/span><span class="acct-face-name">아이 등록<\/span>/.test(h), "선택 표시·[＋ 아이 등록]");
  assert.ok(h.includes('<span class="acct-face-name">주연 (나)</span>') && h.includes('<span class="acct-face-name">아빠</span>') && h.includes('<span class="acct-face-name">할머니</span>') && h.includes('<span class="acct-face-name">은찬</span>'));
  assert.ok(h.includes("background:#ff66b3") && h.includes("background:#4d9bff") && h.includes("background:#c9b8ff") && h.includes("background:#ffc233"));
  assert.ok(/acct-face acct-face-add" data-acct-action="open-invite"><span class="acct-face-dot">\+<\/span><span class="acct-face-name">가족 추가<\/span>/.test(h));
  assert.ok(/<span class="acct-fam-pill-l">가족코드<\/span><b>A8RZ7Q9X<\/b><button type="button" class="acct-copy-ico" data-acct-action="copy-me" aria-label="가족코드 복사"/.test(h));
});
test("'나' 카드(D72b): 이름 (나)·역할·이메일·거주 지역 + [수정][로그아웃] — 위험 버튼은 따로 한 줄, 복사 알림은 알약 옆", () => {
  const card = AV.renderFamCard({ kind: "me", name: "주연 (나)", sub: "엄마", rows: [["이메일", "test1@example.com"], ["거주 지역", "서울특별시 구로구"]], actions: [{ label: "수정", attrs: 'data-mem-action="edit" data-member-id="m1"' }, { label: "로그아웃", attrs: 'data-acct-action="logout"' }] });
  assert.ok(card.includes('data-fam-card="me"') && card.includes("주연 (나)") && card.includes("test1@example.com") && card.includes("서울특별시 구로구") && card.includes('data-mem-action="edit"') && card.includes('data-acct-action="logout">로그아웃<'));
  const kid = AV.renderFamCard({ kind: "child", name: "은찬", actions: [{ label: "수정", attrs: "a" }, { label: "삭제", attrs: "b", danger: true }] });
  assert.ok(kid.indexOf("fam-actions\"><button") > 0 && kid.indexOf("fam-actions fam-danger") > kid.indexOf(">수정<") && kid.includes("hh-danger"));
  const h = slot();
  assert.ok(!h.includes('data-acct-action="logout"') && !h.includes("복사했어요") && slot({ notice: AV.MSG.inviteCopied }).includes('role="status">복사했어요'));
  assert.ok(slot({ notice: "다른 안내" }).includes("다른 안내"));
  assert.ok(!/<b>x/.test(AV.renderFamCard({ name: "<b>x</b>", rows: [["a", "<i>y</i>"]] })));
});
test("가구가 없으면 가족 추가·코드 알약 대신 [가족 만들고 가족코드 받기], 가족 구성원 정보가 없으면 얼굴 없이도 깨지지 않는다, 이스케이프", () => {
  const none = slot({ code: "", family: { members: [], meId: null, meName: "", children: [] } });
  assert.ok(none.includes('data-acct-action="open-recover"') && !none.includes("open-invite") && !none.includes("acct-fam-pill"));
  const evil = slot({ family: { members: [{ memberId: "m1", role: "MOM", label: "<b>x</b>" }], meId: null, meName: "", children: [{ childKey: "c", displayName: "<i>y</i>" }] } });
  assert.ok(!/<b>x|<i>y/.test(evil) && evil.includes("&lt;b&gt;x"));
  assert.ok(!AV.renderAccountSlot({ user: { email: "a@b.c" }, account: {}, code: "A", withCode: true }).includes("acct-fam"), "family 가 없으면(내 정보 시트 등) 기존 레이아웃");
});
test("프로필 시트 템플릿(계정 모드, D72b): 가족 얼굴 슬롯 → 선택 카드 → '이 기기에만 있는 아이' 구역 → [닫기]. 구성원 관리·우리 아이 줄·아이 전환·기록 보기·새 홈 줄은 없다", () => {
  const i = APP.indexOf("function acctProfileSheet(");
  const t = APP.slice(i, APP.indexOf("\n  }\n", i));
  const at = (k) => t.indexOf(k);
  assert.ok(at('<div id="acct-slot"></div>') > 0 && at('<div id="acct-slot"></div>') < at('id="fam-card"') && at('id="fam-card"') < at('id="fam-orphans"') && at('id="fam-orphans"') < at('id="btn-close-modal"'));
  assert.ok(!/acct-members-det|members-slot|btn-acct-kid|btn-acct-child-switch|btn-view-records|HomeSwitch/.test(t));
  const j = APP.indexOf("function showProfileSheet("), b = APP.slice(j, APP.indexOf("\n  }\n", j));
  assert.ok(!b.includes("acct-members-det") && !b.includes("btn-acct-child-switch"), "기존 아이 시트에도 구성원 관리·아이 전환 없음");
  ["btn-photo-upload", "btn-open-reset", "btn-switch-born", "btn-photo-save", "btn-close-modal"].forEach((id) => assert.ok(b.includes(id), id));
  assert.ok(/: `\$\{hhEnabled\(\) \? '<div id="hh-slot"><\/div><div id="members-slot"><\/div>' : ""\}<div id="beta-slot"><\/div>/.test(b), "비계정 템플릿(OFF·가구만)은 그대로");
});
test("기존 기능 유지: 구성원 수정·삭제(나는 삭제 불가)·아이 빼기·가족 추가·로그아웃·가족코드 복사·내 계정 슬롯 액션이 같은 data-acct-action / data-mem-action 으로 남아 있다", () => {
  const h = slot();
  ["copy-me", "open-invite", "fam-pick", "fam-add-child"].forEach((a) => assert.ok(h.includes(`data-acct-action="${a}"`), a));
  const fc = APP.slice(APP.indexOf("function famCardData("), APP.indexOf("function famRender("));
  assert.ok(fc.includes('data-mem-action="edit"') && fc.includes('data-mem-action="ask-delete"') && fc.includes('data-mem-action="ask-remove-child"') && fc.includes('data-mem-action="ask-delete-child"') && fc.includes('data-acct-action="logout"') && fc.includes("usIsOwnChild(l)") && fc.includes('data-fam-act="child-born"'), "카드 하단 액션: 수정·삭제(타 구성원)·빼기·삭제(내가 만든 아이)·로그아웃·아이가 태어났어요");
  const m = HV.renderMembers({ enabled: true, hasHousehold: true, acctMode: true, meId: "m1", meName: "주연", members: [{ memberId: "m1", role: "MOM", label: "엄마", order: 1, uid: "u" }, { memberId: "m2", role: "DAD", label: "아빠", order: 2 }], children: [{ childKey: "c1", displayName: "은찬" }], view: "list" });
  assert.ok(m.includes('data-mem-action="edit" data-member-id="m1"') && m.includes('data-mem-action="ask-delete" data-member-id="m2"') && !m.includes('data-mem-action="ask-delete" data-member-id="m1"') && m.includes('data-mem-action="ask-remove-child" data-member-id="c1"'));
  assert.ok(APP.includes('acct.sync.updateProfile') && /acctRenderSlot\(\) \{[\s\S]*family/.test(APP) && APP.includes('if (action === "copy-invite" || action === "copy-me")'));
});
test("CSS: 가족 영역·얼굴 버튼·선택 카드·하단 버튼 행이 있다", () => {
  ["acct-fam-hero", "acct-faces", "acct-face-dot", "acct-fam-pill", "acct-face-pick", "fam-card", "fam-actions", "acct-sm-btn"].forEach((c) => assert.ok(CSS.includes("." + c), c));
});
console.log(`\n${passed}개 통과${process.exitCode ? ", 일부 실패" : ""}`);
