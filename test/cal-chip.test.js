/*
 * 가족 캘린더 월 달력 칩 개편: 가구 없음(플래그 OFF) 불변·연결·모델 담당자 역할.
 * 순수 로직(필터·색·칩 마크업)은 user-schedule-view.logic.test.js 에서 확인한다.
 * 실행: node test/cal-chip.test.js
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const ROOT = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
const APP = read("js/app.js");
const HEAD_APP = execSync("git show HEAD:js/app.js", { cwd: ROOT, encoding: "utf8" });
const CM = require("../js/calendar-model.js");
global.HNLogic = require("../js/hn-logic.js");
global.UserSchedule = require("../js/user-schedule.js");

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log("  ok  - " + name); } catch (e) { process.exitCode = 1; console.log("  FAIL- " + name + "\n      " + (e.stack || e).split("\n").slice(0, 4).join("\n      ")); }
}
const fnSrc = (src, name) => { const i = src.indexOf("  function " + name + "("); return src.slice(i, src.indexOf("\n  }\n", i) + 5); };

test("가구 없음(usModel null → dm 없음): 기존 점 표식 마크업과 그 계산식이 HEAD 와 글자까지 같다", () => {
  const now = fnSrc(APP, "renderCalendar"), old = fnSrc(HEAD_APP, "renderCalendar");
  const chunk = (s) => s.slice(s.indexOf("      // 추가한 일정: 아이색 막대(맨 앞)"), s.indexOf("      const moreHtml"));
  assert.ok(chunk(old).length > 200);
  assert.strictEqual(chunk(now), chunk(old));
  assert.ok(now.includes('        : `<span class="num">${day}</span><span class="markers">${dotHtml}${moreHtml}</span>`;'));
  assert.ok(/cell\.innerHTML = dm\s*\?\s*`[^`]*cellChips\(/.test(now), "칩 마크업은 dm(가구 모델)이 있을 때만");
  // 가구가 없으면 dm 이 null: dm = usModel ? usModel.days.get(...) : null, usModel = usActive() ? ... : null
  assert.ok(now.includes("const usModel = usActive() ? usBuildModel(") && now.includes("const dm = usModel ? usModel.days.get(toISODate(date)) : null;"));
});
test("연결: 필터 클릭=복수 토글, 스위치 2개 핸들러, catColor 는 이 기기에만 보존(실패해도 동작), 서버 쓰기 없음", () => {
  assert.ok(APP.includes('us.selection = UserScheduleView.toggleSelection(us.selection, f.getAttribute("data-us-filter"), usLinks(), usMembers());'));
  assert.ok(APP.includes('if (act === "toggle-only-user") {\n        us.onlyUser = !us.onlyUser;') && APP.includes('if (act === "toggle-cat-color") {'));
  assert.ok(APP.includes('const CAL_CATCOLOR_KEY = "hannun_cal_catcolor";') && /selection: \[\], onlyUser: false, catColor: \(\(\) =>/.test(APP));
  const blk = APP.slice(APP.indexOf('if (act === "toggle-only-user")'), APP.indexOf('if (act === "add") return usOpenForm'));
  assert.ok(!/HouseholdSync|FamilySync|upsert|patchSchedule|createSchedule/.test(blk));
  assert.ok(APP.includes("UserScheduleView.toModelFilter(us.selection, us.onlyUser, usLinks(), usMembers())"));
});
test("모델: 일정에 assigneeRole(담당 구성원 역할) 포함, 삭제된 담당자는 null — 홈·주·상세의 기본 색(owner)이 이를 쓴다", () => {
  const mk = (extra) => ({ ...UserSchedule.buildCreateDoc({ sourceType: "MANUAL", title: "t", category: "MEDICAL", scope: "FAMILY", allDay: true, dateKind: "FIXED", eventDate: "2026-10-06", ...extra }).doc, id: "s1" });
  const run = (doc, members) => CM.buildCalendarModel({ view: "month", range: { start: "2026-10-01", end: "2026-10-31" }, filter: { scope: "ALL", showAuto: false }, auto: { events: [], displayDates: new Map(), completed: {} }, user: { schedules: [doc], childLinks: [], members } }).days.get("2026-10-06").user[0];
  assert.strictEqual(run(mk({ assigneeMemberId: "m1" }), [{ memberId: "m1", role: "MOM", label: "엄마" }]).assigneeRole, "MOM");
  assert.strictEqual(run(mk({ assigneeMemberId: "m1" }), [{ memberId: "m1", role: "MOM", label: "엄마", deletedAt: 5 }]).assigneeRole, null);
  assert.strictEqual(run(mk({}), []).assigneeRole, null);
});
test("CSS·마크업: 칩·토글 칩 스타일이 있고, 가구가 없을 때 쓰는 점 표식 스타일은 그대로", () => {
  const css = read("css/style.css");
  ["\.cal-chip \{", "\.cal-chip\.a \{", "\.cal-chip-more", "\.us-tchip \{", "\.us-optrows"].forEach((r) => assert.ok(new RegExp(r).test(css), r));
  assert.ok(css.includes(".cal-marker {") && css.includes(".cal-marker-more { font-size: 9px;"));
  assert.ok(css.includes("color-mix(in srgb, var(--chip-c) 30%, #fff)"));
});
console.log(`\n${passed}개 통과${process.exitCode ? ", 일부 실패" : ""}`);
