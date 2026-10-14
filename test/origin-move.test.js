const assert = require("assert");
const M = require("../js/origin-move.js");
const mk = () => { const m = new Map(); return { get length() { return m.size; }, key: (i) => [...m.keys()][i], getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) }; };

const a = mk();
a.setItem("hannun_children", "[1]"); a.setItem("hn_selected_profile", "x"); a.setItem("hn-growth-hidden-lessons|s|f", "[]");
a.setItem("yukjigi_profile", "p"); a.setItem("hannun_feature_accounts", "0"); a.setItem("firebase:authUser:abc", "token"); a.setItem("other", "z");
const data = M.collectLocal(a);
assert.deepStrictEqual(Object.keys(data).sort(), ["hannun_children", "hn-growth-hidden-lessons|s|f", "hn_selected_profile", "yukjigi_profile"], "허용 목록 키만 모은다(개발 플래그·인증 토큰·기타 제외)");

const b = mk(); b.setItem("hannun_children", "KEEP");
const r = M.applyLocal(b, Object.assign({ evil: "1", hn_num: 5 }, data));
assert.strictEqual(b.getItem("hannun_children"), "KEEP", "이미 있는 값은 덮어쓰지 않는다");
assert.strictEqual(b.getItem("evil"), null, "허용 목록 밖 키는 쓰지 않는다");
assert.strictEqual(b.getItem("hn_num"), null, "문자열이 아닌 값은 쓰지 않는다");
assert.strictEqual(b.getItem("hn_selected_profile"), "x");
assert.deepStrictEqual(r, { written: 3, skipped: 3 });
assert.deepStrictEqual(M.applyLocal(mk(), null), { written: 0, skipped: 0 });
assert.strictEqual(M.OLD_ORIGIN, "https://hoho-granma.github.io");
assert.strictEqual(M.NEW_ORIGIN, "https://yuka-planner.web.app");
console.log("origin-move OK");
