/*
 * B6-lite 테스트: 구성원(이름·역할) 관리, "이 기기를 쓰는 사람", 일정 폼의 '담당' 칩, 카드·상세의 담당 라벨.
 * - js/household-view.js 순수 렌더/검증, js/user-schedule-view.js 폼·카드, js/app.js 연결(소스 추출 스텁).
 * 서버 호출 없음(HouseholdSync 는 스텁). 실행: node test/member-assignee.logic.test.js
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const HV = require("../js/household-view.js");
const V = require("../js/user-schedule-view.js");
const US = require("../js/user-schedule.js");
const CM = require("../js/calendar-model.js");
const M = HV.MSG;
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
let passed = 0, started = 0, finished = 0;
async function test(name, fn) {
  started++;
  try { await fn(); passed++; console.log("  ok  - " + name); } catch (e) { process.exitCode = 1; console.log("  FAIL- " + name + "\n      " + (e.stack || e).split("\n").slice(0, 6).join("\n      ")); }
  finished++;
}
process.on("exit", () => { if (started !== finished) { console.log(`FAIL- 끝나지 않은 테스트 ${started - finished}개(멈춤)`); process.exitCode = 1; } });
const text = (h) => h.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

const MEMBERS = [
  { memberId: "m1", role: "MOM", label: "엄마", order: 1 },
  { memberId: "m2", role: "DAD", label: "아빠", order: 2 },
  { memberId: "m3", role: "CAREGIVER", label: "이모님", order: 3 },
  { memberId: "m4", role: "OTHER", label: "옛 구성원", order: 4, deletedAt: 123 },
];
const ST = { enabled: true, hasHousehold: true, members: MEMBERS, activeMemberId: "", view: "list", form: null, deleteId: null };

(async () => {
  console.log("승인 문구(고정)");
  await test("구성원·기기 사용자·삭제 확인 문구와 역할 표시명이 확정본과 글자까지 같다", () => {
    assert.strictEqual(M.memTitle, "구성원");
    assert.strictEqual(M.memNote, "구성원 이름은 일정에 보여 주는 표시용이에요. 본인 확인은 아니에요.");
    assert.deepStrictEqual([M.memAdd, M.memEdit, M.memDelete, M.memSave, M.memCancel], ["구성원 추가", "수정", "삭제", "저장", "취소"]);
    assert.deepStrictEqual([M.memNameLabel, M.memNamePlaceholder, M.memRoleLabel], ["이름", "이름 (예: 이모님, 할머니)", "역할"]);
    assert.deepStrictEqual([M.memErrEmpty, M.memErrLong, M.memMax], ["이름을 입력해 주세요.", "이름은 20자까지 입력할 수 있어요.", "구성원은 8명까지 추가할 수 있어요."]);
    assert.strictEqual(M.memDeleteTitle, "구성원을 삭제할까요?");
    assert.strictEqual(M.memDeleteBody, "이 사람이 맡은 일정은 남고 담당은 “(삭제된 담당자)”로 보여요."); // G6 문구 통일
    assert.strictEqual(M.deviceUserLabel, "이 기기를 쓰는 사람");
    assert.strictEqual(M.deviceUserNote, "이 기기에서 새 일정을 만들 때 담당이 자동으로 정해져요. 표시용이고 본인 확인은 아니에요. 이 기기에만 저장돼요.");
    assert.strictEqual(M.deviceUserNone, "선택 안 함");
    assert.deepStrictEqual(HV.ROLE_NAMES, { MOM: "엄마", DAD: "아빠", GRANDPARENT: "조부모", CAREGIVER: "돌봄 선생님", OTHER: "기타" });
    assert.deepStrictEqual(HV.ROLES, ["MOM", "DAD", "GRANDPARENT", "CAREGIVER", "OTHER"]);
    assert.strictEqual(HV.MEMBER_MAX, 8); assert.strictEqual(HV.MEMBER_NAME_MAX, 20);
    assert.ok(Object.isFrozen(M) && Object.isFrozen(HV.ROLE_NAMES));
    assert.ok(!Object.keys(M).some((k) => /added|추가했어요/.test(k)) && !Object.values(M).includes("추가했어요."), "'추가했어요.' 알림 없음");
  });
  await test("일정 폼 문구: 담당 / 정하지 않음 / 힌트 / (삭제된 담당자)", () => {
    assert.deepStrictEqual([V.MSG.assigneeLabel, V.MSG.assigneeNone, V.MSG.assigneeHint, V.MSG.deletedAssignee], ["담당", "정하지 않음", "담당을 고르면 카드에 이름이 함께 보여요.", "(삭제된 담당자)"]);
  });

  console.log("household-view: 구성원 마크업·검증");
  await test("list 뷰: 제목·표시용 안내·이 기기 사용자 칩(선택 안 함 포함)·삭제된 구성원 제외·수정/삭제/추가 버튼", () => {
    const h = HV.renderMembers(ST);
    const t = text(h);
    assert.ok(t.includes("구성원") && t.includes(M.memNote) && t.includes(M.deviceUserLabel) && t.includes(M.deviceUserNote));
    assert.ok(h.includes('data-mem-action="set-active" data-member-id="m1"') && h.includes('data-mem-action="clear-active"') && t.includes("선택 안 함"));
    assert.ok(!t.includes("옛 구성원"), "삭제된 구성원은 보이지 않는다");
    assert.strictEqual((h.match(/data-mem-action="edit"/g) || []).length, 3);
    assert.strictEqual((h.match(/data-mem-action="ask-delete"/g) || []).length, 3);
    assert.ok(h.includes('data-mem-action="add"') && t.includes("구성원 추가"));
    assert.ok(t.includes("돌봄 선생님") && t.includes("엄마"));
    assert.ok(h.includes('data-mem="list"'));
  });
  await test("이 기기 사용자: 저장된 id 가 목록에 있으면 그 칩이 active, 없거나 삭제됐으면 '선택 안 함'이 active", () => {
    const on = HV.renderMembers({ ...ST, activeMemberId: "m2" });
    assert.ok(/class="hh-chip active" data-mem-action="set-active" data-member-id="m2"/.test(on) && !/hh-chip active" data-mem-action="clear-active"/.test(on));
    for (const id of ["", "zzz", "m4"]) {
      const h = HV.renderMembers({ ...ST, activeMemberId: id });
      assert.ok(/class="hh-chip active" data-mem-action="clear-active"/.test(h), id);
      assert.ok(!/hh-chip active" data-mem-action="set-active"/.test(h), id);
    }
    assert.strictEqual(HV.activeMemberOf(MEMBERS, "m4"), ""); assert.strictEqual(HV.activeMemberOf(MEMBERS, "m1"), "m1");
  });
  await test("OFF·가구 없음이면 빈 문자열(enabled 가 정확히 true, hasHousehold 가 정확히 true 일 때만 그린다)", () => {
    for (const enabled of [false, undefined, null, "true", 1]) assert.strictEqual(HV.renderMembers({ ...ST, enabled }), "");
    for (const hasHousehold of [false, undefined, null, "true", 1]) assert.strictEqual(HV.renderMembers({ ...ST, hasHousehold }), "");
    assert.strictEqual(HV.renderMembers(null), ""); assert.strictEqual(HV.renderMembers(undefined), "");
  });
  await test("form 뷰: 이름 입력(maxlength 20·placeholder)·역할 칩 5종·저장/취소·오류 문구, 값은 이스케이프", () => {
    const h = HV.renderMembers({ ...ST, view: "form", form: { memberId: null, role: "GRANDPARENT", label: '"><img src=x>', error: M.memErrEmpty } });
    assert.ok(h.includes('data-mem-input="label" maxlength="20"') && h.includes(`placeholder="${M.memNamePlaceholder}"`));
    assert.ok(!h.includes("<img") && h.includes("&quot;&gt;&lt;img src=x&gt;"));
    for (const r of HV.ROLES) assert.ok(h.includes(`data-mem-role="${r}"`), r);
    assert.ok(/hh-chip active" data-mem-role="GRANDPARENT"/.test(h) && !/hh-chip active" data-mem-role="MOM"/.test(h));
    assert.ok(h.includes('data-mem-action="save"') && h.includes('data-mem-action="cancel"') && text(h).includes(M.memErrEmpty) && h.includes("hh-warn"));
    assert.ok(!h.includes('data-mem-action="add"'));
  });
  await test("delete 뷰: 이름·역할 + 확정 문구 + 삭제/취소(confirm-delete 는 그 구성원 id)", () => {
    const h = HV.renderMembers({ ...ST, view: "delete", deleteId: "m3" });
    assert.ok(text(h).includes(M.memDeleteTitle) && text(h).includes(M.memDeleteBody) && text(h).includes("이모님") && text(h).includes("돌봄 선생님"));
    assert.ok(h.includes('data-mem-action="confirm-delete" data-member-id="m3"') && h.includes('data-mem-action="cancel"'));
    assert.strictEqual(HV.renderMembers({ ...ST, view: "delete", deleteId: "없는id" }).includes("confirm-delete"), false);
  });
  await test("8명이면 추가 버튼 대신 상한 안내(삭제된 구성원은 세지 않는다)", () => {
    const eight = Array.from({ length: 8 }, (_, i) => ({ memberId: "k" + i, role: "OTHER", label: "구성원" + i, order: i + 1 }));
    const h = HV.renderMembers({ ...ST, members: eight });
    assert.ok(!h.includes('data-mem-action="add"') && text(h).includes(M.memMax));
    const seven = HV.renderMembers({ ...ST, members: [...eight.slice(0, 7), { memberId: "gone", role: "OTHER", label: "x", order: 9, deletedAt: 1 }] });
    assert.ok(seven.includes('data-mem-action="add"'));
  });
  await test("validateMemberForm: 공백 제거·1~20자·역할 5종 / nextMemberOrder·visibleMembers 순서", () => {
    assert.deepStrictEqual(HV.validateMemberForm({ label: "  이모님 ", role: "CAREGIVER" }), { ok: true, label: "이모님", role: "CAREGIVER", error: null });
    assert.strictEqual(HV.validateMemberForm({ label: "   ", role: "MOM" }).error, M.memErrEmpty);
    assert.strictEqual(HV.validateMemberForm({ label: "가".repeat(21), role: "MOM" }).error, M.memErrLong);
    assert.strictEqual(HV.validateMemberForm({ label: "가".repeat(20), role: "MOM" }).ok, true);
    assert.strictEqual(HV.validateMemberForm({ label: "x", role: "BOSS" }).ok, false);
    assert.strictEqual(HV.nextMemberOrder(MEMBERS), 5, "삭제된 구성원의 order 도 센다");
    assert.strictEqual(HV.nextMemberOrder([]), 1);
    assert.deepStrictEqual(HV.visibleMembers([{ memberId: "b", label: "나", order: 2 }, { memberId: "a", label: "가", order: 1 }, { memberId: "c", label: "x", order: 1, deletedAt: 1 }]).map((m) => m.memberId), ["a", "b"]);
  });
  await test("순수성: 구성원 렌더·검증 소스에 DOM·저장소·네트워크 참조 없음", () => {
    const src = read("js/household-view.js").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
    ["document", "localStorage", "sessionStorage", "firebase", "fetch(", "FamilySync", "HouseholdSync", "navigator", "innerHTML", "addEventListener"].forEach((w) => assert.ok(!src.includes(w), w));
  });

  console.log("user-schedule-view: 담당 칩·저장 payload·카드 라벨");
  const LINKS = [{ childKey: "c1", displayName: "은찬", order: 1 }, { childKey: "c2", displayName: "서윤", order: 2 }];
  const visible = HV.visibleMembers(MEMBERS);
  await test("새 일정 폼: 기본 담당 = 이 기기 사용자(없으면 미지정), 담당 칩은 구성원이 있을 때만(+정하지 않음), 구성원이 없으면 영역 숨김", () => {
    const f = V.newForm({ date: "2026-10-06", activeChildKey: "c1", links: LINKS, defaultAssigneeId: "m1" });
    assert.strictEqual(f.assigneeMemberId, "m1");
    assert.strictEqual(V.newForm({ date: "2026-10-06", activeChildKey: "c1", links: LINKS }).assigneeMemberId, "");
    const h = V.renderForm(f, LINKS, { members: visible });
    assert.ok(text(h).includes("담당") && text(h).includes(V.MSG.assigneeHint));
    assert.ok(/us-chip[^"]*active[^>]*data-us-assignee="m1"|data-us-assignee="m1"[^>]*us-chip[^"]*active|us-chip active" data-us-assignee="m1"/.test(h) || /data-us-assignee="m1"/.test(h));
    assert.ok(h.includes('data-us-assignee=""') && text(h).includes("정하지 않음"));
    assert.ok(!h.includes('data-us-assignee="m4"'), "삭제된 구성원은 칩이 아니다");
    const none = V.renderForm(V.newForm({ date: "2026-10-06", activeChildKey: "c1", links: LINKS }), LINKS, { members: [] });
    assert.ok(!none.includes("data-us-assignee") && !none.includes(V.MSG.assigneeHint));
    assert.ok(!V.renderForm(f, LINKS, {}).includes("data-us-assignee"), "opts.members 가 없으면 그리지 않는다(기존 호출 호환)");
  });
  await test("저장된 담당이 삭제된 구성원이면 '(삭제된 담당자)' 칩이 active 로 보인다", () => {
    const f = { ...V.newForm({ date: "2026-10-06", activeChildKey: "c1", links: LINKS }), assigneeMemberId: "m4" };
    const h = V.renderForm(f, LINKS, { members: visible });
    assert.ok(text(h).includes("(삭제된 담당자)") && /us-chip active" data-us-assignee="m4"/.test(h));
  });
  await test("formToInput: 담당이 있으면 assigneeMemberId(문자열) 추가, 미지정이면 필드 자체가 없다 · UserSchedule 검증 통과", () => {
    const base = { ...V.newForm({ date: "2026-10-06", activeChildKey: "c1", links: LINKS }), title: "소아과", category: "HEALTH" };
    const withA = V.formToInput({ ...base, assigneeMemberId: "m2" });
    assert.strictEqual(withA.assigneeMemberId, "m2");
    assert.ok(!("assigneeMemberId" in V.formToInput({ ...base, assigneeMemberId: "" })));
    const prep = V.prepareSave({ ...base, category: US.CATEGORIES[0], assigneeMemberId: "m2" }, 1000);
    assert.ok(prep.ok, JSON.stringify(prep.messages));
    const doc = US.buildCreateDoc(prep.input, 1000);
    assert.ok(doc.ok && doc.doc.assigneeMemberId === "m2");
  });
  await test("수정 폼: 기존 담당 로드, 다른 구성원으로 변경=값 patch, 해제=null(필드 삭제 — location·memo 와 같은 방식), 변경 없음=patch 에 없음", () => {
    const cat = US.CATEGORIES[0];
    const doc = { id: "s1", sourceType: "MANUAL", title: "소아과", category: cat, scope: "FAMILY", dateKind: "FIXED", eventDate: "2026-10-06", allDay: true, assigneeMemberId: "m1", status: "TODO", createdAt: 1, updatedAt: 1, v: 1 };
    const f = V.formFromSchedule(doc);
    assert.strictEqual(f.assigneeMemberId, "m1");
    const before = V.stripId(doc);
    assert.deepStrictEqual(V.changesFromForm(f, before), {}, "변경 없음");
    assert.deepStrictEqual(V.changesFromForm({ ...f, assigneeMemberId: "m2" }, before), { assigneeMemberId: "m2" });
    assert.deepStrictEqual(V.changesFromForm({ ...f, assigneeMemberId: "" }, before), { assigneeMemberId: null }, "해제 = null(삭제)");
    const r = US.buildPatch(before, { assigneeMemberId: null }, 5);
    assert.ok(r.ok && r.patch.assigneeMemberId === null && !("assigneeMemberId" in r.after));
    const noAssignee = V.stripId({ ...doc, assigneeMemberId: undefined });
    assert.deepStrictEqual(V.changesFromForm({ ...V.formFromSchedule({ ...doc, assigneeMemberId: undefined }), assigneeMemberId: "" }, noAssignee), {}, "원래 없고 그대로 없으면 변경 없음");
    // 반복 일정 전체 수정 경로(planFullEdit)도 담당 변경을 patch 에 싣는다
    const rec = { ...doc, recurrence: { freq: "WEEKLY", interval: 1, byDay: ["TU"], startDate: "2026-10-06" } };
    delete rec.eventDate; delete rec.status; // 반복 일정은 문서 status 를 두지 않는다(완료·취소는 exceptions)
    const plan = V.planFullEdit({ ...V.formFromSchedule(rec), assigneeMemberId: "m2" }, V.stripId(rec), 9);
    assert.ok(plan.ok && plan.changes.assigneeMemberId === "m2" && plan.patch.assigneeMemberId === "m2", JSON.stringify(plan.messages));
  });
  await test("카드 태그: 담당은 화면에 표시하지 않는다(FAMILY='가족 일정', CHILD=아이 이름들) — 담당 데이터(assigneeText)는 그대로", () => {
    const mk = (extra) => {
      const doc = { id: "s", sourceType: "MANUAL", title: "일정", category: US.CATEGORIES[0], dateKind: "FIXED", eventDate: "2026-10-06", allDay: true, status: "TODO", createdAt: 1, updatedAt: 1, v: 1, ...extra };
      const m = CM.buildCalendarModel({ view: "month", range: { start: "2026-10-01", end: "2026-10-31" }, filter: { scope: "ALL" }, auto: { events: [], displayDates: new Map(), completed: {}, childKey: null }, user: { schedules: [doc], childLinks: LINKS, members: MEMBERS } });
      return V.cardData(m.days.get("2026-10-06").user[0], LINKS);
    };
    assert.strictEqual(mk({ scope: "FAMILY" }).tag, V.MSG.cardFamily);
    assert.strictEqual(mk({ scope: "FAMILY", assigneeMemberId: "m1" }).tag, V.MSG.cardFamily);
    assert.strictEqual(mk({ scope: "CHILD", childKeys: ["c1"] }).tag, "은찬");
    assert.strictEqual(mk({ scope: "CHILD", childKeys: ["c1"], assigneeMemberId: "m2" }).tag, "은찬");
    assert.strictEqual(mk({ scope: "CHILD", childKeys: ["c1", "c2"], assigneeMemberId: "m3" }).tag, "은찬 · 서윤");
    assert.strictEqual(mk({ scope: "FAMILY", assigneeMemberId: "m4" }).tag, V.MSG.cardFamily);
    assert.strictEqual(mk({ scope: "FAMILY", assigneeMemberId: "없는id" }).tag, V.MSG.cardFamily);
    const c = mk({ scope: "CHILD", childKeys: ["c1"], assigneeMemberId: "m2" });
    assert.strictEqual(c.assigneeText, "아빠"); assert.strictEqual(c.targetText, "은찬");
  });
  await test("상세: '대상' 줄은 대상만, 담당 줄은 화면에 없다(담당 데이터가 있어도)", () => {
    const base = { title: "t", categoryLabel: "건강", scope: "CHILD", dateText: "10/6", timeText: "", color: "#aaa", location: "", memo: "", done: false };
    const withA = V.renderDetail({ ...base, tag: "은찬 · 아빠", targetText: "은찬", assigneeText: "아빠" });
    assert.ok(/<div class="label">대상<\/div>은찬<\/div>/.test(withA) && !withA.includes(">담당<") && !withA.includes("아빠"));
    const without = V.renderDetail({ ...base, tag: "은찬", targetText: "은찬", assigneeText: "" });
    assert.ok(!without.includes(">담당<"));
    const legacy = V.renderDetail({ ...base, tag: "가족" }); // targetText 가 없는 옛 객체도 tag 로 대상 줄을 그린다
    assert.ok(/<div class="label">대상<\/div>가족<\/div>/.test(legacy));
  });

  console.log("app.js 연결(소스 추출 스텁)");
  const APP = read("js/app.js");
  function extract(header) {
    const i = APP.indexOf(header);
    assert.ok(i >= 0, "함수 없음: " + header);
    const open = APP.indexOf("{", APP.indexOf(")", i));
    let d = 0, j = open;
    for (; j < APP.length; j++) { if (APP[j] === "{") d++; else if (APP[j] === "}") { d--; if (d === 0) break; } }
    return APP.slice(i, j + 1);
  }
  const memFns = ["function memActiveId(", "function memSetActive(", "function memRender(", "function memReadLabel(", "async function memOnClick("].map(extract).join("\n") + "\n" +
    APP.match(/const memState = [^\n]+/)[0];

  function makeEnv({ members = MEMBERS, hid = "H1", code = "ABCD2345", stored = {}, upsertImpl, removeImpl, storageThrows } = {}) {
    const log = { upsert: [], remove: [], store: { ...stored }, setCalls: [], usRefresh: 0, warns: 0 };
    // 실제 DOM 처럼: innerHTML 을 바꾸면 입력창은 마크업의 value 로 다시 만들어지고, 폼 뷰가 아니면 입력창이 없다.
    const unesc = (v) => v.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
    let html = "";
    const slot = {
      get innerHTML() { return html; },
      set innerHTML(v) { html = v; const m = v.match(/data-mem-input="label"[^>]*value="([^"]*)"/); slot.hasInput = !!m; slot.input.value = m ? unesc(m[1]) : ""; },
      input: { value: "" }, hasInput: false,
      querySelector: (sel) => (sel === '[data-mem-input="label"]' && slot.hasInput ? slot.input : null),
    };
    const ctx = vm.createContext({
      console: { error() {}, warn() { log.warns++; }, log() {} },
      HouseholdView: HV,
      el: (id) => (id === "members-slot" ? slot : null),
      hhEnabled: () => true,
      usRefreshCalendar: () => { log.usRefresh++; }, usOrphanChildren: () => [],
      localStorage: {
        getItem: (k) => (k in log.store ? log.store[k] : null),
        setItem: (k, v) => { if (storageThrows) throw new Error("denied"); log.store[k] = v; log.setCalls.push(["set", k, v]); },
        removeItem: (k) => { if (storageThrows) throw new Error("denied"); delete log.store[k]; log.setCalls.push(["remove", k]); },
      },
      HouseholdSync: {
        upsertMember: async (h, arg) => { log.upsert.push([h, arg]); return upsertImpl ? upsertImpl(h, arg) : { ok: true, memberId: arg.memberId || "new1" }; },
        removeMember: async (h, id) => { log.remove.push([h, id]); return removeImpl ? removeImpl(h, id) : { ok: true }; },
        createHousehold: () => { throw new Error("createHousehold 호출 금지"); }, joinHousehold: () => { throw new Error("joinHousehold 호출 금지"); },
      },
      FamilySync: new Proxy({}, { get() { throw new Error("FamilySync 호출 금지"); } }),
    });
    vm.runInContext(`
      const ACTIVE_MEMBER_KEY = "hannun_active_member";
      const usMeId = () => null; // 계정 모드(D3)가 아닌 경우: 기존 기기 사용자 동작
      const acctEnabled = () => false; const acctIdentity = () => null; // H2: 계정 모드가 아니면 기존 구성원 UI 그대로
      const usLinks = () => []; const usChipDelAsk = () => {};
      const mem = { view: "list", form: null, deleteId: null, saving: false };
      const hh = { hid: ${JSON.stringify(hid)}, code: ${JSON.stringify(code)} };
      let __members = ${JSON.stringify(members)};
      const usMembers = () => __members;
      ${memFns}
      globalThis.__m = { mem, render: () => memRender(), setMembers: (m) => { __members = m; }, click: (attrs) => memOnClick({ target: { closest: (sel) => (sel === "[data-mem-role]" ? (attrs.role ? { getAttribute: () => attrs.role } : null) : sel === "[data-mem-action]" ? (attrs.action ? { getAttribute: (k) => (k === "data-mem-action" ? attrs.action : k === "data-member-id" ? attrs.id || "" : null) } : null) : null) }, stopPropagation() {} }), activeId: () => memActiveId() };
    `, ctx);
    return { m: ctx.__m, slot, log };
  }

  await test("이 기기 사용자 지정: 칩 클릭 → localStorage 에만 저장(서버 호출 0), '선택 안 함' → 삭제, 화면 갱신", async () => {
    const e = makeEnv();
    await e.m.click({ action: "set-active", id: "m2" });
    assert.deepStrictEqual(e.log.setCalls, [["set", "hannun_active_member", "m2"]]);
    assert.strictEqual(e.m.activeId(), "m2");
    assert.deepStrictEqual([e.log.upsert.length, e.log.remove.length], [0, 0]);
    assert.ok(/hh-chip active" data-mem-action="set-active" data-member-id="m2"/.test(e.slot.innerHTML));
    await e.m.click({ action: "clear-active" });
    assert.strictEqual(e.m.activeId(), ""); assert.strictEqual(e.log.setCalls[1][0], "remove");
  });
  await test("저장된 기기 사용자가 삭제된 구성원이거나 목록에 없으면 미지정으로 본다 · 저장소 예외는 경고만", async () => {
    assert.strictEqual(makeEnv({ stored: { hannun_active_member: "m4" } }).m.activeId(), "");
    assert.strictEqual(makeEnv({ stored: { hannun_active_member: "없음" } }).m.activeId(), "");
    assert.strictEqual(makeEnv({ stored: { hannun_active_member: "m1" } }).m.activeId(), "m1");
    const e = makeEnv({ storageThrows: true });
    await assert.doesNotReject(e.m.click({ action: "set-active", id: "m1" }));
    assert.strictEqual(e.log.warns, 1);
  });
  await test("추가: add→폼(기본 역할 OTHER)→이름 입력·저장 → upsertMember(hid, {role,label,order=최대+1}) 1회, memberId 없음, 목록 복귀", async () => {
    const e = makeEnv();
    await e.m.click({ action: "add" });
    assert.strictEqual(e.m.mem.view, "form"); assert.strictEqual(e.m.mem.form.role, "OTHER");
    await e.m.click({ role: "GRANDPARENT" });
    assert.strictEqual(e.m.mem.form.role, "GRANDPARENT");
    e.slot.input.value = " 할머니 ";
    await e.m.click({ action: "save" });
    assert.deepStrictEqual(JSON.parse(JSON.stringify(e.log.upsert)), [["H1", { role: "GRANDPARENT", label: "할머니", order: 5 }]]);
    assert.strictEqual(e.log.upsert[0][1].memberId, undefined);
    assert.strictEqual(e.m.mem.view, "list"); assert.strictEqual(e.m.mem.form, null);
    assert.strictEqual(e.log.remove.length, 0);
  });
  await test("역할 칩을 눌러도 입력 중이던 이름은 유지된다", async () => {
    const e = makeEnv();
    await e.m.click({ action: "add" });
    e.slot.input.value = "이모님";
    await e.m.click({ role: "CAREGIVER" });
    assert.strictEqual(e.m.mem.form.label, "이모님");
    assert.ok(e.slot.innerHTML.includes('value="이모님"'));
  });
  await test("수정: edit→폼(현재 이름·역할)→저장 → upsertMember 가 같은 memberId·기존 order 로 호출", async () => {
    const e = makeEnv();
    await e.m.click({ action: "edit", id: "m3" });
    assert.deepStrictEqual([e.m.mem.form.memberId, e.m.mem.form.label, e.m.mem.form.role], ["m3", "이모님", "CAREGIVER"]);
    e.slot.input.value = "이모";
    await e.m.click({ role: "OTHER" });
    await e.m.click({ action: "save" });
    assert.deepStrictEqual(JSON.parse(JSON.stringify(e.log.upsert)), [["H1", { memberId: "m3", role: "OTHER", label: "이모", order: 3 }]]);
  });
  await test("검증 실패(빈 이름·21자)는 서버 호출 없이 승인 문구로 폼에 표시, 8명이면 추가 불가", async () => {
    const e = makeEnv();
    await e.m.click({ action: "add" });
    e.slot.input.value = "   "; await e.m.click({ action: "save" });
    assert.ok(e.slot.innerHTML.includes(M.memErrEmpty));
    e.slot.input.value = "가".repeat(21); await e.m.click({ action: "save" });
    assert.ok(e.slot.innerHTML.includes(M.memErrLong));
    assert.strictEqual(e.log.upsert.length, 0);
    const eight = Array.from({ length: 8 }, (_, i) => ({ memberId: "k" + i, role: "OTHER", label: "구" + i, order: i + 1 }));
    const f = makeEnv({ members: eight });
    await f.m.click({ action: "add" });
    assert.strictEqual(f.m.mem.view, "list", "8명이면 폼이 열리지 않는다"); assert.strictEqual(f.log.upsert.length, 0);
  });
  await test("저장 실패(예외·ok:false)는 기존 failNetwork 문구를 폼에 보이고 폼을 유지한다", async () => {
    for (const impl of [() => { throw new Error("offline"); }, () => ({ ok: false, reason: "disabled" })]) {
      const e = makeEnv({ upsertImpl: impl });
      await e.m.click({ action: "add" }); e.slot.input.value = "이모님"; await e.m.click({ action: "save" });
      assert.strictEqual(e.m.mem.view, "form"); assert.ok(e.slot.innerHTML.includes(M.failNetwork));
    }
  });
  await test("삭제: ask-delete→확인 문구→confirm-delete → removeMember(hid, id) 1회(soft delete), 이 기기 사용자였다면 지정 해제, 취소는 호출 없음", async () => {
    const e = makeEnv({ stored: { hannun_active_member: "m3" } });
    await e.m.click({ action: "ask-delete", id: "m3" });
    assert.strictEqual(e.m.mem.view, "delete"); assert.ok(e.slot.innerHTML.includes(M.memDeleteBody));
    await e.m.click({ action: "cancel" });
    assert.strictEqual(e.log.remove.length, 0); assert.strictEqual(e.m.mem.view, "list");
    await e.m.click({ action: "ask-delete", id: "m3" });
    await e.m.click({ action: "confirm-delete", id: "m3" });
    assert.deepStrictEqual(e.log.remove, [["H1", "m3"]]);
    assert.ok(!(("hannun_active_member") in e.log.store), "삭제한 구성원이 이 기기 사용자였으면 해제");
    const other = makeEnv({ stored: { hannun_active_member: "m1" } });
    await other.m.click({ action: "confirm-delete", id: "m3" });
    assert.strictEqual(other.log.store.hannun_active_member, "m1", "다른 구성원 삭제는 지정을 건드리지 않는다");
  });
  await test("구성원 변경 뒤 캘린더를 다시 그린다(담당 라벨 갱신) · 서버 쓰기는 upsert/remove 뿐(create/join/FamilySync 호출 금지 스텁이 던지지 않음)", async () => {
    const e = makeEnv();
    await e.m.click({ action: "set-active", id: "m1" });
    assert.strictEqual(e.log.usRefresh, 1);
  });
  const deferred = () => { const d = { __deferred: true }; d.promise = new Promise((res, rej) => { d.resolve = res; d.reject = rej; }); return d; };
  const tick = () => new Promise((r) => setImmediate(r));
  const EVIL = '"><img src=x onerror=alert(1)>';
  const EVIL_ID = 'x"><script>alert(2)</script>';
  const ESC_EVIL = "&quot;&gt;&lt;img src=x onerror=alert(1)&gt;";
  const ESC_ID = "x&quot;&gt;&lt;script&gt;alert(2)&lt;/script&gt;";
  const noRaw = (h, name) => assert.ok(!/<img|<script|onerror=alert\(1\)>(?!&)/.test(h.replace(/&lt;img[^&]*&gt;/g, "")) && !h.includes("<img") && !h.includes("<script"), name + ": 이스케이프되지 않은 태그가 있다");

  console.log("이스케이프(악성 이름·id)");
  await test("구성원 목록: 행 이름·기기 사용자 칩 이름·data-member-id 가 모두 이스케이프된다", () => {
    const members = [{ memberId: EVIL_ID, role: "OTHER", label: EVIL, order: 1 }];
    const h = HV.renderMembers({ ...ST, members, activeMemberId: EVIL_ID });
    noRaw(h, "list");
    assert.ok((h.match(new RegExp(ESC_EVIL.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length >= 2, "행 이름과 칩 이름 둘 다 이스케이프");
    assert.ok(h.includes(`data-member-id="${ESC_ID}"`));
    assert.ok(new RegExp(`hh-chip active" data-mem-action="set-active" data-member-id="${ESC_ID.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`).test(h), "id 가 이스케이프된 채로도 active 판정이 맞는다");
  });
  await test("삭제 확인: 이름·id 이스케이프", () => {
    const members = [{ memberId: EVIL_ID, role: "OTHER", label: EVIL, order: 1 }];
    const h = HV.renderMembers({ ...ST, members, view: "delete", deleteId: EVIL_ID });
    noRaw(h, "delete");
    assert.ok(h.includes(ESC_EVIL) && h.includes(`data-member-id="${ESC_ID}"`));
  });
  await test("일정 폼 담당 칩: 이름·data-us-assignee id 이스케이프(저장된 삭제 구성원 id 칩도)", () => {
    const members = [{ memberId: EVIL_ID, role: "OTHER", label: EVIL, order: 1 }];
    const f = { ...V.newForm({ date: "2026-10-06", activeChildKey: "c1", links: LINKS }), assigneeMemberId: EVIL_ID };
    const h = V.renderForm(f, LINKS, { members });
    noRaw(h, "form");
    assert.ok(h.includes(`data-us-assignee="${ESC_ID}"`) && h.includes(ESC_EVIL));
    const stale = V.renderForm({ ...f, assigneeMemberId: EVIL_ID + "2" }, LINKS, { members });
    noRaw(stale, "stale");
    assert.ok(stale.includes(`data-us-assignee="${ESC_ID}2"`));
  });
  await test("카드·상세: 담당 라벨(태그·담당 줄)도 이스케이프", () => {
    const card = V.renderCard({ key: "k", scheduleId: "s", title: "t", categoryLabel: "건강", timeText: "", dateText: "10/6", tag: EVIL, color: "#aaa", done: false, doneLabel: "" });
    noRaw(card, "card"); assert.ok(card.includes(ESC_EVIL));
    const det = V.renderDetail({ title: "t", categoryLabel: "건강", scope: "CHILD", dateText: "10/6", timeText: "", color: "#aaa", location: "", memo: "", done: false, tag: EVIL, targetText: EVIL, assigneeText: EVIL });
    noRaw(det, "detail"); assert.ok(det.includes(ESC_EVIL));
  });

  console.log("입력 보존·저장 중복 방지");
  await test("다시 그려져도(hhRender·서버 스냅샷) 추가 폼에서 입력 중이던 이름이 유지된다", async () => {
    const e = makeEnv();
    await e.m.click({ action: "add" });
    e.slot.input.value = "이모님";   // 아직 저장 전, 입력 중
    e.m.render();                    // 가구 섹션 클릭/스냅샷으로 memRender 가 다시 돈다
    assert.strictEqual(e.m.mem.form.label, "이모님");
    assert.strictEqual(e.slot.input.value, "이모님", "다시 그린 입력창에도 입력값이 남는다");
    assert.ok(e.slot.innerHTML.includes('value="이모님"'));
  });
  await test("다시 그려져도 수정 폼에서 고치던 이름이 원래 이름으로 되돌아가지 않는다", async () => {
    const e = makeEnv();
    await e.m.click({ action: "edit", id: "m3" });
    assert.strictEqual(e.slot.input.value, "이모님");
    e.slot.input.value = "이모님2";
    e.m.render();
    assert.strictEqual(e.m.mem.form.label, "이모님2"); assert.strictEqual(e.slot.input.value, "이모님2");
    await e.m.click({ action: "save" });
    assert.strictEqual(e.log.upsert[0][1].label, "이모님2");
  });
  await test("hhRender 는 구성원 영역도 다시 그린다(정적) · 입력 반영은 memRender 안에서(그리기 전에)", () => {
    assert.ok(/function hhRender\(\) \{[\s\S]*?memRender\(\);/.test(APP));
    const body = extract("function memRender(");
    assert.ok(body.indexOf("mem.form.label = memReadLabel()") > 0 && body.indexOf("mem.form.label = memReadLabel()") < body.indexOf("slot.innerHTML"));
  });
  await test("저장 연속 클릭: upsertMember 는 1회만, 저장 중에는 저장 버튼이 잠기고, 끝나면 목록으로 돌아가며 이후 다시 저장할 수 있다", async () => {
    const d = deferred();
    const e = makeEnv({ upsertImpl: () => d.promise });
    await e.m.click({ action: "add" });
    e.slot.input.value = "이모님";
    const first = e.m.click({ action: "save" });
    await tick();
    assert.strictEqual(e.log.upsert.length, 1);
    assert.ok(/data-mem-action="save" disabled/.test(e.slot.innerHTML), "저장 중 버튼 비활성");
    e.m.click({ action: "save" }); e.m.click({ action: "save" }); await tick();
    assert.strictEqual(e.log.upsert.length, 1, "연속 클릭에도 1회");
    d.resolve({ ok: true, memberId: "new1" });
    await first;
    assert.strictEqual(e.m.mem.view, "list"); assert.strictEqual(e.m.mem.saving, false);
    await e.m.click({ action: "add" }); e.slot.input.value = "할머니";
    e.m.click({ action: "save" }); await tick();
    assert.strictEqual(e.log.upsert.length, 2, "끝난 뒤의 새 저장은 가능");
  });
  await test("8명 상한 검사도 저장 중 연속 클릭에 뚫리지 않는다(7명에서 두 번 저장해도 1회)", async () => {
    const seven = Array.from({ length: 7 }, (_, i) => ({ memberId: "k" + i, role: "OTHER", label: "구" + i, order: i + 1 }));
    const d = deferred();
    const e = makeEnv({ members: seven, upsertImpl: () => d.promise });
    await e.m.click({ action: "add" }); e.slot.input.value = "여덟째";
    const a = e.m.click({ action: "save" }); await tick();
    e.m.click({ action: "save" }); await tick();
    assert.strictEqual(e.log.upsert.length, 1);
    d.resolve({ ok: true }); await a;
  });
  await test("저장이 실패(예외)하면 진행 플래그가 풀려 다시 저장할 수 있다", async () => {
    const d = deferred();
    const e = makeEnv({ upsertImpl: () => d.promise });
    await e.m.click({ action: "add" }); e.slot.input.value = "이모님";
    const first = e.m.click({ action: "save" }); await tick();
    d.reject(new Error("offline")); await first;
    assert.strictEqual(e.m.mem.saving, false); assert.ok(e.slot.innerHTML.includes(M.failNetwork));
    assert.ok(!/data-mem-action="save" disabled/.test(e.slot.innerHTML));
    e.m.click({ action: "save" }); await tick();
    assert.strictEqual(e.log.upsert.length, 2);
  });
  await test("삭제 연속 클릭: removeMember 는 1회만, 삭제 중에는 삭제 버튼이 잠긴다, 끝나면 해제", async () => {
    const d = deferred();
    const e = makeEnv({ removeImpl: () => d.promise });
    await e.m.click({ action: "ask-delete", id: "m3" });
    const first = e.m.click({ action: "confirm-delete", id: "m3" }); await tick();
    assert.ok(/data-mem-action="confirm-delete" data-member-id="m3" disabled/.test(e.slot.innerHTML));
    e.m.click({ action: "confirm-delete", id: "m3" }); e.m.click({ action: "confirm-delete", id: "m3" }); await tick();
    assert.strictEqual(e.log.remove.length, 1);
    d.resolve({ ok: true }); await first;
    assert.strictEqual(e.m.mem.saving, false); assert.strictEqual(e.m.mem.view, "list");
  });
  await test("시트를 다시 열어도(hhOpenSection) 저장 진행 플래그는 풀리지 않는다(정적)", () => {
    const body = extract("function hhOpenSection(");
    assert.ok(!/mem\.saving\s*=/.test(body));
  });

  await test("정적: 구성원 블록은 Firestore 규칙·스키마 밖 필드를 쓰지 않는다(role 5종·label·order 만 전달) · 서버 호출은 upsertMember/removeMember 뿐", () => {
    const block = APP.slice(APP.indexOf("// ── 구성원(B6-lite)"), APP.indexOf("// ── 가족 캘린더 베타 켜기 스위치"));
    assert.ok(block.length > 500);
    assert.ok(!/FamilySync|createHousehold|joinHousehold|reissueCode|fetch\(|firebase|colorKey|deletedAt\s*:/.test(block));
    const calls = block.match(/HouseholdSync\.\w+/g) || [];
    assert.deepStrictEqual([...new Set(calls)].sort(), ["HouseholdSync.removeMember", "HouseholdSync.upsertMember"]);
    assert.ok(/localStorage\.(setItem|removeItem)\(ACTIVE_MEMBER_KEY/.test(block) && /const ACTIVE_MEMBER_KEY = "hannun_active_member"/.test(block));
  });
  await test("일정 폼 연결: 새 일정 기본 담당=memActiveId(), 폼에 members 전달, 담당 칩 클릭은 같은 칩을 다시 누르면 해제", () => {
    assert.ok(/defaultAssigneeId: memActiveId\(\)/.test(APP));
    assert.ok(/members: HouseholdView\.visibleMembers\(usMembers\(\)\)/.test(APP));
    const i = APP.indexOf('const asg = ev.target.closest("[data-us-assignee]")');
    assert.ok(i > 0);
    const body = APP.slice(i, APP.indexOf("const rep = ev.target.closest", i));
    assert.ok(/us\.form\.assigneeMemberId = us\.form\.assigneeMemberId === v \? "" : v/.test(body));
  });
  await test("프로필 시트: 구성원 슬롯은 가구 슬롯 옆(플래그 ON 일 때만)이고, 시트를 열 때 구성원 UI 상태를 초기화·클릭을 연결한다", () => {
    assert.ok(/<div id="hh-slot"><\/div><div id="members-slot"><\/div>' : ""\}/.test(APP) && APP.includes('<div id="members-slot"></div></details>')); // H1: 계정 모드에서는 hh-slot 생략, members-slot 은 유지
    const body = extract("function hhOpenSection(");
    assert.ok(/mem\.view = "list"; mem\.form = null; mem\.deleteId = null;/.test(body) && /addEventListener\("click", memOnClick\)/.test(body));
  });
  await test("AUTO 불변: 구성원·담당 코드는 completed·자동 일정(schedule/engine)을 건드리지 않는다", () => {
    const block = APP.slice(APP.indexOf("// ── 구성원(B6-lite)"), APP.indexOf("// ── 가족 캘린더 베타 켜기 스위치"));
    assert.ok(!/completed|buildSchedule|TodoEngine|calendarSchedule/.test(block));
  });

  console.log(`\n${passed}개 통과${process.exitCode ? ", 일부 실패" : ""}`);
})();
