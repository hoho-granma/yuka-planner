// 디자인 낮음 2건(pending): '곧' 줄 구분선 #4a45c8, 마감 임박 D-N 줄이 .summary 없는 카드에도 들어간다. 실행: HN_ROOT=<repo> node --test <this>
const test = require("node:test"), assert = require("node:assert"), fs = require("fs"), path = require("path"), vm = require("vm");
const ROOT = require("path").join(__dirname, ".."), app = fs.readFileSync(path.join(ROOT, "js/app.js"), "utf8"), css = fs.readFileSync(path.join(ROOT, "css/home-slots.css"), "utf8");
test("① '곧' 줄 구분선 = 인디고 슬롯 --nd-indigo(D41: 테마 따라감, 명세 #4a45c8의 변수화), 배너 테두리 #5536c4는 그대로", () => {
  assert.ok(/\.hs-sr \+ \.hs-sr \{ border-top: 1px solid var\(--nd-indigo\); \}/.test(css) && /\.hs-soon \{ border: 1\.5px solid #5536c4/.test(css));
});
const i = app.indexOf("eventItemHtml = function eventItemHtml(e, opts)"), blk = app.slice(i, app.indexOf("\n  };", i) + 5);
const run = (html, e, done) => vm.runInNewContext(`let eventItemHtml = function () { return html; }; const eventItemHtmlBase = eventItemHtml; ${blk}; eventItemHtml(e)`, { html, e, completed: done ? { [e.id]: true } : {}, formatDateKR: (d) => `${d.getMonth() + 1}월 ${d.getDate()}일`, Date });
const urgent = { id: "X", calUrgent: true, calDays: 5, fixedDate: new Date(2026, 9, 10) };
test("② D-N 줄: .summary 앞 → 없으면 본문 끝 → 완료·임박 아님은 그대로", () => {
  const withSum = '<div class="event-item"><div class="body"><p class="title">t</p><p class="summary">s</p></div><span class="check"></span></div>';
  const noSum = '<div class="event-item"><div class="body"><p class="title">t</p></div>\n        <span class="check"></span></div>';
  assert.ok(run(withSum, urgent).includes('<p class="sub-when urgent">D-5 · 10월 10일까지</p><p class="summary">'));
  const n = run(noSum, urgent); assert.ok(n.includes('D-5 · 10월 10일까지</p></div>') && n.indexOf("sub-when") < n.indexOf('class="check"'), n);
  assert.strictEqual(run(noSum, urgent, true), noSum); assert.strictEqual(run(noSum, { id: "X" }), noSum);
});
