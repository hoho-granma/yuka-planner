/*
 * 테스트 전용: 실제 엔진(todo-engine·schedule.js·hn-logic)과 실제 데이터로 한 프로필의 AUTO 일정(autoEvents)과 추천일(displayDate Map)을 만든다.
 * app.js 는 Node 에서 실행할 수 없으므로 calendarSchedule()(범위 안 항목) + assignDisplayDays 호출만 복제했다. 소스는 수정하지 않는다.
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const ROOT = path.join(__dirname, "..", "..");
const rd = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), "utf8"));

global.TodoEngine = require(path.join(ROOT, "js/todo-engine.js"));
global.DateCalc = require(path.join(ROOT, "js/date-calc.js"));
global.ChildTimeline = require(path.join(ROOT, "js/child-timeline.js"));
vm.runInThisContext(fs.readFileSync(path.join(ROOT, "js/schedule.js"), "utf8") + "\n;globalThis.__buildSchedule = buildSchedule;");
const HN = require(path.join(ROOT, "js/hn-logic.js"));

const FILES = ["health-checkup", "vaccination", "development", "feeding", "oral", "sleep", "safety", "daily-life", "childcare"].map((f) => `data/todos/${f}.json`).concat("data/subsidies/national-todos.json");
const todoDefinitions = FILES.flatMap((f) => rd(f).todos);
const subsidies = ["data/subsidies/national.json", "data/subsidies/seoul/city.json", "data/subsidies/seoul/districts/구로구.json"].filter((p) => fs.existsSync(path.join(ROOT, p))).flatMap((p) => rd(p).subsidies);
const monthKeysOf = (e) => (e.detail && e.detail.definition && typeof e.detail.definition.displayMonth === "number" ? [e.detail.definition.displayMonth] : []);

function buildAuto(profile) {
  const all = global.__buildSchedule(profile, { todoDefinitions, subsidy: { subsidies } }, []);
  const events = all.filter((e) => ChildTimeline.isWithinServiceRange(profile.birthDate, e.date));
  const displayDates = HN.assignDisplayDays(events, { birthDate: profile.birthDate, monthKeysOf });
  return { events, displayDates };
}

/** 프로필 3종(T3): 은찬 고정 계정 / 말일생 / 임신 중. */
const PROFILES = {
  eunchan: { birthDate: new Date(2026, 5, 20), province: "서울특별시", district: "구로구", gender: "M", birthOrder: "first", stage: "born" },
  monthEnd: { birthDate: new Date(2026, 0, 31), province: "서울특별시", district: "구로구", gender: "F", birthOrder: "first", stage: "born" },
  pregnant: { birthDate: new Date(2026, 11, 31), province: "서울특별시", district: "구로구", gender: "M", birthOrder: "first", stage: "pregnant" },
};

/** Map<id, Date[]> 를 바이트 비교 가능한 문자열로. 이벤트는 id·날짜·유형·카테고리만 직렬화(Date 는 getTime). */
function serialize(events, displayDates) {
  const ev = events.map((e) => [e.id, e.scheduleKind, e.category, e.date && e.date.getTime(), e.windowStart && e.windowStart.getTime(), e.windowEnd && e.windowEnd.getTime(), e.fixedDate && e.fixedDate.getTime()]);
  const dd = [...displayDates.entries()].map(([id, ds]) => [id, ds.map((d) => d.getTime())]);
  return JSON.stringify({ ev, dd });
}

module.exports = { HN, buildAuto, PROFILES, serialize, ROOT };
