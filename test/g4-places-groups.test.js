/*
 * G4 → P2: 어디갈까 목록의 두 묶음·지역 둘러보기를 없애고 한 목록으로(카드의 시·군·구 표기는 유지). 실행: node test/g4-places-groups.test.js
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
test("P2: 우리 동네·가까운 지역 묶음, 다른 지역 둘러보기·준비 중 안내, 편집 추천 표기가 모두 없다(목록 하나)", () => {
  const h = PV.render({ places: [mk("s1"), mk("y1", { district: "용인시" })], groups: [{ title: "우리 동네 · 성남시", places: [mk("s1")] }], category: "ALL", status: "준비 중" });
  assert.deepStrictEqual((h.match(/class="places-list"/g) || []).length, 1);
  assert.ok(!/places-group-title|places-fallback|편집 추천|준비 중|둘러보기|places-ctx/.test(h) && !h.includes("data-places-browse"));
  assert.strictEqual(PV.fallbackBox, undefined);
  assert.ok(!APP.includes("placesBrowse") && !APP.includes("groupMine") && !PV.TEXT.groupMine);
});
console.log(`\n${passed}개 통과${process.exitCode ? ", 일부 실패" : ""}`);
