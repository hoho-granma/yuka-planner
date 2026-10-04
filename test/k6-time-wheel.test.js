/*
 * K6 — 시간 입력 휠(시안 B): 상태 전이(순수)와 마크업. 실행: node test/k6-time-wheel.test.js
 */
const assert = require("assert");
const W = require("../js/time-wheel.js");
let passed = 0;
function test(name, fn) { try { fn(); passed++; console.log("  ok  - " + name); } catch (e) { process.exitCode = 1; console.log("  FAIL- " + name + "\n      " + (e.stack || e).split("\n").slice(0, 3).join("\n      ")); } }
const step = (s, part, dir) => W.reduce(s, { type: "step", part, dir });

test("처음 상태: 시간 없으면 오전 9:00~10:00, 있으면 15분 단위로 맞추고 끝은 기본 1시간 뒤", () => {
  assert.deepStrictEqual(W.initState("", ""), { start: "09:00", end: "10:00", active: "start", warn: "" });
  assert.deepStrictEqual(W.initState("16:10", ""), { start: "16:15", end: "17:15", active: "start", warn: "" });
  assert.deepStrictEqual(W.initState("16:00", "18:30"), { start: "16:00", end: "18:30", active: "start", warn: "" });
});
test("시작을 돌리면 끝이 같은 길이로 따라온다(시·분·오전/오후)", () => {
  let s = W.initState("16:00", "17:30");
  s = step(s, "hour", 1); assert.deepStrictEqual([s.start, s.end], ["17:00", "18:30"]);
  s = step(s, "min", 1); assert.deepStrictEqual([s.start, s.end], ["17:15", "18:45"]);
  s = step(s, "mer", 1); assert.deepStrictEqual([s.start, s.end], ["05:15", "06:45"], "오후→오전");
});
test("시는 12→1 로 돌고 분은 시를 바꾸지 않고 15분씩 돈다", () => {
  assert.strictEqual(W.turn(12 * 60, "hour", 1), 13 * 60); // 오후 12 → 오후 1
  assert.strictEqual(W.turn(11 * 60, "hour", 1), 0, "오전 11 → 오전 12");
  assert.strictEqual(W.turn(0, "hour", -1), 11 * 60, "오전 12 → 오전 11");
  assert.strictEqual(W.turn(16 * 60 + 45, "min", 1), 16 * 60, "45 → 00 (시 그대로)");
  assert.strictEqual(W.turn(16 * 60, "min", -1), 16 * 60 + 45);
});
test("끝 칸을 고르면 끝만 바뀌고, 시작보다 빠르거나 같으면 경고 + 시작 1시간 뒤로 되돌린다", () => {
  let s = W.reduce(W.initState("16:00", "17:00"), { type: "field", field: "end" });
  s = step(s, "hour", 1); assert.deepStrictEqual([s.start, s.end, s.warn], ["16:00", "18:00", ""]);
  s = step(W.reduce(W.initState("16:00", "17:00"), { type: "field", field: "end" }), "hour", -1);
  assert.deepStrictEqual([s.start, s.end], ["16:00", "17:00"]); assert.ok(s.warn.includes("빨라요"));
  const ok = step(s, "hour", 1); assert.strictEqual(ok.warn, "", "다시 정상 값이면 경고가 사라진다");
});
test("하루 끝: 시작을 늦은 밤으로 돌려도 끝은 23:45 를 넘지 않는다", () => {
  const s = W.reduce(W.initState("22:00", "23:00"), { type: "set", field: "start", time: "23:30" });
  assert.deepStrictEqual([s.start, s.end], ["23:30", "23:45"]);
});
test("마크업: 한 줄 범위(시작·끝 버튼, 같은 오전/오후면 끝은 시각만) + 3열 휠 + ▲▼ + 안내 + 경고", () => {
  const s = W.initState("16:00", "17:00");
  const h = W.markup("us-time", s);
  assert.ok(h.includes(">오후 4:00<") && h.includes(">5:00<") && h.includes('data-tw-field="start"') && h.includes('data-tw-field="end"'));
  assert.strictEqual((h.match(/data-tw-col="/g) || []).length, 3);
  assert.strictEqual((h.match(/data-tw-step="/g) || []).length, 6);
  assert.ok(h.includes("시작을 바꾸면 끝도 같은 길이로 따라와요") && !h.includes("tw-warn"));
  const w = W.markup("us-time", { ...s, warn: "경고" });
  assert.ok(w.includes('class="tw-warn" role="alert"'));
  assert.ok(W.markup("x", W.initState("11:30", "13:00")).includes(">오후 1:00<"), "오전→오후 걸치면 끝에도 오전/오후");
});

console.log("앱 연결(폼 값 ↔ 휠)·합성 이벤트");
const fs = require("fs"), path = require("path"), vm = require("vm");
const APP = fs.readFileSync(path.join(__dirname, "..", "js", "app.js"), "utf8");
const glue = () => {
  const a = APP.indexOf("  const usTwForm = () =>"), b = APP.indexOf("  async function usSave() {");
  const box = { outerHTML: "" };
  const sb = { TimeWheel: W, TimeRange: require("../js/time-range.js"), us: { form: null, dayForm: null }, el: () => ({ querySelector: () => box }) };
  vm.createContext(sb);
  vm.runInContext(APP.slice(a, b) + ";globalThis.g={usTwState,usTwApply,usEnsureTimes};", sb);
  return { sb, g: sb.g, box };
};
test("폼 연결: 시간 일정이면 폼 값(startTime·endTime)이 휠 상태가 되고, 휠 결과가 폼에 쓰이며 휠 마크업만 다시 그린다", () => {
  const { sb, g, box } = glue();
  sb.us.form = { allDay: false, dateKind: "FIXED", startTime: "16:00", endTime: "17:00" };
  assert.deepStrictEqual(JSON.parse(JSON.stringify(g.usTwState())), { start: "16:00", end: "17:00", active: "start", warn: "" });
  g.usTwApply(W.reduce(g.usTwState(), { type: "step", part: "hour", dir: 1 }));
  assert.deepStrictEqual([sb.us.form.startTime, sb.us.form.endTime, sb.us.form.twActive], ["17:00", "18:00", "start"]);
  assert.ok(box.outerHTML.includes('data-tw="us"') && box.outerHTML.includes(">오후 5:00<"));
});
test("폼 연결: 종일이거나 기간(PERIOD)·폼 없음이면 휠 상태가 없다(이벤트 무시), 시간 일정을 처음 보이면 기본 시간(오전 9:00~10:00)을 폼에 채운다", () => {
  const { sb, g } = glue();
  assert.strictEqual(g.usTwState(), null);
  sb.us.form = { allDay: true, dateKind: "FIXED", startTime: "", endTime: "" }; assert.strictEqual(g.usTwState(), null);
  sb.us.form = { allDay: false, dateKind: "PERIOD", startTime: "", endTime: "" }; assert.strictEqual(g.usTwState(), null);
  sb.us.form = { allDay: false, dateKind: "FIXED", startTime: "", endTime: "" };
  g.usEnsureTimes();
  assert.deepStrictEqual([sb.us.form.startTime, sb.us.form.endTime], ["09:00", "10:00"]);
  sb.us.form = { allDay: false, dateKind: "FIXED", startTime: "16:07", endTime: "" };
  g.usEnsureTimes();
  assert.deepStrictEqual([sb.us.form.startTime, sb.us.form.endTime], ["16:07", "17:07"], "있는 시작은 그대로, 끝은 기본 길이");
  sb.us.dayForm = { allDay: false, startTime: "10:00", endTime: "11:00" };
  assert.strictEqual(g.usTwState().start, "10:00", "이 날만 수정 폼도 같은 휠");
});
test("합성 이벤트: ▲▼ 클릭·칸 선택·마우스 휠·세로 끌기(28px 마다 한 칸)가 상태를 바꾼다", () => {
  const h = {};
  const rootEl = { addEventListener: (n, fn) => { h[n] = fn; }, contains: () => true };
  let state = W.initState("16:00", "17:00");
  W.bind(rootEl, () => state, (s) => { state = s; });
  const node = (attrs, sel) => ({ closest: (q) => (q.split(",").some((s) => s.includes(sel)) ? { hasAttribute: (k) => k in attrs, getAttribute: (k) => attrs[k] } : null) });
  h.click({ target: node({ "data-tw-step": "hour", "data-tw-dir": "1" }, "data-tw-step"), preventDefault() {} });
  assert.deepStrictEqual([state.start, state.end], ["17:00", "18:00"]);
  h.click({ target: node({ "data-tw-field": "end" }, "data-tw-field"), preventDefault() {} });
  assert.strictEqual(state.active, "end");
  h.wheel({ target: node({ "data-tw-col": "min" }, "data-tw-col"), deltaY: 100, preventDefault() {} });
  assert.strictEqual(state.end, "18:15");
  const col = { closest: (q) => (q.includes("data-tw-step") ? null : { getAttribute: () => "hour" }) };
  h.pointerdown({ target: col, clientY: 300 });
  h.pointermove({ clientY: 290 }); assert.strictEqual(state.end, "18:15", "28px 미만은 무시");
  h.pointermove({ clientY: 260 }); assert.strictEqual(state.end, "19:15", "위로 끌면 다음 값");
  h.pointerup({}); h.pointermove({ clientY: 100 }); assert.strictEqual(state.end, "19:15", "손을 떼면 끝");
});
test("폼 마크업: 시간 입력은 한 줄 범위+휠 하나(시작·끝 선택 따로 없음), 종일이면 없음 / 담당 선택은 폼에서 뺐다 / 스크립트·캐시 등록", () => {
  const V = require("../js/user-schedule-view.js");
  const f = V.newForm({ date: "2026-10-06", activeChildKey: "c1", links: [{ childKey: "c1", displayName: "은찬", order: 1 }] });
  assert.ok(!V.renderForm(f, []).includes("data-tw"));
  const timed = V.renderForm({ ...f, allDay: false, startTime: "16:00", endTime: "17:30", twActive: "end" }, []);
  assert.ok(timed.includes('data-tw="us"') && timed.includes('class="tw-tm on" data-tw-field="end"') && !timed.includes("data-us-time"));
  assert.ok(!V.renderForm(f, [], { members: [{ memberId: "m1", label: "엄마" }] }).includes("data-us-assignee"));
  const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8"), sw = fs.readFileSync(path.join(__dirname, "..", "sw.js"), "utf8");
  assert.ok(/time-wheel\.js\?v=\d+"><\/script>\s*<script src="js\/schedule-kinds/.test(html) && sw.includes('"./js/time-wheel.js"'));
  assert.ok(/TimeWheel\.bind\(m, usTwState, usTwApply\)/.test(APP));
});

console.log(`\n${passed}개 통과`);
