/* G21 36개월 이상 아이: 직접 등록 전용 화면에서 불필요한 토글·안내·뱃지·공개 범위 숨김(계정 모드만). 실행: node test/g21-over36-menu.test.js */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const V = require("../js/user-schedule-view.js");
const K = require("../js/schedule-kinds.js");
const read = (f) => fs.readFileSync(path.join(__dirname, "..", f), "utf8");
const APP = read("js/app.js");
let passed = 0;
function test(name, f) { try { f(); passed++; console.log("  ok  - " + name); } catch (e) { process.exitCode = 1; console.log("  FAIL- " + name + "\n      " + (e.stack || e).split("\n").slice(0, 4).join("\n      ")); } }
function fn(name) { const i = APP.indexOf(`  function ${name}(`); assert.ok(i >= 0, name); return APP.slice(i, APP.indexOf("\n  }\n", i) + 4); }

const env = (o) => {
  const sb = {
    UserScheduleView: V, acctEnabled: () => o.on !== false, usSel: () => o.sel || [], usLinks: () => o.kids.map(([childKey]) => ({ childKey, order: 1, displayName: childKey, familyCode: childKey })), usMembers: () => [{ memberId: "m1", role: "MOM", label: "주연" }], usSelOpts: () => ({ memberMode: true, meId: "m1" }),
    usChildAge: (k) => (o.kids.find(([x]) => x === k) || [])[1],
    profile: null, visibleSchedule: () => [], ChildTimeline: { OVER36_FROM_MONTHS: 36 },
  };
  vm.createContext(sb);
  vm.runInContext(fn("usKidsAre36Plus"), sb);
  return sb.usKidsAre36Plus();
};
test("판정: 만 36개월 정각부터 이상(35는 미만), 임신 중·나이 모름은 미만 — 기존 ScheduleKinds.ageMonths 기준", () => {
  assert.strictEqual(K.ageMonths("2023-10-04", "2026-10-04"), 36);
  assert.strictEqual(K.ageMonths("2023-10-05", "2026-10-04"), 35);
  assert.strictEqual(env({ kids: [["a", 36]], sel: ["CHILD:a"] }), true);
  assert.strictEqual(env({ kids: [["a", 35]], sel: ["CHILD:a"] }), false);
  assert.strictEqual(env({ kids: [["a", "PREGNANT"]], sel: ["CHILD:a"] }), false);
  assert.strictEqual(env({ kids: [["a", undefined]], sel: ["CHILD:a"] }), false);
});
test("기준 = 가족 전체 아이 구성: 1명 이상이고 전원 ≥36일 때만 true — 어떤 칩을 골라도 같다 / 36 미만이 한 명이라도·임신 중·나이 모름·아이 없음이면 false", () => {
  const all = [["a", 50], ["b", 40]];
  for (const sel of [[], ["CHILD:a"], ["CHILD:b"], ["MEMBER:m1"], ["CHILD:a", "CHILD:b"]]) assert.strictEqual(env({ kids: all, sel }), true, JSON.stringify(sel));
  const mixed = [["a", 50], ["b", 12]];
  for (const sel of [[], ["CHILD:a"], ["CHILD:b"], ["MEMBER:m1"]]) assert.strictEqual(env({ kids: mixed, sel }), false, "미만 한 명: " + JSON.stringify(sel));
  assert.strictEqual(env({ kids: [["a", 12]], sel: [] }), false, "36 미만만");
  assert.strictEqual(env({ kids: [["a", 50], ["b", "PREGNANT"]], sel: [] }), false, "임신 중 포함");
  assert.strictEqual(env({ kids: [["a", 50], ["b", undefined]], sel: [] }), false, "나이를 모르는 아이 포함");
  assert.strictEqual(env({ kids: [], sel: [] }), false, "아이가 없으면 노출");
  assert.ok(!/usSel\(|normalizeSelection|CHILD:/.test(fn("usKidsAre36Plus")), "칩 선택별 판정 로직 없음");
});
test("플래그 OFF('0')는 어떤 경우에도 false(기존 화면 그대로)", () => {
  assert.strictEqual(env({ on: false, kids: [["a", 80]], sel: ["CHILD:a"] }), false);
  assert.ok(APP.includes('if (typeof acctEnabled !== "function" || !acctEnabled()) return false;'));
});
test("토글 2개: hideSwitches 면 아이만 선택해도 '직접 등록한 일정만 보기'·'카테고리별 색' 없음, 기본(36개월 미만)은 그대로 보임", () => {
  const chips = V.filterChips([{ childKey: "a", order: 1, displayName: "은찬" }], ["CHILD:a"], [], undefined);
  const shown = V.renderFilterChips(chips, { mode: "kids" });
  assert.ok(shown.includes("직접 등록한 일정만 보기") && shown.includes("카테고리별 색깔 다르게 하기"));
  const hidden = V.renderFilterChips(chips, { mode: "kids", hideSwitches: true });
  assert.ok(!hidden.includes("직접 등록한 일정만 보기") && !hidden.includes("카테고리별 색깔") && !hidden.includes("us-optrows"));
  assert.ok(hidden.includes("data-us-filter"), "칩은 그대로");
});
test("'꽉 찬 칩은…' 안내·'직접 입력' 뱃지: 36개월 이상 판정이면 안 그린다(캘린더 상단 안내는 조건부, 날짜 상세 뱃지는 패널을 그린 뒤 제거)", () => {
  assert.ok(APP.includes('(usKidsAre36Plus() ? "" : `<p class="us-note">${esc(UserScheduleView.MSG.legend)}</p>`)'));
  assert.ok(APP.includes("hideSwitches: usKidsAre36Plus()"));
  const removed = [];
  const box = { querySelectorAll: () => [{ remove: () => removed.push(1) }, { remove: () => removed.push(1) }] };
  for (const on of [true, false]) {
    removed.length = 0;
    const sb = { usRenderDayPanel: function () { return "base"; }, usKidsAre36Plus: () => on, el: () => box };
    vm.createContext(sb);
    vm.runInContext(APP.slice(APP.indexOf("  const usRenderDayPanelBase = usRenderDayPanel;"), APP.indexOf("  function usChildAge(childKey)")), sb);
    assert.strictEqual(sb.usRenderDayPanel(), "base");
    assert.strictEqual(removed.length, on ? 2 : 0);
  }
});
test("공개 범위(공개/비공개): 일정 추가·수정 시트에서 모든 아이에게 숨기고, 저장 필드는 만들지 않는다", () => {
  const f = V.newForm({ date: "2026-10-04", activeChildKey: "a", links: [{ childKey: "a", order: 1, displayName: "은찬" }], defaultAssigneeId: "m1" });
  const ctx = { links: [{ childKey: "a", order: 1, displayName: "은찬" }], meId: "m1", ageOf: () => 20, members: [] };
  for (const mode of ["add", "edit"]) {
    const x = V.upgradeFormG13({ ...f, mode }, ctx);
    const h = V.renderFormG13(x, ctx.links, { ctx, members: [] });
    assert.ok(!/data-us-vis|공개 범위|비공개|지금은 모든 일정이/.test(h), mode);
    assert.ok(!Object.keys(V.prepareSave(x, 1).input || {}).some((k) => /vis|private|public/i.test(k)));
  }
});
test("'가족' 칩 제거(계정 모드 전체): 칩이 없고, 저장된 'FAMILY' 선택은 '전체'로 바뀐다 / OFF 는 칩 그대로 / 가족 범위 일정 데이터·일정 추가 시트의 '가족' 대상은 그대로", () => {
  const links = [{ childKey: "a", order: 1, displayName: "은찬" }];
  const mem = [{ memberId: "m1", role: "MOM", label: "주연" }];
  const on = { memberMode: true, meId: "m1", noFamily: true };
  const ids = (o) => V.filterChips(links, ["FAMILY"], mem, o).map((c) => c.id);
  assert.ok(!ids(on).includes("FAMILY") && !ids(on).includes("ALL") && ids(on).includes("CHILD:a") && ids(on).includes("MEMBER:m1"));
  assert.deepStrictEqual(V.normalizeSelection(["FAMILY"], links, mem, on), [], "저장값 FAMILY → 전체");
  assert.deepStrictEqual(V.normalizeSelection(["FAMILY", "CHILD:a"], links, mem, on), ["CHILD:a"]);
  assert.ok(V.filterChips(links, ["FAMILY"], mem, on).every((c) => !c.selected), "저장값 FAMILY → 전체 = 어떤 칩도 선택되지 않은 상태(전체 버튼 없음)");
  assert.deepStrictEqual(V.toggleSelection([], "MEMBER:m1", links, mem, on), ["MEMBER:m1"]);
  assert.ok(V.filterChips(links, [], mem, { memberMode: true, meId: "m1" }).some((c) => c.id === "FAMILY"), "OFF(noFamily 없음)는 그대로");
  assert.ok(APP.includes("...(acctEnabled() ? { noFamily: true } : {})"));
  const h = V.renderFormG13(V.upgradeFormG13(V.newForm({ date: "2026-10-04", activeChildKey: "a", links, defaultAssigneeId: "m1" }), { links, meId: "m1", ageOf: () => 20 }), links, { ctx: { links, meId: "m1", ageOf: () => 20 }, members: [] });
  assert.ok(h.includes("data-us-who") && /가족/.test(h), "일정 추가 시트의 '가족' 대상 선택은 그대로");
});
console.log(`\n${passed}개 통과`);
