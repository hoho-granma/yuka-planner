/*
 * K7 — 정보 카드: 행동 없는 정보 항목의 상세 시트에 '관련 행동 한 줄'(시안 g26 w4info A). 실행: node test/k7-info-actions.test.js
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const AS = require("../js/auto-steps.js");
const ROOT = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
const APP = read("js/app.js");
let passed = 0;
function test(name, fn) { try { fn(); passed++; console.log("  ok  - " + name); } catch (e) { process.exitCode = 1; console.log("  FAIL- " + name + "\n      " + (e.stack || e).split("\n").slice(0, 3).join("\n      ")); } }

console.log("정책 데이터·판정");
test("info-actions.json: 형식이 맞는 항목만 받고, 틀린 항목·빈 라벨·40자 초과는 버린다", () => {
  const n = AS.normalizeInfoActions(JSON.parse(read("data/policy/info-actions.json")));
  assert.deepStrictEqual(Object.keys(n).sort(), ["CR-01__default", "PREG-003", "PREG-003__default"]);
  assert.strictEqual(n["CR-01__default"].label, "등록대기 신청 일정"); // U4: 입소대기 → 등록대기
  assert.deepStrictEqual(AS.normalizeInfoActions({ actions: { a: { label: "" }, b: {}, c: { label: "x".repeat(41) }, d: { label: " 확인 " }, e: null } }), { d: { label: "확인" } });
  assert.deepStrictEqual(AS.normalizeInfoActions(null), {}); assert.deepStrictEqual(AS.normalizeInfoActions({ actions: [] }), {});
});
test("행동 찾기: 이벤트 id 그대로 또는 '__default' 를 붙이거나 뗀 id, 목록에 없으면 null(행동을 만들지 않는다)", () => {
  const a = AS.normalizeInfoActions({ actions: { "CR-01__default": { label: "등록대기 신청 일정" }, "PREG-003": { label: "산부인과 검진 일정" } } });
  assert.strictEqual(AS.infoActionOf(a, { id: "CR-01__default" }).label, "등록대기 신청 일정");
  assert.strictEqual(AS.infoActionOf(a, { id: "CR-01" }).label, "등록대기 신청 일정");
  assert.strictEqual(AS.infoActionOf(a, { id: "PREG-003__default" }).label, "산부인과 검진 일정");
  assert.strictEqual(AS.infoActionOf(a, { id: "FD-01__default" }), null);
  assert.strictEqual(AS.infoActionOf(null, { id: "x" }), null); assert.strictEqual(AS.infoActionOf(a, null), null);
});
test("마크업: '관련 행동 한 줄' + 행동 이름 + '일정 +' 칩, '정보 카드' 구분 라벨 없음, 넣은 뒤엔 버튼 없이 '○월 ○일에 넣었어요', 이스케이프", () => {
  const h = AS.renderInfoAction({ label: "산부인과 검진 일정" });
  assert.ok(h.includes("관련 행동 한 줄") && h.includes("산부인과 검진 일정") && h.includes("일정 +") && h.includes('data-as="info-add"') && !h.includes("정보 카드"));
  const d = AS.renderInfoAction({ label: "산부인과 검진 일정" }, "10월 20일");
  assert.ok(d.includes("10월 20일에 넣었어요") && !d.includes("data-as="));
  assert.ok(AS.renderInfoAction({ label: "<b>x</b>" }).includes("&lt;b&gt;x&lt;/b&gt;"));
  assert.strictEqual(AS.renderInfoAction(null), "");
});

console.log("앱 연결");
const env = (o = {}) => {
  const a = APP.indexOf("  function asInfoSuggest("), b = APP.indexOf("  function acctDesignSteps(");
  const inserted = [];
  const box = { querySelector: (q) => (q === "[data-as-info]" ? (o.has ? {} : null) : q === ".acct-sub-head" ? null : { insertAdjacentHTML: (pos, html) => inserted.push([pos, html]) }) };
  const sb = { AutoSteps: AS, infoActions: AS.normalizeInfoActions(JSON.parse(read("data/policy/info-actions.json"))), completed: o.completed || {}, asInfoSaved: new Map(o.saved || []), asCur: null };
  vm.createContext(sb);
  vm.runInContext(APP.slice(a, b) + ";globalThis.fn=asInfoSuggest;", sb);
  return { sb, inserted, box, run: (e, ck, links) => sb.fn(box, e, ck, links) };
};
test("제안은 정해 둔 행동이 있는 정보 항목에서, 일정을 넣을 수 있는 상태(연결 색인·활성 아이)일 때만 나온다", () => {
  const e = { id: "CR-01__default" };
  let x = env(); x.run(e, "c1", new Map());
  assert.strictEqual(x.inserted.length, 1); const dataLabel = JSON.parse(read("data/policy/info-actions.json")).actions["CR-01__default"].label; assert.ok(x.inserted[0][1].includes(dataLabel)); assert.strictEqual(x.sb.asCur.info.label, dataLabel);
  x = env(); x.run({ id: "FD-01__default" }, "c1", new Map()); assert.strictEqual(x.inserted.length, 0, "행동이 없는 항목은 만들지 않는다");
  x = env(); x.run(e, "c1", null); assert.strictEqual(x.inserted.length, 0, "autoLink OFF");
  x = env(); x.run(e, null, new Map()); assert.strictEqual(x.inserted.length, 0, "활성 아이 없음");
  x = env({ completed: { "CR-01__default": { recordedAt: 1 } } }); x.run(e, "c1", new Map()); assert.strictEqual(x.inserted.length, 0, "완료한 항목");
  x = env({ has: true }); x.run(e, "c1", new Map()); assert.strictEqual(x.inserted.length, 0, "이미 그려져 있으면 다시 그리지 않음");
  x = env({ saved: [["CR-01__default", "2026-10-20"]] }); x.run(e, "c1", new Map());
  assert.ok(x.inserted[0][1].includes("10월 20일에 넣었어요") && !x.inserted[0][1].includes("data-as="));
});
test("저장: 관련 행동 일정은 정보 항목과 연결(autoRef)하지 않는 독립 일정이고, 이름은 행동 이름, 날짜 없으면 오늘, 저장하면 '넣었어요' 기억", () => {
  assert.ok(/\.\.\.\(c\.info \? \{\} : \{ autoRef: AutoSteps\.autoRefOf\(c\.e\) \}\)/.test(APP));
  assert.ok(/title: asCur\.info \? asCur\.info\.label : usAutoTitleOfEvent\(e\)/.test(APP) && /date: di\.iso \|\| \(asCur\.info \? toISODate\(new Date\(\)\) : ""\)/.test(APP));
  assert.ok(/if \(c\.info\) asInfoSaved\.set\(e\.id, f\.date\)/.test(APP));
  assert.ok(/act === "link" \|\| act === "info-add"/.test(APP));
  assert.ok(/if \(!applyLink && !canLink && !link && !\(done && \(existing \|\| family\)\)\) \{[^}]*asInfoSuggest\(box, e, ck, links\);/.test(APP));
});
test("기존 W4 스텝(신청·일정 넣기 가능 항목)은 그대로: 스텝이 있는 항목은 제안 분기를 타지 않는다 / 로더·캐시", () => {
  const i = APP.indexOf("function acctDesignSteps("), body = APP.slice(i, APP.indexOf("\n  }\n", i));
  assert.ok(body.indexOf("asInfoSuggest(") < body.indexOf("const subsidy = e.category"), "스텝이 없을 때만 분기하고 return");
  assert.ok(APP.includes('loadJsonOrNull("data/policy/info-actions.json")') && /infoActions = typeof AutoSteps === "undefined" \? \{\} : AutoSteps\.normalizeInfoActions\(infoRaw\)/.test(APP));
});

console.log("지역 없는 계정의 교육 트렌드(W6 설계 §4)");
test("지역이 없으면 제목은 학년만('초4 교육 트렌드', 앞이 비지 않음) + '지역을 설정하면 더 정확해져요' + 지역 설정하기 버튼, 지역이 있으면 기존 그대로(안내 없음)", () => {
  const V = require("../js/over36-view.js");
  assert.strictEqual(V.TREND.title("", "초4"), "초4 교육 트렌드");
  assert.strictEqual(V.TREND.title("  ", "초4"), "초4 교육 트렌드");
  assert.strictEqual(V.TREND.title("구로구", "초4"), "구로구 초4 교육 트렌드");
  const st = { gradeLabel: "초4", inRange: true, mine: { count: 0, lessons: [] }, status: { key: "INSUFFICIENT", label: "데이터 부족" }, canAdd: true };
  const none = V.renderTrend({ ...st, region: "" });
  assert.ok(none.includes("<h2>초4 교육 트렌드</h2>") && !none.includes("<h2> ") && none.includes("지역을 설정하면 더 정확해져요") && none.includes('data-a36="trend-region"') && none.includes("지역 설정하기"));
  const has = V.renderTrend({ ...st, region: "구로구" });
  assert.ok(has.includes("<h2>구로구 초4 교육 트렌드</h2>") && !has.includes("지역을 설정하면") && !has.includes("trend-region"));
  assert.ok(/if \(a === "trend-region"\) return showEditProfileSheet\(\);/.test(APP));
});

console.log(`\n${passed}개 통과`);
