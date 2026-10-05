/*
 * H7: colorKey 가 없는 엄마·아빠(옛 가구·기본 시드)는 옛 고정색을 그대로 쓰고, 새 구성원·아이는 10색 팔레트를 받는다. 새로 사람이 늘어도 기존 색은 바뀌지 않는다.
 * 실행: node --test test/h7-legacy-member-colors.test.js
 */
const test = require("node:test");
const assert = require("node:assert");
const HS = require("../js/household-sync.js");
const V = require("../js/user-schedule-view.js");

const memStorage = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
function adapter() {
  const docs = new Map();
  return { docs,
    async get(p) { return docs.has(p) ? { exists: true, data: JSON.parse(JSON.stringify(docs.get(p))) } : { exists: false, data: null }; },
    async set(p, d, o) { docs.set(p, o && o.merge ? { ...(docs.get(p) || {}), ...d } : { ...d }); },
    async update(p, d) { docs.set(p, { ...docs.get(p), ...d }); },
    async list() { return []; }, listen() { return () => {}; } };
}
const mk = () => { let T = 1; const a = adapter(); return { a, hs: HS.create({ adapter: a, storage: memStorage(), features: () => ({ household: true }), now: () => ++T, rand: () => 0.5 }) }; };
const members = (a, hid) => [...a.docs.entries()].filter(([k]) => k.startsWith(`households/${hid}/members/`)).map(([k, v]) => ({ memberId: k.split("/").pop(), ...v }));
const MOM = "#f7b5a1", DAD = "#7cf4c8";

test("colorKey 없는 엄마·아빠: 칩(계정 모드·역할 모드)·일정 막대·상세 점이 모두 옛 고정색, 같은 색이다", () => {
  const ms = [{ memberId: "m1", role: "MOM", label: "엄마", order: 1 }, { memberId: "m2", role: "DAD", label: "아빠", order: 2 }];
  const chipsA = V.filterChips([], [], ms, { memberMode: true, noFamily: true }).map((c) => c.color);
  const chipsB = V.filterChips([], [], ms, { noFamily: true }).map((c) => c.color);
  assert.deepStrictEqual(chipsA, [MOM, DAD]);
  assert.deepStrictEqual(chipsB, [MOM, DAD]);
  const bar = (role, id) => V.occurrenceColor({ assigneeRole: role, assigneeMemberId: id, assigneeColorKey: null }, []);
  assert.deepStrictEqual([bar("MOM", "m1"), bar("DAD", "m2")], [MOM, DAD], "막대 = 칩");
  assert.strictEqual(V.detailDots({ assigneeRole: "MOM", assigneeMemberId: "m1" }, []).assignee, MOM);
  assert.strictEqual(V.detailDots({ assigneeRole: "DAD", assigneeMemberId: "m2" }, []).assignee, DAD);
});

test("colorKey 없는 그 밖의 역할은 key 해시색(항상 같은 색), colorKey 가 있으면 엄마·아빠도 팔레트 색 — 칩과 막대가 같다", () => {
  const g = { memberId: "m9", role: "GRANDPARENT", label: "할머니", order: 3 };
  const c1 = V.filterChips([], [], [g], { memberMode: true, noFamily: true })[0].color;
  assert.strictEqual(c1, V.keyColor("m9", null));
  assert.strictEqual(V.occurrenceColor({ assigneeRole: "GRANDPARENT", assigneeMemberId: "m9", assigneeColorKey: null }, []), c1);
  const keyed = [{ memberId: "m1", role: "MOM", label: "엄마", order: 1, colorKey: "p1" }, { memberId: "m2", role: "DAD", label: "아빠", order: 2, colorKey: "p2" }];
  for (const opts of [{ memberMode: true, noFamily: true }, { noFamily: true }]) {
    assert.deepStrictEqual(V.filterChips([], [], keyed, opts).map((c) => c.color), [V.PALETTE[0], V.PALETTE[1]]);
  }
  assert.strictEqual(V.occurrenceColor({ assigneeRole: "MOM", assigneeMemberId: "m1", assigneeColorKey: "p1" }, []), V.PALETTE[0]);
});

test("기본 시드(엄마·아빠, 옵션 없는 createHousehold)는 colorKey 를 남기지 않아 옛 색 그대로 / 다시 저장(upsert)해도 colorKey 를 새로 달지 않는다", async () => {
  const { a, hs } = mk();
  const r = await hs.createHousehold({});
  const ms = members(a, r.householdId);
  assert.deepStrictEqual(ms.map((m) => [m.role, m.colorKey]), [["MOM", undefined], ["DAD", undefined]]);
  await hs.upsertMember(r.householdId, { memberId: ms[0].memberId, role: "MOM", label: "엄마2", order: 1 });
  await hs.upsertMember(r.householdId, { memberId: ms[1].memberId, role: "DAD", label: "아빠2", order: 2, uid: "u2" });
  assert.deepStrictEqual(members(a, r.householdId).map((m) => m.colorKey), [undefined, undefined]);
  assert.deepStrictEqual(V.filterChips([], [], members(a, r.householdId), { memberMode: true, noFamily: true }).map((c) => c.color), [MOM, DAD]);
});

test("새 구성원·아이를 늘려도 기존(옛) 엄마·아빠의 색은 그대로, 새 색은 옛 고정색과 겹치지 않는다(분홍=p6, 파랑=p9 는 나머지 8칸이 쓰인 뒤에만 겹친다)", async () => {
  const { a, hs } = mk();
  const r = await hs.createHousehold({});
  const hid = r.householdId;
  const before = V.filterChips([], [], members(a, hid), { memberMode: true, noFamily: true }).map((c) => c.color);
  const taken = [];
  for (let i = 0; i < 8; i++) { // p1~p5·p7·p8·p10 = 8 칸이 먼저 쓰인다
    const m = i % 2 ? await hs.upsertMember(hid, { role: "OTHER", label: "n" + i, order: 3 + i }) : await hs.addChild(hid, { familyCode: "C" + i, displayName: "k" + i, order: i + 1 });
    taken.push(a.docs.get(m.memberId ? `households/${hid}/members/${m.memberId}` : `households/${hid}/children/${m.childKey}`).colorKey);
  }
  assert.ok(!taken.includes("p6") && !taken.includes("p9"), "옛 엄마(p6)·아빠(p9)가 쓰는 칸은 비어 있는 칸이 있는 동안 배정하지 않는다: " + taken.join(","));
  assert.deepStrictEqual(new Set(taken).size, 8);
  assert.deepStrictEqual(V.filterChips([], [], members(a, hid), { memberMode: true, noFamily: true }).slice(0, 2).map((c) => c.color), before, "기존 엄마·아빠 색 불변");
  const next = await hs.upsertMember(hid, { role: "OTHER", label: "마지막", order: 99 }); // 10칸이 모두 한 번씩 쓰였다 → 이제부터는 가장 덜 쓰인(같으면 앞 번호) 색을 다시 쓴다
  assert.strictEqual(a.docs.get(`households/${hid}/members/${next.memberId}`).colorKey, "p1");
});

test("옛 파랑 #7cf4c8 는 팔레트 p9 와 같은 색이라 p9 를 점유한 것으로 센다", () => {
  const lab = (h) => { const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) => (c > 0.04045 ? Math.pow((c + 0.055) / 1.055, 2.4) : c / 12.92)); const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116); const X = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047, Y = 0.2126 * r + 0.7152 * g + 0.0722 * b, Z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883; return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))]; };
  const dE = (x, y) => Math.hypot(...lab(x).map((v, i) => v - lab(y)[i]));
  assert.ok(dE(DAD, V.PALETTE[8]) < 0.01, "p9 와 같다");
  assert.ok(dE(MOM, V.PALETTE[5]) < 0.01, "엄마 분홍은 p6 와 같다");
  const nearest = V.PALETTE.map((c, i) => [dE(DAD, c), i]).sort((x, y) => x[0] - y[0])[0][1];
  assert.strictEqual(nearest, 8, "가장 가까운 칸 = p9");
  const pick = HS.create({ adapter: adapter(), storage: memStorage(), features: () => ({ household: true }) });
  assert.ok(pick);
});
