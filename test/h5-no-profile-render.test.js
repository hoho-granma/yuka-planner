/*
 * H5: 마지막 아이를 삭제한 직후(profile=null, 이전 아이의 일정 목록 schedule 은 남아 있음) 홈 '가족 일정'·'내 일정' 카드와 캘린더 목록 렌더가
 * profile.birthDate 를 읽다 TypeError 로 console.error 를 남기던 문제의 회귀 테스트. 실행: node test/h5-no-profile-render.test.js
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const CT = require("../js/child-timeline.js");
const APP = fs.readFileSync(path.join(__dirname, "..", "js", "app.js"), "utf8");

let passed = 0;
function test(name, fn) { try { fn(); passed++; console.log("  ok  - " + name); } catch (e) { process.exitCode = 1; console.log("  FAIL- " + name + "\n      " + (e.stack || e).split("\n").slice(0, 4).join("\n      ")); } }
const fnSrc = (name) => { const i = APP.indexOf(`  function ${name}(`); assert.ok(i >= 0, name); return APP.slice(i, APP.indexOf("\n  }\n", i) + 4); };

function env(profile) {
  const errors = [];
  const stale = [{ id: "HC-01__default", category: "영유아검진", date: new Date(2026, 9, 10) }]; // 지운 아이의 옛 일정 목록
  const sb = {
    console: { error: (...a) => errors.push(a.join(" ")) }, ChildTimeline: CT, profile, schedule: stale, activeCats: new Set(["영유아검진"]), isNotApplicable: () => false,
    hhEnabled: () => true, usActive: () => true, toISODate: () => "2026-10-04", UserSchedule: { addDays: (d) => d },
    UserScheduleView: { renderUpcomingCard: () => "CARD", upcomingItems: () => [], toModelFilter: () => ({}), MSG: {} }, AccountView: { MSG: { nc: { familyTitle: "가족", mineTitle: "내 일정" } } },
    usLinks: () => [], usMembers: () => [], usSelOpts: () => ({}), usMeId: () => "m1",
  };
  sb.usBuildModel = () => sb.calendarSchedule().length; // 실제 usBuildModel 은 calendarSchedule()(=visibleSchedule)을 AUTO 입력으로 쓴다
  vm.createContext(sb);
  vm.runInContext([fnSrc("visibleSchedule"), fnSrc("calendarSchedule"), fnSrc("usHomeCardHtml"), fnSrc("acctNcFamilyHtml"), fnSrc("acctNcMineHtml")].join("\n") + ";globalThis.t={visibleSchedule,calendarSchedule,usHomeCardHtml,acctNcFamilyHtml,acctNcMineHtml}", sb);
  return { sb, errors };
}

test("profile 이 null 이면 visibleSchedule·calendarSchedule 은 빈 목록(오류 없음), 아이가 있으면 기존대로 거른다", () => {
  const e = env(null);
  assert.deepStrictEqual([e.sb.t.visibleSchedule().length, e.sb.t.calendarSchedule().length], [0, 0]);
  const ok = env({ birthDate: new Date(2026, 5, 20) });
  assert.strictEqual(ok.sb.t.calendarSchedule().length, 1);
});
test("마지막 아이 삭제 직후(profile null + 옛 schedule): 홈 가족 일정 카드·내 일정 카드가 오류 없이 그려진다(console.error 0건)", () => {
  const e = env(null);
  assert.strictEqual(e.sb.t.usHomeCardHtml({ family: true }), "CARD");
  assert.strictEqual(e.sb.t.acctNcFamilyHtml(), "CARD");
  assert.strictEqual(e.sb.t.acctNcMineHtml(), "CARD");
  assert.strictEqual(e.errors.length, 0);
});
test("연결: 마지막 아이 삭제 경로는 그대로 applyNewChildReset → showEmptyHome (이 수정은 렌더 쪽 가드만)", () => {
  const f = APP.slice(APP.indexOf("  async function usChildDeleteCurrent("));
  assert.ok(/applyNewChildReset\(\);/.test(f) && /showEmptyHome\(\);/.test(f));
});
console.log(`\n${passed}개 통과`);
