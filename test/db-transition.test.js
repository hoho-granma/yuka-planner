const test=require('node:test'),assert=require('node:assert/strict'),P=require('../js/db-paths'),H=require('../js/household-sync');
function fixture(){
 const values=new Map(),calls=[],storageData=new Map();let online=true;
 const snapshot=p=>({id:p.split('/').at(-1),exists:values.has(p),data:()=>values.get(p)});
 const ref=p=>({collection:k=>ref(p?p+'/'+k:k),doc:k=>ref(p+'/'+k),get:async()=>p.split('/').length%2===0?snapshot(p):{docs:[...values.keys()].filter(k=>k.startsWith(p+'/')&&k.split('/').length===p.split('/').length+1).map(snapshot)},set:async(d,o)=>{if(!online)throw Object.assign(Error('offline'),{code:'unavailable'});calls.push(p);values.set(p,o&&o.merge?{...values.get(p),...d}:d);},update:async d=>{calls.push(p);values.set(p,{...values.get(p),...d});},delete:async()=>{calls.push(p);values.delete(p);},onSnapshot:(fn)=>{fn(p.split('/').length%2===0?snapshot(p):{docs:[]});return()=>{};}});
 const storage={getItem:k=>storageData.get(k)||null,setItem:(k,v)=>storageData.set(k,v),removeItem:k=>storageData.delete(k)};
 const hs=H.create({features:()=>({household:true}),adapter:H.firestoreAdapter(()=>ref('')),storage,now:()=>1000,rand:()=>0.1});
 return {hs,values,calls,storage,online:v=>online=v};
}
test('v2 create, invite join, local mirror and legacy offline queue keep IDs and use new server paths',async()=>{
 global.DBPaths={map:p=>P.map(p,true)};
 try{
  const f=fixture(),created=await f.hs.createHousehold({firstChild:{familyCode:'ABC123',displayName:'아이'}}),hid=created.householdId;
  assert.ok(f.values.has('families/'+hid));assert.ok(f.values.has('familyInviteCodes/'+created.code));
  assert.ok([...f.values.keys()].some(p=>p.startsWith('families/'+hid+'/childLinks/')));
  assert.equal((await f.hs.joinHousehold(created.code)).ok,true);assert.equal(Object.keys(f.hs.getMirror(hid).children).length,1);
  f.online(false);await f.hs.createTodo(hid,{title:'가방 준비',ownerKey:'FAMILY'});assert.equal(f.hs.getTodos(hid).length,1);
  const queued=JSON.parse(f.storage.getItem('hannun_household_pending:'+hid));assert.ok(queued[0].path.startsWith('households/'));
  f.online(true);const flushed=await f.hs.flush(hid);assert.equal(flushed.remaining,0);assert.ok(f.calls.at(-1).startsWith('families/'+hid+'/todos/'));
  assert.ok(!f.calls.some(p=>p.startsWith('households/')||p.startsWith('householdCodes/')));
 }finally{delete global.DBPaths;}
});
