/*
 * D3 계정: 구성원 칩(MEMBER:<id>)·'나' 기본 선택·+ 메뉴(아이 등록하기·가족 초대하기)·내 정보·초대 시트·연결 복구 화면. 플래그 OFF 불변.
 * 실행: node test/d3-accounts.test.js
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const V = require("../js/user-schedule-view.js");
const CM = require("../js/calendar-model.js");
const AV = require("../js/account-view.js");
const US = require("../js/user-schedule.js");
global.HNLogic = require("../js/hn-logic.js");
global.UserSchedule = US;
const read = (f) => fs.readFileSync(path.join(__dirname, "..", f), "utf8");
const APP = read("js/app.js");

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log("  ok  - " + name); } catch (e) { process.exitCode = 1; console.log("  FAIL- " + name + "\n      " + (e.stack || e).split("\n").slice(0, 5).join("\n      ")); }
}
const LINKS = [{ childKey: "c1", displayName: "수아", order: 1 }, { childKey: "c2", displayName: "하준", order: 2 }];
const MEMBERS = [{ memberId: "m1", role: "MOM", label: "엄마", order: 1 }, { memberId: "m2", role: "DAD", label: "아빠", order: 2 }];
const ME = { memberMode: true, meId: "m1" };

console.log("구성원 칩(MEMBER:<id>)");
test("계정 모드 칩: 구성원마다 하나, 내 구성원은 '나(역할)', 선택·색, 아이·가족 칩은 그대로", () => {
  const chips = V.filterChips(LINKS, ["MEMBER:m1"], MEMBERS, ME);
  assert.deepStrictEqual(chips.map((c) => [c.id, c.label]), [["ALL", "전체"], ["MEMBER:m1", "나(엄마)"], ["MEMBER:m2", "아빠"], ["CHILD:c1", "수아"], ["CHILD:c2", "하준"], ["FAMILY", "가족"]]);
  assert.deepStrictEqual(chips.filter((c) => c.selected).map((c) => c.id), ["MEMBER:m1"]);
  assert.deepStrictEqual([chips[1].color, chips[2].color], ["#ff9ec4", "#7fb8ff"]);
  const dadMe = V.filterChips(LINKS, [], MEMBERS, { memberMode: true, meId: "m2" });
  assert.strictEqual(dadMe.find((c) => c.id === "MEMBER:m2").label, "나(아빠)");
});
test("이모님·자녀·같은 역할이 둘 이상이어도 구성원 단위로 칩이 생기고(라벨=구성원 라벨), 삭제된 구성원은 빠진다, 역할 색 없는 구성원은 가족색", () => {
  const many = [...MEMBERS, { memberId: "m3", role: "CAREGIVER", label: "이모님", order: 3 }, { memberId: "m4", role: "MOM", label: "새엄마", order: 4 }, { memberId: "m5", role: "CHILD", label: "큰애", order: 5, deletedAt: 9 }];
  const chips = V.filterChips(LINKS, [], many, ME);
  assert.deepStrictEqual(chips.filter((c) => c.id.startsWith("MEMBER:")).map((c) => c.label), ["나(엄마)", "아빠", "이모님", "새엄마"]);
  assert.strictEqual(chips.find((c) => c.id === "MEMBER:m3").color, "#c9b8ff");
});
test("합류 시 칩 자동 추가: 구성원 목록이 늘면(리스너가 미러를 갱신) 다음 렌더에서 칩이 늘어난다", () => {
  const before = V.filterChips(LINKS, [], [MEMBERS[0]], ME).map((c) => c.id);
  const after = V.filterChips(LINKS, [], MEMBERS, ME).map((c) => c.id);
  assert.ok(!before.includes("MEMBER:m2") && after.includes("MEMBER:m2"));
});
test("선택 정규화·토글: MEMBER 칩만 유효(이전 역할 칩은 d4 테스트에서 복원 확인), 전부 고르면 전체, 옛 값 호환(opts 없음)은 그대로", () => {
  assert.deepStrictEqual(V.normalizeSelection(["MEMBER:m2", "MEMBER:zz"], LINKS, MEMBERS, ME), ["MEMBER:m2"]);
  assert.deepStrictEqual(V.toggleSelection(["MEMBER:m1"], "MEMBER:m2", LINKS, MEMBERS, ME), ["MEMBER:m1", "MEMBER:m2"]);
  assert.deepStrictEqual(V.toggleSelection(["MEMBER:m1"], "ALL", LINKS, MEMBERS, ME), []);
  assert.deepStrictEqual(V.normalizeSelection(["MOM"], LINKS, MEMBERS), ["MOM"], "옵션이 없으면 기존 역할 칩 동작");
  assert.deepStrictEqual(V.filterChips(LINKS, [], MEMBERS).map((c) => c.id), ["ALL", "MOM", "DAD", "CHILD:c1", "CHILD:c2", "FAMILY"], "기존(역할 칩) 출력 불변");
  assert.strictEqual(V.selectionMode(["MEMBER:m1"]), "member");
  assert.strictEqual(V.selectionMode(["CHILD:c1"]), "kids");
});
const sched = (title, extra) => ({ ...US.buildCreateDoc({ sourceType: "MANUAL", title, category: "ETC", scope: "FAMILY", allDay: true, dateKind: "FIXED", eventDate: "2026-10-06", ...extra }, 1790000000000).doc, id: "s-" + title });
test("모델: 담당자 구성원 필터(MEMBER:<id>)로 일정이 걸러지고, 아이 일정도 담당자로 찾을 수 있다", () => {
  const docs = [sched("엄마것", { assigneeMemberId: "m1" }), sched("아빠것", { assigneeMemberId: "m2" }), sched("담당없음"), sched("수아·엄마", { scope: "CHILD", childKeys: ["c1"], assigneeMemberId: "m1" })];
  const run = (sel) => CM.buildCalendarModel({ view: "month", range: { start: "2026-10-01", end: "2026-10-31" }, filter: V.toModelFilter(sel, false, LINKS, MEMBERS, ME), auto: { events: [], displayDates: new Map(), completed: {} }, user: { schedules: docs, childLinks: LINKS, members: MEMBERS } }).days.get("2026-10-06").user.map((o) => o.title).sort();
  assert.deepStrictEqual(run([]), ["수아·엄마", "아빠것", "엄마것", "담당없음"].sort());
  assert.deepStrictEqual(run(["MEMBER:m1"]), ["수아·엄마", "엄마것"]);
  assert.deepStrictEqual(run(["MEMBER:m2"]), ["아빠것"]);
  assert.deepStrictEqual(run(["MEMBER:m1", "CHILD:c1"]), ["수아·엄마", "엄마것"]);
  assert.deepStrictEqual(CM.ownerTags(docs[0], new Map(MEMBERS.map((m) => [m.memberId, m]))), ["MOM", "MEMBER:m1", "FAMILY"]);
});

console.log("app.js 연결(소스 추출)");
function selEnv(over) {
  const a = APP.indexOf("  // 계정 모드(D3): 구성원 칩(MEMBER:<id>)과 '나' 기본 선택"), b = APP.indexOf("  /** 월/일 범위의 캘린더 모델");
  assert.ok(a > 0 && b > a);
  const o = { on: true, user: { uid: "u1" }, account: { memberId: "m1" }, members: MEMBERS, selection: [], touched: false, ...over };
  const us = { selection: o.selection, selTouched: o.touched };
  const sb = { UserScheduleView: V, us, acctEnabled: () => o.on, acct: { user: o.user, account: o.account }, usMembers: () => o.members, usLinks: () => LINKS };
  vm.createContext(sb);
  vm.runInContext(APP.slice(a, b) + "\n;Object.assign(globalThis, { usMeId, usSelOpts, usSel, usSelectionMode });", sb);
  return sb;
}
test("기본 선택은 '전체'(E 1-1): 계정 모드에서도 [] , 내 구성원(usMeId)은 알고 있어 '나' 칩 한 번으로 나만 보기, 칩을 누른 뒤에는 사용자의 선택, 구성원을 못 찾으면 기존 동작", () => {
  const e = selEnv();
  assert.deepStrictEqual([e.usMeId(), JSON.parse(JSON.stringify(e.usSel())), e.usSelectionMode()], ["m1", [], "all"]);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(V.toggleSelection(e.usSel(), "MEMBER:m1", LINKS, MEMBERS, ME))), ["MEMBER:m1"], "'나' 칩 한 번으로 나만");
  const touched = selEnv({ touched: true, selection: ["CHILD:c1"] });
  assert.deepStrictEqual([JSON.parse(JSON.stringify(touched.usSel())), touched.usSelectionMode()], [["CHILD:c1"], "kids"]);
  const touchedAll = selEnv({ touched: true, selection: [] });
  assert.deepStrictEqual(JSON.parse(JSON.stringify(touchedAll.usSel())), [], "전체를 눌렀으면 전체");
  for (const over of [{ on: false }, { user: null }, { account: null }, { account: { memberId: "zz" } }, { members: [MEMBERS[1]] }]) {
    const x = selEnv(over);
    assert.deepStrictEqual([x.usMeId(), JSON.parse(JSON.stringify(x.usSel())), JSON.parse(JSON.stringify(x.usSelOpts()))], [null, [], { memberMode: false, meId: null }], JSON.stringify(over));
  }
});
test("일정 담당자 기본값=나: memActiveId 가 계정 모드에서는 내 구성원을 먼저 돌려준다(없으면 기기 저장값)", () => {
  const i = APP.indexOf("  function memActiveId() {");
  const src = APP.slice(i, APP.indexOf("\n  }\n", i) + 5);
  assert.ok(/const me = usMeId\(\);[^\n]*\n\s*if \(me\) return me;/.test(src));
  const run = (me) => { const sb = { usMeId: () => me, localStorage: { getItem: () => "m2" }, ACTIVE_MEMBER_KEY: "k", HouseholdView: { activeMemberOf: (_m, id) => id }, usMembers: () => MEMBERS }; vm.createContext(sb); vm.runInContext(src + ";globalThis.r = memActiveId();", sb); return sb.r; };
  assert.deepStrictEqual([run("m1"), run(null)], ["m1", "m2"]);
});
function menuEnv(acctOn) {
  const a = APP.indexOf("  // ── N2 헤더 + 버튼"), b = APP.indexOf("  function showNewChildSheet()");
  const els = {};
  const mk = (id) => els[id] || (els[id] = { id, innerHTML: "", listeners: {}, classList: { remove() {}, add() {} }, addEventListener(t, f) { this.listeners[t] = f; } });
  const log = { sheets: [], newChild: 0 };
  const sb = { console, acctEnabled: () => acctOn, AccountView: AV, hhEnabled: () => true, usActive: () => true, el: mk, modalMode: null, showNewChildSheet: () => log.newChild++, closeDetail() {}, usOpenForm() {}, toISODate: () => "2026-10-02", Date, acctShowSheet: (k) => log.sheets.push(k) };
  vm.createContext(sb);
  vm.runInContext(APP.slice(a, b) + "\n;Object.assign(globalThis, { showAddMenuSheet });", sb);
  return { sb, els, log };
}
test("+ 메뉴: 계정 ON 이면 '아이 등록하기'·'가족 초대하기', OFF 이면 기존 메뉴 그대로('새 아이 추가', 초대 없음)", () => {
  const on = menuEnv(true);
  on.sb.showAddMenuSheet();
  const h = on.els["modal-content"].innerHTML;
  assert.ok(h.includes("아이 등록하기") && h.includes("가족 초대하기") && h.includes('id="btn-add-menu-invite"') && !h.includes("새 아이 추가"));
  on.els["btn-add-menu-invite"].listeners.click();
  assert.deepStrictEqual(on.log.sheets, ["invite"]);
  on.els["btn-add-menu-child"].listeners.click();
  assert.strictEqual(on.log.newChild, 1, "아이 등록하기는 기존 새 아이 입력 흐름(N1)");
  const off = menuEnv(false);
  off.sb.showAddMenuSheet();
  const o = off.els["modal-content"].innerHTML;
  assert.ok(o.includes("새 아이 추가") && !o.includes("가족 초대하기") && !o.includes("아이 등록하기") && !o.includes("btn-add-menu-invite"));
});
test("내 정보: 로그인 상태에서는 N6 '이 기기에서 나가기'를 숨기고(hideLeave) 계정 슬롯에 이름·역할·로그아웃, 로그아웃 상태·OFF 는 기존 그대로", () => {
  assert.ok(APP.includes("hideLeave: acctEnabled() && !!acct.user,"));
  const HV = require("../js/household-view.js");
  const st = { enabled: true, view: "active", code: "ABCD2345", pending: 0 };
  assert.ok(HV.renderSection(st).includes('data-hh-action="leave"') && HV.renderSection({ ...st, hideLeave: false }).includes('data-hh-action="leave"'));
  assert.ok(!HV.renderSection({ ...st, hideLeave: true }).includes('data-hh-action="leave"') && HV.renderSection({ ...st, hideLeave: true }).includes('data-hh-action="copy"'));
  const slot = AV.renderAccountSlot({ user: { email: "m@x.co", displayName: "지은" }, account: { displayName: "지은", role: "CAREGIVER" } });
  assert.ok(slot.includes("지은") && slot.includes("나(이모님)") && slot.includes("m@x.co") && slot.includes('data-acct-action="logout"'));
  assert.ok(AV.renderAccountSlot({ user: { email: "a@b.co" }, account: { displayName: "민수", role: "DAD" } }).includes("나(아빠)"));
  assert.ok(AV.renderAccountSlot({}).includes("회원가입"));
});
test("가족 초대 시트: 코드·복사 버튼·안내(가구 없으면 안내만), 이스케이프", () => {
  const inv = AV.renderInvite({ code: "ABCD2345" });
  assert.ok(inv.includes("가족 초대하기") && inv.includes("ABCD2345") && inv.includes('data-acct-action="copy-invite"') && inv.includes("회원가입할 때 가족 캘린더 코드에 입력하면"));
  assert.ok(AV.renderInvite({ code: "ABCD2345", notice: "복사했어요." }).includes("복사했어요."));
  const none = AV.renderInvite({});
  assert.ok(none.includes("아직 연결되지 않았어요") && !none.includes("copy-invite"));
  assert.ok(!AV.renderInvite({ code: "<img>" }).includes("<img>"));
});
test("연결 복구 화면·검증: 새 가족 만들기/코드로 합류, 역할·이름 필수, 합류는 8자리 코드, 이스케이프", () => {
  const r = AV.renderRecover({ form: { role: "MOM", displayName: "지은" } });
  assert.ok(r.includes("가족 캘린더를 연결해 주세요") && r.includes('data-acct-action="recover-new"') && r.includes('data-acct-action="recover-join-open"') && !r.includes('data-acct-input="familyCode"') && r.includes('data-acct-radio="role"'));
  const j = AV.renderRecover({ form: {}, joining: true });
  assert.ok(j.includes('data-acct-input="familyCode"') && j.includes('data-acct-action="recover-join"') && j.includes('data-acct-action="recover-back"') && !j.includes("recover-new"));
  assert.ok(!AV.renderRecover({ form: { displayName: "<script>" }, error: "<i>" }).match(/<script|<i>/));
  assert.deepStrictEqual(Object.keys(AV.validateRecover({}, false).errors), ["role", "displayName"]);
  assert.deepStrictEqual(Object.keys(AV.validateRecover({ role: "MOM", displayName: "a" }, true).errors), ["familyCode"]);
  const ok = AV.validateRecover({ email: "m@x.co", role: "DAD", displayName: " 민수 ", familyCode: " abcd2345 " }, true);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(ok.intent)), { email: "m@x.co", displayName: "민수", role: "DAD", joiningCode: "ABCD2345" });
  assert.strictEqual(AV.validateRecover({ role: "MOM", displayName: "a", familyCode: "zzz" }, false).intent.joiningCode, null, "신규 만들기는 코드 무시");
});
test("플래그 OFF·계정 로그아웃 상태: 새 코드는 모두 acctEnabled/계정 상태 가드 뒤, 서버 쓰기는 AccountSync(계정 문서·가구)뿐", () => {
  const blk = APP.slice(APP.indexOf("// ── D1 계정"), APP.indexOf("async function init()"));
  assert.ok(/async function acctOnClick\(ev\) \{\n    if \(!acctEnabled\(\)\) return;/.test(blk));
  assert.ok(!/FamilySync|HouseholdSync\.(create|update|upsert|patch|remove|reissue)|completed|saveProfile/.test(blk));
  assert.ok(/if \(!acctEnabled\(\) \|\| !acct\.user \|\| !acct\.account \|\| !acct\.account\.memberId\) return null;/.test(APP));
  assert.ok(APP.includes("const acctOn = acctEnabled();") && APP.includes("${acctOn ? `<button class=\"btn-complete\" id=\"btn-add-menu-invite\">"));
});
console.log(`\n${passed}개 통과${process.exitCode ? ", 일부 실패" : ""}`);
