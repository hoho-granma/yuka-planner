/*
 * places-view — 어디갈까(S8) 탭 마크업 문자열 생성(순수, DOM 없음). js/places.js(window.Places) 다음에 로드한다.
 * 설계: docs/한눈육아-F0-최종-서비스-설계.md §7. 표기는 "편집 추천"만(가짜 인기·순위 표기 금지 — 조사지침 §1).
 *
 * 이벤트 위임용 속성(app.js 가 연결):
 *   data-places-cat="ALL|PARK|…"   분류 칩
 *   data-places-add="<id>"          [일정 추가] 버튼 → scheduleDraftFor(place) 로 일정 폼 초기값
 *   data-places-filter / -drive / -sort  필터 시트 안 칩(app.js 가 상태를 바꾸고 다시 그린다)
 *   data-places-sheet="open|close"  필터 시트 열기·닫기 — 이 파일이 문서 클릭 위임으로 직접 처리(app.js 연결 불필요)
 *   data-places-remove="drive|indoor|free|noReserve|all"  고른 조건 지우기 — 시트 안 해당 칩을 대신 눌러 app.js 경로를 그대로 탄다
 */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory(require("./places.js"));
  else root.PlacesView = factory(root.Places);
})(typeof window !== "undefined" ? window : global, function (Places) {
  "use strict";

  const TEXT = Object.freeze({
    empty: "조건에 맞는 곳이 없어요. 필터를 줄여 보세요.",
    emptyCategory: "이 분류에는 조건에 맞는 곳이 없어요. 다른 분류를 골라 보세요.",
    emptyFilter: "조건에 맞는 곳이 없어요. 필터를 줄여 보세요.",
    filterIndoor: "실내",
    filterFree: "무료",
    filterNoReserve: "예약 없이",
    filterLabel: "보조 필터",
    // P3 거리·정렬
    driveLabel: "거리",
    driveAll: "전체",
    driveChip: { 30: "30분 이내", 60: "1시간 이내", 90: "1시간 30분 이내" },
    sortLabel: "정렬",
    sortNear: "가까운순",
    sortPopular: "인기순",
    noOrigin: "프로필에서 지역을 정하면 거리로 볼 수 있어요",
    driveBasis: (name) => `${name}에서 차로 걸리는 시간(직선거리로 추정)`,
    driveTime: (min) => `차로 약 ${min}분`,
    driveNote: (min, name) => `차로 약 ${min}분 · ${name} 기준`,
    source: "거리: 직선거리로 추정한 차량 이동 시간 · 위치 © OpenStreetMap contributors",
    // G14 필터 시트
    filterBtn: "필터",
    sheetTitle: "필터",
    condLabel: "조건",
    activeLabel: "고른 조건",
    clearAll: "모두 지우기",
    driveRemove: (label) => `차로 ${label}`,
    removeAria: (label) => `${label} 조건 지우기`,
    count: (n) => `${n}곳`,
    countBasis: (name) => `${name}에서 차로(직선거리로 추정)`,
    showResults: (n) => `${n}곳 보기`,
    estimated: "직선거리로 추정",
    notice: "방문 전 공식 링크에서 운영 여부를 확인하세요",
    unknown: "방문 전 확인",
    stale: "확인 오래됨",
    example: "예시",
    add: "일정 추가",
    link: "공식 링크",
    change: "바꾸기",
    // G2 장소 상세 시트·일정 등록
    copy: "주소 복사",
    copied: "복사했어요",
    homepage: "공식 홈페이지",
    map: "지도에서 보기",
    route: "길찾기",
    register: "일정 등록하기",
    needHousehold: "가족 캘린더를 만들면 일정으로 등록할 수 있어요",
    reservationRequired: "예약이 필요한 곳이에요. 공식 홈페이지에서 먼저 예약하세요.",
    reservationPartly: "일부는 예약이 필요해요. 공식 홈페이지에서 확인하세요.",
    regTitle: "일정 등록",
    dateLabel: "날짜",
    timeLabel: "시간",
    allDay: "종일",
    startLabel: "시작",
    endLabel: "끝 (선택)",
    assigneeLabel: "담당",
    targetLabel: "대상",
    targetFamily: "가족 전체",
    save: "캘린더에 등록",
    saving: "등록하는 중이에요…",
    back: "뒤로",
    close: "닫기",
    saveFail: "일정을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.",
    viewCalendar: "캘린더에서 보기",
    registered: (label) => `${label} 캘린더에 등록했어요`,
    memoPrefix: "공식 홈페이지: ",
    mapBase: "https://map.kakao.com/link/search/",
    routeBase: "https://map.kakao.com/link/to/",
  });
  const DOW = Object.freeze(["일", "월", "화", "수", "목", "금", "토"]);
  const pad2 = (n) => String(n).padStart(2, "0");
  const isoOf = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const dateOfIso = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || "")); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; };
  /** 다가오는 토요일(오늘이 토요일이면 오늘)의 YYYY-MM-DD. today: Date. */
  function defaultVisitDate(today) {
    const t = today instanceof Date && !isNaN(today.getTime()) ? today : new Date();
    const add = (6 - t.getDay() + 7) % 7;
    return isoOf(new Date(t.getFullYear(), t.getMonth(), t.getDate() + add));
  }
  /** "2026-10-10" → "10/10(토)". 잘못된 값은 "". */
  function dateLabel(iso) {
    const d = dateOfIso(iso);
    return d ? `${d.getMonth() + 1}/${d.getDate()}(${DOW[d.getDay()]})` : "";
  }
  /** 지도 검색 링크(키·SDK 없이 링크만): 주소가 있으면 주소, 없으면 시·도·시군구·이름으로 검색. */
  function mapUrl(place) {
    const p = place || {};
    const q = p.address || [p.province, p.district, p.name].filter((x) => typeof x === "string" && x).join(" ");
    return TEXT.mapBase + encodeURIComponent(q);
  }
  /** 카카오맵 길찾기(웹 링크, 앱 키 없음): https://map.kakao.com/link/to/{장소명},{lat},{lng}. 좌표가 없으면 "". */
  function routeUrl(place) {
    const p = place || {};
    const ok = (v) => typeof v === "number" && Number.isFinite(v);
    if (!ok(p.lat) || !ok(p.lng) || typeof p.name !== "string" || !p.name.trim()) return "";
    return `${TEXT.routeBase}${encodeURIComponent(p.name.trim().replace(/,/g, " "))},${p.lat},${p.lng}`;
  }
  /** 일정 메모: 공식 홈페이지 주소(https 만). 없으면 "". */
  function memoFor(place) {
    return place && Places.isHttpsUrl(place.officialUrl) ? (TEXT.memoPrefix + place.officialUrl).slice(0, 500) : "";
  }

  /** 일정 문서 길이 제한(js/user-schedule.js LIMITS.titleMax·locationMax 와 같은 값). */
  const SCHEDULE_LIMITS = Object.freeze({ titleMax: 100, locationMax: 100 });

  function esc(v) {
    return String(v === null || v === undefined ? "" : v)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  /** 권장 나이 라벨. null 이면 null(호출부에서 "방문 전 확인"). */
  function ageText(a) {
    if (!a || typeof a !== "object") return null;
    const min = typeof a.min === "number" ? a.min : null;
    const max = typeof a.max === "number" ? a.max : null;
    const yrs = max !== null && max >= 71 && (max + 1) % 12 === 0 ? `만 ${(max + 1) / 12}세 미만` : null; // 개월 끝(167·131·71)은 '만 N세 미만'으로 — '167개월까지'를 부모가 나이로 바꿔 읽지 않게(12 의 배수 − 1 만)
    if (min !== null && max !== null) return min === max ? `${min}개월` : yrs ? `${min}개월~${yrs}` : `${min}~${max}개월`;
    if (min !== null) return `${min}개월 이상`;
    if (max !== null) return yrs || `${max}개월까지`;
    return null;
  }
  const lookup = (map, v) => (v !== null && v !== undefined && Object.prototype.hasOwnProperty.call(map, v) ? map[v] : null);

  /** counts: { 분류키: 개수 }(주면 개수 0인 분류 칩은 숨긴다 — 지금 고른 분류와 '전체'는 항상 둔다). */
  function chipRow(category, counts) {
    const cur = category && Object.prototype.hasOwnProperty.call(Places.CATEGORIES, category) ? category : "ALL";
    const chips = [["ALL", "전체"]].concat(Places.CATEGORY_KEYS.filter((k) => !counts || k === cur || (counts[k] || 0) > 0).map((k) => [k, Places.CATEGORIES[k]]));
    return (
      `<div class="places-chips" role="group" aria-label="장소 분류">` +
      chips
        .map(([k, label]) => `<button type="button" class="places-chip${k === cur ? " active" : ""}" aria-pressed="${k === cur ? "true" : "false"}" data-places-cat="${esc(k)}">${esc(label)}</button>`)
        .join("") +
      `</div>`
    );
  }

  const chipBtn = (attrs, label, active) => `<button type="button" class="places-chip${active ? " active" : ""}" aria-pressed="${active ? "true" : "false"}" ${attrs}>${esc(label)}</button>`;
  function filterRow(filters, showNoReserve) {
    const f = filters || {};
    const items = [["indoor", TEXT.filterIndoor], ["free", TEXT.filterFree]].concat(showNoReserve ? [["noReserve", TEXT.filterNoReserve]] : []);
    return `<div class="places-filters" role="group" aria-label="${esc(TEXT.filterLabel)}">${items.map(([k, label]) => `<button type="button" class="places-chip places-filter${f[k] === true ? " active" : ""}" aria-pressed="${f[k] === true ? "true" : "false"}" data-places-filter="${k}">${esc(label)}</button>`).join("")}</div>`;
  }
  /** P3 거리 칩 줄(+기준 한 줄·기준점 없음 안내). o: { origin, driveMax(null|30|60|90) }. 기준점이 없으면 30/60/90 은 비활성. */
  function driveRow(o) {
    const has = !!o.origin;
    const dis = has ? "" : " disabled";
    const cur = typeof o.driveMax === "number" ? o.driveMax : null;
    const drive = [[null, TEXT.driveAll]].concat(Places.DRIVE_CHOICES.map((m) => [m, TEXT.driveChip[m]]))
      .map(([m, label]) => `<button type="button" class="places-chip places-drive-chip${(m === cur || (m === null && !has)) ? " active" : ""}" aria-pressed="${m === cur ? "true" : "false"}" data-places-drive="${m === null ? "all" : m}"${m === null ? "" : dis}>${esc(label)}</button>`).join("");
    const basis = has ? `<p class="fine-print places-drive-basis">${esc(TEXT.driveBasis(o.origin.name))}</p>` : ""; // D1: 거리 칩 위 기준 한 줄(기준점이 없으면 숨기고 아래 비활성 안내만)
    return `${basis}<div class="places-drive-row" role="group" aria-label="${esc(TEXT.driveLabel)}">${drive}</div>${has ? "" : `<p class="places-origin-hint">${esc(TEXT.noOrigin)}</p>`}`;
  }
  /** P3 정렬 칩 줄. 기준점이 없으면 가까운순은 비활성. */
  function sortRow(o) {
    const has = !!o.origin;
    const dis = has ? "" : " disabled";
    const sort = o.sort === "popular" ? "popular" : "near";
    const sorts = [["near", TEXT.sortNear, dis], ["popular", TEXT.sortPopular, ""]]
      .map(([k, label, d]) => `<button type="button" class="places-chip places-sort-chip${(has ? sort === k : k === "popular" && sort === "popular") ? " active" : ""}" aria-pressed="${sort === k ? "true" : "false"}" data-places-sort="${k}"${d}>${esc(label)}</button>`).join("");
    return `<div class="places-sort-row" role="group" aria-label="${esc(TEXT.sortLabel)}">${sorts}</div>`;
  }
  /** 거리·정렬 칩(이전 이름 유지 — 거리 줄 + 정렬 줄). */
  function driveRows(o) {
    return driveRow(o) + sortRow(o);
  }

  // G14: 필터 시트(분류 한 줄 + [필터 N] 버튼, 고른 조건은 지울 수 있는 칩).
  // 시트 열림 상태는 이 모듈이 들고 있다 — app.js 가 필터를 누를 때마다 목록을 다시 그려도(render) 시트가 열린 채로 남는다.
  const ui = { sheetOpen: false };
  /** 켜진(기본값이 아닌) 조건 목록: [{ key, label }]. key 는 data-places-remove 값. 정렬은 거르지 않으므로 세지 않는다. */
  function activeConds(o) {
    const f = o.filters || {};
    const out = [];
    if (o.origin && typeof o.driveMax === "number" && TEXT.driveChip[o.driveMax]) out.push({ key: "drive", label: TEXT.driveRemove(TEXT.driveChip[o.driveMax]) });
    if (f.indoor === true) out.push({ key: "indoor", label: TEXT.filterIndoor });
    if (f.free === true) out.push({ key: "free", label: TEXT.filterFree });
    if (f.noReserve === true && o.showNoReserve === true) out.push({ key: "noReserve", label: TEXT.filterNoReserve });
    return out;
  }
  /** 지울 수 있는 조건 칩을 누르면 시트 안의 해당 칩을 대신 누른다(app.js 의 기존 data-places-drive/-filter 처리를 그대로 쓴다). */
  const REMOVE_TARGET = Object.freeze({ drive: '[data-places-drive="all"]', indoor: '[data-places-filter="indoor"]', free: '[data-places-filter="free"]', noReserve: '[data-places-filter="noReserve"]' });
  const FILTER_ICON = '<svg width="14" height="14" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="M1.5 3h9M3 6h6M4.5 9h3"/></svg>';
  function filterBar(o, conds) {
    const n = conds.length;
    const btn = `<button type="button" class="places-filter-btn${n ? " on" : ""}" data-places-sheet="open" aria-haspopup="dialog" aria-expanded="${o.sheetOpen ? "true" : "false"}" aria-controls="places-sheet">${FILTER_ICON}${esc(TEXT.filterBtn)}${n ? `<em>${n}</em>` : ""}</button>`;
    return `<div class="places-topline">${chipRow(o.category, o.catCounts)}${btn}</div>`;
  }
  function activeRow(conds) {
    if (!conds.length) return "";
    return `<div class="places-active" role="group" aria-label="${esc(TEXT.activeLabel)}">${conds.map((c) => `<button type="button" class="places-active-chip" data-places-remove="${c.key}" aria-label="${esc(TEXT.removeAria(c.label))}">${esc(c.label)}<span aria-hidden="true">×</span></button>`).join("")}<button type="button" class="places-clear" data-places-remove="all">${esc(TEXT.clearAll)}</button></div>`;
  }
  function sortLabelOf(o) {
    if (o.sort === "popular") return TEXT.sortPopular;
    return o.origin ? TEXT.sortNear : TEXT.sortLabel;
  }
  function countRow(o, n) {
    const basis = o.origin ? `<span class="places-count-basis"> · ${esc(TEXT.countBasis(o.origin.name))}</span>` : "";
    return `<div class="places-count"><span class="places-count-main"><strong>${esc(TEXT.count(n))}</strong>${basis}</span><button type="button" class="places-sort-btn" data-places-sheet="open" aria-haspopup="dialog">${esc(sortLabelOf(o))}<span aria-hidden="true">▾</span></button></div>`;
  }
  function filterSheet(o, conds, n) {
    const sec = (title, inner) => `<div class="places-sheet-sec"><h4>${esc(title)}</h4>${inner}</div>`;
    return (
      `<div class="places-sheet" id="places-sheet" role="dialog" aria-modal="true" aria-label="${esc(TEXT.sheetTitle)}">` +
      `<div class="places-sheet-dim" data-places-sheet="close"></div>` +
      `<div class="places-sheet-panel"><div class="places-sheet-grip" aria-hidden="true"></div>` +
      `<div class="places-sheet-head"><strong>${esc(TEXT.sheetTitle)}</strong><button type="button" class="places-sheet-x" data-places-sheet="close" aria-label="${esc(TEXT.close)}">✕</button></div>` +
      sec(TEXT.driveLabel, driveRow(o)) +
      sec(TEXT.sortLabel, sortRow(o)) +
      sec(TEXT.condLabel, filterRow(o.filters, o.showNoReserve === true)) +
      `<div class="places-sheet-foot">${conds.length ? `<button type="button" class="places-sheet-clear" data-places-remove="all">${esc(TEXT.clearAll)}</button>` : ""}<button type="button" class="places-sheet-go" data-places-sheet="close">${esc(TEXT.showResults(n))}</button></div>` +
      `</div></div>`
    );
  }
  function metaItem(label, value) {
    const known = value !== null && value !== undefined && value !== "";
    return `<li class="places-meta-item${known ? "" : " unknown"}"><span class="places-meta-label">${esc(label)}</span><span class="places-meta-value">${esc(known ? value : TEXT.unknown)}</span></li>`;
  }

  // G7: 큰 카드 머리 영역(사진 데이터가 없어 분류별 색 + 선 아이콘으로 대신한다)
  const PH_ICON = {
    PARK: '<circle cx="12" cy="9" r="5"/><path d="M12 14v7M9 21h6"/>',
    LIBRARY: '<path d="M4 5.5C4 4.7 4.7 4 5.5 4H11v15H5.5C4.7 19 4 18.3 4 17.5zM20 5.5c0-.8-.7-1.5-1.5-1.5H13v15h5.5c.8 0 1.5-.7 1.5-1.5z"/>',
    KIDSCAFE: '<path d="M5 11h14v3a7 7 0 0 1-14 0zM19 12h1.5a2 2 0 0 1 0 4H18M8 4v3M12 4v3M16 4v3"/>',
    EXPERIENCE: '<path d="M12 3l2.6 5.6 6 .8-4.4 4.2 1.1 6L12 16.7 6.7 19.6l1.1-6L3.4 9.4l6-.8z"/>',
    EDU: '<path d="M3 9l9-5 9 5-9 5zM7 11.5V16c0 1.5 2.2 3 5 3s5-1.5 5-3v-4.5"/>',
    MUSEUM: '<path d="M3 9l9-5 9 5zM5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18"/>',
    INDOOR: '<path d="M4 11l8-7 8 7v9H4zM10 20v-5h4v5"/>',
  };
  function renderCard(p, today, origin) {
    const stale = Places.isStale(p, today);
    const badges = [`<span class="places-badge places-badge-cat">${esc(lookup(Places.CATEGORIES, p.category) || "")}</span>`];
    if (typeof p.district === "string" && p.district) badges.push(`<span class="places-badge places-badge-district">${esc(p.district)}</span>`); // G4: 시·군·구 작은 표기
    if (p.example === true) badges.push(`<span class="places-badge places-badge-example">${esc(TEXT.example)}</span>`);
    if (stale) badges.push(`<span class="places-badge places-badge-stale">${esc(TEXT.stale)}</span>`);
    const link = Places.isHttpsUrl(p.officialUrl)
      ? `<a class="places-link" href="${esc(p.officialUrl)}" target="_blank" rel="noopener noreferrer">${esc(TEXT.link)}</a>`
      : "";
    const min = origin ? Places.driveMinFrom(p, origin) : null;
    const where = [p.province, p.district].filter((s) => typeof s === "string" && s).join(" ");
    const cat = Object.prototype.hasOwnProperty.call(PH_ICON, p.category) ? p.category : "PARK";
    const tm = min === null ? "" : `<span class="places-ph-tm">${esc(TEXT.driveTime(Math.max(1, min)))}</span>`;
    return (
      `<article class="places-card places-card-big" data-places-id="${esc(p.id)}" data-places-open="${esc(p.id)}">` +
      `<div class="places-ph places-ph-${cat.toLowerCase()}" aria-hidden="false">` +
      `<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PH_ICON[cat]}</svg>` +
      `<div class="places-badges places-ph-pin">${badges.join("")}</div>${tm}</div>` +
      `<div class="places-card-bd">` +
      `<h3 class="places-name">${esc(p.name)}</h3>` +
      (p.summary ? `<p class="places-summary">${esc(p.summary)}</p>` : "") +
      (typeof p.notice === "string" && p.notice ? `<p class="places-card-notice">${esc(p.notice)}</p>` : "") +
      (p.address || where ? `<p class="places-address">${esc(p.address || where)}</p>` : "") +
      `<ul class="places-meta">` +
      metaItem("권장 나이", ageText(p.ageMonths)) +
      metaItem("실내·실외", lookup(Places.INDOOR, p.indoor)) +
      metaItem("비용", lookup(Places.COST, p.cost)) +
      metaItem("예약", lookup(Places.RESERVATION, p.reservation)) +
      `</ul>` +
      (p.checkedAt ? `<p class="places-checked">${esc(p.checkedAt)} 확인</p>` : "") +
      `<div class="places-actions">${link}<button type="button" class="places-add" data-places-add="${esc(p.id)}">${esc(TEXT.add)}</button></div>` +
      `</div></article>`
    );
  }

  /**
   * 어디갈까 탭 전체 마크업.
   * @param {{places:Array, child:{name,ageLabel}|null, region:{province,district}|null, category:string|null, status?:string, label?:string, today?:Date|string}} o
   *   places 는 이미 Places.filterPlaces 로 거른 목록(이 함수는 거르지 않는다).
   *   그 밖에 filters·showNoReserve·origin·driveMax·sort(app.js 가 넘김), sheetOpen(생략하면 이 모듈의 필터 시트 열림 상태 — 테스트·하네스용).
   */
  function render(o) {
    const opts = o || {};
    const list = Array.isArray(opts.places) ? opts.places.filter((p) => p && typeof p === "object" && typeof p.id === "string") : [];
    const today = opts.today === undefined ? new Date() : opts.today;
    const catOn = opts.category && opts.category !== "ALL";
    const f = opts.filters || {};
    const filterOn = f.indoor === true || f.free === true || f.noReserve === true || typeof opts.driveMax === "number";
    const origin = opts.origin || null;
    const body = list.length
      ? `<div class="places-list">${list.map((p) => renderCard(p, today, origin)).join("")}</div><p class="places-notice">${esc(TEXT.notice)}</p><p class="places-source">${esc(TEXT.source)}</p>`
      : `<div class="places-empty"><p>${esc(filterOn ? TEXT.emptyFilter : catOn ? TEXT.emptyCategory : TEXT.empty)}</p></div>`;
    const sheetOpen = typeof opts.sheetOpen === "boolean" ? opts.sheetOpen : ui.sheetOpen;
    const bs = opts.basis && opts.basis.name ? opts.basis : null; // 0-B3: 상단 기준 줄 "이름(나이) · 지역 기준 · 정렬"
    const basisLine = bs ? `<p class="places-basis">${esc([bs.age ? `${bs.name}(${bs.age})` : bs.name, bs.region ? `${bs.region} 기준` : ""].filter(Boolean).join(" · "))}${opts.sort === "popular" || (opts.sort === "near" && origin) ? ` · ${esc(sortLabelOf({ sort: opts.sort, origin }))}` : ""}</p>` : "";
    const so = { catCounts: opts.catCounts || null, category: opts.category, origin, driveMax: opts.driveMax, sort: opts.sort, filters: f, showNoReserve: opts.showNoReserve === true, sheetOpen };
    const conds = activeConds(so);
    return `<section class="places-view${sheetOpen ? " is-sheet-open" : ""}">${basisLine}${filterBar(so, conds)}${filterSheet(so, conds, list.length)}${activeRow(conds)}${countRow(so, list.length)}${body}</section>`;
  }

  // ── G14 필터 시트 열고 닫기·조건 지우기(브라우저에서만 문서에 클릭 위임 하나를 단다. app.js 의 #places-body 위임은 그대로) ──
  function setSheet(view, open) {
    ui.sheetOpen = !!open;
    if (!view || !view.classList) return;
    view.classList.toggle("is-sheet-open", ui.sheetOpen);
    view.querySelectorAll("[data-places-sheet=\"open\"]").forEach((b) => b.setAttribute("aria-expanded", ui.sheetOpen ? "true" : "false"));
    if (ui.sheetOpen) { const x = view.querySelector(".places-sheet-x"); if (x && typeof x.focus === "function") x.focus({ preventScroll: true }); }
  }
  /** host(#places-body)에서 key 조건을 끈다. "all" 이면 켜진 조건을 하나씩 모두 끈다(같은 조건을 두 번 누르지 않는다). */
  function removeCond(host, key) {
    const clickKey = (k) => { const t = host.querySelector(`.places-sheet ${REMOVE_TARGET[k]}`); if (t && !t.disabled) t.click(); };
    if (key !== "all") { if (REMOVE_TARGET[key]) clickKey(key); return; }
    const done = new Set();
    for (let i = 0; i < 6; i++) {
      const next = [...host.querySelectorAll(".places-active [data-places-remove]")].map((b) => b.getAttribute("data-places-remove")).find((k) => k !== "all" && !done.has(k) && REMOVE_TARGET[k]);
      if (!next) break;
      done.add(next);
      clickKey(next);
    }
  }
  function bindUi(doc) {
    doc.addEventListener("click", (ev) => {
      const t = ev.target;
      if (!t || typeof t.closest !== "function") return;
      const view = t.closest(".places-view");
      if (!view) { if (ui.sheetOpen) setSheet(doc.querySelector(".places-view.is-sheet-open"), false); return; } // 다른 탭으로 가면 닫는다
      const sh = t.closest("[data-places-sheet]");
      if (sh) { setSheet(view, sh.getAttribute("data-places-sheet") === "open"); return; }
      const rm = t.closest("[data-places-remove]");
      if (rm && view.parentNode) removeCond(view.parentNode, rm.getAttribute("data-places-remove"));
    });
    doc.addEventListener("keydown", (ev) => {
      if (ev.key === "Escape" && ui.sheetOpen) setSheet(doc.querySelector(".places-view.is-sheet-open"), false);
    });
  }
  if (typeof document !== "undefined" && document && typeof document.addEventListener === "function") bindUi(document);

  const HOUR_OPTS = Array.from({ length: 24 }, (_, i) => pad2(i));
  const MIN_OPTS = ["00", "10", "20", "30", "40", "50"];
  const splitHm = (v) => { const m = /^(\d{2}):(\d{2})$/.exec(v || ""); return m ? { h: m[1], m: m[2] } : { h: "", m: "" }; };
  function timeSel(id, value, label) {
    const t = splitHm(value);
    const sel = (suffix, opts, cur) => `<select id="${id}-${suffix}" class="places-time-sel" aria-label="${esc(label)}"><option value="">--</option>${opts.map((o) => `<option value="${o}"${cur === o ? " selected" : ""}>${o}</option>`).join("")}</select>`;
    return `<span class="places-time"><label>${esc(label)}</label>${sel("h", HOUR_OPTS, t.h)}${sel("m", MIN_OPTS, t.m)}</span>`;
  }
  /**
   * 장소 상세 시트(G2). o: { mode: "info"|"register"|"done", canRegister, today, reg:{date,allDay,startTime,endTime,assignee,scope,childKeys,saving,error}, pickerHtml, members:[{memberId,label}], kids:[{childKey,name}], doneLabel }
   * 이벤트 속성: data-places-copy · data-places-reg-open · data-places-save · data-places-back · data-places-allday · data-places-assignee · data-places-target · data-places-view-cal · data-places-close
   */
  function renderDetail(place, o) {
    const p = place || {};
    const opts = o || {};
    const mode = opts.mode === "register" || opts.mode === "done" ? opts.mode : "info";
    const where = [p.province, p.district].filter((x) => typeof x === "string" && x).join(" ");
    const closeBtn = `<button type="button" class="btn-close" data-places-close>${esc(TEXT.close)}</button>`;
    if (mode === "done") {
      return `<div class="places-detail" data-places-detail="done"><h3>${esc(TEXT.registered(opts.doneLabel || ""))}</h3><p class="fine-print">${esc(p.name || "")}</p><button type="button" class="btn-complete" data-places-view-cal>${esc(TEXT.viewCalendar)}</button>${closeBtn}</div>`;
    }
    if (mode === "register") {
      const r = opts.reg || {};
      const members = Array.isArray(opts.members) ? opts.members : [];
      const kids = Array.isArray(opts.kids) ? opts.kids : [];
      const assignee = members.length
        ? `<div class="places-reg-field"><label>${esc(TEXT.assigneeLabel)}</label><div class="places-chips-wrap">${members.map((m) => chipBtn(`data-places-assignee="${esc(m.memberId)}"`, m.label || "", r.assignee === m.memberId)).join("")}</div></div>`
        : "";
      const targets = `<div class="places-reg-field"><label>${esc(TEXT.targetLabel)}</label><div class="places-chips-wrap">${chipBtn('data-places-target="FAMILY"', TEXT.targetFamily, r.scope !== "CHILD")}${kids.map((k) => chipBtn(`data-places-target="${esc(k.childKey)}"`, k.name || "", r.scope === "CHILD" && (r.childKeys || [])[0] === k.childKey)).join("")}</div></div>`;
      const times = r.allDay === false ? `<div class="places-times">${timeSel("plr-start", r.startTime, TEXT.startLabel)}${timeSel("plr-end", r.endTime, TEXT.endLabel)}</div>` : "";
      return (
        `<div class="places-detail" data-places-detail="register"><h3>${esc(TEXT.regTitle)}</h3><p class="fine-print">${esc(p.name || "")}</p>` +
        `<div class="places-reg-field"><label>${esc(TEXT.dateLabel)}</label>${opts.pickerHtml || ""}</div>` +
        `<div class="places-reg-field"><label>${esc(TEXT.timeLabel)}</label><div class="places-chips-wrap">${chipBtn("data-places-allday", TEXT.allDay, r.allDay !== false)}</div>${times}</div>` +
        assignee + targets +
        (r.error ? `<p class="places-reg-err">${esc(r.error)}</p>` : "") +
        `<button type="button" class="btn-complete" data-places-save${r.saving ? " disabled" : ""}>${esc(r.saving ? TEXT.saving : TEXT.save)}</button>` +
        `<button type="button" class="btn-text" data-places-back${r.saving ? " disabled" : ""}>${esc(TEXT.back)}</button></div>`
      );
    }
    // G14 상세(지도형): 지도 그림 머리(+지도에서 보기·길찾기) → 분류·이름·주소 → 기준 거리 → 설명 → 정보 2×2 → 이용 안내 → 공식 홈페이지 → 아래 고정 [일정 등록하기]
    const cat = Object.prototype.hasOwnProperty.call(PH_ICON, p.category) ? p.category : "PARK";
    const badges = [`<span class="places-badge places-badge-cat places-cat-${cat.toLowerCase()}">${esc(lookup(Places.CATEGORIES, p.category) || "")}</span>`];
    if (typeof p.district === "string" && p.district) badges.push(`<span class="places-badge places-badge-district">${esc(p.district)}</span>`);
    if (p.example === true) badges.push(`<span class="places-badge places-badge-example">${esc(TEXT.example)}</span>`);
    const stale = Places.isStale(p, opts.today === undefined ? new Date() : opts.today);
    if (stale) badges.push(`<span class="places-badge places-badge-stale">${esc(TEXT.stale)}</span>`);
    const addr = p.address || where;
    const addrRow = addr ? `<div class="places-detail-addr"><span>${esc(addr)}</span>${p.address ? `<button type="button" class="btn-close places-copy" data-places-copy="${esc(p.address)}">${esc(TEXT.copy)}</button>` : ""}</div>` : "";
    const hasHome = Places.isHttpsUrl(p.officialUrl);
    const route = routeUrl(p);
    const dmin = opts.origin ? Places.driveMinFrom(p, opts.origin) : null;
    const map =
      `<div class="places-dmap"><span class="places-dmap-road" aria-hidden="true"></span><span class="places-dmap-pin" aria-hidden="true"></span>` +
      (dmin === null ? "" : `<span class="places-ph-tm places-dmap-tm">${esc(TEXT.driveTime(Math.max(1, dmin)))}</span>`) +
      `<div class="places-actions places-dmap-btns"><a class="places-link" href="${esc(mapUrl(p))}" target="_blank" rel="noopener noreferrer">${esc(TEXT.map)}</a>${route ? `<a class="places-link places-route" href="${esc(route)}" target="_blank" rel="noopener noreferrer">${esc(TEXT.route)}</a>` : ""}</div></div>`;
    const driveRow = dmin === null ? "" : `<p class="places-drive places-detail-drive">${esc(TEXT.driveNote(Math.max(1, dmin), opts.origin.name))}<span class="places-detail-est"> · ${esc(TEXT.estimated)}</span></p>`;
    const resv = p.reservation === "REQUIRED" ? `<p class="places-reserve-note">${esc(TEXT.reservationRequired)}</p>` : p.reservation === "PARTLY" ? `<p class="places-reserve-note">${esc(TEXT.reservationPartly)}</p>` : "";
    return (
      `<div class="places-detail places-detail-map" data-places-detail="info">` + map +
      `<div class="places-detail-bd"><div class="places-badges">${badges.join("")}</div>` +
      `<h3 class="places-name">${esc(p.name || "")}</h3>` +
      addrRow + driveRow +
      (p.summary ? `<p class="places-summary">${esc(p.summary)}</p>` : "") +
      `<ul class="places-meta">${metaItem("권장 나이", ageText(p.ageMonths))}${metaItem("실내·실외", lookup(Places.INDOOR, p.indoor))}${metaItem("비용", lookup(Places.COST, p.cost))}${metaItem("예약", lookup(Places.RESERVATION, p.reservation))}</ul>` +
      (typeof p.notice === "string" && p.notice ? `<p class="places-reserve-note places-detail-notice">${esc(p.notice)}</p>` : "") +
      resv +
      (hasHome ? `<div class="places-actions"><a class="places-link" href="${esc(p.officialUrl)}" target="_blank" rel="noopener noreferrer">${esc(TEXT.homepage)}</a></div>` : "") +
      `<p class="places-notice">${esc(TEXT.notice)}</p>` +
      `<p class="places-checked">${p.checkedAt ? esc(p.checkedAt) + " 확인" : esc(TEXT.unknown)}</p></div>` +
      `<div class="places-detail-foot">${opts.canRegister ? `<button type="button" class="btn-complete" data-places-reg-open>${esc(TEXT.register)}</button>` : `<p class="fine-print">${esc(TEXT.needHousehold)}</p>`}` +
      closeBtn + `</div></div>`
    );
  }

  /**
   * [일정 추가] → 일정 폼 초기값. 기존 일정 구조(js/user-schedule.js: category FAMILY, scope FAMILY)에 맞춘다. 날짜는 사용자가 고른다.
   */
  function scheduleDraftFor(place) {
    const p = place || {};
    return {
      title: String(p.name || "").slice(0, SCHEDULE_LIMITS.titleMax),
      location: String(p.address || "").slice(0, SCHEDULE_LIMITS.locationMax),
      category: "FAMILY",
      scope: "FAMILY",
    };
  }

  return { TEXT, SCHEDULE_LIMITS, esc, ageText, render, filterRow, activeConds, renderCard, renderDetail, defaultVisitDate, dateLabel, mapUrl, routeUrl, memoFor, scheduleDraftFor };
});
