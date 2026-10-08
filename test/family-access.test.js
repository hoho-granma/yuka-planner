'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createService,hash}=require('../functions/family-access');
// Transaction fake enforces Firestore read-before-write and commits atomically.
function memoryDb() {
  const store=new Map();
  const clone=v=>v===undefined?undefined:structuredClone(v);
  const doc=p=>({path:p,id:p.split('/').at(-1),get:async()=>({data:()=>clone(store.get(p))})});
  const collection=p=>({path:p,where:(field,op,value)=>({path:p,filter:d=>d[field]===value})});
  return {store,doc,collection,async runTransaction(fn){
    const writes=[];let writing=false;
    const tx={async get(r){assert.equal(writing,false,'transaction read after write');
      if(r.id)return {data:()=>clone(store.get(r.path))};
      return {docs:[...store].filter(([p,d])=>p.startsWith(r.path+'/')&&p.split('/').length===r.path.split('/').length+1&&(!r.filter||r.filter(d))).map(([p,d])=>({id:p.split('/').at(-1),data:()=>clone(d)}))};
    },set(r,d,opts){writing=true;writes.push(()=>store.set(r.path,opts?.merge?{...store.get(r.path),...clone(d)}:clone(d)));},update(r,d){writing=true;assert(store.has(r.path));writes.push(()=>store.set(r.path,{...store.get(r.path),...clone(d)}));}};
    const value=await fn(tx);writes.forEach(f=>f());return value;
  }};
}
async function setup(){const db=memoryDb();let time=1000,n=0;const s=createService(db,{now:()=>time,codeGenerator:()=>['ABCD2345','BCDE2345','CDEF2345','DEFG2345'][n++]});const family=await s.createFamily('mom',{displayName:'엄마',role:'MOM'});return {db,s,hid:family.householdId,setTime:t=>time=t};}
const denies=(fn,code)=>assert.rejects(fn,e=>e.code===code);
test('unapproved code holder cannot create membership; approval uses original UID and relation',async()=>{
 const {db,s,hid}=await setup();const inv=await s.issueInvite('mom',{householdId:hid,role:'DAD'});
 const result=await s.requestJoin('dad',{code:inv.code,displayName:'아빠',role:'MOM'},'ip');
 assert.deepEqual(result,{ok:true,status:'PENDING'});assert(!db.store.has(`familyAccess/${hid}/members/dad`));
 assert.deepEqual(await s.status('dad'),{ok:true,status:'PENDING'});
 await denies(()=>s.decideJoin('dad',{householdId:hid,targetUid:'dad',approve:true}),'permission-denied');
 await s.decideJoin('mom',{householdId:hid,targetUid:'dad',approve:true});
 assert.equal(db.store.get(`familyAccess/${hid}/members/dad`).permission,'MEMBER');assert.equal(db.store.get(`familyAccess/${hid}/members/dad`).role,'DAD');
 assert.equal((await s.status('dad')).status,'ACTIVE');
 await denies(()=>s.issueInvite('dad',{householdId:hid}),'permission-denied');
 await denies(()=>s.requestJoin('outsider',{code:inv.code,displayName:'외부인'},'ip'),'not-found');
});
test('expired/reissued/revoked invitations cannot be approved or reused',async()=>{
 const {s,hid,setTime}=await setup();const first=await s.issueInvite('mom',{householdId:hid});await s.requestJoin('dad',{code:first.code,displayName:'아빠'},'ip');
 await s.issueInvite('mom',{householdId:hid});await denies(()=>s.decideJoin('mom',{householdId:hid,targetUid:'dad',approve:true}),'failed-precondition');
 assert.equal((await s.status('dad')).status,'EXPIRED');await s.cancelJoin('dad');
 const inv=await s.issueInvite('mom',{householdId:hid});setTime(inv.expiresAt);
 await denies(()=>s.requestJoin('dad',{code:inv.code,displayName:'아빠'},'ip'),'not-found');
 await s.revokeInvite('mom',{householdId:hid});
});
test('failed guesses consume quota; no family mapping leaks',async()=>{
 const {s}=await setup();for(let i=0;i<10;i++)await denies(()=>s.requestJoin('guesser',{code:'ZZZZZZZZ',displayName:'x'},'ip'),'not-found');
 await denies(()=>s.requestJoin('guesser',{code:'ZZZZZZZZ',displayName:'x'},'ip'),'resource-exhausted');
});
test('cross-family decisions and self-promotion denied; last admin preserved; removal revokes status',async()=>{
 const {s,hid,db}=await setup();const other=await s.createFamily('other',{displayName:'other',role:'MOM'});
 const inv=await s.issueInvite('mom',{householdId:hid,role:'DAD'});await s.requestJoin('dad',{code:inv.code,displayName:'dad'},'ip');
 await denies(()=>s.decideJoin('other',{householdId:other.householdId,targetUid:'dad',approve:true}),'failed-precondition');
 await s.decideJoin('mom',{householdId:hid,targetUid:'dad',approve:true});
 await denies(()=>s.removeMember('mom',{householdId:hid,targetUid:'mom'}),'failed-precondition');
 await s.transferAdmin('mom',{householdId:hid,targetUid:'dad'});
 await denies(()=>s.removeMember('mom',{householdId:hid,targetUid:'dad'}),'permission-denied');
 await s.removeMember('dad',{householdId:hid,targetUid:'mom'});assert.equal((await s.status('mom')).status,'REVOKED');
 assert.equal(db.store.get(`families/${hid}/members/mom`).deletedAt,1000);
});
test('request cancellation/rejection never creates access; account family cannot switch via code',async()=>{
 const {s,hid,db}=await setup();const inv=await s.issueInvite('mom',{householdId:hid});await s.requestJoin('dad',{code:inv.code,displayName:'dad'},'ip');await s.cancelJoin('dad');
 await denies(()=>s.decideJoin('mom',{householdId:hid,targetUid:'dad',approve:true}),'failed-precondition');
 await s.requestJoin('dad',{code:inv.code,displayName:'dad'},'ip');await s.decideJoin('mom',{householdId:hid,targetUid:'dad',approve:false});assert(!db.store.has(`familyAccess/${hid}/members/dad`));
 await denies(()=>s.requestJoin('mom',{code:inv.code,displayName:'mom'},'ip'),'failed-precondition');
});
test('child identity must be bound to a live child by manager; cannot be admin',async()=>{
 const {s,hid,db}=await setup();const child=await s.createChild('mom',{householdId:hid,profile:{name:'은찬'}});const inv=await s.issueInvite('mom',{householdId:hid,role:'CHILD'});await s.requestJoin('kid',{code:inv.code,displayName:'은찬'},'ip');
 await denies(()=>s.decideJoin('mom',{householdId:hid,targetUid:'kid',approve:true,childKey:'wrong'}),'failed-precondition');
 await s.decideJoin('mom',{householdId:hid,targetUid:'kid',approve:true,childKey:child.code});
 assert.equal(db.store.get(`familyAccess/${hid}/members/kid`).childKey,child.code);
 await denies(()=>s.transferAdmin('mom',{householdId:hid,targetUid:'kid'}),'failed-precondition');
 await denies(()=>s.createChild('kid',{householdId:hid,profile:{name:'x'}}),'permission-denied');
 await s.removeChild('mom',{householdId:hid,code:child.code});
 assert(db.store.get(`families/${hid}/childLinks/${child.code}`).removedAt);
});
test('client adapter never falls back to legacy writes',async()=>{
 const calls=[];const api=require('../js/family-access').create({invoke:async data=>{calls.push(data);return {ok:true,status:'PENDING'};}});
 await api.requestJoin({code:'ABCD2345',displayName:'dad'});assert.deepEqual(calls,[{action:'requestJoin',code:'ABCD2345',displayName:'dad'}]);
});
test('approval UI escapes labels and keeps pending view free of family data',()=>{
 const view=require('../js/family-access-view');const html=view.management({requests:[{uid:'x',label:'<img onerror=alert(1)>',role:'DAD'}]});
 assert(!html.includes('<img'));assert(html.includes('&lt;img'));assert(view.pending('PENDING').includes('참여 승인을 요청'));assert(!view.pending('PENDING').includes('data-fa-uid'));
});
test('revoked user can request reapproval, but no code confers access while pending',async()=>{
 const {s,hid,db}=await setup();let inv=await s.issueInvite('mom',{householdId:hid,role:'DAD'});await s.requestJoin('dad',{code:inv.code,displayName:'dad'},'ip');await s.decideJoin('mom',{householdId:hid,targetUid:'dad',approve:true});await s.removeMember('mom',{householdId:hid,targetUid:'dad'});
 inv=await s.issueInvite('mom',{householdId:hid,role:'DAD'});await s.requestJoin('dad',{code:inv.code,displayName:'dad'},'ip');assert.equal((await s.status('dad')).status,'PENDING');assert.equal(db.store.get(`familyAccess/${hid}/members/dad`).status,'REVOKED');
 await s.decideJoin('mom',{householdId:hid,targetUid:'dad',approve:true});assert.equal((await s.status('dad')).status,'ACTIVE');
});
test('approval preserves an explicitly invited display slot and its schedule identity',async()=>{
 const {s,hid,db}=await setup();db.store.set(`families/${hid}/members/old-dad`,{v:1,role:'DAD',label:'아빠',order:2,colorKey:'p9',createdAt:5,updatedAt:5});
 const inv=await s.issueInvite('mom',{householdId:hid,role:'DAD',slotMemberId:'old-dad'});await s.requestJoin('dad',{code:inv.code,displayName:'dad'},'ip');await s.decideJoin('mom',{householdId:hid,targetUid:'dad',approve:true});
 assert.equal(db.store.get('accounts/dad').memberId,'old-dad');assert.equal(db.store.get(`families/${hid}/members/old-dad`).colorKey,'p9');assert.equal(db.store.get(`families/${hid}/members/old-dad`).createdAt,5);
});
test('same-family child resolution cannot steal a code from another family',async()=>{
 const {s,hid}=await setup();const kid=await s.createChild('mom',{householdId:hid,profile:{name:'은찬'}});assert.equal((await s.resolveChild('mom',{householdId:hid,code:kid.code})).childKey,kid.code);
 const other=await s.createFamily('other',{displayName:'보호자',role:'DAD'});await denies(()=>s.resolveChild('other',{householdId:other.householdId,code:kid.code}),'permission-denied');
});
test('account signup with approval never reads public code maps or writes its own membership',async()=>{
 const sync=require('../js/account-sync').create({adapter:{get(){throw new Error('legacy read');},set(){throw new Error('legacy write');}},household:{},access:{requestJoin:async()=>({ok:true,status:'PENDING'})}});
 const result=await sync.completeSignup({user:{uid:'dad'},intent:{joiningCode:'ABCD2345',displayName:'은찬'}});assert.equal(result.pending,true);assert.equal(result.householdId,undefined);
});
test('approval household restore uses stable family ID; preapproval roster reads are refused',async()=>{
 const calls=[];const db={get:async p=>{calls.push(p);return {exists:true,data:{v:1}};},list:async p=>{calls.push(p);return [];}};
 const hs=require('../js/household-sync').create({approval:()=>true,access:{status:async()=>({status:'ACTIVE',householdId:'f1'})},adapter:db,features:()=>({household:true})});
 assert.equal((await hs.peekMembers('ABCD2345')).reason,'approval-required');assert.equal((await hs.lookupHousehold('ABCD2345')).reason,'approval-required');assert.equal(calls.length,0);
 assert.equal((await hs.joinHousehold('ABCD2345')).reason,'approval-required');assert.equal(calls.length,0);
 assert.equal((await hs.joinHousehold('f1')).ok,true);assert(!calls.some(p=>p.includes('Codes')));
});
test('offline queues belong to a UID and never replay legacy/other-account edits',async()=>{
 const storageMap=new Map([['hannun_household_pending:f1',JSON.stringify([{op:'set',path:'households/f1/schedules/legacy',payload:{title:'old'}}])]]);
 const storage={getItem:k=>storageMap.get(k)||null,setItem:(k,v)=>storageMap.set(k,String(v)),removeItem:k=>storageMap.delete(k)};const writes=[];
 const hs=require('../js/household-sync').create({approval:()=>true,uid:()=> 'new-account',storage,features:()=>({household:true}),adapter:{set:async p=>writes.push(p)}});
 await hs.flush('f1');assert.equal(writes.length,0);assert([...storageMap.keys()].some(k=>k.startsWith('hannun_private_pending:legacy:f1:')));assert.equal(storageMap.get('hannun_pending_owner:f1'),'new-account');
});

test('development callable works without App Check SDK or site key',async()=>{
 const API=require('../js/family-access');let payload;
 const fb={auth:()=>({currentUser:{uid:'test'}}),functions:()=>{},app:()=>({functions:region=>{assert.equal(region,'asia-northeast3');return {httpsCallable:name=>{assert.equal(name,'familyAccess');return async data=>{payload=data;return {data:{status:'PENDING'}};};}};}})};
 assert.equal((await API.create({firebase:fb}).status()).status,'PENDING');assert.deepEqual(payload,{action:'status'});
});

test('TTL cleanup preserves pending decisions for thirty days after invitation expiry',async()=>{
 const {s,hid,db}=await setup(),inv=await s.issueInvite('mom',{householdId:hid});
 const record=db.store.get('privateFamilyInvites/'+hash(inv.code));assert(record.purgeAt instanceof Date);assert.equal(+record.purgeAt,inv.expiresAt+30*86400000);
 await s.requestJoin('dad',{code:inv.code,displayName:'아빠'},'ip');assert.equal(+db.store.get('familyJoinRequests/dad').purgeAt,+record.purgeAt);
 await s.decideJoin('mom',{householdId:hid,targetUid:'dad',approve:false});assert.equal(+db.store.get('familyJoinRequests/dad').purgeAt,1000+30*86400000);
});
test('removed TTL invitation does not prevent reissue or revocation and an active account survives request cleanup',async()=>{
 const {s,hid,db}=await setup();let inv=await s.issueInvite('mom',{householdId:hid});
 db.store.delete('privateFamilyInvites/'+hash(inv.code));await s.revokeInvite('mom',{householdId:hid});
 inv=await s.issueInvite('mom',{householdId:hid});await s.requestJoin('dad',{code:inv.code,displayName:'아빠'},'ip');await s.decideJoin('mom',{householdId:hid,targetUid:'dad',approve:true});
 db.store.delete('familyJoinRequests/dad');assert.equal((await s.status('dad')).status,'ACTIVE');
});

test('signup without approval service fails closed instead of granting its own family membership',async()=>{
 const calls=[];const sync=require('../js/account-sync').create({adapter:{get:async()=>{calls.push('get');},set:async()=>{calls.push('set');}},household:{createHousehold:async()=>calls.push('create')}});
 assert.equal((await sync.completeSignup({user:{uid:'mom'},intent:{displayName:'엄마',role:'MOM'}})).reason,'approval-service-required');assert.equal(calls.length,0);
});
test('new family signup fetches metadata without reading schedules before subscription',async()=>{
 const calls=[];const sync=require('../js/account-sync').create({adapter:{},household:{joinHousehold:async(...args)=>{calls.push(args);return {ok:true};}},access:{createFamily:async()=>({ok:true,householdId:'f1',created:true})}});
 const result=await sync.completeSignup({user:{uid:'mom'},intent:{displayName:'엄마',role:'MOM'}});assert.equal(result.householdCode,'f1');assert.deepEqual(calls,[['f1',{metadataOnly:true}]]);
});
