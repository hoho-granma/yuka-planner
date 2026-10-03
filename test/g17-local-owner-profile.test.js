/* G17 로컬 아이 데이터 소유자 + 계정 모드 '내 프로필' 시트. 실행: node test/g17-local-owner-profile.test.js */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const AV = require("../js/account-view.js");
const APP = fs.readFileSync(path.join(__dirname, "..", "js/app.js"), "utf8");
let passed = 0;
function test(name, f) { try { f(); passed++; console.log("  ok  - " + name); } catch (e) { process.exitCode = 1; console.log("  FAIL- " + name + "\n      " + (e.stack || e).split("\n").slice(0, 4).join("\n      ")); } }
function fn(name) { const i = APP.indexOf(`  function ${name}(`); assert.ok(i >= 0, name); return APP.slice(i, APP.indexOf("\n  }\n", i) + 4); }
const KEYS = { PROFILE: "yukjigi_profile", COMPLETED: "yukjigi_completed" };

function owner(o) {
  const store = Object.assign({ yukjigi_profile: "{}", yukjigi_completed: '{"a":1}', hannun_children: "[1]", hannun_child_births: "{}", hannun_migrate_kept: "[]", hannun_feature_household: "1", hannun_feature_accounts: "1", hannun_acct_signed_out: "1", hannun_onboard_family_seen: "1" }, o.store || {});
  const log = { left: 0, empty: 0, reset: 0 };
  const sb = {
    console, PROFILE_KEY: KEYS.PROFILE, COMPLETED_KEY: KEYS.COMPLETED,
    localStorage: { get length() { return Object.keys(store).length; }, key: (i) => Object.keys(store)[i] || null, getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => (store[k] = String(v)), removeItem: (k) => delete store[k] },
    profile: { name: "아이1" }, familyCode: "WX695H", completed: { a: 1 }, hh: { hid: o.hid || null },
    acctEnabled: () => o.enabled !== false, applyNewChildReset: () => { log.reset++; delete store.yukjigi_profile; }, hhLeaveLocal: () => log.left++, showEmptyHome: () => log.empty++,
    el: () => null,
  };
  vm.createContext(sb);
  vm.runInContext(["const acctChildKeys = () => [PROFILE_KEY, COMPLETED_KEY, \"hannun_children\", \"hannun_child_births\", \"hannun_migrate_kept\"];", 'const ACCT_OWNER_KEY = "hannun_local_owner";', fn("acctOwnerRead"), fn("acctOwnerWrite"), fn("acctWipeLocalChild"), fn("acctOwnerSync")].join("\n"), sb);
  return { sb, store, log };
}
const childKeysGone = (s) => ["yukjigi_profile", "yukjigi_completed", "hannun_children", "hannun_child_births", "hannun_migrate_kept"].every((k) => !(k in s));

test("로그아웃 정리(acctWipeLocalChild): 아이별 키를 모두 지우고, 기능 플래그·로그아웃 표시·온보딩 표시는 남긴다", () => {
  const t = owner({});
  t.sb.acctWipeLocalChild();
  assert.ok(childKeysGone(t.store));
  assert.ok(t.store.hannun_feature_household === "1" && t.store.hannun_feature_accounts === "1" && t.store.hannun_acct_signed_out === "1" && t.store.hannun_onboard_family_seen === "1");
  assert.deepStrictEqual([t.sb.profile, t.sb.familyCode], [null, null]);
});
test("아이 코드 접두어 키(hannun_records:*·가구 미러·대기열)도 지우고, 접두어가 다른 키는 남긴다", () => {
  const t = owner({ store: { "hannun_records:WX695H": '{"m":"비공개"}', "hannun_records:local": "{}", "hannun_household:h1": "{}", "hannun_household_pending:h1": "[]", hannun_author_label: "엄마" } });
  t.sb.acctWipeLocalChild();
  assert.ok(!Object.keys(t.store).some((k) => /^hannun_(records|household|household_pending):/.test(k)));
  assert.strictEqual(t.store.hannun_author_label, "엄마");
  const u = owner({ store: { hannun_local_owner: "uOld", "hannun_records:WX695H": "{}" } });
  u.sb.acctOwnerSync({ uid: "uNew" });
  assert.ok(!("hannun_records:WX695H" in u.store), "uid 가 바뀔 때도");
  const same = owner({ store: { hannun_local_owner: "u1", "hannun_records:WX695H": "{}" } });
  same.sb.acctOwnerSync({ uid: "u1" });
  assert.ok("hannun_records:WX695H" in same.store);
});
test("다른 uid 로그인: 로컬 아이 데이터·가구 연결을 지우고 빈 홈, owner 는 새 uid 로", () => {
  const t = owner({ store: { hannun_local_owner: "uOld" }, hid: "h1" });
  t.sb.acctOwnerSync({ uid: "uNew" });
  assert.ok(childKeysGone(t.store) && t.log.left === 1 && t.log.empty === 1);
  assert.strictEqual(t.store.hannun_local_owner, "uNew");
});
test("같은 uid 는 지우지 않는다 / owner 기록이 없는 기기(기존 사용자·베타만 켠 기기)는 지우지 않고 이 uid 것으로 연결한다", () => {
  const a = owner({ store: { hannun_local_owner: "u1" } }); a.sb.acctOwnerSync({ uid: "u1" });
  assert.ok(a.store.yukjigi_profile && a.log.empty === 0);
  const b = owner({}); b.sb.acctOwnerSync({ uid: "u1" });
  assert.ok(b.store.yukjigi_profile && b.store.hannun_children && b.log.empty === 0 && b.store.hannun_local_owner === "u1");
});
test("플래그 OFF(계정 모드 아님)·로그인 없음은 아무것도 읽거나 쓰지 않는다", () => {
  const a = owner({ enabled: false, store: { hannun_local_owner: "uOld" } }); a.sb.acctOwnerSync({ uid: "uNew" });
  assert.ok(a.store.yukjigi_profile && a.store.hannun_local_owner === "uOld" && a.log.left === 0);
  const b = owner({}); b.sb.acctOwnerSync(null);
  assert.ok(!("hannun_local_owner" in b.store) && b.store.yukjigi_profile);
});
test("정적: 로그아웃은 서버 반영(대기열·flush 실패)이 남으면 지우지 않고(owner 유지), 지울 때만 owner 를 지운다 / 복원 전에 owner 확인 / 새로고침으로 키가 생기지 않는다", () => {
  const lo = APP.slice(APP.indexOf('if (action === "logout" || action === "confirm-logout")'), APP.indexOf('if (action === "migrate-add"'));
  assert.ok(lo.includes("unsynced = true") && lo.includes("getStatus(hh.hid).pending > 0"));
  assert.ok(lo.includes("if (hh.hid && !unsynced)") && /if \(!unsynced && typeof acctWipeLocalChild === "function"\) \{[\s\S]*acctWipeLocalChild\(\);[\s\S]*acctOwnerWrite\(null\);/.test(lo));
  assert.ok(lo.indexOf("signOut()") < lo.indexOf("acctWipeLocalChild()"), "로그아웃 성공 뒤에만 지운다");
  assert.ok(!/hannun_feature|SIGNED_OUT_KEY|acctSignedOutMark\(false\)/.test(fn("acctWipeLocalChild")), "플래그·로그아웃 표시는 건드리지 않는다");
  assert.ok(APP.indexOf("acctOwnerSync(u)") < APP.indexOf("if (!acct.sync) { await acctGoHome(); return; }"));
  assert.ok(fn("acctOwnerSync").includes("if (!acctEnabled() || !u || !u.uid) return;"), "로그인 없으면 owner 키를 쓰지 않는다");
});

// ── 계정 모드 프로필 시트 ──
function sheet(o) {
  const els = { "modal-content": { innerHTML: "" }, "detail-modal": { classList: { remove() {} } }, "btn-close-modal": { addEventListener() {} } };
  const sb = {
    console, AccountView: AV, PERSON_ICON_SVG: "<svg/>", esc: AV.esc, modalMode: null, acctChildView: false,
    profile: o.profile, acct: { account: o.account || {} }, acctIdentity: () => ({ name: "주연", roleName: "엄마" }), acctHomeChildText: () => "아이1 · 생후 3개월",
    acctKidCount: () => o.kids || 1, acctOpenSlot() {}, hhEnabled: () => false, hhOpenSection() {}, closeDetail() {}, openRecordView() {}, showChildSwitchSheet() {}, beginNewChildEntry() {}, showProfileSheetBase() {},
    el: (id) => els[id] || null,
  };
  vm.createContext(sb);
  vm.runInContext(fn("acctProfileSheet"), sb);
  sb.acctProfileSheet();
  return els["modal-content"].innerHTML;
}
test("계정 모드 시트: 제목은 내 이름·역할(아이 이름이 제목이 아님), 사람 아이콘, 거주 지역, 구성원 관리, 아이는 '우리 아이' 한 줄(이름·나이)", () => {
  const h = sheet({ profile: { name: "아이1", province: "서울특별시", district: "구로구" } });
  assert.ok(/<h3>주연 · 나\(엄마\)<\/h3>/.test(h) && h.includes("<svg/>") && h.includes('id="acct-slot"'));
  assert.ok(h.includes("서울특별시 구로구") && h.includes("구성원 관리"));
  assert.ok(h.includes("우리 아이") && h.includes("아이1 · 생후 3개월") && h.includes('id="btn-acct-kid-row"'));
  assert.ok(!/<h3>[^<]*아이1/.test(h) && !h.includes("btn-photo") && !h.includes("btn-open-reset") && !h.includes("생년월일"));
});
test("계정 모드 시트: 아이가 없으면 '아이 등록하기' 한 줄만(아이 정보·기록 보기 없음)", () => {
  const h = sheet({ profile: null, account: { province: "서울특별시", district: "구로구" } });
  assert.ok(h.includes('id="btn-acct-kid-add"') && h.includes("아이 등록하기") && !h.includes("btn-acct-kid-row") && !h.includes("btn-view-records"));
});
test("정적: 시트 분기는 계정 모드+로그인일 때만, OFF 의 showProfileSheet 마크업은 그대로(Base 호출)", () => {
  assert.ok(APP.includes("if (acctEnabled() && acct.user && !acctChildView) return acctProfileSheet();") && APP.includes("return showProfileSheetBase(pendingPhoto);"));
  assert.ok(APP.includes('<h3>${esc(childDisplayName())}</h3>\n        <button type="button" class="btn-edit-icon" id="btn-open-reset"'), "기존 시트 마크업 유지");
});
console.log(`\n${passed}개 통과`);
