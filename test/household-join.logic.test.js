/*
 * 핫픽스(가족 캘린더 8자리 코드 참여 진입점) 테스트.
 * - js/household-view.js: 프로필 시트 '가족 캘린더' none 뷰의 시작 안내·'가족 코드로 참여' 영역·아이 전환 버튼 마크업과 승인 문구.
 * - js/app.js: 소스에서 hhOnClick 등을 꺼내 스텁 환경에서 실행 — 참여 = 가구 가입만(현재 아이·profile·completed·familyCode 불변).
 * 설계: 핫픽스 A안(가구 가입만). 서버 호출 없음(HouseholdSync 는 스텁).
 * 실행: node test/household-join.logic.test.js
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const HV = require("../js/household-view.js");
const M = HV.MSG;
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
let passed = 0, started = 0, finished = 0;
async function test(name, fn) {
  started++;
  try { await fn(); passed++; console.log("  ok  - " + name); } catch (e) { process.exitCode = 1; console.log("  FAIL- " + name + "\n      " + (e.stack || e).split("\n").slice(0, 6).join("\n      ")); }
  finished++;
}
// 끝나지 않는 await(예: 진행 중 가드가 없어 두 번째 호출이 영원히 기다리는 경우)로 테스트가 조용히 멈춰도 실패로 잡는다.
process.on("exit", () => { if (started !== finished) { console.log(`FAIL- 끝나지 않은 테스트 ${started - finished}개(멈춤)`); process.exitCode = 1; } });
const ON = { enabled: true, view: "none", childName: "은찬", code: null, pending: 0, permissionDenied: false, rulesUnavailable: false, notice: null };
const text = (h) => h.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

(async () => {
  console.log("승인 문구(고정)");
  await test("핫픽스 문구가 승인본과 글자까지 같다", () => {
    assert.strictEqual(M.startHint, "시작하려면 가족 캘린더를 만들거나, 가족에게 받은 코드로 참여하세요.");
    assert.strictEqual(M.joinDesc, "가족이 만든 가족 캘린더가 있나요? 받은 코드 8자리를 입력하면 일정을 함께 볼 수 있어요.");
    assert.strictEqual(M.joinPlaceholder, "가족 코드 8자리");
    assert.strictEqual(M.joinButton, "참여하기");
    assert.strictEqual(M.switchChildButton, "아이 전환");
    const us = require("../js/user-schedule-view.js");
    assert.strictEqual(us.MSG.needHousehold, "일정을 추가하려면 프로필에서 가족 캘린더를 만들거나, 가족에게 받은 코드로 참여해 주세요.");
  });

  console.log("household-view: none 뷰 마크업");
  await test("none 뷰: 시작 안내가 '만들기' 위에, '가족 코드로 참여' 영역(안내·입력·버튼)이 아래에 있다", () => {
    const h = HV.renderSection({ ...ON, view: "none" });
    const iHint = h.indexOf(M.startHint), iCreate = h.indexOf('data-hh-action="create"'), iJoinDesc = h.indexOf(M.joinDesc), iInput = h.indexOf('data-hh-input="join-code"'), iJoin = h.indexOf('data-hh-action="join"');
    assert.ok(iHint > 0 && iHint < iCreate && iCreate < iJoinDesc && iJoinDesc < iInput && iInput < iJoin, [iHint, iCreate, iJoinDesc, iInput, iJoin].join(","));
    assert.ok(/<input type="text" class="hh-input" data-hh-input="join-code" maxlength="8"/.test(h));
    assert.ok(h.includes(`placeholder="${M.joinPlaceholder}"`));
    assert.ok(text(h).includes(M.joinButton));
    assert.ok(!h.includes('data-hh-action="child-switch"'), "showChildSwitch 가 없으면 아이 전환 버튼 없음");
  });
  await test("입력값(joinInput)은 이스케이프되어 value 에 들어간다(따옴표·꺾쇠)", () => {
    const h = HV.renderSection({ ...ON, view: "none", joinInput: '"><script>alert(1)</script>' });
    assert.ok(!h.includes("<script>"));
    assert.ok(h.includes('value="&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;"'));
  });
  await test("OFF(enabled 가 true 가 아님)면 어떤 상태·옵션이어도 빈 문자열이다 — 핫픽스 추가분도 포함", () => {
    for (const enabled of [false, undefined, null, "true", 1]) {
      for (const view of ["none", "joining", "active", "consent"]) assert.strictEqual(HV.renderSection({ ...ON, enabled, view, showChildSwitch: true, joinInput: "ABCD1234", notice: { kind: "joinOk", text: "x" } }), "");
    }
  });
  await test("joining 뷰: '불러오는 중' 한 줄(입력·버튼 없음), 아이 전환 버튼도 숨김", () => {
    const h = HV.renderSection({ ...ON, view: "joining", showChildSwitch: true });
    assert.ok(text(h).includes(M.joining));
    assert.ok(!h.includes("data-hh-input") && !h.includes('data-hh-action="join"') && !h.includes("child-switch"));
  });
  await test("아이 전환 버튼: showChildSwitch 가 true 이고 none·active 뷰일 때만(확인·생성·재발급 단계에서는 숨김)", () => {
    for (const view of ["none", "active"]) assert.ok(HV.renderSection({ ...ON, view, code: "ABCD1234", showChildSwitch: true }).includes('data-hh-action="child-switch"'), view);
    for (const view of ["consent", "creating", "joining", "reissue-confirm", "reissuing"]) assert.ok(!HV.renderSection({ ...ON, view, showChildSwitch: true }).includes("child-switch"), view);
    for (const v of [false, undefined, "true", 1]) assert.ok(!HV.renderSection({ ...ON, view: "none", showChildSwitch: v }).includes("child-switch"), String(v));
    assert.ok(text(HV.renderSection({ ...ON, view: "none", showChildSwitch: true })).includes("아이 전환"));
  });
  await test("참여 성공 알림(joinOk)은 이스케이프된 문구로 나오고, 실패는 기존 경고 문구로 나온다", () => {
    const ok = HV.renderSection({ ...ON, view: "active", code: "ABCD1234", notice: { kind: "joinOk", text: M.joinOk(2) } });
    assert.ok(ok.includes("가족 캘린더에 들어왔어요. 아이 2명을 불러왔어요."));
    const bad = HV.renderSection({ ...ON, view: "none", notice: { kind: "error", text: M.joinNotFound } });
    assert.ok(bad.includes(M.joinNotFound) && bad.includes("hh-warn"));
    assert.ok(!HV.renderSection({ ...ON, notice: { kind: "joinOk", text: "<b>x</b>" } }).includes("<b>"));
  });
  await test("순수성: household-view.js 는 여전히 DOM·저장소·네트워크를 참조하지 않는다(기존 정적 검사와 같은 기준)", () => {
    const src = read("js/household-view.js").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
    ["document", "localStorage", "sessionStorage", "firebase", "fetch(", "FamilySync", "HouseholdSync", "navigator", "innerHTML", "addEventListener"].forEach((w) => assert.ok(!src.includes(w), w));
  });

  console.log("app.js: 참여 클릭 처리(소스 추출 스텁)");
  const APP = read("js/app.js");
  function extract(header) {
    const i = APP.indexOf(header);
    assert.ok(i >= 0, "함수 없음: " + header);
    const open = APP.indexOf("{", APP.indexOf(")", i));
    let d = 0, j = open;
    for (; j < APP.length; j++) { if (APP[j] === "{") d++; else if (APP[j] === "}") { d--; if (d === 0) break; } }
    return APP.slice(i, j + 1);
  }
  const fns = ["async function hhOnClick(", "function hhSetJoined(", "function hhState(", "function hhRender(", "function loadChildren(", "function hhLoadSaved(", "function hhOpenSection("].map(extract).join("\n");

  function makeEnv({ join, children = [], hid = null, code = null } = {}) {
    const log = { join: [], saveProfile: 0, saveCompleted: 0, familySync: 0, handleLoadCode: 0, switchSheet: 0, hhStart: 0, usRefresh: 0, stored: {} };
    const slot = { innerHTML: "", input: { value: "" }, querySelector(sel) { return sel === '[data-hh-input="join-code"]' ? slot.input : null; }, addEventListener() {} };
    const ctx = vm.createContext({
      console: { error() {}, warn() {}, log() {} },
      HouseholdView: HV,
      el: (id) => (id === "hh-slot" ? slot : null),
      HouseholdSync: {
        joinHousehold: (c) => { log.join.push(c); if (join && join.__deferred) return join.promise; if (join instanceof Error) return Promise.reject(join); return Promise.resolve(join); },
        getSavedCode: () => null,
        getStatus: () => ({ pending: 0, permissionDenied: false }),
        getMirror: () => null,
        createHousehold: () => { throw new Error("create 호출 금지"); }, reissueCode: () => { throw new Error("reissue 호출 금지"); },
      },
      FamilySync: new Proxy({}, { get() { log.familySync++; throw new Error("FamilySync 호출 금지"); } }),
      localStorage: { getItem: (k) => (k === "hannun_children" ? JSON.stringify(children) : k === "hannun_household_id" ? log.stored.hannun_household_id || null : null), setItem: (k, v) => { log.stored[k] = v; } },
      HH_ID_KEY: "hannun_household_id", CHILDREN_KEY: "hannun_children",
      hhStart: () => { log.hhStart++; }, usRefreshCalendar: () => { log.usRefresh++; },
      showChildSwitchSheet: () => { log.switchSheet++; },
      hhProbeRules: async () => { throw new Error("probe 호출 금지"); },
      navigator: {}, childDisplayName: () => "은찬",
      saveProfile: () => { log.saveProfile++; }, saveCompleted: () => { log.saveCompleted++; }, handleLoadCode: () => { log.handleLoadCode++; },
    });
    vm.runInContext(`
      let hhJoining = false;
      const mem = { view: "list", form: null, deleteId: null }; function memRender() {} function memOnClick() {}
      const hhCanLinkChild = () => false; // 현재 아이 연결 버튼 판정은 c3-enroll-link 테스트에서 따로 확인
      let familyCode = "ABC234"; let profile = { name: "은찬", stage: "born" }; let completed = { "VX-DTAP__dose-1": { done: true } };
      const hh = { view: "none", hid: ${JSON.stringify(hid)}, code: ${JSON.stringify(code)}, notice: null, rulesUnavailable: false, lifecycle: false, joinInput: "" };
      ${fns}
      globalThis.__e = { hh, get familyCode() { return familyCode; }, get profile() { return profile; }, get completed() { return completed; }, open: () => hhOpenSection(), load: () => hhLoadSaved(), click: (action) => hhOnClick({ target: { closest: () => ({ getAttribute: () => action }) }, stopPropagation() {} }), state: () => hhState() };
    `, ctx);
    return { e: ctx.__e, slot, log, ctx };
  }
  const SNAP = (e) => JSON.stringify([e.familyCode, e.profile, e.completed]);
  const MIRROR = { children: { c1: { familyCode: "KID111", displayName: "둘째", order: 0 }, c2: { familyCode: "KID222", displayName: "셋째", order: 1 } } };

  await test("성공: 8자리(소문자·공백 포함)를 정규화해 joinHousehold 호출 → hh 가입(view active·hid 저장)·알림·섹션 다시 그림, 현재 아이·profile·completed·familyCode 불변·아이 로드 없음", async () => {
    const env = makeEnv({ join: { ok: true, householdId: "HID1", mirror: MIRROR } });
    const before = SNAP(env.e);
    env.slot.input.value = " abcd 2345 ";
    await env.e.click("join");
    assert.deepStrictEqual(env.log.join, ["ABCD2345"]);
    assert.strictEqual(env.e.hh.view, "active");
    assert.strictEqual(env.e.hh.hid, "HID1"); assert.strictEqual(env.e.hh.code, "ABCD2345");
    assert.strictEqual(env.log.stored.hannun_household_id, "HID1");
    assert.strictEqual(env.log.hhStart, 1);
    assert.strictEqual(SNAP(env.e), before, "현재 아이·profile·completed·familyCode 불변");
    assert.strictEqual(env.log.saveProfile + env.log.saveCompleted + env.log.handleLoadCode + env.log.familySync, 0);
    assert.ok(env.slot.innerHTML.includes("가족 캘린더에 들어왔어요. 아이 2명을 불러왔어요.") && env.slot.innerHTML.includes("ABCD2345"));
    assert.strictEqual(env.log.usRefresh, 1);
  });
  await test("실패(없는/비활성 코드): joinNotFound 문구를 시트 안에 보이고 view 는 none 으로 두며, 입력값은 그대로 보존·아무것도 바뀌지 않는다", async () => {
    const env = makeEnv({ join: { ok: false, reason: "not-found" } });
    const before = SNAP(env.e);
    env.slot.input.value = "ZZZZ9999";
    await env.e.click("join");
    assert.strictEqual(env.e.hh.view, "none"); assert.strictEqual(env.e.hh.hid, null);
    assert.ok(env.slot.innerHTML.includes(M.joinNotFound));
    assert.ok(env.slot.innerHTML.includes('value="ZZZZ9999"'));
    assert.strictEqual(SNAP(env.e), before);
    assert.deepStrictEqual(env.log.stored, {});
  });
  await test("8자리가 아닌 입력(빈 값·6자리 아이 코드·짧은 값·기호): 서버 호출 없이 기존 문구(joinNotFound)로 안내", async () => {
    for (const v of ["", "ABC234", "ABCD", "AB-CD-234", "ABCDEFGHI"]) {
      const env = makeEnv({ join: { ok: true, householdId: "H", mirror: MIRROR } });
      env.slot.input.value = v;
      await env.e.click("join");
      assert.deepStrictEqual(env.log.join, [], JSON.stringify(v));
      assert.ok(env.slot.innerHTML.includes(M.joinNotFound), JSON.stringify(v));
      assert.strictEqual(env.e.hh.view, "none");
    }
  });
  await test("권한 거부·네트워크 오류: 기존 failMessage 문구, 상태 불변(가구 없음 유지)", async () => {
    const denied = makeEnv({ join: Object.assign(new Error("x"), { code: "permission-denied" }) });
    denied.slot.input.value = "ABCD2345"; await denied.e.click("join");
    assert.ok(denied.slot.innerHTML.includes(M.failDenied));
    const net = makeEnv({ join: new Error("offline") });
    net.slot.input.value = "ABCD2345"; await net.e.click("join");
    assert.ok(net.slot.innerHTML.includes(M.failNetwork));
    for (const env of [denied, net]) { assert.strictEqual(env.e.hh.view, "none"); assert.strictEqual(env.e.hh.hid, null); assert.deepStrictEqual(env.log.stored, {}); }
  });
  const deferred = () => { const d = { __deferred: true }; d.promise = new Promise((res, rej) => { d.resolve = res; d.reject = rej; }); return d; };
  const tick = () => new Promise((r) => setImmediate(r));
  await test("재진입 방지: 참여 진행 중 두 번째 join 클릭·시트 재오픈 후 클릭에도 joinHousehold 는 1회만 호출된다", async () => {
    const d = deferred();
    const env = makeEnv({ join: d });
    env.slot.input.value = "ABCD2345";
    const first = env.e.click("join");
    await tick();
    assert.deepStrictEqual(env.log.join, ["ABCD2345"]);
    env.e.click("join"); await tick(); // 같은 화면에서 한 번 더(가드가 없으면 끝나지 않는 두 번째 호출이 생긴다 — await 하지 않는다)
    env.e.open();                      // 시트를 닫았다 다시 열면(hhOpenSection)
    env.e.click("join"); await tick(); // 다시 눌러도
    assert.deepStrictEqual(env.log.join, ["ABCD2345"], "joinHousehold 호출은 1회");
    d.resolve({ ok: true, householdId: "HID1", mirror: MIRROR });
    await first;
    assert.strictEqual(env.e.hh.view, "active"); assert.strictEqual(env.e.hh.hid, "HID1");
    assert.strictEqual(env.log.join.length, 1);
  });
  await test("joining 뷰 유지: 진행 중에는 view 가 joining 으로 전환되고, 시트를 다시 열어도(hhLoadSaved·hhOpenSection) joining 이 유지되며 참여 버튼·입력은 보이지 않는다", async () => {
    const d = deferred();
    const env = makeEnv({ join: d });
    env.slot.input.value = "ABCD2345";
    const first = env.e.click("join");
    await tick();
    assert.strictEqual(env.e.hh.view, "joining");
    assert.ok(env.slot.innerHTML.includes(M.joining) && !env.slot.innerHTML.includes('data-hh-action="join"') && !env.slot.innerHTML.includes("data-hh-input"));
    env.e.load();
    assert.strictEqual(env.e.hh.view, "joining");
    env.e.open();
    assert.strictEqual(env.e.hh.view, "joining");
    assert.ok(env.slot.innerHTML.includes(M.joining) && !env.slot.innerHTML.includes('data-hh-action="join"'));
    d.resolve({ ok: false, reason: "not-found" });
    await first;
    assert.strictEqual(env.e.hh.view, "none");
    assert.ok(env.slot.innerHTML.includes(M.joinNotFound) && env.slot.innerHTML.includes('data-hh-action="join"'));
    env.e.load(); // 끝난 뒤에는 저장된 가구가 없으므로 none
    assert.strictEqual(env.e.hh.view, "none");
  });
  await test("진행 플래그는 실패(예외·not-found) 뒤에 해제되어 다시 참여를 시도할 수 있다", async () => {
    const d = deferred();
    const env = makeEnv({ join: d });
    env.slot.input.value = "ABCD2345";
    const first = env.e.click("join");
    await tick();
    d.reject(new Error("offline"));
    await first;
    assert.ok(env.slot.innerHTML.includes(M.failNetwork));
    const d2 = deferred();
    // 같은 환경에서 두 번째 시도: joinHousehold 스텁이 같은 deferred 를 돌려주므로 호출 횟수만 확인한다
    env.slot.input.value = "ABCD2345";
    const second = env.e.click("join");
    await tick();
    assert.strictEqual(env.log.join.length, 2, "플래그가 풀려 두 번째 시도가 서버 호출까지 간다");
    void d2; void second;
  });
  await test("가구의 아이가 0명이어도 가입은 성공하고 안내 문구(아직 등록된 아이가 없어요)가 나온다", async () => {
    const env = makeEnv({ join: { ok: true, householdId: "H0", mirror: { children: {} } } });
    env.slot.input.value = "ABCD2345"; await env.e.click("join");
    assert.ok(env.slot.innerHTML.includes("아직 등록된 아이가 없어요."));
    assert.strictEqual(env.e.hh.view, "active");
  });
  await test("아이 전환 버튼 처리: child-switch 는 showChildSwitchSheet 를 호출하고 가구·상태를 바꾸지 않는다", async () => {
    const env = makeEnv({ hid: "H", code: "ABCD2345" });
    env.e.hh.view = "active";
    await env.e.click("child-switch");
    assert.strictEqual(env.log.switchSheet, 1);
    assert.strictEqual(env.e.hh.view, "active");
  });
  await test("showChildSwitch 판정(hhState): 가구가 있거나 이 기기 아이가 2명 이상일 때만 true", () => {
    const one = [{ code: "AAA111", name: "은찬", stage: "born" }];
    const two = [...one, { code: "BBB222", name: "둘째", stage: "born" }];
    assert.strictEqual(makeEnv({ children: one }).e.state().showChildSwitch, false);
    assert.strictEqual(makeEnv({ children: [] }).e.state().showChildSwitch, false);
    assert.strictEqual(makeEnv({ children: two }).e.state().showChildSwitch, true);
    assert.strictEqual(makeEnv({ children: one, hid: "H", code: "ABCD2345" }).e.state().showChildSwitch, true);
  });
  await test("참여 후 아이 전환 목록: 이 기기에서 쓰던 아이가 그대로 남고 가구의 아이가 추가로 보인다(mergeChildren)", () => {
    const local = [{ code: "ABC234", name: "은찬", stage: "born" }];
    const list = HV.mergeChildren(local, MIRROR, "ABC234");
    assert.deepStrictEqual(list.map((c) => [c.code, c.name, c.source, c.current]), [["ABC234", "은찬", "local", true], ["KID111", "둘째", "household", false], ["KID222", "셋째", "household", false]]);
  });

  console.log("정적 확인");
  await test("참여 분기(action === \"join\")는 handleLoadCode·saveProfile·saveCompleted·FamilySync·fetchFamily·createHousehold 를 호출하지 않는다", () => {
    const body = extract("async function hhOnClick(");
    const i = body.indexOf('action === "join"'), j = body.indexOf('action === "child-switch"');
    assert.ok(i > 0 && j > i);
    const join = body.slice(i, j);
    assert.ok(!/handleLoadCode|saveProfile|saveCompleted|FamilySync|fetchFamily|createHousehold|reissueCode|familyCode\s*=|profile\s*=|completed\s*=/.test(join), join);
    assert.ok(/HouseholdSync\.joinHousehold\(cls\.code\)/.test(join) && /hhSetJoined\(/.test(join));
  });
  await test("프로필 시트에는 hh-slot 하나로 해결(별도 아이 전환 슬롯 없음), 열 때 입력값·알림을 초기화한다", () => {
    const i = APP.indexOf("function hhOpenSection()");
    const body = APP.slice(i, APP.indexOf("}\n  /**", i));
    assert.ok(/hh\.joinInput = ""/.test(body) && /hh\.notice = null/.test(body));
  });

  console.log(`\n${passed}개 통과${process.exitCode ? ", 일부 실패" : ""}`);
})();
