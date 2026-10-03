/*
 * js/places.js · js/places-view.js 단위 테스트 — 어디갈까(S8) 장소 검증·필터·확인 기한·마크업·일정 초기값.
 * 실행: node test/places.test.js
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const P = require("../js/places.js");
const V = require("../js/places-view.js");
const US = require("../js/user-schedule.js");

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ok  - ${name}`);
  } catch (e) {
    console.error(`FAIL - ${name}\n       ${e.message}`);
    process.exitCode = 1;
  }
}
const base = {
  id: "seoul-guro-lib-001", name: "구로구립도서관", category: "LIBRARY", province: "서울특별시", district: "구로구",
  ageMonths: { min: 0, max: 72 }, indoor: "INDOOR", cost: "FREE", reservation: "NONE",
  address: "서울특별시 구로구 예시로 1", officialUrl: "https://example.go.kr/lib", summary: "영유아 자료실이 있는 구립 도서관", checkedAt: "2026-10-01", example: true,
};
const mk = (over) => ({ ...base, ...over });
const fields = (errs) => errs.map((e) => e.field);

console.log("데이터 파일");
test("data/places.json: v·label·status·_schema 와 빈 places, validateData 통과", () => {
  const data = JSON.parse(fs.readFileSync(path.join(__dirname, "../data/places.json"), "utf8"));
  assert.strictEqual(data.v, 1);
  assert.strictEqual(data.label, "편집 추천");
  assert(Array.isArray(data.places));
  P.FIELDS.forEach((k) => assert(k in data._schema, `_schema 에 ${k} 설명`));
  assert.deepStrictEqual(P.validateData(data), []);
});

console.log("validatePlace");
test("정상 항목은 오류 없음", () => assert.deepStrictEqual(P.validatePlace(base), []));
test("미확인 값(null) 허용: district·ageMonths·indoor·cost·reservation", () => {
  assert.deepStrictEqual(P.validatePlace(mk({ district: null, ageMonths: null, indoor: null, cost: null, reservation: null })), []);
});
test("필드 누락·정의 밖 필드", () => {
  const p = mk({ rank: 1 });
  delete p.summary;
  const f = fields(P.validatePlace(p));
  assert(f.includes("summary") && f.includes("rank"));
});
test("enum 위반: category·indoor·cost·reservation", () => {
  const f = fields(P.validatePlace(mk({ category: "공원", indoor: "IN", cost: "CHEAP", reservation: true })));
  ["category", "indoor", "cost", "reservation"].forEach((k) => assert(f.includes(k), k));
});
test("7개 분류 코드 전부 통과", () => {
  ["PARK", "KIDSCAFE", "EXPERIENCE", "EDU", "LIBRARY", "MUSEUM", "INDOOR"].forEach((c) => assert.deepStrictEqual(P.validatePlace(mk({ category: c })), [], c));
});
test("officialUrl: https 만", () => {
  ["http://example.go.kr", "javascript:alert(1)", "example.go.kr", "https://", "https://exa mple.kr", ""].forEach((u) =>
    assert(fields(P.validatePlace(mk({ officialUrl: u }))).includes("officialUrl"), u)
  );
});
test("checkedAt: 형식·실제 날짜", () => {
  ["2026-1-01", "2026-02-30", "20261001", null].forEach((d) => assert(fields(P.validatePlace(mk({ checkedAt: d }))).includes("checkedAt"), String(d)));
});
test("ageMonths: min>max·음수·모양 오류", () => {
  [{ min: 36, max: 12 }, { min: -1, max: 12 }, { min: 1.5, max: 12 }, { min: 0 }, [0, 12], { min: null, max: null }].forEach((a) =>
    assert(fields(P.validatePlace(mk({ ageMonths: a }))).includes("ageMonths"), JSON.stringify(a))
  );
  assert.deepStrictEqual(P.validatePlace(mk({ ageMonths: { min: 24, max: null } })), []);
});
test("순위·평가 표현 금지(summary·name)", () => {
  assert(fields(P.validatePlace(mk({ summary: "아이들에게 인기 많은 곳" }))).includes("summary"));
  assert(fields(P.validatePlace(mk({ summary: "Best 키즈카페" }))).includes("summary"));
  assert(fields(P.validatePlace(mk({ name: "구로 1위 놀이터" }))).includes("name"));
});
test("id 형식·example 타입·객체 아님", () => {
  assert(fields(P.validatePlace(mk({ id: "구로-1" }))).includes("id"));
  assert(fields(P.validatePlace(mk({ example: "yes" }))).includes("example"));
  assert.strictEqual(P.validatePlace(null).length, 1);
});
test("validateData: id 중복 검출", () => {
  const errs = P.validateData({ places: [base, base] });
  assert(errs.some((e) => e.message === "id 중복" && e.index === 1));
});

console.log("filterPlaces");
const L = [
  mk({ id: "a", district: "강남구", category: "PARK", ageMonths: null }),
  mk({ id: "b", district: "구로구", category: "LIBRARY", ageMonths: { min: 0, max: 36 } }),
  mk({ id: "c", province: "부산광역시", district: "해운대구", category: "PARK" }),
  mk({ id: "d", district: null, category: "MUSEUM", ageMonths: { min: 48, max: null } }),
  mk({ id: "e", district: "구로구", category: "PARK", ageMonths: { min: 12, max: 72 } }),
];
const ids = (l) => l.map((p) => p.id);
test("같은 시도만, 같은 시군구 먼저(나머지는 원래 순서)", () => {
  assert.deepStrictEqual(ids(P.filterPlaces(L, { province: "서울특별시", district: "구로구" })), ["b", "e", "a", "d"]);
});
test("나이 범위 밖 제외, ageMonths null 은 통과", () => {
  assert.deepStrictEqual(ids(P.filterPlaces(L, { province: "서울특별시", district: "구로구", ageMonths: 6 })), ["b", "a"]);
  assert.deepStrictEqual(ids(P.filterPlaces(L, { province: "서울특별시", ageMonths: 50 })), ["a", "d", "e"]);
});
test("category 필터, ALL·null 은 전체", () => {
  assert.deepStrictEqual(ids(P.filterPlaces(L, { category: "PARK" })), ["a", "c", "e"]);
  assert.strictEqual(P.filterPlaces(L, { category: "ALL" }).length, 5);
  assert.strictEqual(P.filterPlaces(L, null).length, 5);
});
test("잘못된 입력에도 안전, 원본 배열 불변", () => {
  assert.deepStrictEqual(P.filterPlaces(null, {}), []);
  const copy = L.slice();
  P.filterPlaces(L, { province: "서울특별시", district: "구로구" });
  assert.deepStrictEqual(ids(L), ids(copy));
});

console.log("isStale");
test("6개월 경과 기준(같은 날부터 오래됨), Date·문자열 모두", () => {
  const p = mk({ checkedAt: "2026-04-02" });
  assert.strictEqual(P.isStale(p, "2026-10-01"), false);
  assert.strictEqual(P.isStale(p, "2026-10-02"), true);
  assert.strictEqual(P.isStale(p, new Date(2026, 9, 1)), false);
  assert.strictEqual(P.isStale(p, "2026-07-02", 3), true);
});
test("말일 보정: 08-31 + 6개월 = 다음해 02-28", () => {
  const p = mk({ checkedAt: "2025-08-31" });
  assert.strictEqual(P.isStale(p, "2026-02-27"), false);
  assert.strictEqual(P.isStale(p, "2026-02-28"), true);
});
test("checkedAt 없음·잘못됨은 오래됨으로", () => {
  assert.strictEqual(P.isStale(mk({ checkedAt: null }), "2026-10-02"), true);
  assert.strictEqual(P.isStale(mk({ checkedAt: "2026-13-01" }), "2026-10-02"), true);
});

console.log("render");
const TODAY = "2026-10-02";
const child = { name: "은찬", ageLabel: "4개월" };
const region = { province: "서울특별시", district: "구로구" };
const noRank = (html) => {
  assert(!html.replace(/인기순/g, "").includes("인기"), "'인기' 없음(정렬 칩 '인기순' 제외)");
  assert(!/best/i.test(html), "'BEST' 없음");
};
test("빈 상태(P2): '편집 추천'·'준비 중' 표기 없이 조건 안내만, 분류 칩 8개", () => {
  const html = V.render({ places: [], category: null, today: TODAY });
  assert(html.includes("조건에 맞는 곳이 없어요. 필터를 줄여 보세요."));
  assert(!html.includes("편집 추천") && !html.includes("준비 중") && !html.includes("준비하고"));
  assert.strictEqual((html.match(/data-places-cat="/g) || []).length, 8);
  assert(html.includes('data-places-cat="ALL"') && /class="places-chip active"[^>]*data-places-cat="ALL"/.test(html));
  assert(!html.includes("places-card") && !html.includes("은찬"));
  noRank(html);
});
test("분류 선택 중 빈 목록은 분류 안내 + 해당 칩 active", () => {
  const html = V.render({ places: [], category: "MUSEUM", today: TODAY });
  assert(html.includes("이 분류에는 조건에 맞는 곳이 없어요"));
  assert(/class="places-chip active"[^>]*data-places-cat="MUSEUM"/.test(html));
});
test("카드 1개: 이름·설명·나이·실내외·비용·예약·링크·일정 추가·공통 안내", () => {
  const html = V.render({ places: [base], category: "LIBRARY", today: TODAY });
  assert.strictEqual((html.match(/class="places-card"/g) || []).length, 1);
  ["구로구립도서관", "영유아 자료실이 있는 구립 도서관", "0~72개월", "실내", "무료", "예약 없이 이용", "도서관", "예시"].forEach((s) => assert(html.includes(s), s));
  assert(html.includes('href="https://example.go.kr/lib" target="_blank" rel="noopener noreferrer"'));
  assert(html.includes('data-places-add="seoul-guro-lib-001"'));
  assert(html.includes("방문 전 공식 링크에서 운영 여부를 확인하세요"));
  assert(!html.includes("확인 오래됨"));
  noRank(html);
});
test("미확인(null) 값은 '방문 전 확인'", () => {
  const html = V.render({ places: [mk({ ageMonths: null, indoor: null, cost: null, reservation: null })], child, region, today: TODAY });
  assert.strictEqual((html.match(/방문 전 확인</g) || []).length, 4);
});
test("오래된 항목은 '확인 오래됨'", () => {
  const html = V.render({ places: [mk({ checkedAt: "2026-03-01" })], child, region, today: TODAY });
  assert(html.includes("확인 오래됨"));
});
test("HTML 이스케이프(이름·설명·주소·id·아이 이름·지역)", () => {
  const evil = mk({ id: "x", name: '<img src=x onerror="a">', summary: "a&b <script>", address: "\"'><b>" });
  const html = V.render({ places: [evil], today: TODAY });
  assert(!/<img|<script|<b>|<i>|<u>|<s>/.test(html));
  assert(html.includes("&lt;img src=x onerror=&quot;a&quot;&gt;") && html.includes("a&amp;b &lt;script&gt;") && html.includes("&quot;&#39;&gt;&lt;b&gt;"));
});
test("링크는 https 만 출력", () => {
  ["http://example.go.kr", "javascript:alert(1)", "//evil.example"].forEach((u) => {
    const html = V.render({ places: [mk({ officialUrl: u })], child, region, today: TODAY });
    assert(!html.includes("<a "), u);
    assert(html.includes("data-places-add="), "일정 추가 버튼은 남는다");
  });
});

console.log("scheduleDraftFor");
test("제목=장소명, 장소=주소, 가족·가족 전체", () => {
  assert.deepStrictEqual(V.scheduleDraftFor(base), { title: "구로구립도서관", location: "서울특별시 구로구 예시로 1", category: "FAMILY", scope: "FAMILY" });
});
test("기존 일정 enum·길이 제한과 맞는다(user-schedule.js)", () => {
  const d = V.scheduleDraftFor(mk({ name: "가".repeat(150), address: "나".repeat(150) }));
  assert(US.CATEGORIES.includes(d.category) && US.SCOPES.includes(d.scope));
  assert.strictEqual(d.title.length, US.LIMITS.titleMax);
  assert.strictEqual(d.location.length, US.LIMITS.locationMax);
  assert.strictEqual(V.SCHEDULE_LIMITS.titleMax, US.LIMITS.titleMax);
  assert.strictEqual(V.SCHEDULE_LIMITS.locationMax, US.LIMITS.locationMax);
});
test("일정 초기값으로 실제 일정 문서가 만들어진다(날짜만 채우면 저장 가능)", () => {
  const d = V.scheduleDraftFor(base);
  const r = US.buildCreateDoc({ sourceType: "MANUAL", ...d, childKeys: [], allDay: true, dateKind: "FIXED", eventDate: "2026-10-10" }, 1790000000000);
  assert(r.ok, JSON.stringify(r.errors));
});

console.log(`\n${passed} passed`);
