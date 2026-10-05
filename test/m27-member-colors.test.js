/* 구성원 색: 저장된 colorKey 색을 달력·날짜 목록·칩·프로필 시트 얼굴에 쓰고, 없거나 겹치면 화면에서만 다른 슬롯, 자동(AUTO) 칩은 분류색. 실행: node test/m27-member-colors.test.js */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const V = require("../js/user-schedule-view.js");
const AV = require("../js/account-view.js");
const read = (f) => fs.readFileSync(path.join(__dirname, "..", f), "utf8");
let passed = 0;
function test(name, f) { try { f(); passed++; console.log("  ok  - " + name); } catch (e) { process.exitCode = 1; console.log("  FAIL- " + name + "\n      " + (e.stack || e).split("\n").slice(0, 3).join("\n      ")); } }
const M = (id, role, colorKey, extra = {}) => ({ memberId: id, role, label: id, order: extra.order || 1, createdAt: extra.createdAt || 1, ...(colorKey ? { colorKey } : {}), ...extra });
const colors = (ms) => V.resolveMemberColors(ms, []).map((m) => V.memberColor(m));
const distinct = (a) => new Set(a).size === a.length;

console.log("화면 전용 색 정리(저장 안 함)");
test("D46: 구성원 3명 — 엄마 p2·아빠 p1·이모님 p7(저장된 colorKey 는 무시), 값은 PALETTE 그대로", () => {
  const ms = [M("a", "MOM", "p1", { order: 1 }), M("b", "DAD", "p2", { order: 2 }), M("c", "CAREGIVER", "p3", { order: 3 })];
  assert.deepStrictEqual(colors(ms), [V.PALETTE[1], V.PALETTE[0], V.PALETTE[6]]);
});
test("D46: colorKey 가 없어도(옛 데이터) 역할 슬롯 — 그 밖 구성원은 p7~p10 에 만든 순서대로, 입력 객체는 바뀌지 않는다", () => {
  const ms = [M("x1", "OTHER", "", { order: 1 }), M("x2", "OTHER", "", { order: 2 }), M("x3", "OTHER", "", { order: 3 })];
  const snap = JSON.stringify(ms); const r = colors(ms);
  assert.ok(distinct(r) && r.length === 3); assert.strictEqual(JSON.stringify(ms), snap, "원본(미러) 불변 — 저장하지 않는다");
  assert.deepStrictEqual(V.resolveMemberColors(ms, []).map((m) => m.colorKey), ["p7", "p8", "p9"]);
});
test("D46: 저장된 colorKey 가 겹쳐도(두 기기 동시 배정) 화면 색은 역할로 정해져 겹치지 않는다 — 아빠 p1·엄마 p2·그 밖 p7", () => {
  const ms = [M("late", "MOM", "p1", { order: 2, createdAt: 9 }), M("first", "DAD", "p1", { order: 1, createdAt: 5 }), M("third", "OTHER", "p1", { order: 3 })];
  const r = Object.fromEntries(V.resolveMemberColors(ms, []).map((m) => [m.memberId, m.colorKey]));
  assert.deepStrictEqual([r.first, r.late, r.third], ["p1", "p2", "p7"]);
  assert.ok(distinct(colors(ms)));
});
test("D46: 아빠 p1·엄마 p2·아이 p3~p5·그 밖 p7~p10, 가족(칩·가족 일정)=p6 — 옛 엄마·아빠(colorKey 없음)도 같은 규칙", () => {
  const ms = [M("mom", "MOM", "", { order: 1 }), M("dad", "DAD", "", { order: 2 }), M("n1", "OTHER", "", { order: 3 }), M("n2", "CAREGIVER", "", { order: 4 })];
  const links = [{ childKey: "k1", order: 1, colorKey: "p1" }, { childKey: "k2", order: 2, colorKey: "p2" }];
  const r = V.resolveMemberColors(ms, links); const byId = Object.fromEntries(r.map((m) => [m.memberId, V.memberColor(m)]));
  assert.deepStrictEqual([byId.dad, byId.mom, byId.n1, byId.n2], [V.PALETTE[0], V.PALETTE[1], V.PALETTE[6], V.PALETTE[7]]);
  const kids = V.resolveChildColors(links, ms); assert.deepStrictEqual(kids.map((l) => l.colorKey), ["p3", "p4"]);
  assert.deepStrictEqual(kids.map((l) => V.childColor(l)), [V.PALETTE[2], V.PALETTE[3]]);
  assert.strictEqual(V.familyColor(), V.PALETTE[5]); assert.strictEqual(V.FAMILY_COLOR, V.PALETTE[5]);
  assert.ok(distinct([...Object.values(byId), ...kids.map((l) => V.childColor(l)), V.familyColor()]));
});
test("D46: 삭제된 구성원은 슬롯을 차지하지 않고 그대로, 같은 입력은 같은 결과(멱등), 7~10 이 차면(그 밖 5명째부터) 저장된 값으로 넘어간다", () => {
  const ms = [M("a", "MOM", "p1"), { ...M("gone", "DAD", "p1"), deletedAt: 5 }, M("d2", "DAD", "p3", { order: 5 })];
  const r = V.resolveMemberColors(ms, []); assert.strictEqual(r[1].colorKey, "p1"); assert.deepStrictEqual(V.resolveMemberColors(r, []), r);
  assert.deepStrictEqual([r[0].colorKey, r[2].colorKey], ["p2", "p1"], "삭제된 아빠는 p1 을 잡지 않아 살아 있는 아빠가 p1");
  const many = Array.from({ length: 12 }, (_, i) => M("m" + i, "OTHER", "", { order: i + 1 }));
  const rm = V.resolveMemberColors(many, []); assert.strictEqual(rm.length, 12);
  assert.deepStrictEqual(rm.slice(0, 4).map((m) => m.colorKey), ["p7", "p8", "p9", "p10"]); assert.ok(rm.slice(4).every((m) => !m.colorKey), "슬롯 밖은 저장된 값 그대로(기존 규칙)");
});
test("D46: 아이 순서 — 활성 아이 모두 생년월일이 있으면 태어난 순서, 일부만 있으면 쓰지 않고 등록 순서(기기마다 달라지지 않게)", () => {
  const all = [{ childKey: "a", order: 1, birthDate: "2024-05-01" }, { childKey: "b", order: 2, birthDate: "2022-01-01" }];
  assert.deepStrictEqual(V.resolveChildColors(all, []).map((l) => l.colorKey), ["p4", "p3"]);
  const part = [{ childKey: "a", order: 1, birthDate: "2024-05-01" }, { childKey: "b", order: 2 }];
  assert.deepStrictEqual(V.resolveChildColors(part, []).map((l) => l.colorKey), ["p3", "p4"]);
});
test("D46: 아이 6명 이상 — 아이 p3~p5, 6번째부터는 그 밖 풀(p7~)에서 구성원보다 먼저; 분리된 아이는 슬롯 없음; colorOrder 는 슬롯 위에 얹힌다", () => {
  const links = Array.from({ length: 6 }, (_, i) => ({ childKey: "c" + i, order: i + 1, colorKey: "" })).concat([{ childKey: "old", order: 0.5, colorKey: "p9", removedAt: 3 }]);
  const ms = [M("o1", "OTHER", "", { order: 1 })];
  const kids = V.resolveChildColors(links, ms); assert.deepStrictEqual(kids.slice(0, 6).map((l) => l.colorKey), ["p3", "p4", "p5", "p7", "p3".replace("p3", "p3"), "p3"].map((k, i) => ["p3", "p4", "p5", "p7", "p8", "p9"][i]));
  assert.strictEqual(kids[6].colorKey, "p9", "분리된 아이는 저장값 그대로");
  assert.strictEqual(V.resolveMemberColors(ms, links)[0].colorKey, "p10", "구성원은 아이 6~뒤 다음");
  V.setTheme("warm"); V.setColorOrder({ warm: [1, 0, 2, 3, 4, 5, 6, 7, 8, 9] });
  const dad = V.resolveMemberColors([M("d", "DAD", "")], [])[0]; assert.strictEqual(V.memberColor(dad), "#f4e07c", "슬롯 p1(아빠)이 순열로 바뀐 색을 받는다");
  V.setColorOrder(null);
});

console.log("표시 경로");
test("달력 필터 칩·일정 점/막대(담당)·날짜 목록 카드가 같은 구성원 색을 쓴다(색이 겹치던 데이터도 칩마다 다름)", () => {
  const ms = V.resolveMemberColors([M("a", "OTHER", "p1", { order: 1 }), M("b", "OTHER", "p1", { order: 2 }), M("c", "OTHER", "", { order: 3 })], []);
  const chips = V.filterChips([], [], ms, { memberMode: true, meId: "a" }).filter((c) => /^MEMBER:/.test(c.id)); assert.ok(distinct(chips.map((c) => c.color)));
  ms.forEach((m) => { const occ = { assigneeRole: m.role, assigneeMemberId: m.memberId, assigneeColorKey: m.colorKey, scope: "FAMILY", childKeys: [] }; assert.strictEqual(V.occurrenceColor(occ, []), V.memberColor(m)); });
  assert.ok(distinct(ms.map((m) => V.occurrenceColor({ assigneeRole: m.role, assigneeMemberId: m.memberId, assigneeColorKey: m.colorKey }, []))));
});
test("색 최종 순서(D40): 자동(AUTO) 칩은 기본이 그 아이 색(autoColor)·'카테고리별 색깔' 스위치를 켠 아이 모드에서만 분류색, 아이 일정은 아이 색, 구성원 일정은 그 구성원 색", () => {
  const m = V.resolveMemberColors([M("a", "OTHER", "p3")], [])[0]; // D46: 그 밖 구성원 = p7
  const links = [{ childKey: "k1", order: 1, displayName: "하린", colorKey: "p5" }];
  const person = { t: "u", occ: { title: "병원", scope: "FAMILY", childKeys: [], assigneeRole: m.role, assigneeMemberId: m.memberId, assigneeColorKey: m.colorKey } };
  const kid = { t: "u", occ: { title: "접종", scope: "CHILD", childKeys: ["k1"], assigneeRole: m.role, assigneeMemberId: m.memberId, assigneeColorKey: m.colorKey } };
  const a = { t: "a", title: "BCG", category: "예방접종" };
  const ctx = { links, mode: "all", catColor: false, autoColor: "#f4e07c" };
  assert.ok(V.cellChips([person], ctx).includes(`background:${V.PALETTE[6]}`), "구성원 일정=그 구성원 색");
  assert.ok(V.cellChips([kid], ctx).includes(`background:${V.PALETTE[4]}`), "아이 일정=아이 색(옛 담당 값 무시)");
  assert.ok(V.cellChips([a], ctx).includes("--chip-c:#f4e07c"), "자동 기본=현재 아이 색");
  const cat = V.cellChips([a], { links, mode: "kids", catColor: true, autoColor: "#f4e07c" });
  assert.ok(cat.includes(`--chip-c:${V.CATEGORY_COLORS["접종"]}`), "스위치를 켜면 자동만 분류색");
  assert.ok(!/autoByCategory/.test(read("js/user-schedule-view.js")) && !/autoByCategory/.test(read("js/app.js")), "자동 기본을 분류색으로 바꾸는 옵션은 없다");
});
test("safeColor 라벤더 경로: 팔레트·분류·구성원 색은 허용 집합 안이라 라벤더로 바뀌지 않고, 가족 일정(담당 없음)만 가족색", () => {
  const m = V.resolveMemberColors([M("a", "OTHER", "p7")], [])[0];
  const h = V.cellChips([{ t: "u", occ: { title: "x", assigneeRole: m.role, assigneeMemberId: m.memberId, assigneeColorKey: m.colorKey } }], { links: [] });
  assert.ok(h.includes(V.PALETTE[6]) && !h.includes(V.FAMILY_COLOR));
  assert.ok(V.cellChips([{ t: "u", occ: { title: "가족", scope: "FAMILY", childKeys: [] } }], { links: [] }).includes(V.FAMILY_COLOR));
});
test("프로필 시트 얼굴 원: 전달된 구성원·아이 색을 쓰고(역할 고정색 아님), 색이 없거나 형식이 틀리면 옛 폴백", () => {
  const st = (family) => AV.renderFamilySlot({ user: { displayName: "나", email: "a@b.c" }, account: { displayName: "나", role: "MOM" }, family, code: "ABCD", notice: "" });
  const html = st({ members: [{ memberId: "a", role: "CAREGIVER", label: "이모", color: "#f47ca8" }, { memberId: "b", role: "OTHER", label: "할머니", color: "#7c90f4" }, { memberId: "c", role: "OTHER", label: "큰이모", color: "bad" }], meId: "", children: [{ childKey: "k", displayName: "하린", color: "#f7b5a1" }] });
  assert.ok(html.includes("background:#f47ca8") && html.includes("background:#7c90f4") && html.includes("background:#f7b5a1"));
  assert.ok(html.includes("background:#c9b8ff"), "잘못된 색은 라벤더 폴백"); assert.ok(!/background:bad/.test(html));
});
test("앱 연결: usMembers 는 화면용 정리본, 얼굴·달력 칩 호출부가 색을 넘긴다, 서버에는 colorKey 를 쓰지 않는다", () => {
  const APP = read("js/app.js");
  assert.ok(/const usMembers = \(\) => UserScheduleView\.resolveMemberColors\(/.test(APP));
  assert.ok(/color: UserScheduleView\.memberColor\(m\)/.test(APP) && /color: UserScheduleView\.childColor\(l\)/.test(APP));
  const body = read("js/user-schedule-view.js"); const f = body.slice(body.indexOf("function resolveMemberColors"), body.indexOf("function resolveMemberColors") + 1400);
  assert.ok(!/upsertMember|HouseholdSync|localStorage|setItem/.test(f));
});
console.log(`\n${passed} passed`);
