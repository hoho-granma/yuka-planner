const test=require('node:test'),assert=require('node:assert/strict'),P=require('../js/db-paths');
test('production uses v2; legacy fallback preserves IDs and all nested segments',()=>{
 for(const [old,next] of [['families/ABC123','children/ABC123'],['households/h1/children/c1','families/h1/childLinks/c1'],['households/h1/schedules/s1','families/h1/schedules/s1'],['householdCodes/CODE','familyInviteCodes/CODE'],['placeStats/p1','placeUsageStats/p1']]){assert.equal(P.map(old,false),old);assert.equal(P.map(old),next);assert.equal(P.map(old,true),next);}
 assert.equal(P.map('accounts/u1',true),'accounts/u1');assert.equal(P.deployment.growthServer,false);
});
test('Firestore adapter maps legacy queued paths while payload and local IDs stay untouched',async()=>{
 global.DBPaths={map:p=>P.map(p,true)};
 const seen=[],fake={collection(name){seen.push(name);return this;},doc(name){seen.push(name);return this;},set:async()=>{}};
 const {firestoreAdapter}=require('../js/household-sync');
 try{await firestoreAdapter(()=>fake).set('households/h1/children/c1',{familyCode:'ABC123'},{});assert.deepEqual(seen,['families','h1','childLinks','c1']);}finally{delete global.DBPaths;}
});
