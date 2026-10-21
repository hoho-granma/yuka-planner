'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../js/app.js'),'utf8');
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject};}
function fixture(){
 const reads=[],pending={},applied=[],busy=[],classes={add(){},remove(){}};
 const c={familyCode:'old',profile:{name:'old'},completed:{},acct:{user:{uid:'u'}},hh:{hid:'f'},document:{querySelectorAll:()=>[{dataset:{homeChild:'baby'},setAttribute:(k,v)=>busy.push(v)}]},el:()=>({classList:classes}),FamilySync:{fetchFamily:(code,options)=>{reads.push([code,options]);return (pending[code]??=deferred()).promise},saveCode(){}},profileFromPlain:p=>p,saveProfile(){},saveCompleted(){},startListeningFamily(){},populateDistricts(){},syncOrderChips(){},renderProvinceChips(){},renderDistrictChips(){},setBirthDatePicker(){},closeDetail(){},buildAndRender:async valid=>{if(valid())applied.push(c.familyCode)},unsubscribeFamily:null,console:{error(){}}};
 vm.createContext(c);const a=source.indexOf('  let childSwitchEpoch=');vm.runInContext(source.slice(a,source.indexOf('\n  // ── 가족 캘린더',a)),c);
 return {c,reads,pending,applied,busy};
}
test('duplicate clicks share one read and show immediate pending feedback',async()=>{const f=fixture(),p=f.c.switchToChild('baby'),q=f.c.switchToChild('baby');assert.equal(p,q);assert.equal(f.reads.length,1);assert.equal(f.reads[0][1].preferCache,true);assert.equal(f.busy[0],'true');f.pending.baby.resolve({profile:{name:'baby'}});await p;assert.deepEqual(f.applied,['baby']);assert.equal(f.busy.at(-1),'false');});
test('late response cannot replace the last selected child',async()=>{const f=fixture(),a=f.c.switchToChild('baby'),b=f.c.switchToChild('older');f.pending.older.resolve({profile:{name:'older'}});await b;f.pending.baby.resolve({profile:{name:'baby'}});await a;assert.equal(f.c.familyCode,'older');assert.deepEqual(f.applied,['older']);});
test('account changes while loading discard the response',async()=>{const f=fixture(),a=f.c.switchToChild('baby');f.c.acct.user={uid:'different'};f.pending.baby.resolve({profile:{name:'baby'}});await a;assert.equal(f.c.familyCode,'old');assert.deepEqual(f.applied,[]);});
test('cache-first reads avoid network on a hit and fall back on a miss',async()=>{
 const sync=fs.readFileSync(require.resolve('../js/sync.js'),'utf8'),a=sync.indexOf('  async function fetchFamily('),b=sync.indexOf('\n  async function updateProfile',a),calls=[];
 let hit=true;
 const get=async options=>{
   calls.push(options?.source||'server');
   if(options?.source==='cache'&&!hit)throw Error('cache miss');
   return {exists:true,data:()=>({profile:{name:hit?'cached':'fresh'}})};
 };
 const c={db:{collection:()=>({doc:()=>({get})})}};
 vm.createContext(c);vm.runInContext(sync.slice(a,b),c);
 await c.fetchFamily('baby',{preferCache:true});assert.deepEqual(calls,['cache']);
 hit=false;await c.fetchFamily('new',{preferCache:true});assert.deepEqual(calls,['cache','cache','server']);
});
