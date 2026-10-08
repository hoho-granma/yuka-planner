'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const {validate,createMessageParser}=require('../functions/message-input/message-parser');
const candidate=(extra={})=>({kind:'schedule',title:'미술 수업',date:'2026-10-12',startTime:'15:00',endTime:null,ownerName:null,category:null,evidence:'2026년 10월 12일 미술',...extra});
test('원문 근거·실제 날짜·시간을 검증하고 모두 재확인 후보로 반환',()=>{
 assert.equal(validate({candidates:[candidate()]},'2026년 10월 12일 미술')[0].requiresReview,true);
 for(const c of [candidate({evidence:'없는 문장'}),candidate({date:'2026-02-30'}),candidate({date:'2026-99-99'}),candidate({startTime:'25:00'}),candidate({endTime:'14:00'})])assert.throws(()=>validate({candidates:[c]},'2026년 10월 12일 미술'));
});
test('연도 없는 날짜는 null; 상대 날짜만 기준일 해석 후보 유지',()=>{
 assert.equal(validate({candidates:[candidate({evidence:'10월 12일 미술'})]},'10월 12일 미술')[0].date,null);
 assert.equal(validate({candidates:[candidate({evidence:'내일 미술'})]},'내일 미술')[0].date,'2026-10-12');
});
function fixture({family='family',deleted=false,count=0,finish='stop',content,error=false}={}){
 let calls=0,writes=0,request;
 const db={doc:p=>({p,get:async()=>({data:()=>p.startsWith('accounts/')?{householdId:family,memberId:'member'}:{uid:'u',deletedAt:deleted?1:null}})}),runTransaction:async fn=>fn({get:async()=>({data:()=>({day:'2026-10-08',count})}),set:()=>writes++})};
 const parse=createMessageParser({db,key:'test-only',now:()=>Date.parse('2026-10-08T00:00:00Z'),fetchImpl:async(url,opts)=>{calls++;assert.equal(url,'https://openrouter.ai/api/v1/chat/completions');request=JSON.parse(opts.body);return {ok:!error,json:async()=>({choices:[{finish_reason:finish,message:{content:content===undefined?JSON.stringify({candidates:[candidate()]}):content}}]})};}});
 return {parse,stats:()=>({calls,writes,request})};
}
const input={familyId:'family',baseDate:'2026-10-08',text:'2026년 10월 12일 미술'};
test('다른 가족·삭제 구성원은 외부 호출과 사용량 기록 전 거부',async()=>{
 for(const opts of [{family:'other'},{deleted:true}]){const f=fixture(opts);await assert.rejects(f.parse('u',input),e=>e.code==='permission-denied');assert.equal(f.stats().calls,0);assert.equal(f.stats().writes,0);}
});
test('일 20회 한도는 호출 전에 적용',async()=>{const f=fixture({count:20});await assert.rejects(f.parse('u',input),e=>e.code==='resource-exhausted');assert.equal(f.stats().calls,0);});
test('모의 API: 원문은 요청에만 포함하고 결과 저장 없이 후보 반환',async()=>{const f=fixture();const result=await f.parse('u',input);assert.equal(result.ok,true);assert.equal(f.stats().writes,1);assert.equal(f.stats().request.model,'qwen/qwen3.8-flash');assert.equal(f.stats().request.provider.require_parameters,true);assert.equal(f.stats().request.provider.data_collection,'deny');assert.equal(f.stats().request.response_format.json_schema.strict,true);assert.deepEqual(JSON.parse(f.stats().request.messages[1].content),{baseDate:input.baseDate,message:input.text});});
test('클라이언트: 정규화 계정에서 Firebase 토큰 사용, 실패는 입력 보존 결과',async()=>{
 const parser=require('../js/capture/ai-parser');const previousFetch=global.fetch,previousFb=global.firebase;
 try{global.firebase={auth:()=>({currentUser:{uid:'u',getIdToken:async()=> 'test-token'}})};global.fetch=async(url,opts)=>{assert.equal(opts.headers.Authorization,'Bearer test-token');return {ok:true,json:async()=>({result:{ok:true,candidates:[]}})};};assert.equal((await parser.parseWithAI('내용','2026-10-08',{user:{uid:'u'},familyId:'family'})).ok,true);global.fetch=async()=>{throw Error('offline');};assert.equal((await parser.parseWithAI('내용','2026-10-08',{user:{uid:'u'},familyId:'family'})).reason,'offline');}
 finally{global.fetch=previousFetch;global.firebase=previousFb;}
});

test('OpenRouter 잘린 응답·잘못된 JSON·서버 오류는 후보 적용 금지',async()=>{
 for(const opts of [{finish:'length'},{content:'not-json'},{error:true}]){const f=fixture(opts);await assert.rejects(f.parse('u',input));}
});
