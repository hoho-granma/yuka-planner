// 2-5: 아이 100일·돌·생일 계산(저장 없음) — 순수 계산·직접 입력 우선·토글 기본 켜짐·앱 연결 확인
const test = require("node:test"), assert = require("node:assert"), fs = require("fs");
const A = require("../js/child-anniversaries.js");
test("100일=출생일+99일, 돌=1년 뒤 같은 월·일, 생일=2년째부터 매년, 임신 중이면 없음", () => {
  const r = A.compute({ key: "c", name: "하린", birthDate: new Date(2026, 5, 20) }, "2026-01-01", "2029-12-31");
  assert.deepStrictEqual(r.map((x) => [x.title, x.iso]), [["하린 100일", "2026-09-27"], ["하린 돌", "2027-06-20"], ["하린 생일", "2028-06-20"], ["하린 생일", "2029-06-20"]]);
  assert.deepStrictEqual(A.compute({ key: "c", name: "x", birthDate: new Date(2026, 5, 20), pregnant: true }, "2026-01-01", "2030-01-01"), []);
  assert.deepStrictEqual(A.compute({ key: "c", birthDate: new Date(2026, 5, 20) }, "2026-09-27", "2026-09-27").map((x) => x.title), ["100일"], "이름이 없으면 종류만");
  assert.ok(!r.some((x) => /세|번째/.test(x.title)), "나이 표기 없음");
});
test("2월 29일생: 평년 2/28 표시(feb29 안내), 윤년 2/29", () => {
  const r = A.compute({ key: "c", name: "a", birthDate: new Date(2024, 1, 29) }, "2025-01-01", "2029-01-01");
  assert.deepStrictEqual(r.map((x) => [x.kind, x.iso, x.feb29]), [["first", "2025-02-28", true], ["birthday", "2026-02-28", true], ["birthday", "2027-02-28", true], ["birthday", "2028-02-29", false]]);
});
test("직접 입력과 합치지 않고 둘 다 보인다(생일 분류가 생기기 전에는 숨기지 않음), 분류 모드에서도 칩 글자는 제목", () => {
  assert.strictEqual(A.hiddenByDirect, undefined);
  const app = fs.readFileSync(__dirname + "/../js/app.js", "utf8");
  assert.ok(!/hiddenByDirect/.test(app) && /anniv: true/.test(app));
  const V = require("../js/user-schedule-view.js");
  const h = V.cellChips([{ t: "a", title: "하린 생일", category: "생활·수유", anniv: true }, { t: "a", title: "BCG", category: "예방접종" }], { mode: "kids", catColor: true, links: [] });
  assert.ok(h.includes(">하린 생일<") && !h.includes(">생활<") && h.includes(">접종<"));
});
test("토글: 기본 켜짐·기기 저장 값 0이면 꺼짐·저장소 오류도 켜짐", () => {
  const mem = (v) => ({ getItem: () => v, setItem(k, x) { this.v = x; } });
  assert.strictEqual(A.isOn(mem(null)), true); assert.strictEqual(A.isOn(mem("0")), false); assert.strictEqual(A.isOn(mem("1")), true);
  assert.strictEqual(A.isOn({ getItem() { throw new Error("x"); } }), true);
  const m = mem(null); A.setOn(m, false); assert.strictEqual(m.v, "0");
});
test("앱 연결: 계산만(저장·Firestore 호출 없음), 토글 스위치·상세 시트·직접 일정 추가, 등록 파일", () => {
  const app = fs.readFileSync(__dirname + "/../js/app.js", "utf8");
  const blk = app.slice(app.indexOf("// ── 2-5 아이 100일"), app.indexOf("// ── C2-b1 AUTO 항목 연결"));
  assert.ok(blk.length > 500 && !/usSave|usPatch|usCreate|setDoc|addDoc|updateDoc|usDocs\(\)\.push/i.test(blk), "저장 경로 없음");
  assert.ok(/toggle-anniv/.test(app) && /data-anniv-act="add"/.test(app) && /usOpenForm\(null, d\)/.test(app));
  assert.ok(fs.readFileSync(__dirname + "/../index.html", "utf8").includes("js/child-anniversaries.js") && fs.readFileSync(__dirname + "/../sw.js", "utf8").includes("child-anniversaries.js"));
  const V = require("../js/user-schedule-view.js");
  assert.ok(V.renderFilterChips([], { mode: "kids", annivOn: true }).includes("toggle-anniv") && !V.renderFilterChips([], { mode: "kids" }).includes("toggle-anniv"));
});
test("비계정(가구 없음)에도 보인다: 사용 가능 판정은 usActive 와 무관, 점 달력·날짜 패널·토글 줄·시트(일정 추가는 가구가 있을 때만), 칩은 아이 색", () => {
  const app = fs.readFileSync(__dirname + "/../js/app.js", "utf8");
  assert.ok(/const usAnnivAvailable = \(\) => typeof ChildAnniversaries !== "undefined" && !!profile && !isPregnant\(\);/.test(app));
  assert.ok(/if \(!usActive\(\)\) \{ \/\/ 2-5/.test(app) && /renderSelectedDayPanel = function renderSelectedDayPanel\(\)/.test(app) && /UserScheduleView\.renderAnnivSwitch\(us\.annivOn\)/.test(app));
  assert.ok(/\$\{usActive\(\) \? `<button[^`]*data-anniv-act="add"/.test(app));
  const V = require("../js/user-schedule-view.js");
  assert.ok(V.renderAnnivSwitch(true).includes('aria-checked="true"') && V.renderAnnivSwitch(false).includes("toggle-anniv"));
  assert.ok(V.cellChips([{ t: "a", title: "하린 생일", anniv: true, color: "#f47ca8", category: "생활·수유" }], { mode: "kids", catColor: false, links: [], autoColor: "#000" }).includes("#f47ca8"), "기념일 칩은 아이 구성원 색");
});
