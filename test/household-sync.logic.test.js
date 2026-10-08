/* Approved family sync regression tests. Real server/rules are covered separately. */
const {test}=require('node:test'),assert=require('node:assert/strict'),HS=require('../js/household-sync');
function setup({enabled=true,uid='u1'}={}){
 const records=new Map([['families/f1',{v:1}],['families/f1/childLinks/c1',{familyCode:'ABC123',displayName:'은찬',order:1}],['families/f1/members/m1',{role:'MOM',label:'엄마',uid:'u1',createdAt:1}]]),calls=[],values=new Map(),listeners=[];let error=null,time=1000;
 const storage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,String(v)),removeItem:k=>values.delete(k)};
 const adapter={get:async p=>{calls.push(['get',p]);return {exists:records.has(p),data:records.get(p)};},list:async p=>{calls.push(['list',p]);return [...records].filter(([k])=>k.startsWith(p+'/')&&k.split('/').length===p.split('/').length+1).map(([k,data])=>({id:k.split('/').at(-1),data}));},set:async(p,d,o)=>{calls.push(['set',p]);if(error)throw Object.assign(Error(error),{code:error});records.set(p,o?.merge?{...records.get(p),...d}:d);},update:async(p,d)=>{calls.push(['update',p]);if(error)throw Object.assign(Error(error),{code:error});records.set(p,{...records.get(p),...d});},listen:(p,fn,err)=>{const l={p,fn,err,off:false};listeners.push(l);return()=>{l.off=true;};}};
 const access={status:async()=>({status:'ACTIVE',householdId:'f1'}),issueInvite:async d=>{calls.push(['invite',d]);return {ok:true,code:'ABCD2345'};},resolveChild:async d=>{calls.push(['resolveChild',d]);return {ok:true,childKey:'c1'};},removeChild:async d=>{calls.push(['removeChild',d]);records.set('families/f1/childLinks/c1',{...records.get('families/f1/childLinks/c1'),removedAt:++time});return {ok:true};},updateMember:async d=>{calls.push(['updateMember',d]);return {ok:true};},removeMember:async d=>{calls.push(['removeMember',d]);return {ok:true};}};
 const hs=HS.create({features:()=>({household:enabled}),uid:()=>uid,storage,adapter,access,now:()=>++time,rand:()=>0.1});
 return {hs,records,calls,values,storage,listeners,setError:e=>error=e,setUid:u=>uid=u};
}
test('feature OFF performs no I/O including local storage and approval API',async()=>{
 const f=setup({enabled:false});
 for(const call of [()=>f.hs.createHousehold(),()=>f.hs.lookupHousehold('code'),()=>f.hs.peekMembers('code'),()=>f.hs.joinHousehold('f1'),()=>f.hs.addChild('f1',{}),()=>f.hs.updateChild('f1','c1',{}),()=>f.hs.removeChild('f1','c1'),()=>f.hs.upsertMember('f1',{}),()=>f.hs.removeMember('f1','m1'),()=>f.hs.createSchedule('f1',{}),()=>f.hs.patchSchedule('f1','s1',{}),()=>f.hs.createTodo('f1',{}),()=>f.hs.patchTodo('f1','t1',{}),()=>f.hs.reissueCode('f1'),()=>f.hs.flush('f1'),()=>f.hs.startListening('f1'),()=>f.hs.leaveLocal('f1')])assert.equal((await call()).reason,'disabled');
 assert.equal(f.calls.length,0);assert.equal(f.values.size,0);
});
test('anonymous writes are rejected before changing the mirror or sending data',async()=>{
 const f=setup({uid:null});await assert.rejects(()=>f.hs.createSchedule('f1',{title:'test'}),e=>e.code==='unauthenticated');assert.equal(f.calls.length,0);assert.equal(f.values.size,0);
});
test('schedule create uses canonical family path and preserves the supplied schema',async()=>{
 const f=setup(),doc={v:1,title:'치과',startDate:'2026-10-09',allDay:false,startTime:'15:00',endTime:'16:00',ownerKeys:['FAMILY']};const r=await f.hs.createSchedule('f1',doc);
 assert.equal(r.pending,false);assert.deepEqual(f.records.get('families/f1/schedules/'+r.scheduleId),doc);assert.equal(f.hs.getSchedules('f1')[0].title,'치과');
});
test('schedule exception patches and field removal stay intact in the local mirror',async()=>{
 const f=setup(),r=await f.hs.createSchedule('f1',{title:'반복',memo:'old',exceptions:{'2026-10-09':{status:'CANCELLED'}}});
 await f.hs.patchSchedule('f1',r.scheduleId,{'exceptions.2026-10-16':{status:'DONE'},memo:null});
 const s=f.hs.getSchedules('f1')[0];assert.equal(s.exceptions['2026-10-09'].status,'CANCELLED');assert.equal(s.exceptions['2026-10-16'].status,'DONE');assert.equal(s.memo,undefined);
 await f.hs.patchSchedule('f1',r.scheduleId,{'exceptions.2026-10-09':null,'exceptions.2026-10-16':null});assert.equal(f.hs.getSchedules('f1')[0].exceptions,undefined);
});
test('offline schedule operations remain ordered and replay once online',async()=>{
 const f=setup();f.setError('unavailable');const r=await f.hs.createSchedule('f1',{title:'first'});await f.hs.patchSchedule('f1',r.scheduleId,{title:'latest'});
 assert.equal(f.hs.getStatus('f1').pending,2);assert.equal(f.hs.getSchedules('f1')[0].title,'latest');f.setError(null);
 assert.deepEqual(await f.hs.flush('f1'),{ok:true,sent:2,remaining:0});assert.equal(f.records.get('families/f1/schedules/'+r.scheduleId).title,'latest');
});
test('permission denial preserves queued data and retry resets the denied status',async()=>{
 const f=setup();f.setError('permission-denied');await f.hs.createTodo('f1',{title:'준비'});assert.equal(f.hs.getStatus('f1').permissionDenied,true);
 assert.equal((await f.hs.flush('f1')).remaining,1);f.setError(null);assert.equal((await f.hs.flush('f1')).remaining,0);assert.equal(f.hs.getStatus('f1').permissionDenied,false);
});
test('incoming snapshots retain locally edited schedules and new pending entries',async()=>{
 const f=setup();f.setError('unavailable');const r=await f.hs.createSchedule('f1',{title:'local'});f.hs.startListening('f1');
 f.listeners.find(l=>l.p.endsWith('/schedules')).fn([{id:r.scheduleId,data:{title:'server'}}]);assert.equal(f.hs.getSchedules('f1')[0].title,'local');
 f.listeners.find(l=>l.p.endsWith('/schedules')).fn([]);assert.equal(f.hs.getSchedules('f1')[0].title,'local');
});
test('todo soft deletion remains in sync so other devices can remove it',async()=>{
 const f=setup(),r=await f.hs.createTodo('f1',{title:'가방',ownerKey:'FAMILY'});await f.hs.patchTodo('f1',r.todoId,{deletedAt:123});assert.equal(f.hs.getTodos('f1')[0].deletedAt,123);assert.equal(f.records.get('families/f1/todos/'+r.todoId).deletedAt,123);
});
test('child links are resolved through the server and removal never deletes the child profile',async()=>{
 const f=setup();await f.hs.joinHousehold('f1',{metadataOnly:true});assert.equal((await f.hs.addChild('f1',{familyCode:'ABC123'})).childKey,'c1');
 await f.hs.hardDelete('f1','families/f1/childLinks/c1');assert(f.records.get('families/f1/childLinks/c1').removedAt);assert(f.calls.some(([kind])=>kind==='removeChild'));assert(!f.calls.some(([kind])=>kind==='delete'));
});
test('linked member edits and removal use the approval service without client UID grants',async()=>{
 const f=setup();await f.hs.joinHousehold('f1',{metadataOnly:true});await f.hs.upsertMember('f1',{memberId:'m1',role:'MOM',label:'은찬 엄마',uid:'u1'});await f.hs.removeMember('f1','m1');assert(f.calls.some(([kind])=>kind==='updateMember'));assert(f.calls.some(([kind])=>kind==='removeMember'));assert(!f.calls.some(([kind])=>kind==='set'));
});
test('new display-only members receive stable non-conflicting colors',async()=>{
 const f=setup();await f.hs.joinHousehold('f1',{metadataOnly:true});const r=await f.hs.upsertMember('f1',{role:'OTHER',label:'보호자'});const m=f.hs.getMirror('f1').members[r.memberId];assert(m.colorKey);assert.notEqual(m.colorKey,'p6');assert.equal(m.uid,undefined);
 await f.hs.upsertMember('f1',{memberId:r.memberId,role:'OTHER',label:'새 이름'});assert.equal(f.hs.getMirror('f1').members[r.memberId].colorKey,m.colorKey);
});
test('reissue does not replace the saved stable family ID with an invitation code',async()=>{
 const f=setup();await f.hs.joinHousehold('f1',{metadataOnly:true});const r=await f.hs.reissueCode('f1');assert.equal(r.code,'ABCD2345');assert.equal(f.hs.getSavedCode(),'f1');assert(!f.calls.some(([,p])=>typeof p==='string'&&/Codes/.test(p)));
});
test('leaving locally removes listeners and local mirror only',async()=>{
 const f=setup();await f.hs.joinHousehold('f1',{metadataOnly:true});f.setError('unavailable');await f.hs.createTodo('f1',{title:'pending'});f.hs.startListening('f1');const before=f.calls.length,r=f.hs.leaveLocal('f1');assert.equal(r.discarded,1);assert.equal(f.calls.length,before);assert(f.listeners.every(l=>l.off));assert.equal(f.hs.getSavedCode(),null);assert(f.records.has('families/f1'));
});
