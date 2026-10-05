// 3-3 신청하는 곳 한 줄(pending — 106 검증 뒤 test/ 로 이동). 실행: HN_ROOT=<repo> node --test <this>
const test = require("node:test"), assert = require("node:assert"), fs = require("fs"), path = require("path");
const ROOT = require("path").join(__dirname, ".."), V = require(ROOT + "/js/apply-channel-view.js");
const app = fs.readFileSync(path.join(ROOT, "js/app.js"), "utf8");
test("필드가 없거나 비면 빈 문자열(지금 화면과 같음)", () => {
  for (const rec of [null, {}, { applyChannel: [] }, { applyChannel: ["bogus"] }, { applyPlaceText: "  " }, { applyChannel: "online" }]) assert.strictEqual(V.rowHtml(rec, { url: "https://x.kr", label: "신청" }), "", JSON.stringify(rec));
});
test("원문(applyPlaceText)이 있으면 그대로, 없으면 채널 이름만(새 사실 없음), 이스케이프", () => {
  assert.ok(V.rowHtml({ applyChannel: ["visit"], applyPlaceText: "주민센터 또는 <정부24>" }).includes("주민센터 또는 &lt;정부24&gt;"));
  const h = V.rowHtml({ applyChannel: ["healthCenter", "visit", "visit"] }); assert.ok(h.includes("보건소 · 방문") && h.includes("신청하는 곳"));
});
test("버튼은 online + 기존 신청 링크가 있을 때만(방문·보건소·원스톱은 문구만, 링크 http(s)만)", () => {
  const ap = { url: "https://www.gov.kr/x", label: "정부24에서 신청" };
  assert.ok(V.rowHtml({ applyChannel: ["online", "visit"] }, ap).includes('href="https://www.gov.kr/x"') && V.rowHtml({ applyChannel: ["online", "visit"] }, ap).includes("정부24에서 신청"));
  assert.ok(!V.rowHtml({ applyChannel: ["visit"] }, ap).includes("<a ")); assert.ok(!V.rowHtml({ applyChannel: ["healthCenter"] }, ap).includes("<a ")); assert.ok(!V.rowHtml({ applyChannel: ["online"] }, null).includes("<a "));
  assert.ok(!V.rowHtml({ applyChannel: ["online"] }, { url: "javascript:alert(1)", label: "x" }).includes("<a "));
});
test("앱 연결: 지원금 상세의 신청·지급 기간 아래 한 줄, 모듈이 없으면 빈 문자열", () => {
  assert.ok(app.includes('ApplyChannelView.rowHtml(s, usApplyLinkOf(e))') && app.includes('typeof ApplyChannelView !== "undefined"'));
});
