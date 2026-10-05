const assert = require("assert"), fs = require("fs"), path = require("path");
const US = require("../js/user-schedule.js"), V = require("../js/user-schedule-view.js"), PV = require("../js/places-view.js");
let fail = 0;
function test(n, f) { try { f(); console.log("  ok  -", n); } catch (e) { fail++; console.log("  FAIL-", n, "\n", e.stack.split("\n").slice(0, 3).join("\n")); } }
const NOW = 1790000000000, LINKS = [{ childKey: "c1", displayName: "은찬", order: 1 }];
const base = { sourceType: "MANUAL", title: "캠프", category: "FAMILY", scope: "FAMILY", allDay: true };
const mk = (o) => US.buildCreateDoc({ ...base, ...o }, NOW).doc;
const edited = (doc, over) => { const f = { ...V.formFromSchedule({ ...doc, id: "s1" }), ...over }; const r = V.prepareSave(f, NOW); assert.ok(r.ok, JSON.stringify(r)); return r.input; };
test("두 폼 모두 날짜 정함/미정 칩·여러 날 체크박스·장소 입력칸이 없다(메모는 있다)", () => {
  const f = V.newForm({ date: "2026-10-15", activeChildKey: "c1", links: LINKS });
  const hs = [V.renderForm(f, LINKS, {}), V.renderFormG13(V.upgradeFormG13(f, { meId: "m1" }), LINKS, { members: [{ memberId: "m1", label: "엄마" }], ctx: { meId: "m1" } })];
  for (const h of hs) assert.ok(!/data-us-kind=|id="us-multi"|id="us-location"|날짜 미정|여러 날에 걸쳐요/.test(h) && h.includes('id="us-memo"'));
});
test("기존 endDate 일정: 수정 폼에 입력칸 없이도 저장하면 endDate 유지", () => {
  const doc = mk({ dateKind: "FIXED", eventDate: "2026-10-01", endDate: "2026-10-03" });
  const h = V.renderForm({ ...V.formFromSchedule({ ...doc, id: "s1" }) }, LINKS, {});
  assert.ok(!h.includes('id="use-date"'));
  assert.strictEqual(edited(doc, { title: "캠프(수정)" }).endDate, "2026-10-03");
});
test("기존 PERIOD 일정: 수정 시트에는 기간 입력이 그대로 나오고 저장해도 기간 유지", () => {
  const doc = mk({ dateKind: "PERIOD", periodStart: "2026-10-01", periodEnd: "2026-10-31" });
  const h = V.renderForm(V.formFromSchedule({ ...doc, id: "s1" }), LINKS, {});
  assert.ok(h.includes('id="usps-date"') && h.includes('id="uspe-date"') && !h.includes("data-us-kind="));
  const i = edited(doc, {});
  assert.deepStrictEqual([i.dateKind, i.periodStart, i.periodEnd], ["PERIOD", "2026-10-01", "2026-10-31"]);
});
test("기존 location 일정: 상세 '장소' 줄 유지, 수정 폼에 칸은 없어도 저장하면 location 유지", () => {
  const doc = mk({ dateKind: "FIXED", eventDate: "2026-10-15", location: "구로 도서관" });
  assert.strictEqual(edited(doc, { title: "x" }).location, "구로 도서관");
  const occ = US.expandOccurrences(doc, "2026-10-15", "2026-10-15")[0];
  assert.ok(V.renderDetail(V.cardData({ ...occ, badges: [] }, LINKS, {}), {}).includes("구로 도서관"));
});
test("장소 상세 → 일정 등록: 주소는 메모 첫 줄 `장소: {시설명} {주소}`, location 비움, 500자 절단", () => {
  const place = { name: "구로 도서관", address: "서울 구로구 도림로 1", officialUrl: "https://x.kr/a" };
  assert.deepStrictEqual(PV.scheduleDraftFor(place), { title: "구로 도서관", category: "FAMILY", scope: "FAMILY" });
  assert.strictEqual(PV.memoFor(place), "장소: 구로 도서관 서울 구로구 도림로 1\n공식 홈페이지: https://x.kr/a");
  const doc = US.buildCreateDoc({ ...base, ...PV.scheduleDraftFor(place), dateKind: "FIXED", eventDate: "2026-10-10", memo: PV.memoFor(place) }, NOW);
  assert.ok(doc.ok && !("location" in doc.doc) && doc.doc.memo.split("\n")[0] === "장소: 구로 도서관 서울 구로구 도림로 1");
  assert.ok(PV.memoFor({ ...place, officialUrl: "https://x.kr/" + "a".repeat(600) }).length <= 500);
});
test("사진·붙여넣기 기간(endDate) 저장은 그대로: capture-model·parse-ko 가 endDate 를 낸다", () => {
  const read = (f) => fs.readFileSync(path.join(__dirname, "..", f), "utf8");
  assert.ok(/endDate/.test(read("js/capture/capture-model.js")) && /endDate/.test(read("js/capture/parse-ko.js")));
});
process.exit(fail ? 1 : 0);
