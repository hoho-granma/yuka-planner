const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('js/app.js','utf8');
function extract(a,b){return source.slice(source.indexOf(a),source.indexOf(b,source.indexOf(a)));}
test('first home skips hidden tabs; active tabs use current data',()=>{
 const calls=[];const c={currentTab:'home'};
 for(const name of ['renderProfileHeader','renderHome','renderCalendar','renderSelectedDayPanel','renderRemainingList','renderChecklistTab','renderSubsidyTab','attachListHandlers'])c[name]=()=>calls.push(name);
 vm.createContext(c);vm.runInContext(extract('  function renderAll() {','  const TAB_NAMES'),c);
 c.renderAll();assert.deepEqual(calls,['renderProfileHeader','renderHome','attachListHandlers']);
 for(const [tab,needed]of [['calendar','renderCalendar'],['checklist','renderChecklistTab'],['subsidy','renderSubsidyTab']]){calls.length=0;c.currentTab=tab;c.renderAll();assert.ok(calls.includes(needed));}
});
function frames(){let id=0;const pending=new Map(),calls=[];const c={acct:{user:{uid:'one'},approvalEpoch:1,approvalState:'ACTIVE'},hh:{hid:'family'},acctApprovalEnabled:()=>true,usReconcileLocalChildren:()=>calls.push('reconcile'),hhRender:()=>calls.push('household'),usRefreshCalendar:()=>calls.push('refresh'),requestAnimationFrame:fn=>{pending.set(++id,fn);return id},cancelAnimationFrame:id=>pending.delete(id),console};vm.createContext(c);vm.runInContext(extract('  let hhRenderFrame = null;','  function hhStart()'),c);return {c,calls,flush(){for(const fn of pending.values())fn();pending.clear()}};}
test('initial snapshots reconcile immediately and render once per frame',()=>{const e=frames();for(let i=0;i<5;i++)e.c.hhAfterSync();assert.deepEqual(e.calls,Array(5).fill('reconcile'));e.flush();assert.deepEqual(e.calls.slice(5),['household','refresh']);});
test('queued snapshot render is isolated from logout, auth epoch, family switch and revocation',()=>{
 for(const mutate of [c=>c.acct.user=null,c=>c.acct.approvalEpoch++,c=>c.hh.hid='other',c=>c.acct.approvalState='REVOKED']){const e=frames();e.c.hhAfterSync();mutate(e.c);e.flush();assert.deepEqual(e.calls,['reconcile']);}
});
