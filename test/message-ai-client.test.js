'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const parser=require('../js/capture/ai-parser');
test('비로그인 요청은 외부 호출하지 않는다',async()=>{const r=await parser.parseWithAI('메시지','2026-10-08',{});assert.equal(r.reason,'unauthenticated');});
test('서버 후보는 인증된 호출로만 받고 원문을 저장하지 않는다',async()=>{
 const saved=global.fetch;
 try{global.fetch=async(url,opts)=>{assert.equal(opts.headers.Authorization,'Bearer test-token');assert.equal(JSON.parse(opts.body).data.text,'원문');return {ok:true,json:async()=>({result:{ok:true,candidates:[{title:'후보'}]}})};};const r=await parser.parseWithAI('원문','2026-10-08',{user:{uid:'u',getIdToken:async()=> 'test-token'},familyId:'family'});assert.equal(r.candidates[0].title,'후보');}
 finally{global.fetch=saved;}
});
test('네트워크 실패는 폼을 변경하지 않고 실패 결과로 반환',async()=>{
 const saved=global.fetch;try{global.fetch=async()=>{throw Error('offline');};assert.equal((await parser.parseWithAI('원문','2026-10-08',{user:{uid:'u',getIdToken:async()=> 'test-token'}})).reason,'offline');}finally{global.fetch=saved;}
});
