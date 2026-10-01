/*
 * Todo 계산 엔진(js/todo-engine.js) 단위 테스트.
 * 실행: node test/todo-engine.test.js
 */
const assert = require("assert");
const Engine = require("../js/todo-engine.js");
// 2026-09-29부터 마스터 데이터가 카테고리별 파일(data/todos/*.json)로 나뉘었다 — 엔진 테스트는
// 여전히 전체 75개를 한 배열로 합쳐서 검증한다.
const TODO_CATEGORY_FILES = [
  "../data/todos/health-checkup.json",
  "../data/todos/vaccination.json",
  "../data/todos/development.json",
  "../data/todos/feeding.json",
  "../data/todos/oral.json",
  "../data/todos/sleep.json",
  "../data/todos/safety.json",
  "../data/todos/daily-life.json",
  "../data/todos/childcare.json",
  "../data/subsidies/national-todos.json",
];
const TODOS = TODO_CATEGORY_FILES.flatMap((f) => require(f).todos);
function findTodo(id) {
  const t = TODOS.find((x) => x.todo_id === id);
  if (!t) throw new Error(`fixture 없음: ${id}`);
  return t;
}

const birthDate = new Date("2025-01-01T00:00:00.000Z");

function baseInput(overrides) {
  return Object.assign(
    {
      today: Engine.addMonths(birthDate, 6),
      child: { birthDate, gender: "F" },
      region: { province: "경기도", district: "성남시" },
      familyDeclaredAttributes: {},
      completions: [],
      todoDefinitions: [],
    },
    overrides
  );
}

function statusOf(instances, todoId, occurrenceKey) {
  const key = occurrenceKey || "default";
  const found = instances.find((i) => i.todo_id === todoId && i.occurrenceKey === key);
  if (!found) throw new Error(`instance 없음: ${todoId}/${key}`);
  return found;
}

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ok  - ${name}`);
  } catch (e) {
    console.error(`FAIL - ${name}\n       ${e.stack.split("\n").slice(0, 2).join("\n       ")}`);
    process.exitCode = 1;
  }
}

// =====================================================================
console.log("A. 단일 AGE_WINDOW Todo (HC-03, 9~12개월, catchUp ALLOWED)");
// =====================================================================
{
  const hc03 = findTodo("HC-03");
  test("월령 3개월 → SCHEDULED", () => {
    const r = Engine.calculateTodoInstances(baseInput({ today: Engine.addMonths(birthDate, 3), todoDefinitions: [hc03] }));
    assert.strictEqual(statusOf(r, "HC-03").status, "SCHEDULED");
  });
  test("windowStart 15일 전(leadDays=30 이내) → UPCOMING", () => {
    const windowStart = Engine.addMonths(birthDate, 9);
    const today = Engine.addDays(windowStart, -15);
    const r = Engine.calculateTodoInstances(baseInput({ today, todoDefinitions: [hc03] }));
    assert.strictEqual(statusOf(r, "HC-03").status, "UPCOMING");
  });
  test("월령 10개월(창 안, 미완료) → DUE", () => {
    const r = Engine.calculateTodoInstances(baseInput({ today: Engine.addMonths(birthDate, 10), todoDefinitions: [hc03] }));
    assert.strictEqual(statusOf(r, "HC-03").status, "DUE");
  });
  test("월령 10개월(완료 기록 있음) → DONE", () => {
    const completions = [{ todo_id: "HC-03", occurrenceKey: "default", recordType: "TODO_COMPLETED", recordedAt: Engine.addMonths(birthDate, 10) }];
    const r = Engine.calculateTodoInstances(baseInput({ today: Engine.addMonths(birthDate, 10), completions, todoDefinitions: [hc03] }));
    assert.strictEqual(statusOf(r, "HC-03").status, "DONE");
  });
  test("월령 15개월(창 지남, catchUp=ALLOWED, 미완료) → OVERDUE_CATCHUP", () => {
    const r = Engine.calculateTodoInstances(baseInput({ today: Engine.addMonths(birthDate, 15), todoDefinitions: [hc03] }));
    assert.strictEqual(statusOf(r, "HC-03").status, "OVERDUE_CATCHUP");
  });
}

// =====================================================================
console.log("\nB. 반복 Todo (OR-04, 6개월 간격 치과검진)");
// =====================================================================
{
  const or04 = findTodo("OR-04");
  test("완료 이력 없음, 12개월 → occ-1 DUE", () => {
    const r = Engine.calculateTodoInstances(baseInput({ today: Engine.addMonths(birthDate, 12), todoDefinitions: [or04] }));
    assert.strictEqual(statusOf(r, "OR-04", "occ-1").status, "DUE");
  });
  test("occ-1을 12개월에 완료 → 13개월 시점엔 occ-2가 아직 SCHEDULED(다음 검진은 +6개월 뒤)", () => {
    const completedAt = Engine.addMonths(birthDate, 12);
    const completions = [{ todo_id: "OR-04", occurrenceKey: "occ-1", recordType: "TODO_COMPLETED", recordedAt: completedAt }];
    const r = Engine.calculateTodoInstances(baseInput({ today: Engine.addMonths(birthDate, 13), completions, todoDefinitions: [or04] }));
    const occ2 = statusOf(r, "OR-04", "occ-2");
    assert.strictEqual(occ2.status, "SCHEDULED");
  });
  test("occ-1을 12개월에 완료 → 18개월 시점엔 occ-2가 DUE(=직전완료+6개월)", () => {
    const completedAt = Engine.addMonths(birthDate, 12);
    const completions = [{ todo_id: "OR-04", occurrenceKey: "occ-1", recordType: "TODO_COMPLETED", recordedAt: completedAt }];
    const r = Engine.calculateTodoInstances(baseInput({ today: Engine.addMonths(birthDate, 18), completions, todoDefinitions: [or04] }));
    assert.strictEqual(statusOf(r, "OR-04", "occ-2").status, "DUE");
  });
}

// =====================================================================
console.log("\nC. 예방접종 시리즈 (VX-DTAP, 일부 회차 완료 후 다음 회차 계산)");
// =====================================================================
{
  const dtap = findTodo("VX-DTAP");
  test("1·2차 완료, 6개월 시점 → 3차는 DUE, 4·5차는 SCHEDULED, 1·2차는 DONE", () => {
    const completions = [
      { todo_id: "VX-DTAP", occurrenceKey: "dose-1", recordType: "TODO_COMPLETED", recordedAt: Engine.addMonths(birthDate, 2) },
      { todo_id: "VX-DTAP", occurrenceKey: "dose-2", recordType: "TODO_COMPLETED", recordedAt: Engine.addMonths(birthDate, 4) },
    ];
    const r = Engine.calculateTodoInstances(baseInput({ today: Engine.addMonths(birthDate, 6), completions, todoDefinitions: [dtap] }));
    assert.strictEqual(statusOf(r, "VX-DTAP", "dose-1").status, "DONE");
    assert.strictEqual(statusOf(r, "VX-DTAP", "dose-2").status, "DONE");
    assert.strictEqual(statusOf(r, "VX-DTAP", "dose-3").status, "DUE");
    assert.strictEqual(statusOf(r, "VX-DTAP", "dose-4").status, "SCHEDULED");
    assert.strictEqual(statusOf(r, "VX-DTAP", "dose-5").status, "SCHEDULED");
  });
}

// =====================================================================
console.log("\nD. milestone event (SF-04, 기어다니기 시작)");
// =====================================================================
{
  const sf04 = findTodo("SF-04");
  test("보고 없음 → PENDING_MILESTONE", () => {
    const r = Engine.calculateTodoInstances(baseInput({ today: Engine.addMonths(birthDate, 8), todoDefinitions: [sf04] }));
    assert.strictEqual(statusOf(r, "SF-04").status, "PENDING_MILESTONE");
  });
  test("마일스톤 보고됨, 완료 전 → DUE", () => {
    const completions = [{ todo_id: "SF-04", occurrenceKey: "default", recordType: "MILESTONE_REPORTED", recordedAt: Engine.addMonths(birthDate, 7) }];
    const r = Engine.calculateTodoInstances(baseInput({ today: Engine.addMonths(birthDate, 8), completions, todoDefinitions: [sf04] }));
    assert.strictEqual(statusOf(r, "SF-04").status, "DUE");
  });
  test("마일스톤 보고 + 완료 처리 → DONE", () => {
    const completions = [
      { todo_id: "SF-04", occurrenceKey: "default", recordType: "MILESTONE_REPORTED", recordedAt: Engine.addMonths(birthDate, 7) },
      { todo_id: "SF-04", occurrenceKey: "default", recordType: "TODO_COMPLETED", recordedAt: Engine.addMonths(birthDate, 7.2) },
    ];
    const r = Engine.calculateTodoInstances(baseInput({ today: Engine.addMonths(birthDate, 8), completions, todoDefinitions: [sf04] }));
    assert.strictEqual(statusOf(r, "SF-04").status, "DONE");
  });
}

// =====================================================================
console.log("\nE. eligibility condition (SB-05, 소득조건)");
// =====================================================================
{
  const sb05 = findTodo("SB-05");
  test("소득구간 미입력 → eligibility UNKNOWN, status 없음(노출 안 함)", () => {
    const r = Engine.calculateTodoInstances(baseInput({ today: Engine.addDays(birthDate, 10), todoDefinitions: [sb05] }));
    const inst = statusOf(r, "SB-05");
    assert.strictEqual(inst.eligibility, "UNKNOWN");
    assert.strictEqual(inst.status, null);
  });
  test("소득조건 불일치 → 목록에서 완전 제외", () => {
    const r = Engine.calculateTodoInstances(
      baseInput({ today: Engine.addDays(birthDate, 10), familyDeclaredAttributes: { incomeBracket: "중위소득150%" }, todoDefinitions: [sb05] })
    );
    assert.strictEqual(r.length, 0);
  });
  test("소득조건 일치 → 정상 계산(AGE_WINDOW 수급기간 안, DUE)", () => {
    const r = Engine.calculateTodoInstances(
      baseInput({ today: Engine.addDays(birthDate, 10), familyDeclaredAttributes: { incomeBracket: "중위소득100%이하" }, todoDefinitions: [sb05] })
    );
    assert.strictEqual(statusOf(r, "SB-05").status, "DUE");
  });
}

// =====================================================================
console.log("\nF. 지역 조건 (합성 fixture — 73개 중 실제 include 목록을 쓰는 항목이 없어 로직만 별도 검증)");
// =====================================================================
{
  const regionTd = {
    todo_id: "TEST-REGION",
    category: "SB",
    title: "지역조건 테스트용",
    exposureLevel: "MUST",
    triggerType: "AGE_WINDOW",
    triggerParams: { startMonth: 0, endMonth: 36 },
    regionCondition: { include: ["경기도:성남시"] },
    catchUp: "NOT_APPLICABLE",
    priority: 3,
    leadDays: 0,
    verificationStatus: "확인됨",
  };
  test("지역 일치 → 노출됨", () => {
    const r = Engine.calculateTodoInstances(baseInput({ region: { province: "경기도", district: "성남시" }, todoDefinitions: [regionTd] }));
    assert.strictEqual(r.length, 1);
  });
  test("지역 불일치 → 완전 제외", () => {
    const r = Engine.calculateTodoInstances(baseInput({ region: { province: "서울특별시", district: "강남구" }, todoDefinitions: [regionTd] }));
    assert.strictEqual(r.length, 0);
  });
  test("SB-10(지자체 지원금 위임 항목)은 REFERENCE로만 노출되고 지역필터에 안 걸림", () => {
    const sb10 = findTodo("SB-10");
    const r = Engine.calculateTodoInstances(baseInput({ todoDefinitions: [sb10] }));
    assert.strictEqual(statusOf(r, "SB-10").status, "REFERENCE");
  });
}

// =====================================================================
console.log("\nG. overdue / catch-up 구분 (VX-ROTA=NOT_ALLOWED vs HC-01=ALLOWED)");
// =====================================================================
{
  const rota = findTodo("VX-ROTA");
  const hc01 = findTodo("HC-01");
  test("로타(캐치업 불가) 마감(8개월) 지나면 → OVERDUE_FINAL", () => {
    const r = Engine.calculateTodoInstances(baseInput({ today: Engine.addMonths(birthDate, 10), todoDefinitions: [rota] }));
    // 미선택 시 기본 variant(로타릭스) dose-2 window end=8개월
    assert.strictEqual(statusOf(r, "VX-ROTA", "dose-2").status, "OVERDUE_FINAL");
  });
  test("건강검진 1차(캐치업 가능) 지나면 → OVERDUE_CATCHUP", () => {
    const r = Engine.calculateTodoInstances(baseInput({ today: Engine.addMonths(birthDate, 3), todoDefinitions: [hc01] }));
    assert.strictEqual(statusOf(r, "HC-01").status, "OVERDUE_CATCHUP");
  });
}

// =====================================================================
console.log("\nH. variants (로타바이러스, 일본뇌염)");
// =====================================================================
{
  const rota = findTodo("VX-ROTA");
  test("제품 미선택 → 기본값(로타릭스, 2회)로 계산 + variantSelectionNeeded=true", () => {
    const r = Engine.calculateTodoInstances(baseInput({ todoDefinitions: [rota] }));
    const doses = r.filter((i) => i.todo_id === "VX-ROTA");
    assert.strictEqual(doses.length, 2);
    assert.strictEqual(doses[0].variantSelectionNeeded, true);
  });
  test("로타텍 선택 → 3회로 계산 + variantSelectionNeeded=false", () => {
    const r = Engine.calculateTodoInstances(
      baseInput({ familyDeclaredAttributes: { rotaProductType: "로타텍" }, todoDefinitions: [rota] })
    );
    const doses = r.filter((i) => i.todo_id === "VX-ROTA");
    assert.strictEqual(doses.length, 3);
    assert.strictEqual(doses[0].variantSelectionNeeded, false);
  });

  const jev = findTodo("VX-JEV");
  test("생백신 선택 → 2회(12개월/24개월 절대월령)", () => {
    const r = Engine.calculateTodoInstances(baseInput({ familyDeclaredAttributes: { jevProductType: "생백신" }, todoDefinitions: [jev] }));
    const doses = r.filter((i) => i.todo_id === "VX-JEV");
    assert.strictEqual(doses.length, 2);
  });
  test("사백신 선택 → 5회, 1차 완료 후 2차는 완료일+28일(최소 4주, KDCA 2026 지침)부터 계산됨(I. RELATIVE_TO_EVENT와 동일 메커니즘)", () => {
    const dose1Completed = Engine.addMonths(birthDate, 12);
    const completions = [{ todo_id: "VX-JEV", occurrenceKey: "dose-1", recordType: "TODO_COMPLETED", recordedAt: dose1Completed }];
    const today = Engine.addDays(dose1Completed, 28); // 정확히 28일째(최소 접종 간격)
    const r = Engine.calculateTodoInstances(
      baseInput({ today, familyDeclaredAttributes: { jevProductType: "사백신" }, completions, todoDefinitions: [jev] })
    );
    const doses = r.filter((i) => i.todo_id === "VX-JEV");
    assert.strictEqual(doses.length, 5);
    assert.strictEqual(statusOf(r, "VX-JEV", "dose-2").status, "DUE");
  });
}

// =====================================================================
console.log("\nI. RELATIVE_TO_EVENT (VX-HEPA, A형간염 2차 = 1차 완료일 기준)");
// =====================================================================
{
  const hepa = findTodo("VX-HEPA");
  test("1차 미완료 → 2차는 windowStart 계산 불가 → SCHEDULED", () => {
    const r = Engine.calculateTodoInstances(baseInput({ today: Engine.addMonths(birthDate, 13), todoDefinitions: [hepa] }));
    assert.strictEqual(statusOf(r, "VX-HEPA", "dose-2").status, "SCHEDULED");
  });
  test("1차 완료 후 200일 시점(6~12개월 창 안) → 2차 DUE", () => {
    const dose1Completed = Engine.addMonths(birthDate, 12);
    const completions = [{ todo_id: "VX-HEPA", occurrenceKey: "dose-1", recordType: "TODO_COMPLETED", recordedAt: dose1Completed }];
    const today = Engine.addDays(dose1Completed, 200);
    const r = Engine.calculateTodoInstances(baseInput({ today, completions, todoDefinitions: [hepa] }));
    assert.strictEqual(statusOf(r, "VX-HEPA", "dose-2").status, "DUE");
  });
  test("1차 완료 후 400일(365일 창 지남, catchUp=ALLOWED) → OVERDUE_CATCHUP", () => {
    const dose1Completed = Engine.addMonths(birthDate, 12);
    const completions = [{ todo_id: "VX-HEPA", occurrenceKey: "dose-1", recordType: "TODO_COMPLETED", recordedAt: dose1Completed }];
    const today = Engine.addDays(dose1Completed, 400);
    const r = Engine.calculateTodoInstances(baseInput({ today, completions, todoDefinitions: [hepa] }));
    assert.strictEqual(statusOf(r, "VX-HEPA", "dose-2").status, "OVERDUE_CATCHUP");
  });
}

// =====================================================================
console.log("\n통합: 75개 Todo 전체가 예외 없이 계산되는지");
// =====================================================================
{
  test("월령 0~36개월 전 구간에서 75개 전부 예외 없이 계산됨", () => {
    for (let m = 0; m <= 36; m += 3) {
      const r = Engine.calculateTodoInstances(baseInput({ today: Engine.addMonths(birthDate, m), todoDefinitions: TODOS }));
      assert.ok(Array.isArray(r));
    }
  });
  test("REFERENCE 타입(OR-02, SB-10)은 항상 status REFERENCE", () => {
    const r = Engine.calculateTodoInstances(baseInput({ todoDefinitions: TODOS }));
    assert.strictEqual(statusOf(r, "OR-02").status, "REFERENCE");
    assert.strictEqual(statusOf(r, "SB-10").status, "REFERENCE");
  });
}

// =====================================================================
console.log("\nJ. 재검토 반영 검증 (사용자 요청 케이스 1~10)");
// =====================================================================

// 1. 아동수당 신청기한 경과 후에도 수급기간이 남아 있는 경우
test("1) SB-04: 신청기한(60일) 지나도 수급기간(0~108개월) 안이면 DUE, OVERDUE 아님", () => {
  const sb04 = findTodo("SB-04");
  const today = Engine.addDays(birthDate, 90); // 60일 경과, 그러나 108개월 수급기간 안
  const r = Engine.calculateTodoInstances(baseInput({ today, todoDefinitions: [sb04] }));
  const inst = statusOf(r, "SB-04");
  assert.strictEqual(inst.status, "DUE");
  assert.strictEqual(inst.applicationDeadlinePassed, true);
  assert.strictEqual(inst.retroactiveEligible, false);
});

// 2. 부모급여 0세 신청 후 1세 자동연장
test("2a) SB-02 신청 완료 → SB-03은 자동연장(DONE, autoExtended)", () => {
  const sb02 = findTodo("SB-02");
  const sb03 = findTodo("SB-03");
  const completions = [{ todo_id: "SB-02", occurrenceKey: "default", recordType: "TODO_COMPLETED", recordedAt: Engine.addDays(birthDate, 10) }];
  const r = Engine.calculateTodoInstances(baseInput({ today: Engine.addMonths(birthDate, 12), completions, todoDefinitions: [sb02, sb03] }));
  const inst = statusOf(r, "SB-03");
  assert.strictEqual(inst.status, "DONE");
  assert.strictEqual(inst.autoExtended, true);
});
test("2b) SB-02 미신청 → SB-03은 별도 신청 필요(MUST, 정상 계산)", () => {
  const sb03 = findTodo("SB-03");
  const r = Engine.calculateTodoInstances(baseInput({ today: Engine.addMonths(birthDate, 13), todoDefinitions: [sb03] }));
  const inst = statusOf(r, "SB-03");
  assert.strictEqual(inst.status, "DUE");
  assert.notStrictEqual(inst.autoExtended, true);
});

// 3. 기저귀바우처 신청기한과 수급기간 분리
test("3) SB-05: 60일 지나도 24개월 수급기간 안이면 DUE, 소급만 불가", () => {
  const sb05 = findTodo("SB-05");
  const today = Engine.addDays(birthDate, 90);
  const r = Engine.calculateTodoInstances(
    baseInput({ today, familyDeclaredAttributes: { incomeBracket: "중위소득100%이하" }, todoDefinitions: [sb05] })
  );
  const inst = statusOf(r, "SB-05");
  assert.strictEqual(inst.status, "DUE");
  assert.strictEqual(inst.retroactiveEligible, false);
});

// 4. 미숙아 의료비 지원의 신청기한과 지원기간 분리
test("4) SB-06: 180일(퇴원후6개월 근사) 지나도 24개월 지원기간 안이면 DUE", () => {
  const sb06 = findTodo("SB-06");
  const today = Engine.addDays(birthDate, 200);
  const r = Engine.calculateTodoInstances(baseInput({ today, familyDeclaredAttributes: { prematureBirth: true }, todoDefinitions: [sb06] }));
  const inst = statusOf(r, "SB-06");
  assert.strictEqual(inst.status, "DUE");
  assert.strictEqual(inst.applicationDeadlinePassed, true);
  assert.strictEqual(inst.retroactiveEligible, false);
});

// 5·6. 첫니 시점에 따른 OR-03 마감일
test("5) 첫니 3개월 → 마감은 9개월(첫니+6, 절대상한 12보다 이름)", () => {
  const or03 = findTodo("OR-03");
  const toothAt = Engine.addMonths(birthDate, 3);
  const completions = [{ todo_id: "OR-01", occurrenceKey: "default", recordType: "MILESTONE_REPORTED", recordedAt: toothAt }];
  const before = Engine.calculateTodoInstances(baseInput({ today: Engine.addMonths(birthDate, 8), completions, todoDefinitions: [or03] }));
  assert.strictEqual(statusOf(before, "OR-03").status, "DUE"); // 아직 9개월 전
  const after = Engine.calculateTodoInstances(baseInput({ today: Engine.addMonths(birthDate, 10), completions, todoDefinitions: [or03] }));
  assert.strictEqual(statusOf(after, "OR-03").status, "OVERDUE_CATCHUP"); // 9개월 지남
});
test("6) 첫니 8개월 → 마감은 12개월(절대상한이 첫니+6=14보다 이름)", () => {
  const or03 = findTodo("OR-03");
  const toothAt = Engine.addMonths(birthDate, 8);
  const completions = [{ todo_id: "OR-01", occurrenceKey: "default", recordType: "MILESTONE_REPORTED", recordedAt: toothAt }];
  const before = Engine.calculateTodoInstances(baseInput({ today: Engine.addMonths(birthDate, 11), completions, todoDefinitions: [or03] }));
  assert.strictEqual(statusOf(before, "OR-03").status, "DUE"); // 아직 12개월 전
  const after = Engine.calculateTodoInstances(baseInput({ today: Engine.addMonths(birthDate, 13), completions, todoDefinitions: [or03] }));
  assert.strictEqual(statusOf(after, "OR-03").status, "OVERDUE_CATCHUP"); // 12개월 지남
});

// 7. 일본뇌염 사백신 2차 접종 간격 — KDCA 2026 지침 130~131쪽: 표준 1개월 간격, 최소 4주(7일은 가속접종 예외)
test("7) VX-JEV(사백신) 2차: 1차완료+28일부터 DUE(+7일은 아직 아님), +30일 이후에도 상한 없이 DUE 유지(+31일·+60일, KDCA 지침: 지연 시 즉시 접종)", () => {
  const jev = findTodo("VX-JEV");
  const dose1 = Engine.addMonths(birthDate, 12);
  const completions = [{ todo_id: "VX-JEV", occurrenceKey: "dose-1", recordType: "TODO_COMPLETED", recordedAt: dose1 }];
  const at = (days) =>
    statusOf(
      Engine.calculateTodoInstances(baseInput({ today: Engine.addDays(dose1, days), familyDeclaredAttributes: { jevProductType: "사백신" }, completions, todoDefinitions: [jev] })),
      "VX-JEV",
      "dose-2"
    ).status;
  assert.notStrictEqual(at(7), "DUE");
  assert.strictEqual(at(28), "DUE");
  assert.strictEqual(at(30), "DUE");
  assert.strictEqual(at(31), "DUE");
  assert.strictEqual(at(60), "DUE");
});

// 8. 인플루엔자 최초 시즌 2회 접종
test("8) VX-FLU: 최초 시즌 2회(4주 간격) 완료 후 다음 시즌은 확인 필요(status=null)", () => {
  const flu = findTodo("VX-FLU");
  const zero = Engine.calculateTodoInstances(baseInput({ today: Engine.addMonths(birthDate, 6), todoDefinitions: [flu] }));
  assert.strictEqual(statusOf(zero, "VX-FLU", "season-1-dose-1").status, "DUE");

  const dose1At = Engine.addMonths(birthDate, 6);
  const oneCompletion = [{ todo_id: "VX-FLU", occurrenceKey: "season-1-dose-1", recordType: "TODO_COMPLETED", recordedAt: dose1At }];
  const afterDose1 = Engine.calculateTodoInstances(
    baseInput({ today: Engine.addDays(dose1At, 28), completions: oneCompletion, todoDefinitions: [flu] })
  );
  assert.strictEqual(statusOf(afterDose1, "VX-FLU", "season-1-dose-2").status, "DUE");

  const twoCompletions = [
    ...oneCompletion,
    { todo_id: "VX-FLU", occurrenceKey: "season-1-dose-2", recordType: "TODO_COMPLETED", recordedAt: Engine.addDays(dose1At, 28) },
  ];
  const afterSeason1 = Engine.calculateTodoInstances(
    baseInput({ today: Engine.addMonths(birthDate, 18), completions: twoCompletions, todoDefinitions: [flu] })
  );
  const nextSeason = statusOf(afterSeason1, "VX-FLU", "season-2");
  assert.strictEqual(nextSeason.status, null);
  assert.strictEqual(nextSeason.needsPolicyConfirmation, true);
});

// 9. SF-03 AGE_WINDOW 복원
test("9) SF-03: milestone 없이 AGE_WINDOW(4,36)만으로 정상 계산됨", () => {
  const sf03 = findTodo("SF-03");
  assert.strictEqual(sf03.triggerType, "AGE_WINDOW");
  assert.strictEqual(sf03.triggerParams.startMonth, 4);
  assert.strictEqual(sf03.triggerParams.endMonth, 36);
  const r = Engine.calculateTodoInstances(baseInput({ today: Engine.addMonths(birthDate, 5), todoDefinitions: [sf03] }));
  assert.strictEqual(statusOf(r, "SF-03").status, "DUE");
});

// 10. CR-02 조건 미확인 상태
test("10) CR-02: exposureLevel=CONDITIONAL, needsReview 배지 true(미검증 유지)", () => {
  const cr02 = findTodo("CR-02");
  assert.strictEqual(cr02.exposureLevel, "CONDITIONAL");
  const r = Engine.calculateTodoInstances(baseInput({ today: Engine.addMonths(birthDate, 12.5), todoDefinitions: [cr02] }));
  const inst = statusOf(r, "CR-02");
  assert.strictEqual(inst.exposureLevel, "CONDITIONAL");
  assert.strictEqual(inst.needsReview, true);
});

console.log(`\n${passed}개 통과${process.exitCode ? ", 일부 실패" : ""}`);
