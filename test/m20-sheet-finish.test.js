// 4-2 마무리(pending): 새 블록 범위·새 색 없음·값. 실행: HN_ROOT=<repo> node --test <this>
const test = require("node:test"), assert = require("node:assert"), fs = require("fs");
const css = fs.readFileSync(require("path").join(__dirname, "..") + "/css/style.css", "utf8");
const blk = css.slice(css.indexOf("/* ═══ v1.12.108 4-2 마무리")).replace(/\/\*[\s\S]*?\*\//g, "");
const rules = [...blk.matchAll(/([^{}]+)\{([^}]*)\}/g)].map((m) => ({ sel: m[1].trim(), body: m[2] })).filter((r) => r.sel);
test("모든 규칙은 #ep-save·.us-detail·.ns-chain·.cs-list·.as-steps 시트 범위 안", () => {
  assert.ok(rules.length >= 10);
  for (const r of rules) r.sel.split(/,(?![^()]*\))/).forEach((s) => assert.ok(/^(body\.acct-design )?\.modal-panel:has\((#ep-save|\.us-detail|\.ns-chain|\.cs-list|\.as-steps)\)/.test(s.trim()), "범위 밖: " + s));
});
test("새 색 없음(직접 hex는 #fff뿐), 새 변수 정의 없음, 삭제·구성원 규칙 없음", () => {
  assert.deepStrictEqual([...new Set((blk.match(/#[0-9a-fA-F]{3,6}\b/g) || []).map((h) => h.toLowerCase()).filter((h) => !/^#ep/.test(h)))], ["#fff"]);
  assert.ok(!/--[a-z-]+\s*:\s*#/.test(blk) && !/delete|danger/.test(blk));
});
test("예약 일정 만들기 버튼은 인디고 보조(상세 시트 범위 안에서만, .btn-complete 전역은 그대로)", () => {
  assert.ok(/\.modal-panel:has\(\.as-steps\) \.auto-link-btn\.btn-complete \{ background: #fff; border: 1\.5px solid var\(--nd-indigo\); color: var\(--nd-indigo\); \}/.test(blk));
});
test("값: ① 선택칸 48px·16px ③-1 상세 --accent 인디고·흰 면 유지 ③-2 단계 번호 인디고 ③-3 아이 전환 면 --nd-soft·추가 버튼 인디고", () => {
  assert.ok(/\.ep-select \{ min-height: 48px; padding: 10px 14px; font-size: 16px; \}/.test(blk));
  assert.ok(/\.modal-panel:has\(\.us-detail\) \{ --accent: var\(--nd-indigo\)/.test(blk) && !/\.modal-panel:has\(\.us-detail\) \{[^}]*background/.test(blk));
  assert.ok(/\.ns-cn\.cur \.ns-n, [^{]*\.ns-cn\.fin \.ns-n \{ background: var\(--nd-indigo\)/.test(blk) && !/\.modal-panel:has\(\.ns-chain\) \{[^}]*background/.test(blk));
  assert.ok(/\.modal-panel:has\(\.cs-list\) \{[^}]*background: var\(--nd-soft\)/.test(blk) && /\.cs-add \{ background: var\(--nd-indigo\)[^}]*min-height: 52px/.test(blk));
});
