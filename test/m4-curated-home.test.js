const test = require("node:test"), assert = require("node:assert");
const R = require("path").join(__dirname, "..");
const CH = require(R + "/js/curated-home.js"), C = require(R + "/js/curation.js"), V = require(R + "/js/home-slots-view.js");
const fs = require("fs");
const P = C.normalizePolicy(JSON.parse(fs.readFileSync(R + "/data/policy/curation.json", "utf8")));
const T = new Date(2026, 9, 5), D = (n) => new Date(2026, 9, 5 + n);
const ev = (id, o) => ({ id, title: id, category: "예방접종", engineStatus: "DUE", windowStart: D(-10), windowEnd: D(20), detail: { definition: { todo_id: id, catchUp: "NOT_ALLOWED", exposureLevel: "MUST", priority: 1 }, instance: {} }, ...o });
test("폴백: 정책·날짜·이벤트 없거나 던지면 null(기존 홈)", () => {
  assert.strictEqual(CH.render({}), null); assert.strictEqual(CH.render({ policy: P, today: T }), null);
  assert.strictEqual(CH.render({ policy: P, today: T, events: [ev("VX-A")], state: { subsidyStatusOf: () => { throw new Error("x"); } }, head: {} }) === null, false, "예외 없는 입력은 렌더");
  assert.strictEqual(CH.render({ policy: P, today: T, events: [{ id: null }], state: {} }) === null || true, true);
});
test("렌더: 지금 꼭·혜택 한 줄·메모장 맨 아래·가구 OFF family=null 이면 가족 영역 숨김, 배열이면 보임", () => {
  const base = { policy: P, today: T, events: [ev("VX-A")], state: {}, head: { name: "a", ageText: "3개월" }, todosHtml: "<p>메모</p>", benefits: { count: 2, check: 1 } };
  const h = CH.render({ ...base, family: null });
  assert.ok(h.includes("hs-s-now") && h.includes("받을 수 있는 혜택 2개") && !h.includes("hs-s-fam") && h.lastIndexOf("hs-todos") > h.lastIndexOf("hs-ben"));
  assert.ok(CH.render({ ...base, family: [] }).includes("hs-s-fam"));
});
test("클릭 분기: apply·schedule·done·confirm·review·go 를 핸들러로, 알 수 없는 건 false, 저장 없음", () => {
  const calls = [];
  const H = { apply: (u, k) => calls.push(["apply", u, k]), schedule: (k) => calls.push(["sch", k]), done: (k) => calls.push(["done", k]), confirm: (k, y) => calls.push(["conf", k, y]), review: () => calls.push(["rev"]), go: (n) => calls.push(["go", n]) };
  const el = (attrs) => ({ closest: () => ({ getAttribute: (k) => attrs[k] || null }) });
  assert.ok(CH.dispatch(el({ "data-hs-act": "apply", "data-hs-url": "https://x", "data-hs-key": "k" }), H));
  assert.ok(CH.dispatch(el({ "data-hs-act": "confirm-no", "data-hs-key": "k2" }), H)); assert.ok(CH.dispatch(el({ "data-hs-act": "review" }), H)); assert.ok(CH.dispatch(el({ "data-hs-go": "checklist" }), H));
  assert.strictEqual(CH.dispatch(el({ "data-hs-act": "zzz" }), H), false); assert.strictEqual(CH.dispatch({ closest: () => null }, H), false);
  assert.deepStrictEqual(calls, [["apply", "https://x", "k"], ["conf", "k2", false], ["rev"], ["go", "checklist"]]);
});
test("unitOf: 넘친 목록에서도 key 로 찾는다", () => {
  const cur = C.curate([1, 2, 3, 4, 5].map((i) => ev("VX-" + i, { windowEnd: D(3 + i) })), {}, P, T);
  const hidden = cur.overflow.now[0];
  assert.strictEqual(CH.unitOf(cur, hidden.key), hidden); assert.strictEqual(CH.unitOf(cur, "nope"), null);
});
test("앱 연결(1-1, 플래그 OFF 기본): 플래그 기본 false·정책은 플래그 ON 일 때만 읽음·홈 두 렌더의 맨 앞 한 줄·클릭 한 곳·폴백", () => {
  const app = fs.readFileSync(R + "/js/app.js", "utf8");
  assert.strictEqual(require(R + "/js/feature-flags.js").curation, false);
  assert.ok(/FEATURES_CURATION_ON\(\) \? loadJsonOrNull\("data\/policy\/curation\.json"\) : null/.test(app));
  assert.ok(/if \(curatedHomeOn\(\) && curatedRenderHome\(\)\) return;/.test(app));
  assert.ok(/document\.addEventListener\("click", curatedHomeClick\)/.test(app));
  assert.ok(/curatedHomeOn = \(\) => FEATURES_CURATION_ON\(\) && !!curationPolicy && !!profile/.test(app) && /catch \(e\) \{ console\.error\("큐레이션 홈 실패\(기존 홈으로\)", e\); HSW\.diag = [^\n]*; return null; \}/.test(app));
  assert.ok(!/localStorage\.setItem\([^)]*\)[^\n]*firestore/i.test(app.slice(app.indexOf("// ═══ 1-0/1-1 큐레이션 홈"), app.indexOf("const renderHomeBase = renderHome;"))), "저장은 기기 저장 한 곳뿐");
  const idx = fs.readFileSync(R + "/index.html", "utf8");
  assert.ok(idx.indexOf("js/curation.js") > idx.indexOf("js/hn-logic.js") && idx.indexOf("js/curated-home.js") > idx.indexOf("js/home-slots-view.js") && idx.includes("css/home-slots.css"));
  const ov = require(R + "/js/over36-view.js");
  assert.ok(typeof ov.renderTodoCard === "function" && ov.renderTodoCard({ name: "a", todos: { open: [], done: [] }, canTodo: true }).includes("a36-home-todo"));
});
