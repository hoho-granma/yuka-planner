/* G13-2 순수 규칙: 나이 구간·카테고리 목록(고정), category enum 매핑, 제목 자동 채우기. 실행: node test/g13b-schedule-kinds.test.js */
const assert = require("assert");
const K = require("../js/schedule-kinds.js");
const US = require("../js/user-schedule.js");
let passed = 0;
function test(name, fn) { try { fn(); passed++; console.log("  ok  - " + name); } catch (e) { process.exitCode = 1; console.log("  FAIL- " + name + "\n      " + (e.stack || e).split("\n").slice(0, 4).join("\n      ")); } }
const labels = (t, m) => K.kindsFor(t, m).map((x) => x.label);

test("나이 구간 고정: 0~11개월 / 12~47(1~3세) / 48~83(4~7세) / 84~(초등), 출산 전·모름은 BABY", () => {
  assert.deepStrictEqual(K.BANDS.map((b) => [b.key, b.from, b.to === Infinity ? "inf" : b.to, b.label]), [["BABY", 0, 11, "0~12개월"], ["TODDLER", 12, 47, "1~3세"], ["KINDER", 48, 83, "4~7세"], ["ELEM", 84, "inf", "초등"]]);
  assert.deepStrictEqual([0, 11, 12, 47, 48, 83, 84, 200, -3, null, undefined, NaN].map(K.bandOf), ["BABY", "BABY", "TODDLER", "TODDLER", "KINDER", "KINDER", "ELEM", "ELEM", "BABY", "BABY", "BABY", "BABY"]);
  assert.deepStrictEqual([K.ageMonths("2026-06-20", "2026-10-03"), K.ageMonths("2026-06-20", "2026-10-20"), K.ageMonths("2026-06-20", "2026-10-19"), K.ageMonths("2026-12-01", "2026-10-03"), K.ageMonths("x", "2026-10-03")], [3, 4, 3, -2, null]);
});
test("아이 카테고리 목록(구간별) 고정", () => {
  assert.deepStrictEqual(labels("CHILD", 5), ["병원·검진", "예방접종", "문화센터", "육아 모임"]);
  assert.deepStrictEqual(labels("CHILD", 20), ["어린이집", "병원·검진", "예방접종", "놀이·수업"]);
  assert.deepStrictEqual(labels("CHILD", 60), ["어린이집·유치원", "수업·학원", "병원·검진", "놀이·체험", "친구 약속"]);
  assert.deepStrictEqual(labels("CHILD", 100), ["학교", "학원", "병원", "체험학습", "친구 약속"]);
});
test("임신 중(PREGNANT)·나이를 모를 때(null)는 각각 전용·공통 아이 목록", () => {
  assert.deepStrictEqual(labels("CHILD", "PREGNANT"), ["병원·검진", "출산 준비", "산후조리 예약"]);
  assert.deepStrictEqual([labels("CHILD", null), labels("CHILD"), labels("CHILD", NaN)].map((l) => l.join("/")), Array(3).fill("병원·검진/어린이집·유치원/수업·학원/놀이·체험/친구 약속"));
  assert.deepStrictEqual([K.categoryOf("산후조리 예약", "CHILD", "PREGNANT"), K.categoryOf("출산 준비", "CHILD", "PREGNANT"), K.categoryOf("수업·학원", "CHILD", null)], ["INSTITUTION", "ETC", "LESSON"]);
});
test("어른·가족 전체 카테고리 목록 고정", () => {
  assert.deepStrictEqual(labels("ADULT"), ["회사", "모임·약속", "병원", "운동", "개인 일정"]); // D82: '집안일' 칩 삭제(5칩은 390px 폭에 한 줄)
  assert.deepStrictEqual(labels("FAMILY"), ["가족 행사", "나들이", "여행", "기념일"]);
});
test("모든 카테고리는 기존 category enum 으로 매핑되고 이름은 제목 한도(100자) 이하", () => {
  const all = [...Object.values(K.CHILD_KINDS).flat(), ...K.PREGNANT_KINDS, ...K.COMMON_CHILD_KINDS, ...K.ADULT_KINDS, ...K.FAMILY_KINDS];
  assert.ok(all.every((x) => US.CATEGORIES.includes(x.category) && x.label.length >= 1 && x.label.length <= US.LIMITS.titleMax));
  assert.deepStrictEqual([K.categoryOf("예방접종", "CHILD", 5), K.categoryOf("어린이집", "CHILD", 20), K.categoryOf("수업·학원", "CHILD", 60), K.categoryOf("여행", "FAMILY"), K.categoryOf("없는 이름", "ADULT")], ["MEDICAL", "INSTITUTION", "LESSON", "FAMILY", "ETC"]);
});
test("제목 자동 채우기: 안 고쳤으면 카테고리 이름, 직접 고쳤으면 덮어쓰지 않는다", () => {
  assert.strictEqual(K.nextTitle("", false, "예방접종"), "예방접종");
  assert.strictEqual(K.nextTitle("예방접종", false, "병원·검진"), "병원·검진");
  assert.strictEqual(K.nextTitle("DTaP 4차", true, "병원·검진"), "DTaP 4차");
  assert.strictEqual(K.nextTitle("", true, "병원·검진"), "병원·검진", "직접 고쳤어도 비어 있으면 다시 채운다");
  assert.strictEqual(K.nextTitle("  ", true, "병원·검진"), "병원·검진");
});
console.log(`\n${passed}개 통과`);
