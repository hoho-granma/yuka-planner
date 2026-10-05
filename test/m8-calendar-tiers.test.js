// 1-3·1-5 달력 칸 두 층(③): 플래그 OFF 는 지금과 같고, ON 은 정보·관찰형(KNOW)만 칸에서 뺀다. 실행: node --test test/m8-calendar-tiers.test.js
const test = require("node:test"), assert = require("node:assert"), fs = require("fs"), path = require("path"), vm = require("vm");
const ROOT = path.join(__dirname, "..");
const HN = require("../js/hn-logic.js"), C = require("../js/curation.js"), M = require("../js/month-tiers.js");
const policy = C.normalizePolicy(JSON.parse(fs.readFileSync(path.join(ROOT, "data/policy/curation.json"), "utf8")));
const app = fs.readFileSync(path.join(ROOT, "js/app.js"), "utf8");
const birth = new Date(2026, 5, 20);
const ev = (id, cat, ws, we, kind) => ({ id, title: id, category: cat, scheduleKind: kind || "window", windowStart: ws, windowEnd: we, date: ws, detail: { definition: { todo_id: id.split("__")[0], catchUp: "ALLOWED", exposureLevel: "MUST" }, instance: {} } });
const events = [ev("VX-A__default", "예방접종", new Date(2026, 9, 10), new Date(2026, 9, 20)), ev("HC-02__default", "영유아검진", new Date(2026, 9, 12), new Date(2026, 9, 25)), ev("DV-02__default", "발달관찰", new Date(2026, 9, 1), new Date(2026, 9, 28)), ev("SF-01__default", "안전·돌봄", new Date(2026, 9, 1), new Date(2026, 9, 28))];
const run = (opts) => HN.assignDisplayDays(events, { birthDate: birth, monthKeysOf: () => [], ...opts });
test("술어 없음(플래그 OFF)=지금과 동일, 있음=KNOW(발달 관찰·안전) 칸 제거·VX·HC 유지", () => {
  const off = run({}), on = run({ inCalendar: M.inCalendarOf({ policy, today: new Date(2026, 9, 5), state: {}, startOf: (e) => e.windowStart }) });
  assert.deepStrictEqual([...off.keys()].sort(), ["DV-02__default", "HC-02__default", "SF-01__default", "VX-A__default"]);
  assert.deepStrictEqual([...on.keys()].sort(), ["HC-02__default", "VX-A__default"]);
  assert.strictEqual(JSON.stringify([...run({ inCalendar: undefined })]), JSON.stringify([...off]), "undefined 도 동일");
});
test("앱 연결: calendarTierOpts 는 플래그 ON·정책 읽음·MonthTiers 있을 때만 술어를 만들고 아니면 {}, 호출은 한 곳", () => {
  assert.ok(/\.\.\.calendarTierOpts\(\) \}\);/.test(app));
  const i = app.indexOf("  function calendarTierOpts() {"), fn = app.slice(i, app.indexOf("\n  }\n", i) + 4);
  const mk = (flag, pol, mt) => vm.runInNewContext(`${fn}; calendarTierOpts()`, { FEATURES_CURATION_ON: () => flag, curationPolicy: pol, MonthTiers: mt, Date });
  assert.strictEqual(Object.keys(mk(false, policy, M)).length, 0); assert.strictEqual(Object.keys(mk(true, null, M)).length, 0); assert.deepStrictEqual(Object.keys(mk(true, policy, M)), ["inCalendar"]);
  assert.strictEqual(Object.keys(vm.runInNewContext(`${fn}; calendarTierOpts()`, { FEATURES_CURATION_ON: () => true, curationPolicy: policy, MonthTiers: undefined, Date })).length, 0, "MonthTiers 가 없으면 {}");
});
