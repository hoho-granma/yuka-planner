/* tools/add-places.js: 검증·중복 검사·서식 유지·coverage 갱신. 실행: node test/add-places-tool.test.js */
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync, spawnSync } = require("child_process");
const { addPlaces, serialize } = require("../tools/add-places.js");
const P = require("../js/places.js");
const ROOT = path.join(__dirname, "..");
const real = fs.readFileSync(path.join(ROOT, "data/places.json"), "utf8");
const data = JSON.parse(real);
const mk = (id, o) => ({ id, name: id, category: "PARK", province: "서울특별시", district: "서대문구", ageMonths: null, indoor: null, cost: null, reservation: null, address: "서울특별시 서대문구 주소", officialUrl: "https://x.kr/" + id, summary: "요약", checkedAt: "2026-10-03", example: false, notice: null, lat: 37.45, lng: 126.9, ...o });
let passed = 0;
function test(name, fn) { try { fn(); passed++; console.log("  ok  - " + name); } catch (e) { process.exitCode = 1; console.log("  FAIL- " + name + "\n      " + (e.stack || e).split("\n").slice(0, 4).join("\n      ")); } }

test("기존 places.json 은 도구 서식과 같다(덧붙여도 기존 줄이 바뀌지 않는다)", () => {
  assert.strictEqual(serialize(data), real);
  const r = addPlaces(data, [mk("seoul-seodaemun-park-001", {})]);
  assert.ok(r.ok, r.errors.join());
  assert.ok(serialize(r.data).startsWith(real.slice(0, real.lastIndexOf("\n  ]"))), "기존 장소 서식 유지");
});
test("정상: 덧붙이기·키 순서(기존과 같음)·lat/lng 누락은 null+경고·coverage 에 새 지역만 추가", () => {
  const { lat, lng, ...noGeo } = mk("seoul-seodaemun-park-002", { name: "다른공원" });
  const r = addPlaces(data, [mk("seoul-seodaemun-park-001", {}), noGeo, mk("gyeonggi-suwon-park-001", { province: "경기도", district: "수원시", name: "수원공원" })]);
  assert.ok(r.ok, r.errors.join());
  assert.deepStrictEqual(r.added, ["seoul-seodaemun-park-001", "seoul-seodaemun-park-002", "gyeonggi-suwon-park-001"]);
  assert.strictEqual(r.data.places.length, data.places.length + 3);
  const added = r.data.places[data.places.length + 1];
  assert.deepStrictEqual([added.lat, added.lng], [null, null]);
  assert.ok(r.warnings.some((w) => w.includes("lat 없음")));
  assert.deepStrictEqual(Object.keys(r.data.places[data.places.length]), Object.keys(data.places[0]), "기존 장소와 같은 키 순서");
  assert.strictEqual(r.data.coverage, data.coverage + "·서대문구·수원시");
  assert.strictEqual(addPlaces(data, [mk("seoul-seodaemun-park-003", { province: "경기도", district: "용인시", name: "용인새공원" })]).data.coverage, data.coverage, "이미 있는 지역은 그대로");
  assert.deepStrictEqual(P.validateData(r.data), []);
  assert.strictEqual(data.places.length, JSON.parse(real).places.length, "입력 데이터는 바뀌지 않는다");
});
test("거부: id 중복(기존·입력 안)·같은 지역 같은 이름(공백 무시)·validateData 오류·형식 오류 — 거부하면 data 는 그대로", () => {
  const ex = data.places[0];
  const bad = (input) => addPlaces(data, input);
  assert.ok(bad([mk(ex.id, {})]).errors.some((e) => e.includes("id 중복")));
  assert.ok(bad([mk("a-b-c-001", {}), mk("a-b-c-001", { name: "다름" })]).errors.some((e) => e.includes("id 중복")));
  assert.ok(bad([mk("a-b-c-002", { province: ex.province, district: ex.district, name: ex.name.replace(/(.)/, "$1 ") })]).errors.some((e) => e.includes("같은 이름")), "공백만 다른 이름도 중복");
  assert.ok(bad([mk("a-b-c-003", { province: "경기도", district: "수원시", name: ex.name })]).ok, "다른 지역이면 같은 이름 허용");
  assert.ok(bad([mk("a-b-c-004", { officialUrl: "http://x.kr" })]).errors.some((e) => e.includes("officialUrl")));
  assert.ok(bad([mk("A_B", {})]).errors.some((e) => e.includes("id")));
  assert.ok(bad([mk("a-b-c-005", { summary: "인기 최고" })]).errors.some((e) => e.includes("summary")));
  assert.ok(bad([mk("a-b-c-006", { extra: 1 })]).errors.some((e) => e.includes("extra")));
  assert.ok(bad([]).errors.length && bad({}).errors.length && bad([5]).errors.length);
  assert.strictEqual(bad([mk(ex.id, {})]).data, data);
});
test("CLI: --dry-run 은 쓰지 않고, 오류면 종료 코드 1·파일 불변, 성공하면 기존 서식으로 기록", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "addplaces-"));
  const dp = path.join(dir, "places.json"), ip = path.join(dir, "in.json");
  fs.writeFileSync(dp, real);
  const run = (...a) => spawnSync("node", [path.join(ROOT, "tools/add-places.js"), ...a], { encoding: "utf8" });
  fs.writeFileSync(ip, JSON.stringify([mk("seoul-seodaemun-park-001", {})]));
  assert.strictEqual(run(ip, "--data", dp, "--dry-run").status, 0);
  assert.strictEqual(fs.readFileSync(dp, "utf8"), real);
  fs.writeFileSync(ip, JSON.stringify([mk(data.places[0].id, {})]));
  const bad = run(ip, "--data", dp);
  assert.ok(bad.status === 1 && bad.stderr.includes("id 중복") && fs.readFileSync(dp, "utf8") === real);
  fs.writeFileSync(ip, JSON.stringify([mk("seoul-seodaemun-park-001", {})]));
  assert.strictEqual(run(ip, "--data", dp).status, 0);
  const out = JSON.parse(fs.readFileSync(dp, "utf8"));
  assert.strictEqual(out.places.length, data.places.length + 1);
  assert.strictEqual(fs.readFileSync(dp, "utf8"), serialize(out));
  assert.strictEqual(run("--data", dp).status, 2);
  assert.strictEqual(fs.readFileSync(path.join(ROOT, "data/places.json"), "utf8"), real, "실제 places.json 은 건드리지 않았다");
});
console.log(`\n${passed}개 통과${process.exitCode ? ", 일부 실패" : ""}`);
