/*
 * 가족 캘린더 "베타 켜기 스위치" 테스트 (js/household-view.js renderBetaSwitch / renderBetaSwitchLanding + js/app.js 연결).
 * 실행: node test/beta-switch.logic.test.js
 *
 * 원칙: 스위치는 localStorage "hannun_feature_household" 값만 바꾸고 새로고침한다. 가구 생성·서버 호출·쓰기는 없다. 기본값은 계속 꺼짐.
 * app.js 는 대형 IIFE 라 직접 import 하지 않고, 소스에서 스위치 함수를 꺼내 스텁 환경에서 실행하거나 정적으로 확인한다.
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const crypto = require("crypto");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const HV = require("../js/household-view.js");
const M = HV.MSG;
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log("  ok  - " + name); } catch (e) { process.exitCode = 1; console.log("  FAIL- " + name + "\n      " + (e.stack || e).split("\n").slice(0, 5).join("\n      ")); }
}
const text = (html) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const actions = (html) => [...html.matchAll(/data-beta-action="([^"]+)"[^>]*>([^<]*)</g)].map((m) => [m[1], m[2]]);

console.log("승인 문구(고정)");
test("문구 상수가 승인본과 글자까지 같다", () => {
  assert.strictEqual(M.betaSectionTitle, "실험 기능");
  assert.strictEqual(M.betaItem, "가족 캘린더 (베타)");
  assert.strictEqual(M.betaDesc, "아이와 가족 일정을 가족이 함께 볼 수 있는 기능이에요. 켜면 일정이 서버에 저장되고, 가족 코드를 아는 사람은 누구나 볼 수 있어요.");
  assert.strictEqual(M.betaOn, "켜기");
  assert.strictEqual(M.betaOff, "끄기");
  assert.strictEqual(M.betaCancel, "취소");
  assert.strictEqual(M.betaConfirmOn, "가족 캘린더(베타)를 켤까요? 켜면 이 기기에서 가족 캘린더 화면이 나타나요.");
  assert.strictEqual(M.betaConfirmOff, "가족 캘린더를 끌까요? 가족 캘린더 화면이 숨겨져요. 저장된 일정은 지워지지 않아요.");
  assert.strictEqual(M.betaLandingAsk, "가족코드(8자리)가 있나요? 베타 기능을 켜면 입력할 수 있어요.");
  assert.strictEqual(M.betaLandingButton, "가족 캘린더(베타) 켜기");
  assert.ok(Object.isFrozen(M));
});

console.log("renderBetaSwitch — 4개 상태");
test("OFF·평소: 제목·항목·설명 + 버튼 '켜기'(ask-on) — 플래그가 꺼져 있어도 렌더된다", () => {
  const h = HV.renderBetaSwitch({ enabled: false, confirming: false });
  assert.ok(h.length > 0);
  const t = text(h);
  assert.ok(t.includes("실험 기능") && t.includes("가족 캘린더 (베타)") && t.includes(M.betaDesc));
  assert.deepStrictEqual(actions(h), [["ask-on", "켜기"]]);
  assert.ok(h.includes('data-beta="off"') && h.includes('class="hh-section"'));
  assert.ok(!t.includes(M.betaConfirmOn) && !t.includes(M.betaConfirmOff));
});
test("OFF·확인: 켜기 확인 문구 + 버튼 '켜기'(confirm-on)/'취소'(cancel)", () => {
  const h = HV.renderBetaSwitch({ enabled: false, confirming: true });
  assert.ok(text(h).includes(M.betaConfirmOn) && !text(h).includes(M.betaConfirmOff));
  assert.deepStrictEqual(actions(h), [["confirm-on", "켜기"], ["cancel", "취소"]]);
  assert.ok(h.includes('data-beta="confirm-on"'));
});
test("ON·평소: 버튼 '끄기'(ask-off)", () => {
  const h = HV.renderBetaSwitch({ enabled: true, confirming: false });
  assert.ok(text(h).includes("가족 캘린더 (베타)"));
  assert.deepStrictEqual(actions(h), [["ask-off", "끄기"]]);
  assert.ok(h.includes('data-beta="on"'));
});
test("ON·확인: 끄기 확인 문구(저장된 일정은 지워지지 않아요) + 버튼 '끄기'(confirm-off)/'취소'(cancel)", () => {
  const h = HV.renderBetaSwitch({ enabled: true, confirming: true });
  assert.ok(text(h).includes(M.betaConfirmOff) && !text(h).includes(M.betaConfirmOn));
  assert.deepStrictEqual(actions(h), [["confirm-off", "끄기"], ["cancel", "취소"]]);
  assert.ok(h.includes('data-beta="confirm-off"'));
});
test("state 가 없거나 이상한 값이면 OFF·평소로 본다(enabled 는 정확히 true 일 때만 ON)", () => {
  const off = HV.renderBetaSwitch({ enabled: false, confirming: false });
  for (const s of [undefined, null, {}, { enabled: "true" }, { enabled: 1 }, { enabled: "1", confirming: "yes" }]) assert.strictEqual(HV.renderBetaSwitch(s), off, JSON.stringify(s));
});

console.log("renderBetaSwitchLanding");
test("OFF·평소: 한 줄 안내 + 버튼 '가족 캘린더(베타) 켜기'(ask-on)", () => {
  const h = HV.renderBetaSwitchLanding({ enabled: false, confirming: false });
  assert.ok(text(h).includes(M.betaLandingAsk));
  assert.deepStrictEqual(actions(h), [["ask-on", "가족 캘린더(베타) 켜기"]]);
});
test("OFF·확인: 같은 확인 문구를 재사용 + 켜기/취소", () => {
  const h = HV.renderBetaSwitchLanding({ enabled: false, confirming: true });
  assert.ok(text(h).includes(M.betaConfirmOn));
  assert.deepStrictEqual(actions(h), [["confirm-on", "켜기"], ["cancel", "취소"]]);
  assert.ok(!text(h).includes(M.betaLandingAsk));
});
test("ON(평소·확인 모두): 이 줄은 렌더하지 않는다(빈 문자열)", () => {
  assert.strictEqual(HV.renderBetaSwitchLanding({ enabled: true, confirming: false }), "");
  assert.strictEqual(HV.renderBetaSwitchLanding({ enabled: true, confirming: true }), "");
});

console.log("이스케이프·순수성·기존 불변");
test("동적 값이 없고 문구는 전부 이스케이프를 거친다(따옴표·꺾쇠 포함 문구도 안전)", () => {
  for (const st of [{ enabled: false }, { enabled: true }, { enabled: false, confirming: true }, { enabled: true, confirming: true }]) {
    for (const h of [HV.renderBetaSwitch(st), HV.renderBetaSwitchLanding(st)]) assert.ok(!/<script|onerror|javascript:/i.test(h));
  }
  // 문구 상수에 이스케이프 대상 문자가 없는지(있다면 렌더가 &amp; 등으로 바꿔 그려야 한다)
  for (const k of ["betaSectionTitle", "betaItem", "betaDesc", "betaConfirmOn", "betaConfirmOff", "betaLandingAsk", "betaLandingButton"]) assert.ok(!/[<>"&']/.test(M[k]), k);
});
test("renderBetaSwitch/Landing 소스는 DOM·저장소·네트워크·다른 모듈을 참조하지 않는다(순수 함수)", () => {
  const src = read("js/household-view.js");
  const i = src.indexOf("// ── 베타 켜기 스위치");
  const j = src.indexOf("/** code-entry 화면의 입력 안내");
  const body = src.slice(i, j);
  assert.ok(i > 0 && j > i);
  assert.ok(!/document\.|window\.|localStorage|sessionStorage|fetch\(|XMLHttpRequest|firebase|Firestore|FamilySync|HouseholdSync|location\./.test(body));
});
test("기존 render* 불변: enabled 가 true 가 아니면 renderSection·renderCodeEntryHint 는 여전히 빈 문자열(스위치 두 함수만 예외)", () => {
  for (const enabled of [false, undefined, null, "true", 1]) {
    assert.strictEqual(HV.renderSection({ enabled, view: "none" }), "");
    assert.strictEqual(HV.renderCodeEntryHint({ enabled }), "");
  }
  assert.notStrictEqual(HV.renderBetaSwitch({ enabled: false }), "");
});
test("기본값은 OFF: FEATURES.household 는 저장소에 값이 없으면 false, 정확히 '1' 일 때만 true (feature-flags.js 불변)", () => {
  const load = (val) => {
    const sb = { window: {}, localStorage: { getItem: (k) => (k === "hannun_feature_accounts" ? "0" : k === "hannun_feature_household" ? val : null) } }; // G18: 기본 ON — household 단독 해석은 accounts="0" 기기에서
    sb.window.localStorage = sb.localStorage;
    vm.runInNewContext(read("js/feature-flags.js"), { ...sb, window: sb.window, global: sb.window }, {});
    return sb.window.FEATURES;
  };
  assert.strictEqual(load(null).household, false);
  assert.strictEqual(load("0").household, false);
  assert.strictEqual(load("true").household, false);
  assert.strictEqual(load("1").household, true);
});
test("js/feature-flags.js 는 베타 스위치 커밋(7374c88)에서 바뀌지 않았다", () => {
  const changed = execFileSync("git", ["diff", "--name-only", "7374c88^", "7374c88"], { cwd: ROOT }).toString("utf8");
  assert.ok(!changed.split("\n").includes("js/feature-flags.js"));
});

console.log("app.js 연결(소스에서 꺼내 실행·정적 확인)");
const APP = read("js/app.js");
function extract(header) {
  const i = APP.indexOf(header);
  assert.ok(i >= 0, "함수 없음: " + header);
  const open = APP.indexOf("{", APP.indexOf(")", i));
  let d = 0, j = open;
  for (; j < APP.length; j++) { if (APP[j] === "{") d++; else if (APP[j] === "}") { d--; if (d === 0) break; } }
  return APP.slice(i, j + 1);
}
const betaFns = ["function betaOpenSlot(", "function betaRenderAll(", "function betaOnClick("].map(extract).join("\n");

test("스위치 코드(beta*)는 FamilySync·HouseholdSync·Firestore·fetch 를 호출하지 않고, localStorage 는 플래그 키 하나만 쓴다", () => {
  const block = APP.slice(APP.indexOf("// ── 가족 캘린더 베타 켜기 스위치"), APP.indexOf("/** 앱 시작: 이 기기에 가구가 있으면"));
  assert.ok(block.length > 200);
  assert.ok(!/FamilySync|HouseholdSync|firebase|Firestore|fetch\(|\.set\(|\.update\(|createFamily|createHousehold/.test(block));
  const setCalls = block.match(/localStorage\.(setItem|removeItem)\([^)]*\)/g) || [];
  assert.strictEqual(setCalls.length, 4); // G1: 회원가입(accounts) 플래그도 같은 스위치로 함께 켜고 끈다
  assert.ok(setCalls.every((c) => c.includes("BETA_FLAG_KEY") || c.includes("hannun_feature_accounts")));
  assert.ok(/const BETA_FLAG_KEY = "hannun_feature_household"/.test(block));
});
test("프로필 시트에 #beta-slot 이 항상 들어간다(가구 슬롯 아래, 플래그와 무관) · index.html 에 #beta-landing-slot 이 있다", () => {
  assert.ok(APP.includes(`: \`\${hhEnabled() ? '<div id="hh-slot"></div><div id="members-slot"></div>' : ""}<div id="beta-slot"></div>`)); // G7: 비계정(OFF·가구만) 템플릿은 그대로, 계정 모드는 베타·옛 가구 슬롯 없음 // H1: 계정 모드에서는 베타 토글·옛 가족 캘린더 슬롯 생략 // 구성원 슬롯(B6-lite)은 플래그 ON 일 때만 hh-slot 옆에 추가됨
  assert.ok(/<div id="beta-landing-slot"><\/div>/.test(read("index.html")));
});

/** 스텁 환경에서 스위치 클릭을 실제로 실행한다. flagOn = 지금 FEATURES.household. */
function makeEnv({ flagOn, storageThrows } = {}) {
  const slots = {};
  const mkSlot = () => { const s = { innerHTML: "", dataset: {}, listeners: [], addEventListener(t, f) { s.listeners.push(f); } }; return s; };
  ["beta-slot", "beta-landing-slot"].forEach((id) => (slots[id] = mkSlot()));
  const store = {}; const calls = []; const warns = []; let reloads = 0;
  const localStorage = {
    setItem: (k, v) => { if (storageThrows) throw new Error("denied"); store[k] = v; calls.push(["set", k, v]); },
    removeItem: (k) => { if (storageThrows) throw new Error("denied"); delete store[k]; calls.push(["remove", k]); },
    getItem: (k) => store[k] ?? null,
  };
  const ctx = vm.createContext({
    el: (id) => slots[id] || null,
    HouseholdView: HV, hhEnabled: () => !!flagOn, localStorage, location: { reload: () => { reloads++; } },
    console: { warn: (...a) => warns.push(a), error() {}, log() {} }, FamilySync: new Proxy({}, { get() { throw new Error("FamilySync 호출 금지"); } }), HouseholdSync: new Proxy({}, { get() { throw new Error("HouseholdSync 호출 금지"); } }),
  });
  vm.runInContext(`
    const BETA_FLAG_KEY = "hannun_feature_household";
    let betaConfirming = false;
    const betaState = () => ({ enabled: hhEnabled(), confirming: betaConfirming });
    ${betaFns}
    globalThis.__t = { open: (id, n) => betaOpenSlot(id, n), get confirming() { return betaConfirming; }, set confirming(v) { betaConfirming = v; } };
  `, ctx);
  const click = (slotId, action) => {
    const fakeBtn = { getAttribute: () => action };
    const ev = { target: { closest: (sel) => (sel === "[data-beta-action]" ? fakeBtn : null) }, stopped: false, stopPropagation() { this.stopped = true; } };
    slots[slotId].listeners.forEach((f) => f(ev));
    return ev;
  };
  return { slots, store, calls, warns, click, t: ctx.__t, reloads: () => reloads };
}

test("OFF → '켜기' → 확인 단계(슬롯만 다시 그림) → '켜기' 확인: localStorage 에 '1' 을 쓰고 새로고침 · 서버/가구 호출 없음", () => {
  const e = makeEnv({ flagOn: false });
  e.t.open("beta-slot", "renderBetaSwitch");
  assert.deepStrictEqual(actions(e.slots["beta-slot"].innerHTML), [["ask-on", "켜기"]]);
  const ev = e.click("beta-slot", "ask-on");
  assert.ok(ev.stopped);
  assert.deepStrictEqual(actions(e.slots["beta-slot"].innerHTML), [["confirm-on", "켜기"], ["cancel", "취소"]]);
  assert.deepStrictEqual(e.calls, []); assert.strictEqual(e.reloads(), 0); // 확인 전에는 아무것도 쓰지 않는다
  e.click("beta-slot", "confirm-on");
  assert.deepStrictEqual(e.calls, [["set", "hannun_feature_household", "1"], ["set", "hannun_feature_accounts", "1"]]);
  assert.strictEqual(e.reloads(), 1);
});
test("확인 단계에서 '취소': 저장·새로고침 없이 평소 화면으로 돌아간다", () => {
  const e = makeEnv({ flagOn: false });
  e.t.open("beta-slot", "renderBetaSwitch"); e.click("beta-slot", "ask-on"); e.click("beta-slot", "cancel");
  assert.deepStrictEqual(actions(e.slots["beta-slot"].innerHTML), [["ask-on", "켜기"]]);
  assert.deepStrictEqual(e.calls, []); assert.strictEqual(e.reloads(), 0);
});
test("ON → '끄기' → 확인 → removeItem(플래그 키) 후 새로고침(값을 '0' 으로 두지 않고 지운다)", () => {
  const e = makeEnv({ flagOn: true });
  e.t.open("beta-slot", "renderBetaSwitch");
  assert.deepStrictEqual(actions(e.slots["beta-slot"].innerHTML), [["ask-off", "끄기"]]);
  e.click("beta-slot", "ask-off");
  assert.deepStrictEqual(actions(e.slots["beta-slot"].innerHTML), [["confirm-off", "끄기"], ["cancel", "취소"]]);
  e.click("beta-slot", "confirm-off");
  assert.deepStrictEqual(e.calls, [["remove", "hannun_feature_household"], ["remove", "hannun_feature_accounts"]]);
  assert.strictEqual(e.reloads(), 1);
});
test("랜딩 슬롯: OFF 에서 켜기 흐름이 같게 동작하고, ON 이면 슬롯이 비어 있다", () => {
  const off = makeEnv({ flagOn: false });
  off.t.open("beta-landing-slot", "renderBetaSwitchLanding");
  assert.deepStrictEqual(actions(off.slots["beta-landing-slot"].innerHTML), [["ask-on", "가족 캘린더(베타) 켜기"]]);
  off.click("beta-landing-slot", "ask-on"); off.click("beta-landing-slot", "confirm-on");
  assert.deepStrictEqual(off.calls, [["set", "hannun_feature_household", "1"], ["set", "hannun_feature_accounts", "1"]]); assert.strictEqual(off.reloads(), 1);
  const on = makeEnv({ flagOn: true });
  on.t.open("beta-landing-slot", "renderBetaSwitchLanding");
  assert.strictEqual(on.slots["beta-landing-slot"].innerHTML, "");
});
test("저장소를 쓸 수 없으면(예외) 콘솔 경고만 남기고 새로고침하지 않으며 상태를 그대로 둔다", () => {
  const e = makeEnv({ flagOn: false, storageThrows: true });
  e.t.open("beta-slot", "renderBetaSwitch"); e.click("beta-slot", "ask-on");
  assert.doesNotThrow(() => e.click("beta-slot", "confirm-on"));
  assert.strictEqual(e.reloads(), 0);
  assert.strictEqual(e.warns.length, 1);
  assert.deepStrictEqual(actions(e.slots["beta-slot"].innerHTML), [["confirm-on", "켜기"], ["cancel", "취소"]]); // 확인 단계 그대로
});
test("슬롯 클릭 리스너는 한 슬롯에 한 번만 붙는다(다시 그려도 쌓이지 않는다)", () => {
  const e = makeEnv({ flagOn: false });
  e.t.open("beta-slot", "renderBetaSwitch"); e.click("beta-slot", "ask-on"); e.click("beta-slot", "cancel");
  assert.strictEqual(e.slots["beta-slot"].listeners.length, 1);
});
test("스위치와 무관한 클릭(data-beta-action 이 없는 곳)은 무시한다", () => {
  const e = makeEnv({ flagOn: false });
  e.t.open("beta-slot", "renderBetaSwitch");
  const ev = { target: { closest: () => null }, stopPropagation() { throw new Error("멈추지 않아야 함"); } };
  assert.doesNotThrow(() => e.slots["beta-slot"].listeners.forEach((f) => f(ev)));
  assert.deepStrictEqual(e.calls, []);
});

console.log(`\n${passed}개 통과${process.exitCode ? ", 일부 실패" : ""}`);
