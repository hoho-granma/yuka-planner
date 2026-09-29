(function () {
  const PROFILE_KEY = "yukjigi_profile";
  const COMPLETED_KEY = "yukjigi_completed";
  const ACTIVE_CATS_KEY = "yukjigi_active_cats";

  const el = (id) => document.getElementById(id);

  const PERSON_ICON_SVG =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" class="person-icon"><circle cx="12" cy="8" r="3.5"/><path d="M5 20c0-3.5 3-6 7-6s7 2.5 7 6"/></svg>';

  /** 사진이 없으면 기본 사람 아이콘을 보여준다. */
  function avatarInnerHTML(photoDataUrl, name) {
    if (photoDataUrl) return `<img src="${photoDataUrl}" alt="${name} 사진" />`;
    return PERSON_ICON_SVG;
  }

  /**
   * 사진을 그대로 base64로 저장하면 localStorage(보통 5MB 한도)를 금방 채운다.
   * 캔버스로 정사각 썸네일(최대 240px)로 줄이고 JPEG로 압축해서 저장한다.
   */
  function resizeImageFile(file, maxSize) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error);
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error("이미지를 읽을 수 없어요"));
        img.onload = () => {
          const side = Math.min(img.width, img.height);
          const sx = (img.width - side) / 2;
          const sy = (img.height - side) / 2;
          const canvas = document.createElement("canvas");
          canvas.width = maxSize;
          canvas.height = maxSize;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, sx, sy, side, side, 0, 0, maxSize, maxSize);
          resolve(canvas.toDataURL("image/jpeg", 0.85));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

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

  /** 없을 수도 있는 파일(예: 아직 데이터가 없는 시·군구)은 404를 에러로 취급하지 않고 null로 넘긴다. */
  async function loadJsonOrNull(path) {
    try {
      const res = await fetch(path);
      if (!res.ok) return null;
      return await res.json();
    } catch (e) {
      return null;
    }
  }

  // 건강검진·예방접종·발달관찰 등은 카테고리별 파일로 나눠뒀다(data/todos/*.json) — 전국 공통이라
  // 지역과 무관하게 앱 시작 시 한 번만 불러온다. SB(전국 공통 제도)만 예외적으로 TodoDefinition
  // 스키마를 그대로 쓰면서 data/subsidies/national-todos.json으로 옮겨져 있다(js/schedule.js 참고).
  const TODO_CATEGORY_FILES = [
    "data/todos/health-checkup.json",
    "data/todos/vaccination.json",
    "data/todos/development.json",
    "data/todos/feeding.json",
    "data/todos/oral.json",
    "data/todos/sleep.json",
    "data/todos/safety.json",
    "data/todos/daily-life.json",
    "data/todos/childcare.json",
    "data/subsidies/national-todos.json",
  ];

  // 시·도 이름 → 지원금 파일명에 쓰는 영문 슬러그. 지역을 전국으로 확대할 땐 여기 슬러그에 맞춰
  // data/subsidies/{슬러그}.json(도 전체 공통)과 필요하면 data/subsidies/{슬러그}-{시군구명}.json
  // (해당 시군구 전용) 파일만 추가하면 된다 — 코드는 건드릴 필요 없다.
  const PROVINCE_SLUG = {
    "서울특별시": "seoul",
    "부산광역시": "busan",
    "대구광역시": "daegu",
    "인천광역시": "incheon",
    "광주광역시": "gwangju",
    "대전광역시": "daejeon",
    "울산광역시": "ulsan",
    "세종특별자치시": "sejong",
    "경기도": "gyeonggi",
    "강원특별자치도": "gangwon",
    "충청북도": "chungbuk",
    "충청남도": "chungnam",
    "전북특별자치도": "jeonbuk",
    "전라남도": "jeonnam",
    "경상북도": "gyeongbuk",
    "경상남도": "gyeongnam",
    "제주특별자치도": "jeju",
  };

  /**
   * 지원금은 지역마다 항목이 다르고 전국 단위로 계속 늘어날 예정이라, 프로필(시·도/시·군구)이
   * 정해지기 전까지는 불러오지 않는다. 항상 national.json(전국 공통) + {시도}.json(도 전체·여러
   * 시군 공통) + {시도}-{시군구}.json(그 시군구 전용, 없으면 조용히 생략)만 불러온다 — 다른
   * 시도 파일은 아예 요청하지 않으므로 지역이 아무리 늘어도 매 세션 요청 수는 항상 2~3개다.
   */
  // 2027 개편 기준일(data/subsidies/reform-2027.json) — 항목의 birthRule을 출생일 범위로 바꾼다.
  let reformConfig = null;
  function applyBirthRule(item) {
    if (!item || !item.birthRule) return item;
    const eff = reformConfig && reformConfig.effectiveBirthDate;
    if (item.birthRule === "preReform") return eff ? { ...item, birthBefore: eff } : item;
    // 기준일을 못 불러왔으면 개편 후 항목은 보여주지 않는다(확정되지 않은 제도를 잘못 안내하지 않기 위해).
    if (item.birthRule === "postReform") return { ...item, birthOnOrAfter: eff || "9999-12-31" };
    return item;
  }

  async function loadSubsidyDataForRegion(province, district) {
    const slug = PROVINCE_SLUG[province];
    const paths = ["data/subsidies/national.json"];
    if (slug) {
      paths.push(`data/subsidies/${slug}.json`);
      if (district) paths.push(`data/subsidies/${slug}-${district}.json`);
    }
    const files = await Promise.all(paths.map(loadJsonOrNull));
    const subsidies = files.filter(Boolean).flatMap((f) => f.subsidies || []).map(applyBirthRule);
    return { subsidies };
  }

  /** dataset.subsidy를 현재 profile의 지역 기준으로 채운다. 같은 지역이면 다시 불러오지 않는다. */
  let loadedSubsidyRegionKey = null;
  async function ensureRegionSubsidyLoaded() {
    const key = `${profile.province}|${profile.district}`;
    if (loadedSubsidyRegionKey === key) return;
    dataset.subsidy = await loadSubsidyDataForRegion(profile.province, profile.district);
    loadedSubsidyRegionKey = key;
  }

  async function loadAll() {
    const [regions, reform, ...categoryFiles] = await Promise.all([
      loadJson("data/regions.json"),
      loadJsonOrNull("data/subsidies/reform-2027.json"),
      ...TODO_CATEGORY_FILES.map(loadJson),
    ]);
    regionsData = regions;
    reformConfig = reform;
    // 건강검진·예방접종·성장발달(및 이유식/구강/수면/안전/생활/보육)은 카테고리별 파일
    // (data/todos/*.json, 총 75개 TodoDefinition) + js/todo-engine.js로 계산한다.
    // 지자체 지원금(dataset.subsidy)은 프로필의 지역이 정해진 뒤 ensureRegionSubsidyLoaded()가 채운다.
    const todoDefinitions = categoryFiles.flatMap((f) => f.todos).map(applyBirthRule);
    dataset = { todoDefinitions, subsidy: { subsidies: [] } };
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
      birthOrder: p.birthOrder || null,
      stage: p.stage || "born",
      province: p.province,
      district: p.district,
    };
  }

  function profileFromPlain(p) {
    return {
      name: p.name || "",
      birthDate: new Date(p.birthDate + "T00:00:00"),
      birthOrder: p.birthOrder || null,
      stage: p.stage || "born",
      province: p.province,
      district: p.district,
    };
  }

  function isPregnant() {
    return !!profile && profile.stage === "pregnant";
  }

  /** 임신 주수(출산예정일 기준 280일). 예정일이 지났으면 42주로 고정. */
  function pregnancyInfo(dueDate, today) {
    const dueMid = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());
    const todayMid = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const daysToDue = Math.round((dueMid - todayMid) / 86400000);
    const elapsed = 280 - daysToDue;
    return { daysToDue, weeks: Math.max(0, Math.min(42, Math.floor(elapsed / 7))), days: Math.max(0, elapsed % 7) };
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
    unsubscribeFamily = FamilySync.listen(familyCode, async (data) => {
      if (!data || !data.profile) return;
      const profileChanged = JSON.stringify(profileToPlain(profileFromPlain(data.profile))) !== JSON.stringify(profileToPlain(profile));
      profile = profileFromPlain(data.profile);
      completed = data.completed || {};
      saveProfile(profile);
      saveCompleted();
      if (!el("view-calendar").classList.contains("hidden")) {
        // 완료 처리만 바뀐 경우엔 보던 탭·달을 유지한 채 일정만 다시 계산한다.
        if (profileChanged) await buildAndRender();
        else refreshSchedule();
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
    renderProvinceChips();
  }

  function makeChip(label, active, onClick) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "region-chip" + (active ? " active" : "");
    b.setAttribute("role", "radio");
    b.setAttribute("aria-checked", active ? "true" : "false");
    b.textContent = label;
    b.addEventListener("click", onClick);
    return b;
  }

  function renderProvinceChips() {
    const box = el("province-chips");
    box.innerHTML = "";
    const cur = el("province").value;
    for (const p of regionsData.provinces) {
      box.appendChild(makeChip(shortProvinceName(p.name), p.code === cur, () => {
        el("province").value = p.code;
        el("province").dispatchEvent(new Event("change"));
        renderProvinceChips();
        el("field-region").classList.remove("invalid");
      }));
    }
    updateRegionSummary();
  }

  function shortProvinceName(name) {
    return name
      .replace("특별자치시", "").replace("특별자치도", "").replace("특별시", "").replace("광역시", "")
      .replace("충청북도", "충북").replace("충청남도", "충남").replace("전라북도", "전북").replace("전라남도", "전남")
      .replace("경상북도", "경북").replace("경상남도", "경남").replace("경기도", "경기").replace("강원", "강원");
  }

  function renderDistrictChips() {
    const wrap = el("district-wrap");
    const box = el("district-chips");
    box.innerHTML = "";
    const province = regionsData.provinces.find((p) => p.code === el("province").value);
    wrap.classList.toggle("hidden", !province);
    if (!province) return updateRegionSummary();
    const cur = el("district").value;
    for (const d of province.districts) {
      box.appendChild(makeChip(d, d === cur, () => {
        el("district").value = d;
        renderDistrictChips();
        el("field-region").classList.remove("invalid");
      }));
    }
    updateRegionSummary();
  }

  function updateRegionSummary() {
    const p = regionsData && regionsData.provinces.find((x) => x.code === el("province").value);
    const d = el("district").value;
    const sum = el("region-summary");
    if (p && d) {
      el("region-summary-text").textContent = `${p.name} ${d}`;
      sum.classList.remove("hidden");
    } else {
      sum.classList.add("hidden");
    }
  }

  function syncOrderChips() {
    const cur = el("birthOrder").value;
    document.querySelectorAll("#order-chips .order-chip").forEach((b) => {
      const on = b.dataset.value === cur;
      b.classList.toggle("active", on);
      b.setAttribute("aria-checked", on ? "true" : "false");
    });
  }

  function populateDistricts(provinceCode, selected) {
    const districtSelect = el("district");
    districtSelect.innerHTML = "";
    const province = regionsData.provinces.find((p) => p.code === provinceCode);
    if (!province) {
      districtSelect.disabled = true;
      renderDistrictChips();
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
    renderDistrictChips();
  }

  function formatDateKR(date) {
    return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일`;
  }

  /**
   * 지원금 신청·수급 기간을 "언제부터 ~ 언제까지"로 명시하기 위한 표시용 계산.
   * 엔진의 addMonths는 30.4375일 근사라 하루씩 어긋날 수 있어서, 여기서는 달력 기준(같은 날짜의
   * n개월 뒤 − 1일)으로 계산한다. "출생 후 N일 이내"는 출생일을 1일째로 세어 출생일+(N-1)일까지다.
   * 기간 하나는 { label, start, end, note } — start/end는 { m: 개월, d: 일 } 또는 문자열/null.
   */
  function calAdd(b, months, days) {
    const d = new Date(b.getFullYear(), b.getMonth() + months, b.getDate());
    if (d.getDate() !== b.getDate()) d.setDate(0); // 2/29 → 2/28 처럼 말일 보정
    d.setDate(d.getDate() + (days || 0));
    return d;
  }
  const M = (m, d) => ({ m, d: d || 0 });
  const DAYS = (n) => ({ m: 0, d: n - 1 }); // 출생일 포함 n일째
  const RETRO60 = { label: "소급 신청(출생월부터 지급)", start: M(0), end: DAYS(60), note: "이 기간이 지나면 신청한 달부터 지급돼요(소급 없음)" };
  const SUBSIDY_PERIOD_SPECS = {
    "SB-01": [
      { label: "신청 가능", start: "출생신고 후", end: M(24, -1), note: (b) => `지급까지 시간이 걸려요. 사용 종료 2개월 전(${formatDateKR(calAdd(b, 22, -1))})까지는 신청하세요(지자체 안내)` },
      { label: "사용 기한", start: "지급일(포인트 생성일)", end: M(24, -1), note: "출생일로부터 2년 — 이후 남은 포인트는 자동 소멸" },
    ],
    "SB-02": [RETRO60, { label: "0세 지급·신청 기간", start: M(0), end: M(12, -1), note: "60일 뒤에 신청해도 이 기간 안이면 신청한 달부터 받아요" }],
    "SB-03": [{ label: "1세 지급 기간", start: M(12), end: M(24, -1), note: "0세 부모급여를 신청했다면 자동 연장돼요" }],
    "SB-04": [RETRO60, { label: "지급·신청 기간", start: M(0), end: M(108, -1), note: "만 9세 미만까지 — 60일 뒤 신청은 신청한 달부터 지급" }],
    "SB-05": [
      { label: "소급 신청(24개월분 전액)", start: M(0), end: DAYS(60), note: "60일 이후 신청하면 신청일부터 지원" },
      { label: "지원 종료", start: null, end: M(24, -1), note: "만 2세 전날까지" },
    ],
    "SB-06": [
      { label: "신청 기한", start: "최종 퇴원 후", end: "퇴원일로부터 6개월", note: "퇴원일이 기준이라 출생일만으로는 날짜를 계산할 수 없어요. 퇴원일을 확인해 6개월 안에 신청하세요" },
      { label: "선천성이상아 진단·입원 인정 기간", start: M(0), end: M(24, -1), note: "출생 후 2년 이내 진단·입원·수술한 경우(미숙아는 출생 후 24시간 이내 신생아집중치료실 입원)" },
    ],
    "SB-07": [{ label: "지원 기간", start: M(0), end: M(36, -1), note: "어린이집 입소 후 적용" }],
    "SB-08": [{ label: "지원 기간", start: M(36), end: M(72, -1), note: "만 3~5세" }],
    "SB-09": [{ label: "이용 가능 기간", start: M(3), end: M(156, -1), note: "생후 3개월~만 12세 이하, 소득기준 충족 시" }],
    "NAT-006": [
      { label: "지급 기간", start: M(24), end: (b) => new Date(b.getFullYear() + 7, 2, 0), note: "만 24개월부터 초등학교 취학년도 2월까지(86개월 미만). 어린이집·유치원 이용 시 중단, 신청일이 속한 달부터 지급" },
    ],
    "SEOUL-002": [
      { label: "신청 가능", start: "임신 확인 후", end: M(6, -1), note: "출산 후 6개월까지 신청" },
      { label: "사용 기한", start: "지급일", end: (b) => new Date(b.getFullYear(), b.getMonth() + 13, 0), note: "출생일로부터 12개월이 되는 달의 말일까지" },
    ],
    "SEOUL-003": [
      { label: "신청 기간", start: (b) => new Date(b.getFullYear(), b.getMonth() + 23, 1), end: (b) => new Date(b.getFullYear(), b.getMonth() + 36 + 1, 0), note: "아동이 23개월이 되는 달부터 신청 — 매월 1~15일 접수(활동 시작 전달 신청)" },
      { label: "돌봄활동·지원 기간", start: (b) => new Date(b.getFullYear(), b.getMonth() + 24, 1), end: (b) => new Date(b.getFullYear(), b.getMonth() + 36 + 1, 0), note: "24개월이 되는 달 1일부터 36개월이 되는 달 말일까지, 지급은 활동 다음 달 20일" },
    ],
    "SEOUL-004": [
      { label: "이용 기간", start: M(0), end: (b) => new Date(b.getFullYear() + 19, b.getMonth() + 1, 0), note: "막내가 만 19세가 되는 달의 말일까지(2자녀 이상 가정)" },
    ],
    "GURO-001": [{ label: "신청 기한", start: M(0), end: M(12, -1), note: "출생일부터 1년 이내, 출생일 6개월 전부터 구로구 거주 필요" }],
    "DOBONG-002": [
      { label: "서비스 시작 기한", start: M(0), end: DAYS(60), note: "출생 후 60일 이내에 산모·신생아 건강관리 서비스를 시작해야 해요" },
      { label: "지원금 청구", start: "서비스 종료 후", end: "서비스 종료 후 90일", note: "본인부담금의 90%(최대 35만원)" },
    ],
    "SDM-003": [{ label: "신청 기간", start: "육아휴직 시작 1개월 후", end: "휴직 종료 후 12개월", note: "출생일이 아니라 육아휴직 기간 기준이에요" }],
    "GWANAK-001": [
      { label: "2세 지급 신청", start: M(24), end: M(30, -1), note: "각 생일부터 6개월 이내 — 관악사랑상품권 30만원" },
      { label: "3세 지급 신청", start: M(36), end: M(42, -1), note: "각 생일부터 6개월 이내 — 관악사랑상품권 30만원" },
      { label: "4세 지급 신청", start: M(48), end: M(54, -1), note: "각 생일부터 6개월 이내 — 관악사랑상품권 30만원" },
    ],
    "NAT-004": [
      { label: "신청 가능", start: "출산예정일 40일 전", end: DAYS(60), note: "출산 후 60일까지 신청" },
      { label: "바우처 유효", start: "지급일", end: DAYS(90), note: "출산일로부터 90일(삼태아 이상 100일)" },
    ],
    "SEOUL-001": [
      { label: "신청 가능", start: M(0), end: DAYS(180), note: "출산 후 180일 이내(신청일 기준 서울 3개월 이상 거주)" },
      { label: "사용 기한", start: "지급일", end: (b) => new Date(b.getFullYear() + 1, b.getMonth() + 1, 0), note: "출생일로부터 1년이 되는 달의 말일까지" },
    ],
  };

  /** 지원금 하나의 [{label, text, note}] 기간 목록. 별도 명세가 없으면 데이터의 deadline/나이 범위로 만든다. */
  function subsidyPeriodRows(id, legacy, birthDate) {
    const fmt = (v) => {
      if (v == null) return null;
      if (typeof v === "string") return v;
      if (typeof v === "function") return formatDateKR(v(birthDate));
      return formatDateKR(calAdd(birthDate, v.m, v.d));
    };
    // 데이터에 출산예정일 기준 periods가 있으면: 임신 중엔 그것을 우선, 출산 후엔 개별 명세가 없을 때만
    // (출산 전 구간 행은 뺀다) 사용한다.
    const dataPeriods = legacy && Array.isArray(legacy.periods) ? legacy.periods : null;
    const pregnantNow = isPregnant();
    if (dataPeriods && (pregnantNow || !SUBSIDY_PERIOD_SPECS[id])) {
      const rowsSrc = pregnantNow ? dataPeriods : dataPeriods.filter((r) => !(r.endDays != null && r.endDays < 0));
      return rowsSrc.map((r) => {
        const a = r.startDays != null ? formatDateKR(calAdd(birthDate, 0, r.startDays)) : r.startText || null;
        const b = r.endDays != null && !r.endText ? formatDateKR(calAdd(birthDate, 0, r.endDays)) : r.endText || (r.endDays != null ? formatDateKR(calAdd(birthDate, 0, r.endDays)) : null);
        const text = a && b ? `${a} ~ ${b}` : b ? `${b}까지` : a ? `${a}부터` : "확인 필요";
        return { label: r.label, text, note: r.note || "" };
      });
    }
    let specs = SUBSIDY_PERIOD_SPECS[id];
    if (!specs && legacy) {
      const minA = legacy.minAgeMonths ?? 0;
      const dv = legacy.deadlineValue;
      let end = null;
      let label = "신청 가능";
      let note = "";
      if (legacy.deadlineType === "birth_relative_days") end = DAYS(dv);
      else if (legacy.deadlineType === "birth_relative_months") end = M(dv, -1);
      else if (legacy.deadlineType === "age_window") end = M(dv.maxMonths, -1);
      else if (legacy.maxAgeMonths != null && legacy.maxAgeMonths < 1000) {
        // max가 11·23·35…(만 나이 "N세 미만"의 마지막 개월)이면 다음 생일 전날까지, 12·24…이면 그 개월 전날까지
        const mx = legacy.maxAgeMonths;
        end = M((mx + 1) % 12 === 0 ? mx + 1 : mx, -1);
        label = "지원 대상 기간";
        note = "상시 신청 가능 — 대상 월령 안에서만 받을 수 있어요";
      }
      if (legacy.deadlineType === "age_window") specs = [{ label, start: M(dv.minMonths), end }];
      else if (legacy.deadlineType === "unconfirmed") specs = [{ label: "신청 기한", start: null, end: null, note: "기한 확인 필요 — 관할 기관에 문의하세요" }];
      else specs = [{ label, start: end ? M(minA) : null, end, note }];
    }
    return (specs || []).map((r) => {
      const a = fmt(r.start);
      const b = fmt(r.end);
      const text = a && b ? `${a} ~ ${b}` : b ? `${b}까지` : a ? `${a}부터` : "확인 필요";
      const note = typeof r.note === "function" ? r.note(birthDate) : r.note || "";
      return { label: r.label, text, note };
    });
  }

  /** 임신 중 제도의 "지금 신청 가능?" 문구 — periods의 일수 구간 전체를 기준으로 한다. */
  function prenatalStatusText(periods, dueDate, today) {
    const starts = periods.map((r) => r.startDays).filter((v) => v != null);
    const ends = periods.map((r) => r.endDays).filter((v) => v != null);
    if (!starts.length && !ends.length) return "신청 시기는 관할 기관에 확인해주세요";
    const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    if (starts.length && t < calAdd(dueDate, 0, Math.min(...starts))) return `${formatDateKR(calAdd(dueDate, 0, Math.min(...starts)))}부터 신청 가능`;
    if (ends.length && t > calAdd(dueDate, 0, Math.max(...ends))) return `신청 기한 지남(${formatDateKR(calAdd(dueDate, 0, Math.max(...ends)))}까지였어요)`;
    return ends.length ? `지금 신청 가능 · ${formatDateKR(calAdd(dueDate, 0, Math.max(...ends)))}까지` : "지금 신청 가능";
  }

  /** 신청·지급 기간: 다른 detail-row 값(지원 대상·금액)과 같은 불릿 목록 양식으로 맞춘다. */
  function subsidyPeriodHtml(rows, statusLine) {
    const items = rows.map(
      (r) => `<li><span class="period-label">${r.label}</span> ${r.text}${r.note ? `<span class="period-note">${r.note}</span>` : ""}</li>`
    );
    if (statusLine) items.push(`<li class="period-status">${statusLine}</li>`);
    return `<ul class="detail-list">${items.join("")}</ul>`;
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
    const years = [];
    if (landingStage === "pregnant") years.push(thisYear + 1, thisYear);
    else for (let y = thisYear; y >= thisYear - 8; y--) years.push(y);
    for (const y of years) {
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
      const maxDue = new Date(today.getTime() + 300 * 86400000);
      const outOfRange = landingStage === "pregnant" ? date < today || date > maxDue : date > today;
      if (outOfRange) {
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
    ["filter-chips-checklist"].forEach(renderFilterChipsInto);
  }

  function renderFilterChipsInto(containerId) {
    const wrap = el(containerId);
    if (!wrap) return;
    wrap.innerHTML = Object.entries(CATEGORY_META)
      .map(([key, meta]) => {
        const active = activeCats.has(key);
        const style = active
          ? `background:${meta.color};border-color:transparent;`
          : `color:${meta.color};border-color:${meta.color};`;
        return `<button class="chip ${active ? "active" : ""}" data-cat="${key}" style="${style}">${meta.label}</button>`;
      })
      .join("");
    wrap.querySelectorAll(".chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        const cat = chip.getAttribute("data-cat");
        if (activeCats.has(cat)) activeCats.delete(cat);
        else activeCats.add(cat);
        renderFilterChips();
        renderAll();
      });
    });
  }

  // 서비스 범위는 생후 0~36개월이다 — 지원금처럼 36개월 이후까지 수급기간이 이어지는 항목도
  // "언제부터 챙겨야 하는지"(e.date 기준 월령)가 36개월 이내면 보여주고, 그 이후에 처음
  // 시작되는 항목만 걸러낸다.
  function visibleSchedule(ignoreCategoryFilter) {
    return schedule.filter((e) => (ignoreCategoryFilter || activeCats.has(e.category)) && ageInMonths(profile.birthDate, e.date) <= 36);
  }

  /** 달력·기록은 체크리스트의 카테고리 필터와 무관하게 늘 전체 카테고리를 보여준다. */
  function calendarSchedule() {
    return visibleSchedule(true);
  }

  function sameDay(a, b) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }

  function renderProfileHeader() {
    updateBrandText();
    const today = new Date();
    const ageNow = ageInMonths(profile.birthDate, today);
    if (isPregnant()) {
      const pi = pregnancyInfo(profile.birthDate, today);
      const dLabel = pi.daysToDue > 0 ? `출산까지 D-${pi.daysToDue}` : pi.daysToDue === 0 ? "오늘이 출산 예정일" : "출산 예정일이 지났어요";
      el("profile-name-age").textContent = `${childDisplayName()} · 임신 ${pi.weeks}주 · ${dLabel}`;
    } else {
      el("profile-name-age").textContent = `${childDisplayName()} · 생후 ${ageNow}개월`;
    }
    el("profile-location-text").textContent = `${profile.province} ${profile.district}`;
    el("profile-avatar").innerHTML = avatarInnerHTML(profile.photoDataUrl, childDisplayName());
  }

  /** 프로필 카드를 탭하면 뜨는 바텀시트 — 상세정보 + 가족코드 복사 + 정보 다시 입력. */
  function showProfileSheet() {
    modalMode = "profile";
    const today = new Date();
    const ageNow = ageInMonths(profile.birthDate, today);
    el("modal-content").innerHTML = `
      <div class="profile-name-row">
        <h3>${childDisplayName()}</h3>
        <input type="file" accept="image/*" id="photo-input" class="hidden" />
        <button type="button" class="btn-photo" id="btn-photo-upload">${profile.photoDataUrl ? "사진 변경" : "사진 추가"}</button>
        ${profile.photoDataUrl ? `<button type="button" class="btn-photo-remove" id="btn-photo-remove">삭제</button>` : ""}
      </div>
      <div class="detail-row"><div class="label">${isPregnant() ? "출산 예정일" : "생년월일"}</div>${
        isPregnant()
          ? `${formatDateKR(profile.birthDate)} · 임신 ${pregnancyInfo(profile.birthDate, today).weeks}주`
          : `${formatDateKR(profile.birthDate)} · 생후 ${ageNow}개월`
      }</div>
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
      ${isPregnant() ? `<button class="btn-complete" id="btn-switch-born">아이가 태어났어요 👶</button>` : ""}
      <button class="btn-close" id="btn-open-reset">${isPregnant() ? "임신 정보 다시 입력하기" : "아이 정보 다시 입력하기"}</button>
      <button class="btn-close" id="btn-close-modal">닫기</button>
    `;
    el("detail-modal").classList.remove("hidden");
    el("btn-close-modal").addEventListener("click", closeDetail);
    el("btn-open-reset").addEventListener("click", () => {
      closeDetail();
      handleReset();
    });
    const switchBtn = el("btn-switch-born");
    if (switchBtn) switchBtn.addEventListener("click", showBornSwitchSheet);
    el("btn-photo-upload").addEventListener("click", (ev) => {
      ev.stopPropagation();
      el("photo-input").click();
    });
    el("photo-input").addEventListener("change", async (ev) => {
      const file = ev.target.files && ev.target.files[0];
      if (!file) return;
      try {
        profile.photoDataUrl = await resizeImageFile(file, 240);
        saveProfile(profile);
        renderProfileHeader();
        showProfileSheet();
      } catch (e) {
        console.error("사진 등록 실패", e);
      }
    });
    const removeBtn = el("btn-photo-remove");
    if (removeBtn) {
      removeBtn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        delete profile.photoDataUrl;
        saveProfile(profile);
        renderProfileHeader();
        showProfileSheet();
      });
    }
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

  /** 진행현황 카드 — 체크리스트 대표 월령이 이번 달인 항목 기준(달력 그리드와 동일 기준). */
  function renderCalendarProgress() {
    const year = viewMonth.getFullYear();
    const month = viewMonth.getMonth();
    const monthDated = calendarSchedule().filter((e) => eventInCalendarMonth(e, year, month));
    const total = monthDated.length;
    const done = monthDated.filter((e) => completed[e.id]).length;
    const percent = total ? Math.round((done / total) * 100) : 0;
    el("cal-progress-summary").innerHTML = `<span style="display:block;font-size:.8em;font-weight:500;opacity:.75">이번 달 알아둘 육아 정보</span>${month + 1}월 · ${total}개 중 ${done}개 확인`;
    el("cal-progress-bar-fill").style.width = `${percent}%`;
    el("cal-progress-bar-label").textContent = total ? `${percent}%` : "";
  }

  /**
   * 달력에 뜨는 항목은 이제 "이 달에 확인하면 되는 것"(체크리스트의 대표 월령 그룹)이지,
   * 특정 날짜에 반드시 해야 하는 일이 아니다 — 그래서 실제 날짜와 무관하게 이번 달 항목들을
   * 월 전체 날짜에 최대한 고르게 펼쳐서, 하루에 몰려 보이지 않고 한눈에 훑어보기 좋게 한다.
   *
   * 다만 예방접종(카테고리 "예방접종")은 예외다 — 실제로 병원에 한 번 가면 그날 여러 백신을
   * 같이 맞는 게 정상이라(예: 2개월 방문에서 DTaP·폴리오·Hib·폐렴구균·로타를 한꺼번에), 같은
   * 달의 접종 항목들은 따로 흩어놓지 않고 하나의 방문일로 묶는다. 이 접종 묶음도 "한 자리"만
   * 차지해서 다른 카테고리의 분산을 방해하지 않는다.
   */
  function computeDisplayDayMap(year, month, monthEvents) {
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const map = new Map();
    const vaccineEvents = monthEvents.filter((e) => e.category === "예방접종");
    const otherEvents = monthEvents.filter((e) => e.category !== "예방접종");
    const groups = otherEvents.map((e) => [e]);
    if (vaccineEvents.length) groups.push(vaccineEvents);
    groups.sort((a, b) => calGroupFor(a[0]).label.localeCompare(calGroupFor(b[0]).label) || a[0].id.localeCompare(b[0].id));
    const n = groups.length;
    groups.forEach((group, i) => {
      const day = Math.min(daysInMonth, Math.floor((i * daysInMonth) / n) + 1);
      group.forEach((e) => map.set(e.id, day));
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

    // 달력에 보여줄 항목 = 체크리스트의 대표 월령이 이번 달과 같은 항목 전부(체크리스트 기준
    // 매핑). displayMonth가 없는 항목(그때그때 확인해요)은 특정 달이 없어 달력에는 안 나온다.
    const monthEvents = calendarSchedule().filter((e) => eventInCalendarMonth(e, year, month));
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
      // 미완료: 카테고리색 단색 도트. 완료: 중요도와 무관하게 연회색 체크.
      const markerHtml = shown
        .map((e) => {
          const g = calGroupFor(e);
          const done = !!completed[e.id];
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
        // renderSelectedDayPanel()이 #selected-day-list를 새 DOM으로 통째로 갈아끼우기 때문에,
        // attachListHandlers()로 다시 바인딩해주지 않으면 방금 그려진 카드는 클릭도 체크도
        // 아무 반응이 없다(기존 버그: 날짜를 바꿔 클릭하면 완료 체크가 안 먹혔음).
        attachListHandlers();
      });
      grid.appendChild(cell);
    }
  }

  function renderSelectedDayPanel() {
    const date = selectedCalendarDate;
    // 달력 칸의 마커는 이 달 안에서 고르게 분산배치된 위치에 찍히므로, 선택한 날짜의 목록도
    // 실제 날짜가 아니라 같은 분산배치 결과(calendarDisplayDayMap)를 기준으로 골라야 맞는다.
    const events = calendarSchedule()
      .filter((e) => eventInCalendarMonth(e, date.getFullYear(), date.getMonth()) && calendarDisplayDayMap.get(e.id) === date.getDate())
      .sort((a, b) => (isImportantEvent(b) ? 1 : 0) - (isImportantEvent(a) ? 1 : 0));
    const dowNames = ["일", "월", "화", "수", "목", "금", "토"];
    el("selected-day-title").textContent = `${date.getMonth() + 1}월 ${date.getDate()}일 (${dowNames[date.getDay()]})`;
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
    const items = calendarSchedule().filter((e) => eventInCalendarMonth(e, year, month) && !completed[e.id]);
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

  /**
   * 전국 공통 제도(SB-*, 엔진으로 계산)는 "지금 챙기세요" 같은 추상적 상태 대신, 우리 아이의
   * 생년월일을 기준으로 실제 계산된 날짜를 보여준다 — retroactiveDeadline이 있는 항목(부모급여·
   * 아동수당 등)은 소급 신청기한(applicationDeadline)을, 없는 항목은 windowEnd(출생일+마감일수
   * 등 실제 신청 마감일) 또는 windowStart(신청 가능 시작일)를 그대로 날짜로 보여준다.
   */
  function subsidyDateLineForEngineEvent(e, forDetail) {
    const inst = e.detail.instance;
    if (inst.status === "DONE") return doneWords(e.category).state;
    const periodRows = subsidyPeriodRows(e.detail.definition && e.detail.definition.todo_id, null, profile.birthDate);
    if (periodRows.length) {
      return forDetail
        ? subsidyPeriodHtml(periodRows)
        : `${periodRows[0].label} ${periodRows[0].text}`;
    }
    if (inst.applicationDeadline) {
      return inst.applicationDeadlinePassed
        ? `소급 신청기한 지남(${formatDateKR(inst.applicationDeadline)}까지였어요) · 지금 신청해도 신청월부터는 받을 수 있어요`
        : `소급 신청기한 ${formatDateKR(inst.applicationDeadline)}까지`;
    }
    if (inst.windowEnd) return `${formatDateKR(inst.windowEnd)}까지 신청`;
    if (inst.windowStart) return `${formatDateKR(inst.windowStart)}부터 신청 가능`;
    return e.subcategoryLabel || "";
  }

  /**
   * windowStart~windowEnd를 "월" 단위로 뭉뚱그린 문구로 바꾼다. 접종·검진은 실제로는 병원 예약에
   * 맞춰 날짜를 잡는 것이지 캘린더에 찍힌 특정 하루에 반드시 가야 하는 게 아니라서(사용자 피드백:
   * "스케줄은 엄마가 알아서 잡을 테니"), 우리 아이 생년월일 기준으로 계산된 연·월까지만 알려주고
   * 정확한 날짜는 병원 사정에 맞추도록 안내한다. TodoDefinition에 startMonth===endMonth로 박혀
   * 있는 표준월령(대부분의 접종 1~3차)도 "그 달 중"으로 넓혀 보여준다.
   */
  function periodTextFromWindow(windowStart, windowEnd) {
    if (!windowStart) return null;
    const end = windowEnd || windowStart;
    const sameMonth = windowStart.getFullYear() === end.getFullYear() && windowStart.getMonth() === end.getMonth();
    return sameMonth
      ? `${windowStart.getFullYear()}년 ${windowStart.getMonth() + 1}월 중`
      : `${windowStart.getFullYear()}년 ${windowStart.getMonth() + 1}월~${end.getFullYear()}년 ${end.getMonth() + 1}월 사이`;
  }

  function vaccinationPeriodDateLine(e) {
    const inst = e.detail.instance;
    if (inst.status === "DONE") return doneWords(e.category).state;
    const period = periodTextFromWindow(inst.windowStart, inst.windowEnd);
    return period ? `${period} · ${e.dateLabel}` : e.dateLabel;
  }

  /** 체크리스트 카드용 지원 내용 — 첫 구절만(괄호·부연 설명 제외) 짧게 보여준다. 전체 내용은 상세에서 본다. */
  function shortSubsidySummary(text) {
    let t = String(text || "").split(/ — |\n|; /)[0].replace(/\s*\([^)]*\)/g, "").trim();
    if (t.length > 40) t = t.slice(0, 40).replace(/[\s,·/]+\S*$/, "") + "…";
    return t;
  }

  /** 항목 유형별 완료 문구 — 정보·수칙은 "확인", 접종·검진·지원금 신청은 실제 행동 "완료"로 구분한다. */
  function doneWords(category) {
    if (category === "예방접종") return { state: "접종 완료", mark: "접종 완료 표시", undo: "접종 완료 취소" };
    if (category === "영유아검진") return { state: "검진 완료", mark: "검진 완료 표시", undo: "검진 완료 취소" };
    if (category === "행정·지원금") return { state: "신청 완료", mark: "신청 완료 표시", undo: "신청 완료 취소" };
    return { state: "확인 완료", mark: "확인했어요", undo: "확인 취소" };
  }

  function isVaccinationLike(category) {
    return category === "예방접종" || category === "영유아검진" || category === "행정·지원금";
  }

  /** 지원금 대상 구분 태그 — 임신 중에만 신청하는 제도 / 산모(출산 후 신청 가능) 제도를 아이 대상 제도와 구분해 보여준다. */
  function subsidyAudienceLabel(e) {
    if (e.category !== "행정·지원금" || !e.isLegacySubsidy || !e.detail) return "";
    if (e.detail.prenatalOnly) return "임신 중";
    if (e.detail.audience === "mother") return isPregnant() ? "임신·산모" : "산모 대상";
    return "";
  }

  /** 지원금을 어디서 주는지 — 전국 공통 / 시·도 / 시·군·구 단계와 상세 설명. 지원금이 아니면 null. */
  function subsidyProvider(e) {
    if (e.category !== "행정·지원금") return null;
    const provShort = (p) => String(p || "").replace(/특별자치시|특별시|광역시/, "시").replace(/특별자치도/, "도");
    if (e.isLegacySubsidy && e.detail) {
      const s = e.detail;
      if (s.scope === "national") return { short: "전국 공통", long: "전국 공통 (정부 지원 · 어느 지역에 살아도 신청 가능)" };
      if (s.scope === "provincial") {
        const regs = (s.applicableRegions || []).filter((r) => r !== "ALL");
        const all = regs.some((r) => r.endsWith(":ALL"));
        return all
          ? { short: provShort(profile.province), long: `${profile.province} 지원 (${profile.province} 전체 거주자 대상)` }
          : { short: provShort(profile.province), long: `${profile.province} 지원 (일부 시·군만 해당 — 우리 지역 ${profile.district}는 대상이에요)` };
      }
      return { short: profile.district, long: `${profile.province} ${profile.district} 지원 (${profile.district} 거주자 대상)` };
    }
    const id = e.detail && e.detail.definition && e.detail.definition.todo_id;
    if (id === "SB-10") return { short: "거주 지자체", long: `${profile.province} ${profile.district} 등 거주 지자체 제도` };
    return { short: "전국 공통", long: "전국 공통 (정부 지원 · 어느 지역에 살아도 신청 가능)" };
  }

  function eventItemHtml(e, opts) {
    const isDone = !!completed[e.id];
    // 특정 날짜가 없는 항목(마일스톤 대기, 몇 달~몇 년짜리 안전수칙)은 "지금 챙기세요" 같은
    // 상태 라벨을 보여주지 않는다 — 날짜가 정해지지 않았는데 급한 것처럼 보이는 게 오히려
    // 혼란스러웠다. 지원금(행정·지원금)은 실제 신청기한 날짜를, 접종·검진은 "몇 월 중"
    // 기간을 계산해 보여준다(둘 다 우리 아이 생년월일 기준 실제 계산값).
    let dateLine;
    if (e.category === "행정·지원금" && e.isEngineEvent) {
      dateLine = subsidyDateLineForEngineEvent(e);
    } else if ((e.category === "예방접종" || e.category === "영유아검진") && e.isEngineEvent) {
      dateLine = vaccinationPeriodDateLine(e);
    } else if (e.isDateSpecific === false) {
      dateLine = e.subcategoryLabel || "";
    } else {
      dateLine = `${formatDateKR(e.date)} · ${e.dateLabel}`;
    }
    if (e.isLegacySubsidy) {
      const today = new Date();
      const ageNow = ageInMonths(profile.birthDate, today);
      const pr = subsidyPeriodRows(e.id, e.detail, profile.birthDate);
      if (isPregnant() && e.periods && e.periods.length) {
        dateLine = `${pr[0].label} ${pr[0].text}`;
      } else if (pr.length) {
        dateLine = `${pr[0].label} ${pr[0].text}`;
      } else if (subsidyIsActiveNow(e, ageNow, today)) {
        dateLine = e.deadlineDate ? `지금 신청 가능 · ${formatDateKR(e.deadlineDate)}까지` : "지금 신청 가능";
      } else if (today < e.entryDate) {
        dateLine = `${formatDateKR(e.entryDate)}부터 신청 가능`;
      } else {
        dateLine = e.deadlineDate ? `신청 기한 지남(${formatDateKR(e.deadlineDate)}까지였어요)` : `신청 기한 지남 · ${e.dateLabel}`;
      }
    }
    if (e.category === "행정·지원금") dateLine = String(dateLine).split(" · ")[0];
    if (isDone) dateLine = doneWords(e.category).state;
    return `
      <div class="event-item ${isDone ? "completed" : ""} ${isDone && opts && opts.compact ? "compact" : ""}" data-id="${e.id}">
        <span class="cat-dot" style="background:${CATEGORY_META[e.category].color}"></span>
        <div class="body">
          <p class="title">${subsidyProvider(e) ? `<span class="scope-tag">${subsidyProvider(e).short}</span>` : ""}${subsidyAudienceLabel(e) ? `<span class="aud-tag">${subsidyAudienceLabel(e)}</span>` : ""}${e.title}</p>
          <p class="date-label">${dateLine}</p>
          <p class="summary">${e.category === "행정·지원금" ? shortSubsidySummary(e.summary) : e.summary || ""}</p>
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
   * displayMonth가 null인 단일 항목(마일스톤 대기·참고정보처럼 월령 하나로 고정할 수 없는 것)은
   * "그때그때 확인해요" 그룹으로 묶는다. 레거시 지자체 지원금(isLegacySubsidy)은 TodoDefinition이
   * 아니라 displayMonth 필드가 없지만, "생후 minAgeMonths개월부터 신청 가능"이라는 자기 나름의
   * 대표 월령이 있으므로 그걸 그대로 쓴다 — 이래야 체크리스트와 달력 양쪽에서 지원금도 다른
   * 항목과 똑같이 대표 월령 기준으로 다뤄진다.
   */
  function displayMonthKeyOf(e) {
    if (e.isLegacySubsidy) {
      return typeof e.minAgeMonths === "number" ? e.minAgeMonths : NEED_CHECK_GROUP;
    }
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

  /**
   * 카시트·익수예방·SIDS 수칙처럼 "그 기간 내내 계속 챙겨야 하는" 넓은 AGE_WINDOW 항목은
   * displayMonthKeyOf()가 정해주는 시작월 한 곳에만 표시하면, 그 사이 달(예: 은찬이의 생후
   * 3개월)에 마침 새로 시작하는 항목이 하나도 없을 때 체크리스트·달력이 통째로 비어 보이는
   * 문제가 생긴다(실제로 이 문제가 보고됨). 그래서 이런 항목은 해당 기간의 모든 달에 반복해서
   * 보여준다 — 한 달에서 완료 체크하면 같은 항목이 나오는 다른 모든 달에도 완료로 표시된다
   * (완료 여부는 항목 하나당 하나의 completed[id]를 공유하므로 자동으로 그렇게 된다).
   *
   * 반복 대상에서 제외하는 것: 다회차 접종(회차마다 이미 자기 월령이 따로 있음), 지원금
   * (신청 가능 시작월 한 곳이 더 의미 있음), 좁은 창(narrow window, isDateSpecific=true — 한 번
   * 방문하면 끝나는 검진·접종은 반복할 이유가 없음).
   */
  function repeatMonthRangeOf(e) {
    if (!(e.isEngineEvent && e.detail && e.detail.definition)) return null;
    if (e.category === "행정·지원금") return null;
    if (e.isDateSpecific !== false) return null;
    const inst = e.detail.instance;
    if (inst.occurrenceKey && inst.occurrenceKey !== "default") return null;
    const tp = e.detail.definition.triggerParams;
    if (!tp || typeof tp.startMonth !== "number") return null;
    // 반복 노출은 "적용 기간의 시작"이 아니라 "검토해야 할 대표 월령(displayMonth)"부터 시작한다
    // (예: 꿀 섭취 금지는 적용은 0~12개월이지만 이유식 시작 시점인 6개월부터 안내).
    const dm = e.detail.definition.displayMonth;
    const windowStart = Math.max(0, Math.floor(tp.startMonth));
    const end = tp.endMonth == null ? 36 : Math.min(36, Math.ceil(tp.endMonth));
    const start = typeof dm === "number" && dm > windowStart && dm <= end ? Math.floor(dm) : windowStart;
    if (end <= start) return null;
    const months = [];
    for (let m = start; m <= end; m++) months.push(m);
    return months;
  }

  /** 이 항목이 속하는 월령 그룹 전부(보통 1개, repeatMonthRangeOf 대상이면 여러 개)를 반환한다. */
  function monthKeysOf(e) {
    return repeatMonthRangeOf(e) || [displayMonthKeyOf(e)];
  }

  /**
   * 체크리스트의 "대표 월령"(들)을 실제 달력 월(연·월)로 바꿔, 이 항목이 주어진 달력 연·월에
   * 나타나야 하는지 판단한다 — 달력은 이 기준으로 항목을 배치한다(체크리스트 기준 매핑).
   * displayMonth가 없는 항목(그때그때 확인해요)은 특정 달에 넣을 수 없으므로 달력에는
   * 나타나지 않는다(체크리스트의 "그때그때 확인해요" 그룹에서만 확인).
   */
  function eventInCalendarMonth(e, year, month) {
    return monthKeysOf(e).some((key) => {
      if (key === NEED_CHECK_GROUP) return false;
      const d = addMonths(profile.birthDate, key);
      return d.getFullYear() === year && d.getMonth() === month;
    });
  }

  /** 전체 체크리스트: 대표 월령(displayMonth, 0~36개월)별로 묶어 아코디언으로 보여준다. 기본은 현재 월령만 펼쳐져 있다. */
  function renderChecklistTab() {
    ensureOpenMonthGroupsInit();
    const items = visibleSchedule().slice().sort((a, b) => a.date - b.date);
    const groups = new Map();
    items.forEach((e) => {
      monthKeysOf(e).forEach((key) => {
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(e);
      });
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
        const label = key === NEED_CHECK_GROUP ? "그때그때 확인해요" : isPregnant() && key === 0 ? "임신 중·출산 직후" : `생후 ${key}개월`;
        return `
          <div class="ongoing-group-card month-group-card ${isOpen ? "open" : ""}" data-month="${key}">
            <button type="button" class="ongoing-group-header">
              <span class="group-text"><strong>${label}</strong></span>
              <span class="count-badge">${doneCount}/${list.length}개</span>
              <span class="chevron">▾</span>
            </button>
            <div class="ongoing-group-body">${list.slice().sort((a, b) => !!completed[a.id] - !!completed[b.id]).map((e) => eventItemHtml(e, { compact: true })).join("")}</div>
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
    const items = visibleSchedule(true)
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

  // 체크(라디오처럼 보이는 동그라미)를 눌러도 그 자리에서 바로 완료 처리하지 않는다 —
  // 상세 팝업을 띄우고 "완료로 표시하기" 버튼을 눌러야 완료된다(달력 카드·체크리스트 공통 동작).
  function bindEventItem(item) {
    item.addEventListener("click", () => {
      const id = item.getAttribute("data-id");
      const e = schedule.find((x) => x.id === id);
      if (e) openDetail(e);
    });
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

  function localDateInputValue(d) {
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  /** 완료 기록의 날짜를 사용자가 고른 날짜로 바꾼다. 접종 간격 등 엔진 계산이 recordedAt을 기준으로 한다. */
  function setCompletionDate(id, dateStr) {
    if (!completed[id] || !dateStr) return;
    const [y, m, d] = dateStr.split("-").map(Number);
    if (!y || !m || !d) return;
    const iso = new Date(y, m - 1, d, 12, 0, 0).toISOString();
    completed[id] = { ...completed[id], recordedAt: iso };
    if (completed[`${id}__milestone`]) completed[`${id}__milestone`] = { ...completed[`${id}__milestone`], recordedAt: iso };
    saveCompleted();
    if (familyCode) FamilySync.updateCompleted(familyCode, completed).catch((err) => console.error(err));
    refreshSchedule();
    if (!el("detail-modal").classList.contains("hidden")) {
      const e = schedule.find((x) => x.id === id);
      if (e) openDetail(e, !!currentDayContext);
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
      item.addEventListener("click", () => {
        const id = item.getAttribute("data-id");
        const e = schedule.find((x) => x.id === id);
        if (e) openDetail(e, true);
      });
    });
    el("btn-close-modal").addEventListener("click", closeDetail);
  }

  /** 문장 여러 개를 이어붙인 문자열(마침표 또는 쉼표로 구분)을 항목 배열로 쪼갠다.
   * 쪼갤 지점이 없으면(원래 한 문장) 그대로 문자열을 반환한다. */
  function splitToBullets(text) {
    if (!text || typeof text !== "string") return text;
    let parts = text.split(/(?<=[.!?])\s+/).filter(Boolean);
    if (parts.length < 2) parts = text.split(/,\s+/).filter(Boolean);
    return parts.length >= 2 ? parts : text;
  }

  function bulletListHtml(items, extraClass) {
    return `<ul class="detail-list">${items.map((line) => `<li${extraClass ? ` class="${extraClass}"` : ""}>${line}</li>`).join("")}</ul>`;
  }

  /** detail-row 값이 배열이면(항목이 여러 개) 불릿 목록으로, 길게 이어붙인 문자열이면 문장/쉼표
   * 단위로 쪼개 불릿 목록으로 보여준다. 짧은 한 문장이면 그대로 둔다. */
  function detailValueHtml(v) {
    if (Array.isArray(v)) return bulletListHtml(v);
    const split = splitToBullets(v);
    if (split == null || split === "") return "";
    return bulletListHtml(Array.isArray(split) ? split : [split]);
  }

  /** "이상 기준"은 마지막 항목이 관례상 "언제 병원에 가야 하는지" 결론이라, 그 줄만
   * 강조 스타일(detail-list-action)로 구분해서 보여준다(이모지 없이 색·굵기로만 구분). */
  function abnormalSignsHtml(v) {
    const items = Array.isArray(v) ? v : typeof v === "string" ? [v] : [];
    if (!items.length) return "";
    return `<ul class="detail-list">${items
      .map((line, i) => `<li${i === items.length - 1 && items.length > 1 ? ` class="detail-list-action"` : ""}>${line}</li>`)
      .join("")}</ul>`;
  }

  /** 상세 팝업의 모든 행을 점(불릿) 목록으로 통일한다 — 값이 한 줄이어도 똑같이 점 들여쓰기로 보여준다.
   * (이미 목록·버튼 등 태그가 들어 있는 행은 건드리지 않고, 순수 텍스트 값만 감싼다.) */
  function bulletizePlainRows(html) {
    return html.replace(
      /(<div class="detail-row"><div class="label">[^<]*<\/div>)([^<]+?)(<\/div>)/g,
      (m, head, text, tail) => (text.trim() ? `${head}${bulletListHtml([text.trim()])}${tail}` : m)
    );
  }

  function detailBodyHtml(e) {
    return bulletizePlainRows(detailBodyHtmlRaw(e));
  }

  function detailBodyHtmlRaw(e) {
    if (e.isEngineEvent) {
      const inst = e.detail.instance;
      const td = e.detail.definition;
      const isSubsidy = e.category === "행정·지원금";
      const isVaccineOrCheckup = e.category === "예방접종" || e.category === "영유아검진";
      // 발달·생활·안전은 "정해진 일정을 완료"하는 항목이 아니라 "계속 관찰/관리"하는 항목이 많아서
      // 상태 라벨("지금 챙기세요")과 "완료 기준" 대신, 무엇을 관찰하면 되는지와 정상/비정상
      // 기준(+ 소아과·응급실 방문 시점)을 보여준다.
      const isObservationType = e.category === "발달관찰" || e.category === "생활·수유" || e.category === "안전·돌봄";
      const period = isVaccineOrCheckup ? periodTextFromWindow(inst.windowStart, inst.windowEnd) : null;
      if (isObservationType) {
        return `
          ${completed[e.id] ? `<div class="detail-row"><div class="label">현재 상태</div>${doneWords(e.category).state}</div>` : ""}
          <div class="detail-row"><div class="label">관찰 포인트</div>${detailValueHtml(td && td.observationGuide ? td.observationGuide : td ? td.parentAction : "")}</div>
          ${
            td && td.abnormalSigns
              ? `<div class="detail-row"><div class="label">이상 기준</div>${abnormalSignsHtml(td.abnormalSigns)}</div>`
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
      const infoRowsHtml = isVaccineOrCheckup && td
        ? `${td.about ? `<div class="detail-row"><div class="label">${e.category === "예방접종" ? "이 접종은" : "이 검진은"}</div>${detailValueHtml(td.about)}</div>` : ""}
        ${td.why ? `<div class="detail-row"><div class="label">왜 하나요</div>${detailValueHtml(td.why)}</div>` : ""}
        ${td.observationGuide ? `<div class="detail-row"><div class="label">주로 보는 것</div>${detailValueHtml(td.observationGuide)}</div>` : ""}
        ${td.abnormalSigns ? `<div class="detail-row"><div class="label">정상/비정상 기준</div>${detailValueHtml(td.abnormalSigns)}</div>` : ""}`
        : "";
      return `
        ${isPregnant() ? `<div class="detail-row"><div class="label">안내</div>출산 예정일(${formatDateKR(profile.birthDate)}) 기준 계산이에요. 실제 출산일에 따라 달라져요.</div>` : ""}
        <div class="detail-row"><div class="label">현재 상태</div>${inst.status === "DONE" || completed[e.id] ? doneWords(e.category).state : ENGINE_STATUS_LABEL[inst.status] || inst.status}</div>
        <div class="detail-row"><div class="label">해야 할 일</div>${detailValueHtml(td ? td.parentAction : "")}</div>
        ${
          isSubsidy
            ? `<div class="detail-row"><div class="label">신청·지급 기간</div>${subsidyDateLineForEngineEvent(e, true)}</div>`
            : period
            ? `<div class="detail-row"><div class="label">권장 시기</div>${period}</div>`
            : `<div class="detail-row"><div class="label">완료 기준</div>${detailValueHtml(td ? td.completionCriteria : "-")}</div>`
        }
        ${
          inst.needsReview
            ? `<div class="detail-row"><div class="label">안내</div>이 정보는 아직 검증이 더 필요해요. 정확한 내용은 공식기관에 확인해주세요.</div>`
            : ""
        }
        ${infoRowsHtml}
        <div class="detail-row"><div class="label">정보 출처</div>${td ? td.source : "-"}</div>
      `;
    }
    // 지자체(지역) 지원금 — 기존 로직 그대로
    const s = e.detail;
    const today = new Date();
    const ageNow = ageInMonths(profile.birthDate, today);
    const active = subsidyIsActiveNow(e, ageNow, today);
    const dueNote = isPregnant() ? `<div class="detail-row"><div class="label">안내</div>출산 예정일(${formatDateKR(profile.birthDate)}) 기준으로 계산한 기간이에요. 실제 출산일에 따라 달라질 수 있어요.</div>` : "";
    const statusLine = isPregnant() && e.periods && e.periods.length
      ? prenatalStatusText(e.periods, profile.birthDate, today)
      : active
      ? e.deadlineDate
        ? `지금 신청 가능 · ${formatDateKR(e.deadlineDate)}까지`
        : "지금 신청 가능"
      : today < e.entryDate
      ? `${formatDateKR(e.entryDate)}부터 신청 가능`
      : e.deadlineDate
      ? `신청 기한 지남(${formatDateKR(e.deadlineDate)}까지였어요)`
      : `신청 기한이 지났을 수 있어요 (${e.dateLabel})`;
    return `
      ${dueNote}
      ${e.needsCheck ? `<div class="detail-row"><div class="label">상태</div>추가 조건·최신 시행 여부 확인 필요</div>` : ""}
      <div class="detail-row"><div class="label">지원 대상</div>${detailValueHtml(s.target)}</div>
      <div class="detail-row"><div class="label">지원 금액</div>${detailValueHtml(s.amountText)}</div>
      <div class="detail-row"><div class="label">신청·지급 기간</div>${
        subsidyPeriodRows(e.id, s, profile.birthDate).length
          ? subsidyPeriodHtml(subsidyPeriodRows(e.id, s, profile.birthDate), statusLine)
          : statusLine
      }</div>
      <div class="detail-row"><div class="label">지급 방식</div>${detailValueHtml(s.paymentMethod || "확인 필요")}</div>
      <div class="detail-row"><div class="label">거주 조건</div>${detailValueHtml(s.residencyRequirement || "-")}</div>
      <div class="detail-row"><div class="label">추가 자격 조건</div>${detailValueHtml(s.additionalConditions || "-")}</div>
      <div class="detail-row"><div class="label">정보 출처</div>${s.sourceName}</div>
      <div class="detail-row"><div class="label">최종 확인일</div>${s.lastVerified}</div>
      ${s.notes ? `<div class="detail-row"><div class="label">비고</div>${detailValueHtml(s.notes)}</div>` : ""}
    `;
  }

  function openDetail(e, cameFromDayList) {
    modalMode = "detail";
    const meta = CATEGORY_META[e.category];
    const isDone = !!completed[e.id];
    const showBack = cameFromDayList && currentDayContext && currentDayContext.events.length > 1;
    let completionRowHtml = "";
    let doneDateValue = "";
    if (isDone) {
      const rec = completed[e.id];
      const doneAt = rec && rec.recordedAt ? new Date(rec.recordedAt) : new Date();
      doneDateValue = localDateInputValue(doneAt);
      completionRowHtml = `
        <div class="detail-row completion-row">
          <div class="label">${isVaccinationLike(e.category) ? "완료일" : "확인일"}</div>
          <div class="completion-line">
            <span id="completion-text">${formatDateKR(doneAt)}</span>
            <button type="button" class="completion-change" id="btn-change-completion">${isVaccinationLike(e.category) ? "완료일 변경" : "확인일 변경"}</button>
          </div>
          <div class="completion-edit hidden" id="completion-edit">
            <input type="date" id="completion-date-input" value="${doneDateValue}" max="${localDateInputValue(new Date())}" />
            <button type="button" class="completion-save" id="btn-save-completion">저장</button>
          </div>
        </div>`;
    }
    el("modal-content").innerHTML = `
      <span class="cat-badge" style="background:${meta.color}">${meta.label}</span>${
        subsidyProvider(e) ? `<span class="scope-tag detail-tag">${subsidyProvider(e).short}</span>` : ""
      }${subsidyAudienceLabel(e) ? `<span class="aud-tag detail-tag">${subsidyAudienceLabel(e)}</span>` : ""}
      <h3>${e.title}</h3>
      ${detailBodyHtml(e)}
      ${e.officialUrl ? `<a class="btn-official" href="${e.officialUrl}" target="_blank" rel="noopener">공식 안내 페이지로 이동</a>` : ""}
      ${completionRowHtml}
      <button class="btn-complete" id="btn-toggle-complete">${isDone ? doneWords(e.category).undo : doneWords(e.category).mark}</button>
      ${showBack ? `<button class="btn-close" id="btn-back-to-day">← 이 날 목록으로</button>` : ""}
      <button class="btn-close" id="btn-close-modal">닫기</button>
    `;
    el("detail-modal").classList.remove("hidden");
    el("btn-close-modal").addEventListener("click", closeDetail);
    el("btn-toggle-complete").addEventListener("click", () => toggleComplete(e.id));
    const dateInput = el("completion-date-input");
    if (dateInput) {
      el("btn-change-completion").addEventListener("click", () => {
        el("completion-edit").classList.toggle("hidden");
        dateInput.focus();
      });
      el("btn-save-completion").addEventListener("click", () => setCompletionDate(e.id, dateInput.value));
    }
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

  async function buildAndRender() {
    await ensureRegionSubsidyLoaded();
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

  /** 임신 중 → 출산 후 전환: 실제 출생일을 입력받아 stage를 born으로 바꾼다. */
  function showBornSwitchSheet() {
    modalMode = "profile";
    const todayIso = toISODate(new Date());
    const dueIso = toISODate(profile.birthDate);
    el("modal-content").innerHTML = `
      <h3>출산을 축하드려요! 🎉</h3>
      <p class="fine-print">아이가 태어난 날을 알려주세요. 입력한 날짜 기준으로 검진·접종·지원금 기간이 다시 계산돼요.</p>
      <input type="date" id="born-date" class="born-switch-date" max="${todayIso}" value="${dueIso > todayIso ? todayIso : dueIso}" />
      <button class="btn-complete" id="btn-confirm-born">아이 정보로 바꾸기</button>
      <button class="btn-close" id="btn-cancel-born">취소</button>
    `;
    el("btn-cancel-born").addEventListener("click", closeDetail);
    el("btn-confirm-born").addEventListener("click", async () => {
      const v = el("born-date").value;
      if (!v) return;
      profile.birthDate = new Date(v + "T00:00:00");
      profile.stage = "born";
      saveProfile(profile);
      if (familyCode) {
        try {
          await FamilySync.updateProfile(familyCode, profileToPlain(profile));
        } catch (e) {
          console.error(e);
        }
      }
      closeDetail();
      await buildAndRender();
    });
  }

  let landingStage = null;
  const STAGE_TEXT = {
    born: {
      sub: "아이 생년월일과 사는 지역만 알려주시면<br />건강검진·예방접종·지원금·발달까지 한 캘린더에서 챙겨드려요.",
      name: "아이 이름 또는 별칭", placeholder: "예: 하은이, 콩이",
      birth: "아이 생년월일", order: "몇째 아이인가요?", submit: "우리 아이 캘린더 만들기",
    },
    pregnant: {
      sub: "출산 예정일과 사는 지역만 알려주시면<br />임신 중 지원금부터 출산 후 검진·접종·지원금까지 한 캘린더에서 챙겨드려요.",
      name: "태명 또는 별칭", placeholder: "예: 콩이, 튼튼이",
      birth: "출산 예정일", order: "몇째 아이가 태어날 예정인가요?", submit: "임신·출산 캘린더 만들기",
    },
  };

  function setLandingStage(stage) {
    landingStage = stage;
    const t = STAGE_TEXT[stage || "born"];
    el("hero-sub").innerHTML = t.sub;
    el("lbl-name").innerHTML = `${t.name} <span class="req">*</span>`;
    el("childName").placeholder = t.placeholder;
    el("lbl-birth").innerHTML = `${t.birth} <span class="req">*</span>`;
    el("lbl-order").innerHTML = `${t.order} <span class="req">*</span>`;
    el("btn-submit").textContent = t.submit;
    el("stage-choice").classList.toggle("hidden", !!stage);
    el("query-form").classList.toggle("hidden", !stage);
    resetBirthDatePicker();
  }

  async function handleSubmit(ev) {
    ev.preventDefault();
    const name = el("childName").value.trim();
    const birthDateStr = el("birthDate").value;
    const birthOrder = el("birthOrder").value;
    const province = el("province").value;
    const district = el("district").value;
    el("field-order").classList.toggle("invalid", !birthOrder);
    el("field-region").classList.toggle("invalid", !province || !district);
    if (!name || !birthDateStr || !birthOrder || !province || !district) {
      const first = !name ? el("childName") : !birthDateStr ? el("birthDateBtn") : !birthOrder ? el("field-order") : el("field-region");
      first.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    profile = { name, birthDate: new Date(birthDateStr + "T00:00:00"), birthOrder, stage: landingStage || "born", province, district };
    saveProfile(profile);
    await buildAndRender();
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
      await buildAndRender();
      showCalendarView();
    } catch (e) {
      console.error(e);
      el("code-error").classList.remove("hidden");
    }
  }

  function handleReset() {
    localStorage.removeItem(PROFILE_KEY);
    // 완료 기록도 함께 비운다 — 남겨 두면 새로 만든 아이(새 가족코드)에 이전 아이의 완료 상태가 섞여 들어간다.
    completed = {};
    saveCompleted();
    FamilySync.clearCode();
    if (unsubscribeFamily) unsubscribeFamily();
    familyCode = null;
    profile = null;
    el("query-form").reset();
    setLandingStage(null);
    updateBrandText();
    showLandingView();
  }

  /** 헤더의 + 버튼 — 새 아이를 처음부터 입력한다(새 가족코드 생성). 기존 아이는 가족코드로 다시 불러올 수 있다. */
  function showNewChildSheet() {
    modalMode = "new-child";
    el("modal-content").innerHTML = `
      <h3>새 아이 추가</h3>
      <p class="fine-print">새 아이 정보를 입력하면 새 가족코드가 만들어지고 완료 기록도 새로 시작해요.${
        familyCode ? `<br />지금 아이의 가족코드 <strong>${familyCode}</strong>는 저장돼 있으니, 나중에 처음 화면에서 코드를 입력하면 다시 불러올 수 있어요.` : ""
      }</p>
      <button class="btn-complete" id="btn-confirm-new-child">새 아이 입력하기</button>
      <button class="btn-close" id="btn-cancel-new-child">취소</button>
    `;
    el("detail-modal").classList.remove("hidden");
    el("btn-cancel-new-child").addEventListener("click", closeDetail);
    el("btn-confirm-new-child").addEventListener("click", () => {
      closeDetail();
      handleReset();
    });
  }

  async function init() {
    await loadAll();
    populateProvinces();
    completed = loadCompleted();
    // 카테고리 필터는 저장·복원하지 않는다 — 앱을 켤 때마다 6개 전체 ON으로 시작한다.
    // (예전에 저장된 값 때문에 지원금만 켜진 채 시작하는 문제가 있었다)
    try { localStorage.removeItem(ACTIVE_CATS_KEY); } catch (e) {}

    el("province").addEventListener("change", (e) => populateDistricts(e.target.value));
    document.querySelectorAll("#order-chips .order-chip").forEach((b) =>
      b.addEventListener("click", () => {
        el("birthOrder").value = b.dataset.value;
        el("field-order").classList.remove("invalid");
        syncOrderChips();
      })
    );
    el("query-form").addEventListener("submit", handleSubmit);
    el("btn-show-code-entry").addEventListener("click", () => el("code-entry").classList.toggle("hidden"));
    el("btn-load-code").addEventListener("click", handleLoadCode);
    initBirthDatePicker();
    document.querySelectorAll(".stage-btn").forEach((b) => b.addEventListener("click", () => setLandingStage(b.dataset.stage)));
    el("btn-stage-back").addEventListener("click", () => setLandingStage(null));
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
    el("btn-add-child").addEventListener("click", showNewChildSheet);

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
      el("birthOrder").value = profile.birthOrder || "";
      syncOrderChips();
      renderProvinceChips();
      renderDistrictChips();
      setBirthDatePicker(profile.birthDate);
      await buildAndRender();
      showCalendarView();
    }
  }

  init();
})();
