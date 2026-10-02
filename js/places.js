/*
 * places — 어디갈까(S8) 장소 데이터의 검증·필터·확인 기한 계산(순수 모듈).
 * 설계: docs/한눈육아-F0-최종-서비스-설계.md §7, docs/한눈육아-어디갈까-조사지침.md §3(필드)·§6(재확인 주기).
 *
 * 원칙
 *   - DOM·Firestore·localStorage·다른 모듈에 의존하지 않는다. 데이터는 data/places.json(편집 추천)만 쓴다.
 *   - 미확인 값은 null. 추측해서 채우지 않는다(검증은 null 을 허용, 화면은 "방문 전 확인").
 *   - 날짜는 "YYYY-MM-DD" 문자열과 로컬 Date 만 쓴다(toISOString 금지).
 */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else root.Places = factory();
})(typeof window !== "undefined" ? window : global, function () {
  "use strict";

  /** 분류 코드 → 화면 라벨(칩 순서 그대로). */
  const CATEGORIES = Object.freeze({
    PARK: "공원",
    KIDSCAFE: "키즈카페",
    EXPERIENCE: "체험",
    EDU: "교육",
    LIBRARY: "도서관",
    MUSEUM: "박물관",
    INDOOR: "실내 놀이",
  });
  const CATEGORY_KEYS = Object.freeze(Object.keys(CATEGORIES));
  const INDOOR = Object.freeze({ INDOOR: "실내", OUTDOOR: "실외", BOTH: "실내·실외" });
  const COST = Object.freeze({ FREE: "무료", PAID: "유료", PARTLY: "일부 유료" });
  const RESERVATION = Object.freeze({ REQUIRED: "예약 필요", NONE: "예약 없이 이용", PARTLY: "일부 예약 필요" });
  const FIELDS = Object.freeze(["id", "name", "category", "province", "district", "ageMonths", "indoor", "cost", "reservation", "address", "officialUrl", "summary", "checkedAt", "example"]);
  const LIMITS = Object.freeze({ nameMax: 60, addressMax: 100, summaryMax: 80, ageMax: 240 });
  /** 순위·평가 표현(조사지침 §1·§3 — 실제 이용 통계가 없으므로 쓰지 않는다). */
  const BANNED_WORDS = Object.freeze(["인기", "최고", "best", "1위", "순위", "랭킹", "핫플"]);
  const hasBannedWord = (s) => typeof s === "string" && BANNED_WORDS.some((w) => s.toLowerCase().includes(w));
  const ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;
  const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
  const STALE_MONTHS = 6;

  const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const isStr = (v) => typeof v === "string" && v.trim().length > 0;
  const isInt = (v) => typeof v === "number" && Number.isInteger(v);

  /** "YYYY-MM-DD" → 로컬 Date(실제 있는 날짜만). 아니면 null. */
  function parseDate(s) {
    if (typeof s !== "string") return null;
    const m = DATE_RE.exec(s);
    if (!m) return null;
    const y = +m[1], mo = +m[2], d = +m[3];
    const dt = new Date(y, mo - 1, d);
    if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
    return dt;
  }
  function toDate(v) {
    if (v instanceof Date) return new Date(v.getFullYear(), v.getMonth(), v.getDate());
    return parseDate(v);
  }
  /** months 개월 뒤 같은 날(그 달에 없으면 말일). */
  function addMonths(dt, months) {
    const y = dt.getFullYear(), m = dt.getMonth() + months;
    const last = new Date(y, m + 1, 0).getDate();
    return new Date(y, m, Math.min(dt.getDate(), last));
  }
  function isHttpsUrl(s) {
    if (typeof s !== "string" || !/^https:\/\/[^\s/?#]+\.[^\s/?#]+/i.test(s) || /\s/.test(s)) return false;
    try {
      return new URL(s).protocol === "https:";
    } catch (e) {
      return false;
    }
  }

  /**
   * 장소 1건 검증. 오류 목록 [{ field, message }] 을 돌려준다(빈 배열 = 통과).
   */
  function validatePlace(p) {
    const errors = [];
    const err = (field, message) => errors.push({ field, message });
    if (!p || typeof p !== "object" || Array.isArray(p)) return [{ field: "*", message: "장소는 객체여야 한다" }];
    FIELDS.forEach((k) => {
      if (!has(p, k)) err(k, "필드 없음(미확인 값은 null 로 둔다)");
    });
    Object.keys(p).forEach((k) => {
      if (!FIELDS.includes(k)) err(k, "정의되지 않은 필드");
    });
    if (has(p, "id") && !(typeof p.id === "string" && ID_RE.test(p.id))) err("id", "영문 소문자·숫자·하이픈 1~64자");
    if (has(p, "name") && !(isStr(p.name) && p.name.length <= LIMITS.nameMax)) err("name", `이름 1~${LIMITS.nameMax}자`);
    if (has(p, "category") && !CATEGORY_KEYS.includes(p.category)) err("category", `분류는 ${CATEGORY_KEYS.join("/")} 중 하나`);
    if (has(p, "province") && !isStr(p.province)) err("province", "시·도 필수");
    if (has(p, "district") && p.district !== null && !isStr(p.district)) err("district", "시·군·구는 문자열 또는 null");
    if (has(p, "ageMonths") && p.ageMonths !== null) {
      const a = p.ageMonths;
      if (!a || typeof a !== "object" || Array.isArray(a) || !has(a, "min") || !has(a, "max") || Object.keys(a).length !== 2) {
        err("ageMonths", "{min,max} 또는 null");
      } else {
        const okNum = (v) => v === null || (isInt(v) && v >= 0 && v <= LIMITS.ageMax);
        if (!okNum(a.min) || !okNum(a.max)) err("ageMonths", `min·max 는 0~${LIMITS.ageMax} 정수 또는 null`);
        else if (a.min === null && a.max === null) err("ageMonths", "min·max 가 모두 null 이면 ageMonths 를 null 로 둔다");
        else if (a.min !== null && a.max !== null && a.min > a.max) err("ageMonths", "min ≤ max");
      }
    }
    const enumCheck = (k, map) => {
      if (has(p, k) && p[k] !== null && !has(map, p[k])) err(k, `${Object.keys(map).join("/")} 또는 null`);
    };
    enumCheck("indoor", INDOOR);
    enumCheck("cost", COST);
    enumCheck("reservation", RESERVATION);
    if (has(p, "address") && !(isStr(p.address) && p.address.length <= LIMITS.addressMax)) err("address", `주소 1~${LIMITS.addressMax}자`);
    if (has(p, "officialUrl") && !isHttpsUrl(p.officialUrl)) err("officialUrl", "https:// 공식 링크만");
    if (has(p, "summary")) {
      if (!(isStr(p.summary) && p.summary.length <= LIMITS.summaryMax)) err("summary", `한 줄 설명 1~${LIMITS.summaryMax}자`);
      else if (hasBannedWord(p.summary)) err("summary", "순위·평가 표현 금지(인기·최고·BEST·1위 등)");
    }
    if (has(p, "name") && isStr(p.name) && hasBannedWord(p.name)) err("name", "순위·평가 표현 금지(인기·최고·BEST·1위 등)");
    if (has(p, "checkedAt") && !parseDate(p.checkedAt)) err("checkedAt", "YYYY-MM-DD 실제 날짜");
    if (has(p, "example") && typeof p.example !== "boolean") err("example", "true/false");
    return errors;
  }

  /** places.json 전체 검증: 각 장소 오류 + id 중복. [{ index, id, field, message }] */
  function validateData(data) {
    const out = [];
    if (!data || typeof data !== "object" || !Array.isArray(data.places)) return [{ index: -1, id: null, field: "places", message: "places 배열 필요" }];
    const seen = new Set();
    data.places.forEach((p, i) => {
      const id = p && typeof p.id === "string" ? p.id : null;
      validatePlace(p).forEach((e) => out.push({ index: i, id, ...e }));
      if (id && seen.has(id)) out.push({ index: i, id, field: "id", message: "id 중복" });
      if (id) seen.add(id);
    });
    return out;
  }

  /** 나이(개월)가 장소 권장 범위 안인가. 나이 모름·범위 미확인이면 통과. */
  function ageFits(place, ageMonths) {
    if (typeof ageMonths !== "number" || !Number.isFinite(ageMonths)) return true;
    const a = place && place.ageMonths;
    if (!a) return true;
    if (a.min !== null && a.min !== undefined && ageMonths < a.min) return false;
    if (a.max !== null && a.max !== undefined && ageMonths > a.max) return false;
    return true;
  }

  /**
   * 목록 필터·정렬.
   *  - province 가 있으면 같은 시·도만 남기고, 같은 시·군·구를 앞에(그 안에서는 원래 순서 = 편집 순서).
   *  - ageMonths(숫자)가 있으면 권장 나이 범위 밖은 뺀다(장소의 ageMonths 가 null 이면 통과).
   *  - category 가 분류 코드면 그 분류만('ALL'·빈 값·null 은 전체).
   */
  function filterPlaces(list, opts) {
    const o = opts || {};
    const src = Array.isArray(list) ? list.filter((p) => p && typeof p === "object") : [];
    const cat = o.category && o.category !== "ALL" ? o.category : null;
    const prov = isStr(o.province) ? o.province : null;
    const dist = prov && isStr(o.district) ? o.district : null;
    const age = typeof o.ageMonths === "number" && Number.isFinite(o.ageMonths) ? o.ageMonths : null;
    const kept = src.filter((p) => (!cat || p.category === cat) && (!prov || p.province === prov) && (age === null || ageFits(p, age)));
    if (!dist) return kept;
    const same = kept.filter((p) => p.district === dist);
    const rest = kept.filter((p) => p.district !== dist);
    return same.concat(rest);
  }

  /** 확인 날짜로부터 months 개월(기본 6)이 지났으면 true. checkedAt 이 없거나 잘못됐으면 true(확인 필요). today: Date 또는 "YYYY-MM-DD". */
  function isStale(place, today, months) {
    const n = typeof months === "number" ? months : STALE_MONTHS;
    const checked = place ? parseDate(place.checkedAt) : null;
    if (!checked) return true;
    const t = toDate(today === undefined ? new Date() : today);
    if (!t) return false;
    return t.getTime() >= addMonths(checked, n).getTime();
  }

  return { CATEGORIES, CATEGORY_KEYS, INDOOR, COST, RESERVATION, FIELDS, LIMITS, BANNED_WORDS, STALE_MONTHS, hasBannedWord, validatePlace, validateData, filterPlaces, ageFits, isStale, parseDate, isHttpsUrl };
});
