const test=require('node:test'),assert=require('node:assert/strict'),P=require('../js/db-paths');
test('owned offline paths migrate to current collections without changing document identity',()=>{
 assert.equal(P.queuedPath('households/f1/schedules/s1'),'families/f1/schedules/s1');
 assert.equal(P.queuedPath('households/f1/children/c1'),'families/f1/childLinks/c1');
 assert.equal(P.queuedPath('families/f1/todos/t1'),'families/f1/todos/t1');
 for(const path of ['householdCodes/CODE','familyInviteCodes/CODE','accounts/u1','families/ABC123','families/f1/schedules','families/f1/schedules/../s1'])assert.throws(()=>P.queuedPath(path));
 assert.equal(P.map,undefined);assert.equal(P.deployment.familyApproval,true);assert.equal(P.deployment.appCheckEnabled,false);
});
test('Firestore adapter uses canonical paths and never silently remaps an ambiguous families path',async()=>{
 const seen=[],fake={collection(name){seen.push(name);return this;},doc(name){seen.push(name);return this;},set:async()=>{}};
 await require('../js/household-sync').firestoreAdapter(()=>fake).set('families/f1/childLinks/c1',{familyCode:'ABC123'},{});
 assert.deepEqual(seen,['families','f1','childLinks','c1']);
});
