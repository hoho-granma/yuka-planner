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
  let modalMode = null; // "day-list" | "detail"

  async function loadJson(path) {
    const res = await fetch(path);
    return res.json();
  }

  async function loadAll() {
    const [regions, subsidy, health, vaccine, growth] = await Promise.all([
      loadJson("data/regions.json"),
      loadJson("data/subsidies.json"),
      loadJson("data/health_checkup.json"),
      loadJson("data/vaccination.json"),
      loadJson("data/development.json"),
    ]);
    regionsData = regions;
    dataset = { subsidy, health, vaccine, growth };
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
      birthDate: p.birthDate.toISOString().slice(0, 10),
      gender: p.gender || "",
      province: p.province,
      district: p.district,
    };
  }

  function profileFromPlain(p) {
    return {
      birthDate: new Date(p.birthDate + "T00:00:00"),
      gender: p.gender || "",
      province: p.province,
      district: p.district,
    };
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
      renderChildInfo();
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
    const wrap = el("filter-chips");
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
        renderCalendar();
        renderLists();
      });
    });
  }

  function visibleSchedule() {
    return schedule.filter((e) => activeCats.has(e.category));
  }

  function sameDay(a, b) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }

  function renderChildInfo() {
    const today = new Date();
    const ageNow = ageInMonths(profile.birthDate, today);
    const upcoming = visibleSchedule().find((e) => e.date >= today && !completed[e.id]);
    el("child-info").innerHTML = `
      <h2>우리 아이 정보</h2>
      <div class="row"><span>생년월일</span><strong>${formatDateKR(profile.birthDate)}${profile.gender ? ` · ${profile.gender}` : ""}</strong></div>
      <div class="row"><span>현재 월령</span><strong>${ageNow}개월</strong></div>
      <div class="row"><span>거주 지역</span><strong>${profile.province} ${profile.district}</strong></div>
      ${
        upcoming
          ? `<div class="next-up">🔔 다음 일정: <strong>${upcoming.title}</strong> · ${formatDateKR(upcoming.date)}</div>`
          : `<div class="next-up">지금 챙길 예정된 일정이 없어요.</div>`
      }
      ${
        familyCode
          ? `<div class="row"><span>가족코드</span><strong>${familyCode} <button id="btn-copy-code" class="btn-text">복사</button></strong></div>
             <p class="fine-print" style="margin:6px 0 0;">다른 기기에서 이 코드를 입력하면 아이정보·완료내역이 그대로 연결돼요.</p>`
          : ""
      }
    `;
    const copyBtn = el("btn-copy-code");
    if (copyBtn) {
      copyBtn.addEventListener("click", async (ev) => {
        ev.stopPropagation();
        try {
          await navigator.clipboard.writeText(familyCode);
          copyBtn.textContent = "복사됨!";
          setTimeout(() => (copyBtn.textContent = "복사"), 1500);
        } catch (e) {}
      });
    }
  }

  function renderCalendar() {
    const year = viewMonth.getFullYear();
    const month = viewMonth.getMonth();
    el("calendar-title").textContent = `${year}년 ${month + 1}월`;

    const firstDay = new Date(year, month, 1);
    const startOffset = firstDay.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = new Date();

    const events = visibleSchedule();
    const grid = el("calendar-grid");
    grid.innerHTML = "";

    for (let i = 0; i < startOffset; i++) {
      const cell = document.createElement("div");
      cell.className = "day-cell other-month";
      grid.appendChild(cell);
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      const dayEvents = events.filter((e) => sameDay(e.date, date));
      const cell = document.createElement("div");
      cell.className = "day-cell" + (sameDay(date, today) ? " today" : "") + (dayEvents.length ? " has-event" : "");
      cell.innerHTML = `<span class="num">${day}</span><span class="dots">${dayEvents
        .map((e) => {
          const color = CATEGORY_META[e.category].color;
          const style = completed[e.id] ? `background:#fff;border:1.5px solid ${color};` : `background:${color};`;
          return `<span class="dot" style="${style}"></span>`;
        })
        .join("")}</span>`;
      if (dayEvents.length) {
        cell.addEventListener("click", () => openDayDetail(dayEvents, date));
      }
      grid.appendChild(cell);
    }
  }

  function subsidyIsActiveNow(e, ageNow, today) {
    const ageOk = ageNow >= e.minAgeMonths && ageNow <= e.maxAgeMonths;
    const notExpired = !e.deadlineDate || today <= e.deadlineDate;
    return ageOk && notExpired;
  }

  function eventItemHtml(e) {
    const isDone = !!completed[e.id];
    let dateLine = `${formatDateKR(e.date)} · ${e.dateLabel}`;
    if (e.category === "subsidy") {
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

  function renderLists() {
    const today = new Date();
    const ageNow = ageInMonths(profile.birthDate, today);
    const events = visibleSchedule();
    const thisMonthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    const nextMonthStart = new Date(today.getFullYear(), today.getMonth() + 1, 1);
    const nextMonthEnd = new Date(today.getFullYear(), today.getMonth() + 2, 0);

    const dated = events.filter((e) => e.category !== "subsidy");
    const subsidies = events.filter((e) => e.category === "subsidy");

    const activeSubsidies = subsidies.filter((e) => subsidyIsActiveNow(e, ageNow, today));
    const upcomingSubsidies = subsidies.filter(
      (e) => !subsidyIsActiveNow(e, ageNow, today) && e.entryDate > today && e.entryDate <= nextMonthEnd
    );
    const expiredSubsidies = subsidies.filter(
      (e) => !subsidyIsActiveNow(e, ageNow, today) && e.deadlineDate && e.deadlineDate < today
    );

    const thisMonth = [...dated.filter((e) => e.date >= today && e.date <= thisMonthEnd), ...activeSubsidies];
    const nextMonth = [
      ...dated.filter((e) => e.date >= nextMonthStart && e.date <= nextMonthEnd),
      ...upcomingSubsidies,
    ];
    const past = [...dated.filter((e) => e.date < today), ...expiredSubsidies]
      .sort((a, b) => b.date - a.date)
      .slice(0, 10);

    el("list-thismonth").innerHTML = thisMonth.map(eventItemHtml).join("");
    el("empty-thismonth").classList.toggle("hidden", thisMonth.length > 0);

    el("list-nextmonth").innerHTML = nextMonth.map(eventItemHtml).join("");
    el("empty-nextmonth").classList.toggle("hidden", nextMonth.length > 0);

    el("list-past").innerHTML = past.map(eventItemHtml).join("");
    el("empty-past").classList.toggle("hidden", past.length > 0);

    attachListHandlers();
  }

  function attachListHandlers() {
    document.querySelectorAll(".event-item").forEach((item) => {
      item.addEventListener("click", (ev) => {
        if (ev.target.classList.contains("check")) return;
        const id = item.getAttribute("data-id");
        const e = schedule.find((x) => x.id === id);
        if (e) openDetail(e);
      });
    });
    document.querySelectorAll(".check").forEach((chk) => {
      chk.addEventListener("click", (ev) => {
        ev.stopPropagation();
        const id = chk.getAttribute("data-check-id");
        toggleComplete(id);
      });
    });
  }

  function toggleComplete(id) {
    completed[id] = !completed[id];
    if (!completed[id]) delete completed[id];
    saveCompleted();
    if (familyCode) FamilySync.updateCompleted(familyCode, completed).catch((e) => console.error(e));
    renderCalendar();
    renderLists();
    renderChildInfo();
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
    if (e.category === "health") {
      return `
        <div class="detail-row"><div class="label">검진 시기</div>${e.dateLabel}</div>
        <div class="detail-row"><div class="label">검사 항목</div>${e.summary}</div>
        <div class="detail-row"><div class="label">준비 사항</div>${e.detail}</div>
        ${e.note ? `<div class="detail-row"><div class="label">참고</div>${e.note}</div>` : ""}
        <div class="detail-row"><div class="label">정보 출처</div>${e.source}</div>
      `;
    }
    if (e.category === "vaccine") {
      return `
        <div class="detail-row"><div class="label">권장 시기</div>${e.dateLabel}</div>
        ${e.summary ? `<div class="detail-row"><div class="label">참고</div>${e.summary}</div>` : ""}
        <div class="detail-row"><div class="label">안내</div>${e.detail}</div>
        <div class="detail-row"><div class="label">정보 출처</div>${e.source}</div>
      `;
    }
    if (e.category === "growth") {
      const b = e.detail;
      return `
        <div class="detail-row"><div class="label">생활 · 먹고 자는 것</div><ul class="check-list">${b.life
          .map((x) => `<li>${x}</li>`)
          .join("")}</ul></div>
        <div class="detail-row"><div class="label">이 시기에 좋아지는 것</div>${b.likes.join(" · ")}</div>
        <div class="detail-row"><div class="label">이번 시기 발달 체크</div><ul class="check-list">${b.checklist
          .map((x) => `<li>${x}</li>`)
          .join("")}</ul></div>
        <div class="detail-row"><div class="label">이때는 상담이 필요해요</div><ul class="check-list">${b.consultSigns
          .map((x) => `<li>${x}</li>`)
          .join("")}</ul></div>
        <div class="detail-row"><div class="label">판정 기준</div>판정은 영유아 건강검진에서 의사가 합니다. 위 항목은 참고용 국가 발달 이정표입니다.</div>
        <div class="detail-row"><div class="label">정보 출처</div>${e.source}</div>
      `;
    }
    // subsidy
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

  function buildAndRender() {
    schedule = buildSchedule(profile, dataset);
    viewMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    renderFilterChips();
    renderChildInfo();
    renderCalendar();
    renderLists();
  }

  function showCalendarView() {
    el("view-landing").classList.add("hidden");
    el("view-calendar").classList.remove("hidden");
    el("btn-reset").classList.remove("hidden");
    window.scrollTo(0, 0);
  }

  function showLandingView() {
    el("view-calendar").classList.add("hidden");
    el("view-landing").classList.remove("hidden");
    el("btn-reset").classList.add("hidden");
  }

  function handleSubmit(ev) {
    ev.preventDefault();
    const birthDateStr = el("birthDate").value;
    const gender = el("gender").value;
    const province = el("province").value;
    const district = el("district").value;
    if (!birthDateStr || !province || !district) return;

    profile = { birthDate: new Date(birthDateStr + "T00:00:00"), gender, province, district };
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
    showLandingView();
  }

  async function init() {
    await loadAll();
    populateProvinces();
    completed = loadCompleted();
    try {
      const savedCats = JSON.parse(localStorage.getItem(ACTIVE_CATS_KEY));
      if (Array.isArray(savedCats) && savedCats.length) activeCats = new Set(savedCats);
    } catch (e) {}

    el("province").addEventListener("change", (e) => populateDistricts(e.target.value));
    el("query-form").addEventListener("submit", handleSubmit);
    el("btn-reset").addEventListener("click", handleReset);
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
      el("gender").value = profile.gender || "";
      setBirthDatePicker(profile.birthDate);
      buildAndRender();
      showCalendarView();
    }
  }

  init();
})();
