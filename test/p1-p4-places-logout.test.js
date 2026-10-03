/* P1 로그아웃 즉시·P2 어디갈까 정리·P3 거리 필터/정렬·P4 인기순. 실행: node test/p1-p4-places-logout.test.js */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const P = require("../js/places.js");
const PV = require("../js/places-view.js");
const read = (f) => fs.readFileSync(path.join(__dirname, "..", f), "utf8");
const APP = read("js/app.js");
let passed = 0;
async function test(name, fn) { try { await fn(); passed++; console.log("  ok  - " + name); } catch (e) { process.exitCode = 1; console.log("  FAIL- " + name + "\n      " + (e.stack || e).split("\n").slice(0, 5).join("\n      ")); } }
const mk = (id, o) => ({ id, name: id, category: "PARK", province: "서울특별시", district: "구로구", ageMonths: null, indoor: null, cost: null, reservation: null, address: "주소 " + id, officialUrl: "https://x.kr/" + id, summary: "요약", checkedAt: "2026-10-01", example: false, notice: null, ...o });
const O = { name: "구로구청", lat: 37.4954, lng: 126.8874 };
const at = (dLat, dLng) => ({ lat: O.lat + dLat, lng: O.lng + dLng });

(async () => {
  console.log("P3 순수 함수");
  await test("haversineKm·estDriveMin: 상수 export, 공식 round(km×1.3÷30×60)", () => {
    assert.deepStrictEqual([P.ROAD_FACTOR, P.DRIVE_SPEED_KMH], [1.3, 30]);
    assert.strictEqual(P.haversineKm(O, O), 0);
    const km = P.haversineKm(O, { lat: 37.5665, lng: 126.978 }); // 구로구청 → 서울시청 약 11.3km
    assert.ok(km > 11 && km < 11.6, String(km));
    assert.strictEqual(P.estDriveMin(10), Math.round((10 * P.ROAD_FACTOR / P.DRIVE_SPEED_KMH) * 60));
    assert.deepStrictEqual([P.estDriveMin(0), P.estDriveMin(10), P.estDriveMin(null), P.estDriveMin(-1)], [0, 26, null, null]);
    assert.strictEqual(P.haversineKm(O, { lat: "x", lng: 1 }), null);
  });
  await test("originOf: 키 '시·도|시·군·구' → 기준점, 없거나 좌표 없으면 null", () => {
    const offices = { "서울특별시|구로구": O, "경기도|성남시": { name: "성남시청" } };
    assert.deepStrictEqual(P.originOf(offices, "서울특별시", "구로구"), O);
    assert.deepStrictEqual([P.originOf(offices, "경기도", "성남시"), P.originOf(offices, "서울특별시", "금천구"), P.originOf(null, "a", "b"), P.originOf(offices, "서울특별시", "")], [null, null, null, null]);
  });
  const near = mk("near", at(0.05, 0)), mid = mk("mid", at(0.25, 0)), far = mk("far", at(0.6, 0)), none = mk("none", {});
  const list = [far, none, near, mid];
  await test("filterByDrive: 30/60/90분 이내만, 좌표 없는 장소는 시간 필터에서 빠지고, 전체(null)·기준점 없음은 그대로", () => {
    const m = (p) => P.driveMinFrom(p, O);
    assert.ok(m(near) <= 30 && m(mid) > 30 && m(mid) <= 90 && m(far) > 90, [m(near), m(mid), m(far)].join());
    assert.deepStrictEqual(P.filterByDrive(list, O, 30).map((p) => p.id), ["near"]);
    assert.deepStrictEqual(P.filterByDrive(list, O, 90).map((p) => p.id), ["near", "mid"]);
    assert.deepStrictEqual(P.filterByDrive(list, O, null).map((p) => p.id), ["far", "none", "near", "mid"]);
    assert.deepStrictEqual(P.filterByDrive(list, null, 30).map((p) => p.id), ["far", "none", "near", "mid"]);
    assert.deepStrictEqual(P.DRIVE_CHOICES, [30, 60, 90]);
  });
  await test("sortPlaces: 가까운순(좌표 없는 곳은 맨 뒤), 인기순(count 내림차순·같으면 가까운순), 기준점 없으면 가까운순은 원래 순서", () => {
    assert.deepStrictEqual(P.sortPlaces(list, "near", O, {}).map((p) => p.id), ["near", "mid", "far", "none"]);
    assert.deepStrictEqual(P.sortPlaces(list, "popular", O, { far: { count: 5 }, mid: { count: 5 }, near: { count: 1 } }).map((p) => p.id), ["mid", "far", "near", "none"]);
    assert.deepStrictEqual(P.sortPlaces(list, "popular", O, undefined).map((p) => p.id), ["near", "mid", "far", "none"], "데이터 없으면 사실상 가까운순");
    assert.deepStrictEqual(P.sortPlaces(list, "near", null, {}).map((p) => p.id), ["far", "none", "near", "mid"]);
    assert.deepStrictEqual(list.map((p) => p.id), ["far", "none", "near", "mid"], "입력 배열은 바뀌지 않는다");
  });
  await test("validatePlace: lat·lng 는 숫자 또는 null(범위 검사), 없어도 통과", () => {
    assert.deepStrictEqual(P.validatePlace(mk("a", {})), []);
    assert.deepStrictEqual(P.validatePlace(mk("a", { lat: 37.5, lng: 126.9 })), []);
    assert.deepStrictEqual(P.validatePlace(mk("a", { lat: null, lng: null })), []);
    for (const bad of [{ lat: "37" }, { lat: 91 }, { lng: 181 }, { lng: NaN }]) assert.ok(P.validatePlace(mk("a", bad)).length > 0, JSON.stringify(bad));
  });

  console.log("P2·P3 화면");
  const T = new Date(2026, 9, 3);
  await test("거리·정렬 칩: 거리 4개(전체·30분·1시간·1시간 30분 이내) 한 줄 하나 선택 + 정렬(가까운순·인기순), 카테고리·필터와 함께 있다", () => {
    const h = PV.render({ places: [near], category: "ALL", filters: {}, origin: O, driveMax: 60, sort: "near", today: T });
    assert.deepStrictEqual([...h.matchAll(/data-places-drive="([^"]+)"/g)].map((m) => m[1]), ["all", "30", "60", "90"]);
    assert.ok(["전체", "30분 이내", "1시간 이내", "1시간 30분 이내"].every((t) => h.includes(`>${t}<`)) && h.includes(">가까운순<") && h.includes(">인기순<"));
    assert.strictEqual((h.match(/places-drive-chip active/g) || []).length, 1);
    assert.ok(/places-drive-chip active" aria-pressed="true" data-places-drive="60"/.test(h) && /places-sort-chip active" aria-pressed="true" data-places-sort="near"/.test(h));
    assert.ok(h.includes('data-places-cat="ALL"') && h.includes('data-places-filter="indoor"') && !h.includes("프로필에서 지역을 정하면"));
  });
  await test("카드: 우상단 칩 '차로 약 N분'(약 필수, 본문 줄·기준점 중복 없음), 좌표 없으면 줄 없음, 출처 표기", () => {
    const h = PV.render({ places: [near, none], origin: O, today: T });
    assert.ok(h.includes(`<span class="places-ph-tm">차로 약 ${Math.max(1, P.driveMinFrom(near, O))}분</span>`) && !h.includes("places-drive\"") && !h.includes("구로구청 기준"));
    assert.strictEqual((h.match(/places-ph-tm">/g) || []).length, 1);
    assert.ok(h.includes("거리: 직선거리로 추정한 차량 이동 시간 · 위치 © OpenStreetMap contributors"));
    assert.strictEqual(PV.TEXT.driveNote(0, "구로구청").startsWith("차로 약 0분"), true);
  });
  await test("D1: 거리 칩 바로 위에 '{기준점}에서 차로 걸리는 시간(직선거리로 추정)' 한 줄(fine-print), 기준점이 없으면 이 줄은 숨기고 비활성 안내만", () => {
    const h = PV.render({ places: [near], origin: O, today: T });
    const line = '<p class="fine-print places-drive-basis">구로구청에서 차로 걸리는 시간(직선거리로 추정)</p>';
    assert.ok(h.includes(line) && h.indexOf(line) < h.indexOf('class="places-drive-row"') && h.indexOf(line) > h.indexOf('data-places-cat="ALL"'));
    assert.strictEqual(PV.TEXT.driveBasis("성남시청"), "성남시청에서 차로 걸리는 시간(직선거리로 추정)");
    assert.ok(!PV.render({ places: [near], origin: { ...O, name: "<b>" }, today: T }).includes("<b>에서"), "이스케이프");
    const no = PV.render({ places: [near], origin: null, today: T });
    assert.ok(!no.includes("places-drive-basis") && no.includes("프로필에서 지역을 정하면 거리로 볼 수 있어요"));
  });
  await test("기준점 없음: 거리 칩·가까운순 비활성 + 안내, 인기순은 선택 가능, 카드에 이동 시간 없음", () => {
    const h = PV.render({ places: [near], origin: null, today: T });
    assert.ok(h.includes("프로필에서 지역을 정하면 거리로 볼 수 있어요"));
    assert.strictEqual((h.match(/data-places-drive="(30|60|90)" disabled|data-places-drive="(30|60|90)"[^>]*disabled/g) || []).length, 3);
    assert.ok(/data-places-sort="near" disabled/.test(h) && !/data-places-sort="popular" disabled/.test(h) && !h.includes("places-drive\">"));
  });
  await test("P2: '우리 동네' 묶음·'편집 추천'·'준비 중'·지역 둘러보기·아이 정보 카드 제거(소스 포함)", () => {
    const h = PV.render({ places: [near], child: { name: "수아", ageLabel: "7개월" }, region: { province: "서울특별시", district: "구로구" }, status: "준비 중", origin: O, today: T });
    assert.ok(!/편집 추천|준비 중|우리 동네|둘러보기|places-ctx|수아/.test(h));
    assert.ok(!APP.includes("placesBrowse") && !APP.includes("places-ctx") && !read("js/places-view.js").includes("fallbackBox"));
  });
  await test("D3: 상세 시트 [길찾기](카카오맵 link/to/{장소명},{lat},{lng}, 좌표 있을 때만) + '차로 약 N분 · 기준점 기준'", () => {
    const pl = mk("g", { name: "개봉도서관", ...at(0.05, 0) });
    assert.strictEqual(PV.routeUrl(pl), `https://map.kakao.com/link/to/${encodeURIComponent("개봉도서관")},${pl.lat},${pl.lng}`);
    assert.strictEqual(PV.routeUrl(mk("n", { name: "a,b", lat: 1.5, lng: 2.5 })), "https://map.kakao.com/link/to/a%20b,1.5,2.5");
    assert.deepStrictEqual([PV.routeUrl(mk("n", {})), PV.routeUrl(mk("n", { lat: null, lng: null })), PV.routeUrl(mk("n", { lat: 37 }))], ["", "", ""]);
    const h = PV.renderDetail(pl, { mode: "info", origin: O, today: T });
    assert.ok(h.includes(`href="${PV.routeUrl(pl)}"`) && h.includes(">길찾기<") && h.includes(">지도에서 보기<") && h.indexOf(">지도에서 보기<") < h.indexOf(">길찾기<"));
    assert.ok(new RegExp(`차로 약 ${Math.max(1, P.driveMinFrom(pl, O))}분 · 구로구청 기준`).test(h));
    const none = PV.renderDetail(mk("n", {}), { mode: "info", origin: O, today: T });
    assert.ok(!none.includes("길찾기") && !none.includes("차로 약") && none.includes("지도에서 보기"));
    assert.ok(!PV.renderDetail(pl, { mode: "info", origin: null, today: T }).includes("차로 약") && PV.renderDetail(pl, { mode: "info", origin: null, today: T }).includes("길찾기"));
    assert.ok(APP.includes("PlacesView.renderDetail(r.place, { origin: profile ? Places.originOf(placesOffices, profile.province, profile.district) : null,"));
  });
  await test("실제 data/places.json 은 좌표 필드가 없어도(또는 있어도) 전부 검증 통과", () => {
    assert.deepStrictEqual(P.validateData(JSON.parse(read("data/places.json"))), []);
  });

  console.log("P4 인기 신호");
  const env = (store, fb) => {
    const sets = [];
    const sb = { console, JSON, Promise, toISODate: () => store.__day || "2026-10-03", localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => (store[k] = v) },
      firebase: fb === null ? undefined : { firestore: Object.assign(() => ({ collection: (c) => ({ doc: (id) => ({ set: async (d, o) => { if (fb === "fail") throw new Error("denied"); sets.push([c, id, d, o]); } }) }) }), { FieldValue: { increment: (n) => ({ inc: n }), serverTimestamp: () => "ts" } }) } };
    vm.createContext(sb);
    const a = APP.indexOf("  const PLACES_COUNTED_KEY"), b = APP.indexOf("  let placesFilters =");
    vm.runInContext("var placesStats = {};\n" + APP.slice(a, b).replace(/^  const (\w+) =/gm, "var $1 =") + "\n;globalThis.__t = { placesCountOnce, get stats() { return placesStats; } };", sb);
    return { t: sb.__t, sets, store };
  };
  await test("placesCountOnce: increment(1)+updatedAt 로 placeStats/{id} 에 쓰고, 같은 기기·같은 장소는 하루 1회만(다음 날은 다시)", async () => {
    const store = {};
    const e = env(store);
    await e.t.placesCountOnce("p1");
    await e.t.placesCountOnce("p1");
    await e.t.placesCountOnce("p2");
    assert.deepStrictEqual(JSON.parse(JSON.stringify(e.sets)), [["placeStats", "p1", { count: { inc: 1 }, updatedAt: "ts" }, { merge: true }], ["placeStats", "p2", { count: { inc: 1 }, updatedAt: "ts" }, { merge: true }]]);
    assert.deepStrictEqual(JSON.parse(store.hannun_place_counted), { p1: "2026-10-03", p2: "2026-10-03" });
    store.__day = "2026-10-04";
    await e.t.placesCountOnce("p1");
    assert.strictEqual(e.sets.length, 3);
    await e.t.placesCountOnce("");
    assert.strictEqual(e.sets.length, 3);
  });
  await test("쓰기가 실패해도(규칙 미배포) 조용히 무시, firebase 가 없어도 예외 없음", async () => {
    await env({}, "fail").t.placesCountOnce("p1");
    await env({}, null).t.placesCountOnce("p1");
  });
  await test("firestore.rules 초안: placeStats 는 get/list 공개, create count==1, update count 정확히 +1, 키는 count·updatedAt 뿐, 삭제 금지", () => {
    const r = read("firestore.rules");
    const blk = r.slice(r.indexOf("match /placeStats/{placeId}"), r.indexOf("// 그 외 모든 경로"));
    assert.ok(/allow get, list: if true;/.test(blk) && /allow create:[\s\S]*hasOnly\(\['count', 'updatedAt'\]\)[\s\S]*count == 1/.test(blk) && /allow update:[\s\S]*hasOnly\(\['count', 'updatedAt'\]\)[\s\S]*count == resource\.data\.count \+ 1/.test(blk) && /allow delete: if false;/.test(blk));
  });
  await test("앱 연결: 등록 성공 때만 +1, 인기순 정렬은 placesStats 를 쓰고 숫자는 화면에 내지 않는다", () => {
    assert.ok(APP.includes("placesCountOnce(r.place.id);") && APP.includes("Places.sortPlaces(list, sort, origin, placesStats)"));
    const h = PV.render({ places: [near], origin: O, sort: "popular", today: T });
    assert.ok(!/\b\d+\s*(회|명|건)\b/.test(h.replace(/\d+분|\d+개월/g, "")));
  });

  console.log("P1 로그아웃");
  await test("확인 시트 없이 바로 signOut → 가구 연결 정리 → 첫 화면(아이가 있어도), 서버 데이터는 지우지 않는다(소스)", () => {
    const i = APP.indexOf('if (action === "logout" || action === "confirm-logout")');
    const blk = APP.slice(i, APP.indexOf("    if (action === ", i + 20));
    assert.ok(blk.includes("acct.svc.signOut()") && blk.includes("hhLeaveLocal()") && /closeDetail\(\);\n\s*showLandingView\(\);/.test(blk) && blk.includes("acctBrowse = false;"));
    assert.ok(!/HouseholdSync\.(create|update|upsert|patch|remove|reissue)/.test(blk) && !/saveProfile|saveCompleted/.test(blk));
    assert.ok(!APP.includes('acctShowSheet("logout")'));
  });
  console.log(`\n${passed}개 통과${process.exitCode ? ", 일부 실패" : ""}`);
})();
