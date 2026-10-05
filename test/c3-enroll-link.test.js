/*
 * 묶음: [A] 초등 입학 시기(enrollmentYearOverride) 입력·동기화 · [B] 참여 후 현재 아이 연결 · [C] 기록의 '예약 일정 연결' 표시(읽기 전용).
 * 실행: node test/c3-enroll-link.test.js
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const CT = require("../js/child-timeline.js");
const HV = require("../js/household-view.js");
const read = (f) => fs.readFileSync(path.join(__dirname, "..", f), "utf8");
const APP = read("js/app.js");

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log("  ok  - " + name); } catch (e) { process.exitCode = 1; console.log("  FAIL- " + name + "\n      " + (e.stack || e).split("\n").slice(0, 4).join("\n      ")); }
}
const POLICY = { enrollmentOffsetYears: { value: 7, verificationStatus: "확인됨" }, schoolYearStartMonth: { value: 3, verificationStatus: "확인됨" }, preElementaryYearsBefore: { value: 1, kind: "PRODUCT_DEFINITION", verificationStatus: "제품정의" } };
const b = new Date(2020, 4, 10), asOf = new Date(2026, 9, 2);

test("[A] 선택지: 기본=출생연도+7, 일찍=-1, 늦게=+1, 현재값 판정", () => {
  const o = CT.enrollmentOptions(b, asOf, POLICY, undefined);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(o)), { defaultYear: 2027, currentYear: 2027, current: "default", options: [{ key: "default", year: 2027 }, { key: "early", year: 2026 }, { key: "late", year: 2028 }] });
  assert.strictEqual(CT.enrollmentOptions(b, asOf, POLICY, 2026).current, "early");
  assert.strictEqual(CT.enrollmentOptions(b, asOf, POLICY, 2028).current, "late");
  assert.strictEqual(CT.enrollmentOptions(b, asOf, POLICY, 2027).current, "default");
  const c = CT.enrollmentOptions(b, asOf, POLICY, 2031);
  assert.deepStrictEqual([c.current, c.currentYear], ["custom", 2031]);
});
test("[A] 정책 없음·미확인이면 null(섹션 숨김), 입력 불변", () => {
  assert.strictEqual(CT.enrollmentOptions(b, asOf, {}, undefined), null);
  assert.strictEqual(CT.enrollmentOptions(b, asOf, null, undefined), null);
  assert.strictEqual(CT.enrollmentOptions(b, asOf, { ...POLICY, enrollmentOffsetYears: { value: 7, verificationStatus: "확인필요" } }, undefined), null);
});
test("[A] app.js: 36개월 이상·임신 아님일 때만 노출, 기본이면 필드 삭제, 저장·동기화·재계산, plain 변환에 필드 추가", () => {
  assert.ok(/if \(isPregnant\(\) \|\| ChildTimeline\.completedMonths\(profile\.birthDate, new Date\(\)\) < ChildTimeline\.OVER36_FROM_MONTHS\) return "";/.test(APP));
  assert.ok(/if \(key === "default"\) delete profile\.enrollmentYearOverride;\s*\n\s*else profile\.enrollmentYearOverride = pick\.year;\s*\n\s*saveProfile\(profile\);\s*\n\s*pushProfileToFamily\(\);\s*\n\s*await buildAndRender\(\);/.test(APP));
  assert.ok(/enrollmentYearOverride: Number\.isInteger\(p\.enrollmentYearOverride\) \? p\.enrollmentYearOverride : null,/.test(APP));
  assert.ok(/\.\.\.\(Number\.isInteger\(p\.enrollmentYearOverride\) \? \{ enrollmentYearOverride: p\.enrollmentYearOverride \} : \{\}\)/.test(APP));
  assert.ok(APP.includes("조기입학·입학 연기를 신청했다면 바꿔 주세요(신청 10/1~12/31)."));
});
test("[A] plain 변환 왕복: 정수만 동기화, 없으면 null(서버 값 삭제)", () => {
  const grab = (name) => APP.slice(APP.indexOf("function " + name), APP.indexOf("\n  }\n", APP.indexOf("function " + name)) + 5);
  const ctx = vm.createContext({ toISODate: (d) => d.toISOString().slice(0, 10), Number, Date });
  vm.runInContext(grab("profileToPlain") + "\n" + grab("profileFromPlain"), ctx);
  const base = { name: "a", birthDate: b, province: "서울특별시", district: "구로구" };
  assert.strictEqual(ctx.profileToPlain({ ...base, enrollmentYearOverride: 2026 }).enrollmentYearOverride, 2026);
  assert.strictEqual(ctx.profileToPlain(base).enrollmentYearOverride, null);
  assert.strictEqual(ctx.profileToPlain({ ...base, enrollmentYearOverride: "x" }).enrollmentYearOverride, null);
  assert.strictEqual(ctx.profileFromPlain({ ...ctx.profileToPlain({ ...base, enrollmentYearOverride: 2028 }) }).enrollmentYearOverride, 2028);
  assert.ok(!("enrollmentYearOverride" in ctx.profileFromPlain(ctx.profileToPlain(base))));
});

const mirror = (links) => ({ children: Object.fromEntries(links.map((l, i) => ["k" + i, l])) });
test("[B] 연결 필요 판정: 가구 활성·코드 있음·링크 없음일 때만(분리된 링크도 '있음'으로 보아 중복 방지)", () => {
  const o = { hasHousehold: true, familyCode: "ABC234", pregnant: false, mirror: mirror([{ familyCode: "ZZZ999" }]) };
  assert.strictEqual(HV.canLinkCurrentChild(o), true);
  assert.strictEqual(HV.canLinkCurrentChild({ ...o, mirror: mirror([{ familyCode: "ABC234" }]) }), false);
  assert.strictEqual(HV.canLinkCurrentChild({ ...o, mirror: mirror([{ familyCode: "ABC234", removedAt: 5 }]) }), false);
  assert.strictEqual(HV.canLinkCurrentChild({ ...o, mirror: null }), true);
  for (const k of [{ hasHousehold: false }, { familyCode: null }, { pregnant: true }]) assert.strictEqual(HV.canLinkCurrentChild({ ...o, ...k }), false);
});
test("[B] 화면: 버튼은 canLinkChild 일 때만, 확인 시트 문구·버튼, 완료 알림", () => {
  const st = (o) => ({ enabled: true, view: "active", code: "ABCD2345", pending: 0, ...o });
  assert.ok(!HV.renderSection(st({})).includes("link-child"));
  const on = HV.renderSection(st({ canLinkChild: true }));
  assert.ok(on.includes('data-hh-action="link-child"') && on.includes("이 아이를 가족 캘린더에 연결"));
  const c = HV.renderSection(st({ view: "link-confirm", childName: "은찬" }));
  assert.ok(c.includes("은찬을(를) 가족 캘린더에 연결할까요?") && c.includes("가족 모두 이 아이의 일정을 함께 볼 수 있어요.") && c.includes(">연결하기<") && c.includes(">취소<") && c.includes('data-hh-action="confirm-link-child"'));
  assert.ok(HV.renderSection(st({ view: "none", notice: { kind: "linked" } })).includes("가족 캘린더에 연결했어요."));
});
test("[B] app.js: 서버 쓰기는 addChild 1건, 이미 링크면 쓰지 않음, 자동 연결·팝업 없음, 참여 알림에 안내 1줄", () => {
  const i = APP.indexOf('action === "confirm-link-child"');
  const blk = APP.slice(i, APP.indexOf('action === "leave"', i));
  assert.deepStrictEqual([...blk.matchAll(/HouseholdSync\.(\w+)\(/g)].map((m) => m[1]).filter((x) => x !== "getMirror"), ["addChild"]);
  assert.ok(/familyCode && !HouseholdView\.isChildLinked\(m, familyCode\)/.test(blk));
  assert.ok(/hhCanLinkChild\(\) \? " " \+ HouseholdView\.MSG\.linkJoinHint : ""/.test(APP));
  assert.strictEqual(HV.MSG.linkJoinHint, "이 기기의 아이를 가족 캘린더에 연결할 수 있어요.");
});

console.log(`\n${passed}개 통과${process.exitCode ? ", 일부 실패" : ""}`);
