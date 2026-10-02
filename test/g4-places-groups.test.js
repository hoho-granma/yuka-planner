/*
 * G4 어디갈까 목록 두 묶음: '우리 동네 · {시군구}' / '가까운 지역 · {시·도}', 카드의 시·군·구 표기. 실행: node test/g4-places-groups.test.js
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const P = require("../js/places.js");
const PV = require("../js/places-view.js");
const read = (f) => fs.readFileSync(path.join(__dirname, "..", f), "utf8");
const APP = read("js/app.js");
let passed = 0;
function test(name, fn) { try { fn(); passed++; console.log("  ok  - " + name); } catch (e) { process.exitCode = 1; console.log("  FAIL- " + name + "\n      " + (e.stack || e).split("\n").slice(0, 6).join("\n      ")); } }
const mk = (id, o) => ({ id, name: id, category: "PARK", province: "경기도", district: "성남시", ageMonths: null, indoor: null, cost: null, reservation: null, address: "주소 " + id, officialUrl: "https://x.kr/" + id, summary: "설명", checkedAt: "2026-09-20", example: false, ...o });
const T = new Date(2026, 9, 3);

test("카드: 분류 배지 옆에 시·군·구 작은 배지(이스케이프), 시·군·구가 없으면 배지 없음", () => {
  const h = PV.renderCard(mk("a", { district: "용인시" }), T);
  assert.ok(/places-badge-cat">공원<\/span><span class="places-badge places-badge-district">용인시<\/span>/.test(h));
  assert.ok(PV.renderCard(mk("a", { district: "<b>" }), T).includes("&lt;b&gt;</span>") && !PV.renderCard(mk("a", { district: null }), T).includes("places-badge-district"));
});
test("groups: 소제목 + 묶음별 목록, 0곳인 묶음은 소제목째 숨김, 둘 다 0이면 빈 상태 문구, groups 없으면 기존 한 목록(소제목 없음)", () => {
  const g = [{ title: "우리 동네 · 성남시", places: [mk("s1"), mk("s2")] }, { title: "가까운 지역 · 경기도", places: [mk("y1", { district: "용인시" })] }];
  const h = PV.render({ places: [], groups: g, filters: {} });
  assert.ok(h.indexOf("우리 동네 · 성남시") < h.indexOf('data-places-id="s1"') && h.indexOf('data-places-id="s2"') < h.indexOf("가까운 지역 · 경기도") && h.indexOf("가까운 지역 · 경기도") < h.indexOf('data-places-id="y1"'));
  assert.strictEqual((h.match(/places-group-title/g) || []).length, 2);
  const one = PV.render({ places: [], groups: [g[0], { title: "가까운 지역 · 경기도", places: [] }], filters: {} });
  assert.ok(one.includes("우리 동네") && !one.includes("가까운 지역") && (one.match(/<div class="places-list">/g) || []).length === 1);
  assert.ok(PV.render({ places: [], groups: [{ title: "x", places: [] }], filters: { free: true } }).includes("조건에 맞는 곳이 없어요"));
  const flat = PV.render({ places: [mk("s1")], filters: {} });
  assert.ok(!flat.includes("places-group-title") && flat.includes('data-places-id="s1"'));
  assert.ok(!PV.render({ places: [], groups: [{ title: "<u>", places: [mk("z")] }], filters: {} }).includes("<u>"), "이스케이프");
  assert.strictEqual(PV.TEXT.groupMine("성남시"), "우리 동네 · 성남시");
  assert.strictEqual(PV.TEXT.groupNear("경기도"), "가까운 지역 · 경기도");
});
function env(o) {
  const a = APP.indexOf("  let placesFilters ="), b = APP.indexOf("  async function renderPlacesTab() {");
  const sb = { Places: P, PlacesView: PV, ChildTimeline: { ageLabelAt: () => "7개월" }, placesData: o.data, placesCat: o.cat || "ALL", profile: o.profile === undefined ? { name: "수아", province: "경기도", district: "성남시", birthDate: new Date(2026, 2, 2) } : o.profile, isPregnant: () => false, childDisplayName: () => "수아", ageInMonths: () => 7 };
  vm.createContext(sb);
  vm.runInContext(APP.slice(a, b).replace(/^  let (\w+) =/gm, "var $1 =") + "\n;globalThis.__t = { placesViewHtml, get filters() { return placesFilters; }, setBrowse(v) { placesBrowse = v; } };", sb);
  return sb.__t;
}
const DATA = { places: [mk("s1", { indoor: "INDOOR", cost: "FREE" }), mk("s2", { category: "MUSEUM" }), mk("y1", { district: "용인시", indoor: "INDOOR" }), mk("y2", { district: "용인시", cost: "FREE", category: "MUSEUM" }), mk("g1", { province: "서울특별시", district: "구로구" })] };
const order = (h) => [...h.matchAll(/data-places-id="([^"]+)"/g)].map((m) => m[1]);
test("성남 사용자: '우리 동네 · 성남시'(성남) 먼저, '가까운 지역 · 경기도'(용인 등 같은 시·도) 아래, 다른 시·도는 제외", () => {
  const h = env({ data: DATA }).placesViewHtml();
  assert.ok(h.includes("우리 동네 · 성남시") && h.includes("가까운 지역 · 경기도") && !h.includes("서울특별시 구로구 · ") );
  assert.deepStrictEqual(order(h), ["s1", "s2", "y1", "y2"]);
  assert.ok(h.indexOf("우리 동네 · 성남시") < h.indexOf('data-places-id="s1"') && h.indexOf('data-places-id="s2"') < h.indexOf("가까운 지역 · 경기도") && !h.includes('data-places-id="g1"'));
});
test("분류·필터는 두 묶음 모두에 적용, 한 묶음이 0곳이면 그 소제목 숨김", () => {
  const t = env({ data: DATA });
  t.filters.indoor = true;
  let h = t.placesViewHtml();
  assert.deepStrictEqual(order(h), ["s1", "y1"]);
  assert.ok(h.includes("우리 동네") && h.includes("가까운 지역"));
  t.filters.indoor = false; t.filters.free = true;
  h = t.placesViewHtml();
  assert.deepStrictEqual(order(h), ["s1", "y2"]);
  const cat = env({ data: DATA, cat: "MUSEUM" });
  assert.deepStrictEqual(order(cat.placesViewHtml()), ["s2", "y2"]);
  const onlyNear = env({ data: { places: [mk("y1", { district: "용인시" }), mk("s1", { category: "MUSEUM" })] }, cat: "PARK" });
  const h2 = onlyNear.placesViewHtml();
  assert.ok(!h2.includes("우리 동네") && h2.includes("가까운 지역 · 경기도") && order(h2).join() === "y1"); // 성남 PARK 가 없으면 '우리 동네' 숨김(내 시군구 장소가 전혀 없을 때만 폴백)
});
test("폴백(준비 중 지역)·둘러보기·시군구 없음·프로필 없음은 소제목 없이 기존대로", () => {
  const fb = env({ data: DATA, profile: { name: "수아", province: "경기도", district: "수원시", birthDate: new Date(2026, 2, 2) } }).placesViewHtml();
  assert.ok(fb.includes("아직 이 지역은 준비 중이에요") && !fb.includes("places-group-title"));
  const br = env({ data: DATA }); br.setBrowse({ province: "경기도", district: "용인시" });
  const h = br.placesViewHtml();
  assert.ok(!h.includes("places-group-title") && order(h).join() === "y1,y2");
  const nodist = env({ data: DATA, profile: { name: "수아", province: "경기도", district: null, birthDate: new Date(2026, 2, 2) } }).placesViewHtml();
  assert.ok(!nodist.includes("places-group-title"));
  assert.ok(!env({ data: DATA, profile: null }).placesViewHtml().includes("places-group-title"));
});
test("실제 places.json: 성남 사용자는 두 묶음(성남·용인) 순서대로 / 데이터는 읽기만", () => {
  const data = JSON.parse(read("data/places.json"));
  const h = env({ data }).placesViewHtml();
  const hasN = data.places.some((p) => p.district === "성남시"), hasY = data.places.some((p) => p.district === "용인시" && p.province === "경기도");
  if (hasN && hasY) {
    assert.ok(h.indexOf("우리 동네 · 성남시") >= 0 && h.indexOf("가까운 지역 · 경기도") > h.indexOf("우리 동네 · 성남시"));
    const ids = order(h).map((id) => data.places.find((p) => p.id === id));
    const split = ids.findIndex((p) => p.district !== "성남시");
    assert.ok(ids.slice(0, split < 0 ? ids.length : split).every((p) => p.district === "성남시") && ids.slice(split < 0 ? ids.length : split).every((p) => p.district !== "성남시"), "성남 → 그 외 순서");
  }
  assert.deepStrictEqual(P.validateData(data), []);
});

console.log("G5 다른 지역 둘러보기 칩 묶기");
const R = (province, district) => ({ province, district });
test("시·도에 시군구 3개 이상이면 시·도 칩 하나, 미만이면 시군구 칩(라벨은 시·도명/시군구명), 칩 수가 시군구 수만큼 늘지 않는다", () => {
  const seoul = ["구로구", "강남구", "마포구", "송파구", "종로구", "중구"].map((d) => R("서울특별시", d));
  const regions = [...seoul, R("경기도", "성남시"), R("경기도", "용인시")];
  const h = PV.fallbackBox({ regions, current: null });
  const chips = [...h.matchAll(/data-places-browse="([^"]*)"[^>]*>([^<]*)</g)].map((m) => [m[1], m[2]]);
  assert.deepStrictEqual(chips.length, 3);
  assert.deepStrictEqual(chips.sort().map((c) => c[1]).sort(), ["서울특별시", "성남시", "용인시"]);
  assert.ok(h.includes('data-places-browse="서울특별시|"') && h.includes('data-places-browse="경기도|성남시"') && h.includes('data-places-browse="경기도|용인시"'));
  const two = PV.fallbackBox({ regions: [R("서울특별시", "구로구"), R("서울특별시", "강남구")], current: null });
  assert.ok(two.includes('data-places-browse="서울특별시|구로구"') && two.includes('data-places-browse="서울특별시|강남구"') && !two.includes('data-places-browse="서울특별시|"'), "2개 이하는 시군구 칩");
  const three = PV.fallbackBox({ regions: ["가", "나", "다"].map((d) => R("부산광역시", d)), current: null });
  assert.ok(three.includes('data-places-browse="부산광역시|"') && !three.includes("부산광역시|가"), "정확히 3개부터 묶음");
  const noDist = PV.fallbackBox({ regions: [R("세종특별자치시", null)], current: null });
  assert.ok(noDist.includes('data-places-browse="세종특별자치시|"') && noDist.includes(">세종특별자치시<"));
  const act = PV.fallbackBox({ regions, current: { province: "서울특별시", district: null } });
  assert.ok(/aria-pressed="true" data-places-browse="서울특별시\|"/.test(act) && /aria-pressed="false" data-places-browse="경기도\|성남시"/.test(act));
});
test("시·도 칩으로 보기: 그 시·도 전체를 소제목 없이(G4 규칙), 시군구 칩은 그 시군구만", () => {
  const data = { places: ["구로구", "강남구", "마포구"].map((d, i) => mk("s" + i, { province: "서울특별시", district: d })).concat([mk("y1", { district: "용인시" })]) };
  const e = env({ data, profile: { name: "수아", province: "부산광역시", district: "중구", birthDate: new Date(2026, 2, 2) } });
  e.setBrowse({ province: "서울특별시", district: null });
  const h = e.placesViewHtml();
  assert.deepStrictEqual(order(h), ["s0", "s1", "s2"]);
  assert.ok(!h.includes("places-group-title") && h.includes("아직 이 지역은 준비 중이에요") && h.includes('data-places-browse="서울특별시|"'));
  e.setBrowse({ province: "서울특별시", district: "강남구" });
  assert.deepStrictEqual(order(e.placesViewHtml()), ["s1"]);
  assert.ok(/const \[province, district\] = \(br\.getAttribute\("data-places-browse"\) \|\| ""\)\.split\("\|"\);\n\s*placesBrowse = province \? \{ province, district: district \|\| null \} : null;/.test(APP), "빈 시군구는 시·도 전체(null)");
});
console.log(`\n${passed}개 통과${process.exitCode ? ", 일부 실패" : ""}`);
