// 1-1b 새 홈 미리보기 스위치: 순수 규칙(키>개발 플래그>단계 기본값)·마크업·안내 띠, 앱 연결(기기 저장만·단계 ① 고정·스위치 안 쓴 사용자 화면 불변). 실행: node --test test/m14-home-switch.test.js
const test = require("node:test"), assert = require("node:assert"), fs = require("fs"), path = require("path"), vm = require("vm");
const H = require("../js/home-switch.js");
const app = fs.readFileSync(path.join(__dirname, "..", "js/app.js"), "utf8");
const mem = (init) => { const m = { ...(init || {}) }; return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, m }; };
test("우선순위: 사용자 키 > 개발용 플래그 > 단계 기본값(① OFF·② ON)", () => {
  assert.strictEqual(H.effective(null, false, 1), false); assert.strictEqual(H.effective(null, true, 1), true);
  assert.strictEqual(H.effective("on", false, 1), true); assert.strictEqual(H.effective("off", true, 1), false);
  assert.strictEqual(H.effective(null, false, 2), true); assert.strictEqual(H.effective("off", false, 2), false);
});
test("키 읽기·쓰기: '1'/'0' 만 인정, 저장소가 막혀도 던지지 않는다", () => {
  const st = mem(); assert.strictEqual(H.read(st), null); H.write(st, true); assert.strictEqual(st.m[H.KEY], "1"); assert.strictEqual(H.read(st), "on"); H.write(st, false); assert.strictEqual(H.read(st), "off");
  assert.strictEqual(H.read(mem({ [H.KEY]: "x" })), null);
  const bad = { getItem() { throw new Error("x"); }, setItem() { throw new Error("x"); } }; assert.strictEqual(H.read(bad), null); assert.strictEqual(H.write(bad, true), false);
});
test("마크업: 단계 ① 줄=새 홈 미리보기·켜기/끄기, ② 줄=홈 화면·새 홈 사용/이전 홈, 링크는 ② 에서만, 안내 띠는 한 번·✕ 뒤 다시 안 뜸", () => {
  const r1 = H.rowHtml(false, 1); assert.ok(r1.includes("새 홈 미리보기") && r1.includes("지금 꼭 할 것부터 먼저 보여 드려요") && r1.includes('aria-checked="false"') && r1.includes(">켜기<") && r1.includes('data-home-switch="on"') && r1.includes('role="switch"'));
  assert.ok(H.rowHtml(true, 1).includes(">끄기<") && H.rowHtml(true, 1).includes('aria-checked="true"'));
  const r2 = H.rowHtml(true, 2); assert.ok(r2.includes("홈 화면") && r2.includes("새 홈을 쓰고 있어요") && r2.includes("새 홈 사용"));
  assert.strictEqual(H.linkHtml(true, 1), "", "단계 ①: 키 없음(개발 플래그만)이면 링크 없음"); assert.strictEqual(H.linkHtml(true, 1, "off"), ""); assert.strictEqual(H.linkHtml(false, 1, "on"), "");
  const l1 = H.linkHtml(true, 1, "on"); assert.ok(l1.includes("이전 홈으로 보기") && l1.includes('data-home-switch="off"'), "단계 ①: 스위치로 켠 사용자에겐 새 홈 맨 아래 '이전 홈으로 보기'(누르면 끔)"); assert.ok(H.linkHtml(true, 2).includes("이전 홈으로 보기") && H.linkHtml(false, 2).includes("새 홈으로 보기"));
  const st = mem(); assert.strictEqual(H.noticeDue(st, true), true); assert.strictEqual(H.noticeDue(st, false), false); H.dismissNotice(st); assert.strictEqual(H.noticeDue(st, true), false);
  const n = H.noticeHtml("on"); assert.ok(n.includes("새 홈을 보고 계세요. 지금 꼭 할 것부터 보여 드려요.") && n.includes("이전 홈으로") && n.includes("data-home-notice-x"));
  assert.ok(H.noticeHtml("fallback").includes("새 홈을 불러오지 못해 이전 홈을 보여 드려요") && !H.noticeHtml("fallback").includes("이전 홈으로<"));
});
test("앱 연결: 단계 ① 고정, 기기 저장만, 프로필 시트 줄은 계정 시트에만, 스위치를 안 쓴 사용자(키 없음·단계 ①)에겐 화면 불변", () => {
  assert.ok(/const HOME_V2_STAGE = 1;/.test(app));
  const i = app.indexOf("async function homeSwitchSet("), blk = app.slice(i, app.indexOf("\n  }\n", i) + 4);
  assert.ok(blk.includes("HomeSwitch.write(homeStore(), on)") && !/setDoc|updateDoc|HouseholdSync|fetch\(/.test(blk) && blk.includes("renderHome();"));
  assert.ok(blk.indexOf("closeDetail();") > 0 && blk.indexOf("closeDetail();") < blk.indexOf("renderHome()"), "켜자마자 시트를 닫고 홈을 다시 그린다(시트 뒤에서만 바뀌지 않게)");
  assert.ok(/try \{\s*if \(on && !curationPolicy[\s\S]*await loadJsonOrNull[\s\S]*catch \(e\)[\s\S]*finally \{[\s\S]*closeDetail\(\)[\s\S]*try \{ renderHome\(\); \} catch/.test(blk), "정책 읽기·홈 그리기 예외가 나도 finally 에서 시트를 닫고 홈을 다시 그린다");
  assert.ok(/HomeSwitch\.rowHtml\(FEATURES_CURATION_ON\(\), HOME_V2_STAGE\)/.test(app.slice(app.indexOf("function acctProfileSheet()"), app.indexOf("showProfileSheet = function (pendingPhoto)"))));
  const d = app.indexOf("function homeSwitchDecorate("), dec = app.slice(d, app.indexOf("\n  }\n", d) + 4);
  const run = (pref, on, just) => { const st = mem(pref ? { [H.KEY]: pref } : {}); let html = ""; const sb = { HomeSwitch: H, HSW: { justEnabled: just, fallbackShown: false, diag: "홈 그리기 실패: boom" }, curationPolicy: {}, HOME_V2_STAGE: 1, FEATURES_CURATION_ON: () => on, el: () => ({ insertAdjacentHTML: (w, h) => { html += h; } }), homeStore: () => st }; vm.runInNewContext(`${dec}; homeSwitchDecorate(${on})`, sb); return html; };
  assert.strictEqual(run(null, false, false), "", "키 없음·① 구 홈: 아무것도 안 붙음"); assert.strictEqual(run(null, true, false), "", "개발 플래그로 켠 새 홈: 안내·링크 없음");
  assert.ok(run("1", true, true).includes("새 홈을 보고 계세요"), "켠 직후 안내 띠"); assert.ok(!run("1", true, false).includes("새 홈을 보고 계세요"), "안내 띠는 그 뒤엔 없음(맨 아래 링크만)");
  assert.ok(run("1", false, false).includes("불러오지 못해") && run("1", false, false).includes("진단: 홈 그리기 실패: boom"), "켜 놨는데 새 홈이 안 그려지면 폴백 안내 + 오류 요지(진단)");
  assert.ok(run("1", true, false).includes("이전 홈으로 보기"), "스위치로 켠 새 홈 맨 아래 링크"); assert.ok(!run("1", false, false).includes("이전 홈으로 보기"), "폴백(이전 홈이 그려짐)에는 링크 없음");
});
