/* H1·H2: 가족코드 8자리 일원화(아이 기록 코드 화면 제거)·내 정보·구성원 자리·합류 자리 선택. 실행: node test/h1h2-family.test.js */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const HV = require("../js/household-view.js");
const AV = require("../js/account-view.js");
const AS = require("../js/account-sync.js");
const APP = fs.readFileSync(path.join(__dirname, "../js/app.js"), "utf8");
let passed = 0;
function test(name, fn) { try { fn(); passed++; console.log("  ok  - " + name); } catch (e) { process.exitCode = 1; console.log("  FAIL- " + name + "\n      " + (e.stack || e).split("\n").slice(0, 4).join("\n      ")); } }

test("classifyCode: 계정 모드는 8자리만 가족코드(6자리 아이 코드는 invalid), 그 밖은 기존", () => {
  assert.strictEqual(HV.classifyCode("abcd 2345", { accounts: true }).kind, "household");
  assert.strictEqual(HV.classifyCode("ABC234", { accounts: true }).kind, "invalid");
  assert.strictEqual(HV.classifyCode("ABC234").kind, "child");
  assert.strictEqual(HV.classifyCode("ABCD2345").kind, "household");
});
test("계정 모드 아이 전환 부제에는 아이 기록 코드가 없다", () => {
  assert.strictEqual(HV.childSubtitle({ code: "ABC234", stage: "born", source: "local" }, { accounts: true }), "");
  assert.ok(HV.childSubtitle({ code: "ABC234", stage: "born", source: "local" }).includes("ABC234"));
});
test("구성원 폼(계정 모드): 이름 선택(비우면 역할 이름), 할머니·할아버지는 GRANDPARENT + label, 20자 초과 거부", () => {
  const v = (role, label) => HV.validateMemberForm({ role, label }, { accounts: true });
  assert.deepStrictEqual([v("GRANDMA", "").role, v("GRANDMA", "").label, v("GRANDPA", "").label, v("CHILD", "").role, v("OTHER", "").ok], ["GRANDPARENT", "할머니", "할아버지", "CHILD", true]);
  assert.strictEqual(v("MOM", "가".repeat(21)).ok, false);
  assert.strictEqual(v("ZZZ", "").ok, false);
  assert.strictEqual(HV.formRoleOf({ role: "GRANDPARENT", label: "외할아버지" }), "GRANDPA");
  assert.strictEqual(HV.formRoleOf({ role: "GRANDPARENT", label: "영희" }), "GRANDMA");
});
test("구성원 목록(계정 모드): 나는 삭제 버튼 없음·'(나)' 표시, 기기 사용자 영역 없음, 아이 [빼기]", () => {
  const members = [{ memberId: "m1", role: "MOM", label: "지은", order: 1, uid: "u1" }, { memberId: "m2", role: "DAD", label: "아빠", order: 2 }];
  const html = HV.renderMembers({ enabled: true, hasHousehold: true, acctMode: true, meId: "m1", members, children: [{ childKey: "c1", displayName: "수아" }], view: "list" });
  assert.ok(html.includes("지은 (나)") && html.includes("가족 구성원") && html.includes('data-mem-action="ask-remove-child" data-member-id="c1"'));
  assert.ok(!html.includes('data-mem-action="ask-delete" data-member-id="m1"') && html.includes('data-mem-action="ask-delete" data-member-id="m2"'));
  assert.ok(!html.includes("이 기기를 쓰는 사람"));
  const off = HV.renderMembers({ enabled: true, hasHousehold: true, members, view: "list" });
  assert.ok(off.includes("이 기기를 쓰는 사람") && !off.includes("(나)"));
});
test("openSlots·chooseMember: uid 없고 삭제 안 된 자리만, 고른 자리는 그 역할·이름으로 확보, 이미 uid 가 있으면 새 구성원", () => {
  const members = { a: { role: "GRANDPARENT", label: "할머니", order: 3 }, b: { role: "DAD", label: "아빠", order: 2, uid: "x" }, c: { role: "MOM", label: "엄마", order: 1, deletedAt: 5 } };
  assert.deepStrictEqual(AS.openSlots(members).map((m) => m.memberId), ["a"]);
  const pick = AS.chooseMember(members, { role: "CAREGIVER", uid: "u9", displayName: "민", slotMemberId: "a" });
  assert.deepStrictEqual([pick.memberId, pick.role, pick.label, pick.claimed], ["a", "GRANDPARENT", "할머니", true]);
  const taken = AS.chooseMember(members, { role: "CAREGIVER", uid: "u9", displayName: "민", slotMemberId: "b" });
  assert.strictEqual(taken.memberId, null);
  assert.deepStrictEqual(["GRANDPARENT", "OTHER", "MOM", "CHILD", "CAREGIVER"].map(AS.accountRoleOf), ["CAREGIVER", "CAREGIVER", "MOM", "CHILD", "CAREGIVER"]);
});
test("내 정보 카드·시트·자리 선택 마크업", () => {
  const card = AV.renderMyCard({ user: { email: "a@b.c" }, account: { displayName: "지은", role: "MOM" } });
  assert.ok(card.includes("지은 · 나(엄마)") && card.includes("아이를 등록해 주세요") && card.includes("a@b.c") && card.includes('data-acct-action="empty-me"'));
  assert.ok(AV.renderMyCard({ user: { email: "a@b.c" }, account: { displayName: "지은", role: "MOM", situation: "EXPECTING" }, expecting: true }).includes("출산 예정일을 등록해 주세요"));
  const me = AV.renderMe({ user: { email: "a@b.c" }, account: { displayName: "지은", role: "MOM" }, code: "ABCD2345" });
  assert.ok(me.includes("ABCD2345") && me.includes('data-acct-action="copy-me"') && me.includes('data-acct-action="open-invite"') && me.includes('data-acct-action="ask-reissue"'));
  assert.ok(AV.renderMe({ user: { email: "a@b.c" }, account: {}, code: "" }).includes('data-acct-action="open-recover"'));
  assert.ok(AV.renderReissueConfirm({}).includes("새 코드를 만들면 지금 코드로는 더 이상 합류할 수 없어요."));
  const pick = AV.renderSlotPick({ slots: [{ memberId: "a", label: "할머니", role: "GRANDPARENT" }] });
  assert.ok(pick.includes("할머니(으)로 합류할까요?") && pick.includes('data-slot-id="a"') && pick.includes('data-slot-id=""') && pick.includes("다른 역할로") && pick.includes("합류하기"));
  const many = AV.renderSlotPick({ slots: [{ memberId: "a", label: "할머니", role: "GRANDPARENT" }, { memberId: "b", label: "아빠", role: "DAD" }] });
  assert.ok(many.includes("누구로 합류하나요?") && many.includes("목록에 없어요"));
  assert.ok(AV.renderRolePick({ form: { role: "MOM" } }).includes('data-acct-action="role-continue"'));
  assert.strictEqual(AV.validateSignup({ email: "a@b.co", password: "12345678", displayName: "민", familyCode: "ABCD2345" }, new Date(), null).ok, true);
});
test("아이 기록 코드 문구·입력은 계정 모드에서 쓰이지 않는다 / OFF 마크업 보존", () => {
  assert.ok(!JSON.stringify(AV.MSG).includes("아이 기록 코드"));
  assert.ok(APP.includes('co.style.setProperty("display", "none", "important")') && APP.includes("familyCode && !acctEnabled()"));
  const html = fs.readFileSync(path.join(__dirname, "../index.html"), "utf8");
  assert.ok(html.includes('id="btn-show-code-entry"') && html.includes("이미 가족코드가 있으신가요?"));
});
test("합류 전 자리 목록은 읽기 전용(peekMembers): 저장된 가구 코드·미러를 바꾸지 않는다", async () => {
  const HS = require("../js/household-sync.js");
  const docs = new Map([["householdCodes/ABCD2345", { householdId: "h1", active: true }], ["households/h1/members/m1", { role: "MOM", label: "엄마", order: 1 }]]);
  const ad = { get: async (p) => ({ exists: docs.has(p), data: docs.get(p) }), list: async (p) => [...docs.entries()].filter(([k]) => k.startsWith(p + "/")).map(([k, v]) => ({ id: k.split("/").pop(), data: v })), set: async () => { throw new Error("write"); } };
  const store = {};
  const hs = HS.create({ adapter: ad, features: () => ({ household: true }), storage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => (store[k] = v), removeItem: (k) => delete store[k] } });
  const r = await hs.peekMembers("abcd2345");
  assert.deepStrictEqual([r.ok, r.householdId, r.members.map((m) => m.memberId)], [true, "h1", ["m1"]]);
  assert.deepStrictEqual(Object.keys(store), []);
  assert.strictEqual((await hs.peekMembers("ZZZZZZZZ")).reason, "not-found");
});
test("updateProfile: 이름·역할 변경을 accounts 문서에 merge(role 은 규칙 허용 4종으로 변환)", async () => {
  const calls = [];
  const sync = AS.create({ adapter: { get: async () => ({ exists: false }), set: async (p, d, o) => calls.push([p, d, o]) }, household: {}, now: () => 7 });
  const r = await sync.updateProfile("u1", { displayName: "민수", role: "GRANDPARENT" });
  assert.deepStrictEqual([r.ok, calls[0][0], calls[0][1], calls[0][2]], [true, "accounts/u1", { updatedAt: 7, displayName: "민수", role: "CAREGIVER" }, { merge: true }]);
  assert.ok(APP.includes("acct.sync.updateProfile(acct.user.uid") && APP.includes("form.memberId === usMeId()"));
});
test("구성원 추가: 역할 기본 선택 없음 — 고르지 않고 모르는 이름이면 저장 불가(MOM 기본값으로 저장되지 않음), 이름으로 추정 가능하면 자동 결정", () => {
  assert.ok(APP.includes('role: acctEnabled() ? "" : "OTHER", label: ""') && !APP.includes('role: acctEnabled() ? "MOM"'));
  const v = (role, label) => HV.validateMemberForm({ role, label }, { accounts: true });
  assert.deepStrictEqual([v("", "").ok, v("", "").error, v("", "영희").ok], [false, HV.MSG.memErrRole, false]);
  assert.deepStrictEqual([v("", "할머니").role, v("", "할머니").label, v("", "할아버지").role, v("", "외할아버지").role, v("", "이모님").role, v("", "아빠").role], ["GRANDPARENT", "할머니", "GRANDPARENT", "GRANDPARENT", "CAREGIVER", "DAD"]);
  assert.strictEqual(v("", "외할머니").role, "GRANDPARENT");
  // 추가 폼은 역할 선택 7종 칩을 보여 주고 아무것도 선택돼 있지 않다
  const html = HV.renderMembers({ enabled: true, hasHousehold: true, acctMode: true, meId: null, members: [], view: "form", form: { memberId: null, role: "", label: "" } });
  assert.strictEqual((html.match(/data-mem-role="/g) || []).length, 7);
  assert.ok(!/hh-chip active/.test(html) && ["엄마", "아빠", "아이(자녀)", "이모님·돌봄", "할머니", "할아버지", "기타"].every((n) => html.includes(n)));
});
test("구성원 이름 변경·삭제는 캘린더 칩에 바로 반영(칩은 members 미러에서 만들고, 저장·삭제 뒤 usRefreshCalendar)", () => {
  const US = require("../js/user-schedule-view.js");
  const base = [{ memberId: "m1", role: "MOM", label: "지은", order: 1, uid: "u1" }, { memberId: "m2", role: "GRANDPARENT", label: "할머니", order: 2 }];
  const labels = (ms) => US.filterChips([], [], ms, { memberMode: true, meId: "m1" }).map((c) => c.label || c.name || c.text);
  assert.ok(labels(base).some((l) => String(l).includes("할머니")));
  const renamed = base.map((m) => (m.memberId === "m2" ? { ...m, label: "외할머니" } : m));
  assert.ok(labels(renamed).some((l) => String(l).includes("외할머니")) && !labels(renamed).some((l) => l === "할머니"));
  const deleted = base.map((m) => (m.memberId === "m2" ? { ...m, deletedAt: 9 } : m));
  assert.ok(!labels(deleted).some((l) => String(l).includes("할머니")));
  const i = APP.indexOf("async function memOnClick(");
  const body = APP.slice(i, APP.indexOf("// ── 가족 캘린더 베타 켜기 스위치", i));
  assert.ok(/memRender\(\);\n    usRefreshCalendar\(\);\n  \}/.test(body));
});
console.log(`\n${passed}개 통과${process.exitCode ? ", 일부 실패" : ""}`);
