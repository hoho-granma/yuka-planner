/* D41 최종 디자인 토큰 묶음: 테마 2종 자동 전환·색 토큰·캘린더 선택/오늘·테마별 가족 팔레트·진한 바탕 글자 자동 흰색·'가족' 라벨. 실행: node test/m30-final-design-tokens.test.js */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const V = require("../js/user-schedule-view.js");
const CT = require("../js/child-timeline.js");
const read = (f) => fs.readFileSync(path.join(__dirname, "..", f), "utf8");
const CSS = read("css/style.css"), APP = read("js/app.js"), HTML = read("index.html");
let passed = 0;
function test(name, f) { try { f(); passed++; console.log("  ok  - " + name); } catch (e) { process.exitCode = 1; console.log("  FAIL- " + name + "\n      " + (e.stack || e).split("\n").slice(0, 3).join("\n      ")); } }
const block = (re) => (re.exec(CSS) || [""])[0];
const rootB = block(/^:root \{[\s\S]*?\n\}/), forestB = block(/body\.theme-forest \{[^}]*\}/), ndB = block(/:root \{\n  --nd-indigo[\s\S]*?\n\}/);
const v = (b, name) => { const m = new RegExp(`--${name}:\\s*([^;]+);`).exec(b); return m ? m[1].trim().toLowerCase() : null; };
const at = (months) => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth() - months, 1); };

console.log("색 토큰");
test("기본(:root) = 웜 브라운, body.theme-forest 가 딥 포레스트 값으로 덮는다(확정 시안 값)", () => {
  const W = { bg: "#fff8f0", line: "#e1e0df", text: "#2a2118", "text-muted": "#7b7570", "c-primary": "#ff8a5c", accent: "#ff8a5c", "c-select": "#ff8a5c", "c-active": "#e8683a", "accent-dark": "#e8683a", "c-select-border": "#e8683a", "c-soon": "#3a2412", "on-accent": "#2a2118", "cal-sel": "#f9cb34" };
  const F = { bg: "#f6f8f5", line: "#dfe1e0", text: "#1b2a22", "text-muted": "#727b76", "c-primary": "#1f6f4a", accent: "#1f6f4a", "c-select": "#1f6f4a", "c-active": "#1f6f4a", "accent-dark": "#1f6f4a", "c-select-border": "#1f6f4a", "c-soon": "#14382a", "cal-sel": "#f9cb34", "on-accent": "#ffffff" };
  for (const [k, c] of Object.entries(W)) assert.strictEqual(v(rootB, k), c, "warm " + k);
  for (const [k, c] of Object.entries(F)) assert.strictEqual(v(forestB, k), c, "forest " + k);
  const N = { w: { "nd-indigo": "#ff8a5c", "nd-soft": "#fff1e6", "nd-soft2": "#ffe2d0", "nd-home-bg": "#fff8f0", "nd-ink": "#2a2118", "nd-violet": "#ff8a5c", "nd-navy": "#3a2412" }, f: { "nd-indigo": "#1f6f4a", "nd-soft": "#edf3f1", "nd-soft2": "#d2e2db", "nd-home-bg": "#f6f8f5", "nd-ink": "#1b2a22", "nd-violet": "#1f6f4a", "nd-navy": "#14382a" } };
  for (const [k, c] of Object.entries(N.w)) assert.strictEqual(v(ndB, k), c, "warm " + k);
  for (const [k, c] of Object.entries(N.f)) assert.strictEqual(v(forestB, k), c, "forest " + k);
});
test("두 테마에서 같은 값(고정): 완료 청록·위험·마감 와인·선택 칩 노랑, 종류 6색은 D49 테마별 세트(--k-*) — forest 블록은 나머지 토큰을 덮지 않는다", () => {
  for (const k of ["c-ok", "success", "c-danger", "nd-wine", "nd-yellow", "nd-yellow-line", "c-warn", "chip-ink", "chip-off", "c-badge-auto"]) assert.ok(!new RegExp(`--${k}:`).test(forestB), k + " 은 테마와 무관");
  const sch = read("js/schedule.js"); for (const k of ["vx", "hc", "dv", "lf", "sf", "bn"]) assert.ok(sch.includes(`color: "var(--k-${k})"`), k);
  const K = { warm: ["#294ee1", "#9b26d1", "#199d5a", "#a58815", "#f31664", "#281cdc"], forest: ["#1b7bd9", "#572bdc", "#1e9f3f", "#be8025", "#f20d5d", "#2646c9"] };
  ["vx", "hc", "dv", "lf", "sf", "bn"].forEach((k, i) => { assert.strictEqual(v(rootB, "k-" + k), K.warm[i], "warm k-" + k); assert.strictEqual(v(forestB, "k-" + k), K.forest[i], "forest k-" + k); });
  const keys = ["접종", "검진", "발달", "생활", "안전", "혜택"]; V.setTheme("warm"); assert.deepStrictEqual(keys.map((k) => V.CATEGORY_COLORS[k]), K.warm); V.setTheme("forest"); assert.deepStrictEqual(keys.map((k) => V.CATEGORY_COLORS[k]), K.forest); V.setTheme("warm");
  assert.ok(/\.places-ph-park \{ background: linear-gradient\(135deg, var\(--d2\), var\(--d9\)\)/.test(read("css/places.css")) && !read("css/places.css").includes("color-mix(in srgb, var(--c-primary) 28%"), "어디갈까 사진 자리 = 분류별 다양한 색 그라데이션(D52 원복)");
  assert.strictEqual(v(rootB, "c-ok"), "#167c8a"); assert.strictEqual(v(rootB, "c-danger"), "#c23a37");
});
test("색 직접 쓰기 정리: 규칙 안 hex 는 흰색·허용 목록뿐(#ababab·#000·#fff6cc·#8a1c3d·#f4f3f1·#e0443a 는 변수로), 온보딩 원 변수는 이번 묶음 범위 밖", () => {
  const body = CSS.replace(/^:root \{[\s\S]*?\n\}/, "").replace(/body\.theme-forest \{[^}]*\}/, "").replace(/:root \{\n  --nd-indigo[\s\S]*?\n\}/, "").replace(/\/\*[\s\S]*?\*\//g, "");
  for (const hex of ["#ababab", "#000", "#fff6cc", "#8a1c3d", "#f4f3f1", "#e0443a"]) assert.ok(!body.toLowerCase().includes(hex), hex + " 는 변수로");
  assert.ok(!/#4a45c8/i.test(read("css/capture.css").replace(/\/\*[\s\S]*?\*\//g, "")) && !/#4a45c8|#8a1c3d/i.test(read("css/home-slots.css").replace(/\/\*[\s\S]*?\*\//g, "")));
});

console.log("캘린더 선택·오늘");
test("선택한 날 = 4면 같은 1.5px 선(--cal-sel) + 투명 배경(아래 4px 막대·30% 면 없음), 오늘 = 숫자 굵게 + 숫자 옆 5px 점(링 없음), 주 보기도 같은 규칙", () => {
  assert.ok(/\.calendar-grid-v2 \.day-cell\.selected \{ outline: none; background: transparent; box-shadow: inset 0 0 0 1\.5px var\(--cal-sel\); \}/.test(CSS));
  assert.ok(!/inset 0 -4px 0/.test(CSS) && !/color-mix\(in srgb, var\(--c-primary\) 30%/.test(CSS));
  assert.ok(/\.day-cell\.today \{ background: transparent; box-shadow: none; font-weight: 800; \}/.test(CSS) && !/\.day-cell\.today \.num::after/.test(CSS)); // D54: 오늘 작은 점 제거, 굵게만 유지
  assert.ok(/let selectedCalendarDate = new Date\(\);/.test(read("js/app.js")) && /\.calendar-grid-v2 \.day-cell\.selected \{ outline: none; background: transparent; box-shadow: inset 0 0 0 1\.5px var\(--cal-sel\); \}/.test(CSS), "D54: 기본 선택=오늘 → 오늘 칸 4면 1.5px 테두리");
  assert.ok(/\.week-col\.selected \{ border-color: transparent; box-shadow: inset 0 0 0 1\.5px var\(--cal-sel\); \}/.test(CSS) && /\.week-col\.today \.wk-num::after/.test(CSS));
});

console.log("테마 자동 전환");
function themeWorld(profile, pregnant) {
  const cls = new Set(), meta = { content: "", setAttribute(k, val) { meta.content = val; } }, ls = {}, calls = [];
  const sb = { profile, isPregnant: () => !!pregnant, ChildTimeline: CT, Date, UserScheduleView: { setTheme: (t) => calls.push(t), setColorOrder: () => null }, hh: {}, HouseholdSync: { getMirror: () => null }, THEME_KEY: "hannun_theme_last", THEME_BAR: { warm: "#fff8f0", forest: "#f6f8f5" },
    document: { body: { classList: { remove: (...a) => a.forEach((c) => cls.delete(c)), add: (c) => cls.add(c) } }, querySelector: () => meta }, localStorage: { setItem: (k, val) => (ls[k] = val) }, cls, meta, ls, calls };
  vm.createContext(sb);
  const i = APP.indexOf("  function themeFor() {"), j = APP.indexOf("  const renderAllThemeBase = renderAll;");
  vm.runInContext(APP.slice(i, j), sb); return sb;
}
test("판정: 생후 36개월 정각부터 딥 포레스트, 35개월·임신 중·아이 없음·미등록은 웜 브라운(보는 아이 기준)", () => {
  const f = (p, pr) => { const w = themeWorld(p, pr); return [w.themeSync(), [...w.cls].join(), w.calls.join(), w.meta.content, w.ls.hannun_theme_last]; };
  assert.deepStrictEqual(f({ birthDate: at(36) }), ["forest", "theme-forest", "forest", "#f6f8f5", "forest"]);
  assert.deepStrictEqual(f({ birthDate: at(35) }), ["warm", "theme-warm", "warm", "#fff8f0", "warm"]);
  assert.strictEqual(f({ birthDate: at(120) }, true)[0], "warm", "임신 중"); assert.strictEqual(f(null)[0], "warm", "아이 없음");
});
test("아이를 바꾸면(profile 교체 후 다시 맞춤) 클래스가 하나만 붙은 채 즉시 전환되고 가족 팔레트도 같이 바뀐다", () => {
  const w = themeWorld({ birthDate: at(120) }); w.themeSync(); assert.deepStrictEqual([...w.cls], ["theme-forest"]);
  w.profile = { birthDate: at(5) }; w.themeSync(); assert.deepStrictEqual([...w.cls], ["theme-warm"]); assert.deepStrictEqual(w.calls, ["forest", "warm"]);
  assert.ok(/renderAll = function renderAll\(\) \{ themeSync\(\); return renderAllThemeBase\.apply\(this, arguments\); \};/.test(APP), "그리기 전에 먼저 맞춘다");
});
test("첫 그림 전 깜빡임 방지: index.html 인라인 스크립트가 마지막 테마 캐시를 읽어 body 클래스·막대 색을 붙이고(없거나 오류면 웜), 기준은 앱이 월령으로 다시 정한다", () => {
  const m = /<body>\n<script>\/\* D41 theme:[\s\S]*?<\/script>/.exec(HTML); assert.ok(m, "body 바로 뒤");
  const run = (stored) => { const cls = new Set(), meta = { content: "", setAttribute(k, val) { meta.content = val; } };
    vm.runInNewContext(m[0].replace(/^<body>\n<script>/, "").replace(/<\/script>$/, ""), { localStorage: { getItem: () => stored }, document: { body: { classList: { add: (c) => cls.add(c) } }, querySelector: () => meta } }); return [[...cls].join(), meta.content]; };
  assert.deepStrictEqual(run("forest"), ["theme-forest", "#f6f8f5"]); assert.deepStrictEqual(run(null), ["theme-warm", "#fff8f0"]); assert.deepStrictEqual(run("x"), ["theme-warm", "#fff8f0"]);
});

console.log("가족 색 팔레트(테마별 10칸)");
test("세트: 웜 = 토스트(세트 2), 포레스트 = 물가 연두(세트 3) + d1 #bdf4ff, 슬롯 p1~p10 고정(colorKey 호환), 허용 목록은 두 팔레트의 합집합", () => {
  assert.deepStrictEqual([...V.PALETTES.warm], ["#a1e3f7", "#f4e07c", "#f47ca8", "#7c90f4", "#d2f7a1", "#f7b5a1", "#a1f7a4", "#b07cf4", "#7cf4c8", "#f7a1f4"]);
  assert.deepStrictEqual([...V.PALETTES.forest], ["#bdf4ff", "#f9d86c", "#fb93c0", "#d5fb93", "#93abfb", "#93fbce", "#b993fb", "#f9846c", "#71f96c", "#f46cf9"]);
  assert.deepStrictEqual(V.COLOR_KEYS, ["p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8", "p9", "p10"]);
  V.setTheme("forest"); assert.strictEqual(V.keyColor("x", "p1"), "#bdf4ff"); assert.strictEqual(V.keyColor("x", "p3"), "#fb93c0");
  const chip = V.cellChips([{ t: "u", occ: { title: "a", assigneeRole: "OTHER", assigneeMemberId: "m1", assigneeColorKey: "p2", scope: "FAMILY" } }], { links: [] }); assert.ok(chip.includes("#f9d86c") && !chip.includes(V.FAMILY_COLOR), "전환 직후에도 라벤더로 바뀌지 않는다");
  V.setTheme("warm"); assert.strictEqual(V.keyColor("x", "p1"), "#a1e3f7"); assert.strictEqual(V.getTheme(), "warm"); assert.strictEqual(V.setTheme("nope"), "warm");
  for (const p of ["#bdf4ff", "#f4e07c"]) assert.ok(V.cellChips([{ t: "u", occ: { title: "a", assigneeRole: "OTHER", assigneeMemberId: "m1", assigneeColorKey: p === "#bdf4ff" ? "p1" : "p1", scope: "FAMILY" } }], { links: [] }).length > 0);
});
test("같은 사람은 같은 슬롯이라 테마가 바뀌면 색 계열만 바뀐다(저장값 colorKey 불변), 옛 엄마·아빠(colorKey 없음)는 p6·p9 슬롯 색", () => {
  const m = { memberId: "a", role: "OTHER", colorKey: "p4" };
  V.setTheme("warm"); const w = V.memberColor(m); V.setTheme("forest"); const f = V.memberColor(m); V.setTheme("warm");
  assert.deepStrictEqual([w, f], ["#7c90f4", "#d5fb93"]); assert.strictEqual(m.colorKey, "p4");
  assert.strictEqual(V.MEMBER_COLORS.MOM, V.PALETTE[5]); assert.strictEqual(V.MEMBER_COLORS.DAD, V.PALETTE[8]);
});
test("확정 색 우선순위(D43)가 기본 순서, 가구 문서 colorOrder 는 읽기만(없거나 잘못되면 기본) — 쓰기·UI·규칙 변경 없음", () => {
  V.setColorOrder(null); V.setTheme("warm");
  assert.strictEqual(V.keyColor("x", "p1"), "#a1e3f7"); assert.strictEqual(V.keyColor("x", "p2"), "#f4e07c");
  const swap = [1, 0, 2, 3, 4, 5, 6, 7, 8, 9]; // 1번 ▲ — 1·2번 슬롯의 색이 서로 바뀐다(구성원은 그대로, colorKey 불변)
  assert.deepStrictEqual(V.setColorOrder({ warm: swap, forest: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] }), { warm: swap, forest: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] });
  assert.deepStrictEqual([V.keyColor("x", "p1"), V.keyColor("x", "p2"), V.keyColor("x", "p3")], ["#f4e07c", "#a1e3f7", "#f47ca8"]);
  V.setTheme("forest"); assert.strictEqual(V.keyColor("x", "p1"), "#bdf4ff", "다른 테마 순열은 따로"); V.setTheme("warm");
  for (const bad of [null, undefined, "x", {}, { warm: [0, 0, 2, 3, 4, 5, 6, 7, 8, 9] }, { warm: [1, 2, 3] }, { warm: [0, 1, 2, 3, 4, 5, 6, 7, 8, 10] }, { warm: "0123456789" }]) assert.strictEqual(V.setColorOrder(bad), null, JSON.stringify(bad));
  assert.strictEqual(V.keyColor("x", "p1"), "#a1e3f7", "잘못된 값이면 기본 순서");
  assert.deepStrictEqual(V.setColorOrder({ warm: [9, 8, 7, 6, 5, 4, 3, 2, 1, 0], forest: "x" }), { warm: [9, 8, 7, 6, 5, 4, 3, 2, 1, 0] }, "유효한 테마만 남긴다");
  V.setColorOrder(null);
  assert.ok(/setColorOrder\(m && m\.household && m\.household\.colorOrder\)/.test(APP), "app 은 미러의 가구 문서에서 읽기만");
  assert.ok(!/colorOrder/.test(read("js/household-sync.js") + read("firestore.rules")), "저장·규칙 변경은 이 묶음에 없다");
});

console.log("진한 바탕이면 글자 자동 흰색 · '가족' 라벨");
test("inkOn: 대비 4.5 미만이면 흰색, 아니면 먹색 — 두 테마 20색 모두 선택된 글자색 대비 4.5:1 이상, 진한 보라는 흰색", () => {
  assert.strictEqual(V.inkOn("#4a45c8"), "#ffffff"); assert.strictEqual(V.inkOn("#1f6f4a"), "#ffffff"); assert.strictEqual(V.inkOn("#f4e07c"), "#1a1410"); assert.strictEqual(V.inkOn("not-a-color"), "#1a1410", "알 수 없는 값은 기본 먹색");
  const lum = (h) => { const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((x) => (x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4))); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  const cr = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  for (const c of [...V.PALETTES.warm, ...V.PALETTES.forest]) assert.ok(cr(c, V.inkOn(c)) >= 4.5, c);
});
test("칩(필터·폼)과 달력 칩 마크업이 inkOn 결과를 --us-ink·color 로 내려 보내고, CSS 가 그 값을 쓴다 — 카드 띠 등 글자 없는 곳에는 안 붙임", () => {
  const chips = V.filterChips([], [], [{ memberId: "a", role: "OTHER", label: "나", colorKey: "p1" }], { memberMode: true, meId: "a", noFamily: true });
  const h = V.renderFilterChips(chips, {}); assert.ok(h.includes("--us-color:#a1e3f7;--us-ink:#1a1410"), h);
  assert.ok(V.cellChips([{ t: "u", occ: { title: "x", scope: "FAMILY", assigneeRole: "OTHER", assigneeMemberId: "a", assigneeColorKey: "p7" } }], { links: [] }).includes('style="background:#a1f7a4;color:#1a1410"'));
  assert.ok(/\.us-chip\[style\*="--us-color"\], \.us-chip\.active\[style\*="--us-color"\] \{ color: var\(--us-ink, var\(--chip-ink\)\); \}/.test(CSS));
  const dark = V.cellChips([{ t: "u", occ: { title: "x", scope: "CHILD", childKeys: ["k"] } }], { links: [{ childKey: "k", colorKey: "p1", order: 1 }] }); assert.ok(dark.includes("color:"), "달력 칩 글자색 인라인");
});
test("칩 라벨 '가족 전체' → '가족': 일정 폼 대상 칩·후보 카드 '누구' 칩·장소 등록 칩·오류 안내, '전체'(모두 보기) 칩은 그대로", () => {
  assert.strictEqual(V.MSG.targetFamily, "가족"); assert.strictEqual(V.MSG.filterFamily, "가족");
  assert.strictEqual(require("../js/capture/draft-view.js").MSG.familyAll, "가족"); assert.ok(read("js/places-view.js").includes('targetFamily: "가족",'));
  assert.ok(!/"가족 전체"/.test(read("js/user-schedule-view.js").replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "")));
});
console.log(`\n${passed} passed`);
