/* D34=C: 종류 6색 + 칩·뱃지 모양(흰 면 + 1.5px 색 테두리 + 앞 색 점, 글자 #161618). 실행: node test/m25-category-chip-c.test.js */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const read = (f) => fs.readFileSync(path.join(__dirname, "..", f), "utf8");
let passed = 0;
function test(name, f) { try { f(); passed++; console.log("  ok  - " + name); } catch (e) { process.exitCode = 1; console.log("  FAIL- " + name + "\n      " + (e.stack || e).split("\n").slice(0, 3).join("\n      ")); } }
const SCH = read("js/schedule.js"), APP = read("js/app.js"), CSS = read("css/style.css");
test("CATEGORY_META 6색은 D49 테마별 종류 세트(var(--k-vx/hc/dv/lf/sf/bn))다 — 값은 css 의 :root/theme-forest 에 있다", () => {
  const want = { "예방접종": "vx", "영유아검진": "hc", "발달관찰": "dv", "생활·수유": "lf", "안전·돌봄": "sf", "행정·지원금": "bn" };
  for (const [k, c] of Object.entries(want)) assert.ok(new RegExp(`"${k}": \\{ label: "[^"]+", color: "var\\(--k-${c}\\)" \\}`).test(SCH), k);
  const blk = SCH.slice(SCH.indexOf("const CATEGORY_META = {"), SCH.indexOf("};", SCH.indexOf("const CATEGORY_META = {")));
  assert.ok(!/#22c55e|#3b82f6|#a855f7|#eab308|#ef4444|#475569|#3f6fe0|#8a5ae0|#23935a|#a87700|#d94545|#4a45c8/.test(blk), "옛 색이 남아 있지 않다");
});
test("필터 칩: 흰 면 + 분류색 테두리·점(--cat), 꺼진 칩은 흐리게, 글자 --nd-ink — 인라인 면 색 없음", () => {
  assert.ok(/class="chip cat-chip \$\{active \? "active" : ""\}" data-cat="\$\{key\}" style="--cat:\$\{meta\.color\}"><i class="cat-chip-dot"><\/i>/.test(APP));
  assert.ok(/\.chip\.cat-chip, \.chip\.cat-chip\.active \{[^}]*background: #fff[^}]*color: var\(--nd-ink\)[^}]*border: 1\.5px solid var\(--cat\)/.test(CSS));
  assert.ok(/\.chip\.cat-chip:not\(\.active\) \{ opacity: \.45; \}/.test(CSS) && /\.cat-chip-dot \{[^}]*background: var\(--cat\)/.test(CSS));
});
test("구성원(사람) 칩·와인색은 바꾸지 않았다: user-schedule-view 팔레트·--nd-wine 그대로", () => {
  const USV = read("js/user-schedule-view.js");
  assert.ok(/const PALETTES = /.test(USV) && /--nd-wine: #8a1c3d/.test(CSS), "구성원 칩 팔레트(D41 테마별)·와인 그대로");
});
console.log(`\n${passed} passed`);
