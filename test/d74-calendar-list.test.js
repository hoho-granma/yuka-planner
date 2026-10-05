const assert = require("assert"), fs = require("fs"), path = require("path");
const V = require("../js/user-schedule-view.js");
const read = (f) => fs.readFileSync(path.join(__dirname, "..", f), "utf8");
const APP = read("js/app.js"), CSS = read("css/style.css");
let fail = 0;
function test(n, f) { try { f(); console.log("  ok  -", n); } catch (e) { fail++; console.log("  FAIL-", n, "\n", e.message); } }
const base = { key: "k", scheduleId: "s", title: "소아과 진료", categoryLabel: "건강", timeText: "오후 4:00 ~ 5:00 (1시간)", dateText: "", tag: "수아", color: "#c9b8ff", done: false };
test("직접 일정 카드: 제목 줄 + 내용 줄(시간·기간·분류·대상), 반복 알약은 내용 줄 오른쪽", () => {
  const h = V.renderCard({ ...base, recurring: true, repeatBadge: "반복", originalDate: "2026-10-05", movedText: "10/3에서 옮김" });
  assert.ok(/<span class="us-l1"><strong class="us-title">소아과 진료<\/strong><\/span>/.test(h));
  assert.ok(h.includes("오후 4:00 ~ 5:00 (1시간) · 건강 · 수아 · 10/3에서 옮김") && /<span class="us-l2"><span class="us-meta">[^<]*<\/span><span class="us-tag us-repeat">반복<\/span><\/span>/.test(h));
  assert.strictEqual((h.match(/class="us-l[12]"/g) || []).length, 2);
});
test("완료·취소됨 알약은 제목 줄 오른쪽", () => {
  assert.ok(/us-l1"><strong class="us-title">[^<]*<\/strong><span class="us-done">완료<\/span>/.test(V.renderCard({ ...base, done: true, doneLabel: "완료" })));
  assert.ok(/us-l1"><strong[^>]*>[^<]*<\/strong><span class="us-cancelled">취소됨<\/span>/.test(V.renderCard({ ...base, cancelled: true, cancelledLabel: "취소됨" })));
});
test("앱: '추가한 일정' 머리 줄·dayEmpty 안내 없음, 보일 항목 없을 때만 빈 안내", () => {
  const i = APP.indexOf("function usRenderDayPanel("), fn = APP.slice(i, APP.indexOf("\n  }\n", i));
  assert.ok(!fn.includes("panel.added.title") && !fn.includes("panel.emptyText") && fn.includes('el("selected-day-empty").classList.toggle("hidden"'));
  assert.ok(fn.includes("eventItemListHtml(e)") && APP.includes("function eventItemListHtml(") && APP.includes('<p class="li-l1">') && APP.includes('<p class="li-l2">'));
  assert.ok(APP.includes('sameDay(date, today) ? " · 오늘" : ""'));
});
test("CSS: 오늘=주황 테두리, 선택 규칙이 뒤(오늘 선택 시 노랑 한 줄), 2줄 말줄임·알약 고정·여백 축소", () => {
  const t = CSS.indexOf(".day-cell.today { background: transparent; box-shadow: inset 0 0 0 1.5px var(--accent-dark)"), s = CSS.lastIndexOf(".calendar-grid-v2 .day-cell.selected {");
  assert.ok(t > 0 && s > t);
  assert.ok(/\.us-card \.us-title \{[^}]*white-space: nowrap; overflow: hidden; text-overflow: ellipsis/.test(CSS) && /\.us-card \.us-l1 \.us-done[^{]*\{[^}]*flex: none/.test(CSS));
  assert.ok(/\.li2 \.li-l1 \.title \{[^}]*text-overflow: ellipsis/.test(CSS) && /\.li2 \.li-l2 \.li-txt \{[^}]*text-overflow: ellipsis/.test(CSS) && /#selected-day-list\.event-list \{ gap: 6px; \}/.test(CSS) && /#selected-day-list \.us-card \{ margin: 0; padding: 8px 12px; \}/.test(CSS));
});
process.exit(fail ? 1 : 0);
