(function () {
  const PROFILE_KEY = "yukjigi_profile";
  const COMPLETED_KEY = "yukjigi_completed";
  const ACTIVE_CATS_KEY = "yukjigi_active_cats";

  const el = (id) => document.getElementById(id);

  let dataset = null;
  let regionsData = null;
  let schedule = [];
  let profile = null;
  let completed = {};
  let familyCode = null;
  let unsubscribeFamily = null;
  let activeCats = new Set(Object.keys(CATEGORY_META));
  let viewMonth = new Date();
  viewMonth.setDate(1);
  let currentDayContext = null; // { events, date } — 날짜 클릭으로 연 일정 여러 개 목록
  let modalMode = null; // "day-list" | "detail" | "profile"
  let currentTab = "calendar"; // "calendar" | "checklist" | "record"
  let openMonthGroups = null; // 전체 체크리스트의 월령별 아코디언 펼침 상태(Set<월령>). null=아직 초기화 전(기본은 현재 월령만 펼침)
  let selectedCalendarDate = new Date(); // 달력 탭에서 선택된 날짜(기본값: 오늘)
  let calendarDisplayDayMap = new Map(); // 이번에 그려진 달의 todo_id__occ → "달력에 표시할 날짜"(분산배치 결과)

  // e.category는 이제 필터칩·체크리스트와 동일한 6개 카테고리(CATEGORY_META) 문자열이라,
  // 달력 전용으로 따로 매핑표를 둘 필요 없이 그대로 조회하면 된다.
  function calGroupFor(e) {
    return CATEGORY_META[e.category] || { label: e.category || "기타", color: "#9ca3af" };
  }
  function isImportantEvent(e) {
    const pr = e.isEngineEvent && e.detail.definition ? e.detail.definition.priority : 2;
    return pr <= 2;
  }

  async function loadJson(path) {
    const res = await fetch(path);
    return res.json();
  }

  async function loadAll() {
    const [regions, subsidy, todoDefsFile] = await Promise.all([
      loadJson("data/regions.json"),
      loadJson("data/subsidies.json"),
      loadJson("data/todo-definitions.v3.json"),
    ]);
    regionsData = regions;
    // 건강검진·예방접종·성장발달(및 이유식/구강/수면/안전/생활/보육)은 이제
    // data/todo-definitions.v3.json(75개 TodoDefinition) + js/todo-engine.js로 계산한다.
    // 지자체 지원금만 기존 subsidies.json 로직을 그대로 쓴다(js/schedule.js buildSubsidyEvents).
    dataset = { subsidy, todoDefinitions: todoDefsFile.todos };
  }

  /**
   * completed(로컬 저장 맵)를 TodoEngine이 요구하는 CompletionRecord 배열로 변환한다.
   * 예전 버전에서 만들어진 완료기록(값이 그냥 true, 키도 예전 일정id)은 새 엔진의
   * todo_id와 매칭되지 않아 여기서 걸러진다 — 이건 알려진 비호환(보고 완료, docs/Firestore-마이그레이션-계획.md
   * 참고)이라 임의로 변환하지 않는다.
   */
  function completionsForEngine() {
    return Object.values(completed)
      .filter((v) => v && typeof v === "object" && v.todo_id)
      .map((v) => ({
        todo_id: v.todo_id,
        occurrenceKey: v.occurrenceKey || "default",
        recordType: v.recordType || "TODO_COMPLETED",
        recordedAt: new Date(v.recordedAt),
      }));
  }

  function loadProfile() {
    try {
      const raw = localStorage.getItem(PROFILE_KEY);
      if (!raw) return null;
      const p = JSON.parse(raw);
      return { ...p, birthDate: new Date(p.birthDate) };
    } catch (e) {
      return null;
    }
  }

  function saveProfile(p) {
    localStorage.setItem(PROFILE_KEY, JSON.stringify({ ...p, birthDate: p.birthDate.toISOString() }));
  }

  function loadCompleted() {
    try {
      return JSON.parse(localStorage.getItem(COMPLETED_KEY)) || {};
    } catch (e) {
      return {};
    }
  }

  function saveCompleted() {
    localStorage.setItem(COMPLETED_KEY, JSON.stringify(completed));
  }

  function profileToPlain(p) {
    return {
      name: p.name || "",
      birthDate: toISODate(p.birthDate),
      province: p.province,
      district: p.district,
    };
  }

  function profileFromPlain(p) {
    return {
      name: p.name || "",
      birthDate: new Date(p.birthDate + "T00:00:00"),
      province: p.province,
      district: p.district,
    };
  }

  function childDisplayName() {
    return (profile && profile.name) || "우리 아이";
  }

  function updateBrandText() {
    const brandEl = el("brand-text");
    if (!brandEl) return;
    brandEl.textContent = "한눈육아";
  }

  function startListeningFamily() {
    if (unsubscribeFamily) unsubscribeFamily();
    unsubscribeFamily = FamilySync.listen(familyCode, (data) => {
      if (!data || !data.profile) return;
      profile = profileFromPlain(data.profile);
      completed = data.completed || {};
      saveProfile(profile);
      saveCompleted();
      if (!el("view-calendar").classList.contains("hidden")) {
        buildAndRender();
      }
    });
  }

  async function ensureFamilyCode() {
    if (familyCode) {
      try {
        await FamilySync.updateProfile(familyCode, profileToPlain(profile));
      } catch (e) {
        console.error(e);
      }
      return;
    }
    try {
      familyCode = await FamilySync.createFamily(profileToPlain(profile), completed);
      startListeningFamily();
      renderProfileHeader();
    } catch (e) {
      console.error("가족코드 생성 실패", e);
    }
  }

  function populateProvinces() {
    const provinceSelect = el("province");
    for (const p of regionsData.provinces) {
      const opt = document.createElement("option");
      opt.value = p.code;
      opt.textContent = p.name;
      provinceSelect.appendChild(opt);
    }
  }

  function populateDistricts(provinceCode, selected) {
    const districtSelect = el("district");
    districtSelect.innerHTML = "";
    const province = regionsData.provinces.find((p) => p.code === provinceCode);
    if (!province) {
      districtSelect.disabled = true;
      return;
    }
    districtSelect.disabled = false;
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.disabled = true;
    placeholder.selected = !selected;
    placeholder.textContent = "선택해주세요";
    districtSelect.appendChild(placeholder);
    for (const d of province.districts) {
      const opt = document.createElement("option");
      opt.value = d;
      opt.textContent = d;
      if (d === selected) opt.selected = true;
      districtSelect.appendChild(opt);
    }
  }

  function formatDateKR(date) {
    return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일`;
  }

  function toISODate(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  let dpViewDate = new Date();
  dpViewDate.setDate(1);
  let dpSelectedDate = null;

  function setBirthDatePicker(date) {
    dpSelectedDate = date;
    dpViewDate = new Date(date.getFullYear(), date.getMonth(), 1);
    el("birthDate").value = toISODate(date);
    const display = el("birthDateDisplay");
    display.textContent = formatDateKR(date);
    display.classList.remove("placeholder");
  }

  function resetBirthDatePicker() {
    dpSelectedDate = null;
    el("birthDate").value = "";
    const display = el("birthDateDisplay");
    display.textContent = "날짜를 선택해주세요";
    display.classList.add("placeholder");
  }

  function dpPopulateYearMonth() {
    const yearSelect = el("dp-year");
    const monthSelect = el("dp-month");
    yearSelect.innerHTML = "";
    const thisYear = new Date().getFullYear();
    for (let y = thisYear; y >= thisYear - 8; y--) {
      const opt = document.createElement("option");
      opt.value = y;
      opt.textContent = `${y}년`;
      yearSelect.appendChild(opt);
    }
    monthSelect.innerHTML = "";
    for (let m = 1; m <= 12; m++) {
      const opt = document.createElement("option");
      opt.value = m - 1;
      opt.textContent = `${m}월`;
      monthSelect.appendChild(opt);
    }
  }

  function dpSyncSelects() {
    el("dp-year").value = dpViewDate.getFullYear();
    el("dp-month").value = dpViewDate.getMonth();
  }

  function dpRenderGrid() {
    const year = dpViewDate.getFullYear();
    const month = dpViewDate.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const grid = el("dp-grid");
    grid.innerHTML = "";
    for (let i = 0; i < firstDay; i++) {
      const cell = document.createElement("span");
      cell.className = "dp-cell dp-empty";
      grid.appendChild(cell);
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month, d);
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "dp-cell dp-day";
      cell.textContent = d;
      if (date > today) {
        cell.disabled = true;
        cell.classList.add("dp-disabled");
      }
      if (dpSelectedDate && sameDay(date, dpSelectedDate)) cell.classList.add("dp-selected");
      cell.addEventListener("click", () => {
        setBirthDatePicker(date);
        dpClosePopup();
      });
      grid.appendChild(cell);
    }
  }

  function dpOpenPopup() {
    dpPopulateYearMonth();
    dpSyncSelects();
    dpRenderGrid();
    el("birthDatePopup").classList.remove("hidden");
  }

  function dpClosePopup() {
    el("birthDatePopup").classList.add("hidden");
  }

  function initBirthDatePicker() {
    el("birthDateBtn").addEventListener("click", (ev) => {
      ev.stopPropagation();
      if (el("birthDatePopup").classList.contains("hidden")) dpOpenPopup();
      else dpClosePopup();
    });
    document.addEventListener("click", (ev) => {
      const popup = el("birthDatePopup");
      if (!popup.classList.contains("hidden") && !popup.contains(ev.target) && ev.target !== el("birthDateBtn")) {
        dpClosePopup();
      }
    });
    el("dp-prev-month").addEventListener("click", () => {
      dpViewDate.setMonth(dpViewDate.getMonth() - 1);
      dpSyncSelects();
      dpRenderGrid();
    });
    el("dp-next-month").addEventListener("click", () => {
      dpViewDate.setMonth(dpViewDate.getMonth() + 1);
      dpSyncSelects();
      dpRenderGrid();
    });
    el("dp-prev-year").addEventListener("click", () => {
      dpViewDate.setFullYear(dpViewDate.getFullYear() - 1);
      dpSyncSelects();
      dpRenderGrid();
    });
    el("dp-next-year").addEventListener("click", () => {
      dpViewDate.setFullYear(dpViewDate.getFullYear() + 1);
      dpSyncSelects();
      dpRenderGrid();
    });
    el("dp-year").addEventListener("change", (ev) => {
      dpViewDate.setFullYear(Number(ev.target.value));
      dpRenderGrid();
    });
    el("dp-month").addEventListener("change", (ev) => {
      dpViewDate.setMonth(Number(ev.target.value));
      dpRenderGrid();
    });
  }

  function renderFilterChips() {
    ["filter-chips", "filter-chips-checklist"].forEach(renderFilterChipsInto);
  }

  function renderFilterChipsInto(containerId) {
    const wrap = el(containerId);
    if (!wrap) return;
    wrap.innerHTML = Object.entries(CATEGORY_META)
      .map(
        ([key, meta]) => `
        <button class="chip ${activeCats.has(key) ? "active" : ""}" data-cat="${key}"
          style="${activeCats.has(key) ? `background:${meta.color};` : ""}">
          <span class="dot" style="background:${activeCats.has(key) ? "#fff" : meta.color}"></span>${meta.label}
        </button>`
      )
      .join("");
    wrap.querySelectorAll(".chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        const cat = chip.getAttribute("data-cat");
        if (activeCats.has(cat)) activeCats.delete(cat);
        else activeCats.add(cat);
        localStorage.setItem(ACTIVE_CATS_KEY, JSON.stringify([...activeCats]));
        renderFilterChips();
        renderAll();
      });
    });
  }

  // 서비스 범위는 생후 0~36개월이다 — 지원금처럼 36개월 이후까지 수급기간이 이어지는 항목도
  // "언제부터 챙겨야 하는지"(e.date 기준 월령)가 36개월 이내면 보여주고, 그 이후에 처음
  // 시작되는 항목만 걸러낸다.
  function visibleSchedule() {
    return schedule.filter((e) => activeCats.has(e.category) && ageInMonths(profile.birthDate, e.date) <= 36);
  }

  function sameDay(a, b) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }

  function renderProfileHeader() {
    updateBrandText();
    const today = new Date();
    const ageNow = ageInMonths(profile.birthDate, today);
    el("profile-name-age").textContent = `${childDisplayName()} · 생후 ${ageNow}개월`;
    el("profile-location-text").textContent = `${profile.province} ${profile.district}`;
  }

  /** 프로필 카드를 탭하면 뜨는 바텀시트 — 상세정보 + 가족코드 복사 + 정보 다시 입력. */
  function showProfileSheet() {
    modalMode = "profile";
    const today = new Date();
    const ageNow = ageInMonths(profile.birthDate, today);
    el("modal-content").innerHTML = `
      <h3>${childDisplayName()}</h3>
      <div class="detail-row"><div class="label">생년월일</div>${formatDateKR(profile.birthDate)} · 생후 ${ageNow}개월</div>
      <div class="detail-row"><div class="label">거주 지역</div>${profile.province} ${profile.district}</div>
      ${
        familyCode
          ? `<div class="detail-row">
               <div class="label">가족코드</div>
               <button id="btn-copy-code" class="btn-code-pill">${familyCode} · 복사하기</button>
               <p id="code-hint" class="fine-print hidden code-hint-oneline">복사됐어요! 다른 기기에 입력하면 정보가 이어져요.</p>
             </div>`
          : ""
      }
      <button class="btn-close" id="btn-open-reset">아이 정보 다시 입력하기</button>
      <button class="btn-close" id="btn-close-modal">닫기</button>
    `;
    el("detail-modal").classList.remove("hidden");
    el("btn-close-modal").addEventListener("click", closeDetail);
    el("btn-open-reset").addEventListener("click", () => {
      closeDetail();
      handleReset();
    });
    const copyBtn = el("btn-copy-code");
    if (copyBtn) {
      copyBtn.addEventListener("click", async (ev) => {
        ev.stopPropagation();
        const hint = el("code-hint");
        try {
          await navigator.clipboard.writeText(familyCode);
        } catch (e) {}
        hint.classList.remove("hidden");
        clearTimeout(copyBtn._hideTimer);
        copyBtn._hideTimer = setTimeout(() => hint.classList.add("hidden"), 4000);
      });
    }
  }

  function renderCalLegend() {
    el("cal-legend").innerHTML = Object.values(CATEGORY_META)
      .map((g) => `<span class="cal-legend-item"><span class="dot" style="background:${g.color}"></span>${g.label}</span>`)
      .join("");
  }

  /** 진행현황 카드 — "달력에 보이는 달" 기준(오늘 탭의 상태 기반 집계와는 다른, 순수 날짜 집계). */
  function renderCalendarProgress() {
    const year = viewMonth.getFullYear();
    const month = viewMonth.getMonth();
    const monthDated = visibleSchedule().filter(
      (e) => e.isDateSpecific && e.date.getFullYear() === year && e.date.getMonth() === month
    );
    const total = monthDated.length;
    const done = monthDated.filter((e) => completed[e.id]).length;
    const remain = total - done;
    const percent = total ? Math.round((done / total) * 100) : 0;
    el("cal-progress-summary").textContent = `${month + 1}월 총 ${total}개 중 ${done}개 완료 (남은 할 일 ${remain}개)`;
    el("cal-progress-bar-fill").style.width = `${percent}%`;
    el("cal-progress-bar-label").textContent = total ? `${percent}%` : "";
  }

  /**
   * 같은 달 안에서 여러 Todo의 windowStart가 우연히 같은 날로 겹칠 때(회차가 다른 접종·검진이
   * 비슷한 월령에 몰려 있는 경우가 실제로 많다), 전부 하루에 쌓아 보여주지 않고 각 항목이
   * 실제로 유효한 기간(windowStart~windowEnd) 안에서 가장 한산한 날로 옮겨 분산시킨다.
   * "지금 챙기세요/기한이 지났어요" 같은 상태 텍스트나 상세보기의 실제 날짜는 바뀌지 않고,
   * 오직 달력 칸에 점을 찍는 위치만 그 항목의 정당한 기간 안에서 조정된다.
   */
  function computeDisplayDayMap(year, month, monthEvents) {
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const usage = new Array(daysInMonth + 1).fill(0);
    const map = new Map();
    const withRange = monthEvents.map((e) => {
      const startDay = e.date.getDate();
      let endDay = startDay;
      const inst = e.isEngineEvent ? e.detail.instance : null;
      const we = inst && inst.windowEnd;
      if (we) {
        if (we.getFullYear() > year || (we.getFullYear() === year && we.getMonth() > month)) {
          endDay = daysInMonth; // 창이 이번 달을 넘어가면 월말까지는 자유롭게 옮길 수 있다
        } else if (we.getFullYear() === year && we.getMonth() === month && we.getDate() > startDay) {
          endDay = we.getDate();
        }
      }
      return { e, startDay, endDay };
    });
    // 원래 날짜가 이른 항목부터 먼저 자리를 잡아야 뒤에 오는 항목이 자연스럽게 빈 날로 밀려난다.
    withRange.sort((a, b) => a.startDay - b.startDay || a.e.id.localeCompare(b.e.id));
    withRange.forEach(({ e, startDay, endDay }) => {
      let bestDay = startDay;
      let bestUsage = usage[startDay];
      for (let d = startDay + 1; d <= endDay; d++) {
        if (usage[d] < bestUsage) {
          bestUsage = usage[d];
          bestDay = d;
        }
      }
      usage[bestDay] += 1;
      map.set(e.id, bestDay);
    });
    return map;
  }

  function renderCalendar() {
    const year = viewMonth.getFullYear();
    const month = viewMonth.getMonth();
    el("calendar-title").textContent = `${year}년 ${month + 1}월`;
    renderCalLegend();
    renderCalendarProgress();

    const firstDay = new Date(year, month, 1);
    const startOffset = firstDay.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = new Date();

    // 특정 날짜가 없는 항목(마일스톤 대기, 몇 달~몇 년씩 이어지는 안전수칙·지원금 등)은
    // 달력 칸에 우연히 걸린 날짜로 표시하지 않는다 — "오늘" 탭의 확인해요 그룹에서만 보여준다.
    const events = visibleSchedule().filter((e) => e.isDateSpecific);
    const monthEvents = events.filter((e) => e.date.getFullYear() === year && e.date.getMonth() === month);
    calendarDisplayDayMap = computeDisplayDayMap(year, month, monthEvents);
    const grid = el("calendar-grid");
    grid.innerHTML = "";

    for (let i = 0; i < startOffset; i++) {
      const cell = document.createElement("div");
      cell.className = "day-cell other-month";
      grid.appendChild(cell);
    }

    const MAX_MARKERS = 3;
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      const dayEvents = monthEvents
        .filter((e) => calendarDisplayDayMap.get(e.id) === day)
        .slice()
        .sort((a, b) => (isImportantEvent(b) ? 1 : 0) - (isImportantEvent(a) ? 1 : 0));
      const cell = document.createElement("div");
      cell.className =
        "day-cell" +
        (sameDay(date, today) ? " today" : "") +
        (sameDay(date, selectedCalendarDate) ? " selected" : "") +
        (dayEvents.length ? " has-event" : "");

      const shown = dayEvents.slice(0, MAX_MARKERS);
      const overflow = dayEvents.length - shown.length;
      // 미완료: 카테고리색 단색 도트. 완료(중요도 높음): 카테고리색 원 + 흰 체크. 완료(그외): 연회색 체크.
      const markerHtml = shown
        .map((e) => {
          const g = calGroupFor(e);
          const done = !!completed[e.id];
          if (done && isImportantEvent(e)) return `<span class="cal-marker done-strong" style="background:${g.color}">✓</span>`;
          if (done) return `<span class="cal-marker done-soft">✓</span>`;
          return `<span class="cal-marker todo" style="background:${g.color}"></span>`;
        })
        .join("");
      const moreHtml = overflow > 0 ? `<span class="cal-marker-more">+${overflow}</span>` : "";
      cell.innerHTML = `<span class="num">${day}</span><span class="markers">${markerHtml}${moreHtml}</span>`;
      cell.addEventListener("click", () => {
        selectedCalendarDate = date;
        renderCalendar();
        renderSelectedDayPanel();
      });
      grid.appendChild(cell);
    }
  }

  function renderSelectedDayPanel() {
    const date = selectedCalendarDate;
    // 달력 칸의 마커는 분산배치된 위치에 찍히므로, 선택한 날짜의 목록도 실제 날짜(sameDay)가
    // 아니라 같은 분산배치 결과(calendarDisplayDayMap)를 기준으로 골라야 마커와 목록이 맞는다.
    const events = visibleSchedule()
      .filter(
        (e) =>
          e.isDateSpecific &&
          e.date.getFullYear() === date.getFullYear() &&
          e.date.getMonth() === date.getMonth() &&
          calendarDisplayDayMap.get(e.id) === date.getDate()
      )
      .sort((a, b) => (isImportantEvent(b) ? 1 : 0) - (isImportantEvent(a) ? 1 : 0));
    const today = new Date();
    const dowNames = ["일", "월", "화", "수", "목", "금", "토"];
    const d0 = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const diffDays = Math.round((d0 - t0) / (24 * 60 * 60 * 1000));
    const ddayText = diffDays === 0 ? "오늘" : diffDays > 0 ? `D-${diffDays}` : `D+${Math.abs(diffDays)}`;
    el("selected-day-title").textContent = `📌 ${date.getMonth() + 1}월 ${date.getDate()}일 (${dowNames[date.getDay()]}) · ${ddayText}`;
    el("selected-day-list").innerHTML = events.map(eventItemHtml).join("");
    el("selected-day-empty").classList.toggle("hidden", events.length > 0);
  }

  function remainingItemHtml(e) {
    const g = calGroupFor(e);
    const title = e.title.replace(/^⚠️ 확인 필요 · /, "");
    return `<button type="button" class="remaining-item" data-id="${e.id}"><span class="dot" style="background:${g.color}"></span>${title}</button>`;
  }

  function renderRemainingList() {
    const year = viewMonth.getFullYear();
    const month = viewMonth.getMonth();
    const items = visibleSchedule().filter(
      (e) => e.isDateSpecific && e.date.getFullYear() === year && e.date.getMonth() === month && !completed[e.id]
    );
    el("remaining-grid").innerHTML = items.map(remainingItemHtml).join("");
    el("remaining-empty").classList.toggle("hidden", items.length > 0);
  }

  function subsidyIsActiveNow(e, ageNow, today) {
    const ageOk = ageNow >= e.minAgeMonths && ageNow <= e.maxAgeMonths;
    let notExpired = true;
    if (e.deadlineDate) {
      const deadlineEnd = new Date(
        e.deadlineDate.getFullYear(),
        e.deadlineDate.getMonth(),
        e.deadlineDate.getDate(),
        23, 59, 59, 999
      );
      notExpired = today <= deadlineEnd;
    }
    return ageOk && notExpired;
  }

  function eventItemHtml(e) {
    const isDone = !!completed[e.id];
    // 특정 날짜가 없는 항목(마일스톤 대기, 몇 달~몇 년짜리 안전수칙·지원금)은 날짜를 보여주지
    // 않는다 — 우연히 시작된 날짜를 "이 날 할 일"처럼 보여주는 게 오히려 혼란스러웠다.
    let dateLine = e.isDateSpecific === false ? `${e.subcategoryLabel || ""} · ${e.dateLabel}` : `${formatDateKR(e.date)} · ${e.dateLabel}`;
    if (e.isLegacySubsidy) {
      const today = new Date();
      const ageNow = ageInMonths(profile.birthDate, today);
      if (subsidyIsActiveNow(e, ageNow, today)) {
        dateLine = e.deadlineDate ? `지금 신청 가능 · ${formatDateKR(e.deadlineDate)}까지` : "지금 신청 가능";
      } else if (today < e.entryDate) {
        dateLine = `${formatDateKR(e.entryDate)}부터 신청 가능`;
      } else {
        dateLine = `신청 기한 지남 · ${e.dateLabel}`;
      }
    }
    return `
      <div class="event-item ${isDone ? "completed" : ""}" data-id="${e.id}">
        <span class="cat-dot" style="background:${CATEGORY_META[e.category].color}"></span>
        <div class="body">
          <p class="title">${e.title}</p>
          <p class="date-label">${dateLine}</p>
          <p class="summary">${e.summary || ""}</p>
        </div>
        <span class="check ${isDone ? "checked" : ""}" data-check-id="${e.id}">${isDone ? "✓" : ""}</span>
      </div>
    `;
  }

  /** 처음 체크리스트 탭을 그릴 때 한 번만 "현재 월령" 그룹을 펼친 상태로 초기화한다. */
  function ensureOpenMonthGroupsInit() {
    if (openMonthGroups === null) {
      openMonthGroups = new Set([Math.max(0, ageInMonths(profile.birthDate, new Date()))]);
    }
  }

  const NEED_CHECK_GROUP = "NEED_CHECK";

  /**
   * 다회차 Todo(occurrences) 또는 제품분기 Todo(variants)에서, 이 occurrenceKey에 해당하는
   * 회차 자체의 AGE_WINDOW 시작월을 찾는다. td.displayMonth는 TodoDefinition 하나당 값이
   * 하나뿐이라(보통 "1차" 기준) DTaP 2~5차처럼 회차마다 나이가 다른 경우에 전부 1차 월령에
   * 잘못 묶이는 문제가 있어, 가능하면 회차 자체의 시작월을 우선 쓴다.
   */
  function occurrenceStartMonth(td, occurrenceKey) {
    if (!td || !occurrenceKey) return null;
    const lists = [];
    if (Array.isArray(td.occurrences)) lists.push(td.occurrences);
    if (td.variants && Array.isArray(td.variants.options)) {
      td.variants.options.forEach((opt) => {
        if (Array.isArray(opt.occurrences)) lists.push(opt.occurrences);
      });
    }
    for (const list of lists) {
      const occ = list.find((o) => o.occurrenceKey === occurrenceKey);
      if (occ && occ.trigger && occ.trigger.type === "AGE_WINDOW" && typeof occ.trigger.startMonth === "number") {
        return Math.round(occ.trigger.startMonth);
      }
    }
    return null;
  }

  /**
   * 체크리스트를 묶을 "대표 월령"은 항목이 실제로 계산된 날짜(ageInMonths(e.date))가 아니라
   * TodoDefinition에 큐레이션돼 있는 displayMonth를 우선 써야 한다 — e.date는 엔진이 계산한
   * windowStart라, 예를 들어 4개월 트리거 항목이 생년월일의 일(day) 차이 때문에 10/18처럼 4개월
   * 정각보다 이틀 이르게 나오면 ageInMonths가 그걸 3개월로 오분류해버린다(실제로 발견된 버그:
   * DTaP 2차 등 4개월 항목 14개가 "생후 3개월" 그룹에 묶여 있었음).
   *
   * 다만 다회차 Todo는 회차마다 실제 나이가 다르므로 definition 전체의 displayMonth를 그대로
   * 쓰면 안 된다(예: DTaP 2~5차가 전부 1차 월령인 "2개월"에 잘못 묶이는 새 버그가 생김) —
   * occurrenceStartMonth()로 이 회차 자체의 시작월을 먼저 찾고, 그마저 없으면(RELATIVE_TO_EVENT
   * 처럼 고정 월령이 없는 회차) 실제 계산된 날짜의 월령으로 대체한다.
   *
   * displayMonth가 null인 단일 항목(마일스톤 대기·참고정보처럼 월령 하나로 고정할 수 없는 것)과,
   * displayMonth 필드 자체가 없는 레거시 지자체 지원금은 "그때그때 확인해요" 그룹으로 묶는다.
   */
  function displayMonthKeyOf(e) {
    if (!(e.isEngineEvent && e.detail && e.detail.definition)) return NEED_CHECK_GROUP;
    const td = e.detail.definition;
    const inst = e.detail.instance;
    const isMultiOccurrence = inst.occurrenceKey && inst.occurrenceKey !== "default";
    if (isMultiOccurrence) {
      const occMonth = occurrenceStartMonth(td, inst.occurrenceKey);
      if (occMonth !== null) return occMonth;
      return Math.max(0, ageInMonths(profile.birthDate, e.date));
    }
    return td.displayMonth === null || td.displayMonth === undefined ? NEED_CHECK_GROUP : td.displayMonth;
  }

  /** 전체 체크리스트: 대표 월령(displayMonth, 0~36개월)별로 묶어 아코디언으로 보여준다. 기본은 현재 월령만 펼쳐져 있다. */
  function renderChecklistTab() {
    ensureOpenMonthGroupsInit();
    const items = visibleSchedule().slice().sort((a, b) => a.date - b.date);
    const groups = new Map();
    items.forEach((e) => {
      const key = displayMonthKeyOf(e);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(e);
    });
    const monthKeys = [...groups.keys()].sort((a, b) => {
      if (a === NEED_CHECK_GROUP) return 1;
      if (b === NEED_CHECK_GROUP) return -1;
      return a - b;
    });
    el("list-checklist").innerHTML = monthKeys
      .map((key) => {
        const list = groups.get(key);
        const isOpen = openMonthGroups.has(key);
        const doneCount = list.filter((e) => completed[e.id]).length;
        const label = key === NEED_CHECK_GROUP ? "그때그때 확인해요" : `생후 ${key}개월`;
        return `
          <div class="ongoing-group-card month-group-card ${isOpen ? "open" : ""}" data-month="${key}">
            <button type="button" class="ongoing-group-header">
              <span class="group-text"><strong>${label}</strong></span>
              <span class="count-badge">${doneCount}/${list.length}개</span>
              <span class="chevron">▾</span>
            </button>
            <div class="ongoing-group-body">${list.map(eventItemHtml).join("")}</div>
          </div>
        `;
      })
      .join("");
    el("empty-checklist").classList.toggle("hidden", items.length > 0);
    el("list-checklist")
      .querySelectorAll(".ongoing-group-header")
      .forEach((btn) => {
        btn.addEventListener("click", () => {
          const card = btn.closest(".month-group-card");
          const raw = card.getAttribute("data-month");
          const key = raw === NEED_CHECK_GROUP ? NEED_CHECK_GROUP : Number(raw);
          if (openMonthGroups.has(key)) openMonthGroups.delete(key);
          else openMonthGroups.add(key);
          card.classList.toggle("open");
        });
      });
  }

  function renderRecordTab() {
    const items = visibleSchedule()
      .filter((e) => completed[e.id])
      .sort((a, b) => b.date - a.date);
    el("list-record").innerHTML = items.map(eventItemHtml).join("");
    el("empty-record").classList.toggle("hidden", items.length > 0);
  }

  /** 페이지 안의 리스트 컨테이너들에만 한정해서 바인딩한다 — 모달(#modal-content)은 각자 따로
   * 바인딩하므로 여기서 document 전체를 선택하면 모달이 열려있을 때 이중 바인딩된다. */
  function attachListHandlers() {
    const containerIds = ["selected-day-list", "list-checklist", "list-record"];
    containerIds.forEach((id) => {
      const c = el(id);
      if (c) c.querySelectorAll(".event-item").forEach(bindEventItem);
    });
    document.querySelectorAll("#remaining-grid .remaining-item").forEach((item) => {
      item.addEventListener("click", () => {
        const id = item.getAttribute("data-id");
        const e = schedule.find((x) => x.id === id);
        if (e) openDetail(e);
      });
    });
  }

  function bindEventItem(item) {
    item.addEventListener("click", (ev) => {
      if (ev.target.classList.contains("check")) return;
      const id = item.getAttribute("data-id");
      const e = schedule.find((x) => x.id === id);
      if (e) openDetail(e);
    });
    const chk = item.querySelector(".check");
    if (chk) {
      chk.addEventListener("click", (ev) => {
        ev.stopPropagation();
        toggleComplete(chk.getAttribute("data-check-id"));
      });
    }
  }

  function toggleComplete(id) {
    const wasDone = !!completed[id];
    if (wasDone) {
      delete completed[id];
    } else {
      const sepIdx = id.indexOf("__");
      const todoId = sepIdx === -1 ? id : id.slice(0, sepIdx);
      const occurrenceKey = sepIdx === -1 ? "default" : id.slice(sepIdx + 2);
      const nowIso = new Date().toISOString();
      completed[id] = { done: true, todo_id: todoId, occurrenceKey, recordType: "TODO_COMPLETED", recordedAt: nowIso };
      // MILESTONE_EVENT형 Todo는 이번 버전에 "마일스톤 보고"와 "완료 처리"를 분리하는 UI가
      // 따로 없어서, "완료로 표시하기" 클릭 한 번으로 둘 다 기록한다(보고 완료: docs 참고).
      const evt = schedule.find((x) => x.id === id);
      const isMilestoneTodo = evt && evt.detail && evt.detail.definition && evt.detail.definition.triggerType === "MILESTONE_EVENT";
      if (isMilestoneTodo) {
        completed[`${id}__milestone`] = { done: true, todo_id: todoId, occurrenceKey, recordType: "MILESTONE_REPORTED", recordedAt: nowIso };
      }
    }
    saveCompleted();
    if (familyCode) FamilySync.updateCompleted(familyCode, completed).catch((e) => console.error(e));
    // 완료 여부가 다른 Todo(다음 접종 회차 등)의 계산에도 영향을 줄 수 있어 전체를 다시 계산한다.
    refreshSchedule();
    if (!el("detail-modal").classList.contains("hidden")) {
      if (modalMode === "day-list" && currentDayContext) {
        renderDayList();
      } else {
        const e = schedule.find((x) => x.id === id);
        if (e) openDetail(e, !!currentDayContext);
      }
    }
  }

  function openDayDetail(events, date) {
    if (events.length === 1) {
      currentDayContext = null;
      openDetail(events[0]);
      return;
    }
    currentDayContext = { events, date };
    renderDayList();
    el("detail-modal").classList.remove("hidden");
  }

  function renderDayList() {
    modalMode = "day-list";
    const { events, date } = currentDayContext;
    el("modal-content").innerHTML = `
      <h3>${formatDateKR(date)}</h3>
      <p class="fine-print" style="margin:-8px 0 12px;text-align:left;">이 날의 일정 ${events.length}건</p>
      <div class="event-list">${events.map(eventItemHtml).join("")}</div>
      <button class="btn-close" id="btn-close-modal">닫기</button>
    `;
    document.querySelectorAll("#modal-content .event-item").forEach((item) => {
      item.addEventListener("click", (ev) => {
        if (ev.target.classList.contains("check")) return;
        const id = item.getAttribute("data-id");
        const e = schedule.find((x) => x.id === id);
        if (e) openDetail(e, true);
      });
    });
    document.querySelectorAll("#modal-content .check").forEach((chk) => {
      chk.addEventListener("click", (ev) => {
        ev.stopPropagation();
        toggleComplete(chk.getAttribute("data-check-id"));
      });
    });
    el("btn-close-modal").addEventListener("click", closeDetail);
  }

  function detailBodyHtml(e) {
    if (e.isEngineEvent) {
      const inst = e.detail.instance;
      const td = e.detail.definition;
      return `
        <div class="detail-row"><div class="label">현재 상태</div>${ENGINE_STATUS_LABEL[inst.status] || inst.status}</div>
        <div class="detail-row"><div class="label">해야 할 일</div>${td ? td.parentAction : ""}</div>
        <div class="detail-row"><div class="label">완료 기준</div>${td ? td.completionCriteria : "-"}</div>
        ${
          inst.retroactiveEligible === false
            ? `<div class="detail-row"><div class="label">참고</div>소급 적용 기한은 지났지만, 지금 신청해도 앞으로는 받을 수 있어요.</div>`
            : ""
        }
        ${
          inst.needsReview
            ? `<div class="detail-row"><div class="label">안내</div>이 정보는 아직 검증이 더 필요해요. 정확한 내용은 공식기관에 확인해주세요.</div>`
            : ""
        }
        <div class="detail-row"><div class="label">정보 출처</div>${td ? td.source : "-"}</div>
      `;
    }
    // 지자체(지역) 지원금 — 기존 로직 그대로
    const s = e.detail;
    const today = new Date();
    const ageNow = ageInMonths(profile.birthDate, today);
    const active = subsidyIsActiveNow(e, ageNow, today);
    const statusLine = active
      ? e.deadlineDate
        ? `지금 신청 가능 · ${formatDateKR(e.deadlineDate)}까지`
        : "지금 신청 가능"
      : today < e.entryDate
      ? `${formatDateKR(e.entryDate)}부터 신청 가능 (${e.dateLabel})`
      : `신청 기한이 지났을 수 있어요 (${e.dateLabel})`;
    return `
      ${e.needsCheck ? `<div class="detail-row"><div class="label">상태</div>추가 조건·최신 시행 여부 확인 필요</div>` : ""}
      <div class="detail-row"><div class="label">지원 대상</div>${s.target}</div>
      <div class="detail-row"><div class="label">지원 금액</div>${s.amountText}</div>
      <div class="detail-row"><div class="label">신청 기한</div>${statusLine}</div>
      <div class="detail-row"><div class="label">지급 방식</div>${s.paymentMethod || "확인 필요"}</div>
      <div class="detail-row"><div class="label">거주 조건</div>${s.residencyRequirement || "-"}</div>
      <div class="detail-row"><div class="label">추가 자격 조건</div>${s.additionalConditions || "-"}</div>
      <div class="detail-row"><div class="label">정보 출처</div>${s.sourceName}</div>
      <div class="detail-row"><div class="label">최종 확인일</div>${s.lastVerified}</div>
      ${s.notes ? `<div class="detail-row"><div class="label">비고</div>${s.notes}</div>` : ""}
    `;
  }

  function openDetail(e, cameFromDayList) {
    modalMode = "detail";
    const meta = CATEGORY_META[e.category];
    const isDone = !!completed[e.id];
    const showBack = cameFromDayList && currentDayContext && currentDayContext.events.length > 1;
    el("modal-content").innerHTML = `
      <span class="cat-badge" style="background:${meta.color}">${meta.label}</span>
      <h3>${e.title}</h3>
      ${detailBodyHtml(e)}
      ${e.officialUrl ? `<a class="btn-official" href="${e.officialUrl}" target="_blank" rel="noopener">공식 안내 페이지로 이동</a>` : ""}
      <button class="btn-complete" id="btn-toggle-complete">${isDone ? "완료 취소하기" : "완료로 표시하기"}</button>
      ${showBack ? `<button class="btn-close" id="btn-back-to-day">← 이 날 목록으로</button>` : ""}
      <button class="btn-close" id="btn-close-modal">닫기</button>
    `;
    el("detail-modal").classList.remove("hidden");
    el("btn-close-modal").addEventListener("click", closeDetail);
    el("btn-toggle-complete").addEventListener("click", () => toggleComplete(e.id));
    if (showBack) el("btn-back-to-day").addEventListener("click", renderDayList);
  }

  function closeDetail() {
    el("detail-modal").classList.add("hidden");
    currentDayContext = null;
    modalMode = null;
  }

  /** 프로필/데이터가 바뀐 뒤 3개 탭(달력/체크리스트/기록)을 전부 다시 그린다. */
  function renderAll() {
    renderProfileHeader();
    renderCalendar();
    renderSelectedDayPanel();
    renderRemainingList();
    renderChecklistTab();
    renderRecordTab();
    attachListHandlers();
  }

  function switchTab(name) {
    currentTab = name;
    ["calendar", "checklist", "record"].forEach((t) => el(`tab-${t}`).classList.toggle("hidden", t !== name));
    document.querySelectorAll(".seg-tab").forEach((btn) => btn.classList.toggle("active", btn.dataset.tab === name));
    document.querySelectorAll(".nav-item").forEach((btn) => btn.classList.toggle("active", btn.dataset.nav === name));
    window.scrollTo(0, 0);
  }

  function buildAndRender() {
    schedule = buildSchedule(profile, dataset, completionsForEngine());
    viewMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    renderFilterChips();
    switchTab("calendar");
    renderAll();
  }

  /** buildAndRender()와 달리 보고있던 달(viewMonth)은 그대로 두고 일정만 다시 계산한다(완료 처리 후 호출). */
  function refreshSchedule() {
    schedule = buildSchedule(profile, dataset, completionsForEngine());
    renderAll();
  }

  function showCalendarView() {
    el("view-landing").classList.add("hidden");
    el("view-calendar").classList.remove("hidden");
    window.scrollTo(0, 0);
  }

  function showLandingView() {
    el("view-calendar").classList.add("hidden");
    el("view-landing").classList.remove("hidden");
  }

  function handleSubmit(ev) {
    ev.preventDefault();
    const name = el("childName").value.trim();
    const birthDateStr = el("birthDate").value;
    const province = el("province").value;
    const district = el("district").value;
    if (!name || !birthDateStr || !province || !district) return;

    profile = { name, birthDate: new Date(birthDateStr + "T00:00:00"), province, district };
    saveProfile(profile);
    buildAndRender();
    showCalendarView();
    ensureFamilyCode();
  }

  async function handleLoadCode() {
    const input = el("familyCodeInput");
    const code = input.value.trim().toUpperCase();
    el("code-error").classList.add("hidden");
    if (!code) return;
    try {
      const data = await FamilySync.fetchFamily(code);
      if (!data || !data.profile) {
        el("code-error").classList.remove("hidden");
        return;
      }
      profile = profileFromPlain(data.profile);
      completed = data.completed || {};
      saveProfile(profile);
      saveCompleted();
      familyCode = code;
      FamilySync.saveCode(code);
      startListeningFamily();
      buildAndRender();
      showCalendarView();
    } catch (e) {
      console.error(e);
      el("code-error").classList.remove("hidden");
    }
  }

  function handleReset() {
    localStorage.removeItem(PROFILE_KEY);
    FamilySync.clearCode();
    if (unsubscribeFamily) unsubscribeFamily();
    familyCode = null;
    profile = null;
    el("query-form").reset();
    resetBirthDatePicker();
    updateBrandText();
    showLandingView();
  }

  async function init() {
    await loadAll();
    populateProvinces();
    completed = loadCompleted();
    try {
      const savedCats = JSON.parse(localStorage.getItem(ACTIVE_CATS_KEY));
      // 예전 4개 카테고리 체계("health"/"growth" 등)로 저장된 값은 새 6개 카테고리 키와
      // 하나도 안 맞아서 전부 걸러지면 화면에 아무것도 안 보이게 된다 — 그런 경우 기본값(전체
      // 선택)으로 되돌린다.
      const validSaved = Array.isArray(savedCats) ? savedCats.filter((c) => c in CATEGORY_META) : [];
      if (validSaved.length) activeCats = new Set(validSaved);
    } catch (e) {}

    el("province").addEventListener("change", (e) => populateDistricts(e.target.value));
    el("query-form").addEventListener("submit", handleSubmit);
    el("btn-show-code-entry").addEventListener("click", () => el("code-entry").classList.toggle("hidden"));
    el("btn-load-code").addEventListener("click", handleLoadCode);
    initBirthDatePicker();
    el("modal-backdrop").addEventListener("click", closeDetail);
    el("btn-prev-month").addEventListener("click", () => {
      viewMonth.setMonth(viewMonth.getMonth() - 1);
      renderCalendar();
    });
    el("btn-next-month").addEventListener("click", () => {
      viewMonth.setMonth(viewMonth.getMonth() + 1);
      renderCalendar();
    });

    // 대시보드 탭(세그먼트 + 하단 탭바) — 4번째(기록)는 하단 탭바에만 있다.
    document.querySelectorAll(".seg-tab").forEach((btn) => btn.addEventListener("click", () => switchTab(btn.dataset.tab)));
    document.querySelectorAll(".nav-item").forEach((btn) => btn.addEventListener("click", () => switchTab(btn.dataset.nav)));
    el("btn-profile-card").addEventListener("click", showProfileSheet);

    profile = loadProfile();
    familyCode = FamilySync.getSavedCode();

    if (familyCode) {
      try {
        const data = await FamilySync.fetchFamily(familyCode);
        if (data && data.profile) {
          profile = profileFromPlain(data.profile);
          completed = data.completed || {};
          saveProfile(profile);
          saveCompleted();
          startListeningFamily();
        } else {
          FamilySync.clearCode();
          familyCode = null;
        }
      } catch (e) {
        console.error("가족코드 조회 실패, 로컬 데이터로 진행합니다.", e);
      }
    } else if (profile) {
      ensureFamilyCode();
    }

    if (profile) {
      populateDistricts(profile.province, profile.district);
      el("province").value = profile.province;
      el("childName").value = profile.name || "";
      setBirthDatePicker(profile.birthDate);
      buildAndRender();
      showCalendarView();
    }
  }

  init();
})();
