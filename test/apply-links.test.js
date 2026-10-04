/*
 * 신청용 링크 데이터(E 1-2 데이터 부분): national.json 의 applyUrl·applyLabel, SB-* 의 subsidyRef 조회, VX/HC 분류 기본값, 근거 링크(officialUrl) 불변.
 * 실행: node test/apply-links.test.js
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const AL = require("../js/apply-links.js");
const read = (f) => JSON.parse(fs.readFileSync(path.join(__dirname, "..", f), "utf8"));
const NAT = read("data/subsidies/national.json").subsidies;
const SB = read("data/subsidies/national-todos.json").todos;
const BY_ID = Object.fromEntries(NAT.map((s) => [s.id, s]));
const B = "https://www.bokjiro.go.kr/ssis-tbu/twataa/wlfareInfo/moveTWAT52011M.do?wlfareInfoId=";

let passed = 0;
function test(name, fn) { try { fn(); passed++; console.log("  ok  - " + name); } catch (e) { process.exitCode = 1; console.log("  FAIL- " + name + "\n      " + (e.stack || e).split("\n").slice(0, 5).join("\n      ")); } }

test("지원금 5건: 조사 표의 신청 링크·버튼 이름(복지로 상세, 신청하러 가기)", () => {
  const want = { "NAT-001": "WLF00004657", "NAT-002": "WLF00004656", "NAT-003": "WLF00001171", "NAT-006": "WLF00003253", "NAT-007": "WLF00003250" };
  for (const [id, wlf] of Object.entries(want)) assert.deepStrictEqual(AL.forSubsidy(BY_ID[id]), { url: B + wlf, label: "신청하러 가기" }, id);
});
test("신청 링크는 위 5건 + NAT-020(유아학비, W4 조사 반영)에만 있고 모두 https·허용 버튼 이름이며, 근거 링크(officialUrl)는 그대로다", () => {
  const withApply = NAT.filter((s) => "applyUrl" in s || "applyLabel" in s).map((s) => s.id).sort();
  assert.deepStrictEqual(withApply, ["NAT-001", "NAT-002", "NAT-003", "NAT-006", "NAT-007", "NAT-020"]);
  NAT.filter((s) => s.applyUrl).forEach((s) => assert.ok(/^https:\/\//.test(s.applyUrl) && AL.LABELS.includes(s.applyLabel) && s.applyUrl !== s.officialUrl, s.id));
  const official = { "NAT-001": "https://www.korea.kr/multi/visualNewsView.do?newsId=148957936", "NAT-002": "https://www.socialservice.or.kr:444/user/htmlEditor/view2.do?p_sn=69", "NAT-003": "https://www.korea.kr/multi/visualNewsView.do?newsId=148963446", "NAT-006": "https://easylaw.go.kr/CSP/CnpClsMain.laf?popMenu=ov&csmSeq=626&ccfNo=3&cciNo=1&cnpClsNo=1", "NAT-007": "https://easylaw.go.kr/CSP/CnpClsMain.laf?popMenu=ov&csmSeq=626&ccfNo=2&cciNo=3&cnpClsNo=1" };
  for (const [id, u] of Object.entries(official)) assert.strictEqual(BY_ID[id].officialUrl, u, id + " officialUrl 불변");
});
test("SB-01·02·03·04·07 은 subsidyRef 한 필드로 지원금을 가리키고(링크 값은 조회), 다른 SB 는 링크 없음", () => {
  const ref = Object.fromEntries(SB.filter((t) => t.subsidyRef).map((t) => [t.todo_id, t.subsidyRef]));
  assert.deepStrictEqual(ref, { "SB-01": "NAT-002", "SB-02": "NAT-001", "SB-03": "NAT-001", "SB-04": "NAT-003", "SB-07": "NAT-007" });
  SB.forEach((t) => assert.ok(t.todo_id === "SB-08" ? t.applyUrl === "https://www.bokjiro.go.kr/ssis-tbu/twataa/wlfareInfo/moveTWAT52011M.do?wlfareInfoId=WLF00000969&wlfareInfoReldBztpCd=01" : !("applyUrl" in t) && !("applyLabel" in t), t.todo_id + " 에 링크 값을 중복 저장하지 않는다(SB-08 은 subsidyRef 가 없어 자체 링크 — W4 조사)"));
  assert.deepStrictEqual(AL.forTodo(SB.find((t) => t.todo_id === "SB-03"), BY_ID), { url: B + "WLF00004657", label: "신청하러 가기" });
  assert.deepStrictEqual(AL.forTodo(SB.find((t) => t.todo_id === "SB-01"), BY_ID), AL.forSubsidy(BY_ID["NAT-002"]));
  assert.strictEqual(AL.forTodo(SB.find((t) => t.todo_id === "SB-05"), BY_ID), null);
  assert.strictEqual(AL.forTodo({ todo_id: "SB-02", subsidyRef: "NAT-999" }, BY_ID), null, "없는 참조는 null");
});
test("접종(VX-*)·검진(HC-*)은 분류 단위 기본값 한 곳 — 정의 파일에는 링크 필드를 넣지 않는다", () => {
  assert.deepStrictEqual(AL.forTodo({ todo_id: "VX-DTAP__dose-2" }), { url: "https://nip.kdca.go.kr/", label: "예방접종도우미 열기" });
  assert.deepStrictEqual(AL.forTodo({ id: "VX-RSV" }), AL.CATEGORY_DEFAULTS.VX);
  assert.deepStrictEqual(AL.forTodo({ todo_id: "HC-01" }), { url: "https://www.nhis.or.kr/nhis/healthin/wbhaca04800m01.do", label: "안내 보기" });
  assert.strictEqual(AL.forTodo({ todo_id: "DV-01" }), null);
  assert.strictEqual(AL.forTodo({ todo_id: "VXA" }), null);
  assert.strictEqual(AL.forTodo(null), null);
  assert.ok(Object.isFrozen(AL.CATEGORY_DEFAULTS) && Object.isFrozen(AL.CATEGORY_DEFAULTS.VX));
  // W4: 정의 자체에 신청 링크를 둔 것은 공식 페이지를 직접 확인한 4건(SC-01·SC-12·PG-01·PG-02)뿐이고, VX·HC 는 분류 기본값만 쓴다.
  const withLink = [];
  for (const f of fs.readdirSync(path.join(__dirname, "../data/todos")).filter((x) => x.endsWith(".json") && x !== "_meta.json"))
    for (const t of JSON.parse(fs.readFileSync(path.join(__dirname, "../data/todos", f), "utf8")).todos) { if ("applyUrl" in t || "applyLabel" in t) withLink.push(t.todo_id); assert.ok(!/nip\.kdca\.go\.kr\/?"/.test(JSON.stringify(t).replace(/"officialUrl"[^\n]*/g, "")), t.todo_id); }
  assert.deepStrictEqual(withLink.sort(), ["PG-01", "PG-02", "SC-01", "SC-12"]);
  assert.deepStrictEqual(AL.forTodo({ todo_id: "SC-01", applyUrl: "https://x.kr/", applyLabel: "안내 보기" }), { url: "https://x.kr/", label: "안내 보기" }, "정의 자체의 링크");
});
test("형식이 맞지 않는 값은 거른다(http·허용 밖 버튼 이름·javascript:)", () => {
  assert.strictEqual(AL.forSubsidy({ applyUrl: "http://x.kr/", applyLabel: "신청하러 가기" }), null);
  assert.strictEqual(AL.forSubsidy({ applyUrl: "https://x.kr/", applyLabel: "클릭" }), null);
  assert.strictEqual(AL.forSubsidy({ applyUrl: "javascript:alert(1)", applyLabel: "안내 보기" }), null);
  assert.strictEqual(AL.forSubsidy({ applyUrl: 'https://x.kr/"onmouseover=', applyLabel: "안내 보기" }), null);
  assert.strictEqual(AL.forSubsidy(null), null);
});
test("순수 모듈: DOM·네트워크 참조 없음", () => {
  const src = fs.readFileSync(path.join(__dirname, "../js/apply-links.js"), "utf8");
  assert.ok(!/document\.|window\.|fetch\(|XMLHttpRequest|localStorage|firebase/.test(src.replace(/typeof window[^\n]*/g, "")));
});
console.log(`\n${passed}개 통과${process.exitCode ? ", 일부 실패" : ""}`);
