// 1-0: curate() 순수 함수(js/curation.js) · buildEligibilityUnknown · 추출한 visibleSchedule·gkey. 실행: node --test test/m1-curation.test.js
const test = require("node:test"), assert = require("node:assert"), fs = require("fs"), path = require("path");
require("./tools/load-engine.js");
const C = require("../js/curation.js"), HN = require("../js/hn-logic.js");
const ROOT = path.join(__dirname, "..");
const rd = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), "utf8"));
const P = C.normalizePolicy(rd("data/policy/curation.json"));
const T = new Date(2026, 9, 5), D = (n) => new Date(2026, 9, 5 + n);
const ev = (id, o = {}) => ({ id, title: id, category: "기타", engineStatus: "DUE", windowStart: D(-10), windowEnd: D(100), detail: { definition: { todo_id: id, catchUp: "ALLOWED", exposureLevel: "MUST", priority: 2 }, instance: {} }, ...o });
const st = (o = {}) => ({ completed: {}, ageMonths: 6, ...o });

test("실제 curation.json 을 읽는다(숫자·별칭·긴 창·분류 표)", () => {
  assert.ok(P);
  assert.deepStrictEqual([P.slots.now, P.slots.soon, P.slots.know, P.thresholds.deadlineSoonDays], [3, 2, 1, 30]);
  assert.strictEqual(P.aliases["SB-06"], "NAT-031"); assert.ok(P.urgentLongWindowIds.includes("PG-01"));
  assert.strictEqual(C.typeOf(ev("SC-03"), P), "CHECK"); assert.strictEqual(C.typeOf(ev("SC-05"), P), "KNOW"); assert.strictEqual(C.typeOf(ev("DV-01"), P), "KNOW");
  assert.strictEqual(C.typeOf(ev("VX-RSV", { detail: { definition: { todo_id: "VX-RSV", exposureLevel: "CONDITIONAL" } } }), P), "CHECK");
  assert.strictEqual(C.typeOf(ev("ZZ-9"), P), "ACT", "미분류는 ACT");
  assert.strictEqual(C.normalizePolicy({}), null);
});
test("L1 최우선·reasons·actionKind·overflow 개수 일치", () => {
  const a = ev("HC-03", { windowEnd: D(10), detail: { definition: { todo_id: "HC-03", catchUp: "NOT_ALLOWED" }, instance: {} } });
  const r = C.curate([ev("HC-04"), a, ev("HC-05", { windowEnd: D(20) }), ev("HC-06", { windowEnd: D(25) }), ev("HC-07", { windowEnd: D(35) })], st({ canSchedule: () => true }), P, T);
  assert.strictEqual(r.now[0].ids[0], "HC-03"); assert.strictEqual(r.now[0].rule, "L1"); assert.strictEqual(r.now[0].actionKind, "schedule");
  assert.ok(r.reasons[r.now[0].key].text.includes("10일"));
  assert.strictEqual(r.overflow.now.length, r.moreCounts.now); assert.strictEqual(r.now.length, P.slots.now);
});
test("게이트·별칭·상시 지원금 개수", () => {
  const ongoing = { id: "NAT-001", category: "행정·지원금", isLegacySubsidy: true, detail: { deadlineType: "ongoing" } };
  const r = C.curate([ev("A-1"), ev("NAT-031", { windowEnd: D(5) }), ongoing, ev("B-1", { engineStatus: "OVERDUE_FINAL" })], st({ completed: { "A-1": 1 }, unknown: [{ id: "SB-06", title: "x" }, { id: "SB-07", title: "y" }], subsidyStatusOf: () => "available" }), P, T);
  const g = Object.fromEntries(r.excluded.map((x) => [x.id, x.gate]));
  assert.deepStrictEqual([g["A-1"], g["B-1"], g["SB-06"]], ["G1", "G3", "alias"]);
  assert.strictEqual(r.moreCounts.benefits, 1); assert.strictEqual([...r.now, ...r.soon, ...r.know].some((u) => u.ids.includes("NAT-001")), false);
  assert.strictEqual(r.soon.find((u) => u.ids[0] === "SB-07").type, "CHECK");
});
test("같은 창 접종은 한 단위, 같은 입력 → 같은 결과(순수)", () => {
  const vx = (id) => ev(id, { category: "예방접종", windowEnd: D(20) });
  const evs = [vx("VX-A"), vx("VX-B")];
  const a = C.curate(evs, st(), P, T), b = C.curate(evs, st(), P, T);
  assert.strictEqual(JSON.stringify(a), JSON.stringify(b));
  assert.strictEqual([...a.now, ...a.soon].filter((u) => u.ids.length === 2).length, 1);
});
test("buildEligibilityUnknown: 조건 미응답 항목만, 학교 UNKNOWN 제외, 별칭 정리", () => {
  const defs = rd("data/subsidies/national-todos.json").todos;
  const ctx = { birthDate: new Date(2025, 9, 1), province: "서울특별시", district: "구로구", gender: "M", stage: "born" };
  const list = global.__buildEligibilityUnknown(ctx, defs);
  const ids = list.map((x) => x.todo_id);
  assert.ok(["SB-06", "SB-07", "SB-08", "SB-09"].every((i) => ids.includes(i)), ids.join());
  assert.ok(list.every((x) => x.attribute));
  const dedup = global.__buildEligibilityUnknown(ctx, defs, { aliases: { "SB-06": "NAT-031", "SB-07": "NAT-007", "SB-08": "NAT-020", "SB-09": "NAT-018" }, present: new Set(["NAT-031", "NAT-007"]) }).map((x) => x.todo_id);
  assert.ok(!dedup.includes("SB-06") && !dedup.includes("SB-07") && dedup.includes("SB-08") && dedup.includes("SB-09"));
  assert.ok(list.every((x) => !/^SC-/.test(x.todo_id)), "학교 UNKNOWN 은 담지 않는다");
});
test("visibleSchedule·gkey 추출: 동작은 그대로", () => {
  const e1 = { id: "a", category: "예방접종" }, e2 = { id: "b", category: "발달관찰" }, e3 = { id: "c", category: "예방접종" };
  const o = { birthDate: new Date(2026, 0, 1), activeCats: new Set(["예방접종"]), isShown: () => true, isNA: (id) => id === "c" };
  assert.deepStrictEqual(HN.visibleSchedule([e1, e2, e3], o).map((e) => e.id), ["a"]);
  assert.deepStrictEqual(HN.visibleSchedule([e1, e2, e3], { ...o, ignoreCategoryFilter: true }).map((e) => e.id), ["a", "b"]);
  assert.deepStrictEqual(HN.visibleSchedule([e1], { ...o, birthDate: null }), []);
  assert.strictEqual(HN.gkey(e1, new Date(2026, 1, 1), new Date(2026, 1, 9)), "VX|2026-2-1|2026-2-9");
  assert.strictEqual(HN.gkey(e1, null, null, 3), "VXM|3"); assert.strictEqual(HN.gkey(e2, null, null, 3), "S|b|3"); assert.strictEqual(HN.gkey(e2, new Date(), new Date()), "S|b");
});
test("A1 나이 범위: 지원금만 범위를 넘으면 G1, 접종은 따라잡기라 대상 아님, ageCap 항목은 건드리지 않음", () => {
  const sb = (id, end, extra) => ev(id, { detail: { definition: { todo_id: id, category: "SB", triggerParams: { startMonth: 0, endMonth: end }, ...extra }, instance: {} } });
  const r = C.curate([sb("SB-X", 24), sb("SB-Y", 200), sb("SB-CAP", 24, { ageCap: {} }), ev("VX-HEPB", { engineStatus: "OVERDUE_CATCHUP" }), { id: "GG-1", category: "행정·지원금", isLegacySubsidy: true, maxAgeMonths: 35, deadlineDate: null, detail: { deadlineType: "age_window" } }], st({ ageMonths: 54, subsidyStatusOf: () => "available" }), P, T);
  const g = Object.fromEntries(r.excluded.map((x) => [x.id, x.gate]));
  assert.deepStrictEqual([g["SB-X"], g["GG-1"], g["SB-Y"], g["SB-CAP"], g["VX-HEPB"]], ["G1", "G1", undefined, undefined, undefined]);
});
test("A2 곧(L6)은 시작까지 남은 날 ≤ upcomingDays, 넘으면 L7(안 보임)", () => {
  const up = (id, n) => ev(id, { engineStatus: "UPCOMING", windowStart: D(n), windowEnd: D(n + 30) });
  const r = C.curate([up("A-1", 10), up("B-1", 45), up("C-1", 46), up("D-1", 102)], st(), P, T);
  const ids = [...r.now, ...r.soon].flatMap((u) => u.ids);
  assert.ok(ids.includes("A-1") && ids.includes("B-1") && !ids.includes("C-1") && !ids.includes("D-1"));
  assert.strictEqual(r.moreCounts.later, 2);
});
test("A5 확인형(CHECK)의 actionKind 는 confirm, 렌더러는 해당돼요/아니에요", () => {
  const V = require("../js/home-slots-view.js");
  const r = C.curate([ev("X-CHK", { windowEnd: D(5) })], st({ applyOf: () => ({ url: "https://x" }), canSchedule: () => true }), C.normalizePolicy({ ...rd("data/policy/curation.json"), ids: { ...rd("data/policy/curation.json").ids, "X-CHK": { type: "CHECK", sub: "APPLY" } } }), T);
  const u = [...r.now, ...r.soon][0];
  assert.strictEqual(u.type, "CHECK"); assert.strictEqual(u.actionKind, "confirm");
  const h = V.render(r, { today: T });
  assert.ok(h.includes('data-hs-act="confirm-yes"') && h.includes('data-hs-act="confirm-no"') && h.includes("해당돼요") && h.includes("아니에요"));
});
test("buildEligibilityUnknown: ageMonths 를 주면 나이 범위 밖 항목은 내보내지 않는다", () => {
  const defs = rd("data/subsidies/national-todos.json").todos;
  const b = new Date(); b.setMonth(b.getMonth() - 40); // 40개월: 엔진은 SB-06~09 를 모두 UNKNOWN 으로 내보낸다
  const ctx = { birthDate: b, province: "서울특별시", district: "구로구", gender: "M", stage: "born" };
  const ids = (a) => global.__buildEligibilityUnknown(ctx, defs, a == null ? {} : { ageMonths: a }).map((x) => x.todo_id);
  const all = ids();
  assert.ok(all.length >= 1);
  assert.ok(!ids(54).includes("SB-06") && ids(54).includes("SB-09") && !ids(110).includes("SB-08") && !ids(200).includes("SB-09"), all.join());
});
test("B1(D18): 끝난 지 60일 안 따라잡기는 L3, 더 오래된 것은 '지난 기록 확인 N개' 한 단위(CHECK·review, 목록 보존)", () => {
  const od = (id, endAgo, cat) => ev(id, { category: cat || "예방접종", engineStatus: "OVERDUE_CATCHUP", windowStart: D(-endAgo - 30), windowEnd: D(-endAgo) });
  const r = C.curate([od("HC-03", 10), od("VX-A", 61), od("VX-B", 200), od("VX-C", 90)], st(), P, T);
  const l3 = [...r.now].filter((u) => u.rule === "L3").flatMap((u) => u.ids);
  assert.deepStrictEqual(l3, ["HC-03"]);
  const rv = [...r.soon, ...r.overflow.soon].find((u) => u.key === "REVIEW_PAST");
  assert.ok(rv && rv.type === "CHECK" && rv.actionKind === "review" && rv.ids.length === 3 && rv.title.includes("3개") && r.stats.pastReview === 3);
  assert.deepStrictEqual(C.curate([od("VX-A", 60)], st(), P, T).now.map((u) => u.rule), ["L3"], "경계: 60일은 아직 L3");
  const sb = C.curate([od("SB-04", 3000, "행정·지원금")], st({ subsidyStatusOf: () => "available" }), P, T); // 지원은 묶지 않고 L3 대신 L5(곧)
  assert.deepStrictEqual([sb.now.length, sb.soon.map((u) => u.rule)], [0, ["L5"]]);
  const fd = C.curate([od("FD-01", 300, "생활·수유")], st(), P, T); // 접종·검진이 아닌 항목은 묶지 않는다
  assert.ok(!fd.stats.pastReview && ![...fd.soon, ...fd.overflow.soon].some((u) => u.key === "REVIEW_PAST"));
});
test("B2(D19): 긴 창 상향(L4)은 창 시작 후 60일 안만, 이후는 L5", () => {
  const mk = (n) => ev("SB-04", { windowStart: D(-n), windowEnd: D(1000), detail: { definition: { todo_id: "SB-04", catchUp: "ALLOWED", exposureLevel: "MUST", priority: 1 }, instance: {} } });
  const lvl = (n) => { const r = C.curate([mk(n)], st({ subsidyStatusOf: () => "available" }), P, T); return [...r.now, ...r.soon][0].rule; };
  assert.deepStrictEqual([lvl(10), lvl(60), lvl(61), lvl(3000)], ["L4", "L4", "L5", "L5"]);
});
test("B3(D20): 펼침은 정책 expandMax 개까지 + 전체 보기, expandMax 없으면 제한 없음 · D17 와인색", () => {
  const V = require("../js/home-slots-view.js");
  const u = (i) => ({ key: "k" + i, ids: ["k" + i], title: "숨은 " + i, type: "ACT", level: "L4", rule: "L4", daysToEnd: Infinity, actionKind: "done", items: [], reason: { text: "" } });
  const over = [1, 2, 3, 4, 5, 6, 7].map(u);
  const base = { now: [u(0)], soon: [], know: [], moreCounts: { now: 7 }, overflow: { now: over, soon: [], know: [] } };
  const h = V.render({ ...base, expandMax: 5 }, { today: T });
  assert.strictEqual((h.match(/숨은 /g) || []).length, 6, "보이는 1 + 펼침 5"); assert.ok(h.includes("전체 보기 →") && h.includes('data-hs-go="checklist"'));
  const h2 = V.render({ ...base, expandMax: null }, { today: T });
  assert.strictEqual((h2.match(/숨은 /g) || []).length, 8); assert.ok(!h2.includes("전체 보기"));
  assert.strictEqual(C.normalizePolicy({ ...rd("data/policy/curation.json"), slots: { now: 3, soon: 2, know: 1, expandMax: 5 } }).slots.expandMax, 5);
  assert.ok(/--hn-deadline:\s*(#8a1c3d|var\(--nd-wine\))/.test(fs.readFileSync(path.join(ROOT, "css/home-slots.css"), "utf8")));
});
test("정책 검증: slots.expandMax 가 없으면 경고(기본값을 코드에 박지 않는다), 있으면 경고 없음", () => {
  const raw = rd("data/policy/curation.json");
  const without = C.normalizePolicy({ ...raw, slots: { now: 3, soon: 2, know: 1 } });
  assert.ok(without.warnings.some((w) => w.includes("expandMax")) && without.slots.expandMax === null);
  assert.ok(C.curate([], st(), without, T).warnings.length === 1);
  assert.deepStrictEqual(C.normalizePolicy({ ...raw, slots: { now: 3, soon: 2, know: 1, expandMax: 5 } }).warnings, []);
});
test("C1: 정책이 id 로 ACT 라고 정한 지원은 마감 미확인·링크 없음이어도 KNOW 로 강등되지 않는다(기본 분류만 강등)", () => {
  const rec = (id) => ({ id, category: "행정·지원금", isLegacySubsidy: true, entryDate: D(-1), detail: { deadlineType: "unconfirmed" } });
  const r = C.curate([rec("PREG-005"), rec("ZZ-UNK")], st({ subsidyStatusOf: () => "available" }), P, T);
  const types = Object.fromEntries([...r.now, ...r.soon, ...r.know, ...r.overflow.now, ...r.overflow.soon, ...r.overflow.know].map((u) => [u.ids[0], u.type]));
  assert.deepStrictEqual([types["PREG-005"], types["ZZ-UNK"]], ["ACT", "KNOW"]);
});
test("C3: '곧'은 L5·L6 을 섞어 남은 날 오름차순(마감·시작일 없음은 맨 뒤)", () => {
  const e1 = ev("A-1", { windowStart: D(-100), windowEnd: D(40) }); // L5(긴 창), 마감 40일
  const e2 = ev("B-1", { engineStatus: "UPCOMING", windowStart: D(10), windowEnd: D(70) }); // L6, 시작 10일
  const e3 = ev("C-1", { windowStart: null, windowEnd: null }); // L5, 날짜 없음
  const e4 = ev("D-1", { engineStatus: "UPCOMING", windowStart: D(30), windowEnd: D(90) }); // L6, 30일
  const r = C.curate([e1, e2, e3, e4], st(), P, T);
  assert.deepStrictEqual([...r.soon, ...r.overflow.soon].map((u) => u.ids[0]), ["B-1", "D-1", "A-1", "C-1"]);
});
