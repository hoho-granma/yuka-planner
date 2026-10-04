/*
 * K5 — UI 패키지: 칩 라벨(표시 이름)·칩 채움 CSS·담당 표시 숨김·시간 표기(D)·시간 범위 계산(B)·그날 시작하는 자동 항목.
 * 실행: node test/k5-ui-package.test.js
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const TR = require("../js/time-range.js");
const V = require("../js/user-schedule-view.js");
const ROOT = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
let passed = 0;
function test(name, fn) { try { fn(); passed++; console.log("  ok  - " + name); } catch (e) { process.exitCode = 1; console.log("  FAIL- " + name + "\n      " + (e.stack || e).split("\n").slice(0, 3).join("\n      ")); } }

console.log("시간 표기(D)");
test("종일 / 시작·끝(같은 오전·오후는 끝의 오전·오후 생략) / 끝 없음=시작만 / 시간 없음=빈 문자열", () => {
  assert.strictEqual(TR.displayText({ allDay: true, startTime: "16:00", endTime: "17:00" }), "종일");
  assert.strictEqual(TR.displayText({ startTime: "16:00", endTime: "17:00" }), "오후 4:00 ~ 5:00 (1시간)");
  assert.strictEqual(TR.displayText({ startTime: "11:30", endTime: "13:00" }), "오전 11:30 ~ 오후 1:00 (1시간 30분)");
  assert.strictEqual(TR.displayText({ startTime: "09:00", endTime: "09:30" }), "오전 9:00 ~ 9:30 (30분)");
  assert.strictEqual(TR.displayText({ startTime: "00:00", endTime: "12:00" }), "오전 12:00 ~ 오후 12:00 (12시간)");
  assert.strictEqual(TR.displayText({ startTime: "16:00" }), "오후 4:00");
  assert.strictEqual(TR.displayText({ startTime: "16:00", endTime: "15:00" }), "오후 4:00", "끝이 시작보다 빠르면 시작만");
  assert.strictEqual(TR.displayText({}), "");
});
test("길이: 30분·1시간·1시간 30분, 0 이하·24시간 이상은 생략", () => {
  assert.deepStrictEqual([30, 60, 90, 120, 135].map(TR.durationText), ["30분", "1시간", "1시간 30분", "2시간", "2시간 15분"]);
  assert.strictEqual(TR.durationText(0), ""); assert.strictEqual(TR.durationText(1440), ""); assert.strictEqual(TR.durationText(2000), "");
});
test("일정 카드·상세·홈 '다음 일정' 모두 같은 표기(timeText)를 쓴다", () => {
  assert.strictEqual(V.timeText({ allDay: false, startTime: "16:00", endTime: "17:00" }), "오후 4:00 ~ 5:00 (1시간)");
  const src = read("js/user-schedule-view.js");
  assert.ok(/timeText: timeText\(o\), tag: tagText\(o\)/.test(src), "홈 다음 일정 카드");
  assert.ok(src.includes('require("./time-range.js")'));
  const html = read("index.html"), sw = read("sw.js");
  assert.ok(/time-range\.js\?v=\d+"><\/script>\s*<script src="js\/time-wheel\.js\?v=\d+"><\/script>\s*<script src="js\/schedule-kinds\.js/.test(html) && sw.includes('"./js/time-range.js"') && sw.includes('"./js/time-wheel.js"'));
});

console.log("시간 범위(B): 15분 단위");
test("시작을 바꾸면 끝이 같은 길이로 따라온다(기본 1시간), 하루를 넘기면 23:45 에서 멈춘다", () => {
  assert.deepStrictEqual(TR.initial("", ""), { start: "09:00", end: "10:00", warn: "" });
  assert.deepStrictEqual(TR.initial("16:07", ""), { start: "16:00", end: "17:00", warn: "" });
  const r = TR.changeStart({ start: "16:00", end: "17:30", warn: "" }, "18:15");
  assert.deepStrictEqual(r, { start: "18:15", end: "19:45", warn: "" });
  assert.strictEqual(TR.changeStart({ start: "10:00", end: "12:00" }, "23:00").end, "23:45");
});
test("끝이 시작보다 빠르거나 같으면 경고 + 시작 1시간 뒤로 되돌린다", () => {
  const r = TR.changeEnd({ start: "16:00", end: "17:00" }, "15:00");
  assert.strictEqual(r.end, "17:00"); assert.ok(r.warn.includes("빨라요"));
  assert.strictEqual(TR.changeEnd({ start: "16:00", end: "17:00" }, "16:00").warn !== "", true);
  assert.deepStrictEqual(TR.changeEnd({ start: "16:00", end: "17:00" }, "18:30"), { start: "16:00", end: "18:30", warn: "" });
  assert.deepStrictEqual([TR.step(540, 1), TR.step(540, -1), TR.step(0, -1), TR.step(1425, 5)], [555, 525, 0, 1425]);
});

console.log("칩·담당");
const LINKS = [{ childKey: "c1", displayName: "수아", order: 1 }];
const MEM = [{ memberId: "m1", role: "MOM", label: "주연", order: 1, colorKey: "p5" }, { memberId: "m2", role: "DAD", label: "아빠", order: 2, colorKey: "p4" }, { memberId: "m3", role: "MOM", label: "엄마", order: 3 }];
test("칩 라벨: 표시 이름이 있으면 이름만('나(엄마)' 아님), 이름 없는 옛 구성원은 역할 라벨, 내 구성원이 이름 없으면 계정 표시 이름 → 없으면 기존 '나(역할)'", () => {
  const lab = (opts) => V.filterChips(LINKS, [], MEM, { memberMode: true, noFamily: true, ...opts }).filter((c) => c.id.startsWith("MEMBER:")).map((c) => c.label);
  assert.deepStrictEqual(lab({ meId: "m1" }), ["주연", "아빠", "엄마"]);
  assert.deepStrictEqual(lab({ meId: "m3", meName: "지은" }), ["주연", "아빠", "지은"]);
  assert.deepStrictEqual(lab({ meId: "m3" }), ["주연", "아빠", "나(엄마)"]);
  assert.strictEqual(V.filterChips(LINKS, [], MEM, { memberMode: true, meId: "m1" }).find((c) => c.id === "CHILD:c1").label, "수아");
});
test("칩 CSS: 칩 전체를 대표색으로 채우고 글자는 어두운 --text(대비 5.7:1 이상 팔레트), 선택은 진한 테두리·✓", () => {
  const css = read("css/style.css");
  assert.ok(/\.us-chip\[style\*="--us-color"\] \{[^}]*background: var\(--us-color\)/.test(css) && /\.us-chip\.active\[style\*="--us-color"\]::before \{ content: "✓"/.test(css));
  assert.ok(/\.us-chip\[style\*="--us-color"\], \.us-chip\.active\[style\*="--us-color"\] \{ color: var\(--chip-ink\); \}/.test(css), "칩 글자는 --chip-ink");
  const lum = (hex) => { const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4))); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  const text = /--chip-ink: (#[0-9a-f]{6});/i.exec(css)[1];
  for (const col of [...V.PALETTE]) { const [a, b] = [lum(col), lum(text)].sort((x, y) => y - x); assert.ok((a + 0.05) / (b + 0.05) >= 5.7, `${col} 위 ${text} 대비 ${(a + 0.05) / (b + 0.05)}`); }
});
test("담당은 화면에 나오지 않는다: 카드 태그·상세 줄에서 제외(데이터는 그대로)", () => {
  assert.strictEqual(V.tagText({ scope: "FAMILY", assigneeLabel: "엄마" }), V.MSG.cardFamily);
  assert.strictEqual(V.tagText({ scope: "CHILD", assigneeLabel: "아빠", badges: [{ displayName: "수아" }] }), "수아");
  assert.ok(!V.renderDetail({ title: "t", categoryLabel: "건강", scope: "CHILD", dateText: "10/6", timeText: "", color: "#aaa", location: "", memo: "", done: false, tag: "수아", targetText: "수아", assigneeText: "아빠" }).includes("담당"));
});

console.log("그날 시작하는 자동 항목");
test("36개월 이상 패널: 칸에 점은 없지만 그날 시작하는 자동 항목(완료 포함)도 패널 목록에 더한다 / 36개월 미만은 그대로", () => {
  const app = read("js/app.js");
  assert.ok(/const startsToday = acct36Active\(\) \? visibleSchedule\(true\)\.filter\(\(e\) => toISODate\(e\.fixedDate \|\| e\.date\) === iso && !day\.benefit\.includes\(e\) && !day\.planned\.includes\(e\) && !autoLinkedHidden\(e\)\) : \[\];/.test(app));
  assert.ok(/const plannedRows = day\.planned\.concat\(startsToday\);/.test(app));
});

console.log("기간(PERIOD) 일정 표시");
test("시작일 칸 칩에 '기간 ' 표식, 날짜 패널에 '날짜 미정 · 12/1~12/31' 카드, 주 보기 제목에도 표식", () => {
  const CM = require("../js/calendar-model.js"), US = require("../js/user-schedule.js");
  const doc = { ...US.buildCreateDoc({ sourceType: "MANUAL", title: "취학통지서 확인", category: "ETC", scope: "CHILD", childKeys: ["c1"], allDay: true, dateKind: "PERIOD", periodStart: "2026-12-01", periodEnd: "2026-12-31", autoRef: "SC-03__default" }, 1).doc, id: "p1" };
  const m = CM.buildCalendarModel({ view: "month", range: { start: "2026-12-01", end: "2026-12-31" }, filter: { scope: "ALL", showAuto: true }, auto: { events: [], displayDates: new Map(), completed: {}, childKey: "c1" }, user: { schedules: [doc], childLinks: [{ childKey: "c1", displayName: "수아", order: 1 }], members: [] } });
  const day = m.days.get("2026-12-01");
  const panel = V.dayPanel(day, [{ childKey: "c1", displayName: "수아", order: 1 }]);
  assert.strictEqual(panel.added.cards.length, 1);
  assert.ok(V.renderCard(panel.added.cards[0]).includes("날짜 미정 · 12/1~12/31") && panel.added.cards[0].title === "취학통지서 확인");
  const chip = V.cellChips([{ t: "u", occ: day.periodStarts[0], period: true }], { links: [] });
  assert.ok(chip.includes("기간 취학통지서 확인") && chip.includes("cal-chip u p"));
  assert.strictEqual(V.cellChips([{ t: "u", occ: day.periodStarts[0] }], { links: [] }).includes("기간 "), false);
  const app = read("js/app.js");
  assert.ok(/periodBars = dm \? dm\.periodStarts \|\| \[\] : \[\]/.test(app) && /periodBars\.map\(\(occ\) => \(\{ t: "u", occ, period: true \}\)\)/.test(app));
  assert.ok(/dm\.user\.concat\(dm\.periodStarts \|\| \[\]\)\.map/.test(app) && app.includes("marks.length + userBars.length + periodBars.length"));
});

console.log(`\n${passed}개 통과`);
