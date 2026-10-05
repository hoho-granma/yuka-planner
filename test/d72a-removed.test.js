// D72a: 새 홈 미리보기(HomeSwitch·CuratedHome·HomeSlotsView·curation 플래그)와 기록 보기(records.js·records-view.js·#tab-record·프로필 '기록 보기') 삭제 — 저장 데이터는 건드리지 않고, 이전 홈 '지금 꼭 할 것' 카드는 이어서 동작.
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
let passed = 0;
function test(name, fn) { try { fn(); passed++; console.log("  ok  - " + name); } catch (e) { console.log("  FAIL - " + name + "\n" + e.stack); process.exitCode = 1; } }
const HTML = read("index.html"), SW = read("sw.js"), APP = read("js/app.js");

test("삭제된 파일이 없고 index.html·sw.js 목록에서도 빠졌다", () => {
  for (const f of ["js/home-switch.js", "js/home-slots-view.js", "js/curated-home.js", "css/home-slots.css", "js/records.js", "js/records-view.js"]) {
    assert.ok(!fs.existsSync(path.join(ROOT, f)), f);
    const base = f.replace(/^(js|css)\//, "");
    assert.ok(!HTML.includes(base) && !SW.includes(base), f + " 참조 없음");
  }
  assert.ok(HTML.includes("js/home-must.js") && HTML.includes("js/curation.js") && SW.includes("./js/curation.js"), "curation.js·home-must.js 는 보존");
});
test("새 홈: 앱·플래그에 스위치·큐레이션 홈 코드·curation 플래그 없음, MonthTiers·SubsidyTiers 는 영구 OFF 로 보존", () => {
  assert.ok(!/HomeSwitch|CuratedHome|HomeSlotsView|curatedHomeOn|homeSwitch|hannun_home_v2/.test(APP));
  assert.ok(APP.includes("const FEATURES_CURATION_ON = () => false;"));
  assert.ok(!/curation/.test(read("js/feature-flags.js").replace(/\/\/.*$/gm, "")));
  assert.ok(fs.existsSync(path.join(ROOT, "js/month-tiers.js")) && fs.existsSync(path.join(ROOT, "js/subsidy-tiers.js")));
});
test("이전 홈 '지금 꼭 할 것' 카드는 이어서 동작: HomeMust.unitOf 가 단위 key 로 찾고, 새 홈 조건 없이 그려진다", () => {
  const HM = require("../js/home-must.js");
  const cur = { now: [{ key: "a" }], soon: [{ key: "b" }], know: [], overflow: { now: [{ key: "c" }], soon: [], know: [] } };
  assert.strictEqual(HM.unitOf(cur, "b").key, "b"); assert.strictEqual(HM.unitOf(cur, "c").key, "c"); assert.strictEqual(HM.unitOf(cur, "x"), null); assert.strictEqual(HM.unitOf(null, "a"), null);
  assert.ok(APP.includes("HomeMust.unitOf(HMUST.cur"));
  const i = APP.indexOf("function homeMustHtml("), blk = APP.slice(i, APP.indexOf("\n  }\n", i));
  assert.ok(!blk.includes("FEATURES_CURATION_ON"));
});
test("기록 보기: 프로필 버튼·탭·진입 함수·저장소 호출이 앱에서 사라졌고, 저장된 기록 데이터 키는 지우는 코드가 없다(로컬 키는 나가기 정리 목록에만 있음)", () => {
  assert.ok(!/HNRecords|HNRecordsView|openRecordView|btn-view-records|btn-record-back|renderRecordTab|recordReturnTab/.test(APP));
  assert.ok(!HTML.includes('id="tab-record"') && !HTML.includes('data-nav="record"'));
  assert.ok(APP.includes('const TAB_NAMES = ["home", "calendar", "subsidy", "checklist", "places"];'));
  assert.ok(!/removeItem\([^)]*hannun_records/.test(APP), "기록 데이터를 지우는 코드 없음");
  assert.ok(!read("js/home.js").includes("data-rec") && !read("js/home.js").includes("HNRecordsView"));
});
console.log(`\n${passed}개 통과`);
