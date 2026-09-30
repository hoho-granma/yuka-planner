// 한눈육아 통합 일정 엔진.
// Phase 3부터는 건강검진·예방접종·성장발달(및 이유식/구강/수면/안전/생활/보육)을
// js/todo-engine.js + data/todos/*.json(카테고리별 파일, 총 75개 TodoDefinition) 기준으로
// 계산하고, 지자체(지역) 지원금은 data/subsidies/national.json + {시도}.json + {시도}-{시군구}.json
// (js/app.js loadSubsidyDataForRegion) 조합을 buildSubsidyEvents()로 처리한다.
// 완료 여부는 여기서 다루지 않는다 (app.js가 localStorage/Firestore와 함께 처리).

// 필터칩·달력 범례·체크리스트가 전부 이 6개 카테고리 하나로 통일된다(예전엔 필터칩이 4개,
// 달력 범례가 6개로 서로 달라 불일치했다). 키는 각 TodoDefinition의 categoryGroup 필드값과
// 정확히 같은 문자열이라야 한다(data/todos/_meta.json의 categoryGroupMap 참고).
// label은 필터칩 등 좁은 칩 안에 한 줄로 들어가야 해서 3글자 이하로 줄여서 표시한다.
// color는 6개가 서로 뚜렷이 구분되도록 색상환에서 고르게 떨어뜨렸다 — 예전엔 생활·수유(#eab308)와
// 행정·지원금(#f59e0b)이 둘 다 노랑·주황 계열로 너무 비슷해서(색상환상 8도 차이) 구분이 안 됐던
// 문제를, 행정·지원금을 핑크(빨강과 겹침) → 청록(초록·파랑과 겹침) 순으로 바꿨다가, 5개 색
// 전부 채도 높은 무지개색이라 6번째를 더해봤자 어딘가와는 겹쳐 보인다는 피드백을 받아
// 아예 색상환을 벗어난 무채색 계열(슬레이트 네이비)로 바꿨다 — 나머지 5개와 톤 자체가
// 달라서(채도 있는 색 vs 무채색) 절대 헷갈리지 않는다.
const CATEGORY_META = {
  "발달관찰": { label: "발달", color: "#22c55e" }, // 초록
  "예방접종": { label: "접종", color: "#3b82f6" }, // 파랑
  "영유아검진": { label: "검진", color: "#a855f7" }, // 보라
  "생활·수유": { label: "생활", color: "#eab308" }, // 노랑
  "안전·돌봄": { label: "안전", color: "#ef4444" }, // 빨강
  "행정·지원금": { label: "혜택", color: "#475569" }, // 슬레이트 네이비(무채색)
};

// TodoDefinition의 10개 세부 카테고리 코드 → 위 6개 그룹 중 하나. td.categoryGroup이 있으면
// 그걸 우선 쓰고(js/schedule.js buildTodoEngineEvents), 혹시 없는 예외적인 경우에만 이 표로 보정한다.
const ENGINE_CATEGORY_GROUP = {
  HC: "영유아검진", VX: "예방접종",
  DV: "발달관찰",
  FD: "생활·수유", OR: "생활·수유", SL: "생활·수유", LF: "생활·수유",
  SF: "안전·돌봄", CR: "생활·수유", // 어린이집·보육은 안전이 아니라 생활 영역
  SB: "행정·지원금",
};
const ENGINE_CATEGORY_LABEL = {
  HC: "건강검진", VX: "예방접종", DV: "성장발달", FD: "이유식·영양", OR: "구강",
  SL: "수면", SF: "안전", LF: "생활", CR: "보육", SB: "혜택·제도",
};
const ENGINE_STATUS_LABEL = {
  SCHEDULED: "예정",
  UPCOMING: "곧이에요",
  DUE: "지금 챙기세요",
  DONE: "완료",
  OVERDUE_CATCHUP: "기한이 지났어요 · 지금이라도 챙기세요",
  OVERDUE_FINAL: "이 시기는 지났어요",
  PENDING_MILESTONE: "아이가 이 모습을 보이면 체크해주세요",
};

// 달력 월 더하기. 대상 월에 같은 일자가 없으면 그 달 말일로 보정한다(1/31 + 1개월 = 2/28) — 계산은 js/date-calc.js.
// 항상 출생일 같은 원본 날짜에서 한 번에 계산해야 한다(결과를 다시 더하지 말 것).
//
// 월 수가 정수가 아닌 잘못된 데이터(docs/한눈육아-이슈기록.md I-4)는 DateCalc가 RangeError로 거부한다. 그 항목 하나 때문에
// 지역 전체 일정 계산이 중단되지 않도록 여기(앱 경계)에서만 잡아, 그 항목의 날짜를 Invalid Date로 남기고(수정 전에 월 수가
// undefined일 때와 같은 상태) console.warn으로 기록한다. 잘못된 값을 임의의 정상 날짜로 보정하지 않는다.
// label은 경고에 항목을 식별하려는 선택 인자(호출부는 생략해도 된다). 같은 경고는 한 번만 남긴다.
const ADD_MONTHS_WARNED = new Set();
function addMonths(date, months, label) {
  try {
    return DateCalc.addMonthsClamped(date, months);
  } catch (e) {
    if (!e || e.name !== "RangeError") throw e; // 잘못된 월 수·Date만 격리한다(그 밖의 오류는 그대로 드러낸다)
    const key = `${label || ""}|${String(months)}`;
    if (!ADD_MONTHS_WARNED.has(key)) {
      ADD_MONTHS_WARNED.add(key);
      console.warn(`[addMonths] 잘못된 월 값이라 날짜를 계산하지 않았어요(Invalid Date 처리): ${label ? label + " · " : ""}months=${JSON.stringify(months)}`);
    }
    return new Date(NaN);
  }
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function ageInMonths(birthDate, today) {
  let months = (today.getFullYear() - birthDate.getFullYear()) * 12 + (today.getMonth() - birthDate.getMonth());
  if (today.getDate() < birthDate.getDate()) months -= 1;
  return Math.max(0, months);
}

function regionMatches(subsidy, province, district) {
  const regions = subsidy.applicableRegions || [];
  if (regions.includes("ALL")) return true;
  if (regions.includes(`${province}:ALL`)) return true;
  if (regions.includes(`${province}:${district}`)) return true;
  return false;
}

// occurrenceKey를 사람이 읽을 라벨로 바꾼다(다회차 Todo가 전부 같은 제목으로 보이는 문제 방지).
function occurrenceLabel(occurrenceKey) {
  if (!occurrenceKey || occurrenceKey === "default") return "";
  let m = occurrenceKey.match(/^dose-(\d+)$/);
  if (m) return ` ${m[1]}차`;
  m = occurrenceKey.match(/^occ-(\d+)$/);
  if (m) return ` ${m[1]}회차`;
  m = occurrenceKey.match(/^season-(\d+)-dose-(\d+)$/);
  if (m) return ` (최초 시즌 ${m[2]}차)`;
  m = occurrenceKey.match(/^season-(\d+)$/);
  if (m) return ` (${m[1]}번째 시즌)`;
  return ` (${occurrenceKey})`;
}

const DATE_SPECIFIC_MAX_WIDTH_DAYS = 60; // 이보다 넓은 창은 "특정 날짜"가 아니라 "그 기간 내 확인할 일"로 다룬다

/**
 * windowStart~windowEnd 창이 좁으면(검진 예약일, 접종일처럼 실제로 날짜를 특정할 수 있는 것)
 * "특정 일자 일정"으로, 넓거나 열려있으면(수개월~수년짜리 안전수칙·지원금 수급기간, 마일스톤
 * 트리거형) "그때그때 확인할 일"로 구분한다 — 사용자 피드백: "뒤집기 시작후 낙상예방"처럼
 * 월령/모습이 보이면 하는 일을 9/28 같은 특정 날짜에 박아넣는 게 오히려 혼란스러웠다.
 */
function computeIsDateSpecific(inst) {
  if (inst.status === "PENDING_MILESTONE") return false;
  if (!inst.windowStart || !inst.windowEnd) return false;
  const widthDays = (inst.windowEnd.getTime() - inst.windowStart.getTime()) / (24 * 60 * 60 * 1000);
  return widthDays <= DATE_SPECIFIC_MAX_WIDTH_DAYS;
}

/**
 * TodoEngine(js/todo-engine.js) + 73개 TodoDefinition으로 HC/VX/DV/FD/OR/SL/SF/LF/CR(전국공통 SB 포함)
 * 이벤트를 만든다. REFERENCE(OR-02, SB-10 — 지자체지원금은 아래 buildSubsidyEvents가 대신 처리)와
 * status가 null인 항목(eligibility 미확인, 독감 2번째 시즌 이후처럼 정책 미확정인 것)은
 * "확정된 일정"으로 잘못 보여주지 않기 위해 캘린더/리스트에서 아예 제외한다.
 *
 * windowStart가 null인 경우도 두 가지로 다르다: PENDING_MILESTONE(마일스톤 보고 대기)은
 * "지금 확인해요" 목록에 계속 떠 있는 게 맞는 항목이라 표시하고, 그 외(RELATIVE_TO_EVENT인데
 * 직전 회차가 아직 완료 안 돼 날짜를 계산할 수 없는 경우, 예: 일본뇌염 2·3차)는 지금 보여줄
 * 날짜 자체가 없는 것이므로 아예 숨긴다(직전 회차가 완료되면 자동으로 나타난다).
 */
function buildTodoEngineEvents(profile, todoDefinitions, completions) {
  if (typeof TodoEngine === "undefined" || !todoDefinitions || !todoDefinitions.length) return [];
  const instances = TodoEngine.calculateTodoInstances({
    today: new Date(),
    child: { birthDate: profile.birthDate, gender: profile.gender },
    region: { province: profile.province, district: profile.district },
    familyDeclaredAttributes: {},
    completions: completions || [],
    todoDefinitions,
  });
  const byId = new Map(todoDefinitions.map((t) => [t.todo_id, t]));
  const events = [];
  for (const inst of instances) {
    if (inst.status === "REFERENCE" || inst.status === null) continue;
    // 지원금 할일도 '확인완료'만 노출(verificationStatus가 정확히 '확인필요'인 항목은 숨김).
    if (byId.get(inst.todo_id) && byId.get(inst.todo_id).verificationStatus === "확인필요") continue;
    if (inst.windowStart === null && inst.status !== "PENDING_MILESTONE") continue; // 아직 계산 불가(선행 회차 대기)
    const td = byId.get(inst.todo_id);
    const isDateSpecific = computeIsDateSpecific(inst);
    const reviewTag = inst.needsReview ? "⚠️ 확인 필요 · " : "";
    const isSubsidyEvt = ((td && td.categoryGroup) || ENGINE_CATEGORY_GROUP[inst.category]) === "행정·지원금";
    events.push({
      id: `${inst.todo_id}__${inst.occurrenceKey}`,
      category: (td && td.categoryGroup) || ENGINE_CATEGORY_GROUP[inst.category] || "생활·수유",
      subcategoryLabel: ENGINE_CATEGORY_LABEL[inst.category] || inst.category,
      title: reviewTag + inst.title + occurrenceLabel(inst.occurrenceKey),
      date: inst.windowStart || new Date(),
      dateLabel: ENGINE_STATUS_LABEL[inst.status] || inst.status,
      isDateSpecific,
      // 일정 3유형(js/hn-logic.js): 기간이 좁으면 window(권장 기간), 넓거나 열려 있으면 monthly(월령별 체크).
      // 엔진 계산 결과에는 "확정 예정일"이 없으므로 fixed는 여기서 만들지 않는다.
      scheduleKind: isSubsidyEvt && inst.windowStart ? "fixed" : isDateSpecific ? "window" : "monthly",
      fixedDate: isSubsidyEvt && inst.windowStart ? inst.windowStart : null,
      windowStart: inst.windowStart || null,
      windowEnd: inst.windowEnd || null,
      summary: td ? (td.cardSummary || td.parentAction) : "",
      detail: { instance: inst, definition: td },
      source: td ? td.source : "",
      officialUrl: null,
      isEngineEvent: true,
      engineStatus: inst.status,
    });
  }
  return events;
}

function subsidyDeadlineText(s) {
  if (s.deadlineType === "birth_relative_days") return `출생 후 ${s.deadlineValue}일 이내 신청`;
  if (s.deadlineType === "birth_relative_months") return `출생 후 ${s.deadlineValue}개월 이내 신청`;
  if (s.deadlineType === "age_window") return `생후 ${s.deadlineValue.minMonths}~${s.deadlineValue.maxMonths}개월 사이 신청`;
  if (s.deadlineType === "ongoing") return "상시 신청 가능";
  return "신청 기한은 관할 기관 안내를 따라요";
}

// data/subsidies/national.json에는 원래 "전국공통(ALL)"으로 표시된 항목도 몇 개 섞여 있는데,
// 그중 아래 3개는 이제 data/subsidies/national-todos.json의 SB-01/02/04로 새 엔진이 계산한다.
// (NAT-005 기저귀·조제분유는 SB-05가 '확인필요'라 화면에 안 나오므로 여기서 제외하지 않고 지역 지원금 경로로 보여준다)
// 두 경로가 같은 제도를 각자 다른 문구로 중복 표시하는 걸 막기 위해 여기서 제외한다.
// (NAT-004 산모·신생아 건강관리처럼 아직 엔진에 없는 항목은 그대로 지역 지원금 경로로 유지)
const SUBSIDIES_SUPERSEDED_BY_ENGINE = ["NAT-001", "NAT-002", "NAT-003"];

// 제도 개편 전/후 분기 — s.birthOnOrAfter / s.birthBefore(YYYY-MM-DD)가 있으면 생년월일이 범위 안일 때만 보여준다.
function birthRuleAllows(s, birthDate) {
  if (!s.birthOnOrAfter && !s.birthBefore) return true;
  const b = `${birthDate.getFullYear()}-${String(birthDate.getMonth() + 1).padStart(2, "0")}-${String(birthDate.getDate()).padStart(2, "0")}`;
  if (s.birthOnOrAfter && b < s.birthOnOrAfter) return false;
  if (s.birthBefore && b >= s.birthBefore) return false;
  return true;
}

function buildSubsidyEvents(birthDate, province, district, subsidyData, birthOrder, stage) {
  const events = [];
  for (const s of subsidyData.subsidies) {
    if (SUBSIDIES_SUPERSEDED_BY_ENGINE.includes(s.id)) continue;
    // 화면에는 '확인완료'만 보여준다 — '확인필요'(미확인·정부안 등)는 데이터에만 두고 노출하지 않는다.
    if (s.status !== "확인완료") continue;
    if (!birthRuleAllows(s, birthDate)) continue;
    if (!regionMatches(s, province, district)) continue;
    // amountByBirthOrder에 0으로 표시된 순위(예: GURO-001은 첫째·둘째=0, 셋째 이상만 지원)는
    // 이 가정에 해당하지 않는 제도라 캘린더에서 아예 뺀다. birthOrder 미입력(구버전 프로필 등)이면
    // 자격을 임의로 판단하지 않고 그대로 보여준다.
    // 출산 전(임신 중)에만 신청하는 제도는 출생일 기준 캘린더에 맞지 않아 뺀다.
    if (s.prenatalOnly && stage !== "pregnant") continue;
    // 구별 파일마다 넷째 이상 키가 fourthPlus 또는 fourth/fifthPlus로 다르다 — 앱의 fourthPlus는 fourth로도 조회한다.
    const orderAmount = s.amountByBirthOrder
      ? s.amountByBirthOrder[birthOrder] ?? (birthOrder === "fourthPlus" ? s.amountByBirthOrder.fourth : undefined)
      : undefined;
    if (birthOrder && orderAmount === 0) continue;

    const minA = s.minAgeMonths ?? 0;
    const maxA = s.maxAgeMonths ?? Infinity;
    const entryDate = addMonths(birthDate, minA, s.id);

    let deadlineDate = null;
    let anchorDate;
    if (s.deadlineType === "birth_relative_days") {
      deadlineDate = addDays(birthDate, s.deadlineValue);
      anchorDate = deadlineDate;
    } else if (s.deadlineType === "birth_relative_months") {
      deadlineDate = addMonths(birthDate, s.deadlineValue, s.id);
      anchorDate = deadlineDate;
    } else if (s.deadlineType === "age_window") {
      deadlineDate = addMonths(birthDate, s.deadlineValue.maxMonths, s.id);
      anchorDate = entryDate;
    } else {
      anchorDate = entryDate;
    }

    // 임신 중 제도는 periods(출산예정일 기준 상대 일수)로 앵커/마감 날짜를 잡는다.
    if (stage === "pregnant" && Array.isArray(s.periods) && s.periods.length) {
      const starts = s.periods.map((r) => r.startDays).filter((v) => v != null);
      const ends = s.periods.map((r) => r.endDays).filter((v) => v != null);
      if (starts.length) anchorDate = addDays(birthDate, Math.min(...starts));
      if (ends.length) deadlineDate = addDays(birthDate, Math.max(...ends));
    }

    // 마감·연령조건이 있는 지원금은 "지금 신청 가능한지"가 캘린더의 어느 달에 있는지보다
    // 훨씬 중요하다 — 리스트 노출 판단은 app.js가 minAgeMonths/maxAgeMonths/deadlineDate로 직접 한다.
    events.push({
      id: s.id,
      category: "행정·지원금",
      subcategoryLabel: "혜택·제도",
      title: s.name,
      date: anchorDate,
      dateLabel: subsidyDeadlineText(s),
      summary: s.amountText,
      detail: s,
      source: s.sourceName,
      officialUrl: s.officialUrl,
      needsCheck: s.status === "확인필요" || !!s.proposed,
      minAgeMonths: minA,
      maxAgeMonths: maxA,
      entryDate,
      deadlineDate,
      periods: s.periods || null,
      isPrenatalOnly: !!s.prenatalOnly,
      isLegacySubsidy: true, // 지자체(지역) 지원금 — 기존 subsidyIsActiveNow() 특수 로직을 그대로 쓴다
      // 지원금은 신청 시작일(entryDate)에 표시한다. 신청 기간(시작~마감)은 카드·상세에 함께 보여준다.
      scheduleKind: "fixed",
      fixedDate: entryDate,
      isDateSpecific: true, // 상세보기에 실제 날짜(entryDate/deadlineDate)를 보여줄지 여부(달력 배치와는 무관, js/app.js eventItemHtml 참고)
    });
  }
  return events;
}

function buildSchedule({ birthDate, province, district, gender, birthOrder, stage }, dataset, completions) {
  const events = [
    ...buildTodoEngineEvents({ birthDate, province, district, gender }, dataset.todoDefinitions, completions),
    ...buildSubsidyEvents(birthDate, province, district, dataset.subsidy, birthOrder, stage),
  ];
  events.sort((a, b) => a.date.getTime() - b.date.getTime());
  return events;
}
