/*
 * G3 어디갈까 보완: 보조 필터(실내·무료·예약 없이)·준비 중 지역 안내(+다른 지역 둘러보기)·notice(이용 제한 안내) 선택 필드.
 * 실행: node test/g3-places-filters.test.js  (data/places.json 은 읽기만)
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const P = require("../js/places.js");
const PV = require("../js/places-view.js");
const read = (f) => fs.readFileSync(path.join(__dirname, "..", f), "utf8");
const APP = read("js/app.js");
const DATA = JSON.parse(read("data/places.json"));
let passed = 0;
function test(name, fn) { try { fn(); passed++; console.log("  ok  - " + name); } catch (e) { process.exitCode = 1; console.log("  FAIL- " + name + "\n      " + (e.stack || e).split("\n").slice(0, 6).join("\n      ")); } }
const mk = (id, o) => ({ id, name: id, category: "PARK", province: "경기도", district: "성남시", ageMonths: null, indoor: null, cost: null, reservation: null, address: "주소 " + id, officialUrl: "https://x.kr/" + id, summary: "설명", checkedAt: "2026-09-20", example: false, ...o });
const ids = (l) => l.map((p) => p.id);

console.log("filterPlaces 보조 필터");
test("실내(INDOOR·BOTH)·무료(FREE)·예약 없이(값이 있고 REQUIRED 아님): 켜면 모름(null)은 제외, 켜지 않으면 그대로", () => {
  const L = [mk("a", { indoor: "INDOOR", cost: "FREE", reservation: "NONE" }), mk("b", { indoor: "BOTH", cost: "PAID", reservation: "PARTLY" }), mk("c", { indoor: "OUTDOOR", cost: "FREE", reservation: "REQUIRED" }), mk("d", {})];
  assert.deepStrictEqual(ids(P.filterPlaces(L, {})), ["a", "b", "c", "d"]);
  assert.deepStrictEqual(ids(P.filterPlaces(L, { indoor: true })), ["a", "b"]);
  assert.deepStrictEqual(ids(P.filterPlaces(L, { free: true })), ["a", "c"]);
  assert.deepStrictEqual(ids(P.filterPlaces(L, { noReserve: true })), ["a", "b"]);
  assert.deepStrictEqual(ids(P.filterPlaces(L, { indoor: true, free: true })), ["a"], "AND");
  assert.deepStrictEqual(ids(P.filterPlaces(L, { indoor: false, free: false, noReserve: false })), ["a", "b", "c", "d"]);
  assert.deepStrictEqual(ids(P.filterPlaces(L, { indoor: true, category: "MUSEUM" })), [], "분류와도 AND");
  assert.deepStrictEqual(ids(P.filterPlaces(L, { indoor: "yes" })), ["a", "b", "c", "d"], "true 만 인정");
  const before = JSON.stringify(L); P.filterPlaces(L, { indoor: true, free: true }); assert.strictEqual(JSON.stringify(L), before, "원본 불변");
});
test("regionsOf·hasNoReserve: 데이터의 지역 목록(중복 없음)·NONE 존재 여부", () => {
  assert.deepStrictEqual(P.regionsOf([mk("a", {}), mk("b", {}), mk("c", { district: "용인시" }), mk("d", { province: "서울특별시", district: null })]), [{ province: "경기도", district: "성남시" }, { province: "경기도", district: "용인시" }, { province: "서울특별시", district: null }]);
  assert.deepStrictEqual([P.hasNoReserve([mk("a", { reservation: "PARTLY" })]), P.hasNoReserve([mk("a", { reservation: "NONE" })]), P.hasNoReserve(null)], [false, true, false]);
});

console.log("화면: 칩·빈 상태·지역 폴백");
test("필터 줄: 실내·무료 칩(+예약 없이는 showNoReserve 일 때만), aria-pressed, 켠 필터로 0곳이면 '조건에 맞는 곳이 없어요…'(분류 빈 문구와 구분)", () => {
  const h = PV.render({ places: [], category: "ALL", filters: { indoor: true }, showNoReserve: false });
  assert.ok(h.includes('data-places-filter="indoor"') && /aria-pressed="true"[^>]*data-places-filter="indoor"|data-places-filter="indoor"/.test(h) && h.includes('data-places-filter="free"') && !h.includes('data-places-filter="noReserve"'));
  assert.ok(/class="places-chip places-filter active" aria-pressed="true" data-places-filter="indoor"/.test(h) && /aria-pressed="false" data-places-filter="free"/.test(h));
  assert.ok(h.includes("조건에 맞는 곳이 없어요. 필터를 줄여 보세요.") && !h.includes("이 분류는 아직"));
  assert.ok(PV.render({ places: [], category: "PARK", filters: {} }).includes("이 분류는 아직 준비하고 있어요") && PV.render({ places: [], filters: {} }).includes("준비하고 있어요"));
  assert.ok(PV.render({ places: [], filters: {}, showNoReserve: true }).includes('data-places-filter="noReserve"') && PV.render({ places: [], filters: {}, showNoReserve: true }).includes("예약 없이"));
  assert.ok(PV.render({ places: [] }).includes("data-places-filter=\"indoor\""), "filters 생략도 안전");
});
test("준비 중 지역 안내: 데이터의 지역으로 문구 생성(coverage 가 있으면 그것), [다른 지역 둘러보기] 칩은 district 그대로·선택 표시, fallback 없으면 안내 없음", () => {
  const regions = [{ province: "경기도", district: "성남시" }, { province: "경기도", district: "용인시" }];
  const h = PV.render({ places: [], fallback: { regions, current: null } });
  assert.ok(h.includes("아직 이 지역은 준비 중이에요. 지금은 성남시·용인시 장소를 보여 드려요.") && h.includes("다른 지역 둘러보기") && h.includes('data-places-browse="경기도|성남시"') && h.includes(">용인시<"));
  const c = PV.render({ places: [], fallback: { regions, current: { province: "경기도", district: "용인시" }, coverage: "성남시 분당구·용인시" } });
  assert.ok(c.includes("지금은 성남시 분당구·용인시 장소를 보여 드려요.") && /aria-pressed="true" data-places-browse="경기도\|용인시"/.test(c) && /aria-pressed="false" data-places-browse="경기도\|성남시"/.test(c));
  assert.ok(!PV.render({ places: [] }).includes("places-fallback") && !PV.render({ places: [], fallback: { regions: [] } }).includes("places-fallback"));
  assert.ok(!PV.fallbackBox({ regions: [{ province: "<b>", district: "<i>" }], coverage: "<u>x" }).match(/<b>|<i>|<u>/), "이스케이프");
});

console.log("notice 선택 필드");
test("validatePlace: notice 없어도 통과(기존 필수 규칙 유지), null·문자열 OK, 80자 초과·빈 문자열·숫자·금지어 거부, 그 밖의 정의 밖 필드는 여전히 거부", () => {
  const base = mk("ok", {});
  assert.deepStrictEqual(P.validatePlace(base), []);
  assert.deepStrictEqual(P.validatePlace({ ...base, notice: null }), []);
  assert.deepStrictEqual(P.validatePlace({ ...base, notice: "성남시민·성남 소재 직장 재직 가정만 이용할 수 있어요." }), []);
  for (const bad of ["", "가".repeat(81), 5, "인기 많은 곳"]) assert.ok(P.validatePlace({ ...base, notice: bad }).some((e) => e.field === "notice"), String(bad));
  assert.ok(P.validatePlace({ ...base, extra: 1 }).some((e) => e.field === "extra"));
  const { summary, ...noSummary } = base;
  assert.ok(P.validatePlace(noSummary).some((e) => e.field === "summary"), "필수 필드 누락은 여전히 오류");
  assert.deepStrictEqual(P.OPTIONAL_FIELDS, ["notice"]);
});
test("카드·상세: notice 가 있으면 작은 안내(이스케이프), 없거나 null 이면 마크업 없음(기존과 동일)", () => {
  const p = mk("n", { notice: "성남시민만 <b>이용</b>", name: "이름" });
  assert.ok(PV.renderCard(p, new Date(2026, 9, 3)).includes('<p class="places-card-notice">성남시민만 &lt;b&gt;이용&lt;/b&gt;</p>') && !PV.renderCard(p, new Date(2026, 9, 3)).includes("<b>이용"));
  assert.ok(PV.renderDetail(p, { mode: "info" }).includes("places-detail-notice") && PV.renderDetail(p, { mode: "info" }).includes("성남시민만 &lt;b&gt;"));
  for (const q of [mk("m", {}), mk("m", { notice: null }), mk("m", { notice: "" })]) {
    assert.ok(!PV.renderCard(q, new Date(2026, 9, 3)).includes("places-card-notice") && !PV.renderDetail(q, { mode: "info" }).includes("places-detail-notice"));
  }
});
test("실제 places.json: 전부 validateData 통과(top-level coverage 같은 선택 키가 있어도 막지 않는다)", () => {
  assert.deepStrictEqual(P.validateData(DATA), []);
  assert.deepStrictEqual(P.validateData({ ...DATA, coverage: "성남시 분당구·용인시" }), []);
  assert.ok(DATA.places.length >= 29);
});

console.log("앱 연결");
function env(o) {
  const a = APP.indexOf("  let placesFilters ="), b = APP.indexOf("  async function renderPlacesTab() {");
  const sb = { Places: P, PlacesView: PV, ChildTimeline: { ageLabelAt: () => "7개월" }, placesData: o.data, placesCat: "ALL", profile: o.profile === undefined ? { name: "수아", province: "경기도", district: "성남시", birthDate: new Date(2026, 2, 2) } : o.profile, isPregnant: () => false, childDisplayName: () => "수아", ageInMonths: () => 7 };
  vm.createContext(sb);
  vm.runInContext(APP.slice(a, b).replace(/^  let (\w+) =/gm, "var $1 =") + "\n;globalThis.__t = { placesViewHtml, get filters() { return placesFilters; }, setBrowse(v) { placesBrowse = v; } };", sb);
  return sb.__t;
}
const count = (h) => (h.match(/data-places-id=/g) || []).length;
test("내 시군구에 장소가 있으면 안내 없음·필터 적용, 없으면 안내+전체(시·도에도 없을 때) / 같은 시·도 다른 시군구, 둘러보기 선택은 보기용", () => {
  const data = { status: "준비 중", places: [mk("s1", { indoor: "INDOOR" }), mk("s2", { cost: "FREE" }), mk("y1", { district: "용인시" })] };
  const mine = env({ data });
  assert.ok(!mine.placesViewHtml().includes("places-fallback") && count(mine.placesViewHtml()) === 3);
  mine.filters.indoor = true;
  assert.strictEqual(count(mine.placesViewHtml()), 1);
  mine.filters.indoor = false; mine.filters.free = true; mine.filters.noReserve = true;
  assert.ok(mine.placesViewHtml().includes("조건에 맞는 곳이 없어요"));
  const seoul = env({ data, profile: { name: "수아", province: "서울특별시", district: "구로구", birthDate: new Date(2026, 2, 2) } });
  const h = seoul.placesViewHtml();
  assert.ok(h.includes("아직 이 지역은 준비 중이에요") && count(h) === 3, "시·도에도 없으면 전체");
  seoul.setBrowse({ province: "경기도", district: "용인시" });
  const b = seoul.placesViewHtml();
  assert.ok(count(b) === 1 && b.includes('data-places-id="y1"') && /aria-pressed="true" data-places-browse="경기도\|용인시"/.test(b));
  const suwon = env({ data, profile: { name: "수아", province: "경기도", district: "수원시", birthDate: new Date(2026, 2, 2) } });
  assert.ok(suwon.placesViewHtml().includes("아직 이 지역은 준비 중이에요") && count(suwon.placesViewHtml()) === 3, "같은 시·도의 다른 시군구");
  const cov = env({ data: { ...data, coverage: "성남시 분당구·용인시" }, profile: { name: "수아", province: "서울특별시", district: "구로구", birthDate: new Date(2026, 2, 2) } });
  assert.ok(cov.placesViewHtml().includes("지금은 성남시 분당구·용인시 장소를"));
  const none = env({ data, profile: null });
  assert.ok(!none.placesViewHtml().includes("places-fallback"), "프로필 없음은 등록 안내(폴백 아님)");
});
test("'예약 없이' 칩은 데이터에 NONE 이 있을 때만 · 클릭 위임(data-places-filter / data-places-browse) 소스 · 날짜 팝업 스크롤", () => {
  assert.ok(!env({ data: { places: [mk("a", { reservation: "PARTLY" })] } }).placesViewHtml().includes('data-places-filter="noReserve"'));
  assert.ok(env({ data: { places: [mk("a", { reservation: "NONE" })] } }).placesViewHtml().includes('data-places-filter="noReserve"'));
  assert.ok(APP.includes('const flt = ev.target.closest("[data-places-filter]");') && APP.includes('const br = ev.target.closest("[data-places-browse]");'));
  assert.ok(APP.includes('pop.scrollIntoView({ block: "nearest" })'));
});
console.log(`\n${passed}개 통과${process.exitCode ? ", 일부 실패" : ""}`);
