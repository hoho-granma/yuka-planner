/* G25 지역 교육 트렌드 메뉴(초등 이상) + 화면 틀 + 데이터 부족 상태. 실행: node test/g25-edu-trend.test.js */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const ET = require("../js/edu-trend.js");
const V = require("../js/over36-view.js");
const read = (f) => fs.readFileSync(path.join(__dirname, "..", f), "utf8");
const APP = read("js/app.js"), HTML = read("index.html"), CSS = read("css/style.css");
let passed = 0;
function test(name, f) { try { f(); passed++; console.log("  ok  - " + name); } catch (e) { process.exitCode = 1; console.log("  FAIL- " + name + "\n      " + (e.stack || e).split("\n").slice(0, 4).join("\n      ")); } }
function fn(name) { const i = APP.indexOf(`  function ${name}(`); assert.ok(i >= 0, name); return APP.slice(i, APP.indexOf("\n  }\n", i) + 4); }

test("최소 표본 상태: 30 미만=데이터 부족(수치 숨김), 30~99=참고용, 100 이상=충분 — 모르면(null) 부족", () => {
  assert.strictEqual(ET.statusFor(0).key, "INSUFFICIENT");
  assert.strictEqual(ET.statusFor(7).key, "INSUFFICIENT");
  assert.strictEqual(ET.statusFor(29).key, "INSUFFICIENT");
  assert.strictEqual(ET.statusFor(30).key, "REFERENCE");
  assert.strictEqual(ET.statusFor(99).key, "REFERENCE");
  assert.strictEqual(ET.statusFor(100).key, "SUFFICIENT");
  assert.strictEqual(ET.statusFor(null).key, "INSUFFICIENT");
  assert.strictEqual(ET.statusFor(undefined).label, "데이터 부족");
  assert.strictEqual(ET.STATUS.INSUFFICIENT.showNumbers, false);
});
test("학년: 3월 시작 학년도 기준 초1~6, 입학 전 0, 졸업 뒤 7 / 메뉴는 36개월부터", () => {
  const g = (b, y, m, d) => ET.gradeOf(new Date(b + "T00:00:00"), new Date(y, m - 1, d));
  assert.strictEqual(g("2016-06-20", 2026, 10, 4), 4);
  assert.strictEqual(g("2016-06-20", 2026, 2, 28), 3, "2월은 아직 전 학년도");
  assert.strictEqual(g("2016-06-20", 2026, 3, 1), 4);
  assert.strictEqual(g("2019-05-01", 2026, 10, 4), 1);
  assert.strictEqual(g("2020-05-01", 2026, 10, 4), 0);
  assert.strictEqual(g("2013-01-01", 2026, 10, 4), 7);
  assert.deepStrictEqual([ET.gradeLabel(3), ET.gradeLabel(0), ET.gradeLabel(7)], ["초3", "취학 전", "초등 이후"]);
  assert.strictEqual(ET.MENU_FROM_MONTHS, 36);
});
test("우리 아이 현재 상태: 이 아이의 학원(LESSON) 일정만, 삭제·취소 제외, 반복이면 주 n회 — 입력하지 않은 정보는 만들지 않는다", () => {
  const docs = [
    { id: "a", title: "영어 학원", category: "LESSON", scope: "CHILD", childKeys: ["c1"], recurrence: { freq: "WEEKLY", byDay: ["MO", "WE", "FR"] } },
    { id: "b", title: "수학 학원", category: "LESSON", scope: "CHILD", childKeys: ["FAM1"], recurrence: { freq: "WEEKLY", byDay: ["TU", "TH"] } },
    { id: "c", title: "일회성 특강", category: "LESSON", scope: "CHILD", childKeys: ["c1"] },
    { id: "d", title: "삭제됨", category: "LESSON", scope: "CHILD", childKeys: ["c1"], deletedAt: 5 },
    { id: "e", title: "취소됨", category: "LESSON", scope: "CHILD", childKeys: ["c1"], status: "CANCELLED" },
    { id: "f", title: "병원", category: "MEDICAL", scope: "CHILD", childKeys: ["c1"] },
    { id: "g", title: "다른 아이 학원", category: "LESSON", scope: "CHILD", childKeys: ["c2"] },
    { id: "h", title: "가족 행사", category: "LESSON", scope: "FAMILY" },
  ];
  const r = ET.myLessons(docs, ["c1", "FAM1"]);
  assert.strictEqual(r.count, 3);
  assert.deepStrictEqual(r.lessons.map((l) => [l.title, l.weekly]), [["수학 학원", 2], ["영어 학원", 3], ["일회성 특강", null]]);
  assert.deepStrictEqual(ET.myLessons([], ["c1"]), { count: 0, lessons: [] });
});
test("화면 구조(정의서 §9): ① 우리 아이 현재 상태 → ② 또래 범위 → ③ 지역·학년 트렌드 → ④ 다음 확인, 제목 '[지역] [학년] 교육 트렌드'", () => {
  const h = V.renderTrend({ region: "구로구", gradeLabel: "초4", inRange: true, mine: { count: 2, lessons: [{ title: "영어 학원", weekly: 3 }, { title: "특강", weekly: null }] }, status: ET.statusFor(null), canAdd: true });
  assert.ok(h.includes("구로구 초4 교육 트렌드") && h.includes("우리 동네 같은 학년 아이들은 어떻게 하고 있을까?"));
  const at = (k) => h.indexOf(`data-a36t="${k}"`);
  assert.ok(at("mine") > 0 && at("mine") < at("peer") && at("peer") < at("trend") && at("trend") < at("next"));
  assert.ok(h.includes("등록한 학원 일정 2개") && h.includes("주 3회") && h.includes("반복 없음"));
  assert.ok(h.includes('data-a36="trend-add"'));
});
test("데이터 부족: 평균·순위·비교 수치를 만들지 않는다(숫자 통계 문구 없음), 상태 배지·산출 기준 안내·개인정보 안내를 보인다", () => {
  const h = V.renderTrend({ region: "구로구", gradeLabel: "초4", inRange: true, mine: { count: 0, lessons: [] }, status: ET.statusFor(7), canAdd: true });
  assert.ok(h.includes('data-a36t-status="INSUFFICIENT"') && h.includes("데이터 부족") && h.includes("평균이나 순위를 보여 드리지 않아요"));
  assert.ok(!/평균 학원 수 \d|상위 \d+%|\d+위|또래 범위 안|또래보다/.test(h), "임의 수치·순위·비교 문구 금지");
  assert.ok(["학원", "많이 선택하는 과목", "영어", "수학"].every((t) => h.includes(`<h4>${t}</h4>`)) && (h.match(/데이터가 모이면 여기에 나와요/g) || []).length === 4);
  assert.ok(h.includes("동의가 필요해요") && h.includes("통계용으로 수집하지 않아요") && h.includes("개인을 알아볼 수 있는 정보가 나오지 않아요"));
  assert.ok(h.includes("아직 등록한 학원 일정이 없어요"));
  assert.ok(V.renderTrend({ region: "x", gradeLabel: "초등 이후", inRange: false, mine: { count: 0, lessons: [] }, status: ET.statusFor(null) }).includes("초등 학년 범위를 벗어났어요"));
  // 가짜 통계 금지: 모듈 어디에도 하드코딩된 통계 수치(평균·퍼센트)가 없다
  assert.ok(!/평균 \d|\d+%|\d+\.\d개/.test(read("js/edu-trend.js").replace(/\/\*[\s\S]*?\*\//g, "")));
});
test("메뉴: 36개월 이상 아이에게만 5번째 탭(JS 가 만든다), 35개월·임신 중·OFF 는 없음, 정적 index.html·OFF 화면 변경 없음", () => {
  const src = fn("acct36Sync");
  assert.ok(src.includes('ageInMonths(profile.birthDate, new Date()) >= EduTrend.MENU_FROM_MONTHS') && /const trend = on && typeof EduTrend !== "undefined"/.test(src), "36+ 판정 안에서만");
  assert.ok(src.includes('if (!trend && currentTab === "trend") switchTab("home");'));
  assert.ok(fn("acct36EnsureTrend").includes('btn.dataset.nav = "trend"') && fn("acct36EnsureTrend").includes('TAB_NAMES.push("trend")'));
  assert.ok(/switchTabBase\.call[\s\S]*?name === "trend" && acct36Active\(\)/.test(APP));
  assert.ok(!HTML.includes('data-nav="trend"') && !HTML.includes("tab-trend") && !HTML.includes("교육 트렌드"));
  assert.ok(/<script src="js\/edu-trend\.js\?v=\d+"><\/script>/.test(HTML) && read("sw.js").includes('"./js/edu-trend.js"'));
  const sb = { EduTrend: ET, ageInMonths: (b) => b.m, acctEnabled: () => true };
  vm.createContext(sb);
  const trendOn = (m, stage, on = true) => vm.runInContext(`(() => { const profile = { birthDate: { m: ${m} }, stage: "${stage}" }; const on = ${on} && profile.stage !== "pregnant" && ${m} >= 36; return on && typeof EduTrend !== "undefined" && ageInMonths(profile.birthDate, new Date()) >= EduTrend.MENU_FROM_MONTHS; })()`, sb);
  assert.deepStrictEqual([trendOn(84, "born"), trendOn(36, "born"), trendOn(35, "born"), trendOn(100, "pregnant"), trendOn(100, "born", false)], [true, true, false, false, false]);
});
test("CSS 는 body.acct-design 범위, 탭 스와이프 순서에는 보이는 탭이라 자동 포함(DOM 순서)", () => {
  const i = CSS.indexOf("/* ===== G25:");
  const rules = CSS.slice(i).replace(/\/\*[\s\S]*?\*\//g, "").split("}").map((r) => r.split("{")[0].trim()).filter(Boolean);
  assert.ok(rules.length > 10);
  rules.forEach((sel) => sel.split(",").forEach((x) => assert.ok(x.trim().startsWith("body.acct-design"), x)));
  assert.ok(/acct23Order = \(\) => \[\.\.\.document\.querySelectorAll\("\.bottom-nav \.nav-item:not\(\.hidden\)/.test(APP));
});
console.log(`\n${passed}개 통과`);
