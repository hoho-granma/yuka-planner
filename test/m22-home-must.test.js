// 4-1 A안 이전 홈 맨 위 '지금 꼭 할 것' 카드·아이 칩 맨 위·정책 homeMust. 실행: node --test test/m22-home-must.test.js
const test = require("node:test"), assert = require("node:assert"), fs = require("fs"), path = require("path"), vm = require("vm");
const ROOT = path.join(__dirname, "..");
const HM = require("../js/home-must.js"), C = require("../js/curation.js");
const rd = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), "utf8"));
const today = new Date(2026, 9, 5);
const u = (key, title, rule, days, extra) => ({ key, title, rule, daysToEnd: days, items: [{ id: key, category: "예방접종" }], ...extra });
test("카드: 줄 모양·날짜 글자(L1·L2 D-N 와인, L3 지금 가능, L4 M월 D일까지)·외 N개·지난 날짜/기록 확인은 날짜 없음", () => {
  const h = HM.render({ units: [u("a", "DTaP 4차", "L2", 9), u("b", "검진", "L3", 0), u("c", "접종 5", "L4", 40), u("d", "지난 항목", "L2", -3), u("e", "기록", "L5", Infinity, { review: true })], more: 3, today, colorOf: () => "#abc" });
  assert.ok(h.includes('class="home-sec home-must"') && h.includes("지금 꼭 할 것") && h.includes("외 3개 ›") && h.includes("data-hm-more"));
  assert.ok(h.includes('<b class="hm-d urgent">D-9</b>') && h.includes('<b class="hm-d">지금 가능</b>') && h.includes("11월 14일까지"));
  const rows = h.split('class="home-must-row"').slice(1); assert.ok(!/class="hm-d[ "]/.test(rows[3]) && !/class="hm-d[ "]/.test(rows[4]), "지난·기록 확인은 날짜 없음");
  assert.strictEqual(HM.render({ units: [], more: 0, today }), ""); assert.strictEqual(HM.render({ today }), "");
  assert.ok(!HM.render({ units: [u("a", "x", "L1", 1)], more: 0, today }).includes("data-hm-more"), "N=0이면 링크 없음");
  assert.ok(HM.render({ units: [u("a", "x", "L4", 300)], today }).includes("2027년 "), "6개월 넘으면 연도");
});
test("정책 homeMust: 기본 2, 정수≥0만 인정(0이면 카드 없음), 실제 curation.json 읽어도 지워지지 않음", () => {
  const raw = rd("data/policy/curation.json");
  assert.strictEqual(C.normalizePolicy(raw).slots.homeMust, 2);
  for (const [v, want] of [[0, 0], [3, 3], [-1, 2], ["x", 2], [1.5, 2]]) assert.strictEqual(C.normalizePolicy({ ...raw, slots: { ...raw.slots, homeMust: v } }).slots.homeMust, want, String(v));
  assert.strictEqual(C.normalizePolicy(raw).slots.now, raw.slots.now, "엔진 슬롯 수치는 그대로");
});
test("이전 홈(home.js): 아이 칩이 맨 위(임신 배너 아래), 꼭 할 것 카드 그다음, 챙길 것 섹션 안에는 나이 한 줄만 / 카드·칩 없으면 기존과 같은 DOM", () => {
  const sb = { document: { getElementById: () => sb.wrap }, HNLogic: require("../js/hn-logic.js"), window: {}, console };
  sb.wrap = { innerHTML: "", querySelectorAll: () => [], querySelector: () => null, addEventListener() {} };
  vm.createContext(sb); vm.runInContext(fs.readFileSync(path.join(ROOT, "js/home.js"), "utf8"), sb);
  const HOME = sb.HNHome || sb.window.HNHome; assert.ok(HOME && HOME.render);
  const base = { profile: { birthDate: new Date(2026, 5, 20) }, events: [], completed: {}, today, pregnant: false, ageNow: 3, CATEGORY_META: {}, esc: (s) => String(s), formatDateKR: (d) => String(d), monthKeysOf: () => [], periodRangeOf: () => null, periodGroupLabel: () => "", eventItemHtml: () => "", homeOrder: null, allEvents: [], bindOpen() {}, onViewAll() {}, onOpen() {}, autoLinkText: () => "" };
  const run = (extra) => { sb.wrap.innerHTML = ""; try { HOME.render({ ...base, ...extra }); } catch (e) { return "ERR:" + e.message; } return sb.wrap.innerHTML; };
  const two = { accountHome: true, homeChildText: "은찬 · 3개월", homeChildren: [{ code: "a", name: "은찬", current: true }, { code: "b", name: "하린", current: false }] };
  const h = run({ ...two, mustHtml: '<section id="home-must"></section>' });
  assert.ok(!h.startsWith("ERR"), h.slice(0, 120));
  const iChip = h.indexOf("home-child-chips"), iMust = h.indexOf('id="home-must"'), iSec = h.indexOf("sec-today"), iLine = h.indexOf("home-child-line");
  assert.ok(iChip >= 0 && iChip < iMust && iMust < iSec && iSec < iLine, "칩 → 꼭 할 것 → 챙길 것(섹션 안에 나이 한 줄)");
  assert.strictEqual(h.split("home-child-chips").length - 1, 1, "칩은 한 번만");
  const none = run({ ...two }); assert.ok(!none.includes("home-must") && none.indexOf("home-child-chips") < none.indexOf("sec-today"));
  const one = run({ accountHome: true, homeChildText: "은찬", homeChildren: [{ code: "a", name: "은찬", current: true }], mustHtml: '<section id="home-must"></section>' }); assert.ok(!one.includes("home-child-chips") && one.includes('id="home-must"'), "아이 1명: 칩 없음");
  assert.ok(!run({}).includes("home-must"), "카드 없으면(비계정 포함) 기존과 같음");
});
test("앱 연결: (새 홈 삭제 — 조건 없음) 실패 조용히 생략·정책 0이면 없음·36+ 홈은 자동 일정 항목 건너뜀·클릭은 상세/체크리스트", () => {
  const app = fs.readFileSync(path.join(ROOT, "js/app.js"), "utf8");
  const i = app.indexOf("function homeMustHtml("), blk = app.slice(i, app.indexOf("\n  }\n", i) + 4);
  assert.ok(!blk.includes("FEATURES_CURATION_ON()") && blk.includes("if (n <= 0) return \"\"") && /catch \(e\) \{ console\.error\("지금 꼭 할 것 카드 생략", e\); return ""; \}/.test(blk));
  assert.ok(app.includes("homeMustHtml(autoItems.map((x) => x.id))") && app.includes("get mustHtml() { return homeMustHtml(); }"));
  const j = app.indexOf("function homeMustClick("), click = app.slice(j, app.indexOf("\n  }\n", j) + 4);
  assert.ok(click.includes('switchTab("checklist")') && click.includes("openDetail(e)") && !/localStorage|setDoc|updateDoc/.test(blk + click));
});
