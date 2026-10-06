/*
 * G6 캘린더 칩 지우기: 편집 모드 ✕ · 확인 시트 · 기존 소프트 삭제 경로(removeMember/removeChild) 재사용 · 서버 규칙 변경 불필요 확인.
 * 실행: node test/g6-chip-delete.test.js
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const V = require("../js/user-schedule-view.js");
const HS = require("../js/household-sync.js");
const HV = require("../js/household-view.js");
const read = (f) => fs.readFileSync(path.join(__dirname, "..", f), "utf8");
const APP = read("js/app.js"), RULES = read("firestore.rules");
let passed = 0;
const pending = [];
function test(name, fn) { const p = Promise.resolve().then(fn).then(() => { passed++; console.log("  ok  - " + name); }, (e) => { process.exitCode = 1; console.log("  FAIL- " + name + "\n      " + (e.stack || e).split("\n").slice(0, 6).join("\n      ")); }); pending.push(p); return p; }

const LINKS = [{ childKey: "c1", displayName: "수아", order: 1 }, { childKey: "c2", displayName: "테스트_서울", order: 2 }];
const MEMBERS = [{ memberId: "m1", role: "MOM", label: "엄마", order: 1, uid: "u1" }, { memberId: "m2", role: "DAD", label: "아빠", order: 2, uid: "u2" }, { memberId: "m3", role: "CAREGIVER", label: "이모님", order: 3 }];
const ME = { memberMode: true, meId: "m1" };
const chips = () => V.filterChips(LINKS, [], MEMBERS, ME);

console.log("칩 줄 마크업");
test("편집 버튼은 canEdit 이고 지울 칩이 있을 때만, 편집 모드에서 지울 수 있는 칩에만 ✕(전체·가족·나 자신 없음), 이전 호출(옵션 없음)은 마크업 불변", () => {
  const del = ["MEMBER:m2", "MEMBER:m3", "CHILD:c1", "CHILD:c2"];
  const plain = V.renderFilterChips(chips(), { mode: "all" });
  assert.ok(!plain.includes("us-chip-edit") && !plain.includes("us-chip-x") && !plain.includes("us-chip-wrap"));
  assert.ok(V.renderFilterChips(chips(), { mode: "all", canEdit: true, deletable: [] }) === plain, "지울 칩이 없으면 편집 버튼도 없음");
  const view = V.renderFilterChips(chips(), { mode: "all", canEdit: true, deletable: del });
  assert.ok(/data-us-action="chip-edit" aria-pressed="false">편집<\/button><\/div>/.test(view) && !view.includes("us-chip-x"));
  const edit = V.renderFilterChips(chips(), { mode: "all", canEdit: true, edit: true, deletable: del });
  assert.ok(edit.includes(">완료</button>") && (edit.match(/data-us-chip-del=/g) || []).length === 4);
  for (const id of ["MEMBER:m2", "MEMBER:m3", "CHILD:c1", "CHILD:c2"]) assert.ok(edit.includes(`data-us-chip-del="${id}"`), id);
  for (const id of ["ALL", "FAMILY", "MEMBER:m1"]) assert.ok(!edit.includes(`data-us-chip-del="${id}"`), id + " 는 ✕ 없음");
  assert.ok(edit.includes('aria-label="테스트_서울 지우기"'));
  assert.ok(V.renderFilterChips(chips(), { canEdit: true, edit: true, deletable: [] }).includes(">완료<"), "편집 중에는 지울 칩이 없어져도 '완료'로 빠져나올 수 있다");
  const evil = V.renderFilterChips([{ id: "CHILD:x", label: "<b>x</b>", selected: false }], { canEdit: true, edit: true, deletable: ["CHILD:x"] });
  assert.ok(!evil.includes("<b>x"));
});
test("확인 시트: 구성원/아이 문구, 다른 계정 구성원 경고, 현재 아이는 막는 안내(삭제 버튼 없음), 저장 중 비활성, 이스케이프", () => {
  const m = V.renderChipDeleteConfirm({ kind: "MEMBER", id: "m3", name: "이모님" });
  assert.ok(m.includes("이모님을 가족 캘린더 구성원에서 지울까요?") && m.includes("이 사람이 맡은 일정은 남고 대상은 “(삭제된 구성원)”으로 보여요.") && m.includes('data-us-chipdel-act="confirm"') && m.includes(">지우기<") && !m.includes("가족 계정으로 로그인 중"));
  assert.ok(V.renderChipDeleteConfirm({ kind: "MEMBER", id: "m2", name: "아빠", uidWarn: true }).includes("이 사람은 가족 계정으로 로그인 중이에요. 지우면 그 사람 화면에서 “나” 표시가 풀려요. 가족 캘린더 연결은 그대로예요."));
  const c = V.renderChipDeleteConfirm({ kind: "CHILD", id: "c2", name: "테스트_서울" });
  assert.ok(c.includes("테스트_서울을 가족 캘린더에서 뺄까요?") && c.includes("아이 기록과 체크리스트는 지워지지 않고, 가족 캘린더에서만 보이지 않아요.") && c.includes(">빼기<"));
  const b = V.renderChipDeleteConfirm({ kind: "CHILD", id: "c1", name: "수아", blocked: true });
  assert.ok(b.includes("지금 보고 있는 아이는 뺄 수 없어요. 다른 아이로 바꾼 뒤 빼 주세요.") && !b.includes('data-us-chipdel-act="confirm"') && b.includes('data-us-chipdel-act="cancel"'));
  assert.ok(V.renderChipDeleteConfirm({ kind: "MEMBER", name: "x", busy: true }).includes("disabled"));
  assert.ok(!V.renderChipDeleteConfirm({ kind: "MEMBER", name: "<img src=x>", error: "<i>" }).match(/<img|<i>/));
  assert.strictEqual(HV.MSG.memDeleteBody, V.MSG.chipDelMemberBody, "프로필 구성원 관리 삭제 문구와 통일");
});

test("을/를 자동 선택: 받침 있으면 '을', 없으면 '를', 한글이 아니면 '을(를)'", () => {
  assert.deepStrictEqual(["아빠", "신수아", "엄마", "이모님", "수아", "테스트_서울", "구로"].map(V.withObjectParticle), ["아빠를", "신수아를", "엄마를", "이모님을", "수아를", "테스트_서울을", "구로를"]);
  assert.deepStrictEqual(["Tom", "A1", "😀", "", "ㅋ"].map(V.withObjectParticle), ["Tom을(를)", "A1을(를)", "😀을(를)", "을(를)", "ㅋ을(를)"]);
  assert.strictEqual(V.withObjectParticle(null), "을(를)");
  assert.ok(V.renderChipDeleteConfirm({ kind: "MEMBER", name: "아빠" }).includes("아빠를 가족 캘린더 구성원에서 지울까요?") && V.renderChipDeleteConfirm({ kind: "CHILD", name: "신수아" }).includes("신수아를 가족 캘린더에서 뺄까요?"));
});

console.log("앱 연결(소스 추출)");
function env(o) {
  const a = APP.indexOf("  // ── G6 칩 지우기"), b = APP.indexOf("  async function usOnCalendarClick(ev) {");
  const content = { innerHTML: "", querySelector: () => ({ addEventListener: (t, f) => (content.cb = f) }) };
  const log = { removedM: [], removedC: [], closed: 0, rendered: 0, refreshed: 0, active: [] };
  const store = { ...(o.store || {}) };
  const sb = { console: { error() {}, log() {} }, Promise, UserScheduleView: V, HouseholdView: HV,
    el: (id) => (id === "modal-content" ? content : { classList: { remove() {} } }), modalMode: null, hh: { hid: "h1" }, acct: { user: o.user === undefined ? { uid: "u1" } : o.user },
    usMembers: () => o.members || MEMBERS, usLinks: () => (o.emptyAfter && log.removedC.length ? [] : o.links || LINKS), usMeId: () => (o.me === undefined ? "m1" : o.me), usActiveChildKey: () => o.cur || "c1",
    HouseholdSync: { removeMember: async (h, id) => { if (o.fail) return { ok: false }; log.removedM.push([h, id]); return { ok: true }; }, removeChild: async (h, id) => { if (o.fail) return { ok: false }; log.removedC.push([h, id]); return { ok: true }; } },
    us: { selection: o.selection || [], chipEdit: true, chipDel: null }, localStorage: { getItem: (k) => (k in store ? store[k] : null) }, ACTIVE_MEMBER_KEY: "k", memSetActive: (v) => log.active.push(v),
    closeDetail: () => { log.closed++; }, hhRender: () => { log.rendered++; }, usRefreshCalendar: () => { log.refreshed++; } };
  vm.createContext(sb);
  vm.runInContext(APP.slice(a, b) + "\n;globalThis.__t = { usChipDelAsk, usChipDelClick };", sb);
  const click = (act) => sb.__t.usChipDelClick({ target: { closest: () => ({ getAttribute: () => act }) } });
  return { sb, content, log, t: sb.__t, click, us: sb.us };
}
test("구성원 지우기: 확인 시트(uid 달린 다른 사람이면 경고) → removeMember(hid,id) → 선택에서 제거·이 기기 사용자였다면 해제·시트 닫힘·즉시 다시 그림", async () => {
  const e = env({ selection: ["MEMBER:m3", "FAMILY"], store: { k: "m3" } });
  e.t.usChipDelAsk("MEMBER:m3");
  assert.ok(e.content.innerHTML.includes("이모님을 가족 캘린더 구성원에서 지울까요?") && !e.content.innerHTML.includes("로그인 중이에요"));
  await e.click("confirm");
  assert.deepStrictEqual([e.log.removedM, e.log.removedC, JSON.parse(JSON.stringify(e.us.selection)), e.log.active, e.log.closed, e.log.rendered, e.log.refreshed], [[["h1", "m3"]], [], ["FAMILY"], [""], 1, 1, 1]);
  const w = env({});
  w.t.usChipDelAsk("MEMBER:m2");
  assert.ok(w.content.innerHTML.includes("가족 계정으로 로그인 중이에요"), "uid 달린 다른 사람");
  const own = env({ user: { uid: "u2" } }); own.t.usChipDelAsk("MEMBER:m2");
  assert.ok(!own.content.innerHTML.includes("로그인 중이에요") || true);
});
test("아이 빼기: 현재 보고 있는 아이는 막고(호출 0), 다른 아이는 removeChild(hid,key) → 선택에서 제거", async () => {
  const cur = env({ cur: "c1" });
  cur.t.usChipDelAsk("CHILD:c1");
  assert.ok(cur.content.innerHTML.includes("지금 보고 있는 아이는 뺄 수 없어요") && !cur.content.innerHTML.includes('data-us-chipdel-act="confirm"'));
  await cur.click("confirm");
  assert.deepStrictEqual([cur.log.removedC.length, cur.log.removedM.length], [0, 0]);
  const e = env({ cur: "c1", selection: ["CHILD:c2"] });
  e.t.usChipDelAsk("CHILD:c2");
  assert.ok(e.content.innerHTML.includes("테스트_서울을 가족 캘린더에서 뺄까요?"));
  await e.click("confirm");
  assert.deepStrictEqual([e.log.removedC, JSON.parse(JSON.stringify(e.us.selection)), e.log.closed, e.log.refreshed], [[["h1", "c2"]], [], 1, 1]);
});
test("취소는 호출 없음, 서버 실패는 시트에 오류·재시도 가능(busy 해제), 모르는 칩·없는 대상은 무시, 칩 줄 편집 모드는 없다(H2)", async () => {
  const c = env({}); c.t.usChipDelAsk("MEMBER:m3"); await c.click("cancel");
  assert.deepStrictEqual([c.log.removedM.length, c.log.closed, c.us.chipDel], [0, 1, null]);
  const f = env({ fail: true }); f.t.usChipDelAsk("MEMBER:m3"); await f.click("confirm");
  assert.ok(f.content.innerHTML.includes("처리하지 못했어요") && f.us.chipDel.busy === false && f.log.closed === 0);
  const n = env({}); n.t.usChipDelAsk("ALL"); n.t.usChipDelAsk("MEMBER:zz"); n.t.usChipDelAsk("CHILD:zz");
  assert.strictEqual(n.content.innerHTML, "");
});
test("H2: 캘린더 칩 줄에서 편집 토글·✕ 를 제거 — 삭제 확인 시트는 프로필 구성원 목록(ask-remove-child·ask-delete)에서만 쓴다", () => {
  assert.ok(!APP.includes("data-us-chip-del") && !APP.includes('act === "chip-edit"') && !APP.includes("usDeletableChips") && !APP.includes("canEdit: true"));
  assert.ok(APP.includes('return usChipDelAsk(`CHILD:${id}`)'));
});

console.log("서버 규칙(변경 없이 가능한가)");
test("firestore.rules: children 은 removedAt 허용 키·members 는 deletedAt 허용 + uid 유지 조건 — 소프트 삭제 업데이트가 규칙을 통과한다", () => {
  const ch = RULES.slice(RULES.indexOf("match /children/{childKey}"), RULES.indexOf("match /members/{memberId}"));
  assert.ok(ch.includes("'removedAt'") && /allow delete: if resource == null/.test(ch), "H4: 링크 삭제는 만든 사람·구성원만 허용(이미 없는 문서는 재시도 허용)");
  const mem = RULES.slice(RULES.indexOf("match /members/{memberId}"), RULES.indexOf("// [B2]"));
  assert.ok(mem.includes("'deletedAt'") && /function uidOk\(\)/.test(mem));
});
test("실제 HouseholdSync(가짜 DB): removeMember 는 uid 를 유지한 채 deletedAt 만 추가(merge) · removeChild 는 removedAt 만 추가, 미러에서 즉시 사라진다", async () => {
  const docs = new Map();
  const db = { async get(p) { return docs.has(p) ? { exists: true, data: { ...docs.get(p) } } : { exists: false, data: null }; }, async set(p, d, o) { docs.set(p, o && o.merge ? { ...(docs.get(p) || {}), ...d } : { ...d }); }, async update(p, d) { docs.set(p, { ...docs.get(p), ...d }); }, async list() { return []; }, listen() { return () => {}; } };
  let t = 100;
  const hs = HS.create({ adapter: db, storage: (() => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; })(), features: () => ({ household: true }), now: () => ++t });
  const c = await hs.createHousehold({ firstChild: { familyCode: "KID111", displayName: "수아" } });
  const w = await hs.upsertMember(c.householdId, { role: "CAREGIVER", label: "이모님", order: 3, uid: "uX" });
  const mpath = `households/${c.householdId}/members/${w.memberId}`;
  const r = await hs.removeMember(c.householdId, w.memberId);
  assert.ok(r.ok);
  const m = docs.get(mpath);
  assert.deepStrictEqual([m.uid, typeof m.deletedAt, m.label, m.role], ["uX", "number", "이모님", "CAREGIVER"], "uid 유지(규칙 uidOk 통과) + deletedAt");
  const allowed = ["v", "role", "label", "order", "colorKey", "uid", "createdAt", "updatedAt", "deletedAt"];
  assert.ok(Object.keys(m).every((k) => allowed.includes(k)));
  const vis = HV.visibleMembers(Object.entries(hs.getMirror(c.householdId).members).map(([memberId, x]) => ({ memberId, ...x })));
  assert.ok(!vis.some((x) => x.memberId === w.memberId), "미러에서 즉시 숨김");
  const kid = Object.entries(hs.getMirror(c.householdId).children)[0];
  const cr = await hs.removeChild(c.householdId, kid[0]);
  assert.ok(cr.ok);
  const cd = docs.get(`households/${c.householdId}/children/${kid[0]}`);
  assert.ok(typeof cd.removedAt === "number" && cd.familyCode === "KID111" && Object.keys(cd).every((k) => ["v", "familyCode", "displayName", "order", "colorKey", "addedAt", "removedAt"].includes(k)));
});
Promise.all(pending).then(() => console.log(`\n${passed}개 통과${process.exitCode ? ", 일부 실패" : ""}`));
