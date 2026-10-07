/* G14 계정 모드 새 디자인(body.acct-design): 일정 상세·체크리스트·할 일 상세·혜택·혜택 상세·기록. 플래그 OFF 화면은 바뀌지 않는다(모든 새 CSS 는 body.acct-design 범위). 실행: node test/g14-account-design.test.js */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const read = (f) => fs.readFileSync(path.join(__dirname, "..", f), "utf8");
const CSS = read("css/style.css"), APP = read("js/app.js");
let passed = 0;
function test(name, fn) { try { fn(); passed++; console.log("  ok  - " + name); } catch (e) { process.exitCode = 1; console.log("  FAIL- " + name + "\n      " + (e.stack || e).split("\n").slice(0, 4).join("\n      ")); } }
const g14 = CSS.slice(CSS.indexOf("/* ===== G14:")).split("/* ═══ v1.12.92")[0];
const selectors = (css) => [...css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/(^|\})\s*([^{}@]+)\{/g)].flatMap((m) => m[2].split(",").map((x) => x.trim())).filter(Boolean);

test("모든 G14 CSS 규칙은 body.acct-design 범위 안(플래그 OFF 화면에 영향 없음)", () => {
  assert.ok(g14.length > 100);
  const bad = selectors(g14).filter((s) => !s.startsWith("body.acct-design"));
  assert.deepStrictEqual(bad, []);
});
test("body.acct-design 클래스는 계정 모드(acctInit 의 acctEnabled 가드 뒤)에서만 붙는다", () => {
  const i = APP.indexOf("  function acctInit() {");
  const src = APP.slice(i, APP.indexOf("\n  }\n", i));
  assert.ok(src.indexOf("if (!acctEnabled()) return;") < src.indexOf('classList.add("acct-design")'));
  assert.strictEqual((APP.match(/classList\.add\("acct-design"\)/g) || []).length, 1);
});
test("G14-1 일정 상세: 라벨·값 줄, 완료 버튼 전체 폭, 수정·삭제 2열, 닫기 전체 폭", () => {
  assert.ok(/body\.acct-design \.us-detail \.detail-row \{ display: flex; justify-content: space-between/.test(g14));
  assert.ok(/body\.acct-design \.us-detail \.us-actions \{ display: grid; grid-template-columns: 1fr 1fr/.test(g14));
  assert.ok(/\[data-us-action="toggle-done"\] \{ grid-column: 1 \/ -1/.test(g14) && /\[data-us-action="close"\]/.test(g14));
});
test("G14-2 체크리스트: 분류 칩 한 줄 가로 스크롤, 카드 안 신청 링크 버튼, 그룹 개수 알약(CSS)", () => {
  assert.ok(/body\.acct-design #filter-chips-checklist \{ flex-wrap: nowrap; overflow-x: auto/.test(g14));
  assert.ok(/body\.acct-design #list-checklist \.ck-go \{/.test(g14) && /body\.acct-design #list-checklist \.month-group-card \.count-badge/.test(g14));
});
test("G14-2 신청 링크 버튼: 계정 모드·미완료·링크 있는 카드에만, 이미 있는 링크 데이터만 사용, 카드 클릭(상세)은 그대로", () => {
  const vm = require("vm");
  const i = APP.indexOf("  function acctDesignApplyButtons(root) {");
  const src = APP.slice(i, APP.indexOf("\n  }\n", i) + 4);
  const mkItem = (id) => { const body = { kids: [], appendChild(n) { this.kids.push(n); }, querySelector: () => null }; return { id, body, getAttribute: () => id, querySelector(sel) { return sel === ".ck-go" ? (body.kids[0] || null) : sel === ".body" ? body : null; } }; };
  const run = (on, completed) => {
    const items = [mkItem("VX-A"), mkItem("X-NONE")];
    const sb = { acctEnabled: () => on, schedule: [{ id: "VX-A" }, { id: "X-NONE" }], completed, usApplyLinkOf: (e) => (e.id === "VX-A" ? { url: "https://nip.kdca.go.kr/", label: "예방접종도우미 열기" } : null),
      document: { createElement: () => ({ addEventListener(t, f) { this.stop = f; }, set textContent(v) { this.text = v; }, get textContent() { return this.text; } }) } };
    vm.createContext(sb);
    vm.runInContext(src + ";globalThis.f = acctDesignApplyButtons;", sb);
    sb.f({ querySelectorAll: () => items });
    return items.map((x) => x.body.kids.map((k) => [k.href, k.target, k.rel, k.text]));
  };
  assert.deepStrictEqual(run(true, {}), [[["https://nip.kdca.go.kr/", "_blank", "noopener noreferrer", "예방접종도우미 열기"]], []]);
  assert.deepStrictEqual(run(false, {}), [[], []], "OFF 는 아무것도 붙이지 않는다");
  assert.deepStrictEqual(run(true, { "VX-A": { done: true } }), [[], []], "완료한 카드에는 붙이지 않는다");
  assert.ok(src.includes("stopPropagation") && APP.includes('acctDesignApplyButtons(el("list-checklist"));'));
});
// ── 아주 작은 가짜 DOM(아코디언 변환 검증용) ──
class N {
  constructor(tag, cls, text) { this.tag = tag; this.className = cls || ""; this._text = text || ""; this.childNodes = []; this.parent = null; this.open = false; }
  get classList() { const c = this.className.split(/\s+/); return { contains: (x) => c.includes(x) }; }
  get children() { return this.childNodes.filter((x) => x instanceof N); }
  get firstChild() { return this.childNodes[0] || null; }
  get textContent() { return this._text; }
  set textContent(v) { this._text = v; }
  appendChild(n) { if (n.parent) n.parent.childNodes = n.parent.childNodes.filter((x) => x !== n); n.parent = this; this.childNodes.push(n); return n; }
  replaceChild(nu, old) { const i = this.childNodes.indexOf(old); this.childNodes[i] = nu; nu.parent = this; old.parent = null; }
  remove() { if (this.parent) this.parent.childNodes = this.parent.childNodes.filter((x) => x !== this); this.parent = null; }
  insertBefore(n, ref) { if (n.parent) n.parent.childNodes = n.parent.childNodes.filter((x) => x !== n); n.parent = this; const i = this.childNodes.indexOf(ref); this.childNodes.splice(i < 0 ? this.childNodes.length : i, 0, n); return n; }
  querySelector(sel) {
    const match = (x) => (sel[0] === "." ? x.className.split(/\s+/).includes(sel.slice(1)) : sel[0] === "#" ? x.id === sel.slice(1) : x.tag === sel);
    for (const x of this.childNodes) { if (!(x instanceof N)) continue; if (match(x)) return x; const d = x.querySelector(sel); if (d) return d; }
    return null;
  }
}
test("G14-3 할 일 상세: 줄마다 접는 항목(details)으로 바꾸고, 처음부터 펼칠 줄(해야 할 일·주의 신호·정상/비정상 기준)·접지 않을 줄(현재 상태·안내·완료일)을 지킨다", () => {
  const vm = require("vm");
  const i = APP.indexOf("  function acctDesignAccordion(box) {");
  const src = APP.slice(i, APP.indexOf("\n  }\n", i) + 4);
  const consts = APP.slice(APP.indexOf("  const ACC_OPEN_LABELS"), APP.indexOf("  function acctDesignAccordion(box) {"));
  const row = (label, body, extra) => { const r = new N("div", "detail-row" + (extra || "")); r.appendChild(new N("div", "label", label)); r.appendChild(new N("p", "val", body)); return r; };
  const box = new N("div", "");
  const kept = [new N("span", "cat-badge", "예방접종"), new N("h3", "", "IPV"), row("현재 상태", "완료", ""), row("해야 할 일", "접종", ""), row("완료 기준", "각 회차", ""), row("왜 하나요", "이유", ""), row("정상/비정상 기준", "기준", ""), row("정보 출처", "질병관리청", ""), row("완료일", "10월 2일", " completion-row"), new N("button", "btn-complete", "완료 취소")];
  kept.forEach((k) => box.appendChild(k));
  const sb = { document: { createElement: (t) => new N(t) }, Array, console };
  vm.createContext(sb);
  vm.runInContext(consts + src + ";globalThis.f = acctDesignAccordion;", sb);
  sb.f(box);
  const out = box.children.map((n) => (n.tag === "details" ? ["details", n.children[0].textContent, n.open, n.children[1].children.map((x) => x.textContent).join("")] : [n.tag, n.className]));
  assert.deepStrictEqual(out, [["span", "cat-badge"], ["h3", ""], ["div", "detail-row"], ["details", "해야 할 일", true, "접종"], ["details", "완료 기준", false, "각 회차"], ["details", "왜 하나요", false, "이유"], ["details", "정상/비정상 기준", true, "기준"], ["details", "정보 출처", false, "질병관리청"], ["div", "detail-row completion-row"], ["button", "btn-complete"]]);
  assert.ok(box.children[9] === kept[9] && box.children[8] === kept[8], "버튼·완료일 요소는 그대로(핸들러 유지)");
});
test("G14-3·5 연결: openDetail 본문은 그대로, 래퍼가 그린 뒤 계정 모드에서만 — 지원금은 상태 카드(D), 그 밖은 접는 항목(A)", () => {
  assert.ok(/const openDetailBase = openDetail;\n  openDetail = function openDetail\(e, cameFromDayList\) \{\n    openDetailBase\(e, cameFromDayList\);\n    if \(!acctEnabled\(\) \|\| !e\) return;\n    if \(e\.category === "행정·지원금"\) acctDesignSubsidy\(el\("modal-content"\)\);\n    else acctDesignAccordion\(el\("modal-content"\)\);/.test(APP));
  assert.ok(/body\.acct-design \.modal-panel \.acc-row > summary \{/.test(g14) && /\.acc-row\[open\] > summary::after \{ content: "▴"/.test(g14));
});
test("G14-4 혜택: 큰 카드(분류 점 숨김·큰 제목·큰 모서리), 범위 칩 한 줄, 접이식 줄은 그대로(CSS 범위만 — 렌더·핸들러 무변경)", () => {
  assert.ok(/body\.acct-design #subsidy-body \.event-item > \.cat-dot \{ display: none; \}/.test(g14) && /body\.acct-design #subsidy-body \.event-item \{[^}]*border-radius: 16px/.test(g14) && /body\.acct-design #subsidy-scope \{ flex-wrap: nowrap/.test(g14));
  const sv = read("js/subsidy-view.js");
  assert.ok(sv.includes('data-act="conditional"') && sv.includes('data-act="expired"') && sv.includes('data-scope="${k}"') && sv.includes('data-st="${k}"'), "상태 탭·범위 칩·접이식 마크업 그대로");
});
test("G14-5 혜택 상세: 머리(라벨·제목) + 상태 카드(신청 전/신청 완료/해당 없음)로 재배치하고 버튼·확인일 요소는 그대로 옮긴다", () => {
  const vm = require("vm");
  const i = APP.indexOf("  function acctDesignSubsidy(box) {");
  const src = APP.slice(i, APP.indexOf("\n  }\n", i) + 4);
  const build = (done, na) => {
    const box = new N("div", "");
    const nodes = {};
    const add = (n, k) => { nodes[k] = n; box.appendChild(n); return n; };
    add(new N("span", "cat-badge", "행정·지원금"), "badge"); add(new N("span", "prov-tag detail-tag", "전국 공통"), "tag"); add(new N("h3", "", "부모급여"), "h3");
    add(new N("div", "detail-row"), "row1");
    if (done) { const c = new N("div", "detail-row completion-row"); c.appendChild(new N("span", "", "10월 3일")); add(c, "comp"); }
    add(new N("a", "btn-official", "공식 안내 페이지로 이동"), "official");
    if (na) { const r = new N("button", "btn-complete", "다시 내 혜택에 포함하기"); r.id = "btn-na-restore"; add(r, "restore"); }
    else { const ch = new N("div", "apply-choice"); const b1 = new N("button", "btn-na", "미해당"); b1.id = "btn-mark-na"; const b2 = new N("button", "btn-complete", done ? "신청 완료 취소" : "해당 (신청 완료)"); b2.id = "btn-toggle-complete"; ch.appendChild(b1); ch.appendChild(b2); add(ch, "choice"); }
    add(new N("button", "btn-close", "닫기"), "close");
    return { box, nodes };
  };
  const run = (done, na) => {
    const { box, nodes } = build(done, na);
    const sb = { document: { createElement: (t) => new N(t) }, Array, console };
    vm.createContext(sb);
    vm.runInContext(src + ";globalThis.f = acctDesignSubsidy;", sb);
    sb.f(box);
    sb.f(box); // 두 번 불러도 한 번만(중복 방지)
    return { top: box.children.map((n) => n.className || n.tag), head: box.children[0].children.map((n) => n.className || n.tag), status: box.children[1].children.map((n) => n.className || n.tag).concat(box.children[1].children[0] ? [box.children[1].children[0].textContent] : []), box, nodes };
  };
  const a = run(false, false);
  assert.deepStrictEqual(a.top, ["acct-sub-head", "acct-sub-status", "detail-row", "btn-official", "btn-close", "apply-choice"]);
  assert.deepStrictEqual(a.head, ["cat-badge", "prov-tag detail-tag", "h3"]);
  assert.deepStrictEqual(a.status, []);
  const d = run(true, false);
  assert.deepStrictEqual([d.status[0], d.status[1], d.status[d.status.length - 1]], ["strong", "detail-row completion-row", "신청 완료"]);
  assert.ok(d.nodes.choice.parent === d.box && d.nodes.comp.parent === d.box.children[1], "확인일·버튼 요소가 그대로 옮겨졌다");
  const n = run(false, true);
  assert.deepStrictEqual([n.status[0], n.status[n.status.length - 1]], ["strong", "해당 없음으로 표시했어요"]);
  assert.ok(/body\.acct-design \.modal-panel \.acct-sub-head \{[^}]*background: var\(--c-ink\)/.test(g14) && /\.acct-sub-status \{ position: relative; margin: -20px 0 8px/.test(g14));
});
console.log(`\n${passed}개 통과`);

test("G15: (기록 추가 버튼은 D72a 기록 삭제로 없어짐) 체크리스트 '전체' 칩 앞 배치는 계정 모드만, 일정 상세 점은 opts.dots 일 때만, 종류 칩은 제목 일치로 선택", () => {
  const APP = fs.readFileSync(path.join(__dirname, "../js/app.js"), "utf8");
  const UV = fs.readFileSync(path.join(__dirname, "../js/user-schedule-view.js"), "utf8");
  assert.ok(APP.includes('const allFirst = containerId === "filter-chips-checklist" && typeof acctEnabled === "function" && acctEnabled();'));
  assert.ok(APP.includes('(allFirst ? allBtn : "") +') && APP.includes('(allFirst ? "" : allBtn);'));
  assert.ok(APP.includes("acctEnabled() ? { dots: UserScheduleView.detailDots(occ, usLinks()) } : undefined"));
  assert.ok(UV.includes("const dots = opts && opts.dots ? opts.dots : null;"));
  assert.ok(UV.includes("g13Kinds(f, c).find((x) => x.label === f.title)"));
  assert.ok(APP.includes("out.some((c) => c.code === familyCode)"), "G15-1 현재 아이 포함");
  assert.ok(APP.includes("usRefreshHome();") && APP.includes("acctKidsSig()"));
});
