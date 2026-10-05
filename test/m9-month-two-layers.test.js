// 1-3 월령 탭 두 층(④): 플래그 OFF/정책 없음이면 null(지금 그대로), ON이면 1층·2층 접힘·남은 N개(KNOW 제외). 실행: node --test test/m9-month-two-layers.test.js
const test = require("node:test"), assert = require("node:assert"), fs = require("fs"), path = require("path"), vm = require("vm");
const ROOT = path.join(__dirname, "..");
const C = require("../js/curation.js"), M = require("../js/month-tiers.js");
const policy = C.normalizePolicy(JSON.parse(fs.readFileSync(path.join(ROOT, "data/policy/curation.json"), "utf8")));
const app = fs.readFileSync(path.join(ROOT, "js/app.js"), "utf8");
const i = app.indexOf("  function monthTierGroupHtml("), fn = app.slice(i, app.indexOf("\n  }\n", i) + 4);
const ev = (id, cat, ws, we) => ({ id, title: id, category: cat, scheduleKind: "window", windowStart: ws, windowEnd: we, date: ws, detail: { definition: { todo_id: id.split("__")[0], catchUp: "ALLOWED", exposureLevel: "MUST" }, instance: {} } });
const list = [ev("VX-A__default", "예방접종", new Date(2026, 9, 1), new Date(2026, 9, 28)), ev("DV-02__default", "발달관찰", new Date(2026, 9, 1), new Date(2026, 9, 28)), ev("SF-01__default", "안전·돌봄", new Date(2026, 9, 1), new Date(2026, 9, 28))];
const mk = (flag, pol, mt, acked) => vm.runInNewContext(`${fn}; monthTierGroupHtml(list, "k")`, { FEATURES_CURATION_ON: () => flag, curationPolicy: pol, MonthTiers: mt, list, esc: (s) => String(s), eventItemHtml: (e) => `<i>${e.id}</i>`, isPregnant: () => false, ChildTimeline: { completedMonths: () => 3 }, profile: { birthDate: new Date(2026, 5, 20) }, completed: {}, monthAcked: () => acked || {}, Date });
test("플래그 OFF·정책 없음·MonthTiers 없음 = null(지금 그대로)", () => {
  assert.strictEqual(mk(false, policy, M), null); assert.strictEqual(mk(true, null, M), null); assert.strictEqual(mk(true, policy, undefined), null);
});
test("ON: 1층 미완료만 '남은 N개', 알아두기는 접힘 details, 주의엔 확인했어요", () => {
  const r = mk(true, policy, M);
  assert.ok(r && /<details class="mg-know">/.test(r.body) && !/<details class="mg-know" open/.test(r.body));
  assert.ok(/data-ack="SF-01__default"/.test(r.body) || !/SF-01/.test(r.body));
  assert.ok(/남은 \d+개/.test(r.badge) || r.badge === "");
});
test("연결: 클릭 핸들러 등록·기기 저장 키·Firestore 쓰기 없음", () => {
  assert.ok(app.includes('addEventListener("click", monthAckClick)'));
  const j = app.indexOf("  function monthAckClick("), h = app.slice(j, app.indexOf("\n  }\n", j) + 4);
  assert.ok(h.includes("hannun_month_acked") || app.includes('MONTH_ACK_KEY = "hannun_month_acked"'));
  assert.ok(!/firestore|setDoc|updateDoc/i.test(h + fn));
});
