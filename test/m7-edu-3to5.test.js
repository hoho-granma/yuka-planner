const test = require("node:test"), assert = require("node:assert");
const V = require("../js/edu-3to5-view.js");
const base = { region: "구로구", ageLabel: "5세", canAdd: true, mine: { count: 0, lessons: [] } };
const blocks = (h) => [...h.matchAll(/data-a36t="(\w+)"/g)].map((m) => m[1]);
test("블록 순서·숨김: 빈 상태에서는 B4·B5만(탭이 완전히 비지 않음), 또래 범위·트렌드·다음에 확인할 것은 렌더하지 않는다", () => {
  const h = V.render(base);
  assert.deepStrictEqual(blocks(h), ["lesson", "mine"]);
  for (const k of ["peer", "trend", "next"]) assert.ok(!h.includes(`data-a36t="${k}"`), k);
  assert.ok(h.includes("5세 교육 정보") && h.includes("어린이집·유치원·학원, 지금 무엇을 정하면 될까?") && h.includes("학원·체험 일정 넣기") && h.includes("학원 일정을 넣으면 아래"));
});
test("B1 올해 정할 것: 항목 줄(왜 지금·일정 넣기), 확인형 표시, 만 5세는 초등 준비 한 줄 — 항목이 없고 5세 아니면 블록 숨김", () => {
  const h = V.render({ ...base, decide: [{ id: "CR-02__default", title: "만3세반(유아반) 전환 준비", why: "3월 새 학기 전에 확인해요" }], nextSchool: true });
  assert.deepStrictEqual(blocks(h), ["decide", "lesson", "mine"]);
  assert.ok(h.includes("올해 정할 것") && h.includes("만3세반(유아반) 전환 준비") && h.includes('data-edu-id="CR-02__default"') && h.includes("내년에는 초등 입학 준비가 시작돼요"));
  assert.ok(!V.render({ ...base, decide: [], nextSchool: false }).includes('data-a36t="decide"'));
});
test("B2 지원: 확인형 '유치원·어린이집을 이용하면', 신청 링크 > 공식 안내, 지역 데이터 없으면 '아직 확인 중' 한 줄", () => {
  const h = V.render({ ...base, support: [{ id: "NAT-020", title: "유아학비", applyUrl: "https://a.kr" }, { id: "X", title: "다른 지원", officialUrl: "https://o.kr" }], supportRegionPending: true });
  assert.ok(h.includes("받을 수 있는 교육·보육 지원") && h.includes("유치원·어린이집을 이용하면") && h.includes('data-url="https://a.kr"') && h.includes("신청하기") && h.includes("공식 안내 보기") && h.includes("구로구 자체 지원은 아직 확인 중이에요"));
  assert.ok(!V.render({ ...base, support: [] }).includes('data-a36t="support"'));
});
test("B3 기관 찾기: 확인된 공식 링크가 넘어온 것만, 링크 확인 전(없음·http 아님)·지역 없음이면 블록 숨김, 줄마다 사이트 열기+상담 일정(날짜 빈칸 제목만)", () => {
  assert.ok(!V.render(base).includes('data-a36t="find"'));
  assert.ok(!V.render({ ...base, find: { links: [{ key: "kindergarten", name: "유치원알리미", url: "" }] } }).includes('data-a36t="find"'));
  assert.ok(!V.render({ ...base, region: "", find: { links: [{ key: "kindergarten", name: "유치원알리미", url: "https://e-childschoolinfo.moe.go.kr" }] } }).includes('data-a36t="find"'));
  const h = V.render({ ...base, find: { links: [{ key: "kindergarten", name: "유치원알리미", url: "https://x.kr" }, { key: "daycare", name: "어린이집 정보공개포털", url: "https://y.kr" }] } });
  assert.ok(h.includes("우리 동네 기관 찾기") && h.includes("구로구 기준") && h.includes("공식 사이트 열기") && h.includes('data-edu-title="유치원 상담"') && h.includes('data-edu-title="어린이집 방문"'));
});
test("숫자 없음·이스케이프·지역 없을 때 지역 설정 카드·현재 상태 목록", () => {
  const h = V.render({ ...base, region: "", mine: { count: 2, lessons: [{ title: "<b>영어</b>", weekly: 2 }, { title: "미술" }] } });
  assert.ok(h.includes('data-a36t="region"') && h.includes("주 2회") && h.includes("반복 없음") && !h.includes("<b>영어</b>"));
  assert.ok(!/[0-9]+\s*%|평균|순위|명 중/.test(V.render({ ...base, decide: [{ id: "a", title: "t" }] })), "통계 숫자 문구 없음");
  assert.ok(!V.render({ ...base, canAdd: false }).includes('data-a36="trend-add"'));
});
const fs = require("fs"), path = require("path"), vm = require("vm");
test("연결: 3~5세 분기는 acct36RenderTrend 안 한 곳, 초등(학년 있음)·36개월 미만은 기존 틀, B3 링크는 넘기지 않는다, 액션 4개는 기존 흐름", () => {
  const app = fs.readFileSync(path.join(__dirname, "..", "js/app.js"), "utf8");
  assert.ok(/if \(acct36Is3to5\(\) && typeof Edu3to5View !== "undefined"\) \{ panel\.innerHTML = Edu3to5View\.render\(acct36Edu3to5State\(pv, docs, keys\)\); return; \}/.test(app));
  assert.ok(/find: null,/.test(app), "처음학교로·기관 링크는 확인 전 비노출");
  for (const a of ["edu-open", "edu-plan", "edu-visit", "edu-school"]) assert.ok(app.includes(`a === "${a}"`), a);
  assert.ok(!/https?:\/\/[^"']*(childschoolinfo|childcare\.go|ssum)/.test(fs.readFileSync(path.join(__dirname, "..", "js/edu-3to5-view.js"), "utf8")), "뷰에 URL 하드코딩 없음");
  // acct36Is3to5 판정 추출 실행: 36개월 미만·임신·초등은 false, 3~5세는 true
  const i = app.indexOf("  function acct36Is3to5() {"), fn = app.slice(i, app.indexOf("\n  }\n", i) + 4);
  const mk = (months, grade, preg) => vm.runInNewContext(`${fn}; acct36Is3to5()`, { profile: { birthDate: 1 }, isPregnant: () => !!preg, ChildTimeline: { completedMonths: () => months, OVER36_FROM_MONTHS: 36 }, EduTrend: { gradeOf: () => grade }, schoolPolicy: null, Date });
  assert.deepStrictEqual([mk(30, 0), mk(36, 0), mk(60, 0), mk(80, 1), mk(50, 0, true)], [false, true, true, false, false]);
});
