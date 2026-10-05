// 4-2 시트 통일(일정·상세·프로필): 시트 범위 셀렉터 안에서만, 새 변수·새 색 없음, 상세 시트 면은 흰색(D21 A)·완료 단계 인디고(D22 A). 실행: node --test test/m16-sheet-unify.test.js
const test = require("node:test"), assert = require("node:assert"), fs = require("fs"), path = require("path");
const css = fs.readFileSync(path.join(__dirname, "..", "css/style.css"), "utf8");
const blk = css.slice(css.indexOf("/* ═══ v1.12.107 4-2 시트 통일"), css.indexOf("/* ═══ v1.12.108 4-2 마무리")); // 마무리 블록은 아래 별도 테스트(pending)
const noComment = blk.replace(/\/\*[\s\S]*?\*\//g, "");
const rules = [...noComment.matchAll(/([^{}]+)\{([^}]*)\}/g)].map((m) => ({ sel: m[1].trim(), body: m[2] })).filter((r) => r.sel);
test("모든 규칙은 세 시트 범위 안(일정 .us-form·상세 .as-steps·프로필 .acct-prof-head)에서만", () => {
  assert.ok(rules.length > 25);
  for (const r of rules) r.sel.split(/,(?![^()]*\))/).forEach((s) => assert.ok(/^(body\.acct-design )?\.modal-panel:has\(\.(us-form|as-steps|acct-prof-head)\)/.test(s.trim()), "범위 밖: " + s.trim()));
});
test("새 색·새 변수 없음: 색은 --nd-*·--line·--text 계열과 #fff 뿐", () => {
  assert.ok(!/--[a-z-]+\s*:\s*#/.test(blk.replace(/--(accent|accent-dark|c-primary):\s*var\(--nd-indigo\)/g, "")), "새 변수 정의 없음");
  const hexes = new Set((blk.replace(/\/\*[\s\S]*?\*\//g, "").match(/#[0-9a-fA-F]{3,6}\b/g) || []).map((h) => h.toLowerCase()));
  assert.deepStrictEqual([...hexes], ["#fff"], "직접 쓴 색은 흰색뿐");
});
test("일정 시트: 면 --nd-soft, 저장 버튼 인디고 52px, 선택 칩 노랑 면+선, 구성원 색 칩·삭제 버튼은 건드리지 않음", () => {
  assert.ok(/\.modal-panel:has\(\.us-form\) \{[^}]*background: var\(--nd-soft\)/.test(blk));
  assert.ok(/\.us-btn\.us-primary \{[^}]*var\(--nd-indigo\)[^}]*min-height: 52px/.test(blk));
  assert.ok(/\.us-chip\.active:not\(\[style\*="--us-color"\]\) \{[^}]*var\(--nd-yellow\)[^}]*var\(--nd-yellow-line\)/.test(blk));
  assert.ok(!/us-danger\) *\{|\.us-danger \{/.test(blk.replace(/:not\(\.us-danger\)/g, "")), "삭제 버튼 규칙 없음");
  assert.ok(!/\.us-chip\.active\[style\*="--us-color"\] \{/.test(blk), "구성원 색 선택 칩 규칙 없음(그대로)");
  assert.ok(!/\.us-chip\[style\*="--us-color"\]:not\(\.active\) \{/.test(blk.replace(/\/\*[\s\S]*?\*\//g, "")), "비선택 구성원 색 칩도 앱 기본(색 유지)");
});
test("상세 시트: 시트 면은 흰색 유지(배경 규칙 없음), 머리 흰 면, 현재·완료 단계 인디고(D22), 안내 보기=흰+인디고 선, 가족 캘린더에 넣기=인디고 면", () => {
  assert.ok(!/\.modal-panel:has\(\.as-steps\) \{[^}]*background:/.test(blk), "D21 A: 면 배경 지정 없음");
  assert.ok(/\.acct-sub-head \{[^}]*background: #fff/.test(blk));
  assert.ok(/\.as-current \.as-n \{[^}]*var\(--nd-indigo\)/.test(blk) && /\.as-done \.as-n \{[^}]*var\(--nd-indigo\)/.test(blk));
  assert.ok(/\[data-as="apply"\] \{[^}]*background: #fff[^}]*var\(--nd-indigo\)/.test(blk) && /\[data-as="link"\] \{[^}]*background: var\(--nd-indigo\)/.test(blk));
});
test("프로필 시트: 면 --nd-soft, 아바타 --nd-soft2, 가족 상자 흰 면(그라데이션 없음), 가족코드 알약 인디고 점선 선", () => {
  assert.ok(/\.modal-panel:has\(\.acct-prof-head\) \{[^}]*background: var\(--nd-soft\)/.test(blk) && /\.avatar \{[^}]*var\(--nd-soft2\)/.test(blk));
  assert.ok(/\.acct-fam-hero \{[^}]*background: #fff/.test(blk) && !/gradient/.test(blk));
  assert.ok(/\.acct-fam-pill \{[^}]*border-color: var\(--nd-indigo\)/.test(blk));
});

test("상세 시트 분류 뱃지(D34 C): 흰 면 + 1.5px 분류색 테두리 + 앞 점 — 흰 머리 위에서도 알약이 보인다", () => {
  const css = fs.readFileSync(path.join(__dirname, "..", "css", "style.css"), "utf8");
  assert.ok(/\.modal-panel \.cat-badge \{[^}]*border: 1\.5px solid transparent[^}]*linear-gradient\(#fff, #fff\) !important[^}]*padding-box, border-box !important/.test(css), "인라인 분류색이 테두리가 되고 안쪽은 흰색");
  assert.ok(/\.modal-panel \.cat-badge::before \{[^}]*background-color: inherit/.test(css), "앞 점은 분류색을 물려받는다");
  assert.ok(!/\.acct-sub-head \.cat-badge \{[^}]*background: #fff !important/.test(css), "머리 안에서도 분류색 테두리가 덮이지 않는다");
});
