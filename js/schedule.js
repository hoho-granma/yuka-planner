// 한눈육아 통합 일정 엔진: 아이 정보(생년월일·거주지역)를 받아
// 검진·접종·성장발달·지원금 네 카테고리의 일정을 하나의 배열로 합친다.
// 완료 여부는 여기서 다루지 않는다 (app.js가 localStorage와 함께 처리).

const CATEGORY_META = {
  health: { label: "건강검진", color: "#3b82f6" },
  vaccine: { label: "예방접종", color: "#8b5cf6" },
  growth: { label: "성장·발달", color: "#22c55e" },
  subsidy: { label: "지원금·제도", color: "#f59e0b" },
};

function addMonths(date, months) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
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

function buildHealthEvents(birthDate, healthData) {
  return healthData.checkups.map((c) => ({
    id: c.id,
    category: "health",
    title: `영유아 건강검진 ${c.order}차`,
    date: addMonths(birthDate, c.minMonths),
    dateLabel: c.ageLabel,
    summary: c.items.join(" · ") + (c.hasDevelopmentCheck ? " · 발달선별검사(K-DST)" : "") + (c.hasOralCheck ? " · 구강검진" : ""),
    detail: c.prep,
    note: c.note || "",
    source: healthData._meta.sourceName,
    officialUrl: healthData._meta.officialUrl,
  }));
}

function buildVaccineEvents(birthDate, vaccineData) {
  const events = [];
  for (const v of vaccineData.vaccines) {
    v.doses.forEach((dose, idx) => {
      events.push({
        id: `${v.id}-${idx}`,
        category: "vaccine",
        title: `${v.name} ${dose.label}`,
        date: addMonths(birthDate, dose.ageMonths),
        dateLabel: `생후 ${dose.ageMonths}개월 무렵`,
        summary: v.note || "",
        detail: vaccineData._meta.disclaimer,
        source: vaccineData._meta.sourceName,
        officialUrl: vaccineData._meta.officialUrl,
      });
    });
  }
  return events;
}

function buildGrowthEvents(birthDate, growthData) {
  return growthData.bands.map((b) => ({
    id: b.id,
    category: "growth",
    title: `${b.title} 성장·발달 체크`,
    date: addMonths(birthDate, b.minMonths),
    dateLabel: `생후 ${b.minMonths}~${b.maxMonths}개월`,
    summary: b.checklist.slice(0, 3).join(" · "),
    detail: b,
    source: growthData._meta.sourceName,
    officialUrl: null,
  }));
}

function subsidyDeadlineText(s) {
  if (s.deadlineType === "birth_relative_days") return `출생 후 ${s.deadlineValue}일 이내 신청`;
  if (s.deadlineType === "birth_relative_months") return `출생 후 ${s.deadlineValue}개월 이내 신청`;
  if (s.deadlineType === "age_window") return `생후 ${s.deadlineValue.minMonths}~${s.deadlineValue.maxMonths}개월 사이 신청`;
  if (s.deadlineType === "ongoing") return "상시 신청 가능";
  return "신청 기한 확인 필요";
}

function buildSubsidyEvents(birthDate, province, district, subsidyData) {
  const events = [];
  for (const s of subsidyData.subsidies) {
    if (!regionMatches(s, province, district)) continue;

    const minA = s.minAgeMonths ?? 0;
    const maxA = s.maxAgeMonths ?? Infinity;
    const entryDate = addMonths(birthDate, minA);

    let deadlineDate = null;
    let anchorDate;
    if (s.deadlineType === "birth_relative_days") {
      deadlineDate = addDays(birthDate, s.deadlineValue);
      anchorDate = deadlineDate;
    } else if (s.deadlineType === "birth_relative_months") {
      deadlineDate = addMonths(birthDate, s.deadlineValue);
      anchorDate = deadlineDate;
    } else if (s.deadlineType === "age_window") {
      deadlineDate = addMonths(birthDate, s.deadlineValue.maxMonths);
      anchorDate = entryDate;
    } else {
      anchorDate = entryDate;
    }

    // 마감·연령조건이 있는 지원금은 "지금 신청 가능한지"가 캘린더의 어느 달에 있는지보다
    // 훨씬 중요하다 — 리스트 노출 판단은 app.js가 minAgeMonths/maxAgeMonths/deadlineDate로 직접 한다.
    events.push({
      id: s.id,
      category: "subsidy",
      title: s.name,
      date: anchorDate,
      dateLabel: subsidyDeadlineText(s),
      summary: s.amountText,
      detail: s,
      source: s.sourceName,
      officialUrl: s.officialUrl,
      needsCheck: s.status === "확인필요",
      minAgeMonths: minA,
      maxAgeMonths: maxA,
      entryDate,
      deadlineDate,
    });
  }
  return events;
}

function buildSchedule({ birthDate, province, district }, dataset) {
  const events = [
    ...buildHealthEvents(birthDate, dataset.health),
    ...buildVaccineEvents(birthDate, dataset.vaccine),
    ...buildGrowthEvents(birthDate, dataset.growth),
    ...buildSubsidyEvents(birthDate, province, district, dataset.subsidy),
  ];
  events.sort((a, b) => a.date.getTime() - b.date.getTime());
  return events;
}
