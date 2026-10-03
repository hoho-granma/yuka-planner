/* Q1~Q4: 내 이름·역할 표시·아이 이름 동기화, 내 계정 영역, 가족 추가(초대) 링크·공유, 프로필 정리. 실행: node test/q1-q4-family.test.js */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const AV = require("../js/account-view.js");
const AS = require("../js/account-sync.js");
const HV = require("../js/household-view.js");
const APP = fs.readFileSync(path.join(__dirname, "../js/app.js"), "utf8");
let passed = 0;
async function test(name, fn) { try { await fn(); passed++; console.log("  ok  - " + name); } catch (e) { process.exitCode = 1; console.log("  FAIL- " + name + "\n      " + (e.stack || e).split("\n").slice(0, 5).join("\n      ")); } }
/** app.js 의 함수 하나(들여쓰기 2칸 function ... 끝 "\n  }\n")를 소스로 뽑는다. */
const fn = (name, async_) => { const s = APP.indexOf(`  ${async_ ? "async " : ""}function ${name}(`); assert.ok(s >= 0, name); return APP.slice(s, APP.indexOf("\n  }\n", s) + 5); };
const J = (x) => JSON.parse(JSON.stringify(x));

(async () => {
  console.log("Q3 순수 함수");
  await test("초대 링크·문구: 형식 그대로(링크 + 가족코드), 대문자·인코딩", () => {
    assert.strictEqual(AV.inviteLink("abcd2345", "DAD", "m_1"), "https://hoho-granma.github.io/yuka-planner/?join=ABCD2345&role=DAD&from=m_1");
    assert.strictEqual(AV.inviteText("주연", "엄마", "L", "abcd2345"), "주연(엄마)님이 한눈육아 가족 캘린더에 초대했어요\nL\n가족코드: ABCD2345");
    assert.deepStrictEqual(AV.INVITE_ROLES.map((r) => r[0]), ["DAD", "CHILD", "OTHER"]);
  });
  await test("parseJoinParams: 코드 형식이 잘못되면 null(무시), role 은 DAD/CHILD/OTHER 만, from 은 안전한 문자만", () => {
    assert.deepStrictEqual(AV.parseJoinParams("?join=abcd2345&role=CHILD&from=m1"), { code: "ABCD2345", role: "CHILD", from: "m1" });
    assert.strictEqual(AV.parseJoinParams("?join=ABC"), null);
    assert.strictEqual(AV.parseJoinParams("?join=ABCD234O1"), null);
    assert.strictEqual(AV.parseJoinParams(""), null);
    assert.deepStrictEqual(AV.parseJoinParams("?join=ABCD2345&role=MOM&from=%3Cb%3E"), { code: "ABCD2345", role: "", from: "" });
  });
  await test("링크 가입 폼: 가족코드·역할이 미리 들어가고(바꿀 수 있음) 이메일·비밀번호·이름만 새로 입력, 상황·지역은 없다", () => {
    const form = { join: true, fromLink: true, familyCode: "ABCD2345", role: "DAD", from: "m1" };
    const h1 = AV.renderSignup({ form, errors: {}, regions: [] }), h2 = AV.renderSignup({ form: { ...form, step: 2 }, errors: {}, regions: [] }); // G7: 1단계 계정 / 2단계(마지막) 가족코드·역할
    const h = h1 + h2;
    assert.ok(h2.includes('value="ABCD2345"') && h2.includes('data-acct-radio="role"') && /aria-checked="true" class="acct-radio" data-acct-radio="role" data-value="DAD"/.test(h2) && !h.includes('data-acct-radio="situation"') && h1.includes("이메일·비밀번호·이름만") && h1.includes('data-acct-input="email"') && h2.includes('data-acct-action="submit-signup"') && h1.includes('data-acct-action="next-step"'));
    const v = AV.validateSignup({ ...form, email: "a@b.co", password: "12345678", displayName: "민", role: "OTHER" }, new Date(), null);
    assert.ok(v.ok);
    assert.deepStrictEqual([v.intent.role, v.intent.memberRole, v.intent.invitedFrom, v.intent.joiningCode], ["CAREGIVER", "OTHER", "m1", "ABCD2345"]);
    assert.ok(!AV.validateSignup({ ...form, email: "a@b.co", password: "12345678", displayName: "민", role: "" }, new Date(), null).ok, "역할을 비우면 오류");
    // 링크 없이 직접 들어온 합류: 지금처럼 코드만 입력(역할은 자리/역할 단계에서)
    assert.ok(!AV.renderSignup({ form: { join: true }, errors: {}, regions: [] }).includes('data-acct-radio="role"'));
  });
  await test("chooseMember(claimRole): 링크 가입은 그 역할의 빈 자리(uid 없음)를 차지하고, 없으면 새 구성원, uid 있는 자리는 건드리지 않는다", () => {
    const members = { a: { role: "OTHER", label: "가족", order: 3 }, b: { role: "OTHER", label: "가족2", order: 4, uid: "x" }, c: { role: "DAD", label: "아빠", order: 2 } };
    assert.strictEqual(AS.chooseMember(members, { role: "OTHER", uid: "u9", displayName: "민", claimRole: true }).memberId, "a");
    assert.strictEqual(AS.chooseMember({ b: members.b }, { role: "OTHER", uid: "u9", displayName: "민", claimRole: true }).memberId, null);
    assert.strictEqual(AS.chooseMember(members, { role: "DAD", uid: "u9", displayName: "민", claimRole: true }).memberId, "c");
  });

  console.log("Q2·Q4 화면");
  await test("내 계정 영역: 기본 아이콘 → 이름·역할 → 이메일 → 가족코드 순, 가족코드는 이메일과 같은 fine-print, 오른쪽 복사 아이콘, [다시 만들기]·구성원 추가 없음", () => {
    const h = AV.renderAccountSlot({ user: { email: "a@b.c" }, account: { displayName: "주연", role: "MOM" }, code: "ABCD2345", withCode: true });
    const at = (t) => h.indexOf(t);
    assert.ok(at("person-icon") > 0 && at("person-icon") < at("주연 · 나(엄마)") && at("주연 · 나(엄마)") < at("a@b.c") && at("a@b.c") < at("가족코드 ABCD2345"));
    assert.ok(/<span class="fine-print">a@b.c<\/span>/.test(h) && /<span class="fine-print">가족코드 ABCD2345<\/span><button type="button" class="acct-copy-ico" data-acct-action="copy-me" aria-label="가족코드 복사"/.test(h));
    assert.ok(!h.includes("hh-code") && !h.includes("ask-reissue") && !h.includes("다시 만들기") && h.includes('data-acct-action="open-invite"') && h.includes(">가족 추가<"));
    assert.ok(!h.includes("복사했어요") && AV.renderAccountSlot({ user: { email: "a@b.c" }, account: {}, code: "ABCD2345", withCode: true, notice: AV.MSG.inviteCopied }).includes("복사했어요"));
    const m = HV.renderMembers({ enabled: true, hasHousehold: true, acctMode: true, meId: "m1", members: [{ memberId: "m1", role: "MOM", label: "주연", order: 1, uid: "u" }], view: "list" });
    assert.ok(!m.includes('data-mem-action="add"') && m.includes('data-mem-action="edit"'), "구성원 추가 버튼 없음·수정은 그대로");
    assert.ok(HV.renderMembers({ enabled: true, hasHousehold: true, members: [], view: "list" }).includes('data-mem-action="add"'), "OFF/비계정은 그대로");
  });

  console.log("Q3 앱 동작");
  const inviteEnv = (o) => {
    const log = { upsert: [], sheets: [], shared: [], copied: [] };
    const sb = { console: { error() {}, log() {} }, Promise, AccountView: AV, HouseholdView: HV,
      acct: { form: { inviteRole: o.role === undefined ? "DAD" : o.role }, busy: false, notice: null, error: null }, hh: { hid: "h1", code: "ABCD2345" },
      usMembers: () => o.members || [{ memberId: "m1", role: "MOM", label: "주연", order: 1, uid: "u1" }], usMeId: () => "m1", acctIdentity: () => ({ name: "주연", roleName: "엄마" }),
      HouseholdSync: { upsertMember: async (h, d) => { if (o.fail) return { ok: false }; log.upsert.push([h, d]); return { ok: true, memberId: "new" }; } },
      acctShowSheet: (k) => log.sheets.push([k, sb.acct.busy, sb.acct.notice, sb.acct.error]), acctRefreshCalendar() {},
      navigator: { ...(o.share ? { share: async (d) => { if (o.share === "abort") throw Object.assign(new Error("a"), { name: "AbortError" }); log.shared.push(d); } } : {}), clipboard: { writeText: async (t) => { if (o.noClip) throw new Error("no"); log.copied.push(t); } } } };
    vm.createContext(sb);
    vm.runInContext(fn("acctInvitePreview") + fn("acctSendInvite", true) + "\n;globalThis.__t = { acctSendInvite };", sb);
    return { sb, log, t: sb.__t };
  };
  const TEXT = "주연(엄마)님이 한눈육아 가족 캘린더에 초대했어요\nhttps://hoho-granma.github.io/yuka-planner/?join=ABCD2345&role=DAD&from=m1\n가족코드: ABCD2345";
  await test("[초대 보내기]: 빈 자리가 없으면 그 역할의 uid 없는 구성원을 만들고(order=최대+1), 있으면 다시 쓴다", async () => {
    const e = inviteEnv({ share: true });
    await e.t.acctSendInvite();
    assert.deepStrictEqual(J(e.log.upsert), [["h1", { role: "DAD", label: "아빠", order: 2 }]]);
    const again = inviteEnv({ share: true, members: [{ memberId: "m1", role: "MOM", label: "주연", order: 1, uid: "u1" }, { memberId: "s1", role: "DAD", label: "아빠", order: 2 }] });
    await again.t.acctSendInvite();
    assert.deepStrictEqual(again.log.upsert, [], "이미 빈 자리가 있으면 새로 만들지 않는다");
    const taken = inviteEnv({ share: true, members: [{ memberId: "s1", role: "DAD", label: "아빠", order: 2, uid: "z" }] });
    await taken.t.acctSendInvite();
    assert.strictEqual(taken.log.upsert.length, 1, "uid 가 있는 자리는 쓰지 않는다");
  });
  await test("공유: navigator.share 가 있으면 문구로 공유, 없으면 문구 복사 + 안내, 공유창 닫기(AbortError)는 조용히, 역할 미선택은 아무 일 없음", async () => {
    const s = inviteEnv({ share: true });
    await s.t.acctSendInvite();
    assert.deepStrictEqual(J(s.log.shared), [{ text: TEXT }]);
    assert.deepStrictEqual(s.log.copied, []);
    const c = inviteEnv({});
    await c.t.acctSendInvite();
    assert.deepStrictEqual(c.log.copied, [TEXT]);
    assert.strictEqual(c.sb.acct.notice, AV.MSG.inviteTextCopied);
    const a = inviteEnv({ share: "abort" });
    await a.t.acctSendInvite();
    assert.deepStrictEqual([a.log.copied, a.sb.acct.notice, a.sb.acct.error, a.sb.acct.busy], [[], null, null, false]);
    const n = inviteEnv({ role: "" });
    await n.t.acctSendInvite();
    assert.deepStrictEqual([n.log.upsert, n.log.sheets], [[], []]);
    const f = inviteEnv({ share: true, fail: true });
    await f.t.acctSendInvite();
    assert.strictEqual(f.sb.acct.error, AV.MSG.inviteFail);
    const nc = inviteEnv({ noClip: true });
    await nc.t.acctSendInvite();
    assert.strictEqual(nc.sb.acct.error, AV.MSG.inviteFail);
  });
  const linkEnv = (o) => {
    const store = {}, keys = {}; let reloaded = 0; const replaced = [];
    const sb = { console, URLSearchParams, JSON, AccountView: AV, acct: {}, PREVIEW_KEYS: ["hannun_feature_household", "hannun_feature_accounts"],
      location: { search: o.search, pathname: "/yuka-planner/", hash: "", reload: () => { reloaded++; } }, history: { replaceState: (a, b, u) => replaced.push(u) },
      sessionStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => (store[k] = v), removeItem: (k) => delete store[k] }, localStorage: { setItem: (k, v) => (keys[k] = v) },
      acctEnabled: () => o.on };
    if (o.saved) store.hannun_join_link = JSON.stringify(o.saved);
    vm.createContext(sb);
    vm.runInContext('const JOIN_LINK_KEY = "hannun_join_link";\n' + fn("acctReadJoinLink") + fn("acctJoinLinkStart") + ";globalThis.__t = { acctReadJoinLink, acctJoinLinkStart };", sb);
    return { sb, store, keys, replaced, get reloaded() { return reloaded; }, t: sb.__t };
  };
  await test("링크로 들어옴(계정 ON): 주소에서 join·role·from 만 지우고(history.replaceState) 다른 파라미터는 유지, 링크를 처리 대기로 둔다", () => {
    const e = linkEnv({ search: "?join=abcd2345&role=DAD&from=m1&x=1", on: true });
    assert.strictEqual(e.t.acctJoinLinkStart(), false);
    assert.deepStrictEqual(e.replaced, ["/yuka-planner/?x=1"]);
    assert.deepStrictEqual(J(e.sb.acct.pendingLink), { code: "ABCD2345", role: "DAD", from: "m1" });
    assert.ok(!("hannun_join_link" in e.store) && e.reloaded === 0);
  });
  await test("코드 형식이 잘못된 링크는 무시(주소는 정리), 링크 없으면 아무 일 없음(주소·저장소 불변)", () => {
    const bad = linkEnv({ search: "?join=ZZ&role=DAD", on: true });
    assert.strictEqual(bad.t.acctJoinLinkStart(), false);
    assert.deepStrictEqual([bad.replaced, bad.sb.acct.pendingLink], [["/yuka-planner/"], undefined]);
    const none = linkEnv({ search: "", on: true });
    assert.strictEqual(none.t.acctJoinLinkStart(), false);
    assert.deepStrictEqual([none.replaced, none.store, none.reloaded], [[], {}, 0]);
  });
  await test("계정 기능이 꺼진 기기에서 유효한 링크: 베타 키 두 개를 켜고 새로고침(링크는 sessionStorage 에 보존), 새로고침 뒤 이어서 처리", () => {
    const e = linkEnv({ search: "?join=ABCD2345&role=OTHER&from=m1", on: false });
    assert.strictEqual(e.t.acctJoinLinkStart(), true);
    assert.deepStrictEqual([e.keys, e.reloaded], [{ hannun_feature_household: "1", hannun_feature_accounts: "1" }, 1]);
    assert.ok(e.store.hannun_join_link.includes("ABCD2345"));
    const after = linkEnv({ search: "", on: true, saved: { code: "ABCD2345", role: "OTHER", from: "m1" } });
    assert.strictEqual(after.t.acctJoinLinkStart(), false);
    assert.deepStrictEqual([J(after.sb.acct.pendingLink).code, "hannun_join_link" in after.store], ["ABCD2345", false]);
    const off = linkEnv({ search: "", on: false });
    assert.deepStrictEqual([off.t.acctJoinLinkStart(), off.reloaded, off.keys], [false, 0, {}], "링크가 없으면 OFF 기기는 아무 일도 하지 않는다");
  });
  await test("링크로 들어온 사람에게 첫 화면이 바로 회원가입(합류) 시트로 열린다(로그인된 기기는 무시)", () => {
    const sheets = [];
    const sb = { acct: { pendingLink: { code: "ABCD2345", role: "CHILD", from: "m1" } }, acctShowSheet: (k) => sheets.push(k) };
    vm.createContext(sb);
    vm.runInContext(fn("acctOpenLinkSignup") + ";globalThis.__t = { acctOpenLinkSignup };", sb);
    sb.__t.acctOpenLinkSignup();
    assert.deepStrictEqual([sheets, J(sb.acct.form), sb.acct.mode, sb.acct.pendingLink], [["signup"], { join: true, fromLink: true, familyCode: "ABCD2345", role: "CHILD", from: "m1" }, "signup", null]);
    assert.ok(APP.includes("if (u) acct.pendingLink = null;") && APP.includes("else if (acct.pendingLink) acctOpenLinkSignup();"));
    assert.ok(APP.includes("if (v.intent.joiningCode && acct.sync && !v.intent.memberRole)"), "링크 가입은 자리 선택 시트 없이 역할로 빈 자리를 차지");
  });

  console.log("Q1 내 이름·아이 이름");
  const meEnv = (o) => {
    const sb = { acctEnabled: () => o.on !== false, acct: { user: o.user === undefined ? { displayName: "Auth이름", email: "a@b.c" } : o.user, account: o.account }, AccountView: AV, HouseholdView: HV, usMeId: () => o.meId || null, usMembers: () => o.members || [] };
    vm.createContext(sb);
    vm.runInContext(fn("acctIdentity") + ";globalThis.__t = { acctIdentity };", sb);
    return sb.__t.acctIdentity;
  };
  await test("내 이름·역할(Q1): 계정(accounts)과 내 구성원(members) 기준 — '주연 · 엄마', 아이 이름('아이1')과 섞이지 않는다", () => {
    assert.deepStrictEqual(J(meEnv({ account: { displayName: "주연", role: "MOM" } })()), { name: "주연", roleName: "엄마" });
    assert.deepStrictEqual(J(meEnv({ account: { displayName: "주연", role: "CAREGIVER" }, meId: "m1", members: [{ memberId: "m1", role: "GRANDPARENT", label: "할머니" }] })()), { name: "주연", roleName: "할머니" }, "내 구성원의 역할이 우선");
    assert.deepStrictEqual(J(meEnv({ account: null, meId: "m1", members: [{ memberId: "m1", role: "MOM", label: "엄마" }] })()), { name: "엄마", roleName: "엄마" });
    assert.strictEqual(meEnv({ user: null, account: { displayName: "주연", role: "MOM" } })(), null);
    assert.strictEqual(meEnv({ on: false, account: { displayName: "주연" } })(), null);
    assert.ok(APP.includes("acctRenderMeLine();") && /strong\.textContent = id\.roleName \? `\$\{id\.name\} · \$\{AccountView\.MSG\.myRole\(id\.roleName\)\}` : id\.name;/.test(APP));
  });
  await test("아이 이름 수정 → 가구 링크 displayName 도 updateChild 로 맞춘다(같으면·링크 없으면·분리된 링크면 호출 없음)", async () => {
    const run = (links, name) => {
      const calls = [];
      const sb = { console: { error() {} }, Promise, hhEnabled: () => true, hh: { hid: "h1" }, familyCode: "KID111", profile: { name }, HouseholdSync: { getMirror: () => ({ children: links }), updateChild: async (h, k, f) => { calls.push([h, k, f]); } } };
      vm.createContext(sb);
      vm.runInContext(fn("hhSyncChildName") + ";globalThis.__t = { hhSyncChildName };", sb);
      sb.__t.hhSyncChildName();
      return J(calls);
    };
    assert.deepStrictEqual(run({ c1: { familyCode: "KID111", displayName: "아이1" } }, "수아"), [["h1", "c1", { displayName: "수아" }]]);
    assert.deepStrictEqual(run({ c1: { familyCode: "KID111", displayName: "수아" } }, "수아"), []);
    assert.deepStrictEqual(run({ c1: { familyCode: "OTHER1", displayName: "아이1" }, c2: { familyCode: "KID111", displayName: "아이1", removedAt: 5 } }, "수아"), []);
    assert.ok(APP.includes("hhSyncChildName(); // H1") && fn("showEditProfileSheet") !== "");
  });
  await test("D4(나): 계정 모드 프로필 시트에 [아이 전환] 1개 — 아이가 2명 이상일 때만(분리된 아이 제외), 기존 showChildSwitchSheet 재사용, OFF 마크업 불변", () => {
    const count = (kids, links) => {
      const sb = { HouseholdView: HV, loadChildren: () => kids, hh: { hid: links ? "h1" : null }, HouseholdSync: { getMirror: () => ({ children: links || {} }) }, familyCode: "A1" };
      vm.createContext(sb);
      vm.runInContext(fn("acctKidCount") + ";globalThis.__n = acctKidCount;", sb);
      return sb.__n();
    };
    assert.strictEqual(count([{ code: "A1", name: "수아" }]), 1);
    assert.strictEqual(count([{ code: "A1", name: "수아" }, { code: "B2", name: "은찬" }]), 2);
    assert.strictEqual(count([{ code: "A1", name: "수아" }], { c1: { familyCode: "B2", displayName: "은찬" } }), 2, "가구 링크의 아이도 센다");
    assert.strictEqual(count([{ code: "A1", name: "수아" }], { c1: { familyCode: "B2", displayName: "은찬", removedAt: 5 } }), 1, "분리된 아이는 제외");
    assert.ok(APP.includes("acctKidCount() >= 2 ? '<button type=\"button\" class=\"btn-close\" id=\"btn-acct-child-switch\">아이 전환</button>' : \"\""));
    assert.ok(APP.includes('el("btn-acct-child-switch").addEventListener("click", showChildSwitchSheet)'));
  });
  await test("D5: 이름·이메일·가족코드 왼쪽 정렬(CSS), [가족 추가]는 로그아웃과 같은 전체 폭 보조 버튼, 내 구성원 줄은 '이름 (나)'+오른쪽 역할, 가입 직후 안내 삭제", () => {
    const css = fs.readFileSync(path.join(__dirname, "../css/style.css"), "utf8");
    assert.ok(/\.acct-me-text \.fine-print \{ text-align: left; \}/.test(css) && /\.btn-close\.acct-btn-outline \{[^}]*border: 1\.5px solid var\(--accent-dark\)/.test(css));
    const h = AV.renderAccountSlot({ user: { email: "a@b.c" }, account: { displayName: "주연", role: "MOM" }, code: "ABCD2345", withCode: true });
    const acts = h.slice(h.indexOf('<div class="acct-actions">'));
    assert.ok(acts.indexOf('acct-btn-outline" data-acct-action="open-invite"') > 0 && acts.indexOf("open-invite") < acts.indexOf('data-acct-action="logout"'), "가족 추가 → 로그아웃 순, 같은 actions 컨테이너(전체 폭)");
    assert.ok(h.indexOf("open-invite") > h.indexOf("</div></div>") - 5 || !h.slice(0, h.indexOf('<div class="acct-actions">')).includes("open-invite"), "좁은 코드 영역 안에는 버튼이 없다");
    const members = [{ memberId: "m1", role: "MOM", label: "엄마", order: 1, uid: "u1" }, { memberId: "m2", role: "DAD", label: "아빠", order: 2 }];
    const m = HV.renderMembers({ enabled: true, hasHousehold: true, acctMode: true, meId: "m1", meName: "주연", members, view: "list" });
    assert.ok(m.includes('<span class="hh-member-name">주연 (나)</span><span class="hh-member-role">엄마</span>') && m.includes('<span class="hh-member-name">아빠</span>'));
    assert.ok(HV.renderMembers({ enabled: true, hasHousehold: true, acctMode: true, meId: "m1", members, view: "list" }).includes("엄마 (나)"), "이름을 모르면 구성원 이름");
    assert.ok(!APP.includes("MSG.signupDone") && AV.MSG.signupDone === undefined && APP.includes("acct.notice = null; // D5"));
    assert.ok(APP.includes('meName: (acctIdentity() || {}).name || ""'));
  });
  console.log(`\n${passed}개 통과${process.exitCode ? ", 일부 실패" : ""}`);
})();
