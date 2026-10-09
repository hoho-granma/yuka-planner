const {test}=require('node:test'),assert=require('node:assert/strict');
const Access=require('../js/app-access');
function fixture(){
  let uid='u1',time=1000,exists=true,fail=false,wait=null;
  const writes=[];
  const db=()=>({collection:name=>{assert.equal(name,'accounts');return {doc:owner=>({
    get:async()=>{if(wait)await wait;return {exists};},
    collection:kind=>{assert.equal(kind,'appAccess');return {doc:()=>({set:async data=>{if(fail)throw Error('permission-denied');writes.push({owner,data});}})};}
  })};}});
  const tracker=Access.create({db,getUid:()=>uid,getVersion:()=> '2.0.26',now:()=>time,timestamp:()=> 'server-time'});
  return {tracker,writes,setUid:x=>uid=x,setTime:x=>time=x,setExists:x=>exists=x,setFail:x=>fail=x,setWait:x=>wait=x};
}
test('app open uses authenticated account, server time and minimal versioned fields',async()=>{
 const f=fixture();assert.equal((await f.tracker.record()).status,'recorded');
 assert.deepEqual(f.writes,[{owner:'u1',data:{schemaVersion:1,accessedAt:'server-time',appVersion:'2.0.26',reason:'app_open'}}]);
});
test('short resumes and duplicate authentication do not write; long resume does',async()=>{
 const f=fixture();await f.tracker.record();assert.equal((await f.tracker.record()).status,'throttled');
 f.setTime(1000+Access.INTERVAL-1);await f.tracker.record('resume');assert.equal(f.writes.length,1);
 f.setTime(1000+Access.INTERVAL);await f.tracker.record('resume');assert.equal(f.writes.length,2);assert.equal(f.writes[1].data.reason,'resume');
});
test('accounts are isolated and absent accounts or signed-out visits are skipped',async()=>{
 const f=fixture();f.setUid(null);await f.tracker.record();f.setUid('u1');f.setExists(false);await f.tracker.record();assert.equal(f.writes.length,0);
 f.setExists(true);await f.tracker.record();f.setUid('u2');await f.tracker.record();assert.deepEqual(f.writes.map(w=>w.owner),['u1','u2']);
});
test('failure stays non-blocking and next eligible resume retries',async()=>{
 const f=fixture();f.setFail(true);assert.equal((await f.tracker.record()).status,'failed');f.setFail(false);
 assert.equal((await f.tracker.record()).status,'retry_later');f.setTime(61000);assert.equal((await f.tracker.record('resume')).status,'recorded');
});
test('concurrent events share a write and account changes during read cancel it',async()=>{
 const f=fixture();let release;f.setWait(new Promise(r=>release=r));const a=f.tracker.record(),b=f.tracker.record('resume');assert.equal(a,b);
 f.setUid('u2');release();assert.equal((await a).status,'skipped');assert.equal(f.writes.length,0);
});
