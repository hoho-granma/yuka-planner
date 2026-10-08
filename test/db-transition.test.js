const test=require('node:test'),assert=require('node:assert/strict'),H=require('../js/household-sync');
function fixture(){
 const docs=new Map([['families/f1',{v:1}],['families/f1/childLinks/c1',{familyCode:'ABC123'}]]),calls=[],values=new Map(),listeners=[];let online=true;
 const storage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,String(v)),removeItem:k=>values.delete(k)};
 const adapter={get:async p=>{calls.push(['get',p]);return {exists:docs.has(p),data:docs.get(p)};},list:async p=>{calls.push(['list',p]);return [...docs].filter(([k])=>k.startsWith(p+'/')&&k.split('/').length===p.split('/').length+1).map(([k,data])=>({id:k.split('/').at(-1),data}));},set:async(p,d,o)=>{calls.push(['set',p]);if(!online)throw Object.assign(Error('offline'),{code:'unavailable'});docs.set(p,o?.merge?{...docs.get(p),...d}:d);},update:async(p,d)=>{docs.set(p,{...docs.get(p),...d});},listen:(p,fn,err)=>{const l={p,fn,err,off:false};listeners.push(l);return()=>{l.off=true;};}};
 let time=1000;
 const hs=H.create({features:()=>({household:true}),uid:()=> 'u1',access:{status:async()=>({status:'ACTIVE',householdId:'f1'})},adapter,storage,now:()=>++time,rand:()=>0.1});
 return {hs,docs,calls,storage,values,listeners,online:v=>online=v,adapter};
}
test('code alone cannot read a roster or create a client family; approved restore uses canonical paths',async()=>{
 const f=fixture();assert.equal((await f.hs.createHousehold()).reason,'server-family-creation-required');
 assert.equal((await f.hs.peekMembers('ABCD2345')).reason,'approval-required');assert.equal((await f.hs.lookupHousehold('ABCD2345')).reason,'approval-required');
 assert.equal((await f.hs.joinHousehold('ABCD2345')).reason,'approval-required');assert.equal(f.calls.length,0);
 assert.equal((await f.hs.joinHousehold('f1',{metadataOnly:true})).ok,true);
 assert(!f.calls.some(([,p])=>/schedules|todos|households|Codes/.test(p)));
 assert.equal(Object.keys(f.hs.getMirror('f1').children).length,1);
});
test('owned legacy queue replays into current paths while unowned queues are archived',async()=>{
 const f=fixture();f.storage.setItem('hannun_pending_owner:f1','u1');
 f.storage.setItem('hannun_household_pending:f1',JSON.stringify([{op:'set',path:'households/f1/todos/t1',payload:{title:'가방 준비'}}]));
 assert.equal((await f.hs.flush('f1')).sent,1);assert(f.docs.has('families/f1/todos/t1'));assert(!f.docs.has('households/f1/todos/t1'));
 f.storage.setItem('hannun_pending_owner:f1','another');f.storage.setItem('hannun_household_pending:f1',JSON.stringify([{op:'set',path:'households/f1/todos/other',payload:{title:'other'}}]));
 assert.equal((await f.hs.flush('f1')).sent,0);assert(!f.docs.has('families/f1/todos/other'));assert([...f.values.keys()].some(k=>k.startsWith('hannun_private_pending:another:')));
});
test('repeat subscription reuses five listeners; switching family rejects callbacks from the old subscription',()=>{
 const f=fixture();let old=0,next=0;f.hs.startListening('f1',()=>old++);
 assert.equal(f.hs.startListening('f1',()=>next++).reused,true);assert.equal(f.listeners.length,5);
 f.listeners[3].fn([{id:'s1',data:{title:'반복 일정',recurrence:{frequency:'WEEKLY'},deletedAt:1,exceptions:{'2026-10-09':{status:'CANCELLED'}}}}]);
 assert.equal(old,0);assert.equal(next,1);assert.equal(f.hs.getSchedules('f1')[0].deletedAt,1);
 f.hs.startListening('f2',()=>{});assert(f.listeners.slice(0,5).every(l=>l.off));
 f.listeners[3].fn([{id:'stale',data:{title:'stale'}}]);assert(!f.hs.getSchedules('f1').some(s=>s.id==='stale'));
 f.hs.stopListening();assert(f.listeners.every(l=>l.off));
});
test('concurrent flush and new offline edits neither duplicate writes nor discard the appended change',async()=>{
 const f=fixture();f.online(false);await f.hs.createTodo('f1',{title:'first'});f.online(true);
 const original=f.adapter.set;let release,first=true;const gate=new Promise(r=>release=r);
 f.adapter.set=async(...args)=>{if(first){first=false;await gate;}return original(...args);};
 const a=f.hs.flush('f1'),b=f.hs.flush('f1');assert.equal(a,b);
 await f.hs.createTodo('f1',{title:'second'});release();const result=await a;
 assert.equal(result.sent,2);assert.equal(result.remaining,0);assert.equal([...f.docs.keys()].filter(p=>p.startsWith('families/f1/todos/')).length,2);
});
test('pending writes cannot target another family even if stored in the same UID-owned queue',async()=>{
 const f=fixture();f.storage.setItem('hannun_pending_owner:f1','u1');f.storage.setItem('hannun_household_pending:f1',JSON.stringify([{op:'set',path:'households/f2/todos/t1',payload:{title:'wrong'}}]));
 assert.equal((await f.hs.flush('f1')).remaining,1);assert(!f.docs.has('families/f2/todos/t1'));
});
