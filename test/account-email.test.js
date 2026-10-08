const {test}=require('node:test'),assert=require('node:assert/strict'),A=require('../js/account-sync.js');
test('로그인 이메일을 기존 accounts에만 동기화하고 다른 필드는 보존',async()=>{
 const doc={v:1,displayName:'엄마',role:'MOM',createdAt:1,updatedAt:1};let writes=0;
 const adapter={get:async()=>({exists:true,data:{...doc}}),set:async(path,fields,opts)=>{assert.equal(path,'accounts/u1');assert.deepEqual(opts,{merge:true});Object.assign(doc,fields);writes++;}};
 const a=A.create({adapter,household:{},now:()=>2});
 const r=await a.restore('u1','parent@example.com');assert.equal(r.account.email,'parent@example.com');assert.equal(doc.displayName,'엄마');assert.equal(writes,1);
 await a.restore('u1','parent@example.com');assert.equal(writes,1);
});
test('문서가 없는 계정에 이메일만 있는 불완전 문서를 생성하지 않음',async()=>{let writes=0;const a=A.create({adapter:{get:async()=>({exists:false}),set:async()=>writes++},household:{}});const r=await a.restore('u1','a@example.com');assert.equal(r.account,null);assert.equal(writes,0);});
