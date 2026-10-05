const test = require("node:test"), assert = require("node:assert");
const C = require("../js/curation.js");
const ty=(t,sub="")=>({type:t,sub});
const raw = { thresholds:{deadlineSoonDays:30,upcomingDays:45,shortWindowDays:60,reappearDays:7}, slots:{now:3,soon:2,know:1},
  ids:{"X-CHK":ty("CHECK"),"SB-07":ty("CHECK","APPLY")}, triggerTypes:{MILESTONE_EVENT:ty("KNOW","MILESTONE")}, prefixByExposure:{VX:{CONDITIONAL:ty("CHECK","BOOK")}},
  prefix:{SC:ty("KNOW"),CR:ty("KNOW"),SB:ty("ACT"),VX:ty("ACT","BOOK")}, subsidyDefault:{ongoing:ty("KNOW","INFO_BENEFIT"),age_window:ty("ACT","APPLY"),unconfirmed:ty("ACT","APPLY")},
  urgentLongWindowIds:{ids:["LONG-1"]}, aliases:{pairs:[{primary:"NAT-031",alias:"SB-06"}]} };
const P = C.normalizePolicy(raw);
const T = new Date(2026,9,5), D = (n) => new Date(2026,9,5+n);
const ev = (id, o={}) => ({ id, title:id, category:"기타", engineStatus:"DUE", windowStart:D(-10), windowEnd:D(100), detail:{definition:{todo_id:id,catchUp:"ALLOWED",exposureLevel:"MUST",priority:2},instance:{}}, ...o });
const st = (o={}) => ({ completed:{}, ageMonths:6, ...o });
test("policy validation", () => { assert.equal(C.normalizePolicy({}), null); assert.ok(P); const r = C.curate([ev("A")], st(), null, T); assert.deepEqual(r.now, []); });
test("L1 last chance first, reasons+actionKind", () => {
  const a = ev("A", {windowEnd:D(10), detail:{definition:{todo_id:"A",catchUp:"NOT_ALLOWED"},instance:{}}});
  const r = C.curate([ev("B"), a], st({canSchedule:()=>true}), P, T);
  assert.equal(r.now[0].ids[0], "A"); assert.equal(r.now[0].rule, "L1"); assert.equal(r.now[0].actionKind, "schedule");
  assert.ok(r.reasons[r.now[0].key].text.includes("10일"));
});
test("applyOf -> apply kind", () => { const r = C.curate([ev("A",{windowEnd:D(5)})], st({applyOf:()=>({url:"https://x"})}), P, T); assert.equal(r.now[0].actionKind, "apply"); });
test("G1/G2/G3 gates", () => {
  const r = C.curate([ev("A"), ev("B"), ev("C",{engineStatus:"OVERDUE_FINAL"}), ev("D")], st({completed:{A:1}, linkDateOf:(e)=>e.id==="B"?D(8):null}), P, T);
  const g = Object.fromEntries(r.excluded.map(x=>[x.id,x.gate])); assert.deepEqual(g,{A:"G1",B:"G2",C:"G3"});
  const r2 = C.curate([ev("B")], st({linkDateOf:()=>D(7)}), P, T); assert.equal(r2.excluded.length, 0);
});
test("L4 uses urgentLongWindowIds, not priority", () => {
  const mk=(id,pri)=>ev(id,{detail:{definition:{todo_id:id,catchUp:"ALLOWED",priority:pri},instance:{}}});
  const r = C.curate([mk("LONG-1",2), mk("Z",1)], st(), P, T);
  const lv = Object.fromEntries([...r.now,...r.soon].map(u=>[u.ids[0],u.rule])); assert.equal(lv["LONG-1"],"L4"); assert.equal(lv["Z"],"L5");
});
test("unconfirmed subsidy never L2 and is KNOW without link", () => {
  const s = ev("GG-1",{category:"행정·지원금",isLegacySubsidy:true,deadlineDate:D(5),detail:{deadlineType:"unconfirmed"}});
  const r = C.curate([s], st(), P, T); assert.equal(r.now.length,0);
  assert.ok(![...r.now,...r.soon].some(u=>u.rule==="L2"));
});
test("overflow counted not demoted; know slot 1", () => {
  const evs = ["A","B","C","D","E"].map((i,k)=>ev(i,{windowEnd:D(5+k)}));
  const r = C.curate(evs, st(), P, T); assert.equal(r.now.length,3); assert.equal(r.moreCounts.now,2);
  const k = C.curate([ev("SC-09"),ev("SC-10")], st(), P, T); assert.equal(k.know.length,1); assert.equal(k.moreCounts.know,1);
});
test("alias drops from; unknown only CHECK", () => {
  const r = C.curate([ev("NAT-031",{windowEnd:D(5)})], st({unknown:[{id:"SB-06",title:"x"},{id:"SB-07",title:"y"}]}), P, T);
  assert.ok(r.excluded.some(x=>x.id==="SB-06"&&x.gate==="alias"));
  assert.equal(r.soon.find(u=>u.ids[0]==="SB-07").type,"CHECK");
});
test("같은 창 접종 묶음 + 순수", () => {
  const vx = (id) => ev(id, { category: "예방접종", windowEnd: D(20) });
  const evs = [vx("VX-A"), vx("VX-B")]; const a = C.curate(evs, st(), P, T), b = C.curate(evs, st(), P, T);
  assert.equal(JSON.stringify(a), JSON.stringify(b)); assert.equal([...a.now, ...a.soon].filter((u) => u.ids.length === 2).length, 1);
});
test("overflow 단위가 moreCounts 와 일치", () => {
  const evs = ["A","B","C","D","E"].map((i,k)=>ev(i,{windowEnd:D(5+k)}));
  const r = C.curate(evs, st(), P, T);
  assert.equal(r.overflow.now.length, r.moreCounts.now); assert.deepEqual(r.overflow.now.map(u=>u.ids[0]), ["D","E"]);
  const k = C.curate([ev("SC-09"),ev("SC-10")], st(), P, T); assert.equal(k.overflow.know.length, k.moreCounts.know);
});
