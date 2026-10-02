/*
 * places-view — 어디갈까(S8) 탭 마크업 문자열 생성(순수, DOM 없음). js/places.js(window.Places) 다음에 로드한다.
 * 설계: docs/한눈육아-F0-최종-서비스-설계.md §7. 표기는 "편집 추천"만(가짜 인기·순위 표기 금지 — 조사지침 §1).
 *
 * 이벤트 위임용 속성(app.js 가 연결):
 *   data-places-cat="ALL|PARK|…"   분류 칩
 *   data-places-add="<id>"          [일정 추가] 버튼 → scheduleDraftFor(place) 로 일정 폼 초기값
 *   data-places-action="change"     아이·지역 바꾸기
 */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory(require("./places.js"));
  else root.PlacesView = factory(root.Places);
})(typeof window !== "undefined" ? window : global, function (Places) {
  "use strict";

  const TEXT = Object.freeze({
    label: "편집 추천",
    noProfile: "아이와 지역을 등록하면 맞춤 장소를 보여 드려요",
    empty: "우리 동네 갈 만한 곳을 준비하고 있어요. 곧 편집 추천 장소를 보여 드릴게요.",
    emptyCategory: "이 분류는 아직 준비하고 있어요. 다른 분류를 골라 보세요.",
    notice: "방문 전 공식 링크에서 운영 여부를 확인하세요",
    unknown: "방문 전 확인",
    stale: "확인 오래됨",
    example: "예시",
    add: "일정 추가",
    link: "공식 링크",
    change: "바꾸기",
  });
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
    if (min !== null && max !== null) return min === max ? `${min}개월` : `${min}~${max}개월`;
    if (min !== null) return `${min}개월 이상`;
    if (max !== null) return `${max}개월까지`;
    return null;
  }
  const lookup = (map, v) => (v !== null && v !== undefined && Object.prototype.hasOwnProperty.call(map, v) ? map[v] : null);

  function contextRow(child, region) {
    const parts = [];
    if (child && child.name) parts.push(`<span class="places-ctx-child">${esc(child.name)}${child.ageLabel ? ` · ${esc(child.ageLabel)}` : ""}</span>`);
    if (region && region.province) parts.push(`<span class="places-ctx-region">${esc(region.province)}${region.district ? ` ${esc(region.district)}` : ""}</span>`);
    const missing = !(child && child.name) || !(region && region.province);
    return (
      `<div class="places-ctx">` +
      (parts.length ? `<div class="places-ctx-main">${parts.join('<span class="places-ctx-sep" aria-hidden="true">·</span>')}</div>` : "") +
      (missing ? `<p class="places-ctx-hint">${esc(TEXT.noProfile)}</p>` : "") +
      `<button type="button" class="places-ctx-change" data-places-action="change">${esc(TEXT.change)}</button>` +
      `</div>`
    );
  }

  function chipRow(category) {
    const cur = category && Object.prototype.hasOwnProperty.call(Places.CATEGORIES, category) ? category : "ALL";
    const chips = [["ALL", "전체"]].concat(Places.CATEGORY_KEYS.map((k) => [k, Places.CATEGORIES[k]]));
    return (
      `<div class="places-chips" role="group" aria-label="장소 분류">` +
      chips
        .map(([k, label]) => `<button type="button" class="places-chip${k === cur ? " active" : ""}" aria-pressed="${k === cur ? "true" : "false"}" data-places-cat="${esc(k)}">${esc(label)}</button>`)
        .join("") +
      `</div>`
    );
  }

  function metaItem(label, value) {
    const known = value !== null && value !== undefined && value !== "";
    return `<li class="places-meta-item${known ? "" : " unknown"}"><span class="places-meta-label">${esc(label)}</span><span class="places-meta-value">${esc(known ? value : TEXT.unknown)}</span></li>`;
  }

  function renderCard(p, today) {
    const stale = Places.isStale(p, today);
    const badges = [`<span class="places-badge places-badge-cat">${esc(lookup(Places.CATEGORIES, p.category) || "")}</span>`];
    if (p.example === true) badges.push(`<span class="places-badge places-badge-example">${esc(TEXT.example)}</span>`);
    if (stale) badges.push(`<span class="places-badge places-badge-stale">${esc(TEXT.stale)}</span>`);
    const link = Places.isHttpsUrl(p.officialUrl)
      ? `<a class="places-link" href="${esc(p.officialUrl)}" target="_blank" rel="noopener noreferrer">${esc(TEXT.link)}</a>`
      : "";
    const where = [p.province, p.district].filter((s) => typeof s === "string" && s).join(" ");
    return (
      `<article class="places-card" data-places-id="${esc(p.id)}">` +
      `<div class="places-badges">${badges.join("")}</div>` +
      `<h3 class="places-name">${esc(p.name)}</h3>` +
      (p.summary ? `<p class="places-summary">${esc(p.summary)}</p>` : "") +
      (p.address || where ? `<p class="places-address">${esc(p.address || where)}</p>` : "") +
      `<ul class="places-meta">` +
      metaItem("권장 나이", ageText(p.ageMonths)) +
      metaItem("실내·실외", lookup(Places.INDOOR, p.indoor)) +
      metaItem("비용", lookup(Places.COST, p.cost)) +
      metaItem("예약", lookup(Places.RESERVATION, p.reservation)) +
      `</ul>` +
      (p.checkedAt ? `<p class="places-checked">${esc(p.checkedAt)} 확인</p>` : "") +
      `<div class="places-actions">${link}<button type="button" class="places-add" data-places-add="${esc(p.id)}">${esc(TEXT.add)}</button></div>` +
      `</article>`
    );
  }

  /**
   * 어디갈까 탭 전체 마크업.
   * @param {{places:Array, child:{name,ageLabel}|null, region:{province,district}|null, category:string|null, status?:string, label?:string, today?:Date|string}} o
   *   places 는 이미 Places.filterPlaces 로 거른 목록(이 함수는 거르지 않는다).
   */
  function render(o) {
    const opts = o || {};
    const list = Array.isArray(opts.places) ? opts.places.filter((p) => p && typeof p === "object" && typeof p.id === "string") : [];
    const today = opts.today === undefined ? new Date() : opts.today;
    const catOn = opts.category && opts.category !== "ALL";
    const head =
      `<div class="places-head">` +
      `<span class="places-label">${esc(TEXT.label)}</span>` +
      (opts.status ? `<span class="places-status">${esc(opts.status)}</span>` : "") +
      `</div>`;
    const body = list.length
      ? `<div class="places-list">${list.map((p) => renderCard(p, today)).join("")}</div><p class="places-notice">${esc(TEXT.notice)}</p>`
      : `<div class="places-empty"><p>${esc(catOn ? TEXT.emptyCategory : TEXT.empty)}</p></div>`;
    return `<section class="places-view">${contextRow(opts.child, opts.region)}${chipRow(opts.category)}${head}${body}</section>`;
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

  return { TEXT, SCHEDULE_LIMITS, esc, ageText, render, renderCard, scheduleDraftFor };
});
