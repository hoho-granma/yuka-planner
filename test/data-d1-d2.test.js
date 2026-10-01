/*
 * 데이터 정정 D1·D2 테스트.
 *  D1: VX-JEV 생백신 2차 창을 공식 24~35개월로(2026 국가예방접종 지침 130~131쪽) — 1차·사백신 회차·ID는 불변.
 *  D2: NAT-020 4~5세 무상교육·보육 월 금액(교육부 보도자료 2026-03-03, boardSeq=105471) — 기본 단가·월 5만원과의 합산은 확인불가라 합산 금액을 만들지 않는다.
 * 실행: node test/data-d1-d2.test.js
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const Engine = require("../js/todo-engine.js");

const ROOT = path.join(__dirname, "..");
let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log("  ok  - " + name); } catch (e) { process.exitCode = 1; console.log("  FAIL- " + name + "\n      " + (e.stack || e).split("\n").slice(0, 5).join("\n      ")); }
}
const rd = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), "utf8"));
const jev = rd("data/todos/vaccination.json").todos.find((t) => t.todo_id === "VX-JEV");
const nat = rd("data/subsidies/national.json").subsidies;
const nat020 = nat.find((s) => s.id === "NAT-020");
const opt = (id) => jev.variants.options.find((o) => o.variantId === id).occurrences;
const D = (y, m, d) => new Date(y, m - 1, d);

console.log("D1 VX-JEV 생백신 2차 창");
test("생백신 2차는 AGE_WINDOW 24~35개월, 1차(12~24)·회차 키·사백신 회차는 그대로", () => {
  const live = opt("생백신");
  assert.deepStrictEqual(live.map((o) => o.occurrenceKey), ["dose-1", "dose-2"]);
  assert.deepStrictEqual(live[0].trigger, { type: "AGE_WINDOW", startMonth: 12, endMonth: 24 });
  assert.deepStrictEqual(live[1].trigger, { type: "AGE_WINDOW", startMonth: 24, endMonth: 35 });
  const inact = opt("사백신");
  assert.deepStrictEqual(inact.map((o) => o.occurrenceKey), ["dose-1", "dose-2", "dose-3", "dose-4", "dose-5"]);
  assert.deepStrictEqual([inact[1].trigger.minOffsetDays, inact[1].trigger.maxOffsetDays, inact[2].trigger.minOffsetDays, inact[2].trigger.maxOffsetDays], [28, null, 335, null]);
  assert.strictEqual(jev.variants.selectionAttribute, "jevProductType");
});
test("엔진: 생백신을 고르면 2차 창이 출생+24개월 ~ 출생+35개월(24~24 한 점이 아니다)", () => {
  const birth = D(2024, 1, 15);
  const r = Engine.calculateTodoInstances({ today: D(2026, 3, 1), child: { birthDate: birth }, region: { province: "서울특별시", district: "구로구" }, familyDeclaredAttributes: { jevProductType: "생백신" }, completions: [], todoDefinitions: [jev] });
  const d2 = r.find((i) => i.todo_id === "VX-JEV" && i.occurrenceKey === "dose-2");
  assert.ok(d2, "생백신 dose-2 인스턴스");
  const start = Engine.addMonths(birth, 24), end = Engine.addMonths(birth, 35);
  assert.strictEqual(d2.windowStart.getTime(), start.getTime());
  assert.strictEqual(d2.windowEnd.getTime(), end.getTime());
  assert.ok(d2.windowEnd > d2.windowStart);
});
test("안내 문구: 1차 후 12개월 뒤(24~35개월), 지연 시 1차 후 12개월 뒤 2차, 근거에 최소 접종 연령 13개월·간격 12개월(최소 4주)", () => {
  assert.ok(jev.parentAction.includes("1년 뒤(24~35개월)에 2차") && jev.parentAction.includes("접종이 늦어졌다면 1차 후 12개월 뒤에 2차를 맞아요."));
  assert.ok(jev.verificationStatus.includes("생백신 2차: 24~35개월(1차 후 12개월, 최소 4주)") && jev.verificationStatus.includes("2차 최소 접종 연령 13개월") && jev.verificationStatus.includes("지연 시 1차 후 12개월 뒤 2차"));
});

console.log("D2 NAT-020 4~5세 무상교육·보육 월 금액");
test("세 금액(공립유치원 2만원·사립유치원 11만원·어린이집 7만원)과 항목명이 amountText 에 별도 문구로 들어 있다", () => {
  const a = nat020.amountText;
  assert.ok(a.includes("공립유치원 2만원(방과후과정비)") && a.includes("사립유치원 11만원(유아교육비)") && a.includes("어린이집 7만원(기타필요경비)"));
  assert.ok(a.includes("4~5세 무상교육·보육 월 금액은 별도로"));
});
test("원비 차감·2025년 단가 동일·3세 확대 2027년, 출처(보도자료 2026-03-03 · boardSeq=105471)·lastVerified 2026-10-02", () => {
  assert.ok(nat020.additionalConditions.includes("별도 신청 없이 원비에서 차감") && nat020.additionalConditions.includes("2025년과 같음") && nat020.additionalConditions.includes("2027년"));
  assert.ok(nat020.notes.includes("2026-03-03 배포") && nat020.notes.includes("영유아재정과") && nat020.notes.includes("boardSeq=105471"));
  assert.ok(nat020.sourceName.includes("교육부 보도자료(2026-03-03)"));
  assert.strictEqual(nat020.lastVerified, "2026-10-02");
});
test("합산 금액을 만들지 않는다: notes 에 '합산 여부는 공식 확인불가 · 계산·표시하지 않음'이 있고, 어느 필드에도 합계·합산 표기가 없다", () => {
  assert.ok(nat020.notes.includes("합산 여부는 공식 확인불가") && nat020.notes.includes("합산 금액은 계산·표시하지 않음"));
  for (const k of ["amountText", "additionalConditions"]) assert.ok(!/합계|총\s*\d|합산해|를 더한|\d+만원\s*\+\s*\d+만원|=\s*\d+만원/.test(nat020[k]), k);
  // 이전 보고에서 확정한 기존 단가·5만원 문구는 그대로
  assert.ok(nat020.amountText.includes("국공립 월 10만원·사립 월 28만원") && nat020.amountText.includes("월 5만원 유아학비·보육료 추가지원"));
  assert.ok(nat020.additionalConditions.includes("2026.3.1~2027.2.28") && nat020.additionalConditions.includes("소급 지원 불가"));
});
test("NAT-007·NAT-018 등 다른 지원금 항목과 NAT-020 의 구조(키 집합)는 바뀌지 않았다", () => {
  const head = JSON.parse(execFileSync("git", ["show", "HEAD:data/subsidies/national.json"], { cwd: ROOT }).toString("utf8")).subsidies;
  for (const s of nat) {
    const h = head.find((x) => x.id === s.id);
    assert.ok(h, s.id + " 가 HEAD 에 있다");
    assert.deepStrictEqual(Object.keys(s).sort(), Object.keys(h).sort(), s.id + " 키 집합");
    if (s.id !== "NAT-020") assert.deepStrictEqual(s, h, s.id + " 는 변경 없음");
  }
  assert.strictEqual(nat.length, head.length);
  assert.strictEqual(nat020.conditionLabel, "유치원 이용 시");
});

console.log(`\n${passed}개 통과${process.exitCode ? ", 일부 실패" : ""}`);
