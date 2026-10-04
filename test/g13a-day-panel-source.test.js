/* G13-1 날짜 패널: 일정마다 '자동'(접종·검진·혜택 같은 자동 항목) / '직접 입력'(가족이 등록한 일정) 라벨. 실행: node test/g13a-day-panel-source.test.js */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const USV = require("../js/user-schedule-view.js");
const APP = fs.readFileSync(path.join(__dirname, "..", "js/app.js"), "utf8");
const CSS = fs.readFileSync(path.join(__dirname, "..", "css/style.css"), "utf8");
let passed = 0;
function test(name, fn) { try { fn(); passed++; console.log("  ok  - " + name); } catch (e) { process.exitCode = 1; console.log("  FAIL- " + name + "\n      " + (e.stack || e).split("\n").slice(0, 4).join("\n      ")); } }
test("직접 입력 카드: 라벨을 달지 않는다(모든 계정) — html 그대로", () => {
  const card = '<button class="us-card"><span class="us-bar"></span><span class="us-body"><strong class="us-title">하원 픽업</strong></span></button>';
  const out = USV.sourceLabeled(card, "user");
  assert.strictEqual(out, card);
  assert.ok(!out.includes("직접 입력") && !out.includes("us-src"));
});
test("자동 항목 카드: 제목 앞에 '자동' 라벨", () => {
  const card = '<div class="event-item" data-id="a1"><div class="body"><p class="title">DTaP 4차</p></div></div>';
  const out = USV.sourceLabeled(card, "auto");
  assert.ok(out.includes('<p class="title"><span class="us-src us-src-auto">자동</span>DTaP 4차</p>') || out.includes('<span class="us-src us-src-auto">자동</span><p class="title">'));
  assert.ok(out.includes("DTaP 4차") && out.includes('data-id="a1"'));
});
test("앵커(제목 태그)가 없으면 html 을 그대로 돌려준다", () => {
  assert.strictEqual(USV.sourceLabeled("<div>x</div>", "auto"), "<div>x</div>");
});
test("앱 연결: 날짜 패널 세 구역(추가한 일정=직접 입력, 혜택 신청 시작·추천 항목=자동)에만 적용, 플래그 OFF 가드(hhEnabled) 뒤", () => {
  const i = APP.indexOf("function usRenderDayPanel(");
  const fnSrc = APP.slice(i, APP.indexOf("\n  }\n", i));
  assert.ok(fnSrc.indexOf("if (!hhEnabled()) return;") < fnSrc.indexOf("sourceLabeled"));
  assert.strictEqual((fnSrc.match(/, "user"\)/g) || []).length, 1);
  assert.strictEqual((fnSrc.split('sourceLabeled(eventItemHtml(e), "auto")').length - 1), 2);
});
test("CSS: 자동=파랑 작은 라벨(직접 입력 라벨은 화면에 쓰지 않는다), MSG 문구", () => {
  assert.ok(/\.us-src-auto \{ background: #e8f0fe/.test(CSS) && /\.us-src-user \{ background: #ffe9f1/.test(CSS));
  assert.deepStrictEqual([USV.MSG.srcAuto, USV.MSG.srcUser], ["자동", "직접 입력"]);
});
console.log(`\n${passed}개 통과`);
