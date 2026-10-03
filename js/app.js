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
  let autoIdAliases = {}; // C2: 데이터 수정으로 AUTO id 가 바뀐 경우의 { 옛 id: 새 id }(data/auto-id-aliases.json) — autoLink 플래그가 켜졌을 때만 읽는다
  let calView = "month"; // 캘린더 보기("month"|"week") — 주 보기는 가구가 있을 때만(F2)
  viewMonth.setDate(1);
  let currentDayContext = null; // { events, date } — 날짜 클릭으로 연 일정 여러 개 목록
  let modalMode = null; // "day-list" | "detail" | "profile"
  let currentTab = "home"; // "home" | "calendar" | "record" | "subsidy" | "checklist"(전체 할 일 서브 화면) | "places"(가구·계정 기능이 켜졌을 때만 하단 탭)
  let checklistScope = null; // 홈의 "전체 보기"로 들어왔을 때만 { label, ids:Set } — 그 항목들만 보여준다
  let showPastInfant = false; // N5: 72개월 넘은 아이의 체크리스트에서 지난 영유아 항목(미완료)을 보일지(기본 꺼짐, 앱 세션 동안만)
  let checklistStatus = "all"; // 전체 할 일의 완료 상태 필터: "all" | "todo" | "done"
  let openMonthGroups = null; // 전체 체크리스트의 월령별 아코디언 펼침 상태(Set<월령>). null=아직 초기화 전(기본은 현재 월령만 펼침)
  let selectedCalendarDate = new Date(); // 달력 탭에서 선택된 날짜(기본값: 오늘)

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

  // 학교 정책(A6-2): 읽기 실패·형식 오류는 빈 정책 → ChildTimeline 이 school:null 로 처리한다(기존 동작). 파일은 첫 화면 전에 로드를 마친다(loadAll).
  let schoolPolicy = {};
  async function loadSchoolPolicy() {
    if (typeof SchoolPolicy === "undefined") return {};
    return SchoolPolicy.load(fetch);
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
    "data/todos/school.json",
    "data/todos/school-age.json",
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

  // 폴더 구조 2종: seoul = {슬러그}/city.json + {슬러그}/districts/{시군구}.json,
  // gyeonggi = {슬러그}/city.json + {슬러그}/{시군구}/subsidies.json
  const SPLIT_SUBSIDY_PROVINCES = new Set(["seoul"]);
  // 서울 외 시·도는 모두 {슬러그}/city.json + {슬러그}/{시군구}/subsidies.json 구조.
  const DISTRICT_FOLDER_PROVINCES = new Set(Object.values(PROVINCE_SLUG).filter((s) => s !== "seoul"));

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
    if (slug && SPLIT_SUBSIDY_PROVINCES.has(slug)) {
      // 시·도 폴더 구조: {슬러그}/city.json(시·도 공통) + {슬러그}/districts/{시군구}.json
      paths.push(`data/subsidies/${slug}/city.json`);
      if (district) paths.push(`data/subsidies/${slug}/districts/${district}.json`);
    } else if (slug && DISTRICT_FOLDER_PROVINCES.has(slug)) {
      paths.push(`data/subsidies/${slug}/city.json`);
      if (district) paths.push(`data/subsidies/${slug}/${district}/subsidies.json`);
    } else if (slug) {
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
    const [regions, reform, policy, ...categoryFiles] = await Promise.all([
      loadJson("data/regions.json"),
      loadJsonOrNull("data/subsidies/reform-2027.json"),
      loadSchoolPolicy(),
      ...TODO_CATEGORY_FILES.map(loadJson),
    ]);
    regionsData = regions;
    schoolPolicy = policy;
    reformConfig = reform;
    // 건강검진·예방접종·성장발달(및 이유식/구강/수면/안전/생활/보육)은 카테고리별 파일
    // (data/todos/*.json, 총 75개 TodoDefinition) + js/todo-engine.js로 계산한다.
    // 지자체 지원금(dataset.subsidy)은 프로필의 지역이 정해진 뒤 ensureRegionSubsidyLoaded()가 채운다.
    const todoDefinitions = categoryFiles.flatMap((f) => f.todos).map(applyBirthRule);
    dataset = { todoDefinitions, subsidy: { subsidies: [] } };
    // C2: autoLink 플래그가 켜진 기기만 별칭 파일을 읽는다(꺼져 있으면 네트워크 요청도 없다). 실패·형식 오류는 빈 맵으로 진행한다.
    autoIdAliases = window.FEATURES && window.FEATURES.autoLink === true ? sanitizeAliases(await loadJsonOrNull("data/auto-id-aliases.json")) : {};
  }
  /** 별칭 파일 → { 옛 id: 새 id }(문자열 쌍만). 객체가 아니면 빈 맵. */
  function sanitizeAliases(raw) {
    const out = {};
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
    for (const [k, v] of Object.entries(raw)) if (typeof v === "string" && /^[A-Za-z0-9-]+__[A-Za-z0-9-]+$/.test(k) && /^[A-Za-z0-9-]+__[A-Za-z0-9-]+$/.test(v)) out[k] = v;
    return out;
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

  /** 가족코드가 있으면 이번 조작에서 바뀐 completed 키만 한 번의 update 로 보낸다(맵 통째 교체 아님, C1). before = 변경 전 `{ ...completed }`. */
  function syncCompletedChanges(before) {
    if (!familyCode) return;
    // 옛 sync.js 와 새 app.js 가 섞여 서빙되면(캐시 혼재) 새 함수가 없다 — 예외를 던지지 말고 옛 동작(맵 통째 교체)으로 폴백한다.
    if (typeof FamilySync.updateCompletedEntries !== "function" || typeof FamilySync.diffCompleted !== "function") {
      FamilySync.updateCompleted(familyCode, completed).catch((e) => console.error(e));
      return;
    }
    FamilySync.updateCompletedEntries(familyCode, FamilySync.diffCompleted(before, completed)).catch((e) => console.error(e));
  }

  function profileToPlain(p) {
    return {
      name: p.name || "",
      birthDate: toISODate(p.birthDate),
      birthOrder: p.birthOrder || null,
      stage: p.stage || "born",
      province: p.province,
      district: p.district,
      // null로 보내야 set({merge:true})가 서버의 기존 사진을 지운다(필드 생략하면 그대로 남음).
      photoDataUrl: p.photoDataUrl || null,
      // 초등 입학 시기(조기입학·입학 연기). 기본이면 null 로 보내 서버 값을 지운다(위 사진과 같은 merge 규칙).
      enrollmentYearOverride: Number.isInteger(p.enrollmentYearOverride) ? p.enrollmentYearOverride : null,
    };
  }

  /** 현재 프로필(사진 포함)을 가족 문서에 올린다 — 같은 가족코드를 쓰는 다른 기기에서도 같은 프로필·사진이 보인다. */
  function pushProfileToFamily() {
    if (!familyCode || !profile) return Promise.resolve();
    return FamilySync.updateProfile(familyCode, profileToPlain(profile)).catch((e) => console.error("프로필 동기화 실패", e));
  }

  function profileFromPlain(p) {
    return {
      name: p.name || "",
      birthDate: new Date(p.birthDate + "T00:00:00"),
      birthOrder: p.birthOrder || null,
      stage: p.stage || "born",
      province: p.province,
      district: p.district,
      // 사진도 가족 문서(profile.photoDataUrl)에 들어 있으므로 다른 기기에서 가족코드로 불러와도 함께 복원한다.
      ...(p.photoDataUrl ? { photoDataUrl: p.photoDataUrl } : {}),
      ...(Number.isInteger(p.enrollmentYearOverride) ? { enrollmentYearOverride: p.enrollmentYearOverride } : {}),
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
      // 사진만 바뀐 경우엔 일정을 다시 계산(=홈으로 이동)하지 않고 화면의 사진만 갱신한다.
      const noPhoto = (p) => ({ ...profileToPlain(p), photoDataUrl: null });
      const profileChanged = JSON.stringify(noPhoto(profileFromPlain(data.profile))) !== JSON.stringify(noPhoto(profile));
      profile = profileFromPlain(data.profile);
      completed = data.completed || {};
      saveProfile(profile);
      saveCompleted();
      if (data.records) HNRecords.mergeRemote(data.records);
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
      HNRecords.adopt(familyCode);
      rememberChild();
      hhLinkNewChild();
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
    "SB-04": [RETRO60, { label: "지급·신청 기간", start: M(0), end: "만 9세 미만(연도별 상향)", note: "상한 나이는 연도별로 조금씩 올라가요 — 60일 뒤 신청은 신청한 달부터 지급" }],
    "SB-05": [
      { label: "소급 신청(24개월분 전액)", start: M(0), end: DAYS(60), note: "60일 이후 신청하면 신청일부터 지원" },
      { label: "지원 종료", start: null, end: M(24, -1), note: "만 2세 전날까지" },
    ],
    "SB-06": [
      { label: "신청 기한", start: "최종 퇴원 후", end: "퇴원일로부터 6개월", note: "퇴원일이 기준이라 출생일만으로는 날짜를 계산할 수 없어요. 퇴원일을 확인해 6개월 안에 신청하세요" },
      { label: "선천성이상아 진단·입원 인정 기간", start: M(0), end: M(24, -1), note: "출생 후 2년 이내 진단·입원·수술한 경우(미숙아는 출생 후 24시간 이내 신생아집중치료실 입원)" },
    ],
    "SB-07": [{ label: "지원 기간", start: M(0), end: M(72, -1), note: "만 0~5세, 어린이집 입소 후 신청일부터 적용(소급 불가)" }],
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
        const text = a && b ? `${a} ~ ${b}` : b ? `${b}까지` : a ? `${a}부터` : "관할 기관 안내 참고";
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
      else if (legacy.deadlineType === "unconfirmed") specs = [{ label: "신청 기한", start: null, end: null, note: "신청 기한은 관할 기관 안내를 따라요" }];
      else specs = [{ label, start: end ? M(minA) : null, end, note }];
    }
    return (specs || []).map((r) => {
      const a = fmt(r.start);
      const b = fmt(r.end);
      const text = a && b ? `${a} ~ ${b}` : b ? `${b}까지` : a ? `${a}부터` : "관할 기관 안내 참고";
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

  // 생년월일 달력 팝업은 js/date-picker.js 가 담당한다(온보딩과 아이 정보 수정이 같은 동작·모양).
  // 연도 하한은 ChildTimeline.SERVICE_RANGE.pickerYearsBack(올해 초등 6학년의 출생연도)이고, 임신 중은 오늘~+300일.
  let birthPicker = null;
  const datePickerOpts = (getStage) => ({ getStage, yearsBack: ChildTimeline.SERVICE_RANGE.pickerYearsBack, format: formatDateKR, placeholder: "날짜를 선택해주세요" });

  function setBirthDatePicker(date) {
    birthPicker.set(date);
  }

  function resetBirthDatePicker() {
    birthPicker.reset();
  }

  function initBirthDatePicker() {
    birthPicker = HNDatePicker.bind(
      {
        btn: el("birthDateBtn"), display: el("birthDateDisplay"), hidden: el("birthDate"), popup: el("birthDatePopup"),
        prevYear: el("dp-prev-year"), prevMonth: el("dp-prev-month"), nextMonth: el("dp-next-month"), nextYear: el("dp-next-year"),
        yearSel: el("dp-year"), monthSel: el("dp-month"), grid: el("dp-grid"),
      },
      datePickerOpts(() => landingStage)
    );
  }

  function renderFilterChips() {
    ["filter-chips-checklist"].forEach(renderFilterChipsInto);
  }

  function renderFilterChipsInto(containerId) {
    const wrap = el(containerId);
    if (!wrap) return;
    const allOn = Object.keys(CATEGORY_META).every((k) => activeCats.has(k));
    // G15-4: 계정 모드에서만 '전체'를 맨 앞에(OFF 는 기존 맨 끝 그대로)
    const allFirst = containerId === "filter-chips-checklist" && typeof acctEnabled === "function" && acctEnabled();
    const allBtn = `<button class="chip chip-all ${allOn ? "active" : ""}" data-cat="__all">전체</button>`;
    wrap.innerHTML =
      (allFirst ? allBtn : "") +
      Object.entries(CATEGORY_META)
        .map(([key, meta]) => {
          const active = activeCats.has(key);
          const style = active
            ? `background:${meta.color};border-color:transparent;`
            : `color:${meta.color};border-color:${meta.color};`;
          return `<button class="chip ${active ? "active" : ""}" data-cat="${key}" style="${style}">${meta.label}</button>`;
        })
        .join("") +
      // 맨 끝 "전체" — 전부 켜져 있으면 눌러서 전부 끄고, 하나라도 꺼져 있으면 눌러서 전부 켠다.
      (allFirst ? "" : allBtn);
    wrap.querySelectorAll(".chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        const cat = chip.getAttribute("data-cat");
        // "전체" 토글: 전부 켜져 있으면 전부 끄고, 하나라도 꺼져 있으면 전부 켠다.
        if (cat === "__all") activeCats = Object.keys(CATEGORY_META).every((k) => activeCats.has(k)) ? new Set() : new Set(Object.keys(CATEGORY_META));
        else if (activeCats.has(cat)) activeCats.delete(cat);
        else activeCats.add(cat);
        renderFilterChips();
        renderAll();
      });
    });
  }

  // 서비스 범위(ChildTimeline.SERVICE_RANGE, 생후 0~72개월)를 넘지 않는 항목만 보인다 — 지원금처럼 범위 이후까지
  // 수급기간이 이어지는 항목도 "언제부터 챙겨야 하는지"(e.date 기준 월령)가 범위 이내면 보여주고, 그 이후에 처음
  // 시작되는 항목만 걸러낸다. 단 마일스톤·끝 없는 정의·지원금은 기존 범위(LEGACY_TODO_CAP_MONTHS=36)로 보존한다
  // (ChildTimeline.isEventVisible — A6-3).
  function visibleSchedule(ignoreCategoryFilter) {
    return schedule.filter((e) => (ignoreCategoryFilter || activeCats.has(e.category)) && ChildTimeline.isEventVisible(profile.birthDate, e) && !isNotApplicable(e.id));
  }

  // "미해당" 표시 — 나에게 해당하지 않는 혜택. completed 맵에 `${id}__na` 키로 저장한다(완료·가족 동기화 경로를
  // 그대로 쓰고, 엔진은 recordType이 TODO_COMPLETED가 아닌 항목을 보지 않으므로 계산에 영향이 없다).
  // 달력·홈·혜택 탭·전체 할 일에서는 빠지고, 기록 탭의 "미해당 항목 보기"에서 확인·되돌릴 수 있다.
  const NA_SUFFIX = "__na";
  function isNotApplicable(id) {
    return !!completed[id + NA_SUFFIX];
  }
  function setNotApplicable(id, on) {
    const before = { ...completed };
    if (on) {
      delete completed[id];
      completed[id + NA_SUFFIX] = { done: true, todo_id: id.split("__")[0], occurrenceKey: "default", recordType: "NOT_APPLICABLE", recordedAt: new Date().toISOString() };
    } else {
      delete completed[id + NA_SUFFIX];
    }
    saveCompleted();
    syncCompletedChanges(before);
    closeDetail();
    refreshSchedule();
  }

  /** 달력·기록은 체크리스트의 카테고리 필터와 무관하게 늘 전체 카테고리를 보여준다. */
  function calendarSchedule() {
    return visibleSchedule(true);
  }

  /** 기간형 AUTO(§14, hn-logic periodRangeOf): 시작 월령 > 36 인 monthly 엔진 항목. 해당하면 {startKey,start,end}, 아니면 null. 계산만 하고 저장하지 않는다. */
  function periodRangeOf(e) {
    return HNLogic.periodRangeOf(e, {
      birthDate: profile.birthDate,
      monthKeysOf,
      guardMonths: ChildTimeline.LEGACY_TODO_CAP_MONTHS,
      maxMonths: ChildTimeline.SERVICE_RANGE.maxMonths,
    });
  }
  /** 달력 칸(점·추천일·진행현황·월령 체크)에 올리는 항목 — 기간형 AUTO 는 칸에 찍지 않으므로 뺀다. */
  function calendarDotSchedule() {
    return calendarSchedule().filter((e) => !periodRangeOf(e));
  }
  // ── E(1-3) 홈 순서용: 이 기기 아이들의 생년월일(가장 어린 아이 판단). 가구 플래그가 켜진 기기에서만 기록한다. ──
  const CHILD_BIRTHS_KEY = "hannun_child_births";
  function rememberChildBirth() {
    if (!hhEnabled() || !familyCode || !profile || isPregnant()) return;
    try {
      const m = JSON.parse(localStorage.getItem(CHILD_BIRTHS_KEY) || "{}") || {};
      m[familyCode] = toISODate(profile.birthDate);
      localStorage.setItem(CHILD_BIRTHS_KEY, JSON.stringify(m));
    } catch (e) {}
  }
  /** 이 기기 아이들 [{ birthDate, stage }] — 지금 아이 + 기억해 둔 다른 아이(생년월일을 모르면 빠진다). */
  function homeKids() {
    let births = {};
    try { births = JSON.parse(localStorage.getItem(CHILD_BIRTHS_KEY) || "{}") || {}; } catch (e) {}
    const kids = loadChildren().filter((c) => c && c.code !== familyCode).map((c) => ({ birthDate: births[c.code], stage: c.stage }));
    if (profile) kids.push({ birthDate: profile.birthDate, stage: isPregnant() ? "pregnant" : "born" });
    return kids;
  }
  /** 이 달(연·월)과 기간이 겹치고 아직 완료하지 않은 기간형 AUTO. 시작 월령이 속한 달부터 서비스 상한까지 완료 전까지 계속 나온다. */
  function periodAutoInMonth(year, month) {
    const first = new Date(year, month, 1);
    const last = new Date(year, month + 1, 0);
    const out = [];
    for (const e of calendarSchedule()) {
      const r = periodRangeOf(e);
      if (r && !completed[e.id] && r.start <= last && r.end >= first) out.push({ e, range: r });
    }
    return out.sort((a, b) => a.range.start - b.range.start || (a.e.id < b.e.id ? -1 : 1));
  }
  /** 기간형 AUTO 의 기간 문구 — 엔진 window 가 먼저 끝나도 화면의 기간(시작 월령~서비스 상한)과 어긋나지 않게 만 나이 범위로 말한다. 기간형이 아니면 null. */
  function periodAutoText(e) {
    const r = periodRangeOf(e);
    return r ? `만 ${Math.floor(r.startKey / 12)}~${Math.floor(ChildTimeline.SERVICE_RANGE.maxMonths / 12)}세 사이` : null;
  }
  /** 기간형 항목 묶음 이름 — "4~6세 추가접종". 시작 월령~서비스 상한의 만 나이 범위 + 접종이면 "추가접종". */
  function periodGroupLabel(e, range) {
    const from = Math.floor(range.startKey / 12);
    const to = Math.floor(ChildTimeline.SERVICE_RANGE.maxMonths / 12);
    const meta = CATEGORY_META[e.category];
    return `${from}~${to}세 ${e.category === "예방접종" ? "추가접종" : meta ? meta.label : e.category}`;
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
      el("profile-name-age").textContent = `${childDisplayName()} · ${ChildTimeline.ageLabelAt(profile.birthDate, today)}`;
    }
    el("profile-location-text").textContent = `${profile.province} ${profile.district}`;
    el("profile-avatar").innerHTML = avatarInnerHTML(profile.photoDataUrl, childDisplayName());
    acctRenderMeLine();
  }
  /** Q1: 계정 모드에서 로그인한 사람의 '내 이름 · 나(역할)'. 계정(accounts)과 내 구성원(members) 기준이며 아이 이름과 섞이지 않는다. 없으면 null. */
  function acctIdentity() {
    if (!acctEnabled() || !acct.user) return null;
    const meId = usMeId();
    const m = meId ? usMembers().find((x) => x.memberId === meId) : null;
    const name = (acct.account && acct.account.displayName) || (m && m.label) || acct.user.displayName || "";
    const roleName = m ? HouseholdView.roleLabelOf(m) : acct.account && acct.account.role ? ((AccountView.ROLES.find(([k]) => k === acct.account.role) || [])[1] || "").replace(/\(.*\)/, "") : "";
    return name ? { name, roleName } : null;
  }
  /** 홈 프로필 카드 위에 '주연 · 나(엄마)' 한 줄(로그인 상태에서만, 없으면 숨김). 마크업은 이 함수가 만든다(OFF 화면 HTML 불변). */
  function acctRenderMeLine() {
    const strong = el("profile-name-age");
    const box = strong && strong.parentNode;
    if (!box) return;
    const old = box.querySelector && box.querySelector("#profile-me-line");
    if (old) old.remove(); // G13-3: 별도 줄 대신 홈 맨 위 프로필 카드 자체가 '나'(아이는 아래 '챙길 것' 머리에서 보인다)
    const card = el("btn-profile-card");
    const id = acctIdentity();
    if (card && card.classList) card.classList.toggle("acct-me", !!id);
    if (!id) return; // 로그인 전·플래그 OFF: renderProfileHeader 가 쓴 아이 이름·나이 그대로
    strong.textContent = id.roleName ? `${id.name} · ${AccountView.MSG.myRole(id.roleName)}` : id.name;
    if (el("profile-avatar")) el("profile-avatar").innerHTML = PERSON_ICON_SVG;
  }
  /** G13-3: 홈 '챙길 것' 머리에 보일 지금 아이 한 줄("은찬 · 생후 3개월" / 임신 중이면 주수·D-day). */
  function acctHomeChildText() {
    const today = new Date();
    if (isPregnant()) {
      const pi = pregnancyInfo(profile.birthDate, today);
      return `${childDisplayName()} · 임신 ${pi.weeks}주`;
    }
    return `${childDisplayName()} · ${ChildTimeline.ageLabelAt(profile.birthDate, new Date())}`;
  }
  /** 이 기기에서 볼 수 있는 아이 목록(분리된 아이 제외) — 두 명 이상이면 홈에 아이 칩. */
  function acctHomeChildren() {
    if (!hhEnabled()) return [];
    const list = HouseholdView.mergeChildren(loadChildren(), hh.hid ? HouseholdSync.getMirror(hh.hid) : null, familyCode);
    const out = list.filter((c) => !c.removed).map((c) => ({ code: c.code, name: c.name || "", current: c.code === familyCode }));
    // 지금 보는 아이는 기기 목록·가구 미러에 아직 없어도(방금 등록) 항상 칩에 포함한다
    if (familyCode && profile && !out.some((c) => c.code === familyCode)) out.push({ code: familyCode, name: childDisplayName(), current: true });
    return out;
  }

  /** 프로필 카드를 탭하면 뜨는 바텀시트 — 상세정보 + 가족코드 복사 + 정보 다시 입력. */
  /**
   * pendingPhoto: undefined = 사진 변경 없음, null = 삭제 예정, 문자열 = 새로 고른 사진(미리보기).
   * 사진을 고르면 바로 이 팝업에서 미리 보이고, "저장"을 눌러야 실제로 적용된다.
   */
  // 초등 입학 시기(조기입학·입학 연기) — 36개월 이상이고 학교 정책이 확인된 아이에게만 보인다. 기본이면 필드를 지운다.
  const ENROLL_MSG = Object.freeze({
    title: "초등 입학 시기",
    chips: { default: "출생연도 기준(기본)", early: "한 해 일찍", late: "한 해 늦게" },
    current: (y) => `입학 학년도 ${y}년`,
    hint: "기본은 출생연도 기준이에요. 조기입학·입학 연기를 신청했다면 바꿔 주세요(신청 10/1~12/31).",
  });
  function enrollmentRowHtml() {
    if (isPregnant() || ageInMonths(profile.birthDate, new Date()) < 36) return "";
    const o = ChildTimeline.enrollmentOptions(profile.birthDate, new Date(), schoolPolicy, profile.enrollmentYearOverride);
    if (!o) return "";
    const chips = o.options.map((x) => `<button type="button" class="hh-chip${o.current === x.key ? " active" : ""}" data-enroll="${x.key}">${esc(ENROLL_MSG.chips[x.key])}</button>`).join("");
    return `<div class="detail-row"><div class="label">${ENROLL_MSG.title}</div><div class="hh-chips">${chips}</div><p class="fine-print">${esc(ENROLL_MSG.current(o.currentYear))}<br />${esc(ENROLL_MSG.hint)}</p></div>`;
  }
  async function onEnrollChip(key) {
    const o = ChildTimeline.enrollmentOptions(profile.birthDate, new Date(), schoolPolicy, profile.enrollmentYearOverride);
    const pick = o && o.options.find((x) => x.key === key);
    if (!pick) return;
    if (key === "default") delete profile.enrollmentYearOverride;
    else profile.enrollmentYearOverride = pick.year;
    saveProfile(profile);
    pushProfileToFamily();
    await buildAndRender();
    showProfileSheet();
  }
  /** 계정 모드: 전환할 수 있는 아이 수(이 기기 목록 + 가구 링크, 분리된 아이 제외). */
  function acctKidCount() {
    try {
      return HouseholdView.mergeChildren(loadChildren(), hh.hid ? HouseholdSync.getMirror(hh.hid) : null, familyCode).filter((c) => !c.removed).length;
    } catch (e) {
      return 0;
    }
  }
  function showProfileSheet(pendingPhoto) {
    if (pendingPhoto && pendingPhoto.type) pendingPhoto = undefined; // 클릭 이벤트가 인자로 넘어온 경우
    modalMode = "profile";
    const today = new Date();
    const ageNow = ageInMonths(profile.birthDate, today);
    const changed = pendingPhoto !== undefined;
    const shownPhoto = changed ? pendingPhoto : profile.photoDataUrl;
    el("modal-content").innerHTML = `
      ${acctEnabled() ? '<div id="acct-slot"></div>' : ""}
      <div class="profile-photo-row">
        <span class="avatar profile-sheet-avatar">${avatarInnerHTML(shownPhoto, childDisplayName())}</span>
        <div class="profile-photo-actions">
          <input type="file" accept="image/*" id="photo-input" class="hidden" />
          <button type="button" class="btn-photo" id="btn-photo-upload">${shownPhoto ? "사진 변경" : "사진 추가"}</button>
          ${shownPhoto ? `<button type="button" class="btn-photo-remove" id="btn-photo-remove">삭제</button>` : ""}
        </div>
      </div>
      <div class="profile-name-row">
        <h3>${esc(childDisplayName())}</h3>
        <button type="button" class="btn-edit-icon" id="btn-open-reset" aria-label="${isPregnant() ? "임신 정보 수정" : "아이 정보 수정"}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/><path d="M13.5 6.5l4 4"/></svg>
        </button>
      </div>
      <div class="detail-row"><div class="label">${isPregnant() ? "출산 예정일" : "생년월일"}</div>${
        isPregnant()
          ? `${formatDateKR(profile.birthDate)} · 임신 ${pregnancyInfo(profile.birthDate, today).weeks}주`
          : `${formatDateKR(profile.birthDate)} · ${ChildTimeline.ageLabelAt(profile.birthDate, today)}`
      }</div>
      <div class="detail-row"><div class="label">거주 지역</div>${profile.province} ${profile.district}</div>
      ${enrollmentRowHtml()}
      ${
        familyCode && !acctEnabled() // 계정 모드: 아이 기록 코드는 화면에 보이지 않는다(가족코드 하나로 통일 — H1)
          ? `<div class="detail-row">
               <div class="label">가족코드</div>
               <button id="btn-copy-code" class="btn-code-pill">${familyCode} · 복사하기</button>
               <p id="code-hint" class="fine-print hidden code-hint-oneline">복사됐어요! 다른 기기에 입력하면 정보가 이어져요.</p>
             </div>`
          : ""
      }
      ${acctEnabled()
        ? `<details class="acct-members-det"><summary><strong>${esc(AccountView.MSG.membersManage)}</strong><small>${esc(AccountView.MSG.membersManageHint)}</small></summary><div id="members-slot"></div></details><div class="acct-bottom-row">${acctKidCount() >= 2 ? '<button type="button" class="btn-close" id="btn-acct-child-switch">아이 전환</button>' : ""}<button type="button" class="btn-close" id="btn-view-records">기록 보기</button></div>`
        : `${hhEnabled() ? '<div id="hh-slot"></div><div id="members-slot"></div>' : ""}<div id="beta-slot"></div>${hhEnabled() ? '<button type="button" class="btn-close" id="btn-view-records">기록 보기</button>' : ""}`}${isPregnant() ? `<button class="btn-complete" id="btn-switch-born">아이가 태어났어요</button>` : ""}
      ${changed ? `<button class="btn-complete btn-photo-save" id="btn-photo-save">저장</button>` : ""}
      <button class="btn-close" id="btn-close-modal">닫기</button>
    `;
    el("detail-modal").classList.remove("hidden");
    el("btn-close-modal").addEventListener("click", closeDetail);
    if (acctEnabled()) acctOpenSlot();
    if (el("btn-acct-child-switch")) el("btn-acct-child-switch").addEventListener("click", showChildSwitchSheet); // D4(나): 계정 모드는 아이가 2명 이상일 때만, 기존 전환 시트 재사용
    if (hhEnabled()) hhOpenSection();
    if (el("btn-view-records")) el("btn-view-records").addEventListener("click", openRecordView);
    betaConfirming = false;
    betaOpenSlot("beta-slot", "renderBetaSwitch");
    el("btn-open-reset").addEventListener("click", showEditProfileSheet);
    el("modal-content").querySelectorAll("[data-enroll]").forEach((b) => b.addEventListener("click", () => onEnrollChip(b.getAttribute("data-enroll"))));
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
        showProfileSheet(await resizeImageFile(file, 240)); // 바로 팝업에 미리보기 + 저장 버튼
      } catch (e) {
        console.error("사진 등록 실패", e);
      }
    });
    const removeBtn = el("btn-photo-remove");
    if (removeBtn) {
      removeBtn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        showProfileSheet(null);
      });
    }
    const saveBtn = el("btn-photo-save");
    if (saveBtn) {
      saveBtn.addEventListener("click", () => {
        if (pendingPhoto) profile.photoDataUrl = pendingPhoto;
        else delete profile.photoDataUrl;
        saveProfile(profile);
        pushProfileToFamily();
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

  // G17: 계정 모드(로그인)의 프로필 시트는 '내 프로필'이다 — 제목은 내 이름·역할, 아이는 '우리 아이' 한 줄(누르면 기존 아이 정보 시트). OFF·로그아웃 상태는 기존 시트 그대로.
  const showProfileSheetBase = showProfileSheet;
  let acctChildView = false; // '우리 아이' 줄에서 연 기존 아이 시트 안에서는 기존 시트로 다시 그린다(사진 저장·수정 취소 등)
  function acctProfileSheet() {
    acctChildView = false;
    modalMode = "profile";
    const id = acctIdentity();
    const title = id ? (id.roleName ? `${id.name} · ${AccountView.MSG.myRole(id.roleName)}` : id.name) : AccountView.MSG.myAccount;
    const acc = acct.account || {};
    const region = acc.province ? `${acc.province} ${acc.district || ""}`.trim() : profile ? `${profile.province} ${profile.district}` : "";
    const kid = profile ? acctHomeChildText() : "";
    el("modal-content").innerHTML = `
      <div class="profile-name-row acct-prof-head"><span class="avatar profile-sheet-avatar">${PERSON_ICON_SVG}</span><h3>${esc(title)}</h3></div>
      <div id="acct-slot"></div>
      ${region ? `<div class="detail-row"><div class="label">거주 지역</div>${esc(region)}</div>` : ""}
      <details class="acct-members-det"><summary><strong>${esc(AccountView.MSG.membersManage)}</strong><small>${esc(AccountView.MSG.membersManageHint)}</small></summary><div id="members-slot"></div></details>
      <div class="detail-row acct-kids"><div class="label">우리 아이</div>${
        profile
          ? `<button type="button" class="acct-kid-row" id="btn-acct-kid-row"><span>${esc(kid)}</span><span class="hr-chev">›</span></button>`
          : `<button type="button" class="acct-kid-row" id="btn-acct-kid-add"><span>＋ ${esc(AccountView.MSG.emptyButton)}</span><span class="hr-chev">›</span></button>`
      }</div>
      <div class="acct-bottom-row">${acctKidCount() >= 2 ? '<button type="button" class="btn-close" id="btn-acct-child-switch">아이 전환</button>' : ""}${profile ? '<button type="button" class="btn-close" id="btn-view-records">기록 보기</button>' : ""}</div>
      <button class="btn-close" id="btn-close-modal">닫기</button>`;
    el("detail-modal").classList.remove("hidden");
    el("btn-close-modal").addEventListener("click", closeDetail);
    acctOpenSlot();
    if (hhEnabled()) hhOpenSection();
    if (el("btn-acct-child-switch")) el("btn-acct-child-switch").addEventListener("click", showChildSwitchSheet);
    if (el("btn-view-records")) el("btn-view-records").addEventListener("click", openRecordView);
    if (el("btn-acct-kid-row")) el("btn-acct-kid-row").addEventListener("click", () => { acctChildView = true; showProfileSheetBase(); });
    if (el("btn-acct-kid-add")) el("btn-acct-kid-add").addEventListener("click", () => { closeDetail(); beginNewChildEntry(); });
  }
  showProfileSheet = function (pendingPhoto) {
    if (acctEnabled() && acct.user && !acctChildView) return acctProfileSheet();
    return showProfileSheetBase(pendingPhoto);
  };
  const closeDetailBase = closeDetail;
  closeDetail = function () {
    acctChildView = false;
    return closeDetailBase.apply(this, arguments);
  };

  /**
   * 아이 정보 수정 — 처음 화면으로 돌아가 새로 입력하지 않고, 저장된 정보를 그대로 채운 폼을 띄운다.
   * 가족코드·완료 내역·기록·사진은 그대로 두고 이름/생년월일(출산예정일)/몇째/지역만 바꾼다.
   */
  function showEditProfileSheet() {
    modalMode = "profile";
    const preg = isPregnant();
    const orders = [["first", "첫째"], ["second", "둘째"], ["third", "셋째"], ["fourthPlus", "넷째 이상"]];
    let order = profile.birthOrder || "";
    el("modal-content").innerHTML = `
      <h3>${preg ? "임신 정보 수정" : "아이 정보 수정"}</h3>
      <div class="rv-field"><label for="ep-name">${preg ? "태명 또는 별칭" : "이름 또는 별칭"}</label><input type="text" id="ep-name" maxlength="12" value="${esc(profile.name || "")}" /></div>
      <div class="rv-field"><label for="ep-dp-btn">${preg ? "출산 예정일" : "생년월일"}</label>${HNDatePicker.markup("ep")}</div>
      <div class="rv-field"><label>몇째</label><div class="rv-cats" id="ep-orders">${orders
        .map(([v, l]) => `<button type="button" class="chip rv-cat ${order === v ? "active" : ""}" data-v="${v}">${l}</button>`)
        .join("")}</div></div>
      <div class="rv-field"><label for="ep-province">시·도</label><select id="ep-province" class="ep-select">${regionsData.provinces
        .map((pv) => `<option value="${esc(pv.code)}" ${pv.code === profile.province ? "selected" : ""}>${esc(pv.name)}</option>`)
        .join("")}</select></div>
      <div class="rv-field"><label for="ep-district">시·군·구</label><select id="ep-district" class="ep-select"></select></div>
      <p id="ep-error" class="fine-print hidden" style="color:#e0524e">이름과 날짜를 입력해 주세요.</p>
      <button class="btn-complete" id="ep-save">저장</button>
      <button class="btn-close" id="ep-cancel">취소</button>
    `;
    const epPicker = HNDatePicker.bindById("ep", datePickerOpts(() => (preg ? "pregnant" : "born")));
    epPicker.set(profile.birthDate);
    const fillDistricts = (selected) => {
      const pv = regionsData.provinces.find((x) => x.code === el("ep-province").value);
      el("ep-district").innerHTML = (pv ? pv.districts : [])
        .map((d) => `<option value="${esc(d)}" ${d === selected ? "selected" : ""}>${esc(d)}</option>`)
        .join("");
    };
    fillDistricts(profile.district);
    el("ep-province").addEventListener("change", () => fillDistricts(null));
    el("ep-orders").querySelectorAll(".rv-cat").forEach((b) =>
      b.addEventListener("click", () => {
        order = b.dataset.v;
        el("ep-orders").querySelectorAll(".rv-cat").forEach((x) => x.classList.toggle("active", x === b));
      })
    );
    el("ep-cancel").addEventListener("click", showProfileSheet);
    el("ep-save").addEventListener("click", async () => {
      const name = el("ep-name").value.trim();
      const dateStr = el("ep-date").value;
      if (!name || !dateStr || !el("ep-district").value) {
        el("ep-error").classList.remove("hidden");
        return;
      }
      profile = {
        ...profile,
        name,
        birthDate: new Date(dateStr + "T00:00:00"),
        birthOrder: order || profile.birthOrder,
        province: el("ep-province").value,
        district: el("ep-district").value,
      };
      saveProfile(profile);
      if (familyCode) {
        try {
          await FamilySync.updateProfile(familyCode, profileToPlain(profile));
        } catch (e) {
          console.error("아이 정보 동기화 실패", e);
        }
      }
      hhSyncChildName(); // H1: 아이 이름을 바꾸면 가족 캘린더의 아이 링크(칩 이름)도 같이 바꾼다
      rememberChild();
      closeDetail();
      openMonthGroups = null;
      await buildAndRender();
    });
  }
  /** 현재 아이의 가구 링크 displayName 을 프로필 이름에 맞춘다(링크가 없거나 이름이 같으면 아무것도 하지 않는다). 실패는 조용히 무시. */
  function hhSyncChildName() {
    try {
      if (!hhEnabled() || !hh.hid || !familyCode || !profile || !profile.name) return;
      const links = Object.entries((HouseholdSync.getMirror(hh.hid) || {}).children || {});
      for (const [childKey, l] of links) {
        if (l && l.familyCode === familyCode && !l.removedAt && l.displayName !== profile.name) {
          Promise.resolve(HouseholdSync.updateChild(hh.hid, childKey, { displayName: profile.name })).catch((e) => console.error("아이 이름 동기화 실패", e));
        }
      }
    } catch (e) {
      console.error("아이 이름 동기화 실패", e);
    }
  }

  function renderCalLegend() {
    el("cal-legend").innerHTML = Object.values(CATEGORY_META)
      .map((g) => `<span class="cal-legend-item"><span class="dot" style="background:${g.color}"></span>${g.label}</span>`)
      .join("");
  }

  // 달력 표시용 "추천일" 배치(js/hn-logic.js assignDisplayDays) — 화면을 그릴 때마다 전체를 다시 계산한다
  // (완료 여부와 무관하고 결과가 결정적이라 완료 처리해도 다른 항목 위치가 바뀌지 않는다).
  let calDisplayDays = new Map();
  function computeCalendarDays() {
    calDisplayDays = HNLogic.assignDisplayDays(calendarDotSchedule(), { birthDate: profile.birthDate, monthKeysOf });
  }

  /** 그 날짜에 달력에 표시할 항목: 지원금 신청 시작(fixed) + 그날로 추천된 항목. */
  function calendarDayItems(date) {
    const cal = calendarDotSchedule();
    const fixed = cal.filter((e) => e.scheduleKind === "fixed" && HNLogic.coversDay(e, date));
    const planned = HNLogic.plannedOnDay(cal, calDisplayDays, date);
    return { fixed, planned };
  }

  /** 진행현황 카드 — 그 달 달력에 표시되는 항목(지원금 신청 시작 + 추천일 배치) 중 실제로 완료 처리한 수.
   *  E(1-2): 가족 캘린더가 켜져 있으면(usActive) 이 카드 대신 달력 위 '이번 달 챙길 것' 한 줄을 보인다(체크리스트 탭 달성률은 그대로). */
  function renderCalendarProgress() {
    if (renderCalTodoLine()) return;
    const month = viewMonth.getMonth();
    const { total, done, percent } = HNLogic.calendarMonthProgress(calendarDotSchedule(), calDisplayDays, completed, viewMonth.getFullYear(), month);
    el("cal-progress-summary").innerHTML = `<span style="display:block;font-size:.8em;font-weight:500;opacity:.75">${month + 1}월에 확인할 항목</span>${month + 1}월 · ${total}개 중 ${done}개 확인`;
    el("cal-progress-bar-fill").style.width = `${percent}%`;
    el("cal-progress-bar-label").textContent = total ? `${percent}%` : "";
  }
  // ── E(1-2) 달력 위 '이번 달 챙길 것' 한 줄 — 기한 안에 하면 되는 자동 항목. 날짜·담당이 정해진 '일정'은 예약(autoLink)으로 잇는다. ──
  let calTodoOpen = false;
  let calTodoAll = false; // 목록 5개 제한 해제('나머지 N개 더 보기')
  /** 자동 항목의 신청용 링크(근거 링크 officialUrl 과 별개). 해당 없으면 null. */
  function usApplyLinkOf(e) {
    if (typeof ApplyLinks === "undefined" || !e) return null;
    const def = e.detail && e.detail.definition;
    if (def) {
      const by = {};
      for (const s of (dataset.subsidy && dataset.subsidy.subsidies) || []) by[s.id] = s;
      return ApplyLinks.forTodo(def, by);
    }
    return ApplyLinks.forSubsidy(e.detail);
  }
  /** 이 달 챙길 것 목록(미완료는 마감 빠른 순, 마감 없는 것은 뒤, 완료는 마지막). */
  function calTodoItems() {
    const y = viewMonth.getFullYear(), m = viewMonth.getMonth();
    const links = autoLinks();
    const canResv = autoLinkOn() && usActiveChildKey() != null;
    const md = (d) => `${d.getMonth() + 1}/${d.getDate()}`;
    const rows = HNLogic.calendarMonthItems(calendarDotSchedule(), calDisplayDays, y, m).map((e) => {
      const done = !!completed[e.id];
      let end = null;
      if (e.category === "행정·지원금") {
        const dl = HNLogic.subsidyDeadline(e);
        if (dl) end = dl instanceof Date ? dl : new Date(dl);
      }
      if (!end) { const r = HNLogic.dayRange(e); if (r && e.scheduleKind === "window") end = r[1]; }
      if (end && isNaN(end.getTime())) end = null;
      const link = links ? links.get(e.id) : null;
      return {
        e, end,
        item: { id: e.id, title: usAutoTitleOfEvent(e), deadlineMd: end ? md(end) : "", deadlineText: end ? UserScheduleView.todoDeadlineText(end, new Date()) : "", done, reservedText: link ? UserScheduleView.autoLinkNote(link) : "", canReserve: canResv && !done && !link && CalendarModel.isLinkableAuto(e), apply: usApplyLinkOf(e) },
      };
    });
    rows.sort((a, b) => (a.item.done - b.item.done) || ((a.end ? a.end.getTime() : Infinity) - (b.end ? b.end.getTime() : Infinity)) || (a.e.id < b.e.id ? -1 : 1));
    return rows.map((r) => r.item);
  }
  /** 가구가 활성이면 한 줄을 그리고 달성률 카드를 숨긴다(true). 아니면 카드를 보이고 한 줄을 비운다(false) — OFF·가구 없음은 이전 화면 그대로. */
  function renderCalTodoLine() {
    const card = el("cal-progress-card"), slot = el("cal-todo-slot");
    const on = usActive() && typeof UserScheduleView.renderTodoLine === "function";
    if (card) card.classList.toggle("hidden", on);
    if (slot) slot.innerHTML = "";
    if (!on || !slot) return on && !!slot;
    const now = new Date();
    const isNow = viewMonth.getFullYear() === now.getFullYear() && viewMonth.getMonth() === now.getMonth();
    slot.innerHTML = UserScheduleView.renderTodoLine({ label: isNow ? "이번 달" : `${viewMonth.getMonth() + 1}월`, open: calTodoOpen, showAll: calTodoAll, items: calTodoItems() });
    return true;
  }
  function calTodoOnClick(ev) {
    const b = ev.target.closest("[data-cal-todo-act]");
    if (!b) return;
    const act = b.getAttribute("data-cal-todo-act");
    const id = b.getAttribute("data-id");
    if (act === "toggle") {
      calTodoOpen = !calTodoOpen;
      return renderCalTodoLine();
    }
    if (act === "more") {
      calTodoAll = !calTodoAll;
      return renderCalTodoLine();
    }
    if (act === "reserve") {
      const e = schedule.find((x) => x.id === id);
      if (e) usOpenFormFromAuto(e);
      return;
    }
    if (act === "done" && id) toggleComplete(id);
  }

  /**
   * 달력 표시 규칙
   *  - 지원금·제도: 신청 시작일 칸에 원. 신청 기간(시작~마감)은 카드에 함께 보여준다.
   *  - 그 밖의 항목(접종·검진·발달·생활·안전 등): 각자의 권장 기간/월령 안에서 "추천일"을 골라 원으로 표시한다.
   *    같은 시기 접종은 한날로 묶고, 나머지는 하루에 몰리지 않게 나눈다. 정해진 예정일이 아니라는 점은 화면에 밝힌다.
   */
  function renderCalendar() {
    if (calWeekOn()) return renderWeek();
    const year = viewMonth.getFullYear();
    const month = viewMonth.getMonth();
    el("calendar-title").textContent = `${year}년 ${month + 1}월`;
    computeCalendarDays();
    renderCalLegend();
    renderCalendarProgress();

    const firstDay = new Date(year, month, 1);
    const startOffset = firstDay.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = new Date();
    const grid = el("calendar-grid");
    grid.innerHTML = "";

    for (let i = 0; i < startOffset; i++) {
      const cell = document.createElement("div");
      cell.className = "day-cell other-month";
      grid.appendChild(cell);
    }

    const byUrgency = (a, b) => (!!completed[a.id] - !!completed[b.id]) || (isImportantEvent(b) ? 1 : 0) - (isImportantEvent(a) ? 1 : 0);
    // 가족 캘린더(가구)가 있으면 추가한 일정까지 합친 월 모델을 쓴다. 없으면 null → 아래는 기존 계산 그대로.
    const usModel = usActive() ? usBuildModel(toISODate(firstDay), toISODate(new Date(year, month, daysInMonth))) : null;
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      const dm = usModel ? usModel.days.get(toISODate(date)) : null;
      const { fixed, planned } = dm ? { fixed: dm.benefit, planned: dm.planned } : calendarDayItems(date);
      const marks = [...fixed, ...planned].sort(byUrgency);
      const userBars = dm ? dm.user : [];
      const totalMarks = marks.length + userBars.length;
      const cell = document.createElement("div");
      cell.className =
        "day-cell" + (sameDay(date, today) ? " today" : "") + (sameDay(date, selectedCalendarDate) ? " selected" : "") + (totalMarks ? " has-event" : "");
      // 추가한 일정: 아이색 막대(맨 앞). 자동 일정 미완료: 카테고리색 원, 완료: 연회색 ✓.
      const barHtml = userBars
        .slice(0, 3)
        .map((o) => `<span class="cal-bar${o.status === "DONE" ? " done" : ""}" style="background:${UserScheduleView.occurrenceColor(o, usLinks())}"></span>`)
        .join("");
      const dotHtml =
        barHtml +
        marks
          .slice(0, 3 - Math.min(3, userBars.length))
          .map((e) => (completed[e.id] ? `<span class="cal-marker done-soft">✓</span>` : `<span class="cal-marker todo" style="background:${calGroupFor(e).color}"></span>`))
          .join("");
      const moreCount = totalMarks - 3;
      const moreHtml = moreCount > 0 ? `<span class="cal-marker-more">+${moreCount}</span>` : "";
      cell.setAttribute("role", "button");
      cell.setAttribute("aria-label", `${month + 1}월 ${day}일 · 항목 ${totalMarks}건`);
      // 가구가 있을 때(칩 달력): 직접 등록=꽉 찬 칩, 자동=옅은 칩+같은 색 테두리, 최대 2개+N. 가구가 없으면(dm 없음) 기존 점 표식 그대로.
      cell.innerHTML = dm
        ? `<span class="num">${day}</span><span class="markers chips">${UserScheduleView.cellChips([...userBars.map((occ) => ({ t: "u", occ })), ...marks.map((e) => ({ t: "a", title: usAutoTitleOfEvent(e), category: e.category, done: !!completed[e.id] }))], { links: usLinks(), mode: usSelectionMode(), catColor: us.catColor, autoColor: usAutoChipColor() })}</span>`
        : `<span class="num">${day}</span><span class="markers">${dotHtml}${moreHtml}</span>`;
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
    usRenderCalendarSlots(usModel);
    renderAutoPeriodSlot();
  }

  /**
   * 달력 아래 "이 기간에 챙겨볼 것" — 기간형 AUTO(시작 월령 > 36, 4~6세 추가접종 등) 중 이 달과 겹치고 아직 완료하지 않은 것.
   * 날짜 칸에는 찍지 않는다. 사용자가 추가한 "이번 달 기간 일정"(us-period-slot, USER periodList)과는 데이터도 영역도 따로 둔다.
   */
  function renderAutoPeriodSlot() {
    const slot = el("auto-period-slot");
    if (!slot) return;
    const list = periodAutoInMonth(viewMonth.getFullYear(), viewMonth.getMonth());
    if (!list.length) {
      slot.innerHTML = "";
      return;
    }
    const groups = new Map();
    for (const { e, range } of list) {
      const label = periodGroupLabel(e, range);
      if (!groups.has(label)) groups.set(label, { e, items: [] });
      groups.get(label).items.push(e);
    }
    const body = [...groups.entries()]
      .map(([label, g]) => `<div class="ap-group"><strong>${g.e.category === "예방접종" ? "💉 " : ""}${esc(label)}</strong><div class="remaining-grid">${g.items.map(remainingItemHtml).join("")}</div></div>`)
      .join("");
    slot.innerHTML = `<div class="card auto-period-card"><h3>이 기간에 챙겨볼 것</h3><p class="us-note">날짜가 정해진 일정이 아니에요. 아직 완료하지 않았다면 확인해보세요.</p>${body}</div>`;
    slot.querySelectorAll(".remaining-item").forEach((item) => {
      item.addEventListener("click", () => {
        const e = schedule.find((x) => x.id === item.getAttribute("data-id"));
        if (e) openDetail(e);
      });
    });
  }

  /** 선택한 날짜 패널 — "이 날 신청 시작하는 지원금"과 "이 날 추천 항목"을 나눠 보여준다. */
  function renderSelectedDayPanel() {
    const date = selectedCalendarDate;
    if (!calDisplayDays || !calDisplayDays.size) computeCalendarDays();
    const { fixed, planned } = calendarDayItems(date);
    const byUrgency = (a, b) => (!!completed[a.id] - !!completed[b.id]) || (isImportantEvent(b) ? 1 : 0) - (isImportantEvent(a) ? 1 : 0);
    const dowNames = ["일", "월", "화", "수", "목", "금", "토"];
    el("selected-day-title").textContent = `${date.getMonth() + 1}월 ${date.getDate()}일 (${dowNames[date.getDay()]})`;
    const html = [...fixed, ...planned]
      .sort(byUrgency)
      .map((e) => eventItemHtml(e))
      .join("");
    el("selected-day-list").innerHTML = html;
    el("selected-day-empty").classList.toggle("hidden", fixed.length + planned.length > 0);
    usRenderDayPanel(date, byUrgency);
  }

  function remainingItemHtml(e) {
    const g = calGroupFor(e);
    const done = !!completed[e.id];
    const title = e.title.replace(/^⚠️ 확인 필요 · /, "");
    return `<button type="button" class="remaining-item${done ? " done" : ""}" data-id="${e.id}"><span class="dot" style="background:${done ? "#cfc7bf" : g.color}"></span>${title}${autoLinkInlineHtml(e)}${done ? '<span class="ri-check">✓</span>' : ""}</button>`;
  }

  /** "이 달 월령 체크" — 특정 날짜가 없는 월령별 항목(달력 칸에는 찍지 않는다). 미완료를 먼저 보여준다. */
  function renderRemainingList() {
    if (!el("remaining-grid")) return; // 월령 체크는 달력 추천일로 통합돼 목록 카드가 없다
    const items = HNLogic.monthlyInMonth(calendarDotSchedule(), viewMonth.getFullYear(), viewMonth.getMonth(), eventInCalendarMonth)
      .slice()
      .sort((a, b) => !!completed[a.id] - !!completed[b.id]);
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
    const period = periodAutoText(e) || periodTextFromWindow(inst.windowStart, inst.windowEnd);
    return period || "";
  }

  /** 체크리스트 카드용 지원 내용 — 첫 구절만(괄호·부연 설명 제외) 짧게 보여준다. 전체 내용은 상세에서 본다. */
  function shortSubsidySummary(text) {
    let t = String(text || "").split(/ — |\n|; /)[0].replace(/\s*\([^)]*\)/g, "").trim();
    if (t.length > 40) t = t.slice(0, 40).replace(/[\s,·/]+\S*$/, "") + "…";
    return t;
  }

  /** 항목 유형별 완료 문구 — 정보·수칙은 "확인", 접종·검진·지원금 신청은 실제 행동 "완료"로 구분한다. */
  function doneWords(category) {
    if (category === "예방접종") return { state: "접종 완료", mark: "접종 완료", undo: "접종 완료 취소" };
    if (category === "영유아검진") return { state: "검진 완료", mark: "검진 완료", undo: "검진 완료 취소" };
    if (category === "행정·지원금") return { state: "신청 완료", mark: "신청 완료", undo: "신청 완료 취소" };
    return { state: "확인 완료", mark: "확인했어요", undo: "확인 취소" };
  }

  function isVaccinationLike(category) {
    return category === "예방접종" || category === "영유아검진" || category === "행정·지원금";
  }

  /** 지원금 대상 구분 태그 — 임신 중에만 신청하는 제도 / 산모(출산 후 신청 가능) 제도를 아이 대상 제도와 구분해 보여준다. */
  function subsidyAudienceLabel(e) {
    if (e.category !== "행정·지원금" || !e.isLegacySubsidy || !e.detail) return "";
    if (e.detail.prenatalOnly) return "임신 중";
    return ""; // 산모 대상 등은 라벨을 달지 않는다(상세의 지원 대상에서 확인)
  }

  /**
   * 지원금 카드·상세의 대상 태그들.
   * - 임신 중에만 신청하는 제도: "임신 중"
   * - 이름에 '임산부' 등이 들어 있어도 출산 후에 신청할 수 있는 제도(data의 postpartumOk): "출산 후에도 신청 가능" — 이미 출산한 가정이 임산부 글자만 보고 지나치지 않게 한다.
   * - 소득·직종·질환 등 해당자만 받는 제도(data의 conditionLabel): 조건 요약
   */
  function subsidyTagsHtml(e, extraClass) {
    if (e.category !== "행정·지원금" || !e.isLegacySubsidy || !e.detail) return "";
    const s = e.detail;
    const tags = [];
    if (s.prenatalOnly) tags.push(["임신 중", ""]);
    else if (s.postpartumOk && !isPregnant()) tags.push(["출산 후에도 신청 가능", "aud-ok"]);
    if (s.conditionLabel) tags.push([s.conditionLabel, "aud-cond"]);
    return tags.map(([t, c]) => `<span class="aud-tag ${c} ${extraClass || ""}">${esc(t)}</span>`).join("");
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

  /** 일정 유형 태그 — 마감일 / 권장 기간 / 월령 체크를 카드마다 구분해 보여준다(실제 날짜와 권장 시점을 혼동하지 않게). */
  function kindTagHtml(e) {
    // 권장 기간만 뱃지로 구분한다(월령 체크·지원금 신청 기간은 뱃지를 달지 않는다 — 지원금은 카드의 신청 기간 줄이 대신한다).
    if (e.category === "행정·지원금" || e.scheduleKind !== "window") return "";
    return `<span class="kind-plain">권장 기간</span> `;
  }

  /** 권장 기간 문구("9월 1일 ~ 9월 30일"). 올해가 아니면 연도를 붙인다. 끝이 없으면 "~부터". */
  function windowRangeText(e) {
    if (!e.windowStart) return "";
    const thisYear = new Date().getFullYear();
    const f = (d) => `${d.getFullYear() !== thisYear ? d.getFullYear() + "년 " : ""}${d.getMonth() + 1}월 ${d.getDate()}일`;
    return e.windowEnd ? `${f(e.windowStart)} ~ ${f(e.windowEnd)}` : `${f(e.windowStart)}부터`;
  }

  /** 지원금을 주는 주체 뱃지 — 전국 공통은 고정 파랑, 시·도/시·군·구는 이름마다 고유색. */
  function providerTagHtml(e, extra) {
    const p = subsidyProvider(e);
    if (!p) return "";
    let fg = "#2f6db3";
    let bg = "#e8f1fb";
    if (p.short !== "전국 공통") {
      let h = 0;
      for (const ch of p.short) h = (h * 31 + ch.charCodeAt(0)) % 360;
      fg = `hsl(${h},55%,34%)`;
      bg = `hsl(${h},70%,92%)`;
    }
    return `<span class="prov-tag${extra ? " " + extra : ""}" style="color:${fg}">${esc(p.short)}</span>`;
  }

  /** 지원금 카드에 신청 기간(시작~마감)을 항상 보여준다. 마감이 없으면 상시. */
  function subsidyPeriodLineHtml(e) {
    if (e.category !== "행정·지원금") return "";
    // 상세 화면의 "신청·지급 기간"과 같은 계산(subsidyPeriodRows)을 써서 카드와 상세의 날짜가 어긋나지 않게 한다.
    const rows = subsidyPeriodRows(e.isEngineEvent ? e.detail.definition && e.detail.definition.todo_id : e.id, e.isEngineEvent ? null : e.detail, profile.birthDate);
    const row = rows.find((r) => /신청/.test(r.label)) || rows[0];
    if (row && row.text) return `<p class="sub-period">${/신청/.test(row.label) ? "신청 기간" : esc(row.label)} ${esc(row.text)}</p>`;
    const { start, end } = HNLogic.subsidyPeriod(e);
    if (!start) return "";
    const f = (d) => `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
    return `<p class="sub-period">신청 기간 ${f(start)} ~ ${end ? f(end) : "상시(기한 없음)"}</p>`;
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
    } else if (e.scheduleKind === "window" && e.windowStart && !e.isLegacySubsidy) {
      // 권장 기간이 있는 항목(이유식·발달 등)은 특정일이 아니라 기간으로 보여준다(달력의 추천일과는 별개).
      dateLine = windowRangeText(e);
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
          ${providerTagHtml(e) ? `<p class="prov-row">${providerTagHtml(e)}${subsidyTagsHtml(e)}</p>` : ""}
          <p class="title">${e.title}</p>
          ${e.category === "행정·지원금" && !isDone && subsidyPeriodLineHtml(e) ? "" : `<p class="date-label">${isDone ? "" : kindTagHtml(e)}${dateLine}</p>`}${subsidyPeriodLineHtml(e)}
          <p class="summary">${e.category === "행정·지원금" ? shortSubsidySummary(e.summary) : e.summary || ""}</p>${autoLinkNoteHtml(e)}
        </div>
        <span class="check ${isDone ? "checked" : ""}" data-check-id="${e.id}">${isDone ? "✓" : ""}</span>
      </div>
    `;
  }

  /** 처음 체크리스트 탭을 그릴 때 한 번만 "현재 월령" 그룹을 펼친 상태로 초기화한다. */
  function ensureOpenMonthGroupsInit() {
    if (openMonthGroups === null) {
      // 현재 월령 그룹만 펼쳐 두고 나머지는 접는다.
      // (학교·입학 그룹은 해당 항목이 있을 때만 그려지므로 같이 펼쳐 두어도 다른 아이에게는 영향이 없다.)
      openMonthGroups = new Set([checklistBucket(Math.max(0, ageInMonths(profile.birthDate, new Date()))), SCHOOL_GROUP]);
    }
  }

  const NEED_CHECK_GROUP = "NEED_CHECK";
  // A6-4: 학교 Todo(td.schoolGroup)는 월령 그룹이 아니라 이 그룹에 모은다. 숫자가 아닌 키라 달력·홈의 월령 배치에는 쓰이지 않는다.
  const SCHOOL_GROUP = "SCHOOL";

  /** 체크리스트 그룹 키·라벨은 ChildTimeline 표(CHECKLIST_BUCKETS)가 정한다. 돌 전은 월별, 13개월~는 구간 시작 월령. */
  const checklistBucket = ChildTimeline.checklistBucket;
  const checklistGroupLabel = ChildTimeline.checklistGroupLabel;

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
    if (td.schoolGroup) return SCHOOL_GROUP;
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
    // A6-4: SCHOOL_TERM_WINDOW 의 startMonth/endMonth 는 달력 월(1~12)이지 월령이 아니다 — 월령 반복 행으로 읽으면 안 된다.
    if (e.detail.definition.triggerType === "SCHOOL_TERM_WINDOW") return null;
    const tp = e.detail.definition.triggerParams;
    if (!tp || typeof tp.startMonth !== "number") return null;
    // 반복 노출은 "적용 기간의 시작"이 아니라 "검토해야 할 대표 월령(displayMonth)"부터 시작한다
    // (예: 꿀 섭취 금지는 적용은 0~12개월이지만 이유식 시작 시점인 6개월부터 안내).
    const dm = e.detail.definition.displayMonth;
    const windowStart = Math.max(0, Math.floor(tp.startMonth));
    const cap = ChildTimeline.effectiveMaxMonths(e); // 끝 없는(null) 정의는 36(보존), endMonth 가 있는 정의는 72 상한 안에서 자기 endMonth 까지
    const end = tp.endMonth == null ? cap : Math.min(cap, Math.ceil(tp.endMonth));
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
      if (key === NEED_CHECK_GROUP || key === SCHOOL_GROUP) return false;
      const d = addMonths(profile.birthDate, key);
      return d.getFullYear() === year && d.getMonth() === month;
    });
  }

  /** 전체 체크리스트: 대표 월령(displayMonth, 서비스 범위 안)별로 묶어 아코디언으로 보여준다. 기본은 현재 월령만 펼쳐져 있다. */
  function renderChecklistTab() {
    ensureOpenMonthGroupsInit();
    const scopeBanner = el("checklist-scope-banner");
    if (scopeBanner) {
      scopeBanner.classList.toggle("hidden", !checklistScope);
      if (checklistScope) scopeBanner.querySelector(".scope-label").textContent = `“${checklistScope.label}”만 보는 중이에요`;
    }
    const inScope = (e) => !checklistScope || checklistScope.ids.has(e.id);
    const statusOk = (e) => (checklistStatus === "todo" ? !completed[e.id] : checklistStatus === "done" ? !!completed[e.id] : true);
    // N5: 서비스 범위(72개월)를 넘은 아이는 기본 보기에서 미완료 영유아 항목을 숨긴다(완료·학교·그때그때 확인해요는 유지). 홈에서 범위를 지정해 들어온 보기는 그대로 둔다.
    const beyondRange = !checklistScope && HNLogic.isBeyondServiceRange(profile.birthDate, new Date());
    const pastHidden = beyondRange && !showPastInfant;
    // 학령기(72개월 초과 월령) 항목은 영유아 항목이 아니므로 숨기지 않는다.
    const pastKeep = (e) => monthKeysOf(e).some((k) => k === NEED_CHECK_GROUP || k === SCHOOL_GROUP || (typeof k === "number" && k > ChildTimeline.SERVICE_RANGE.maxMonths));
    const items = HNLogic.hidePastInfantItems(visibleSchedule().filter(inScope).filter(statusOk), completed, { birthDate: profile.birthDate, today: new Date(), showPast: !pastHidden, isKeep: pastKeep }).sort((a, b) => a.date - b.date);
    const nowAge = Math.max(0, ageInMonths(profile.birthDate, new Date()));
    const curKey = checklistBucket(nowAge);
    const nextKey = checklistBucket(nowAge + 1);
    document.querySelectorAll("#status-filter-checklist .sf-btn").forEach((b) => b.classList.toggle("active", b.dataset.status === checklistStatus));
    const scoped = !!checklistScope;
    const nowAgeKey = nowAge;
    const todaySod = HNLogic.sod(new Date());
    // 그룹 안 정렬: 미완료(카테고리 순으로 묶음) → 완료(맨 아래, 한 줄). 같은 카테고리 안에서는 기존(날짜) 순서를 유지한다.
    const CAT_ORDER = Object.keys(CATEGORY_META);
    const catOrder = (e) => {
      const i = CAT_ORDER.indexOf(e.category);
      return i < 0 ? CAT_ORDER.length : i;
    };
    const groups = new Map();
    items.forEach((e) => {
      let ks = monthKeysOf(e);
      // 범위 보기에서 여러 달에 반복되는 월령 항목은 해당되는 월령 그룹에만 넣는다(다른 달 그룹에 반복 노출하지 않음).
      if (checklistScope && checklistScope.keys[e.id]) ks = ks.filter((k) => checklistScope.keys[e.id].includes(k));
      // 이번 달 보기: 홈은 "기간이 이번 달과 겹치는지"로 골랐는데 전체 할 일은 항목마다 정해진 대표 월령(예: DTaP 2차=생후 2개월)으로
      // 묶어서, 이번 달 항목이 접힌 다른 월령 그룹에 숨는 문제가 있었다. 홈과 같은 기준으로 지금 월령 한 그룹에 모아 보여준다.
      if (checklistScope && checklistScope.flat) ks = [nowAgeKey];
      // 기간형 AUTO(§14): 시작 월령 그룹에 항상 두고, 기간 안이고 미완료인 동안은 현재 월령 그룹에도 함께 보인다(같은 항목·같은 completion key).
      if (!checklistScope && !completed[e.id]) {
        const pr = periodRangeOf(e);
        if (pr && todaySod >= pr.start && todaySod <= pr.end) ks = [...ks, nowAgeKey];
      }
      new Set(ks.map((k) => (k === NEED_CHECK_GROUP ? k : checklistBucket(k)))).forEach((key) => {
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(e);
      });
    });
    // 돌 전(0~12개월)은 그 달에 항목이 없어도 월별 그룹을 항상 보여준다 — 13개월 이후는 항목이 있는 달만.
    // (완료 상태 필터를 걸었을 땐 빈 달 그룹을 만들지 않는다.)
    if (items.length > 0 && checklistStatus === "all" && !scoped && !pastHidden) for (let m = 0; m <= 12; m++) if (!groups.has(m)) groups.set(m, []);
    const monthKeys = [...groups.keys()].sort((a, b) => {
      if (a === NEED_CHECK_GROUP) return 1;
      if (b === NEED_CHECK_GROUP) return -1;
      if (a === SCHOOL_GROUP) return 1; // 학교·입학: 월령 그룹 뒤, "그때그때 확인해요" 앞
      if (b === SCHOOL_GROUP) return -1;
      return a - b;
    });
    const pastCard = beyondRange
      ? `<div class="past-infant-card"><p>${esc(HNLogic.PAST_INFANT_MSG.notice)}</p><label class="past-infant-toggle"><input type="checkbox" id="past-infant-toggle"${showPastInfant ? " checked" : ""} /> ${esc(HNLogic.PAST_INFANT_MSG.toggle)}</label></div>`
      : "";
    el("list-checklist").innerHTML = pastCard + monthKeys
      .map((key) => {
        const list = groups.get(key);
        const isOpen = openMonthGroups.has(key);
        const doneCount = list.filter((e) => completed[e.id]).length;
        const label = key === NEED_CHECK_GROUP ? "그때그때 확인해요" : key === SCHOOL_GROUP ? "학교·입학" : isPregnant() && key === 0 ? "임신 중·출산 직후" : checklistGroupLabel(key);
        return `
          <div class="ongoing-group-card month-group-card ${isOpen ? "open" : ""}" data-month="${key}"${key === curKey ? ' data-now="1"' : ""}>
            <button type="button" class="ongoing-group-header">
              <span class="group-text"><strong>${label}</strong></span>
              <span class="count-badge">${list.length ? `${doneCount}/${list.length}개` : "없음"}</span>
              <span class="chevron">▾</span>
            </button>
            <div class="ongoing-group-body">${list.length ? "" : '<p class="empty-month-note">이 달에 새로 챙길 항목은 없어요</p>'}${list.slice().sort((a, b) => !!completed[a.id] - !!completed[b.id] || catOrder(a) - catOrder(b)).map((e) => eventItemHtml(e, { compact: true })).join("")}</div>
          </div>
        `;
      })
      .join("");
    el("list-checklist").querySelectorAll(".event-item").forEach(bindEventItem);
    acctDesignApplyButtons(el("list-checklist"));
    const pastToggle = el("past-infant-toggle");
    if (pastToggle)
      pastToggle.addEventListener("change", () => {
        showPastInfant = pastToggle.checked;
        renderChecklistTab();
      });
    el("empty-checklist").classList.toggle("hidden", items.length > 0);
    el("empty-checklist").textContent = checklistStatus === "todo" ? "미완료 항목이 없어요. 👏" : checklistStatus === "done" ? "아직 완료한 항목이 없어요." : "해당하는 항목이 없어요.";
    el("list-checklist")
      .querySelectorAll(".ongoing-group-header")
      .forEach((btn) => {
        btn.addEventListener("click", () => {
          const card = btn.closest(".month-group-card");
          const raw = card.getAttribute("data-month");
          const key = raw === NEED_CHECK_GROUP || raw === SCHOOL_GROUP ? raw : Number(raw);
          if (openMonthGroups.has(key)) openMonthGroups.delete(key);
          else openMonthGroups.add(key);
          card.classList.toggle("open");
        });
      });
  }

  /** G14: 계정 모드 체크리스트·할 일 카드에 신청용 링크 버튼('신청하러 가기'·'안내 보기'·'예방접종도우미 열기')을 카드 안에 붙인다. 이미 있는 링크 데이터(usApplyLinkOf)만 쓰고, 카드를 누르는 동작(상세 열기)은 그대로다. */
  function acctDesignApplyButtons(root) {
    if (!acctEnabled() || !root || !root.querySelectorAll) return;
    root.querySelectorAll(".event-item").forEach((item) => {
      if (item.querySelector(".ck-go")) return;
      const e = schedule.find((x) => x.id === item.getAttribute("data-id"));
      const link = e && !completed[e.id] ? usApplyLinkOf(e) : null;
      const body = item.querySelector(".body");
      if (!link || !body) return;
      const a = document.createElement("a");
      a.className = "ck-go";
      a.href = link.url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = link.label;
      a.addEventListener("click", (ev) => ev.stopPropagation());
      body.appendChild(a);
    });
  }

  function renderRecordTab() {
    if (window.HNRecordsView) HNRecordsView.render(hnCtx());
  }
  function renderHome() {
    if (window.HNHome) HNHome.render(hnCtx());
  }
  function renderSubsidyTab() {
    if (window.HNSubsidyView) HNSubsidyView.render(hnCtx());
  }

  /** 페이지 안의 리스트 컨테이너들에만 한정해서 바인딩한다 — 모달(#modal-content)은 각자 따로
   * 바인딩하므로 여기서 document 전체를 선택하면 모달이 열려있을 때 이중 바인딩된다. */
  function attachListHandlers() {
    const containerIds = ["selected-day-list", "list-record"];
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
    const before = { ...completed };
    const wasDone = !!completed[id];
    delete completed[id + NA_SUFFIX];
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
    syncCompletedChanges(before);
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
    if (!wasDone && completed[id]) usAfterAutoComplete(id); // C2-b2: 연결된 예약이 있으면 '예약 일정은 어떻게 할까요?'(autoLink 꺼짐·연결 없음이면 아무것도 안 함)
  }

  /**
   * 작은 달력(완료일 선택용) — 브라우저 기본 날짜 선택창 대신 팝업 안에 들어가는 컴팩트한 월 달력.
   * 오늘 이후 날짜는 고를 수 없고, 고른 날짜는 hidden input(value)과 라벨에 반영된다.
   */
  function renderMiniCal(box, input, label, view) {
    const max = input.dataset.max;
    const sel = input.value;
    const base = view || new Date((sel || max) + "T12:00:00");
    const y = base.getFullYear();
    const m = base.getMonth();
    const first = new Date(y, m, 1).getDay();
    const days = new Date(y, m + 1, 0).getDate();
    const iso = (d) => `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const maxD = new Date(max + "T12:00:00");
    const nextDisabled = new Date(y, m + 1, 1) > maxD;
    let cells = "";
    for (let i = 0; i < first; i++) cells += `<span></span>`;
    for (let d = 1; d <= days; d++) {
      const v = iso(d);
      const off = v > max;
      cells += `<button type="button" class="mc-day${v === sel ? " sel" : ""}${v === max ? " today" : ""}" data-d="${v}" ${off ? "disabled" : ""}>${d}</button>`;
    }
    box.innerHTML = `
      <div class="mc-head">
        <button type="button" class="mc-nav" data-nav="-1" aria-label="이전 달">‹</button>
        <span>${y}년 ${m + 1}월</span>
        <button type="button" class="mc-nav" data-nav="1" aria-label="다음 달" ${nextDisabled ? "disabled" : ""}>›</button>
      </div>
      <div class="mc-week"><span>일</span><span>월</span><span>화</span><span>수</span><span>목</span><span>금</span><span>토</span></div>
      <div class="mc-grid">${cells}</div>`;
    if (label) label.textContent = sel ? formatDateKR(new Date(sel + "T12:00:00")) : "";
    box.querySelectorAll(".mc-nav").forEach((b) =>
      b.addEventListener("click", () => renderMiniCal(box, input, label, new Date(y, m + Number(b.dataset.nav), 1, 12)))
    );
    box.querySelectorAll(".mc-day").forEach((b) =>
      b.addEventListener("click", () => {
        input.value = b.dataset.d;
        renderMiniCal(box, input, label, new Date(y, m, 1, 12));
      })
    );
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
    const before = { ...completed };
    const iso = new Date(y, m - 1, d, 12, 0, 0).toISOString();
    completed[id] = { ...completed[id], recordedAt: iso };
    if (completed[`${id}__milestone`]) completed[`${id}__milestone`] = { ...completed[`${id}__milestone`], recordedAt: iso };
    saveCompleted();
    syncCompletedChanges(before);
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
      const period = isVaccineOrCheckup ? periodAutoText(e) || periodTextFromWindow(inst.windowStart, inst.windowEnd) : null;
      if (isObservationType) {
        return `
          ${completed[e.id] ? `<div class="detail-row"><div class="label">현재 상태</div>${doneWords(e.category).state}</div>` : ""}
          ${e.scheduleKind === "window" ? `<div class="detail-row"><div class="label">권장 기간</div>${windowRangeText(e)}</div>` : ""}
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
        ${inst.status === "DONE" || completed[e.id] ? `<div class="detail-row"><div class="label">현재 상태</div>${doneWords(e.category).state}</div>` : ""}
        ${!isVaccineOrCheckup && !isSubsidy && e.scheduleKind === "window" ? `<div class="detail-row"><div class="label">권장 기간</div>${windowRangeText(e)}</div>` : ""}
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
      ${hasDetailValue(s.paymentMethod) ? `<div class="detail-row"><div class="label">지급 방식</div>${detailValueHtml(s.paymentMethod)}</div>` : ""}
      ${hasDetailValue(s.residencyRequirement) ? `<div class="detail-row"><div class="label">거주 조건</div>${detailValueHtml(s.residencyRequirement)}</div>` : ""}
      ${hasDetailValue(s.additionalConditions) ? `<div class="detail-row"><div class="label">추가 자격 조건</div>${detailValueHtml(s.additionalConditions)}</div>` : ""}
      <div class="detail-row"><div class="label">정보 출처</div>${s.sourceName}</div>
      <div class="detail-row"><div class="label">최종 확인일</div>${s.lastVerified}</div>
    `;
  }

  /** 값이 비었거나 "-"·"미확인"뿐이면 그 행을 아예 보여주지 않는다(화면에 "확인 필요"류 문구가 나오지 않게). */
  function hasDetailValue(v) {
    return typeof v === "string" && v.trim() !== "" && !/^(-|미확인|확인\s*필요)$/.test(v.trim());
  }

  /** 확인·완료(취소) 버튼 색 — 카테고리 대표색(CATEGORY_META)에 맞춘 파스텔. 혜택은 살구색 스타일을 따로 쓴다. */
  const CAT_BUTTON_COLORS = {
    "발달관찰": ["#e6f7ec", "#1d7a45", "#9bdbb5"],
    "예방접종": ["#e8f0fe", "#1f5fbf", "#a9c6f5"],
    "영유아검진": ["#f1e8fd", "#7a34c4", "#d3b7f2"],
    "생활·수유": ["#fdf4d8", "#8a6a05", "#f0d885"],
    "안전·돌봄": ["#fde8e8", "#c23a37", "#f2b3b1"],
  };
  function catButtonStyle(category) {
    const c = CAT_BUTTON_COLORS[category];
    return c ? `data-cat="1" style="--bc-bg:${c[0]};--bc-fg:${c[1]};--bc-bd:${c[2]}"` : "";
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
            <button type="button" class="completion-edit-icon" id="btn-change-completion" aria-label="${isVaccinationLike(e.category) ? "완료일 변경" : "확인일 변경"}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/><path d="M13.5 6.5l4 4"/></svg>
            </button>
          </div>
          <div class="completion-edit hidden" id="completion-edit">
            <input type="hidden" id="completion-date-input" value="${doneDateValue}" data-max="${localDateInputValue(new Date())}" />
            <div class="mini-cal" id="completion-cal"></div>
            <div class="mini-cal-foot"><span id="completion-cal-label" class="mini-cal-label"></span><button type="button" class="completion-save" id="btn-save-completion">저장</button></div>
          </div>
        </div>`;
    }
    el("modal-content").innerHTML = `
      <span class="cat-badge" style="background:${meta.color}">${meta.label}</span>${providerTagHtml(e, "detail-tag")}${subsidyTagsHtml(e, "detail-tag")}
      <h3>${e.title}</h3>
      ${detailBodyHtml(e)}
      ${completionRowHtml}
      ${e.officialUrl ? `<a class="btn-official" href="${e.officialUrl}" target="_blank" rel="noopener">공식 안내 페이지로 이동</a>` : ""}
      ${
        e.category === "행정·지원금"
          ? isNotApplicable(e.id)
            ? `<button class="btn-complete" id="btn-na-restore">다시 내 혜택에 포함하기</button>`
            : `<div class="apply-choice"><button class="btn-na" id="btn-mark-na">미해당</button><button class="btn-complete" id="btn-toggle-complete">${isDone ? "신청 완료 취소" : "해당 (신청 완료)"}</button></div>`
          : `<button class="btn-complete" id="btn-toggle-complete" ${catButtonStyle(e.category)}>${isDone ? doneWords(e.category).undo : doneWords(e.category).mark}</button>`
      }
      ${autoLinkButtonHtml(e, isDone)}
      ${showBack ? `<button class="btn-close" id="btn-back-to-day">← 이 날 목록으로</button>` : ""}
      <button class="btn-close" id="btn-close-modal">닫기</button>
    `;
    el("detail-modal").classList.remove("hidden");
    el("btn-close-modal").addEventListener("click", closeDetail);
    if (el("btn-toggle-complete")) el("btn-toggle-complete").addEventListener("click", () => toggleComplete(e.id));
    if (el("btn-mark-na")) el("btn-mark-na").addEventListener("click", () => setNotApplicable(e.id, true));
    if (el("btn-na-restore")) el("btn-na-restore").addEventListener("click", () => setNotApplicable(e.id, false));
    if (el("btn-auto-reserve")) el("btn-auto-reserve").addEventListener("click", () => usOpenFormFromAuto(e));
    if (el("btn-auto-view")) el("btn-auto-view").addEventListener("click", () => usOpenDetail(el("btn-auto-view").getAttribute("data-auto-schedule"), null));
    const dateInput = el("completion-date-input");
    if (dateInput) {
      el("btn-change-completion").addEventListener("click", () => {
        el("completion-edit").classList.toggle("hidden");
        renderMiniCal(el("completion-cal"), dateInput, el("completion-cal-label"));
      });
      el("btn-save-completion").addEventListener("click", () => setCompletionDate(e.id, dateInput.value));
    }
    if (showBack) el("btn-back-to-day").addEventListener("click", renderDayList);
  }
  // G14-3: 계정 모드 할 일 상세 시트(접는 항목) — openDetail 본문은 그대로 두고, 그린 다음 DOM 만 바꾼다(버튼·완료일·핸들러는 그대로).
  const ACC_OPEN_LABELS = ["이 접종은", "이 검진은", "해야 할 일", "관찰 포인트", "정상/비정상 기준", "이상 기준"]; // 처음부터 펼치는 줄(주의 신호 포함)
  const ACC_KEEP_LABELS = ["현재 상태", "안내"]; // 접지 않는 줄
  function acctDesignAccordion(box) {
    if (!box || !box.children) return;
    Array.from(box.children).forEach((row) => {
      if (!row.classList || !row.classList.contains("detail-row") || row.classList.contains("completion-row")) return;
      const labelEl = row.querySelector(".label");
      const label = labelEl ? (labelEl.textContent || "").trim() : "";
      if (!labelEl || !label || ACC_KEEP_LABELS.includes(label)) return;
      const det = document.createElement("details");
      det.className = "acc-row";
      if (ACC_OPEN_LABELS.includes(label)) det.open = true;
      const sum = document.createElement("summary");
      sum.textContent = label;
      const body = document.createElement("div");
      body.className = "acc-body";
      labelEl.remove();
      while (row.firstChild) body.appendChild(row.firstChild);
      det.appendChild(sum);
      det.appendChild(body);
      box.replaceChild(det, row);
    });
  }
  // G14-5: 계정 모드 혜택 상세 시트(신청 완료 상태, 톤 변경) — 위쪽 짙은 머리(분류 라벨·제목) + 상태 카드(신청 전/신청 완료·확인일·[해당(신청 완료)]/[신청 완료 취소]/[미해당]). 요소를 옮기기만 해서 핸들러는 그대로다.
  function acctDesignSubsidy(box) {
    if (!box || !box.querySelector || !box.children || box.querySelector(".acct-sub-head")) return;
    const title = box.querySelector("h3");
    if (!title) return;
    const kids = Array.from(box.children);
    const head = document.createElement("div");
    head.className = "acct-sub-head";
    kids.slice(0, kids.indexOf(title) + 1).forEach((n) => head.appendChild(n)); // 분류 라벨·지원 주체 라벨·제목
    const toggle = box.querySelector("#btn-toggle-complete");
    const restore = box.querySelector("#btn-na-restore");
    const done = !!(toggle && /취소/.test(toggle.textContent || ""));
    const status = document.createElement("div");
    status.className = "acct-sub-status";
    const label = document.createElement("strong");
    label.textContent = restore ? "해당 없음으로 표시했어요" : done ? "신청 완료" : "신청 전이에요";
    status.appendChild(label);
    const comp = box.querySelector(".completion-row");
    if (comp) status.appendChild(comp);
    const choice = box.querySelector(".apply-choice");
    if (choice) status.appendChild(choice);
    else if (restore) status.appendChild(restore);
    box.insertBefore(status, box.firstChild);
    box.insertBefore(head, box.firstChild);
  }
  const openDetailBase = openDetail;
  openDetail = function openDetail(e, cameFromDayList) {
    openDetailBase(e, cameFromDayList);
    if (!acctEnabled() || !e) return;
    if (e.category === "행정·지원금") acctDesignSubsidy(el("modal-content"));
    else acctDesignAccordion(el("modal-content"));
  };

  function closeDetail() {
    el("detail-modal").classList.add("hidden");
    currentDayContext = null;
    modalMode = null;
  }

  /** 프로필/데이터가 바뀐 뒤 모든 화면(홈·캘린더·전체 할 일·기록·지원금)을 다시 그린다. */
  function renderAll() {
    renderProfileHeader();
    renderHome();
    renderCalendar();
    renderSelectedDayPanel();
    renderRemainingList();
    renderChecklistTab();
    renderRecordTab();
    renderSubsidyTab();
    attachListHandlers();
  }

  const TAB_NAMES = ["home", "calendar", "record", "subsidy", "checklist", "places"];
  // ── E(2-1·2-2) 하단 탭 교체: 가구·계정 기능이 켜졌을 때만 '기록' 탭 자리에 '어디갈까'. 기록은 프로필 시트의 '기록 보기'로 연다(기존 기록 패널 그대로). ──
  const tabLayoutOn = () => hhEnabled();
  let recordReturnTab = "home";
  function applyTabLayout() {
    const on = tabLayoutOn();
    const rec = document.querySelector('.nav-item[data-nav="record"]');
    const pl = document.querySelector('.nav-item[data-nav="places"]');
    if (rec) rec.classList.toggle("hidden", on);
    if (pl) pl.classList.toggle("hidden", !on);
    const back = el("btn-record-back");
    if (back) back.classList.toggle("hidden", !on);
  }
  /** 프로필 시트 '기록 보기': 기존 기록 패널로 이동(돌아가기 버튼으로 이전 탭 복귀). */
  function openRecordView() {
    recordReturnTab = currentTab === "record" || currentTab === "places" ? "home" : currentTab;
    closeDetail();
    switchTab("record");
  }
  let placesData = null; // data/places.json — 처음 한 번만 읽는다
  let placesLoading = null;
  let placesCat = "ALL";
  let placesOffices = null; // data/district-offices.json(기준점 시·군·구청 좌표) — 없으면 거리 기능은 꺼진다
  let placesOfficesLoading = null;
  let placesStats = {}; // placeStats/{id} {count} — 인기순 정렬용(화면에 숫자는 내지 않는다). 못 읽으면 빈 값
  let placesStatsLoading = null;
  let placesDriveMax = null; // null=전체 / 30 / 60 / 90 (이 실행 동안만)
  let placesSort = "near"; // "near" | "popular"
  async function loadPlaces() {
    if (placesData) return placesData;
    if (!placesLoading) placesLoading = loadJsonOrNull("data/places.json").then((d) => { placesData = d && Array.isArray(d.places) ? d : { places: [] }; return placesData; });
    return placesLoading;
  }
  async function loadPlacesOffices() {
    if (placesOffices) return placesOffices;
    if (!placesOfficesLoading) placesOfficesLoading = loadJsonOrNull("data/district-offices.json").then((d) => { placesOffices = d && typeof d === "object" ? d : {}; return placesOffices; });
    return placesOfficesLoading;
  }
  /** 인기순 신호: placeStats 컬렉션을 읽는다. 규칙 미배포·오프라인이면 조용히 빈 값. */
  async function loadPlacesStats() {
    if (!placesStatsLoading) {
      placesStatsLoading = (async () => {
        try {
          if (typeof firebase === "undefined" || !firebase.firestore) return;
          const snap = await firebase.firestore().collection("placeStats").get();
          const m = {};
          snap.docs.forEach((d) => { const c = d.data() && d.data().count; if (typeof c === "number") m[d.id] = { count: c }; });
          placesStats = m;
        } catch (e) { /* 조용히 무시 */ }
      })();
    }
    return placesStatsLoading;
  }
  const PLACES_COUNTED_KEY = "hannun_place_counted"; // { 장소id: "YYYY-MM-DD" } — 같은 기기에서 같은 장소는 하루 1회만 센다
  /** 일정 등록을 마친 장소의 인기 신호 +1(하루 1회/기기). 쓰기가 실패하면(규칙 미배포) 조용히 무시한다. */
  async function placesCountOnce(placeId) {
    if (!placeId) return;
    const today = toISODate(new Date());
    let map = {};
    try { map = JSON.parse(localStorage.getItem(PLACES_COUNTED_KEY) || "{}") || {}; } catch (e) { map = {}; }
    if (map[placeId] === today) return;
    try {
      map[placeId] = today;
      localStorage.setItem(PLACES_COUNTED_KEY, JSON.stringify(map));
    } catch (e) { return; }
    try {
      if (typeof firebase === "undefined" || !firebase.firestore) return;
      const FV = firebase.firestore.FieldValue;
      await firebase.firestore().collection("placeStats").doc(placeId).set({ count: FV.increment(1), updatedAt: FV.serverTimestamp() }, { merge: true });
      const cur = (placesStats[placeId] && placesStats[placeId].count) || 0;
      placesStats[placeId] = { count: cur + 1 };
    } catch (e) { /* 규칙 미배포·오프라인: 조용히 무시 */ }
  }
  let placesFilters = { indoor: false, free: false, noReserve: false }; // 보조 필터(이 실행 동안만)
  function placesViewHtml() {
    const d = placesData || { places: [] };
    const valid = d.places.filter((p) => Places.validatePlace(p).length === 0);
    const age = profile && !isPregnant() ? ageInMonths(profile.birthDate, new Date()) : null;
    const origin = profile ? Places.originOf(placesOffices, profile.province, profile.district) : null;
    const sort = placesSort === "near" && !origin ? "near" : placesSort;
    let list = Places.filterPlaces(valid, { ageMonths: age, category: placesCat, ...placesFilters });
    list = Places.filterByDrive(list, origin, placesDriveMax);
    list = Places.sortPlaces(list, sort, origin, placesStats);
    return PlacesView.render({ places: list, category: placesCat, filters: placesFilters, showNoReserve: Places.hasNoReserve(valid), origin, driveMax: origin ? placesDriveMax : null, sort });
  }
  async function renderPlacesTab() {
    const body = el("places-body");
    if (!body || typeof PlacesView === "undefined") return;
    await Promise.all([loadPlaces(), loadPlacesOffices(), loadPlacesStats()]);
    if (currentTab !== "places") return;
    body.innerHTML = placesViewHtml();
  }
  function placesOnClick(ev) {
    const cat = ev.target.closest("[data-places-cat]");
    if (cat) {
      placesCat = cat.getAttribute("data-places-cat") || "ALL";
      el("places-body").innerHTML = placesViewHtml();
      return;
    }
    const flt = ev.target.closest("[data-places-filter]");
    if (flt) {
      const k = flt.getAttribute("data-places-filter");
      if (k in placesFilters) placesFilters[k] = !placesFilters[k];
      el("places-body").innerHTML = placesViewHtml();
      return;
    }
    const dr = ev.target.closest("[data-places-drive]");
    if (dr) {
      const v = dr.getAttribute("data-places-drive");
      placesDriveMax = v === "all" ? null : Number(v) || null;
      el("places-body").innerHTML = placesViewHtml();
      return;
    }
    const so = ev.target.closest("[data-places-sort]");
    if (so) {
      placesSort = so.getAttribute("data-places-sort") === "popular" ? "popular" : "near";
      el("places-body").innerHTML = placesViewHtml();
      return;
    }
    const find = (id) => ((placesData && placesData.places) || []).find((p) => p.id === id);
    const add = ev.target.closest("[data-places-add]");
    if (add) {
      const place = find(add.getAttribute("data-places-add"));
      if (place) placesDetailOpen(place, "register");
      return;
    }
    if (ev.target.closest("a")) return; // 카드 안 외부 링크는 그대로 열린다
    const card = ev.target.closest("[data-places-open]");
    if (card) {
      const place = find(card.getAttribute("data-places-open"));
      if (place) placesDetailOpen(place, "info");
    }
  }
  // ── G2 장소 상세 시트 + 같은 시트 안 일정 등록(기존 buildCreateDoc/저장 경로 재사용, 새 일정 폼은 열지 않는다) ──
  const placesReg = { place: null, mode: "info", date: "", allDay: true, startTime: "", endTime: "", assignee: "", scope: "FAMILY", childKeys: [], saving: false, error: "", doneLabel: "", doneDate: "" };
  function placesDetailOpen(place, mode) {
    // 가구가 없으면 등록 단계 없이 상세만(안내 문구)
    Object.assign(placesReg, { place, mode: mode === "register" && usActive() ? "register" : "info", date: PlacesView.defaultVisitDate(new Date()), allDay: true, startTime: "", endTime: "", assignee: memActiveId() || "", scope: "FAMILY", childKeys: [], saving: false, error: "", doneLabel: "", doneDate: "" });
    placesDetailRender();
  }
  function placesDetailRender() {
    modalMode = "profile";
    const r = placesReg;
    const kids = usLinks().filter((l) => !l.removedAt).map((l) => ({ childKey: l.childKey, name: l.displayName || "" }));
    el("modal-content").innerHTML = PlacesView.renderDetail(r.place, { origin: profile ? Places.originOf(placesOffices, profile.province, profile.district) : null, mode: r.mode, canRegister: usActive(), today: new Date(), reg: r, members: usActive() ? HouseholdView.visibleMembers(usMembers()).map((m) => ({ memberId: m.memberId, label: m.label })) : [], kids, doneLabel: r.doneLabel, pickerHtml: r.mode === "register" ? HNDatePicker.markup("plr") : "" });
    el("detail-modal").classList.remove("hidden");
    const root = el("modal-content").querySelector("[data-places-detail]");
    if (root) root.addEventListener("click", placesDetailClick);
    if (r.mode === "register" && el("plr-dp-btn")) {
      const picker = HNDatePicker.bindById("plr", { getStage: () => "schedule", format: formatDateKR, placeholder: "날짜를 선택해주세요", onChange: (d) => { r.date = toISODate(d); } });
      if (r.date) picker.set(new Date(`${r.date}T00:00:00`));
      // 날짜 팝업이 열리면 시트를 팝업 아래까지 스크롤한다(시트 안에서 화면 아래로 넘치지 않게).
      el("plr-dp-btn").addEventListener("click", () => setTimeout(() => {
        const pop = el("plr-dp-popup");
        if (pop && pop.classList && !pop.classList.contains("hidden") && typeof pop.scrollIntoView === "function") pop.scrollIntoView({ block: "nearest" });
      }, 0));
    }
  }
  function placesReadTimes() {
    const rd = (id) => {
      const h = el(`${id}-h`) && el(`${id}-h`).value;
      let m = el(`${id}-m`) && el(`${id}-m`).value;
      if (!h) return "";
      return `${h}:${m || "00"}`;
    };
    if (placesReg.allDay === false && el("plr-start-h")) { placesReg.startTime = rd("plr-start"); placesReg.endTime = rd("plr-end"); }
  }
  async function placesDetailClick(ev) {
    const t = ev.target;
    const r = placesReg;
    if (t.closest("[data-places-close]")) return closeDetail();
    if (t.closest("[data-places-copy]")) {
      try { await navigator.clipboard.writeText(t.closest("[data-places-copy]").getAttribute("data-places-copy")); t.closest("[data-places-copy]").textContent = PlacesView.TEXT.copied; } catch (e) {}
      return;
    }
    if (t.closest("[data-places-reg-open]")) { r.mode = "register"; r.error = ""; return placesDetailRender(); }
    if (t.closest("[data-places-back]")) { placesReadTimes(); r.mode = "info"; return placesDetailRender(); }
    if (t.closest("[data-places-allday]")) { placesReadTimes(); r.allDay = !r.allDay; return placesDetailRender(); }
    const asg = t.closest("[data-places-assignee]");
    if (asg) { placesReadTimes(); const v = asg.getAttribute("data-places-assignee"); r.assignee = r.assignee === v ? "" : v; return placesDetailRender(); }
    const tg = t.closest("[data-places-target]");
    if (tg) { placesReadTimes(); const v = tg.getAttribute("data-places-target"); r.scope = v === "FAMILY" ? "FAMILY" : "CHILD"; r.childKeys = v === "FAMILY" ? [] : [v]; return placesDetailRender(); }
    if (t.closest("[data-places-view-cal]")) {
      closeDetail();
      const d = new Date(`${r.doneDate}T00:00:00`);
      viewMonth = new Date(d.getFullYear(), d.getMonth(), 1);
      selectedCalendarDate = d;
      switchTab("calendar");
      renderCalendar();
      renderSelectedDayPanel();
      attachListHandlers();
      return;
    }
    if (t.closest("[data-places-save]")) return placesSave();
  }
  async function placesSave() {
    const r = placesReg;
    if (r.saving || !r.place || !usActive()) return;
    placesReadTimes();
    const form = { ...UserScheduleView.newForm({ date: r.date, activeChildKey: usActiveChildKey(), links: usLinks(), defaultAssigneeId: r.assignee, defaultScope: "FAMILY" }), ...PlacesView.scheduleDraftFor(r.place), scope: r.scope, childKeys: r.scope === "CHILD" ? r.childKeys.slice() : [], assigneeMemberId: r.assignee || "", allDay: r.allDay !== false, startTime: r.allDay === false ? r.startTime : "", endTime: r.allDay === false ? r.endTime : "", memo: PlacesView.memoFor(r.place) };
    const now = Date.now();
    const prep = UserScheduleView.prepareSave(form, now);
    if (!prep.ok) { r.error = prep.messages[0] || PlacesView.TEXT.saveFail; return placesDetailRender(); }
    const built = UserSchedule.buildCreateDoc(prep.input, now);
    if (!built.ok) { r.error = UserScheduleView.messagesFromErrors(built.errors)[0] || PlacesView.TEXT.saveFail; return placesDetailRender(); }
    r.saving = true; r.error = "";
    placesDetailRender();
    try {
      const res = await HouseholdSync.createSchedule(hh.hid, built.doc);
      if (!res.ok) throw new Error(res.reason || "create-failed");
      r.saving = false;
      r.mode = "done";
      r.doneDate = r.date;
      r.doneLabel = PlacesView.dateLabel(r.date);
      placesCountOnce(r.place.id); // 인기순 신호(하루 1회/기기, 실패는 조용히 무시)
      usRefreshCalendar();
      placesDetailRender();
    } catch (e) {
      console.error("장소 일정 등록 실패", e);
      r.saving = false;
      r.error = PlacesView.TEXT.saveFail;
      placesDetailRender();
    }
  }

  function switchTab(name) {
    if (emptyHome && !profile) return emptyRender(name); // D5: 아이가 없는 홈에서는 탭마다 빈 상태 안내만
    // 체크리스트에서 특정 카테고리만 보다가 다른 탭으로 나가면, 돌아왔을 때 다시 전체 카테고리가 켜진 상태로 시작한다.
    if (currentTab === "checklist" && name !== "checklist" && Object.keys(CATEGORY_META).some((k) => !activeCats.has(k))) {
      activeCats = new Set(Object.keys(CATEGORY_META));
      renderFilterChips();
      renderChecklistTab();
    }
    currentTab = name;
    if (name !== "checklist" && checklistScope) {
      // 범위 보기는 전체 할 일 화면을 벗어나면 풀리고, 펼침 상태도 기본(현재·다음 월령)으로 돌린다.
      checklistScope = null;
      openMonthGroups = null;
    }
    TAB_NAMES.forEach((t) => el(`tab-${t}`).classList.toggle("hidden", t !== name));
    const navKey = name;
    document.querySelectorAll(".nav-item").forEach((btn) => btn.classList.toggle("active", btn.dataset.nav === navKey));
    window.scrollTo(0, 0);
    if (name === "places") renderPlacesTab();
    if (name === "checklist") {
      // 현재 월령 그룹이 보이도록 스크롤한다(과거 월령이 위에 쌓여 있어도 지금 챙길 것부터 보이게).
      requestAnimationFrame(() => {
        const now = document.querySelector('#list-checklist .month-group-card[data-now="1"]');
        if (now) now.scrollIntoView({ block: "start" });
      });
    }
  }

  async function buildAndRender() {
    hideEmptyHome();
    await ensureRegionSubsidyLoaded();
    schedule = buildSchedule({ ...profile, schoolPolicy }, dataset, completionsForEngine());
    rememberChild();
    rememberChildBirth();
    viewMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    selectedCalendarDate = new Date();
    renderFilterChips();
    switchTab("home");
    renderAll();
  }

  /** buildAndRender()와 달리 보고있던 달(viewMonth)은 그대로 두고 일정만 다시 계산한다(완료 처리 후 호출). */
  function refreshSchedule() {
    schedule = buildSchedule({ ...profile, schoolPolicy }, dataset, completionsForEngine());
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
    if (typeof acctApplyLandingMode === "function") acctApplyLandingMode(); // G1: 계정 ON 첫 화면 모드(OFF 는 아무 일도 하지 않는다)
    if (typeof previewRender === "function") previewRender();
  }

  /** 임신 중 → 출산 후 전환: 실제 출생일을 입력받아 stage를 born으로 바꾼다. */
  function showBornSwitchSheet() {
    modalMode = "profile";
    const todayIso = toISODate(new Date());
    const dueIso = toISODate(profile.birthDate);
    el("modal-content").innerHTML = `
      <h3>출산을 축하드려요!</h3>
      <p class="fine-print">아이가 태어난 날을 알려주세요. 입력한 날짜 기준으로 검진·접종·혜택 기간이 다시 계산돼요.</p>
      <div style="margin:8px 0 14px">${HNDatePicker.markup("born")}</div>
      <button class="btn-complete" id="btn-confirm-born">아이 정보로 바꾸기</button>
      <button class="btn-close" id="btn-cancel-born">취소</button>
    `;
    // 출산 예정일이 아직 오지 않았으면 오늘을 기본값으로 둔다(기존 동작 그대로). 값은 hidden 입력 #born-date 에 YYYY-MM-DD 로 들어간다.
    HNDatePicker.bindById("born", datePickerOpts(() => "born")).set(dueIso > todayIso ? new Date() : profile.birthDate);
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
      sub: "아이 생년월일과 사는 지역만 알려주시면<br />건강검진·예방접종·육아 혜택·발달까지 한 캘린더에서 챙겨드려요.",
      name: "아이 이름 또는 별칭", placeholder: "예: 하은이, 콩이",
      birth: "아이 생년월일", order: "몇째 아이인가요?", submit: "우리 아이 맞춤 육아 일정 만들기",
    },
    pregnant: {
      sub: "출산 예정일과 사는 지역만 알려주시면<br />출산 전 준비와 임신 중 혜택부터, 출산 후 검진·접종·발달 일정까지 이어서 챙겨드려요.",
      name: "태명 또는 별칭", placeholder: "예: 콩이, 튼튼이",
      birth: "출산 예정일", order: "몇째 아이가 태어날 예정인가요?", submit: "출산 전후 맞춤 일정 만들기",
    },
  };

  function setLandingStage(stage) {
    landingStage = stage;
    const base = STAGE_TEXT[stage || "born"];
    // G1: 계정 기능 ON 일 때만 새 문구(OFF 는 기존 문구 그대로)
    const t = acctEnabled() ? { ...base, sub: AccountView.MSG.onboard[stage === "pregnant" ? "pregnantSub" : "bornSub"], submit: AccountView.MSG.onboard[stage === "pregnant" ? "pregnantSubmit" : "bornSubmit"] } : base;
    const bp = el("beta-preview-slot");
    if (bp) bp.classList.toggle("hidden", !!stage);
    el("hero-sub").innerHTML = t.sub;
    el("lbl-name").innerHTML = `${t.name} <span class="req">*</span>`;
    el("childName").placeholder = t.placeholder;
    el("lbl-birth").innerHTML = `${t.birth} <span class="req">*</span>`;
    el("lbl-order").innerHTML = `${t.order} <span class="req">*</span>`;
    el("btn-submit").textContent = t.submit;
    if (typeof acctSyncStageToggle === "function") acctSyncStageToggle(stage);
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

    // N1: '새 아이 추가' 중이었다면 이제서야(검증을 통과한 저장 시점에) 이전 아이의 로컬 상태를 비운다.
    const wasNewChildMode = newChildMode;
    if (newChildMode) finishNewChildEntry();
    // 온보딩 가족 단계: 이 기기에 저장된 아이가 하나도 없던 '첫 아이' 저장인지 저장 전에 기록한다(새 아이 추가·불러오기와 구분).
    const onbFirstChild = !wasNewChildMode && loadChildren().length === 0;
    profile = { name, birthDate: new Date(birthDateStr + "T00:00:00"), birthOrder, stage: landingStage || "born", province, district };
    saveProfile(profile);
    await buildAndRender();
    showCalendarView();
    await ensureFamilyCode();
    onbMaybeOffer(!onbFirstChild);
  }

  async function handleLoadCode() {
    const input = el("familyCodeInput");
    const code = input.value.trim().toUpperCase();
    el("code-error").classList.add("hidden");
    if (!code) return;
    if (hhEnabled() && !acctEnabled()) { // 계정 모드: 입력칸은 보이지 않고 내부 호출만 있다(코드=아이 기록 코드 하나) — 가족코드 합류는 가입 시트가 맡는다
      hhResetEntryMessage();
      if (HouseholdView.classifyCode(code).kind === "household") return hhJoinFromEntry(code);
    }
    try {
      const data = await FamilySync.fetchFamily(code);
      if (!data || !data.profile) {
        el("code-error").classList.remove("hidden");
        return;
      }
      if (newChildMode) finishNewChildEntry(); // N1: 불러오기가 성공한 시점에만 이전 아이의 로컬 상태를 비운다
      profile = profileFromPlain(data.profile);
      completed = data.completed || {};
      saveProfile(profile);
      saveCompleted();
      familyCode = code;
      FamilySync.saveCode(code);
      HNRecords.use(code, data.records);
      startListeningFamily();
      await buildAndRender();
      showCalendarView();
    } catch (e) {
      console.error(e);
      el("code-error").classList.remove("hidden");
    }
  }

  // ── N1 새 아이 추가: 입력하는 동안은 지금 아이를 그대로 두고, 저장(또는 불러오기 성공)하는 시점에만 비운다 ─────────────────────
  const NEW_CHILD_MSG = Object.freeze({
    cancel: "← 취소",
    note: "지금 아이 정보는 그대로 있어요.",
    offlineTitle: "지금은 새 아이를 추가할 수 없어요",
    offlineBody: "인터넷에 연결되어 있지 않아 지금 아이 정보를 안전하게 저장해 둘 수 없어요. 연결된 뒤에 다시 시도해 주세요.",
    close: "닫기",
  });
  let newChildMode = false; // 새 아이 입력 화면 중(이전 아이는 아직 지워지지 않았다)
  let newChildSnapshot = null; // 입력 화면에 들어올 때의 가구 연결(취소하면 되돌린다)
  /** 이전 아이의 로컬 상태 비우기(기존 handleReset 의 데이터 부분). 화면 전환은 하지 않는다. */
  function applyNewChildReset() {
    localStorage.removeItem(PROFILE_KEY);
    // 완료 기록도 함께 비운다 — 남겨 두면 새로 만든 아이(새 가족코드)에 이전 아이의 완료 상태가 섞여 들어간다.
    completed = {};
    saveCompleted();
    FamilySync.clearCode();
    if (unsubscribeFamily) unsubscribeFamily();
    familyCode = null;
    profile = null;
    // completed와 같은 이유로 코드 없는 임시 기록도 비운다(새 아이에게 이전 아이의 기록이 섞이지 않게).
    HNRecords.clearLocal();
    HNRecords.use(null);
  }
  // ── G17 로컬 아이 데이터의 주인(owner uid): 다른 계정의 아이가 이 기기 화면에 섞이지 않게 한다. 계정 모드에서만 쓴다(플래그 OFF 는 읽지도 쓰지도 않는다). ──
  const ACCT_OWNER_KEY = "hannun_local_owner";
  const acctChildKeys = () => [PROFILE_KEY, COMPLETED_KEY, "hannun_children", "hannun_child_births", "hannun_migrate_kept"]; // 아이별 로컬 키(기능 플래그·로그아웃 표시·온보딩 본 표시 등은 대상 아님)
  function acctOwnerRead() {
    try { return localStorage.getItem(ACCT_OWNER_KEY) || ""; } catch (e) { return ""; }
  }
  function acctOwnerWrite(uid) {
    try { if (uid) localStorage.setItem(ACCT_OWNER_KEY, uid); else localStorage.removeItem(ACCT_OWNER_KEY); } catch (e) {}
  }
  /** 이 기기의 아이 관련 로컬 데이터를 비운다(서버는 건드리지 않는다). 화면 전환은 하지 않는다. */
  function acctWipeLocalChild() {
    try { applyNewChildReset(); } catch (e) { console.error("로컬 아이 데이터 정리 실패", e); }
    try { acctChildKeys().forEach((k) => localStorage.removeItem(k)); } catch (e) {}
    // 아이 코드·가구 id 를 뒤에 붙이는 접두어 키(직접 기록=비공개 메모 포함, 가구 미러·대기열)도 모두 지운다.
    try {
      const gone = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && ["hannun_records:", "hannun_household:", "hannun_household_pending:"].some((p) => k.indexOf(p) === 0)) gone.push(k);
      }
      gone.forEach((k) => localStorage.removeItem(k));
    } catch (e) {}
    profile = null;
    familyCode = null;
    completed = {};
    const nm = el("childName");
    if (nm) nm.value = "";
  }
  /** 로그인한 uid 가 로컬 데이터를 만든 uid 와 다르면 비운다. 기록이 없으면(로그인 기록 없는 기기·기존 사용자) 지우지 않고 이 uid 의 것으로 연결한다. */
  function acctOwnerSync(u) {
    if (!acctEnabled() || !u || !u.uid) return;
    const owner = acctOwnerRead();
    if (!owner) return acctOwnerWrite(u.uid);
    if (owner === u.uid) return;
    if (hh.hid) { try { hhLeaveLocal(); } catch (e) { console.error("다른 계정 로그인 뒤 가구 정리 실패", e); } }
    acctWipeLocalChild();
    acctOwnerWrite(u.uid);
    if (typeof showEmptyHome === "function") showEmptyHome();
  }
  /** 저장·불러오기 성공 시점: 이전 아이를 비우고 입력 모드를 끝낸다. */
  function finishNewChildEntry() {
    applyNewChildReset();
    newChildMode = false;
    newChildSnapshot = null;
    el("new-child-bar").classList.add("hidden");
  }
  /** 가구 연결(code·id)을 입력 화면에 들어올 때의 값으로 되돌린다 — 입력 중 다른 가구에 참여했다가 취소한 경우. */
  function hhRestoreSaved(snap) {
    if (!hhEnabled() || !snap || (hh.hid === snap.hid && hh.code === snap.code)) return;
    try {
      HouseholdSync.stopListening();
      if (snap.hid && snap.code) {
        localStorage.setItem(HH_ID_KEY, snap.hid);
        localStorage.setItem(HH_CODE_KEY, snap.code);
      } else {
        localStorage.removeItem(HH_ID_KEY);
        localStorage.removeItem(HH_CODE_KEY);
      }
    } catch (e) {}
    hhLoadSaved();
    if (hh.hid && hh.code) hhStart();
    hhRender();
  }
  /** 입력 화면 열기: 현재 아이는 건드리지 않는다(프로필·완료·가족코드·기록 그대로). 취소 줄을 보인다. */
  function enterNewChildEntry(opts) {
    rememberChild(); // 이 기기 아이 목록에 지금 아이를 확실히 남긴다(나중에 전환 시트로 언제든 복귀)
    newChildMode = true;
    newChildSnapshot = { hid: hhEnabled() ? hh.hid : null, code: hhEnabled() ? hh.code : null };
    el("query-form").reset();
    // G10: 계정 모드는 상황 선택 화면 없이 바로 입력 폼(기본 날짜 종류는 가입 때 자녀 유무: 있어요=생년월일, 없어요=출산 예정일)
    setLandingStage(typeof acctEnabled === "function" && acctEnabled() ? (acctExpecting() ? "pregnant" : "born") : null);
    if (opts && opts.codeEntry) el("code-entry").classList.remove("hidden");
    el("btn-new-child-cancel").textContent = NEW_CHILD_MSG.cancel;
    el("new-child-note").textContent = NEW_CHILD_MSG.note;
    el("new-child-bar").classList.remove("hidden");
    if (typeof acctPrefillRegion === "function") acctPrefillRegion();
    showLandingView();
  }
  /** 취소: 저장소·메모리 상태는 바꾸지 않고(입력 화면에서 참여한 가구 연결만 되돌림) 지금 아이 화면으로 돌아간다. */
  function cancelNewChildEntry() {
    if (!newChildMode) return;
    newChildMode = false;
    const snap = newChildSnapshot;
    newChildSnapshot = null;
    el("new-child-bar").classList.add("hidden");
    el("code-entry").classList.add("hidden");
    el("code-error").classList.add("hidden");
    if (hhEnabled()) hhResetEntryMessage();
    hhRestoreSaved(snap);
    fillFormFromProfile();
    if (!profile && acctEnabled()) return showEmptyHome(); // D5: 아이를 등록하지 않고 돌아오면 아이가 없는 홈
    showCalendarView();
  }
  /** 폼 입력칸을 지금 아이의 프로필로 다시 채운다(입력 화면에서 비웠던 칸 복원). */
  function fillFormFromProfile() {
    if (!profile) return;
    populateDistricts(profile.province, profile.district);
    el("province").value = profile.province;
    el("childName").value = profile.name || "";
    el("birthOrder").value = profile.birthOrder || "";
    syncOrderChips();
    renderProvinceChips();
    renderDistrictChips();
    setBirthDatePicker(profile.birthDate);
  }
  /** 입력 화면 들어가기 전 보호: 가족코드가 없는 아이는 먼저 코드(서버 백업)를 만들고, 못 만들면 들어가지 않는다(로컬 기록 유실 방지). */
  async function beginNewChildEntry(opts) {
    closeDetail();
    if (profile && !familyCode) {
      try {
        await ensureFamilyCode();
      } catch (e) {}
      if (!familyCode) {
        modalMode = "new-child";
        el("modal-content").innerHTML = `<h3>${NEW_CHILD_MSG.offlineTitle}</h3><p class="fine-print">${NEW_CHILD_MSG.offlineBody}</p><button class="btn-close" id="btn-close-offline-new-child">${NEW_CHILD_MSG.close}</button>`;
        el("detail-modal").classList.remove("hidden");
        el("btn-close-offline-new-child").addEventListener("click", closeDetail);
        return;
      }
    }
    enterNewChildEntry(opts);
  }

  /** 헤더의 + 버튼 — 새 아이를 처음부터 입력한다(새 가족코드 생성). 기존 아이는 가족코드로 다시 불러올 수 있다. */
  // ── N2 헤더 + 버튼: 가구(가족 캘린더)가 켜져 있을 때만 '추가하기' 선택 시트(일정 추가 / 새 아이 추가). 꺼져 있으면 예전처럼 바로 새 아이 시트 ──
  const ADD_MENU_MSG = Object.freeze({
    title: "추가하기",
    schedule: "일정 추가",
    child: "새 아이 추가",
    needHousehold: "일정을 추가하려면 먼저 프로필에서 가족 캘린더를 만들어 주세요",
    close: "닫기",
  });
  function showAddMenuSheet() {
    if (!hhEnabled()) return showNewChildSheet(); // 가구 플래그 OFF: 이전과 100% 동일
    const can = usActive();
    const acctOn = acctEnabled(); // 계정 기능이 켜졌을 때만 '아이 등록하기'·'가족 초대하기'
    modalMode = "add-menu";
    if (acctOn) { // G7: 계정 모드 + 메뉴 = 타일 3개(일정 추가·아이 등록하기·가족 추가)
      el("modal-content").innerHTML = AccountView.renderAddMenu({ canSchedule: can });
      el("detail-modal").classList.remove("hidden");
      addTilesBind();
      el("btn-add-menu-close").addEventListener("click", closeDetail);
      return;
    }
    el("modal-content").innerHTML = `
      <h3>${ADD_MENU_MSG.title}</h3>
      <button class="btn-complete" id="btn-add-menu-schedule"${can ? "" : " disabled"}>${ADD_MENU_MSG.schedule}</button>
      ${can ? "" : `<p class="fine-print" id="add-menu-note">${ADD_MENU_MSG.needHousehold}</p>`}
      <button class="btn-complete" id="btn-add-menu-child">${acctOn ? AccountView.MSG.registerChild : ADD_MENU_MSG.child}</button>
      ${acctOn ? `<button class="btn-complete" id="btn-add-menu-invite">${AccountView.MSG.inviteMenu}</button>` : ""}
      <button class="btn-close" id="btn-add-menu-close">${ADD_MENU_MSG.close}</button>
    `;
    el("detail-modal").classList.remove("hidden");
    if (acctOn) el("btn-add-menu-invite").addEventListener("click", () => acctOpenInvite());
    el("btn-add-menu-close").addEventListener("click", closeDetail);
    el("btn-add-menu-child").addEventListener("click", showNewChildSheet);
    el("btn-add-menu-schedule").addEventListener("click", () => {
      if (!usActive()) return; // 비활성 버튼(가구 없음)은 아무 일도 하지 않는다
      usOpenForm(null, toISODate(new Date()), { scope: "FAMILY" }); // 대상 기본값은 가족 전체, 담당 기본값은 이 기기 사용자(B6-lite)
    });
  }
  /** G7 타일: 일정 추가 / 아이 등록하기 / 가족 추가로 바로 이동(메뉴·아이 등록 시트에서 id 로 연결, 가족 추가 시트는 acctOnClick 이 처리). */
  function addTabGo(tab) {
    if (tab === "schedule") {
      if (!usActive()) return; // 비활성 타일(가구 없음)은 아무 일도 하지 않는다
      return usOpenForm(null, toISODate(new Date()), { scope: "FAMILY" }); // 대상 기본값은 가족 전체, 담당 기본값은 이 기기 사용자(B6-lite)
    }
    if (tab === "child") return showAddChildSheet();
    if (tab === "invite") return acctOpenInvite();
  }
  function addTilesBind() {
    [["btn-add-menu-schedule", "schedule"], ["btn-add-menu-child", "child"], ["btn-add-menu-invite", "invite"]].forEach(([id, tab]) => {
      const b = el(id);
      if (b) b.addEventListener("click", () => addTabGo(tab));
    });
  }
  /** G10: 계정 모드의 아이 등록하기는 안내 시트·상황 선택 없이 바로 입력 폼을 연다. 비계정 '새 아이 추가'(showNewChildSheet)는 그대로. */
  function showAddChildSheet() {
    closeDetail();
    return beginNewChildEntry({ codeEntry: false });
  }
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
    el("btn-confirm-new-child").addEventListener("click", () => beginNewChildEntry({ codeEntry: false }));
  }

  // ── 앱 버전 표시 · 새로고침 ─────────────────────────────────────────────
  // 홈 화면(PWA)으로 연 앱은 껐다 켜도 옛 화면이 메모리에 남을 수 있다. 헤더에 실행 중인 버전을
  // 보여주고, 서버의 최신 버전(js/version.js)과 다르면 버튼이 강조된다. 버튼을 누르면 링크로
  // 새로 여는 것과 같게 캐시·서비스워커를 비우고 다시 불러온다(입력한 정보는 그대로 유지).
  const RUNNING_VERSION = self.APP_VERSION || "";

  async function fetchLatestVersion() {
    try {
      const res = await fetch(`js/version.js?ts=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) return null;
      const m = (await res.text()).match(/APP_VERSION\s*=\s*"([^"]+)"/);
      return m ? m[1] : null;
    } catch (e) {
      return null; // 오프라인 등 — 조용히 넘어간다
    }
  }

  function renderVersionButton(latest) {
    const btn = el("btn-refresh");
    const label = el("app-version-text");
    if (!btn || !label) return;
    const hasUpdate = !!latest && !!RUNNING_VERSION && latest !== RUNNING_VERSION;
    btn.classList.toggle("has-update", hasUpdate);
    label.textContent = hasUpdate ? `새 버전 v${latest}` : RUNNING_VERSION ? `v${RUNNING_VERSION}` : "";
    btn.setAttribute("aria-label", hasUpdate ? `새 버전 v${latest}이 있어요. 눌러서 업데이트` : "최신 버전으로 새로고침");
  }

  async function checkForUpdate() {
    renderVersionButton(await fetchLatestVersion());
  }

  /** 서비스워커·캐시를 비우고 앱 파일을 서버에서 새로 받은 뒤 다시 불러온다. */
  async function refreshApp() {
    const btn = el("btn-refresh");
    if (btn) btn.classList.add("busy");
    try {
      if ("serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
      }
      if (window.caches) {
        const names = await caches.keys();
        await Promise.all(names.map((n) => caches.delete(n)));
      }
      // 브라우저 HTTP 캐시에 옛 파일이 남아 있지 않도록 페이지가 쓰는 파일을 서버에서 강제로 다시 받는다.
      const urls = new Set([location.href.split("#")[0], new URL("manifest.json", location.href).href]);
      document.querySelectorAll("script[src], link[rel='stylesheet']").forEach((n) => urls.add(n.src || n.href));
      await Promise.all([...urls].map((u) => fetch(u, { cache: "reload" }).catch(() => null)));
    } catch (e) {
      console.error("새로고침 준비 중 오류", e);
    }
    location.reload();
  }

  function setupRefreshButton() {
    const btn = el("btn-refresh");
    if (!btn) return;
    renderVersionButton(null);
    btn.addEventListener("click", refreshApp);
    checkForUpdate();
    // 앱으로 돌아올 때마다 새 버전이 있는지 확인만 한다(자동으로 새로고침하지는 않는다).
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") checkForUpdate();
    });
  }

  // ── 아이 전환(여러 아이) ───────────────────────────────────────────────
  // 가족코드는 이미 "아이 1명 = 코드 1개" 구조다. 이 기기에서 열어 본 아이의 코드 목록만 로컬에 두고,
  // 전환은 그 코드로 다시 불러오는 것(handleLoadCode와 같은 경로)이라 별도 데이터 마이그레이션이 없다.
  const CHILDREN_KEY = "hannun_children";
  const esc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function loadChildren() {
    try {
      const l = JSON.parse(localStorage.getItem(CHILDREN_KEY));
      return Array.isArray(l) ? l : [];
    } catch (e) {
      return [];
    }
  }

  function rememberChild() {
    if (!familyCode || !profile) return;
    try {
      const list = loadChildren();
      const entry = { code: familyCode, name: childDisplayName(), stage: profile.stage || "born" };
      const i = list.findIndex((c) => c.code === familyCode);
      if (i >= 0) list[i] = entry;
      else list.push(entry);
      localStorage.setItem(CHILDREN_KEY, JSON.stringify(list.slice(0, 8)));
    } catch (e) {}
    if (typeof acctEnabled === "function" && acctEnabled() && typeof usRefreshHome === "function") usRefreshHome(); // G15: 기기 아이 목록이 바뀌면(방금 등록한 둘째) 홈의 아이 칩을 바로 갱신
  }

  async function switchToChild(code) {
    const errEl = el("child-switch-error");
    if (errEl) errEl.classList.add("hidden");
    try {
      const data = await FamilySync.fetchFamily(code);
      if (!data || !data.profile) throw new Error("가족 정보를 찾을 수 없어요");
      if (unsubscribeFamily) unsubscribeFamily();
      profile = profileFromPlain(data.profile);
      completed = data.completed || {};
      saveProfile(profile);
      saveCompleted();
      familyCode = code;
      FamilySync.saveCode(code);
      HNRecords.use(code, data.records);
      startListeningFamily();
      populateDistricts(profile.province, profile.district);
      el("province").value = profile.province;
      el("childName").value = profile.name || "";
      el("birthOrder").value = profile.birthOrder || "";
      syncOrderChips();
      renderProvinceChips();
      renderDistrictChips();
      setBirthDatePicker(profile.birthDate);
      closeDetail();
      openMonthGroups = null;
      await buildAndRender();
    } catch (e) {
      console.error("아이 전환 실패", e);
      if (errEl) errEl.classList.remove("hidden");
    }
  }

  // ── 가족 캘린더(가구) — 문구·마크업 js/household-view.js, Firestore I/O 는 js/household-sync.js 만 한다. ──
  // 플래그(FEATURES.household)가 꺼져 있으면 아래 함수는 호출되지 않거나 즉시 반환한다(기존 화면·동작 그대로).
  // 아이 문서(families/{코드})에는 쓰지 않는다. 가구 ID 는 이 기기 localStorage(hannun_household_id)에만 둔다(R1).
  const HH_ID_KEY = "hannun_household_id";
  const HH_CODE_KEY = "hannun_household_code"; // household-sync.js 의 CODE_KEY 와 같은 값(입력 중 가구 참여를 취소할 때 되돌리는 용도)
  const hh = { view: "none", hid: null, code: null, notice: null, rulesUnavailable: false, lifecycle: false };
  let hhJoining = false; // 가족 코드 참여 진행 중 — 시트를 닫았다 다시 열어도 중복 호출을 막고 'joining' 뷰를 유지한다
  const hhEnabled = () => typeof HouseholdView !== "undefined" && HouseholdView.isEnabled(window.FEATURES);

  function hhLoadSaved() {
    hh.code = HouseholdSync.getSavedCode();
    try {
      hh.hid = localStorage.getItem(HH_ID_KEY);
    } catch (e) {
      hh.hid = null;
    }
    hh.view = hhJoining ? "joining" : hh.code && hh.hid ? "active" : "none";
  }
  /** 현재 아이가 가구에 아직 링크되지 않았을 때만 '이 아이를 가족 캘린더에 연결'을 보인다(자동 연결·팝업 없음). */
  const hhCanLinkChild = () => HouseholdView.canLinkCurrentChild({ hasHousehold: !!(hh.hid && hh.code), familyCode, pregnant: isPregnant(), mirror: hh.hid ? HouseholdSync.getMirror(hh.hid) : null });
  function hhState() {
    const st = hh.hid ? HouseholdSync.getStatus(hh.hid) : { pending: 0, permissionDenied: false };
    // 아이 전환 진입점: 가구가 있거나, 가구가 없어도 이 기기에 저장된 아이가 2명 이상일 때.
    const showChildSwitch = !!(hh.hid && hh.code) || loadChildren().length >= 2;
    return { enabled: true, view: hh.view, childName: childDisplayName(), code: hh.code, pending: st.pending, permissionDenied: st.permissionDenied, rulesUnavailable: hh.rulesUnavailable, notice: hh.notice, joinInput: hh.joinInput, showChildSwitch, canLinkChild: hhCanLinkChild(), hideLeave: acctEnabled() && !!acct.user, acctMode: acctEnabled() && !!acct.user };
  }
  function hhRender() {
    const slot = el("hh-slot");
    if (slot) slot.innerHTML = HouseholdView.renderSection(hhState());
    memRender(); // 가구 상태(가입·생성)가 바뀌면 구성원 영역도 다시 그린다
  }
  /** 앱 시작·online·앱으로 돌아올 때 대기열을 다시 보내고, 끝나면 화면 상태 줄을 갱신한다(household-sync.attachLifecycle 은 화면 갱신 콜백이 없어 쓰지 않는다). */
  function hhAttachLifecycle() {
    if (hh.lifecycle) return;
    hh.lifecycle = true;
    const go = async () => {
      if (!hh.hid) return;
      try {
        await HouseholdSync.flush(hh.hid);
      } catch (e) {
        console.error("가족 캘린더 재전송 실패", e);
      }
      hhAfterSync();
    };
    window.addEventListener("online", go);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") go();
    });
    go();
  }
  /** 가구 데이터가 바뀐 뒤(리스너·재전송·참여): 프로필 시트의 상태 줄과 캘린더(추가한 일정)를 다시 그린다. */
  function hhAfterSync() {
    hhRender();
    usRefreshCalendar();
  }
  function hhStart() {
    if (!hh.hid) return;
    HouseholdSync.startListening(hh.hid, hhAfterSync);
    hhAttachLifecycle();
  }
  function hhSetJoined(hid, code) {
    hh.hid = hid;
    hh.code = code;
    hh.view = "active";
    try {
      localStorage.setItem(HH_ID_KEY, hid);
    } catch (e) {}
    hhStart();
  }
  /** N6: 이 기기에서만 가구를 나간다. 서버 쓰기 없음. 가구 코드·id·미러·대기열·이 기기 사용자 키만 지우고 아이·완료·기록은 건드리지 않는다. */
  function hhLeaveLocal() {
    const r = HouseholdSync.leaveLocal(hh.hid);
    if (!r.ok) throw new Error(r.reason || "leave-failed");
    try {
      localStorage.removeItem(HH_ID_KEY);
      localStorage.removeItem(ACTIVE_MEMBER_KEY);
    } catch (e) {}
    hh.hid = null;
    hh.code = null;
    hh.view = "none";
    hh.notice = { kind: "left" };
    mem.view = "list"; mem.form = null; mem.deleteId = null;
  }
  /** 프로필 시트가 열릴 때: 이 기기의 가구 정보를 읽고 슬롯을 그린다. */
  function hhOpenSection() {
    hhLoadSaved();
    hh.notice = null;
    hh.joinInput = "";
    mem.view = "list"; mem.form = null; mem.deleteId = null;
    hhRender();
    const slot = el("hh-slot");
    if (slot) slot.addEventListener("click", hhOnClick);
    const mslot = el("members-slot");
    if (mslot) mslot.addEventListener("click", memOnClick);
  }
  /** 쓰기 없는 읽기 탐지: 규칙이 배포돼 있으면 없는 코드도 not-found 로 돌아오고, 미배포면 permission-denied 로 막힌다. */
  async function hhProbeRules() {
    try {
      await HouseholdSync.joinHousehold("ZZZZZZZZ");
      return "ok";
    } catch (e) {
      return e && e.code === "permission-denied" ? "denied" : "error";
    }
  }
  async function hhOnClick(ev) {
    const b = ev.target.closest("[data-hh-action]");
    if (!b) return;
    ev.stopPropagation();
    const action = b.getAttribute("data-hh-action");
    hh.notice = null;
    try {
      if (action === "create") {
        hh.view = "creating";
        hhRender();
        const probe = await hhProbeRules();
        if (probe === "denied") hh.rulesUnavailable = true;
        else if (probe === "error") hh.notice = { kind: "error", text: HouseholdView.failMessage(null) };
        hh.view = probe === "ok" ? "consent" : "none";
      } else if (action === "join") {
        // 가족 코드로 참여 — 가구 가입만 한다. 이 기기의 현재 아이·profile·completed·familyCode 는 바꾸지 않는다(핫픽스 설계 A).
        if (hhJoining) {
          hh.view = "joining"; // 이미 진행 중 — 두 번째 호출을 보내지 않는다
        } else {
        const slot = el("hh-slot");
        const inp = slot && slot.querySelector('[data-hh-input="join-code"]');
        const typed = inp ? inp.value : "";
        hh.joinInput = typed;
        const cls = HouseholdView.classifyCode(typed, { accounts: acctEnabled() });
        if (cls.kind !== "household") {
          hh.notice = { kind: "error", text: HouseholdView.MSG.joinNotFound };
        } else {
          hh.view = "joining";
          hhJoining = true;
          hhRender();
          let r;
          try {
            r = await HouseholdSync.joinHousehold(cls.code);
          } finally {
            hhJoining = false;
          }
          if (!r.ok) {
            hh.notice = { kind: "error", text: HouseholdView.joinMessage(r) };
            hh.view = "none";
          } else {
            hhSetJoined(r.householdId, cls.code);
            hh.joinInput = "";
            hh.notice = { kind: "joinOk", text: HouseholdView.joinMessage(r) + (hhCanLinkChild() ? " " + HouseholdView.MSG.linkJoinHint : "") };
          }
        }
        }
      } else if (action === "child-switch") {
        showChildSwitchSheet();
        return;
      } else if (action === "cancel-create") {
        hh.view = "none";
      } else if (action === "confirm-create") {
        hh.view = "creating";
        hhRender();
        const r = await HouseholdSync.createHousehold({ firstChild: familyCode ? { familyCode, displayName: childDisplayName() } : undefined });
        if (!r.ok) throw new Error(r.reason || "create-failed");
        hhSetJoined(r.householdId, r.code);
        hh.notice = { kind: "created" };
      } else if (action === "copy") {
        try {
          await navigator.clipboard.writeText(hh.code);
          hh.notice = { kind: "copied" };
        } catch (e) {
          hh.notice = { kind: "copyFailed" };
        }
      } else if (action === "reissue") {
        hh.view = "reissue-confirm";
      } else if (action === "link-child") {
        hh.view = "link-confirm";
      } else if (action === "cancel-link-child") {
        hh.view = "active";
      } else if (action === "confirm-link-child") {
        // 서버 쓰기는 addChild 1건뿐(아이 문서는 건드리지 않는다). 이미 링크돼 있으면 아무것도 쓰지 않는다.
        const m = HouseholdSync.getMirror(hh.hid);
        if (familyCode && !HouseholdView.isChildLinked(m, familyCode)) {
          const order = Object.keys((m && m.children) || {}).length + 1;
          const w = await HouseholdSync.addChild(hh.hid, { familyCode, displayName: childDisplayName(), order });
          if (!w.ok) throw new Error(w.reason || "link-failed");
        }
        hh.view = "active";
        hh.notice = { kind: "linked" };
      } else if (action === "leave") {
        hh.view = "leave-confirm";
      } else if (action === "cancel-leave") {
        hh.view = "active";
      } else if (action === "confirm-leave") {
        hhLeaveLocal();
      } else if (action === "cancel-reissue") {
        hh.view = "active";
      } else if (action === "confirm-reissue") {
        hh.view = "reissuing";
        hhRender();
        try {
          const r = await HouseholdSync.reissueCode(hh.hid, hh.code);
          if (!r.ok) throw new Error(r.reason || "reissue-failed");
          hh.code = r.code;
          hh.notice = { kind: "reissued" };
        } catch (e) {
          hh.notice = { kind: "error", text: HouseholdView.failMessage(e, "reissue") };
        }
        hh.view = "active";
      }
    } catch (e) {
      console.error("가족 캘린더 처리 실패", e);
      hh.notice = { kind: "error", text: HouseholdView.failMessage(e) };
      hh.view = hh.hid && hh.code ? "active" : "none";
    }
    hhRender();
    usRefreshCalendar();
  }
  // ── 구성원(B6-lite): 이름·역할 수정/추가/삭제(soft)와 "이 기기를 쓰는 사람" ───────────────────────────
  // 서버 쓰기는 HouseholdSync.upsertMember / removeMember 뿐이다(규칙·스키마 변경 없음). 이 기기 사용자는 localStorage 에만 저장하고 표시용이다(본인 확인 아님).
  const ACTIVE_MEMBER_KEY = "hannun_active_member";
  const mem = { view: "list", form: null, deleteId: null, saving: false }; // saving: 저장·삭제 진행 중(중복 클릭 방지, finally 에서 해제)
  function memActiveId() {
    const me = usMeId(); // 계정 모드: 로그인한 내 구성원이 '이 기기를 쓰는 사람'(담당자 기본값)
    if (me) return me;
    let id = "";
    try {
      id = localStorage.getItem(ACTIVE_MEMBER_KEY) || "";
    } catch (e) {}
    return HouseholdView.activeMemberOf(usMembers(), id); // 삭제됐거나 목록에 없으면 미지정
  }
  function memSetActive(id) {
    try {
      if (id) localStorage.setItem(ACTIVE_MEMBER_KEY, id);
      else localStorage.removeItem(ACTIVE_MEMBER_KEY);
    } catch (e) {
      console.warn("이 기기 사용자를 저장하지 못했어요(저장소 사용 불가).", e);
    }
  }
  const memState = () => ({ acctMode: acctEnabled(), meId: usMeId(), meName: (acctIdentity() || {}).name || "", children: usLinks().filter((l) => !l.removedAt), enabled: hhEnabled(), hasHousehold: !!(hh.hid && hh.code), members: usMembers(), activeMemberId: memActiveId(), view: mem.view, form: mem.form, deleteId: mem.deleteId, saving: mem.saving });
  function memRender() {
    const slot = el("members-slot");
    if (!slot || !hhEnabled()) return;
    // 이름 입력 중에 다시 그려지면(가구 섹션 클릭·서버 스냅샷) 입력창이 옛 값으로 되돌아가므로, 그리기 전에 지금 입력값을 폼에 반영한다.
    if (mem.view === "form" && mem.form) mem.form.label = memReadLabel();
    slot.innerHTML = HouseholdView.renderMembers(memState());
  }
  function memReadLabel() {
    const slot = el("members-slot");
    const inp = slot && slot.querySelector('[data-mem-input="label"]');
    return inp ? inp.value : mem.form ? mem.form.label : "";
  }
  async function memOnClick(ev) {
    const roleBtn = ev.target.closest("[data-mem-role]");
    if (roleBtn && mem.form && !mem.saving) {
      ev.stopPropagation();
      mem.form.label = memReadLabel(); // 역할을 바꿔도 입력 중이던 이름은 유지한다
      mem.form.role = roleBtn.getAttribute("data-mem-role");
      mem.form.error = null;
      memRender();
      return;
    }
    const b = ev.target.closest("[data-mem-action]");
    if (!b) return;
    ev.stopPropagation();
    const action = b.getAttribute("data-mem-action");
    const id = b.getAttribute("data-member-id") || "";
    const visible = HouseholdView.visibleMembers(usMembers());
    try {
      if (action === "set-active") {
        memSetActive(id);
      } else if (action === "clear-active") {
        memSetActive("");
      } else if (action === "add") {
        if (visible.length >= HouseholdView.MEMBER_MAX) return;
        mem.form = { memberId: null, role: acctEnabled() ? "" : "OTHER", label: "", error: null };
        mem.view = "form";
      } else if (action === "edit") {
        const m = visible.find((x) => x.memberId === id);
        if (!m) return;
        mem.form = { memberId: id, role: acctEnabled() ? HouseholdView.formRoleOf(m) : m.role, label: m.label, error: null };
        mem.view = "form";
      } else if (action === "ask-delete") {
        if (acctEnabled() && id === usMeId()) return; // 나 자신은 지울 수 없다
        mem.deleteId = id;
        mem.view = "delete";
      } else if (action === "ask-remove-child") {
        return usChipDelAsk(`CHILD:${id}`); // 아이 빼기: 확인 시트(G6 문구 재사용)
      } else if (action === "cancel") {
        mem.view = "list"; mem.form = null; mem.deleteId = null;
      } else if (action === "save") {
        const form = mem.form;
        if (!form || mem.saving) return; // 저장 중에는 두 번째 클릭을 무시한다
        form.label = memReadLabel();
        const v = HouseholdView.validateMemberForm(form, { accounts: acctEnabled() });
        if (!v.ok) {
          form.error = v.error;
        } else if (!form.memberId && visible.length >= HouseholdView.MEMBER_MAX) {
          form.error = HouseholdView.MSG.memMax;
        } else {
          const all = usMembers();
          const old = form.memberId ? all.find((x) => x.memberId === form.memberId) : null;
          mem.saving = true;
          memRender(); // 저장 버튼을 잠근 상태로 다시 그린다
          try {
            // 계정 모드: 이미 uid 가 있는 구성원은 uid 를 그대로 실어 보낸다(merge 라 키가 지워지지 않지만 규칙 uidOk 를 확실히 만족시킨다)
            const r = await HouseholdSync.upsertMember(hh.hid, { memberId: form.memberId || undefined, role: v.role, label: v.label, order: old ? old.order || 1 : HouseholdView.nextMemberOrder(all), ...(old && old.uid ? { uid: old.uid } : {}) });
            if (!r || !r.ok) throw new Error((r && r.reason) || "member-save-failed");
            // H2: 내 구성원의 이름·역할을 바꾸면 계정 문서도 같이 갱신한다(role 은 규칙 허용 4종으로 변환)
            if (acctEnabled() && form.memberId && form.memberId === usMeId() && acct.sync && acct.user) {
              const u = await acct.sync.updateProfile(acct.user.uid, { displayName: v.label, role: v.role });
              if (u && u.ok && acct.account) Object.assign(acct.account, { displayName: u.patch.displayName || acct.account.displayName, role: u.patch.role || acct.account.role });
            }
            mem.view = "list"; mem.form = null;
          } catch (e) {
            console.error("구성원 저장 실패", e);
            form.error = HouseholdView.MSG.failNetwork;
          } finally {
            mem.saving = false;
          }
        }
      } else if (action === "confirm-delete") {
        if (mem.saving) return; // 삭제 진행 중 연속 클릭 무시
        mem.saving = true;
        memRender();
        try {
          const r = await HouseholdSync.removeMember(hh.hid, id);
          if (!r || !r.ok) throw new Error((r && r.reason) || "member-delete-failed");
          let saved = "";
          try { saved = localStorage.getItem(ACTIVE_MEMBER_KEY) || ""; } catch (e) {}
          if (saved === id) memSetActive(""); // 지운 구성원이 이 기기 사용자였다면 지정을 푼다
        } catch (e) {
          console.error("구성원 삭제 실패", e);
        } finally {
          mem.saving = false;
        }
        mem.view = "list"; mem.deleteId = null;
      }
    } catch (e) {
      console.error("구성원 처리 실패", e);
    }
    memRender();
    usRefreshCalendar();
  }

  // ── 가족 캘린더 베타 켜기 스위치 ─────────────────────────────────────────────────────────
  // 이 기기의 localStorage "hannun_feature_household" 값만 바꾸고 새로고침한다(플래그는 페이지 로드 때 js/feature-flags.js 가 한 번 읽는다).
  // 가구 생성·서버 호출·쓰기는 하지 않는다 — 스위치는 화면을 보이게 할 뿐이다. 기본은 계속 꺼짐.
  const BETA_FLAG_KEY = "hannun_feature_household";
  let betaConfirming = false;
  const betaState = () => ({ enabled: hhEnabled(), confirming: betaConfirming });
  /** 슬롯을 그리고 클릭을 연결한다. 슬롯 요소는 새로 그려질 때마다 새 요소라 리스너가 쌓이지 않는다(랜딩 슬롯은 한 번만 연결). */
  function betaOpenSlot(slotId, renderName) {
    const slot = el(slotId);
    if (typeof acctEnabled === "function" && acctEnabled()) { if (slot) slot.innerHTML = ""; return; } // G18: 계정 모드(기본)에는 베타 스위치가 없다
    if (!slot || typeof HouseholdView === "undefined" || typeof HouseholdView[renderName] !== "function") return;
    slot.innerHTML = HouseholdView[renderName](betaState());
    if (!slot.dataset.betaBound) {
      slot.dataset.betaBound = "1";
      slot.addEventListener("click", betaOnClick);
    }
  }
  function betaRenderAll() {
    betaOpenSlot("beta-slot", "renderBetaSwitch");
    betaOpenSlot("beta-landing-slot", "renderBetaSwitchLanding");
  }
  function betaOnClick(ev) {
    const b = ev.target.closest("[data-beta-action]");
    if (!b) return;
    ev.stopPropagation();
    const action = b.getAttribute("data-beta-action");
    if (typeof acctEnabled === "function" && acctEnabled()) return; // G18: 계정 모드에서는 끄는 경로(confirm-off 등)를 열지 않는다
    if (action === "ask-on" || action === "ask-off") {
      betaConfirming = true;
      betaRenderAll();
    } else if (action === "cancel") {
      betaConfirming = false;
      betaRenderAll();
    } else if (action === "confirm-on" || action === "confirm-off") {
      try {
        // G1: 회원가입 기능(accounts)도 같은 베타 스위치로 함께 켜고 끈다(켜면 가족 캘린더가 기본 구조).
        if (action === "confirm-on") { localStorage.setItem(BETA_FLAG_KEY, "1"); localStorage.setItem("hannun_feature_accounts", "1"); }
        else { localStorage.removeItem(BETA_FLAG_KEY); localStorage.removeItem("hannun_feature_accounts"); }
      } catch (e) {
        console.warn("가족 캘린더 베타 설정을 저장하지 못했어요(저장소 사용 불가) — 상태를 그대로 둡니다.", e);
        return;
      }
      location.reload();
    }
  }

  /** 앱 시작: 이 기기에 가구가 있으면 미러·리스너·대기열 재시도를 시작한다. 실패해도 기존 가족코드 흐름은 막지 않는다. */
  // ── 온보딩 가족 단계: 첫 아이 저장 직후 '가족 캘린더를 만들어 볼까요?' → (생성) → 엄마·아빠 이름 → 코드 안내 ──────────────
  // 서버 쓰기는 기존 HouseholdSync.createHousehold / upsertMember 뿐이다. 안내는 한 번만 보여 준다(보여준 시점에 seen 저장).
  const ONB_SEEN_KEY = "hannun_onboard_family_seen";
  const onb = { step: "offer", mom: "엄마", dad: "아빠", me: "", error: null, saving: false, code: null };
  function onbMaybeOffer(hadChildren) {
    if (!hhEnabled()) return;
    hhLoadSaved();
    let seen = false;
    try {
      seen = !!localStorage.getItem(ONB_SEEN_KEY);
    } catch (e) {}
    if (!HouseholdView.shouldOfferOnboarding({ enabled: true, hasHousehold: !!(hh.hid && hh.code), hadChildren, seen })) return;
    try {
      localStorage.setItem(ONB_SEEN_KEY, "1");
    } catch (e) {}
    Object.assign(onb, { step: "offer", mom: "엄마", dad: "아빠", me: "", error: null, saving: false, code: null });
    onbShow();
  }
  function onbShow() {
    modalMode = "onboarding-family";
    el("modal-content").innerHTML = HouseholdView.renderOnboarding(onb);
    el("detail-modal").classList.remove("hidden");
    const sec = el("modal-content").querySelector("[data-onb]");
    if (sec) sec.addEventListener("click", onbOnClick);
  }
  function onbReadInputs() {
    const read = (r) => {
      const i = el("modal-content").querySelector(`[data-onb-input="${r}"]`);
      return i ? i.value : null;
    };
    const m = read("MOM"), d = read("DAD");
    if (m !== null) onb.mom = m;
    if (d !== null) onb.dad = d;
  }
  async function onbOnClick(ev) {
    if (modalMode !== "onboarding-family") return;
    const chip = ev.target.closest("[data-onb-me]");
    if (chip) {
      onbReadInputs();
      onb.me = chip.getAttribute("data-onb-me");
      return onbShow();
    }
    const b = ev.target.closest("[data-onb-action]");
    if (!b || onb.saving) return;
    const action = b.getAttribute("data-onb-action");
    if (action === "later" || action === "done") {
      closeDetail();
      hhAfterSync();
    } else if (action === "copy") {
      try {
        await navigator.clipboard.writeText(onb.code || hh.code);
      } catch (e) {}
    } else if (action === "create") {
      onb.saving = true;
      onb.error = null;
      onb.step = "creating";
      onbShow();
      try {
        const probe = await hhProbeRules();
        if (probe !== "ok") throw Object.assign(new Error("probe"), { code: probe === "denied" ? "permission-denied" : "network" });
        const r = await HouseholdSync.createHousehold({ firstChild: familyCode ? { familyCode, displayName: childDisplayName() } : undefined });
        if (!r.ok) throw new Error(r.reason || "create-failed");
        hhSetJoined(r.householdId, r.code);
        onb.code = r.code;
        onb.step = "names";
      } catch (e) {
        onb.step = "offer";
        onb.error = HouseholdView.failMessage(e);
      }
      onb.saving = false;
      onbShow();
    } else if (action === "save-names" || action === "skip-names") {
      onbReadInputs();
      const members = usMembers();
      const r = HouseholdView.onboardingNameUpdates(members, action === "skip-names" ? {} : { MOM: onb.mom, DAD: onb.dad });
      if (!r.ok) {
        onb.error = r.error;
        return onbShow();
      }
      onb.saving = true;
      onb.error = null;
      try {
        for (const u of r.updates) {
          const old = members.find((x) => x.memberId === u.memberId);
          const w = await HouseholdSync.upsertMember(hh.hid, { memberId: u.memberId, role: u.role, label: u.label, order: old ? old.order || 1 : 1 });
          if (!w.ok) throw new Error(w.reason || "member-failed");
        }
        const me = onb.me && usMembers().find((x) => x.role === onb.me && !x.deletedAt);
        memSetActive(me ? me.memberId : "");
        onb.step = "code";
      } catch (e) {
        onb.error = HouseholdView.failMessage(e);
      }
      onb.saving = false;
      onbShow();
    }
  }

  async function hhInit() {
    if (!hhEnabled()) return;
    const hint = el("hh-code-hint");
    if (hint) hint.innerHTML = HouseholdView.renderCodeEntryHint({ enabled: true });
    hhLoadSaved();
    if (!hh.hid || !hh.code) return;
    hhStart();
    try {
      await HouseholdSync.joinHousehold(hh.code);
      hhAfterSync();
    } catch (e) {
      if (e && e.code === "permission-denied") hh.rulesUnavailable = true;
    }
  }
  /** 새 아이를 만들었고 활성 가구가 있으면 그 가구에 링크를 만든다(아이 문서는 건드리지 않는다). */
  function hhLinkNewChild() {
    if (!hhEnabled() || !familyCode) return;
    if (!hh.hid) hhLoadSaved();
    if (!hh.hid) return;
    const m = HouseholdSync.getMirror(hh.hid);
    const order = Object.keys((m && m.children) || {}).length + 1;
    HouseholdSync.addChild(hh.hid, { familyCode, displayName: childDisplayName(), order }).catch((e) => console.error("아이 링크 생성 실패", e));
  }
  function hhSetEntryMessage(text) {
    const e = el("code-error");
    if (!e.dataset.hhDefault) e.dataset.hhDefault = e.textContent;
    e.textContent = text;
    e.classList.remove("hidden");
  }
  function hhResetEntryMessage() {
    const e = el("code-error");
    if (e.dataset.hhDefault) e.textContent = e.dataset.hhDefault;
  }
  /** code-entry 에 8자리 가족 코드를 넣었을 때: 가구로 참여한 뒤 첫 번째 아이를 기존 경로로 불러온다. */
  async function hhJoinFromEntry(code) {
    try {
      const r = await HouseholdSync.joinHousehold(code);
      if (!r.ok) return hhSetEntryMessage(HouseholdView.joinMessage(r));
      hhSetJoined(r.householdId, code);
      const kids = HouseholdView.mergeChildren([], r.mirror, null).filter((c) => !c.removed);
      if (!kids.length) return hhSetEntryMessage(HouseholdView.joinMessage(r));
      el("familyCodeInput").value = kids[0].code;
      await handleLoadCode();
    } catch (e) {
      console.error("가족 캘린더 참여 실패", e);
      hhSetEntryMessage(HouseholdView.failMessage(e));
    }
  }

  // ── 가족 캘린더의 "추가한 일정" ──────────────────────────────────────────────────────────────
  // 문구·마크업·폼 변환: js/user-schedule-view.js / 검증·패치: js/user-schedule.js / 월 집계: js/calendar-model.js / 저장·미러·대기열: js/household-sync.js.
  // 가구가 있고 플래그(FEATURES.household)가 켜졌을 때만 동작한다. 자동 일정(autoEvents·displayDate·visibleSchedule·completed·진행률)은 읽기만 하고 바꾸지 않는다.
  // 추가한 일정의 완료는 일정 문서의 status 에만 기록한다(completed 와 분리). 캘린더는 하나이며 scope 는 CHILD / FAMILY 두 가지뿐이다.
  // detailKey/detailOcc: 열려 있는 상세의 회차(반복 일정은 같은 문서에서 회차가 여럿이라 id 만으로는 부족), dayForm: "이 날만 수정", plan: 규칙 변경 확인 대기 중인 전체 수정 계획.
  // 칩 달력 개편: selection=복수 선택 배열(비어 있으면 전체), onlyUser=직접 등록한 일정만 보기(아이만 선택했을 때만 효력, 기본 꺼짐), catColor=카테고리별 색(기본 꺼짐, 이 기기에 보존)
  const CAL_CATCOLOR_KEY = "hannun_cal_catcolor";
  const us = { selection: [], selTouched: false, onlyUser: false, catColor: (() => { try { return localStorage.getItem(CAL_CATCOLOR_KEY) === "1"; } catch (e) { return false; } })(), form: null, messages: [], saving: false, detailId: null, detailKey: null, detailOcc: null, dayForm: null, plan: null, autoLabel: null, linkPrompt: null, chipDel: null };
  const usReady = () => typeof UserScheduleView !== "undefined" && typeof UserSchedule !== "undefined" && typeof CalendarModel !== "undefined";
  const usActive = () => hhEnabled() && usReady() && !!hh.hid && !!hh.code;
  const usMirror = () => (hh.hid ? HouseholdSync.getMirror(hh.hid) : null);
  const usLinks = () => Object.entries((usMirror() || {}).children || {}).map(([childKey, l]) => ({ childKey, ...l }));
  const usMembers = () => Object.entries((usMirror() || {}).members || {}).map(([memberId, m]) => ({ memberId, ...m }));
  const usDocs = () => (hh.hid ? HouseholdSync.getSchedules(hh.hid) : []);
  const usDocById = (id) => usDocs().find((d) => d.id === id) || null;
  /** 지금 보는 아이의 가구 내 childKey(링크돼 있지 않으면 null). */
  const usActiveChildKey = () => {
    const l = usLinks().find((x) => !x.removedAt && x.familyCode === familyCode);
    return l ? l.childKey : null;
  };
  /** 자동 일정 칩 색: 현재 아이의 색(링크 order 기반, 링크가 없으면 가족색). */
  const usAutoChipColor = () => {
    const k = usActiveChildKey();
    const c = k ? UserScheduleView.childColors(usLinks())[k] : null;
    return c || UserScheduleView.FAMILY_COLOR;
  };
  // 계정 모드(D3): 구성원 칩(MEMBER:<id>)과 '나' 기본 선택. 계정이 없거나 내 구성원을 모르면 기존(역할 칩·전체) 동작 그대로다.
  const usMeId = () => {
    if (!acctEnabled() || !acct.user || !acct.account || !acct.account.memberId) return null;
    return usMembers().some((m) => m.memberId === acct.account.memberId && !m.deletedAt) ? acct.account.memberId : null;
  };
  const usSelOpts = () => ({ memberMode: !!usMeId(), meId: usMeId() });
  /** 현재 선택: 기본은 '전체'(E 1-1 — 내 일정만 보려면 '나' 칩 한 번). 칩을 누른 뒤에는 그 선택. 저장하지 않는다. */
  const usSel = () => us.selection;
  const usSelectionMode = () => UserScheduleView.selectionMode(UserScheduleView.normalizeSelection(usSel(), usLinks(), usMembers(), usSelOpts()));
  /** 월/일 범위의 캘린더 모델(자동 일정은 읽기 전용 입력). */
  function usBuildModel(startIso, endIso, filterOverride, view) {
    return CalendarModel.buildCalendarModel({
      view: view === "week" ? "week" : "month",
      range: { start: startIso, end: endIso },
      filter: filterOverride || UserScheduleView.toModelFilter(usSel(), us.onlyUser, usLinks(), usMembers(), usSelOpts()),
      auto: { events: calendarDotSchedule(), displayDates: calDisplayDays, completed, childKey: usActiveChildKey(), autoIdAliases, hideLinked: autoLinkOn() },
      user: { schedules: usDocs(), childLinks: usLinks(), members: usMembers() },
    });
  }
  // ── C2-b1 AUTO 항목 연결(autoLink 서브 플래그 — 가구 플래그가 켜져 있고 가구가 있을 때만) ───────────────────
  const autoLinkOn = () => usActive() && !!window.FEATURES && window.FEATURES.autoLink === true;
  let autoLinkMemo = null;
  /** 이 아이의 연결 색인(Map: AUTO id → {scheduleId,date,status,count}). 꺼져 있으면 null. 한 번의 화면 갱신(같은 동기 구간) 안에서만 재사용한다. */
  function autoLinks() {
    if (!autoLinkOn()) return null;
    if (!autoLinkMemo) {
      autoLinkMemo = CalendarModel.linksByAutoId(usDocs(), usActiveChildKey(), autoIdAliases);
      Promise.resolve().then(() => (autoLinkMemo = null));
    }
    return autoLinkMemo;
  }
  /** 홈·체크리스트 보조 문구용 변경 표식(연결이 달라졌는지 비교). 꺼져 있으면 "". */
  function usAutoLinkSig() {
    const m = autoLinks();
    return (m ? JSON.stringify([...m.values()].map((l) => [l.autoId, l.scheduleId, l.date, l.status])) : "") + acctKidsSig();
  }
  /** G15: 계정 모드 홈의 아이 칩 목록이 달라졌는지 비교하는 표식(둘째 등록 직후 홈을 다시 그리게 한다). 계정 모드가 아니면 "". */
  function acctKidsSig() {
    return typeof acctEnabled === "function" && acctEnabled() && typeof acctHomeChildren === "function" ? "|kids:" + acctHomeChildren().map((c) => c.code).join(",") : "";
  }
  const usAutoTitleOfEvent = (e) => String(e.title || "").replace(/^⚠️ 확인 필요 · /, "").slice(0, 100);
  /** autoRef(별칭 해석 후)에 해당하는 현재 AUTO 항목의 제목. 찾지 못하면 ""(연결이 끊긴 일정은 일반 일정으로만 보인다). */
  function usAutoTitleOf(autoRef) {
    const id = Object.prototype.hasOwnProperty.call(autoIdAliases, autoRef) ? autoIdAliases[autoRef] : autoRef;
    const e = schedule.find((x) => x.id === id);
    return e ? usAutoTitleOfEvent(e) : "";
  }
  function autoLinkNoteHtml(e) {
    const m = autoLinks();
    const t = m ? UserScheduleView.autoLinkNote(m.get(e.id)) : "";
    return t ? `<p class="auto-link-note">${esc(t)}</p>` : "";
  }
  function autoLinkInlineHtml(e) {
    const m = autoLinks();
    const t = m ? UserScheduleView.autoLinkNote(m.get(e.id)) : "";
    return t ? `<span class="ri-reserved">${esc(t)}</span>` : "";
  }
  /** AUTO 상세 하단 버튼: 연결 가능한 항목이고 아직 완료 전이며 이 아이가 가구에 있을 때만. */
  function autoLinkButtonHtml(e, isDone) {
    const m = autoLinks();
    if (!m || isDone || usActiveChildKey() == null || !CalendarModel.isLinkableAuto(e)) return "";
    return UserScheduleView.renderAutoLinkButton(m.get(e.id));
  }
  /** AUTO 상세 → 예약 일정 만들기: 제목·분류(병원)·아이·autoRef 를 채워 일정 폼을 연다. 날짜·시각은 사용자가 입력한다(I9). */
  function usOpenFormFromAuto(e) {
    const ck = usActiveChildKey();
    if (!autoLinkOn() || ck == null || !CalendarModel.isLinkableAuto(e)) return;
    us.autoLabel = usAutoTitleOfEvent(e);
    us.form = UserScheduleView.newForm({ date: "", activeChildKey: ck, links: usLinks(), defaultAssigneeId: memActiveId(), autoRef: e.id, title: us.autoLabel });
    us.messages = [];
    us.saving = false;
    us.dayForm = null;
    us.plan = null;
    usShowForm();
  }
  // ── C2-b2 완료 제안(연결된 두 쪽의 완료는 서로 자동으로 쓰지 않는다 — 항상 사용자가 시트에서 답한다) ─────────────────
  const usResolveAutoId = (ref) => (Object.prototype.hasOwnProperty.call(autoIdAliases, ref) ? autoIdAliases[ref] : ref);
  /** 완료 제안 시트가 지금 열려 있는가(중복 시트 방지 — 모달이 닫혀 있거나 다른 내용이면 아니다). */
  const usLinkPromptOpen = () => !el("detail-modal").classList.contains("hidden") && !!el("modal-content").querySelector(".us-link-prompt");
  function usShowLinkPrompt(html, data) {
    us.linkPrompt = data;
    modalMode = "profile"; // 일반 시트 모드(usShowForm 과 같은 값): 완료 직후 "day-list" 모드의 재렌더가 방금 연 시트를 덮지 않게 한다
    el("modal-content").innerHTML = html;
    el("detail-modal").classList.remove("hidden");
  }
  /** USER → AUTO: 연결 일정을 완료로 표시한 직후, 그 AUTO 항목도 완료로 기록할지 묻는다(예/아니요). */
  function usSuggestAutoComplete(doc) {
    if (!autoLinkOn() || usLinkPromptOpen()) return;
    const autoId = UserScheduleView.autoCompleteTarget(doc, {
      activeChildKey: usActiveChildKey(),
      resolveId: usResolveAutoId,
      eventOf: (id) => schedule.find((x) => x.id === id) || null,
      isLinkable: CalendarModel.isLinkableAuto,
      isDone: (id) => !!completed[id],
      todayIso: toISODate(new Date()),
    });
    if (!autoId) return;
    const e = schedule.find((x) => x.id === autoId);
    usShowLinkPrompt(
      UserScheduleView.renderLinkRecordSheet({ word: UserScheduleView.linkKindWord(e.category), scheduleTitle: doc.title, date: doc.eventDate, item: usAutoTitleOfEvent(e) }),
      { kind: "toAuto", autoId, date: doc.eventDate }
    );
  }
  /** 연결 일정의 날짜로 AUTO 항목을 완료 기록한다. toggleComplete 의 완료 객체와 같은 모양이고(완료일만 일정 날짜 정오), 저장은 C1-a 필드 단위 경로다. 이미 완료됐거나 항목이 없으면 false. */
  function applyAutoCompleteFromLink(id, dateIso) {
    const e = schedule.find((x) => x.id === id);
    if (!e || completed[id] || !CalendarModel.isLinkableAuto(e)) return false;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateIso || ""));
    if (!m) return false;
    const before = { ...completed };
    delete completed[id + NA_SUFFIX];
    const sepIdx = id.indexOf("__");
    const todoId = sepIdx === -1 ? id : id.slice(0, sepIdx);
    const occurrenceKey = sepIdx === -1 ? "default" : id.slice(sepIdx + 2);
    completed[id] = { done: true, todo_id: todoId, occurrenceKey, recordType: "TODO_COMPLETED", recordedAt: new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0).toISOString() };
    saveCompleted();
    syncCompletedChanges(before);
    refreshSchedule();
    return true;
  }
  function usLinkRecordYes() {
    const p = us.linkPrompt;
    us.linkPrompt = null;
    if (p && p.kind === "toAuto") applyAutoCompleteFromLink(p.autoId, p.date);
    closeDetail();
  }
  /** AUTO → USER: AUTO 항목을 완료한 직후, 연결된 미완료 예약이 있으면 그대로 둘지 일정도 완료할지 묻는다. */
  function usAfterAutoComplete(id) {
    if (!autoLinkOn() || usLinkPromptOpen()) return;
    const m = autoLinks();
    const link = m && m.get(id);
    if (!link || !link.date || !link.scheduleId || link.status === "DONE") return;
    const e = schedule.find((x) => x.id === id);
    if (!e) return;
    usShowLinkPrompt(UserScheduleView.renderLinkKeepSheet({ item: usAutoTitleOfEvent(e), date: link.date }), { kind: "toUser", scheduleId: link.scheduleId });
  }
  function usLinkCompleteSchedule() {
    const p = us.linkPrompt;
    us.linkPrompt = null;
    if (!p || p.kind !== "toUser") return closeDetail();
    return usPatchAction(p.scheduleId, (before, now) => UserSchedule.markDone(before, now));
  }
  /** E(1-4): 담당이 필요한 빠른 추가 칩을 눌렀는데 담당이 비어 있으면 담당 영역을 강조하고 안내 한 줄을 보인다(폼은 다시 그리지 않는다). */
  function usRefreshAssigneeEmph(root) {
    const field = root && root.querySelector ? root.querySelector("[data-us-assignee-field]") : null;
    if (!field) return;
    const on = UserScheduleView.assigneeEmphasis(us.form);
    field.classList.toggle("us-emph", on);
    const note = field.querySelector("[data-us-assignee-note]");
    if (note) note.hidden = !on;
  }
  /** 홈 '다가오는 가족 일정' 카드(F1). 플래그 OFF·가구 없음이면 "" — 홈은 기존 그대로. AUTO 일정은 섞지 않는다(showAuto:false). */
  function usHomeCardHtml(opts) {
    if (!hhEnabled() || !usActive()) return "";
    try {
      const todayIso = toISODate(new Date());
      const model = usBuildModel(todayIso, UserSchedule.addDays(todayIso, 6), { scope: "ALL", showAuto: false });
      return UserScheduleView.renderUpcomingCard(UserScheduleView.upcomingItems(model, { todayIso, links: usLinks() }), opts);
    } catch (e) {
      console.error("홈 가족 일정 카드 실패", e);
      return "";
    }
  }
  /** 가구 데이터·일정이 바뀐 뒤 홈 카드가 달라졌을 때만 홈을 다시 그린다(같으면 건너뜀 — 중복 호출 가드). */
  function usRefreshHome() {
    if (!profile || !hhEnabled()) return;
    const ord = usActive() && typeof HomeOrder !== "undefined" ? HomeOrder.homeSectionOrder({ children: homeKids(), pregnant: isPregnant(), asOf: new Date() }) : null;
    if (usHomeCardHtml(ord ? { family: ord[0] === "family" } : undefined) + usAutoLinkSig() !== (us.homeSig || "")) {
      renderHome();
      if (autoLinkOn() && typeof renderChecklistTab === "function") renderChecklistTab(); // 체크리스트 카드의 '예약됨' 보조 문구도 함께 갱신
    }
  }
  function usRefreshCalendar() {
    usRefreshHome();
    if (!profile || !hhEnabled() || el("view-calendar").classList.contains("hidden")) return;
    renderCalendar();
    renderSelectedDayPanel();
    attachListHandlers();
  }
  // ── F2 주 보기 시작 ─────────────────────────────────────────────────────────────
  // 월 보기(renderCalendar)는 그대로 두고, 가구가 있고 플래그가 켜졌을 때만 "월 | 주" 전환이 생긴다. 선택 날짜(selectedCalendarDate)가 주·월 공용 상태다.
  // 주 = 선택 날짜가 속한 일요일~토요일. 주 이동은 같은 요일을 유지(선택일 ±7일). 날짜 클릭·주 이동·보기 전환은 모두 usCalRefreshAll() 한 곳으로 다시 그린다.
  const calWeekAvailable = () => typeof CalendarWeek !== "undefined" && usActive();
  const calWeekOn = () => calView === "week" && calWeekAvailable();
  /** 캘린더 · 선택일 패널 · 항목 클릭 연결 — 셋은 항상 함께(하나라도 빠지면 새로 그린 카드가 반응하지 않는다). */
  function usCalRefreshAll() {
    renderCalendar();
    renderSelectedDayPanel();
    attachListHandlers();
  }
  /** 이전/다음 버튼의 접근성 이름을 현재 보기(주/달)에 맞춘다. */
  function usSyncNavLabels() {
    if (typeof CalendarWeek === "undefined") return;
    const w = calWeekOn();
    el("btn-prev-month").setAttribute("aria-label", w ? CalendarWeek.MSG.prevWeek : CalendarWeek.MSG.prevMonth);
    el("btn-next-month").setAttribute("aria-label", w ? CalendarWeek.MSG.nextWeek : CalendarWeek.MSG.nextMonth);
  }
  /** "월 | 주" 칩, 주 보기용 그리드 클래스, 이전/다음 이름을 맞춘다. 주 보기를 쓸 수 없는 상태(플래그 OFF·가구 없음)면 모두 비운다. */
  function usRenderViewToggle() {
    const slot = el("cal-view-slot");
    if (!slot) return;
    const on = calWeekOn();
    el("calendar-grid").classList.toggle("calendar-week", on);
    if (!calWeekAvailable()) {
      slot.innerHTML = "";
      usSyncNavLabels();
      return;
    }
    slot.innerHTML = CalendarWeek.renderViewToggle(on ? "week" : "month");
    usSyncNavLabels();
  }
  function usSetCalView(view) {
    if (!calWeekAvailable() || (view !== "week" && view !== "month") || view === calView) return;
    calView = view;
    if (view === "month") viewMonth = new Date(selectedCalendarDate.getFullYear(), selectedCalendarDate.getMonth(), 1); // 주→월: 선택일의 달
    usCalRefreshAll();
  }
  /** 주 이동: 같은 요일을 유지한 채 n 주(선택일 ±7n일). */
  function usWeekShift(n) {
    selectedCalendarDate = CalendarWeek.toLocalDate(CalendarWeek.shiftWeek(toISODate(selectedCalendarDate), n));
    usCalRefreshAll();
  }
  /** 주 보기: 선택 날짜가 속한 한 주(일~토)를 7열로 그린다. 추가한 일정은 제목, 자동 일정은 개수만. 하단 기간 일정·진행률은 월 기준 그대로(선택일의 달). */
  function renderWeek() {
    const selIso = toISODate(selectedCalendarDate);
    viewMonth = new Date(selectedCalendarDate.getFullYear(), selectedCalendarDate.getMonth(), 1);
    el("calendar-title").textContent = CalendarWeek.weekTitle(selIso);
    computeCalendarDays();
    renderCalLegend();
    renderCalendarProgress();
    const range = CalendarWeek.weekRange(selIso);
    const wm = usBuildModel(range.start, range.end, undefined, "week");
    const todayIso = toISODate(new Date());
    const links = usLinks();
    const days = CalendarWeek.weekDays(selIso).map((date) => {
      const dm = wm.days.get(date);
      return {
        date,
        today: date === todayIso,
        selected: date === selIso,
        user: dm.user.map((o) => ({ title: o.title, color: UserScheduleView.occurrenceColor(o, links), done: o.status === "DONE" })),
        autoCount: dm.benefit.length + dm.planned.length,
      };
    });
    const grid = el("calendar-grid");
    grid.innerHTML = CalendarWeek.renderWeekCols(days);
    grid.querySelectorAll("[data-wk-date]").forEach((b) =>
      b.addEventListener("click", () => {
        selectedCalendarDate = CalendarWeek.toLocalDate(b.getAttribute("data-wk-date"));
        usCalRefreshAll();
      })
    );
    const y = viewMonth.getFullYear();
    const m = viewMonth.getMonth();
    usRenderCalendarSlots(usBuildModel(toISODate(new Date(y, m, 1)), toISODate(new Date(y, m + 1, 0))));
    renderAutoPeriodSlot();
  }
  // ── F2 주 보기 끝 ───────────────────────────────────────────────────────────────
  /** 캘린더 위(개수 줄·필터·범례)와 그리드 아래(이번 달 기간 일정) 영역. 가구가 없으면 비워 둔다. */
  function usRenderCalendarSlots(model) {
    if (!hhEnabled()) return;
    usRenderViewToggle();
    const top = el("us-filter-slot");
    const bottom = el("us-period-slot");
    if (!top || !bottom) return;
    if (!model) {
      top.innerHTML = "";
      bottom.innerHTML = "";
      return;
    }
    const links = usLinks();
    // 개수 줄은 날짜 미정(기간) 일정까지 포함해 센다(모델의 userItems 는 칸에 찍히는 일정만 센다).
    const periodDone = model.periodList.filter((o) => o.status === "DONE").length;
    const counts = { userItems: model.counts.userItems + model.counts.periodItems, userDone: model.counts.userDone + periodDone };
    top.innerHTML =
      `<div class="card us-top"><p class="us-summary">${esc(UserScheduleView.monthSummary(counts))}</p>` +
      UserScheduleView.renderFilterChips(UserScheduleView.filterChips(links, usSel(), usMembers(), usSelOpts()), { mode: usSelectionMode(), onlyUser: us.onlyUser, catColor: us.catColor }) +
      `<p class="us-note">${esc(UserScheduleView.MSG.legend)}</p></div>`;
    const skipped = UserScheduleView.skippedNote(model.skipped);
    const period = UserScheduleView.renderPeriodSection(UserScheduleView.periodSection(model.periodList, links));
    bottom.innerHTML = period || skipped ? `<div class="card us-period-card">${period}${skipped ? `<p class="us-note">${esc(skipped)}</p>` : ""}</div>` : "";
  }
  /** 선택일 패널: 추가한 일정 / 혜택 신청 시작 / 추천 항목 3구역(가구가 있을 때), 가구가 없으면 추가 영역에 안내만. */
  function usRenderDayPanel(date, byUrgency) {
    if (!hhEnabled()) return;
    const addSlot = el("us-add-slot");
    if (!addSlot) return;
    if (!usActive()) {
      addSlot.innerHTML = UserScheduleView.renderAddButton({ enabled: true, hasHousehold: false });
      return;
    }
    const iso = toISODate(date);
    const day = usBuildModel(iso, iso).days.get(iso);
    const panel = UserScheduleView.dayPanel(day, usLinks(), { docById: usDocById, ...(autoLinkOn() ? { autoTitleOf: usAutoTitleOf } : {}) });
    const group = (title) => `<h4 class="us-group">${esc(title)}</h4>`;
    el("selected-day-list").innerHTML =
      group(panel.added.title) +
      (panel.added.cards.length ? panel.added.cards.map((c) => UserScheduleView.sourceLabeled(UserScheduleView.renderCard(c), "user")).join("") : `<p class="us-note">${esc(panel.emptyText)}</p>`) +
      (day.benefit.length ? group(panel.benefit.title) + day.benefit.slice().sort(byUrgency).map((e) => UserScheduleView.sourceLabeled(eventItemHtml(e), "auto")).join("") : "") +
      (day.planned.length ? group(panel.planned.title) + day.planned.slice().sort(byUrgency).map((e) => UserScheduleView.sourceLabeled(eventItemHtml(e), "auto")).join("") : "");
    el("selected-day-empty").classList.add("hidden");
    addSlot.innerHTML = UserScheduleView.renderAddButton({ enabled: true, hasHousehold: true });
  }

  // 시트(모달) 조작
  const usModalNote = (text) => {
    const m = el("modal-content");
    const old = m.querySelector(".us-error-note");
    if (old) old.remove();
    m.insertAdjacentHTML("beforeend", `<p class="us-error us-error-note">${esc(text)}</p>`);
  };
  function usOccurrenceOf(doc) {
    const startIso = doc.dateKind === "PERIOD" ? doc.periodStart : doc.eventDate;
    const m = usBuildModel(startIso, startIso, { scope: "ALL", showAuto: false });
    return doc.dateKind === "PERIOD" ? m.periodList.find((o) => o.scheduleId === doc.id) : (m.days.get(startIso) || { user: [] }).user.find((o) => o.scheduleId === doc.id);
  }
  /** 반복 일정: 선택한 날짜 패널에서 눌린 회차(key = u:<id>@<원래 날짜>)를 찾는다. 취소된 회차도 포함. */
  function usFindRecurringOccurrence(doc, key) {
    const iso = toISODate(selectedCalendarDate);
    const d = usBuildModel(iso, iso, { scope: "ALL", showAuto: false }).days.get(iso);
    return d ? d.user.concat(d.cancelled).find((o) => o.scheduleId === doc.id && o.key === key) || null : null;
  }
  function usOpenDetail(id, key) {
    const doc = usDocById(id);
    const occ = doc && (UserSchedule.isRecurring(doc) ? usFindRecurringOccurrence(doc, key) : usOccurrenceOf(doc));
    if (!occ) return;
    us.detailId = id;
    us.detailKey = occ.key;
    us.detailOcc = occ;
    us.form = null;
    us.dayForm = null;
    us.plan = null;
    modalMode = "profile";
    const extra = occ.recurring ? { recurrence: doc.recurrence, exceptionCount: UserSchedule.exceptionCount(doc) } : undefined;
    el("modal-content").innerHTML = UserScheduleView.renderDetail(UserScheduleView.cardData(occ, usLinks(), extra), acctEnabled() ? { dots: UserScheduleView.detailDots(occ, usLinks()) } : undefined);
    el("detail-modal").classList.remove("hidden");
  }
  function usOpenForm(id, dateIso, opts) {
    const doc = id ? usDocById(id) : null;
    us.autoLabel = null;
    us.form = doc ? UserScheduleView.formFromSchedule(doc) : UserScheduleView.newForm({ date: dateIso || toISODate(selectedCalendarDate), activeChildKey: usActiveChildKey(), links: usLinks(), defaultAssigneeId: memActiveId(), ...(opts && opts.scope ? { defaultScope: opts.scope } : {}) });
    us.messages = [];
    us.saving = false;
    us.dayForm = null;
    us.plan = null;
    usShowForm();
  }
  function usShowForm() {
    modalMode = "profile";
    el("modal-content").innerHTML = UserScheduleView.renderForm(us.form, usLinks(), { messages: us.messages, saving: us.saving, members: HouseholdView.visibleMembers(usMembers()), autoLabel: us.autoLabel });
    el("detail-modal").classList.remove("hidden");
    usBindPickers();
  }
  // G13: 계정 모드의 일정 추가·수정 시트(누구 일정 → 나이별 카테고리 → 제목 자동). 위 두 함수(usOpenForm·usShowForm)의 본문은 그대로 두고,
  // 폼을 보여 주는 순간에만 계정 모드 시트로 바꿔 그린다. 플래그 OFF·가구만 켠 기기·AUTO 연결 예약은 이 분기를 타지 않는다.
  const usG13 = () => acctEnabled() && typeof ScheduleKinds !== "undefined";
  /** 아이 한 명의 나이 출처: ① 지금 보는 아이 프로필 ② 이 기기에 저장된 아이 목록(출산 예정 표시)·기억해 둔 아이별 생일(CHILD_BIRTHS_KEY) — 둘 다 모르면 null(공통 아이 목록). 새로 서버를 읽지 않는다. */
  function usChildAge(childKey) {
    const l = usLinks().find((x) => x.childKey === childKey);
    const code = l && l.familyCode;
    const today = toISODate(new Date());
    if (code && code === familyCode && profile) return profile.stage === "pregnant" ? "PREGNANT" : ScheduleKinds.ageMonths(toISODate(profile.birthDate), today);
    const saved = code ? loadChildren().find((c) => c.code === code) : null;
    if (!saved) return null;
    if (saved.stage === "pregnant") return "PREGNANT";
    let births = {};
    try { births = JSON.parse(localStorage.getItem(CHILD_BIRTHS_KEY) || "{}") || {}; } catch (e) {} // 이미 이 기기에 기억해 둔 아이별 생일(홈 순서용)
    return births[code] ? ScheduleKinds.ageMonths(births[code], today) : null;
  }
  const usG13Ctx = () => ({ links: usLinks(), meId: usMeId() || memActiveId() || "", ageOf: usChildAge });
  const usShowFormBase = usShowForm;
  usShowForm = function usShowForm() {
    if (us.form && !us.form.g13 && !us.form.autoRef && (us.form.mode === "create" || us.form.mode === "edit") && usG13()) UserScheduleView.upgradeFormG13(us.form, usG13Ctx());
    if (!(us.form && us.form.g13)) return usShowFormBase();
    modalMode = "profile";
    el("modal-content").innerHTML = UserScheduleView.renderFormG13(us.form, usLinks(), { messages: us.messages, saving: us.saving, members: HouseholdView.visibleMembers(usMembers()), ctx: usG13Ctx() });
    el("detail-modal").classList.remove("hidden");
    usBindPickers();
  };
  /** 폼에 들어 있는 날짜 칸에 공통 달력(HNDatePicker, 일정용 범위)을 연결한다. "이 날만 수정" 중이면 그 폼의 날짜 칸. */
  function usBindPickers() {
    const P = UserScheduleView.PICKER_PREFIXES;
    const form = us.dayForm || us.form;
    const parse = (iso) => (iso ? new Date(`${iso}T00:00:00`) : null);
    const bind = (prefix, field, minField) => {
      if (!el(`${prefix}-dp-btn`)) return;
      const picker = HNDatePicker.bindById(prefix, {
        getStage: () => "schedule",
        format: formatDateKR,
        placeholder: "날짜를 선택해주세요",
        getMinDate: minField ? () => parse(form[minField]) : undefined,
        onChange: (d) => {
          form[field] = toISODate(d);
        },
      });
      const v = parse(form[field]);
      if (v) picker.set(v);
    };
    bind(P.date, "eventDate");
    bind(P.end, "endDate", "eventDate");
    bind(P.periodStart, "periodStart");
    bind(P.periodEnd, "periodEnd", "periodStart");
    bind(P.until, "until", "eventDate");
    bind(P.day, "date");
  }
  function usReadTime(group) {
    const h = el(`${group}-h`).value;
    let m = el(`${group}-m`).value;
    if (!h) return "";
    if (!m) m = "00"; // 시만 고르면 정각으로
    return `${h}:${m}`;
  }
  async function usSave() {
    if (us.saving || !us.form) return;
    const now = Date.now();
    const prep = UserScheduleView.prepareSave(us.form, now);
    if (!prep.ok) {
      us.messages = prep.messages;
      usShowForm();
      return;
    }
    us.saving = true;
    us.messages = [];
    usShowForm();
    try {
      if (us.form.mode === "edit" && (us.form.wasRecurring || UserScheduleView.isRepeating(us.form))) {
        // 반복 일정의 "전체 수정"(또는 단일 ↔ 반복 전환): 계획을 만들고, 반복 규칙이 바뀌면 확인창(R30)을 거친다.
        const before = UserScheduleView.stripId(usDocById(us.form.scheduleId));
        const plan = UserScheduleView.planFullEdit(us.form, before, now);
        if (!plan.ok) {
          us.saving = false;
          us.messages = plan.messages;
          return usShowForm();
        }
        if (plan.confirm) {
          us.saving = false;
          us.plan = plan;
          el("modal-content").innerHTML = UserScheduleView.renderRuleChangeConfirm(plan.prunedEffective);
          return;
        }
        if (Object.keys(plan.changes).length) {
          const res = await HouseholdSync.patchSchedule(hh.hid, us.form.scheduleId, plan.patch);
          if (!res.ok) throw new Error(res.reason || "patch-failed");
        }
      } else if (us.form.mode === "edit") {
        const before = UserScheduleView.stripId(usDocById(us.form.scheduleId));
        const changes = UserScheduleView.changesFromForm(us.form, before);
        if (Object.keys(changes).length) {
          const r = UserSchedule.buildPatch(before, changes, now);
          if (!r.ok) {
            us.saving = false;
            us.messages = UserScheduleView.messagesFromErrors(r.errors);
            return usShowForm();
          }
          const res = await HouseholdSync.patchSchedule(hh.hid, us.form.scheduleId, r.patch);
          if (!res.ok) throw new Error(res.reason || "patch-failed");
        }
      } else {
        const r = UserSchedule.buildCreateDoc(prep.input, now);
        if (!r.ok) {
          us.saving = false;
          us.messages = UserScheduleView.messagesFromErrors(r.errors);
          return usShowForm();
        }
        const res = await HouseholdSync.createSchedule(hh.hid, r.doc);
        if (!res.ok) throw new Error(res.reason || "create-failed");
      }
      us.saving = false;
      us.form = null;
      closeDetail();
      usRefreshCalendar();
    } catch (e) {
      console.error("일정 저장 실패", e);
      us.saving = false;
      us.messages = [UserScheduleView.MSG.saveFail];
      usShowForm();
    }
  }
  /** 규칙 변경 확인창(R30)에서 "바꾸기"를 눌렀을 때: 확인 전에 만들어 둔 계획의 패치를 저장한다. */
  async function usCommitPlan() {
    const plan = us.plan;
    if (!plan || !us.form) return;
    try {
      const res = await HouseholdSync.patchSchedule(hh.hid, us.form.scheduleId, plan.patch);
      if (!res.ok) throw new Error(res.reason || "patch-failed");
      us.plan = null;
      us.form = null;
      closeDetail();
      usRefreshCalendar();
    } catch (e) {
      console.error("반복 일정 저장 실패", e);
      usModalNote(UserScheduleView.MSG.saveFail);
    }
  }
  /** "이 날만 수정": 폼을 열고 / 저장하면 그 회차의 예외(moveOccurrence)만 쓴다. */
  function usShowDayForm() {
    modalMode = "profile";
    el("modal-content").innerHTML = UserScheduleView.renderDayForm(us.dayForm, { messages: us.messages, saving: us.saving });
    el("detail-modal").classList.remove("hidden");
    usBindPickers();
  }
  function usOpenDayForm() {
    const doc = usDocById(us.detailId);
    if (!doc || !us.detailOcc) return;
    us.form = null;
    us.plan = null;
    us.dayForm = UserScheduleView.dayFormFromOccurrence(us.detailOcc, doc);
    us.messages = [];
    us.saving = false;
    usShowDayForm();
  }
  async function usSaveDay() {
    const f = us.dayForm;
    if (!f || us.saving) return;
    const v = UserScheduleView.validateDayForm(f);
    if (!v.ok) {
      us.messages = v.errors.map((e) => e.message);
      return usShowDayForm();
    }
    const before = UserScheduleView.stripId(usDocById(us.detailId));
    const r = UserSchedule.moveOccurrence(before, f.originalDate, UserScheduleView.dayFormToMove(f, before), Date.now());
    if (!r.ok) {
      us.messages = UserScheduleView.messagesFromErrors(r.errors);
      return usShowDayForm();
    }
    us.saving = true;
    us.messages = [];
    usShowDayForm();
    try {
      const res = await HouseholdSync.patchSchedule(hh.hid, us.detailId, r.patch);
      if (!res.ok) throw new Error(res.reason || "patch-failed");
      us.saving = false;
      us.dayForm = null;
      closeDetail();
      usRefreshCalendar();
    } catch (e) {
      console.error("이 날만 수정 실패", e);
      us.saving = false;
      us.messages = [UserScheduleView.MSG.saveFail];
      usShowDayForm();
    }
  }
  /** 완료/완료 취소 · 삭제(소프트). 추가한 일정의 완료는 일정 문서의 status 에만 기록한다. */
  async function usPatchAction(id, build, opts) {
    const doc = usDocById(id);
    if (!doc) return;
    try {
      const r = build(UserScheduleView.stripId(doc), Date.now());
      if (!r.ok) {
        const full = UserScheduleView.MSG.exceptionsFull; // 날짜별 변경 200개 상한(R17)만 따로 알리고, 나머지는 기존 #57
        const err = new Error("invalid-patch");
        err.note = (UserScheduleView.messagesFromErrors(r.errors || []).includes(full) && full) || null;
        throw err;
      }
      const res = await HouseholdSync.patchSchedule(hh.hid, id, r.patch);
      if (!res.ok) throw new Error(res.reason || "patch-failed");
      closeDetail();
      usRefreshCalendar();
      if (opts && opts.suggestOnDone && r.after && r.after.status === "DONE") usSuggestAutoComplete({ ...r.after, id }); // C2-b2: 연결 일정 완료 → AUTO 완료 제안(autoLink 꺼짐·연결 없음이면 아무것도 안 함)
    } catch (e) {
      console.error("일정 처리 실패", e);
      usModalNote((e && e.note) || UserScheduleView.MSG.actionFail);
    }
  }
  // ── G6 칩 지우기: 편집 모드에서 지울 수 있는 칩(구성원: 나 제외, 아이)에 ✕ → 확인 시트 → 기존 소프트 삭제 경로(removeMember deletedAt / removeChild removedAt, 서버 규칙 변경 없음) ──
  function usChipDelShow() {
    const d = us.chipDel;
    modalMode = "profile";
    el("modal-content").innerHTML = UserScheduleView.renderChipDeleteConfirm(d);
    el("detail-modal").classList.remove("hidden");
    const root = el("modal-content").querySelector("[data-us-chipdel]");
    if (root) root.addEventListener("click", usChipDelClick);
  }
  function usChipDelAsk(id) {
    const [kind, key] = String(id || "").split(":");
    if (kind === "MEMBER") {
      const m = usMembers().find((x) => x.memberId === key && !x.deletedAt);
      if (!m) return;
      us.chipDel = { kind: "MEMBER", id: key, name: m.label || "", uidWarn: !!m.uid && !(acct.user && acct.user.uid === m.uid) };
    } else if (kind === "CHILD") {
      const l = usLinks().find((x) => x.childKey === key && !x.removedAt);
      if (!l) return;
      us.chipDel = { kind: "CHILD", id: key, name: l.displayName || "", blocked: usActiveChildKey() === key };
    } else return;
    usChipDelShow();
  }
  async function usChipDelClick(ev) {
    const b = ev.target.closest("[data-us-chipdel-act]");
    const d = us.chipDel;
    if (!b || !d) return;
    if (b.getAttribute("data-us-chipdel-act") === "cancel") { us.chipDel = null; return closeDetail(); }
    if (d.busy || d.blocked) return;
    d.busy = true; d.error = "";
    usChipDelShow();
    try {
      const r = d.kind === "MEMBER" ? await HouseholdSync.removeMember(hh.hid, d.id) : await HouseholdSync.removeChild(hh.hid, d.id);
      if (!r || !r.ok) throw new Error((r && r.reason) || "chip-delete-failed");
      const cid = `${d.kind}:${d.id}`;
      us.selection = us.selection.filter((x) => x !== cid); // 지운 칩이 선택돼 있었다면 선택에서도 뺀다
      if (d.kind === "MEMBER") {
        let saved = "";
        try { saved = localStorage.getItem(ACTIVE_MEMBER_KEY) || ""; } catch (e) {}
        if (saved === d.id) memSetActive("");
      }
      us.chipDel = null;
      closeDetail();
      hhRender();
      usRefreshCalendar();
    } catch (e) {
      console.error("칩 지우기 실패", e);
      d.busy = false;
      d.error = UserScheduleView.MSG.actionFail;
      usChipDelShow();
    }
  }
  function usOnCalendarClick(ev) {
    if (!usActive()) return;
    const f = ev.target.closest("[data-us-filter]");
    if (f) {
      us.selection = UserScheduleView.toggleSelection(usSel(), f.getAttribute("data-us-filter"), usLinks(), usMembers(), usSelOpts());
      us.selTouched = true;
      return usRefreshCalendar();
    }
    const a = ev.target.closest("[data-us-action]");
    if (a) {
      const act = a.getAttribute("data-us-action");
      if (act === "toggle-only-user") {
        us.onlyUser = !us.onlyUser;
        return usRefreshCalendar();
      }
      if (act === "toggle-cat-color") {
        us.catColor = !us.catColor;
        try {
          localStorage.setItem(CAL_CATCOLOR_KEY, us.catColor ? "1" : "0");
        } catch (e) {}
        return usRefreshCalendar();
      }
      if (act === "add") return usOpenForm(null);
    }
    const c = ev.target.closest(".us-card");
    if (c) usOpenDetail(c.getAttribute("data-us-id"), c.getAttribute("data-us-key"));
  }
  function usOnModalClick(ev) {
    if (!usActive()) return;
    const root = ev.target.closest(".us-form, .us-detail, .us-confirm, .us-scope-sheet");
    if (!root) return;
    const a = ev.target.closest("[data-us-action]");
    if (a) {
      const act = a.getAttribute("data-us-action");
      const id = us.detailId;
      const occ = us.detailOcc;
      const rec = !!(occ && occ.recurring); // 반복 일정의 한 회차를 열어 둔 경우
      if (act === "save") return usSave();
      if (act === "save-day") return usSaveDay();
      if (act === "cancel") {
        us.form = null;
        us.dayForm = null;
        us.plan = null;
        return closeDetail();
      }
      if (act === "close") return closeDetail();
      if (act === "link-record") return usLinkRecordYes();
      if (act === "link-skip" || act === "link-keep") return closeDetail();
      if (act === "link-complete") return usLinkCompleteSchedule();
      if (act === "toggle-done") {
        if (rec) return usPatchAction(id, (before, now) => (occ.status === "DONE" ? UserSchedule.restoreOccurrence(before, occ.originalDate, now) : UserSchedule.markDone(before, now, { date: occ.originalDate })));
        return usPatchAction(id, (before, now) => (before.status === "DONE" ? UserSchedule.setStatus(before, "TODO", now) : UserSchedule.markDone(before, now)), { suggestOnDone: true });
      }
      if (act === "restore") return usPatchAction(id, (before, now) => UserSchedule.restoreOccurrence(before, occ.originalDate, now));
      if (act === "edit") {
        if (rec) el("modal-content").innerHTML = UserScheduleView.renderEditScopeSheet(occ.originalDate);
        else usOpenForm(id);
        return;
      }
      if (act === "delete") {
        el("modal-content").innerHTML = rec ? UserScheduleView.renderDeleteScopeSheet(occ.originalDate) : UserScheduleView.renderDeleteConfirm();
        return;
      }
      if (act === "cancel-delete") return usOpenDetail(id, us.detailKey);
      if (act === "confirm-delete") return usPatchAction(id, (before, now) => UserSchedule.softDelete(before, now));
      // 반복 일정: 범위 선택 시트(R20·R24)와 확인창(R28·R29·R30). 범위는 "이 날만" / "전체" 두 가지뿐.
      if (act === "scope-back") {
        if (us.plan) {
          us.plan = null;
          return usShowForm();
        }
        return usOpenDetail(id, us.detailKey);
      }
      if (act === "edit-day") return usOpenDayForm();
      if (act === "edit-all") return usOpenForm(id);
      if (act === "cancel-day") {
        el("modal-content").innerHTML = UserScheduleView.renderCancelDayConfirm(occ.originalDate);
        return;
      }
      if (act === "confirm-cancel-day") return usPatchAction(id, (before, now) => UserSchedule.cancelOccurrence(before, occ.originalDate, now));
      if (act === "delete-all") {
        el("modal-content").innerHTML = UserScheduleView.renderDeleteAllConfirm();
        return;
      }
      if (act === "confirm-delete-all") return usPatchAction(id, (before, now) => UserSchedule.softDelete(before, now));
      if (act === "confirm-rule-change") return usCommitPlan();
      return;
    }
    if (!us.form) return;
    const who = ev.target.closest("[data-us-who]");
    if (who && us.form.g13) {
      UserScheduleView.g13ApplyWho(us.form, who.getAttribute("data-us-who"), usG13Ctx());
      usShowForm();
      return;
    }
    const sk = ev.target.closest("[data-us-sk]");
    if (sk && us.form.g13) {
      UserScheduleView.g13PickKind(us.form, sk.getAttribute("data-us-sk"), usG13Ctx());
      usShowForm();
      return;
    }
    const quick = ev.target.closest("[data-us-quick]");
    if (quick) {
      // 빠른 추가 칩: 폼을 다시 그리지 않고 제목 칸·분류 칩만 갱신한다(입력 중인 시간·장소·메모 보존). 제목은 비어 있을 때만 채운다.
      const next = UserScheduleView.applyTemplate(us.form, quick.getAttribute("data-us-quick"));
      if (!next) return;
      us.form.title = next.title;
      us.form.category = next.category;
      us.form.quickKey = quick.getAttribute("data-us-quick");
      usRefreshAssigneeEmph(root);
      const titleInput = root.querySelector("#us-title");
      if (titleInput) titleInput.value = next.title;
      root.querySelectorAll("[data-us-cat]").forEach((x) => x.classList.toggle("active", x.getAttribute("data-us-cat") === next.category));
      return;
    }
    const cat = ev.target.closest("[data-us-cat]");
    if (cat) {
      us.form.category = cat.getAttribute("data-us-cat");
      root.querySelectorAll("[data-us-cat]").forEach((x) => x.classList.toggle("active", x === cat));
      return;
    }
    const tgt = ev.target.closest("[data-us-target]");
    if (tgt) {
      const v = tgt.getAttribute("data-us-target");
      if (v === "FAMILY") {
        us.form.scope = "FAMILY";
        us.form.childKeys = [];
      } else {
        us.form.scope = "CHILD";
        const ks = new Set(us.form.childKeys);
        if (ks.has(v)) ks.delete(v);
        else ks.add(v);
        us.form.childKeys = [...ks];
      }
      root.querySelectorAll("[data-us-target]").forEach((x) => {
        const k = x.getAttribute("data-us-target");
        x.classList.toggle("active", k === "FAMILY" ? us.form.scope === "FAMILY" : us.form.scope === "CHILD" && us.form.childKeys.includes(k));
      });
      return;
    }
    const asg = ev.target.closest("[data-us-assignee]");
    if (asg) {
      const v = asg.getAttribute("data-us-assignee") || "";
      us.form.assigneeMemberId = us.form.assigneeMemberId === v ? "" : v; // 같은 칩을 다시 누르면 해제(정하지 않음)
      root.querySelectorAll("[data-us-assignee]").forEach((x) => x.classList.toggle("active", (x.getAttribute("data-us-assignee") || "") === (us.form.assigneeMemberId || "")));
      usRefreshAssigneeEmph(root);
      return;
    }
    const rep = ev.target.closest("[data-us-repeat]");
    if (rep) {
      us.form.repeat = rep.getAttribute("data-us-repeat");
      if (us.form.g13 && us.form.repeat === "WEEKLY" && !(us.form.byDay || []).length && us.form.eventDate) us.form.byDay = [UserSchedule.weekdayOf(us.form.eventDate)]; // 매주: 시작 날짜의 요일을 기본으로
      if (UserScheduleView.isRepeating(us.form)) {
        // 반복 일정은 날짜 정함(FIXED)이고 여러 날에 걸치지 않는다(R10).
        us.form.dateKind = "FIXED";
        us.form.multiDay = false;
        us.form.endDate = "";
      }
      usShowForm();
      return;
    }
    const dayChip = ev.target.closest("[data-us-day]");
    if (dayChip) {
      const k = dayChip.getAttribute("data-us-day");
      const set = new Set(us.form.byDay || []);
      if (set.has(k)) set.delete(k);
      else set.add(k);
      us.form.byDay = [...set];
      root.querySelectorAll("[data-us-day]").forEach((x) => x.classList.toggle("active", us.form.byDay.includes(x.getAttribute("data-us-day"))));
      return;
    }
    const untilChip = ev.target.closest("[data-us-until]");
    if (untilChip) {
      us.form.untilMode = untilChip.getAttribute("data-us-until");
      if (us.form.untilMode !== "DATE") us.form.until = "";
      usShowForm();
      return;
    }
    const kind = ev.target.closest("[data-us-kind]");
    if (kind) {
      us.form.dateKind = kind.getAttribute("data-us-kind");
      if (us.form.dateKind === "PERIOD") {
        // 날짜 미정(기간) 일정은 시각·연속 기간을 갖지 않는다 — 이전에 입력한 값이 문서에 남지 않게 비운다.
        us.form.allDay = true;
        us.form.startTime = "";
        us.form.endTime = "";
        us.form.multiDay = false;
        us.form.endDate = "";
      }
      usShowForm();
    }
  }
  function usOnModalChange(ev) {
    if (!usActive() || !ev.target.closest(".us-form")) return;
    const t = ev.target;
    if (us.dayForm) {
      // "이 날만 수정": 종일(시각 없는 문서일 때만 보임)과 시각 선택
      if (t.id === "us-allday") {
        us.dayForm.allDay = t.checked;
        usShowDayForm();
      } else if (t.getAttribute("data-us-time")) {
        us.dayForm.startTime = el("us-start-h") ? usReadTime("us-start") : "";
        us.dayForm.endTime = el("us-end-h") ? usReadTime("us-end") : "";
      }
      return;
    }
    if (!us.form) return;
    if (t.id === "us-multi") {
      us.form.multiDay = t.checked;
      if (!t.checked) us.form.endDate = "";
      usShowForm();
    } else if (t.id === "us-allday") {
      us.form.allDay = t.checked;
      usShowForm();
    } else if (t.getAttribute("data-us-time")) {
      us.form.startTime = el("us-start-h") ? usReadTime("us-start") : "";
      us.form.endTime = el("us-end-h") ? usReadTime("us-end") : "";
    }
  }
  function usOnModalInput(ev) {
    if (!usActive() || !us.form || !ev.target.closest(".us-form")) return;
    const map = { "us-title": "title", "us-location": "location", "us-memo": "memo" };
    if (map[ev.target.id]) us.form[map[ev.target.id]] = ev.target.value;
    if (us.form.g13 && ev.target.id === "us-title") us.form.titleTouched = true; // 직접 고친 제목은 카테고리를 바꿔도 덮어쓰지 않는다
  }
  function usInit() {
    if (!hhEnabled() || !usReady()) return;
    el("tab-calendar").addEventListener("click", usOnCalendarClick);
    const viewSlot = el("cal-view-slot");
    if (viewSlot) viewSlot.addEventListener("click", (ev) => {
      const b = ev.target.closest("[data-cal-view]");
      if (b) usSetCalView(b.getAttribute("data-cal-view"));
    });
    const m = el("modal-content");
    m.addEventListener("click", usOnModalClick);
    m.addEventListener("change", usOnModalChange);
    m.addEventListener("input", usOnModalInput);
  }

  function showChildSwitchSheet() {
    modalMode = "profile";
    rememberChild();
    const hhOn = hhEnabled();
    const list = hhOn ? HouseholdView.mergeChildren(loadChildren(), hh.hid ? HouseholdSync.getMirror(hh.hid) : null, familyCode) : loadChildren();
    const person = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="3.5"/><path d="M5 20c0-3.5 3-6 7-6s7 2.5 7 6"/></svg>';
    const check = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
    const plus = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>';
    el("modal-content").innerHTML = `
      <h3 class="cs-title">아이 전환</h3>
      <p class="cs-sub">${hhOn && hh.hid ? HouseholdView.switchSubText(true) : "이 기기에서 열어 본 아이예요. 눌러서 바꿔 볼 수 있어요."}</p>
      <div class="cs-list">${
        list.length
          ? list
              .map((c) => {
                const now = c.code === familyCode;
                const photo = now && profile && profile.photoDataUrl ? `<img src="${profile.photoDataUrl}" alt="" />` : person;
                return `<button type="button" class="cs-item${now ? " current" : ""}" data-code="${esc(c.code)}">
                  <span class="cs-avatar">${photo}</span>
                  <span class="cs-info"><strong>${esc(c.name)}</strong><small>${acctEnabled() ? esc(HouseholdView.childSubtitle(c, { accounts: true })) : hhOn ? esc(HouseholdView.childSubtitle(c)) : `${c.stage === "pregnant" ? "임신 중 · " : ""}가족코드 ${esc(c.code)}`}</small></span>
                  ${now ? `<span class="cs-now">${check}보는 중</span>` : `<span class="cs-go">›</span>`}
                </button>`;
              })
              .join("")
          : '<p class="empty">저장된 아이가 아직 없어요.</p>'
      }</div>
      <p id="child-switch-error" class="fine-print hidden" style="color:#e0524e">불러오지 못했어요. 인터넷 연결을 확인해 주세요.</p>
      <button class="cs-add" id="btn-child-add">${plus}새 아이 추가</button>
      ${acctEnabled() ? "" : '<button class="cs-code" id="btn-child-code">가족코드로 아이 불러오기</button>'}
    `;
    el("detail-modal").classList.remove("hidden");
    el("btn-child-add").addEventListener("click", showNewChildSheet);
    if (el("btn-child-code")) el("btn-child-code").addEventListener("click", () => beginNewChildEntry({ codeEntry: true }));
    document.querySelectorAll("#modal-content .cs-item").forEach((b) =>
      b.addEventListener("click", () => {
        if (b.dataset.code === familyCode) return closeDetail();
        switchToChild(b.dataset.code);
      })
    );
  }

  // ── 새 화면 모듈(js/home.js · subsidy-view.js · records-view.js)에 넘기는 읽기용 컨텍스트 ─────────────
  // 새 화면들은 app.js의 클로저 상태를 직접 만지지 않고 여기서 넘겨주는 값·동작만 쓴다.
  function hnCtx() {
    const today = new Date();
    const linkIdx = autoLinks(); // autoLink 플래그 OFF·가구 없음이면 null (기록 화면 표시만 쓴다)
    const bindOpen = (container) => {
      if (!container) return;
      container.querySelectorAll(".event-item").forEach(bindEventItem);
      container.querySelectorAll("[data-open-event]").forEach((n) =>
        n.addEventListener("click", () => {
          const ev = schedule.find((x) => x.id === n.getAttribute("data-open-event"));
          if (ev) openDetail(ev);
        })
      );
    };
    return {
      profile,
      completed,
      familyCode,
      today,
      pregnant: isPregnant(),
      ageNow: ageInMonths(profile.birthDate, today),
      // G13-3: 계정 모드 홈(가족 일정 먼저 → 아이별 챙길 것 → 혜택). 꺼져 있으면 아래 4개는 없다(기존 홈 그대로).
      ...(acctEnabled() ? { accountDesign: true } : {}), // G14: 계정 모드 화면 디자인(기록 타임라인 등)
      ...(acctEnabled() && acct.user ? { accountHome: true, homeChildText: acctHomeChildText(), homeChildren: acctHomeChildren(), switchChild: (code) => { if (code && code !== familyCode) switchToChild(code); } } : {}),
      events: calendarSchedule(),
      autoLinkedIds: linkIdx ? new Set(linkIdx.keys()) : null,
      allEvents: schedule,
      CATEGORY_META,
      esc,
      formatDateKR,
      eventItemHtml,
      kindTagHtml,
      doneWords,
      shortSubsidySummary,
      subsidyProvider,
      subsidyAudienceLabel,
      subsidyTagsHtml,
      providerTagHtml,
      notApplicable: () =>
        schedule
          .filter((e) => isNotApplicable(e.id))
          .map((e) => ({ event: e, at: completed[e.id + NA_SUFFIX].recordedAt })),
      calGroupFor,
      isImportantEvent,
      childDisplayName,
      bindOpen,
      inCalendarMonth: eventInCalendarMonth,
      toggleComplete,
      /** 완료한 할 일에 부모 메모를 붙인다(completed[id].memo). 비우면 필드를 지운다(Firestore는 undefined 값을 거부). */
      setCompletionMemo(id, memo) {
        if (!completed[id]) return;
        const before = { ...completed };
        const next = { ...completed[id] };
        const t = String(memo || "").trim();
        if (t) next.memo = t;
        else delete next.memo;
        completed[id] = next;
        saveCompleted();
        syncCompletedChanges(before);
        renderHome();
        renderRecordTab();
      },
      usUpcomingHtml: (opts) => {
        const h = usHomeCardHtml(opts);
        us.homeSig = h + usAutoLinkSig();
        return h;
      },
      // E(1-3): 가구가 활성일 때만 홈 섹션 순서를 아이 나이로 정한다(꺼져 있으면 null → 이전 순서 그대로)
      homeOrder: () => (usActive() && typeof HomeOrder !== "undefined" ? HomeOrder.homeSectionOrder({ children: homeKids(), pregnant: isPregnant(), asOf: new Date() }) : null),
      autoLinkText: (e) => {
        const m = autoLinks();
        return m ? UserScheduleView.autoLinkNote(m.get(e.id)) : "";
      },
      usAddFromHome() {
        usOpenForm(null, toISODate(new Date())); // 캘린더 선택일은 바꾸지 않는다(폼 날짜만 오늘)
      },
      openDetail,
      openProfile: showProfileSheet,
      switchTab,
      monthKeysOf,
      periodRangeOf,
      periodGroupLabel,
      /** 접종·검진의 권장 기간 문구("2026년 7월~2026년 9월 사이" / "2026년 9월 중") — 카드·상세와 같은 표기. */
      monthPeriodText: (e) => periodTextFromWindow(e.windowStart, e.windowEnd),
      /** scope = { label, ids[], status? } 이면 그 항목들만, 없으면 전체 할 일. */
      openTodos(scope) {
        checklistScope = scope ? { label: scope.label, ids: new Set(scope.ids), keys: scope.keys || {}, flat: !!scope.flat } : null;
        checklistStatus = scope && scope.status ? scope.status : "all";
        if (scope) {
          // 범위 보기는 한 그룹만 펼친다: 이번 달 = 지금 월령, 다가오는 일정 = 가장 가까운 월령, 지난 일정 = 가장 최근 월령.
          const nowKey = checklistBucket(Math.max(0, ageInMonths(profile.birthDate, new Date())));
          const keys = schedule
            .filter((e) => scope.ids.includes(e.id))
            .flatMap((e) => (scope.keys && scope.keys[e.id] ? scope.keys[e.id] : monthKeysOf(e)))
            .filter((k) => typeof k === "number")
            .map(checklistBucket);
          const pick = scope.open === "current" ? nowKey : scope.open === "last" ? Math.max(...keys, 0) : Math.min(...(keys.length ? keys : [nowKey]));
          openMonthGroups = new Set([pick]);
        } else openMonthGroups = null;
        switchTab("checklist");
        renderChecklistTab();
      },
      goCalendar(date) {
        viewMonth = new Date(date.getFullYear(), date.getMonth(), 1);
        selectedCalendarDate = date;
        switchTab("calendar");
        renderCalendar();
        renderSelectedDayPanel();
        renderRemainingList();
        attachListHandlers();
      },
      showModal(html, mode) {
        modalMode = mode || "record";
        el("modal-content").innerHTML = html;
        el("detail-modal").classList.remove("hidden");
      },
      closeModal: closeDetail,
      resizeImageFile,
    };
  }

  // ── D1 계정(FEATURES.accounts) — 회원가입·로그인·로그아웃(최소). 서버(Firestore) 연결은 D2: 가입 정보는 이 기기에 '가입 의도'로만 보관한다. ────
  // 플래그 OFF 면 이 블록의 어떤 함수도 DOM·SDK 를 건드리지 않는다(acctInit 이 맨 앞에서 반환).
  const acctEnabled = () => typeof AccountView !== "undefined" && typeof AuthService !== "undefined" && !!window.FEATURES && window.FEATURES.accounts === true;
  const ACCT_INTENT_KEY = "hannun_account_intent";
  const acct = { svc: null, sync: null, user: null, account: null, joining: false, recoverShown: false, form: {}, errors: {}, error: null, busy: false, completing: false, restoring: false, notice: null, mode: null, migrate: null };
  function acctInit() {
    if (acctJoinLinkStart()) return; // Q3: 계정 기능이 꺼진 기기는 켠 뒤 새로고침
    if (!acctEnabled()) return;
    if (typeof document !== "undefined" && document.body && document.body.classList) document.body.classList.add("acct-design"); // G14: 계정 모드에서만 새 화면 디자인(체크리스트·혜택·기록·상세 시트) CSS 가 적용된다
    if (el("view-landing") && el("view-landing").classList) el("view-landing").classList.add("acct-on"); // G19: 계정 모드에선 로딩 중에도 옛 상황 선택 화면을 그리지 않는다
    // G16: 첫 화면 입력 폼의 OFF 안내문('회원가입 없이 바로 시작해요…')을 계정 모드에서는 처음부터 중립 문구로 바꾼다(로그인 직후 새 아이 입력 폼에도 OFF 문구가 보이지 않게).
    if (typeof el === "function" && el("entry-fine-print")) el("entry-fine-print").textContent = AccountView.MSG.onboard.formNote;
    acct.svc = AuthService.create();
    // D2: accounts 문서·가구 연결(가짜 어댑터로 테스트 가능). 같은 Firestore 어댑터를 쓰되 계정 문서 쓰기는 이 서비스만 한다.
    if (typeof AccountSync !== "undefined") acct.sync = AccountSync.create({ adapter: HouseholdSync.firestoreAdapter(() => firebase.firestore()), household: HouseholdSync });
    // 인증 확인이 끝나기 전엔 중립 화면(로고)만 보여 준다(로그인한 사람이 온보딩을 잠깐 보고 로그아웃된 줄 알지 않게). 로그아웃 표시가 있는 기기는 기다리지 않고 바로 온보딩.
    if (acctSignedOutMark()) acct.authKnown = true;
    else acctSplashShow();
    acct.svc.onChange((u, info) => {
      acct.user = u;
      // 오프라인·SDK 로드 실패(확인 불가)는 '로그아웃됨'이 아니다: 이 기기에 로그아웃 표시가 있을 때만 로그아웃으로 본다(로그인했던 기기는 홈 유지).
      acct.authKnown = !(info && info.unknown) || acctSignedOutMark();
      if (u) acctSignedOutMark(false);
      acctGateHome();
      acctRenderLanding();
      acctRenderSlot();
      if (u) acct.pendingLink = null; // 이미 로그인된 기기는 초대 링크를 무시한다
      else if (acct.pendingLink) acctOpenLinkSignup(); // Q3: 링크로 들어오면 바로 회원가입(합류) 시트
      if (u) acctSplashArm(RESTORE_MAX_MS, acctRestoreSlow); // 복원을 기다리는 동안엔 3초 타이머를 쓰지 않는다(Auth 응답은 이미 왔다)
      if (u) acctRestoreThenHide(u); // 로그인 상태가 되면(다른 기기 로그인·앱 재시작) 계정 가구를 이 기기에 복원한다(끝난 뒤 중립 화면을 걷는다)
      else acctSplashHide();
    });
    const ep = el("empty-panel");
    if (ep) ep.addEventListener("click", acctOnClick);
    acctRenderLanding();
  }
  /**
   * 계정 모드에서 로그인하지 않은 상태는 항상 첫 화면(온보딩). 로그아웃 직후·새로고침·앱 재실행이 같다.
   * 원인: 이 기기에 아이 프로필이 남아 있으면 init() 이 무조건 캘린더를 띄우고, 인증 상태(null)는 랜딩 카드만 다시 그려서 화면은 홈 그대로였다.
   * 화면만 옮기고 아이·기록 데이터는 건드리지 않는다. 아이 추가(newChildMode) 입력 중에는 그대로 둔다.
   */
  const SIGNED_OUT_KEY = "hannun_acct_signed_out";
  /** 이 기기의 '로그아웃함' 표시. 인자 없이 읽기, true 면 남기기, false 면 지우기. */
  function acctSignedOutMark(set) {
    try {
      if (set === true) localStorage.setItem(SIGNED_OUT_KEY, "1");
      else if (set === false) localStorage.removeItem(SIGNED_OUT_KEY);
      else return localStorage.getItem(SIGNED_OUT_KEY) === "1";
    } catch (e) {}
    return set === undefined ? false : !!set;
  }
  const SPLASH_MAX_MS = 3000; // Auth 응답이 아예 없을 때만: G8 규칙대로(로그인했던 기기=홈, 로그아웃한 기기=온보딩) 화면을 내보낸다
  const RESTORE_MAX_MS = 10000; // Auth 가 '로그인됨'을 돌려준 뒤 가구 복원을 기다리는 최대 시간(넘으면 빈 홈)
  let acctSplashTimer = null;
  function acctSplashShow() {
    if (typeof document === "undefined" || !document.createElement || !document.body || el("acct-splash")) return;
    const d = document.createElement("div");
    d.id = "acct-splash";
    d.className = "acct-splash";
    d.setAttribute("aria-hidden", "true");
    d.innerHTML = `<span class="acct-splash-logo">${AccountView.esc(AccountView.MSG.logo)}</span>`;
    document.body.appendChild(d);
    acctSplashArm(SPLASH_MAX_MS, acctSplashHide);
  }
  function acctSplashArm(ms, fn) {
    if (typeof setTimeout !== "function") return;
    if (acctSplashTimer) clearTimeout(acctSplashTimer);
    acctSplashTimer = setTimeout(fn, ms);
  }
  /** 로그인됨인데 가구 복원이 10초를 넘기면: 중립 화면을 걷고 아이가 없으면 '아이를 등록해 주세요' 빈 홈(있으면 지금 홈 그대로). */
  function acctRestoreSlow() {
    acct.splashHold = false;
    acctSplashHide();
    if (acct.user && !profile && !newChildMode && typeof showEmptyHome === "function") showEmptyHome();
  }
  /**
   * G16: 로그인 직후 복원(Firestore 읽기)이 느려도 아이 입력 폼(view-landing)이 비치지 않게, 복원이 끝날 때까지 중립 화면(스플래시)을 덮는다.
   * 10초를 넘기면 기존 규칙(acctRestoreSlow)대로 걷고 빈 홈. 다른 복원이 진행 중이면(onChange) 그쪽이 끝날 때 걷는다.
   */
  async function acctLoginRestore(u) {
    acctSplashHold();
    try {
      await acctRestoreThenHide(u);
      // 다른 복원(onChange)이 진행 중이라 바로 돌아왔다면 그 복원이 끝날 때까지(최대 RESTORE_MAX_MS) 기다린다
      for (let n = 0; acct.restoring && n < 200 && typeof setTimeout === "function"; n++) await new Promise((r) => setTimeout(r, 50));
      if (typeof acctGoHome === "function") await acctGoHome();
    } finally {
      acctSplashRelease();
    }
  }
  /** G19: 가입·로그인 성공 뒤 홈(또는 빈 홈)이 그려질 때까지 중립 화면을 붙잡는다 — 어떤 순서로 콜백이 와도 아이 입력 폼(view-landing)이 비치지 않게. 10초 뒤엔 acctRestoreSlow 가 푼다. */
  function acctSplashHold() {
    acct.splashHold = true;
    acctSplashShow();
    acctSplashArm(RESTORE_MAX_MS, acctRestoreSlow);
  }
  function acctSplashRelease() {
    acct.splashHold = false;
    acctSplashHide();
  }
  /** 복원을 하고 끝나면 스플래시를 걷는다. 다른 복원이 이미 진행 중이라 바로 돌아온 경우(acct.restoring)는 걷지 않는다 — 진행 중인 복원이 끝날 때 걷는다(Auth 콜백·signIn 응답 순서와 무관). */
  function acctRestoreThenHide(u) {
    return Promise.resolve(acctRestore(u)).then(
      () => { if (!acct.restoring) acctSplashHide(); },
      () => acctSplashHide()
    );
  }
  function acctSplashHide() {
    if (acct.splashHold) return; // G19: 가입·로그인 직후에는 acctSplashRelease 만 걷는다
    if (acctSplashTimer) clearTimeout(acctSplashTimer);
    acctSplashTimer = null;
    const d = el("acct-splash");
    if (d && d.remove) d.remove();
  }
  function acctGateHome() {
    if (!acctEnabled() || acct.user || !acct.authKnown || newChildMode) return false;
    if (el("view-landing") && !el("view-landing").classList.contains("hidden")) return false;
    if (typeof hideEmptyHome === "function") hideEmptyHome();
    showLandingView();
    return true;
  }
  /** 랜딩의 계정 카드(로고·회원가입·로그인). 기존 입력 화면은 그대로 아래에 둔다(계정 없이 시작하기). */
  function acctRenderLanding() {
    if (!acctEnabled()) return;
    const hero = el("view-landing") && el("view-landing").querySelector(".hero");
    if (!hero) return;
    let slot = el("acct-landing-slot");
    if (!slot) {
      slot = document.createElement("div");
      slot.id = "acct-landing-slot";
      hero.insertAdjacentElement("afterend", slot);
      slot.addEventListener("click", acctOnClick);
    }
    slot.innerHTML = AccountView.renderLanding({ user: acct.user, version: typeof self !== "undefined" ? self.APP_VERSION || "" : "" });
    acctBindSlides(slot);
    // G1: 계정 기능이 켜졌을 때만 옛 첫 화면의 문구를 새 톤으로 바꾸고(OFF 는 기존 그대로), 첫 화면 모드(간단/둘러보기)를 적용한다.
    const O = AccountView.MSG.onboard;
    const title = el("hero-title");
    if (title) title.textContent = O.browseHeroTitle;
    const fine = el("entry-fine-print");
    if (fine) fine.textContent = O.formNote;
    acctEnsureStageToggle();
    // H1: 아이 기록 코드 입력은 계정 모드에서 쓰지 않는다(가족코드로 합류는 '가족에게 받은 가족코드로 함께하기').
    const co = el("btn-show-code-entry");
    if (co) co.style.setProperty("display", "none", "important");
    const ce = el("code-entry");
    if (ce) ce.classList.add("hidden");
    acctApplyLandingMode();
  }
  /** G10 입력 폼 안의 '생년월일 / 출산 예정일' 전환(상황 선택 화면 대신). 값은 기존 landingStage(born/pregnant)를 그대로 쓴다. */
  function acctEnsureStageToggle() {
    const form = el("query-form");
    if (!form || el("acct-stage-toggle") || !document.createElement) return;
    const O = AccountView.MSG.onboard;
    const box = document.createElement("div");
    box.id = "acct-stage-toggle";
    box.className = "acct-stage-toggle";
    box.innerHTML = `<h2 class="acct-child-title">${AccountView.esc(O.childFormTitle)}</h2><div class="acct-seg" role="radiogroup" aria-label="${AccountView.esc(O.dateKindAria)}"><button type="button" role="radio" data-acct-stage="born">${AccountView.esc(O.dateKindBorn)}</button><button type="button" role="radio" data-acct-stage="pregnant">${AccountView.esc(O.dateKindDue)}</button></div>`;
    form.insertBefore(box, form.firstChild);
    box.addEventListener("click", (ev) => {
      const b = ev.target.closest ? ev.target.closest("[data-acct-stage]") : null;
      if (b && b.getAttribute("data-acct-stage") !== landingStage) setLandingStage(b.getAttribute("data-acct-stage"));
    });
    acctSyncStageToggle(landingStage);
  }
  function acctSyncStageToggle(stage) {
    const box = el("acct-stage-toggle");
    if (!box || !box.querySelectorAll) return;
    box.querySelectorAll("[data-acct-stage]").forEach((b) => {
      const on = b.getAttribute("data-acct-stage") === stage;
      b.classList.toggle("on", on);
      b.setAttribute("aria-checked", on ? "true" : "false");
    });
  }
  /** G7 첫 화면 슬라이드: 스크롤(스와이프)·점·화살표 키로 장을 바꾸고 점 표시를 맞춘다. */
  function acctSlidesOf(slot) {
    return slot && slot.querySelector ? slot.querySelector("[data-acct-slides]") : null;
  }
  function acctSyncDots(slot) {
    const sl = acctSlidesOf(slot);
    if (!sl) return;
    const idx = AccountView.slideIndex(sl.scrollLeft, sl.clientWidth, 2);
    slot.querySelectorAll("[data-slide-to]").forEach((d) => {
      const on = Number(d.getAttribute("data-slide-to")) === idx;
      d.classList.toggle("on", on);
      d.setAttribute("aria-selected", on ? "true" : "false");
    });
  }
  function acctGoSlide(slot, n) {
    const sl = acctSlidesOf(slot);
    if (!sl) return;
    const left = Math.max(0, Math.min(1, n)) * sl.clientWidth;
    if (typeof sl.scrollTo === "function") sl.scrollTo({ left, behavior: "smooth" });
    else sl.scrollLeft = left;
    acctSyncDots(slot);
  }
  function acctBindSlides(slot) {
    const sl = acctSlidesOf(slot);
    if (!sl || !sl.addEventListener) return;
    sl.addEventListener("scroll", () => acctSyncDots(slot), { passive: true });
    sl.addEventListener("keydown", (ev) => {
      if (ev.key !== "ArrowRight" && ev.key !== "ArrowLeft") return;
      ev.preventDefault();
      acctGoSlide(slot, AccountView.slideIndex(sl.scrollLeft, sl.clientWidth, 2) + (ev.key === "ArrowRight" ? 1 : -1));
    });
  }
  let acctBrowse = false; // (G7 이후 둘러보기 버튼은 없다 — 항상 false)
  /** 첫 화면 모드: 간단(기본: 로고·가입·가족 코드·로그인만) / 둘러보기(옛 상황 선택·아이 입력 폼 펼침) / 새 아이 입력 중(카드 숨김). OFF 는 클래스를 건드리지 않는다. */
  function acctApplyLandingMode() {
    const v = el("view-landing");
    if (!v || !acctEnabled() || !v.classList) return;
    const simple = !acct.user && !acctBrowse && !newChildMode;
    v.classList.toggle("acct-simple", simple);
    v.classList.toggle("acct-browse", !simple && !acct.user && !newChildMode);
    v.classList.toggle("acct-hidecard", !!newChildMode);
    v.classList.add("acct-on"); // G10: 계정 모드에선 옛 시작 화면(제목·아이 상황 선택)을 어떤 경로로도 보이지 않는다
  }
  // ── G1 OFF 첫 화면의 '새 버전 미리 써 보기 (베타)': 회원가입·가족 캘린더 플래그(household·accounts)를 이 기기에서만 켠다(서버 호출 없음). 끄기는 두 키를 지운다(= OFF). ──
  const PREVIEW_KEYS = ["hannun_feature_household", "hannun_feature_accounts"];
  function previewRender() {
    const slot = el("beta-preview-slot");
    if (!slot || typeof AccountView === "undefined") return;
    slot.innerHTML = !acctEnabled() && !newChildMode ? AccountView.renderBetaPreviewCard() : "";
    if (!slot.dataset || slot.dataset.bound) return;
    slot.dataset.bound = "1";
    slot.addEventListener("click", previewOnClick);
  }
  function previewShowSheet(on) {
    modalMode = "profile";
    el("modal-content").innerHTML = AccountView.renderBetaConfirm(on);
    el("detail-modal").classList.remove("hidden");
    const root = el("modal-content").querySelector("[data-preview-form]");
    if (root) root.addEventListener("click", previewOnClick);
  }
  function previewOnClick(ev) {
    const b = ev.target.closest("[data-preview-action]");
    if (!b) return;
    ev.stopPropagation && ev.stopPropagation();
    const action = b.getAttribute("data-preview-action");
    if (acctEnabled()) return; // G18: 계정 모드(기본)에서는 미리 써 보기·끄기 흐름이 없다
    if (action === "ask") return previewShowSheet(true);
    if (action === "cancel") return closeDetail();
    if (action !== "confirm") return;
    const form = ev.target.closest("[data-preview-form]");
    const on = !form || form.getAttribute("data-preview-form") === "on";
    try {
      for (const k of PREVIEW_KEYS) {
        if (on) localStorage.setItem(k, "1");
        else localStorage.removeItem(k);
      }
    } catch (e) {
      console.warn("베타 설정을 저장하지 못했어요(저장소 사용 불가) — 상태를 그대로 둡니다.", e);
      return;
    }
    location.reload();
  }
  /* (G1 구간 끝) */
  function acctRenderSlot() {
    const s = el("acct-slot");
    if (s) {
      const family = hh.hid || hh.code ? { members: HouseholdView.visibleMembers(usMembers()).map((m) => ({ memberId: m.memberId, role: m.role, label: m.label })), meId: usMeId(), meName: (acctIdentity() || {}).name || "", children: usLinks().filter((l) => !l.removedAt) } : { members: [], meId: null, meName: "", children: [] };
      s.innerHTML = AccountView.renderAccountSlot({ user: acct.user, account: acct.account, notice: acct.notice, withCode: true, code: hh.code, family });
    }
  }
  function acctOpenSlot() {
    const s = el("acct-slot");
    if (!s) return;
    acctRenderSlot();
    acct.notice = null; // 가입·로그인 직후 안내는 내 정보 시트에 한 번만 보인다
    s.addEventListener("click", acctOnClick);
  }
  function acctShowSheet(kind) {
    if (kind) acct.mode = kind;
    modalMode = "account";
    const st = { form: acct.form, errors: acct.errors, error: acct.error, busy: acct.busy, notice: acct.notice, regions: regionsData ? regionsData.provinces : [] };
    el("modal-content").innerHTML =
      acct.mode === "signup" ? AccountView.renderSignup(st)
      : acct.mode === "login" ? AccountView.renderLogin(st)
      : acct.mode === "me" ? AccountView.renderMe({ user: acct.user, account: acct.account, code: hh.code, notice: acct.notice })
      : acct.mode === "role" ? AccountView.renderRolePick({ form: acct.form, errors: acct.errors, busy: acct.busy, error: acct.error })
      : acct.mode === "slot" ? AccountView.renderSlotPick({ slots: acct.slotPick && acct.slotPick.slots, busy: acct.busy, error: acct.error })
      : acct.mode === "invite" ? AccountView.renderInvite({ code: hh.code, role: acct.form && acct.form.inviteRole, preview: acctInvitePreview(), canSchedule: usActive(), notice: acct.notice, busy: acct.busy, error: acct.error })
      : acct.mode === "migrate" ? AccountView.renderMigrate({ kids: acct.migrate && acct.migrate.kids, conflict: !!(acct.migrate && acct.migrate.switchTo), busy: acct.busy, error: acct.error })
      : acct.mode === "recover" ? AccountView.renderRecover({ ...st, joining: acct.joining })
      : AccountView.renderLogoutConfirm({ pending: acct.pending || 0 });
    el("detail-modal").classList.remove("hidden");
    if (acct.mode === "invite" && typeof addTilesBind === "function") addTilesBind(); // G7: 가족 추가 시트 위 타일(일정 추가·아이 등록하기로 이동)
    const root = el("modal-content").querySelector("[data-acct-form]");
    if (!root) return;
    root.addEventListener("click", acctOnClick);
    if (acct.joinFocus && root.querySelector) {
      const codeEl = root.querySelector('[data-acct-input="familyCode"]');
      if (codeEl && codeEl.focus) codeEl.focus();
      acct.joinFocus = false;
    }
    root.addEventListener("input", (ev) => {
      const k = ev.target && ev.target.getAttribute && ev.target.getAttribute("data-acct-input");
      if (!k) return;
      const before = AccountView.normCode(acct.form.familyCode) !== "";
      acct.form[k] = ev.target.value;
      if (k === "province") {
        acct.form.district = ""; // 시·도가 바뀌면 시·군·구를 다시 고르게 한다
        return acctShowSheet();
      }
      // 가족 코드 입력 여부가 바뀌면(신규↔합류) 아래 항목이 달라지므로 다시 그리고 입력 위치를 되돌린다.
      if (k === "familyCode" && before !== (AccountView.normCode(acct.form.familyCode) !== "")) {
        AccountView.syncForm(acct.form, regionsData && regionsData.provinces);
        acctShowSheet();
        const again = el("modal-content").querySelector('[data-acct-input="familyCode"]');
        if (again) {
          again.focus();
          again.setSelectionRange(again.value.length, again.value.length);
        }
      }
    });
  }
  const ACCT_DENIED = (e) => !!e && e.code === "permission-denied";
  const acctReadIntent = () => {
    try {
      return JSON.parse(localStorage.getItem(ACCT_INTENT_KEY) || "null");
    } catch (e) {
      return null;
    }
  };
  const acctClearIntent = () => {
    try {
      localStorage.removeItem(ACCT_INTENT_KEY);
    } catch (e) {}
  };
  /** 계정 정보(내 구성원)가 바뀐 뒤 캘린더 칩·기본 선택을 다시 그린다(앱 시작 전에는 함수가 없을 수 있다). */
  function acctRefreshCalendar() {
    if (typeof acctRenderMeLine === "function" && profile && acctEnabled()) acctRenderMeLine(); // Q1: 로그인·복원·로그아웃 뒤 내 이름 줄 갱신
    if (typeof usRefreshCalendar === "function") usRefreshCalendar();
  }
  /** 이 계정의 가구 연결이 끝났는가(accounts 에 householdCode 가 기록됨). 계정 동기화가 없거나(D1) 연결 완료가 확인되면 true, 확인 못 하면 false(의도를 남긴다). */
  async function acctIsLinked(uid) {
    if (!acct.sync) return true;
    if (!uid) return false;
    const r = await acct.sync.restore(uid);
    return !!(r.ok && r.account && r.account.householdCode);
  }
  // ── D4 기존 기기 데이터 이전: 이 기기의 아이·가구를 지우지 않고 계정 가구에 연결한다(서버 쓰기는 addChild·계정 문서뿐). ──
  const ACCT_KEPT_KEY = "hannun_migrate_kept"; // '내 계정 가족 쓰기'를 고른 아이 코드(다시 묻지 않는다)
  const acctReadKept = () => {
    try {
      const l = JSON.parse(localStorage.getItem(ACCT_KEPT_KEY) || "[]");
      return Array.isArray(l) ? l : [];
    } catch (e) {
      return [];
    }
  };
  /** 이 기기에 저장된 아이(임신 중 제외): 아이 목록 + 지금 아이. */
  function acctDeviceKids() {
    const list = loadChildren().filter((c) => c && c.code && c.stage !== "pregnant");
    if (familyCode && profile && !isPregnant() && !list.some((c) => c.code === familyCode)) list.push({ code: familyCode, name: childDisplayName(), stage: "born" });
    return list.map((c) => ({ code: c.code, name: c.name || "" }));
  }
  const acctUnlinkedKids = (mirror) => {
    const kept = acctReadKept();
    return acctDeviceKids().filter((c) => !HouseholdView.isChildLinked(mirror, c.code) && !kept.includes(c.code));
  };
  async function acctLinkKids(hid, kids) {
    const m = HouseholdSync.getMirror(hid);
    let order = Object.keys((m && m.children) || {}).length;
    for (const c of kids) {
      const w = await HouseholdSync.addChild(hid, { familyCode: c.code, displayName: c.name, order: ++order });
      if (!w || !w.ok) return { ok: false };
    }
    return { ok: true };
  }
  /** 가구가 정해진 직후: 새 가구면 이 기기 아이를 바로 연결(고를 것이 없다), 기존 가구에 합류했으면 아직 연결 안 된 아이가 있을 때 선택 시트를 준비한다. */
  async function acctPlanKids(res) {
    const m = HouseholdSync.getMirror(res.householdId);
    if (res.created) {
      const kids = acctUnlinkedKids(m);
      if (kids.length) await acctLinkKids(res.householdId, kids).catch((e) => console.error("아이 연결 실패", e));
      return;
    }
    if (!m) return;
    const kids = acctUnlinkedKids(m);
    if (kids.length) acct.migrate = { switchTo: null, kids };
  }
  /** 선택 시트가 준비돼 있으면 연다(다른 시트를 닫은 직후에 호출). */
  function acctMaybeShowMigrate() {
    if (acct.user && acct.migrate && !acct.busy) acctShowSheet("migrate");
  }
  /** 이 기기의 가구를 정리하고 계정 가구로 바꾼다. 보내지 못한 변경이 남아 있으면 바꾸지 않는다(데이터 유실 방지). */
  async function acctSwitchHousehold(code) {
    const look = await HouseholdSync.lookupHousehold(code);
    if (!look.ok) return false;
    if (hh.hid) {
      try {
        await HouseholdSync.flush(hh.hid);
      } catch (e) {}
      if (HouseholdSync.getStatus(hh.hid).pending > 0) return false;
      hhLeaveLocal();
    }
    const j = await HouseholdSync.joinHousehold(code);
    if (!j.ok) return false;
    hhSetJoined(j.householdId, code);
    if (!profile) await acctAfterHousehold({}, { created: false, householdId: j.householdId });
    acctRefreshCalendar();
    return true;
  }
  /** 가입 마무리: accounts 문서 → 가구 생성/합류 → 구성원 uid 연결. rollback=true(방금 가입)면 서버 규칙이 없을 때 Auth 사용자를 지우고 가입 전 상태로 돌린다. */
  async function acctFinishSignup(intent, rollback) {
    acct.completing = true;
    let res;
    // D4: 이 기기에 이미 가구가 있고 합류 코드가 없으면 새 가구를 만들지 않고 이 기기 가구를 계정에 귀속한다(가구가 서버에 없으면 원래 흐름으로).
    const adopt = !intent.joiningCode && !!hh.hid && !!hh.code;
    try {
      res = await acct.sync.completeSignup({ user: acct.user, intent: adopt ? { ...intent, joiningCode: hh.code } : intent });
      if (adopt && !res.ok && res.reason === "not-found") res = await acct.sync.completeSignup({ user: acct.user, intent });
    } finally {
      acct.completing = false;
    }
    if (!res.ok) {
      if (rollback && (res.reason === "rules-unavailable" || res.reason === "not-found")) {
        await acct.svc.deleteCurrentUser();
        acctClearIntent();
        acct.user = null;
        acct.error = res.reason === "not-found" ? AuthService.MSG.codeNotFound : AuthService.MSG.serverNotReady;
        acct.mode = "signup";
        acctRenderLanding();
        acctRenderSlot();
        return { ok: false, rolledBack: true };
      }
      // 일시 오류(네트워크 등): 로그인 상태와 가입 의도를 남겨 다음 로그인·앱 시작 때 이어서 연결한다.
      acct.error = res.reason === "rules-unavailable" ? AuthService.MSG.serverNotReady : AuthService.MSG.linkFailed;
      return { ok: false, rolledBack: false };
    }
    acct.account = { displayName: intent.displayName, role: intent.role, memberId: res.memberId, householdId: res.householdId, householdCode: res.householdCode, ...(intent.situation ? { situation: intent.situation } : {}), ...(intent.province ? { province: intent.province, district: intent.district } : {}) };
    if (hh.code && hh.code !== res.householdCode) {
      // 이 기기에 다른 가구가 연결돼 있다: 사용자가 고르기 전에는 바꾸지 않는다(선택 시트 — 계정 가족 쓰기 / 이 기기 아이를 가족에 추가).
      acctClearIntent();
      acct.migrate = { switchTo: res.householdCode, kids: acctDeviceKids() };
      acctRefreshCalendar();
      return { ok: true };
    }
    hhSetJoined(res.householdId, res.householdCode);
    await acctAfterHousehold(intent, res);
    await acctPlanKids(res);
    acctRefreshCalendar();
    return { ok: true };
  }
  /** 가구가 정해진 뒤(D5): 아이 입력 화면은 열지 않는다. 합류한 가구에 아이가 있으면 첫 아이를 불러오고, 아이가 없으면(새 가족·빈 가구) 아이가 없는 홈을 보인다. */
  async function acctAfterHousehold(intent, res) {
    if (profile) {
      acctClearIntent(); // 이 기기에 이미 아이가 있으면 건드리지 않는다(기존 데이터 연결은 D4)
      return;
    }
    let kids = [];
    if (!res.created) {
      const m = HouseholdSync.getMirror(res.householdId);
      kids = HouseholdView.mergeChildren([], m, null).filter((c) => !c.removed);
    }
    acctClearIntent();
    if (kids.length) {
      el("familyCodeInput").value = kids[0].code;
      await handleLoadCode();
    }
    if (!profile) showEmptyHome();
  }
  // ── D5 아이가 없는 홈: 프로필이 없어도 앱이 깨지지 않도록 대시보드의 탭 패널 대신 안내 패널(#empty-panel)만 보인다. 계정으로 가입·로그인한 경우에만 진입한다. ──
  let emptyHome = false;
  const acctExpecting = () => !!(acct.account && acct.account.situation === "EXPECTING");
  function emptyRender(tab) {
    emptyHome = true;
    TAB_NAMES.forEach((t) => el(`tab-${t}`).classList.add("hidden"));
    const p = el("empty-panel");
    p.classList.remove("hidden");
    const st = { expecting: acctExpecting(), user: acct.user, account: acct.account };
    p.innerHTML = tab === "home" ? AccountView.renderEmptyHome(st) : AccountView.renderEmptyTab(tab, st);
    currentTab = tab;
    document.querySelectorAll(".nav-item").forEach((btn) => btn.classList.toggle("active", btn.dataset.nav === tab));
    window.scrollTo(0, 0);
  }
  function showEmptyHome() {
    if (!acctEnabled() || profile) return;
    el("view-landing").classList.add("hidden");
    el("new-child-bar").classList.add("hidden");
    el("view-calendar").classList.remove("hidden");
    emptyRender("home");
  }
  function hideEmptyHome() {
    emptyHome = false;
    const p = el("empty-panel");
    if (p) p.classList.add("hidden");
  }
  /** 가입에서 받은 사는 지역을 아이 등록 화면의 기본값으로 미리 채운다(이미 고른 값은 덮어쓰지 않는다). */
  function acctPrefillRegion() {
    if (!acctEnabled() || !acct.account || !acct.account.province || !acct.account.district || !regionsData || el("province").value) return;
    const p = regionsData.provinces.find((x) => x.code === acct.account.province);
    if (!p || !p.districts.includes(acct.account.district)) return;
    el("province").value = p.code;
    populateDistricts(p.code, acct.account.district);
    el("district").value = acct.account.district;
    renderProvinceChips();
    renderDistrictChips();
  }
  /**
   * 로그인 직후 첫 화면(온보딩·옛 아이 입력 화면)에 남지 않고 바로 홈으로 간다.
   * 원인: 로그아웃 상태 첫 화면에서 로그인하면 인증만 바뀌고 화면은 첫 화면 그대로(옛 아이 입력 화면)였다.
   * 이 기기에 아이가 있으면(복원 뒤 포함) 캘린더 홈, 없으면 '아이를 등록해 주세요' 빈 홈. 아이 추가 입력(newChildMode) 중이면 그대로 둔다.
   */
  async function acctGoHome() {
    if (!acctEnabled() || !acct.user || newChildMode) return;
    const lv = el("view-landing");
    if (!lv || !lv.classList || typeof lv.classList.contains !== "function" || lv.classList.contains("hidden")) return;
    if (profile) {
      await buildAndRender();
      hideEmptyHome();
      showCalendarView();
      acctRenderMeLine();
    } else showEmptyHome();
  }
  /** 로그인 상태가 됐을 때: 끝나지 않은 가입이 있으면 이어서 마무리, 아니면 계정 가구를 이 기기에 복원(이 기기에 다른 가구가 있으면 건드리지 않는다 — D4). */
  async function acctRestore(u) {
    // G16: 복원을 못 하는 경우(계정 동기화 모듈 없음)에도 로그인한 사람이 첫 화면(아이 입력 폼)에 남지 않게 홈으로 보낸다.
    if (typeof acctOwnerSync === "function") acctOwnerSync(u); // G17: 다른 계정의 로컬 아이 데이터가 남아 있으면 복원 전에 비운다
    if (!acct.sync) { await acctGoHome(); return; }
    if (acct.busy || acct.completing || acct.restoring) return;
    acct.restoring = true;
    try {
      let intent = acctReadIntent();
      const r = await acct.sync.restore(u.uid);
      if (!r.ok) return; // 규칙 미배포·오프라인: 조용히 넘어간다
      acct.account = r.account || null;
      // 복구 경로(D3): 가구 연결도 가입 의도도 없으면(로그아웃·앱 데이터 삭제·계정 문서 쓰기 실패 등) 새 가족을 만들기 전에 반드시 선택 화면을 한 번 거친다
      // — 합류하려던 사람이 새 가족을 잘못 만들지 않도록. 이 기기에 이미 가구가 있으면 묻지 않는다.
      if (!intent && !(r.account && r.account.householdCode)) {
        if (!hh.code && !acct.recoverShown) {
          acct.recoverShown = true;
          acct.form = { role: (r.account && r.account.role) || "", displayName: (r.account && r.account.displayName) || u.displayName || "", email: u.email || "" };
          acct.joining = false;
          acct.errors = {};
          acct.error = null;
          acctShowSheet("recover");
        }
        return;
      }
      if (intent && (!r.account || !r.account.householdCode)) {
        await acctFinishSignup(intent, false);
        return;
      }
      const acc = r.account;
      if (!acc || !acc.householdCode) return;
      if (hh.code && hh.code !== acc.householdCode) {
        // D4: 이 기기 가구와 계정 가구가 다르다 — 묻기 전에는 아무것도 바꾸지 않는다.
        acct.migrate = { switchTo: acc.householdCode, kids: acctDeviceKids() };
        return;
      }
      if (hh.code) return;
      const j = await HouseholdSync.joinHousehold(acc.householdCode);
      if (!j.ok) return;
      hhSetJoined(j.householdId, acc.householdCode);
      await acctAfterHousehold({}, { created: false, householdId: j.householdId });
      await acctPlanKids({ created: false, householdId: j.householdId });
    } catch (e) {
      console.error("계정 복원 실패", e);
    } finally {
      acct.restoring = false;
      try { acctRenderSlot(); acctRefreshCalendar(); } catch (e) { console.error("계정 화면 갱신 실패", e); } // G16: 갱신 오류가 홈 이동(아래)을 막지 않게
      // D5: 계정이 연결됐는데 이 기기에 아이가 없고 입력 화면도 아니면(재시작·다른 기기 로그인) 아이가 없는 홈을 보인다.
      if (acct.user && acct.account && acct.account.householdCode && !profile && !newChildMode && !emptyHome) showEmptyHome();
      await acctGoHome();
      acctMaybeShowMigrate();
    }
  }

  /** Q3 가족 추가 시트 열기(역할 선택은 비워 둔다). */
  function acctOpenInvite() {
    acct.form = {};
    acct.notice = null;
    acct.error = null;
    acctShowSheet("invite");
  }
  /** G7 가족 추가 시트의 초대 문구 미리보기(역할을 고른 뒤): 실제로 보낼 문구와 같다. */
  function acctInvitePreview() {
    const role = acct.form && acct.form.inviteRole;
    if (!hh.code || !AccountView.INVITE_ROLES.some(([k]) => k === role)) return "";
    const id = acctIdentity();
    return AccountView.inviteText(id ? id.name : "한눈육아 가족", id && id.roleName, AccountView.inviteLink(hh.code, role, usMeId() || ""), hh.code);
  }
  /** Q3 [초대 보내기]: 그 역할의 빈 자리(uid 없는 구성원)를 만들거나 이미 있으면 다시 쓰고, 초대 문구를 공유(없으면 복사)한다. */
  async function acctSendInvite() {
    const role = acct.form && acct.form.inviteRole;
    if (!AccountView.INVITE_ROLES.some(([k]) => k === role) || !hh.hid || !hh.code || acct.busy) return;
    acct.busy = true;
    acct.error = null;
    acct.notice = null;
    acctShowSheet("invite");
    try {
      const members = usMembers();
      const visible = HouseholdView.visibleMembers(members);
      const open = visible.find((m) => !m.uid && m.role === role);
      if (!open) {
        if (visible.length >= HouseholdView.MEMBER_MAX) throw new Error("member-max");
        const r = await HouseholdSync.upsertMember(hh.hid, { role, label: AccountView.INVITE_LABEL[role], order: HouseholdView.nextMemberOrder(members) });
        if (!r || !r.ok) throw new Error((r && r.reason) || "invite-slot-failed");
      }
      const id = acctIdentity();
      const text = acctInvitePreview(); // 미리보기와 같은 문구
      let shared = false;
      if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
        try {
          await navigator.share({ text });
          shared = true;
        } catch (e) {
          if (e && e.name === "AbortError") { acct.busy = false; return acctShowSheet("invite"); } // 사용자가 공유창을 닫음
        }
      }
      if (!shared) {
        try {
          await navigator.clipboard.writeText(text);
          acct.notice = AccountView.MSG.inviteTextCopied;
        } catch (e) {
          acct.error = AccountView.MSG.inviteFail;
        }
      }
      acctRefreshCalendar(); // 새 빈 자리 칩이 바로 생긴다
    } catch (e) {
      console.error("초대 실패", e);
      acct.error = e && e.message === "member-max" ? HouseholdView.MSG.memMax : AccountView.MSG.inviteFail;
    }
    acct.busy = false;
    acctShowSheet("invite");
  }
  /** Q3 초대 링크(?join=&role=&from=): 주소에서 지우고(history.replaceState), 형식이 맞으면 첫 화면을 바로 회원가입(합류)으로 연다. 계정 기능이 꺼진 기기는 켠 뒤 다시 불러온다. */
  const JOIN_LINK_KEY = "hannun_join_link";
  function acctReadJoinLink() {
    try {
      if (typeof AccountView === "undefined" || typeof location === "undefined") return null;
      const q = new URLSearchParams(location.search);
      let link = null;
      if (q.has("join") || q.has("role") || q.has("from")) {
        link = AccountView.parseJoinParams(location.search); // 잘못된 코드는 null → 무시
        ["join", "role", "from"].forEach((k) => q.delete(k));
        const rest = q.toString();
        if (history && history.replaceState) history.replaceState(null, "", location.pathname + (rest ? "?" + rest : "") + location.hash);
        if (link) { try { sessionStorage.setItem(JOIN_LINK_KEY, JSON.stringify(link)); } catch (e) {} }
      }
      let saved = null;
      try { saved = JSON.parse(sessionStorage.getItem(JOIN_LINK_KEY) || "null"); } catch (e) {}
      return saved && /^[A-Z0-9]{8}$/.test(saved.code || "") ? saved : null;
    } catch (e) {
      return null;
    }
  }
  /** 앱 시작 때 한 번. 반환 true 면 계정 기능을 켜기 위해 새로고침 중이다. */
  function acctJoinLinkStart() {
    const link = acctReadJoinLink();
    if (!link) return false;
    if (!acctEnabled()) {
      try {
        PREVIEW_KEYS.forEach((k) => localStorage.setItem(k, "1")); // 베타 미리 써 보기와 같은 키(이 기기에서만). 링크는 sessionStorage 에 남겨 새로고침 뒤 이어서 처리한다.
      } catch (e) {
        return false;
      }
      location.reload();
      return true;
    }
    acct.pendingLink = link;
    try { sessionStorage.removeItem(JOIN_LINK_KEY); } catch (e) {}
    return false;
  }
  function acctOpenLinkSignup() {
    const link = acct.pendingLink;
    acct.pendingLink = null;
    if (!link) return;
    acct.form = { join: true, fromLink: true, familyCode: link.code, role: link.role || "", from: link.from || "" };
    acct.errors = {};
    acct.error = null;
    acct.mode = "signup";
    acctShowSheet("signup");
  }
  /** 고른 자리를 가입 의도에 반영: 자리 id + 계정 role(규칙이 허용하는 4종으로 변환). */
  function acctApplySlot(intent, slot) {
    intent.slotMemberId = slot.memberId;
    intent.role = AccountSync.accountRoleOf(slot.role);
  }
  /** 가입 마무리(가구 연결·구성원 확보) 뒤 시트·홈 정리. */
  async function acctSignupTail(intent) {
    try {
      localStorage.setItem(ACCT_INTENT_KEY, JSON.stringify(intent));
    } catch (e) {}
    acctSplashHold(); // G19: 가입 직후 홈이 그려질 때까지 중립 화면(가구 생성·accounts 쓰기가 느려도 view-landing 이 비치지 않게)
    let fin;
    try {
      fin = acct.sync ? await acctFinishSignup(intent, true) : { ok: true };
    } catch (e) {
      fin = { ok: false };
    }
    acct.busy = false;
    if (!fin.ok) { acctSplashRelease(); return acctShowSheet(acct.mode === "slot" ? "signup" : undefined); }
    acct.form = {};
    acct.notice = null; // D5: 가입 직후 "가입했어요" 안내는 정보 가치가 낮아 없앤다
    closeDetail();
    acctRenderLanding();
    acctRenderSlot();
    try {
      if (typeof acctGoHome === "function") await acctGoHome(); // G16: 가입 직후에도 첫 화면(아이 입력 폼)에 남지 않고 홈/빈 홈으로
    } finally {
      acctSplashRelease();
    }
    acctMaybeShowMigrate();
  }
  async function acctOnClick(ev) {
    if (!acctEnabled()) return;
    const radio = ev.target.closest("[data-acct-radio]");
    if (radio) {
      acct.form[radio.getAttribute("data-acct-radio")] = radio.getAttribute("data-value");
      AccountView.syncForm(acct.form, regionsData && regionsData.provinces); // 자녀 유무가 바뀌면 맞지 않는 역할 선택을 지운다
      return acctShowSheet();
    }
    const b = ev.target.closest("[data-acct-action]");
    if (!b || acct.busy) return;
    const action = b.getAttribute("data-acct-action");
    if (action === "slide-go") return acctGoSlide(el("acct-landing-slot"), Number(b.getAttribute("data-slide-to")) || 0);
    if (action === "open-signup" || action === "open-login" || action === "open-join") {
      acct.mode = action === "open-login" ? "login" : "signup";
      acct.form = action === "open-join" ? { join: true, step: 2 } : {}; // 합류는 가족코드(2단계)부터 // G1: 가족 코드로 함께하기 = 가입 시트의 합류 모드(코드 칸 포커스)
      acct.joinFocus = action === "open-join";
      acct.errors = {};
      acct.error = null;
      acct.notice = null;
      return acctShowSheet();
    }
    if (action === "next-step" || action === "prev-step") { // G7: 가입 폼 3단계 — 다음은 이 단계의 필드만 검증한다
      const cur = AccountView.signupStep(acct.form);
      if (action === "prev-step") {
        acct.form.step = Math.max(1, cur - 1);
        acct.errors = {};
        return acctShowSheet();
      }
      const v = AccountView.validateSignup(acct.form, new Date(), regionsData && regionsData.provinces);
      const keys = AccountView.signupStepKeys(acct.form, cur);
      acct.errors = Object.fromEntries(Object.entries(v.errors).filter(([k]) => keys.includes(k)));
      acct.error = null;
      if (!Object.keys(acct.errors).length) acct.form.step = Math.min(AccountView.signupTotal(acct.form), cur + 1);
      return acctShowSheet();
    }
    if (action === "join-off") {
      acct.form.join = false;
      acct.form.familyCode = "";
      acct.errors = {};
      return acctShowSheet("signup");
    }
    if (action === "browse" || action === "browse-close") {
      acctBrowse = action === "browse";
      return acctApplyLandingMode();
    }
    if (action === "beta-off-ask") return; // G18: 베타 끄기는 계정 모드에서 없앴다
    if (action === "close") return closeDetail();
    if (action === "logout" || action === "confirm-logout") { // P1: 확인 시트 없이 바로 로그아웃(서버 데이터는 지우지 않는다)
      // 가입 의도는 가구 연결이 끝난 계정에서만 지운다. 연결이 안 끝났으면(일시 오류 등) 남겨 두어 다시 로그인할 때 이어서 연결한다.
      const linked = await acctIsLinked(acct.user && acct.user.uid);
      // D4: 이 기기 가구가 이 계정의 가구면, 로그아웃 전에 대기열을 한 번 더 보내 보고 로그아웃 뒤 이 기기의 가구 연결을 정리한다(다른 계정 로그인 시 혼선 방지).
      const own = !!(hh.hid && hh.code && acct.account && acct.account.householdCode === hh.code);
      // G17: 서버에 아직 못 올린 변경(대기열)이 남았거나 보내기에 실패하면 이 기기 데이터를 지우지 않는다(유실 방지). 주인(owner uid)은 남겨 다른 계정이 로그인하면 그때 비운다.
      let unsynced = false;
      if (hh.hid) {
        try {
          await HouseholdSync.flush(hh.hid);
        } catch (e) {
          unsynced = true;
        }
        try {
          if (typeof HouseholdSync.getStatus === "function" && HouseholdSync.getStatus(hh.hid).pending > 0) unsynced = true;
        } catch (e) {}
      }
      const r = await acct.svc.signOut();
      if (!r.ok) {
        acct.mode = "login";
        acct.error = r.message || AuthService.MSG.generic;
        return acctShowSheet();
      }
      // 정리 범위: 가구 id·코드·미러·대기열·이 기기 사용자 키만. 아이·완료·기록·사진은 그대로 둔다.
      // P1: 계정 모드에서는 이 기기의 가구 연결을 계정 가구와 같든 다르든 모두 정리한다(로그아웃한 계정의 가구가 다음 사람 화면에 남지 않게).
      if (hh.hid && !unsynced) {
        try {
          hhLeaveLocal();
        } catch (e) {
          console.error("로그아웃 후 가구 정리 실패", e);
        }
        hhRender();
      }
      if (!unsynced && typeof acctWipeLocalChild === "function") {
        acctWipeLocalChild(); // G17: 로그아웃하면 이 기기의 아이 데이터도 비운다(다음 사람 화면에 남지 않게)
        acctOwnerWrite(null);
      }
      if (linked) acctClearIntent();
      acctSignedOutMark(true); // 오프라인으로 다시 열어도 첫 화면이 나오게 이 기기에 표시를 남긴다(로그인하면 지운다)
      acct.user = null;
      acct.account = null;
      acct.migrate = null;
      us.selection = [];
      us.selTouched = false;
      // P1: 로그아웃하면 아이가 있어도 곧바로 첫 화면(온보딩)으로 간다(예전엔 아이 없는 홈에서만 이동해 캘린더가 그대로 남았다).
      hideEmptyHome();
      acctBrowse = false;
      acct.recoverShown = false;
      acct.form = {};
      acct.notice = AccountView.MSG.loggedOut;
      closeDetail();
      showLandingView();
      acctRenderLanding();
      acctRenderSlot();
      acctRefreshCalendar();
      return;
    }
    if (action === "migrate-add" || action === "migrate-keep") {
      const mg = acct.migrate;
      if (!mg) return closeDetail();
      const add = action === "migrate-add";
      acct.busy = true;
      acct.error = null;
      acctShowSheet("migrate");
      let ok = true;
      try {
        if (mg.switchTo) ok = await acctSwitchHousehold(mg.switchTo);
        if (ok && add) {
          const m = HouseholdSync.getMirror(hh.hid);
          ok = (await acctLinkKids(hh.hid, acctDeviceKids().filter((k) => !HouseholdView.isChildLinked(m, k.code)))).ok;
        }
      } catch (e) {
        console.error("기기 데이터 이전 실패", e);
        ok = false;
      }
      acct.busy = false;
      if (!ok) {
        acct.error = AccountView.MSG.migrateFail;
        return acctShowSheet("migrate");
      }
      if (!add) {
        try {
          localStorage.setItem(ACCT_KEPT_KEY, JSON.stringify([...new Set([...acctReadKept(), ...acctDeviceKids().map((k) => k.code)])]));
        } catch (e) {}
      }
      acct.migrate = null;
      acct.notice = add ? AccountView.MSG.migrateAdded : AccountView.MSG.migrateKept;
      closeDetail();
      acctRenderSlot();
      hhRender();
      acctRefreshCalendar();
      return;
    }
    if (action === "empty-register") {
      closeDetail();
      return beginNewChildEntry(); // 기존 아이 입력 흐름(임신 중 선택 포함)
    }
    if (action === "empty-me") {
      acct.notice = null;
      return acctShowSheet("me");
    }
    if (action === "copy-invite" || action === "copy-me") {
      try {
        await navigator.clipboard.writeText(hh.code || "");
        acct.notice = AccountView.MSG.inviteCopied;
      } catch (e) {
        acct.notice = null;
      }
      if (action === "copy-me" && el("acct-slot")) return acctRenderSlot(); // 프로필 시트 안: 시트를 바꾸지 않고 그 자리에서 복사 안내
      return acctShowSheet(action === "copy-me" ? "me" : "invite");
    }
    if (action === "open-invite") return acctOpenInvite();
    if (action === "send-invite") return acctSendInvite();
    if (action === "open-recover") {
      acct.form = {};
      acct.errors = {};
      acct.error = null;
      acct.joining = false;
      return acctShowSheet("recover");
    }
    if (action === "recover-join-open" || action === "recover-back") {
      acct.joining = action === "recover-join-open";
      acct.errors = {};
      acct.error = null;
      return acctShowSheet("recover");
    }
    if (action === "recover-new" || action === "recover-join") {
      const joining = action === "recover-join";
      const v = AccountView.validateRecover({ ...acct.form, email: acct.user && acct.user.email }, joining);
      acct.errors = v.errors;
      acct.error = null;
      if (!v.ok) return acctShowSheet("recover");
      acct.busy = true;
      acctShowSheet("recover");
      if (joining) {
        let look;
        try {
          look = await HouseholdSync.lookupHousehold(v.intent.joiningCode);
        } catch (e) {
          look = { ok: false, reason: ACCT_DENIED(e) ? "denied" : "network" };
        }
        if (!look.ok) {
          acct.busy = false;
          acct.errors = { familyCode: look.reason === "not-found" ? AuthService.MSG.codeNotFound : look.reason === "denied" ? AuthService.MSG.serverNotReady : AuthService.MSG.network };
          return acctShowSheet("recover");
        }
      }
      const fin = await acctFinishSignup(v.intent, false);
      acct.busy = false;
      if (!fin.ok) return acctShowSheet("recover");
      acct.form = {};
      acct.joining = false;
      acct.notice = AccountView.MSG.recoverDone;
      closeDetail();
      acctRenderSlot();
      acctMaybeShowMigrate();
      return;
    }
    if (action === "submit-signup") {
      const v = AccountView.validateSignup(acct.form, new Date(), regionsData && regionsData.provinces);
      acct.errors = v.errors;
      acct.error = null;
      if (!v.ok) {
        acct.form.step = AccountView.firstErrorStep(acct.form, v.errors) || AccountView.signupStep(acct.form); // 앞 단계 오류가 있으면 그 단계로 되돌린다
        return acctShowSheet();
      }
      acct.busy = true;
      acctShowSheet();
      // 코드 사전 확인(읽기만): 잘못된 코드면 계정을 만들기 전에 막는다(신규 가족으로 몰래 만들지 않는다).
      if (v.intent.joiningCode) {
        let look;
        try {
          look = await HouseholdSync.lookupHousehold(v.intent.joiningCode);
        } catch (e) {
          look = { ok: false, reason: ACCT_DENIED(e) ? "denied" : "network" };
        }
        if (!look.ok) {
          acct.busy = false;
          acct.errors = { familyCode: look.reason === "not-found" ? AuthService.MSG.codeNotFound : look.reason === "denied" ? AuthService.MSG.serverNotReady : AuthService.MSG.network };
          acct.form.step = AccountView.firstErrorStep(acct.form, acct.errors) || 2; // 코드 오류는 가족코드 단계에서 보인다
          return acctShowSheet();
        }
      }
      const r = await acct.svc.signUp({ email: acct.form.email, password: acct.form.password, displayName: acct.form.displayName });
      if (!r.ok) {
        acct.busy = false;
        acct.error = r.message || AuthService.MSG.generic;
        acct.form.step = 1; // 이메일 중복 등 계정 오류는 1단계에서 고친다
        return acctShowSheet();
      }
      acct.user = r.user;
      // H2: 가족코드로 합류하면 가입하지 않은 자리 목록을 보여 준다(하나면 자동 선택, 없으면 기존처럼 직접 고른 역할).
      if (v.intent.joiningCode && acct.sync && !v.intent.memberRole) { // 초대 링크(memberRole)는 역할로 빈 자리를 바로 차지하므로 자리 선택을 건너뛴다
        let slots = [];
        try {
          const j = await HouseholdSync.peekMembers(v.intent.joiningCode); // 읽기 전용(저장된 가구 코드·미러를 바꾸지 않는다)
          if (j && j.ok) slots = AccountSync.openSlots(j.members);
        } catch (e) {
          slots = []; // 읽기에 실패하면 자리 선택 없이 기존 흐름으로 합류한다
        }
        acct.slotPick = { intent: v.intent, slots };
        acct.busy = false;
        if (slots.length) return acctShowSheet("slot"); // 하나여도 확인을 받는다([합류하기] / [다른 역할로])
        return acctShowSheet("role"); // 자리가 없으면 역할을 직접 고른다
      }
      return acctSignupTail(v.intent);
    }
    if (action === "pick-slot") {
      const sp = acct.slotPick;
      if (!sp) return;
      const slot = sp.slots.find((x) => x.memberId === b.getAttribute("data-slot-id"));
      if (!slot) { // [다른 역할로]·[목록에 없어요]: 역할을 직접 고른다
        acct.errors = {};
        return acctShowSheet("role");
      }
      acctApplySlot(sp.intent, slot);
      acct.slotPick = null;
      acct.busy = true;
      acctShowSheet("slot");
      return acctSignupTail(sp.intent);
    }
    if (action === "role-continue") {
      const sp = acct.slotPick;
      if (!sp) return;
      if (!AccountView.ROLES.some(([k]) => k === acct.form.role)) {
        acct.errors = { role: AccountView.MSG.errRole };
        return acctShowSheet("role");
      }
      sp.intent.role = acct.form.role;
      acct.slotPick = null;
      acct.busy = true;
      acctShowSheet("role");
      return acctSignupTail(sp.intent);
    }
    if (action === "submit-login") {
      const v = AccountView.validateLogin(acct.form);
      acct.errors = v.errors;
      acct.error = null;
      acct.notice = null;
      if (!v.ok) return acctShowSheet();
      acct.busy = true;
      acctShowSheet();
      const r = await acct.svc.signIn({ email: acct.form.email, password: acct.form.password });
      acct.busy = false;
      if (!r.ok) {
        acct.error = r.message || AuthService.MSG.generic;
        return acctShowSheet();
      }
      acct.user = r.user;
      acct.form = {};
      acct.notice = AccountView.MSG.loginDone;
      closeDetail();
      acctRenderLanding();
      acctRenderSlot();
      acctLoginRestore(r.user); // 로그인 중에는 onChange 의 복원이 건너뛰어지므로(busy) 끝난 뒤 한 번 직접 실행한다(G16: 끝날 때까지 중립 화면)
      return;
    }
    if (action === "reset-password") {
      const email = String(acct.form.email || "").trim();
      acct.error = null;
      acct.notice = null;
      if (!email) {
        acct.errors = { email: AccountView.MSG.errEmailEmpty };
        return acctShowSheet();
      }
      acct.busy = true;
      acctShowSheet();
      const r = await acct.svc.sendPasswordReset(email);
      acct.busy = false;
      acct.errors = {};
      if (r.ok) acct.notice = r.message;
      else acct.error = r.message || AuthService.MSG.generic;
      return acctShowSheet();
    }
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
    el("btn-new-child-cancel").addEventListener("click", cancelNewChildEntry);
    el("modal-backdrop").addEventListener("click", closeDetail);
    // 모든 팝업 오른쪽 위에 ✕ 닫기 버튼을 달고, 맨 아래의 "닫기" 버튼은 숨긴다(내용이 바뀔 때마다 적용).
    const ensureModalX = () => {
      const box = el("modal-content");
      if (!box.querySelector(".modal-x")) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "modal-x";
        b.setAttribute("aria-label", "닫기");
        b.textContent = "✕";
        b.addEventListener("click", closeDetail);
        box.prepend(b);
      }
      box.querySelectorAll("button.btn-close").forEach((btn) => {
        if (btn.textContent.trim() === "닫기") btn.classList.add("hidden");
      });
    };
    new MutationObserver(ensureModalX).observe(el("modal-content"), { childList: true });
    el("btn-prev-month").addEventListener("click", () => {
      if (calWeekOn()) return usWeekShift(-1);
      viewMonth.setMonth(viewMonth.getMonth() - 1);
      renderCalendar();
    });
    el("btn-next-month").addEventListener("click", () => {
      if (calWeekOn()) return usWeekShift(1);
      viewMonth.setMonth(viewMonth.getMonth() + 1);
      renderCalendar();
    });

    // 대시보드 내비게이션 — 하단 탭 4개(홈·캘린더·기록·지원금). 상단 세그먼트 탭은 없앴다(중복 내비게이션).
    document.querySelectorAll(".nav-item").forEach((btn) => btn.addEventListener("click", () => switchTab(btn.dataset.nav)));
    el("btn-todos-back").addEventListener("click", () => switchTab("home"));
    el("btn-scope-clear").addEventListener("click", () => {
      checklistScope = null;
      checklistStatus = "all";
      openMonthGroups = null;
      renderChecklistTab();
    });
    document.querySelectorAll("#status-filter-checklist .sf-btn").forEach((btn) =>
      btn.addEventListener("click", () => {
        checklistStatus = btn.dataset.status;
        renderChecklistTab();
      })
    );
    el("btn-profile-card").addEventListener("click", showProfileSheet);
    if (el("cal-todo-slot")) el("cal-todo-slot").addEventListener("click", calTodoOnClick);
    applyTabLayout();
    previewRender();
    if (el("places-body")) el("places-body").addEventListener("click", placesOnClick);
    if (el("btn-record-back")) el("btn-record-back").addEventListener("click", () => switchTab(recordReturnTab || "home"));
    el("btn-add-child").addEventListener("click", showAddMenuSheet);
    setupRefreshButton();

    profile = loadProfile();
    familyCode = FamilySync.getSavedCode();
    HNRecords.use(familyCode);
    HNRecords.onChange(() => {
      if (!profile || el("view-calendar").classList.contains("hidden")) return;
      renderHome();
      renderRecordTab();
    });

    if (familyCode) {
      try {
        const data = await FamilySync.fetchFamily(familyCode);
        if (data && data.profile) {
          // 사진은 서버(가족 문서)가 기준이다 — 다른 기기에서 바꾸거나 지운 사진이 그대로 반영된다.
          // 예외: 서버 프로필에 사진 필드 자체가 없는 예전 데이터(삭제는 null로 기록됨)일 때만, 이 기기에만 있던 사진을 올려 공유한다.
          const localPhoto = profile && profile.photoDataUrl;
          const serverHasPhotoField = data.profile.photoDataUrl !== undefined;
          profile = profileFromPlain(data.profile);
          if (!serverHasPhotoField && !profile.photoDataUrl && localPhoto) {
            profile.photoDataUrl = localPhoto;
            pushProfileToFamily();
          }
          completed = data.completed || {};
          saveProfile(profile);
          saveCompleted();
          HNRecords.mergeRemote(data.records);
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
    betaOpenSlot("beta-landing-slot", "renderBetaSwitchLanding");
    hhInit();
    usInit();
    acctInit();

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
      if (typeof acctGateHome === "function") acctGateHome(); // 인증 확인이 렌더보다 먼저 끝난 경우(로그아웃 상태)도 첫 화면으로
    }
  }

  init();
})();
