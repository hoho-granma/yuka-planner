// 3-1 어디갈까 '시설 유형 기준' 권장 나이: 공식 값 우선, 없는 곳(applyTo·excludeIds 제외)에만 데이터 문구+라벨, 못 읽으면 방문 전 확인. 나이 필터는 불변. 실행: node --test test/m17-places-age-basis.test.js
const test = require("node:test"), assert = require("node:assert"), fs = require("fs"), path = require("path");
const V = require("../js/places-view.js"), P = require("../js/places.js");
const rd = (p) => JSON.parse(fs.readFileSync(path.join(__dirname, "..", p), "utf8"));
const places = rd("data/places.json").places, basis = rd("data/policy/places-age-basis.json");
const byId = (id) => places.find((x) => x.id === id);
const li = (p) => { const h = V.renderDetail ? "" : ""; return V.renderCard(p, {}); };
test("공식 값이 없는 도서관·박물관(applyTo)에 데이터 문구 + '시설 유형 기준' 라벨", () => {
  V.setAgeBasis(basis);
  for (const [cat, list] of Object.entries(basis.applyTo)) for (const id of list) {
    const p = byId(id); assert.ok(p, id); assert.strictEqual(p.category, cat, id);
    const b = V.basisOf(p); assert.ok(b && b.text === basis.byCategory[cat].text && b.label === "시설 유형 기준", id);
  }
  const html = li(byId("gyeonggi-yongin-mus-001"));
  assert.ok(html.includes("박물관·전시는 만 3세(36개월) 이상 권장인 곳이 많아요") && html.includes("시설 유형 기준"));
});
test("공식 값 우선·excludeIds 제외·기준 없는 분류는 '방문 전 확인'", () => {
  V.setAgeBasis(basis);
  assert.ok(li(byId("seoul-lib-001")).includes("만 14세 미만") && !li(byId("seoul-lib-001")).includes("시설 유형 기준"), "공식 값이 있는 곳은 공식 값");
  for (const id of Object.keys(basis.excludeIds)) assert.strictEqual(V.basisOf(byId(id)), null, id);
  const other = places.find((p) => !basis.byCategory[p.category] && p.ageMonths == null); if (other) assert.ok(li(other).includes("방문 전 확인") && !li(other).includes("시설 유형 기준"));
});
test("파일을 못 읽으면 기존 '방문 전 확인', 나이 필터 판정은 기준표와 무관", () => {
  V.setAgeBasis(null); const p = byId("gyeonggi-yongin-mus-001"); assert.ok(li(p).includes("방문 전 확인") && !li(p).includes("시설 유형 기준"));
  const before = places.map((x) => P.ageFits(x, 12)); V.setAgeBasis(basis); assert.deepStrictEqual(places.map((x) => P.ageFits(x, 12)), before);
});
test("앱 연결: places.json 과 함께 읽고 실패해도 화면은 그대로(null 안전)", () => {
  const app = fs.readFileSync(path.join(__dirname, "..", "js/app.js"), "utf8");
  assert.ok(app.includes('loadJsonOrNull("data/policy/places-age-basis.json")') && app.includes("PlacesView.setAgeBasis(basis)"));
});
