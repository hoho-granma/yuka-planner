// D59: 붙여넣기 숫자 날짜·'키: 값' 안내문·첨부 표시 제거·버튼 문구·사진 실패 안내(손글씨) — 규칙 파서 보강(구조 변경·AI 호출 없음).
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const P = require("../js/capture/parse-ko.js");
const M = require("../js/capture/capture-model.js");
const DV = require("../js/capture/draft-view.js");
const PV = require("../js/capture/photo-view.js");
const AI = require("../js/capture/ai-parser.js");
let passed = 0;
function test(name, fn) { try { fn(); passed++; console.log("  ok  - " + name); } catch (e) { console.log("  FAIL - " + name + "\n" + e.stack); process.exitCode = 1; } }
const today = new Date(2026, 9, 5);
const parse = (t) => P.parse(t, { today, children: [] });

test("숫자 날짜 2026-10-23·2026.10.23·2026/10/23 인식(연도 4자리), 기존 '2026년 10월 23일'·'10월 23일'·'10/23' 그대로", () => {
  for (const t of ["2026-10-23 캠핑", "2026.10.23 캠핑", "2026/10/23 캠핑", "2026년 10월 23일 캠핑", "10월 23일 캠핑", "10/23 캠핑"]) {
    const c = parse(t); assert.strictEqual(c.length, 1, t); assert.strictEqual(c[0].eventDate, "2026-10-23", t); assert.strictEqual(c[0].title, "캠핑", t);
  }
  assert.strictEqual(parse("2026-10-23")[0].eventDate, "2026-10-23");
  const r = parse("2026.10.23~2026.10.25 캠핑")[0]; assert.strictEqual(r.eventDate, "2026-10-23"); assert.strictEqual(r.endDate, "2026-10-25");
});
test("짧은 '10.23'·존재하지 않는 날짜·소수는 날짜로 만들지 않는다", () => {
  assert.deepStrictEqual(parse("10.23 병원"), []);
  assert.deepStrictEqual(parse("2026-13-45 확인"), []);
  assert.deepStrictEqual(parse("버전 3.5 업데이트"), []);
});
test("'키: 값' 안내문: 제목=첫 줄, 날짜=이용기간, 1박·자리·금액=메모(줄바꿈·' / ' 모두)", () => {
  const nl = "성남 율동공원 오토캠핑장\n이용기간: 2026-10-23 (1박)\n이용자리: 텐트 사이트 E07\n이용금액: 55,000원";
  for (const t of [nl, nl.replace(/\n/g, " / "), "[사진 …IMG_9231.jpg]\n" + nl]) {
    const c = parse(t); assert.strictEqual(c.length, 1);
    assert.strictEqual(c[0].title, "성남 율동공원 오토캠핑장"); assert.strictEqual(c[0].eventDate, "2026-10-23"); assert.strictEqual(c[0].allDay, true);
    assert.strictEqual(c[0].memo, "1박\n이용자리: 텐트 사이트 E07\n이용금액: 55,000원");
    assert.ok(!c[0].needsCheck.some((n) => n.field === "title" || n.field === "date"));
  }
});
test("붙여넣기→후보→확인→등록 폼: 메모가 폼에 실리고 날짜 있는 후보는 등록 대상", () => {
  const s = M.fromParse(parse("성남 율동공원 오토캠핑장\n이용기간: 2026-10-23 (1박)\n이용자리: 텐트 사이트 E07\n이용금액: 55,000원"));
  assert.strictEqual(M.registrable(s).length, 1);
  const f = M.formFromCandidate(s.cands[0], { byDay: [], childKeys: [], category: "ETC" });
  assert.strictEqual(f.title, "성남 율동공원 오토캠핑장"); assert.strictEqual(f.eventDate, "2026-10-23"); assert.ok(f.memo.includes("E07") && f.memo.includes("55,000원") && f.memo.includes("1박"));
  assert.ok(DV.renderCandidates(s, {}).includes("1개 등록"));
});
test("기존 문장 규칙 회귀 없음: 날짜+행동 한 문장·머리말·여러 날짜", () => {
  const a = parse("10월 14일(화) 오후 3시 30분 하린 치과 예약입니다")[0]; assert.strictEqual(a.title, "하린 치과 예약"); assert.strictEqual(a.startTime, "15:30");
  assert.strictEqual(parse("10월 운영 안내: 10월 20일 소풍")[0].eventDate, "2026-10-20");
  assert.strictEqual(parse("10월 20일 소풍, 10월 22일 상담").length, 2);
  assert.strictEqual(parse("다음 주 화요일 세 시에 하린 치과 예약".replace("세 시", "3시"))[0].needsCheck.some((n) => n.field === "date"), true);
});
test("손글씨·깨진 글자(OCR '~이 ㅇ/이자(052)')는 후보로 새지 않고 막다른 길도 아니다", () => {
  assert.deepStrictEqual(parse("~이 ㅇ/이자(052)"), []);
  assert.strictEqual(AI.ruleFailed("~이 ㅇ/이자(052)", []), true);
  const h = PV.renderState("unparsed", { rawText: "~이 ㅇ/이자(052)" });
  assert.ok(h.includes("규칙으로 분석하지 못했어요") && h.includes("손글씨") && h.includes("data-cap-paste-prefill") && h.includes("data-cap-direct"));
});
test("버튼 문구: 붙여넣기 단계 '일정 등록'(찾기 아님), 말로 추가는 '해석하기', 후보 단계 저장 버튼은 'N개 등록' / 후보 0건은 [직접 입력하기]", () => {
  const paste = DV.renderPaste({ text: "x" }, {}); assert.ok(paste.includes(">일정 등록</button>") && !paste.includes("일정 찾기"));
  assert.ok(DV.renderPaste({ text: "x" }, { voice: true }).includes(">해석하기</button>"));
  assert.ok(DV.renderCandidates({ cands: [] }, {}).includes("data-cap-direct"));
});
console.log(`\n${passed}개 통과`);
