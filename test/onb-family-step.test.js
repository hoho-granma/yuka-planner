/*
 * 온보딩 가족 단계(순수 부분): 노출 조건, 이름 변경 계산, 시트 렌더. 실행: node test/onb-family-step.test.js
 */
const assert = require("assert");
const HV = require("../js/household-view.js");

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log("  ok  - " + name); } catch (e) { process.exitCode = 1; console.log("  FAIL- " + name + "\n      " + (e.stack || e).split("\n").slice(0, 4).join("\n      ")); }
}
const base = { enabled: true, hasHousehold: false, hadChildren: false, seen: false };

test("노출 조건: 플래그 ON·가구 없음·첫 아이·안 봄일 때만", () => {
  assert.strictEqual(HV.shouldOfferOnboarding(base), true);
  for (const k of [{ enabled: false }, { hasHousehold: true }, { hadChildren: true }, { seen: true }, { hadChildren: undefined }]) assert.strictEqual(HV.shouldOfferOnboarding({ ...base, ...k }), false, JSON.stringify(k));
  assert.strictEqual(HV.shouldOfferOnboarding(null), false);
});

const members = [{ memberId: "m1", role: "MOM", label: "엄마", order: 1 }, { memberId: "m2", role: "DAD", label: "아빠", order: 2 }, { memberId: "m3", role: "DAD", label: "삭제됨", order: 3, deletedAt: 1 }];
test("이름 변경: 바뀐 것만, 빈 입력은 기존 유지, 공백 제거", () => {
  assert.deepStrictEqual(HV.onboardingNameUpdates(members, { MOM: "  지은 ", DAD: "" }), { ok: true, error: null, updates: [{ memberId: "m1", role: "MOM", label: "지은" }] });
  assert.deepStrictEqual(HV.onboardingNameUpdates(members, { MOM: "엄마", DAD: "아빠" }).updates, []);
});
test("이름 검증: 20자 초과는 오류(업데이트 없음)", () => {
  const r = HV.onboardingNameUpdates(members, { MOM: "가".repeat(21), DAD: "" });
  assert.strictEqual(r.ok, false);
  assert.deepStrictEqual(r.updates, []);
  assert.ok(r.error);
});
test("렌더: 단계별 버튼·문구, 코드·입력값 이스케이프", () => {
  const offer = HV.renderOnboarding({ step: "offer" });
  assert.ok(offer.includes("가족 캘린더를 만들어 볼까요?") && offer.includes('data-onb-action="create"') && offer.includes('data-onb-action="later"'));
  const names = HV.renderOnboarding({ step: "names", mom: '<b>"', me: "DAD" });
  assert.ok(names.includes('data-onb-input="MOM"') && names.includes("&lt;b&gt;&quot;") && !names.includes("<b>") && names.includes('data-onb-action="save-names"') && names.includes('data-onb-action="skip-names"'));
  assert.ok(/class="hh-chip active" data-onb-me="DAD"/.test(names));
  const code = HV.renderOnboarding({ step: "code", code: "ABCD2345" });
  assert.ok(code.includes("ABCD2345") && code.includes('data-onb-action="copy"') && code.includes('data-onb-action="done"'));
  assert.ok(HV.renderOnboarding({ step: "creating" }).includes(HV.MSG.creating));
});
test("순수: 문구 상수 고정(승인 전 제안안) · 기존 renderSection 출력은 그대로", () => {
  assert.strictEqual(HV.ONB_MSG.offerCreate, "만들어 볼게요");
  assert.strictEqual(HV.renderSection({ enabled: false, view: "none" }), "");
});
const app = require("fs").readFileSync(require("path").join(__dirname, "..", "js", "app.js"), "utf8");
test("app.js 연결: 첫 아이 저장 직후만 제안·한 번만(seen)·서버 쓰기는 createHousehold/upsertMember 뿐", () => {
  assert.ok(/const onbFirstChild = !wasNewChildMode && loadChildren\(\)\.length === 0;/.test(app));
  assert.ok(/await ensureFamilyCode\(\);\s*\n\s*(?:if \(familyCode && pregRegBasis !== undefined\)[^\n]*\n\s*pregRegBasis = undefined;\s*\n\s*)?onbMaybeOffer\(!onbFirstChild\);/.test(app));
  const body = app.slice(app.indexOf("function onbMaybeOffer"), app.indexOf("async function hhInit()"));
  assert.ok(/shouldOfferOnboarding/.test(body) && /setItem\(ONB_SEEN_KEY/.test(body));
  const writes = [...body.matchAll(/HouseholdSync\.(\w+)\(/g)].map((m) => m[1]).filter((x, i, a) => a.indexOf(x) === i).sort();
  assert.deepStrictEqual(writes, ["createHousehold", "upsertMember"]);
  assert.ok(!/FamilySync|completed|saveProfile/.test(body));
});
test("아동수당 상세 기간 행: 108개월 고정 날짜 대신 연도별 상향 표기", () => {
  assert.ok(app.includes('"SB-04": [RETRO60, { label: "지급·신청 기간", start: M(0), end: "만 9세 미만(연도별 상향)"'));
  assert.ok(!/"SB-04":[^\n]*M\(108/.test(app));
});
console.log(`\n${passed}개 통과${process.exitCode ? ", 일부 실패" : ""}`);
