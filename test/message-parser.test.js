'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const {validate,createMessageParser}=require('../functions/message-parser');
const candidate=(extra={})=>({kind:'schedule',title:'미술 수업',date:'2026-10-12',startTime:'15:00',endTime:null,ownerName:null,category:null,evidence:'2026년 10월 12일 미술',...extra});
test('원문 근거·실제 날짜·시간을 검증하고 모두 재확인 후보로 반환',()=>{
 assert.equal(validate({candidates:[candidate()]},'2026년 10월 12일 미술')[0].requiresReview,true);
 for(const c of [candidate({evidence:'없는 문장'}),candidate({date:'2026-02-30'}),candidate({date:'2026-99-99'}),candidate({startTime:'25:00'}),candidate({endTime:'14:00'})])assert.throws(()=>validate({candidates:[c]},'2026년 10월 12일 미술'));
});
test('연도 없는 날짜는 기준일의 올해로, 상대 날짜와 명시된 연도는 유지',()=>{
 assert.equal(validate({candidates:[candidate({date:'2025-10-12',evidence:'10월 12일 미술'})]},'10월 12일 미술',false,'2026-10-11')[0].date,'2026-10-12');
 assert.equal(validate({candidates:[candidate({evidence:'내일 미술'})]},'내일 미술')[0].date,'2026-10-12');
});
function fixture({family='family',deleted=false,accessStatus='ACTIVE',permission='MEMBER',count=0,finish='stop',content,error=false,status=503}={}){
 let calls=0,writes=0,request;
 const db={doc:p=>({p,get:async()=>({data:()=>p.startsWith('familyAccess/')?{status:accessStatus,permission,memberId:'member',role:'MOM'}:p.startsWith('accounts/')?{householdId:family,memberId:'member'}:{uid:'u',deletedAt:deleted?1:null}})}),runTransaction:async fn=>fn({get:async()=>({data:()=>({day:'2026-10-08',count})}),set:()=>writes++})};
 const parse=createMessageParser({db,key:'sk-or-v1-test-only',now:()=>Date.parse('2026-10-08T00:00:00Z'),fetchImpl:async(url,opts)=>{calls++;assert.equal(url,'https://openrouter.ai/api/v1/chat/completions');request=JSON.parse(opts.body);return {ok:!error,status,json:async()=>({choices:[{finish_reason:finish,message:{content:content===undefined?JSON.stringify({candidates:[candidate()]}):content}}]})};}});
 return {parse,stats:()=>({calls,writes,request})};
}
const input={familyId:'family',baseDate:'2026-10-08',text:'2026년 10월 12일 미술'};
test('다른 가족·삭제 구성원은 외부 호출과 사용량 기록 전 거부',async()=>{
 for(const opts of [{family:'other'},{deleted:true},{accessStatus:'PENDING'},{accessStatus:'REVOKED'},{permission:'VIEWER'}]){const f=fixture(opts);await assert.rejects(f.parse('u',input),e=>e.code==='permission-denied');assert.equal(f.stats().calls,0);assert.equal(f.stats().writes,0);}
});
test('일 20회 한도는 호출 전에 적용',async()=>{const f=fixture({count:20});await assert.rejects(f.parse('u',input),e=>e.code==='resource-exhausted');assert.equal(f.stats().calls,0);});
test('모의 API: 원문은 요청에만 포함하고 결과 저장 없이 후보 반환',async()=>{const f=fixture();const result=await f.parse('u',input);assert.equal(result.ok,true);assert.equal(f.stats().writes,1);assert.equal(f.stats().request.model,'openai/gpt-6-luna');assert.equal(f.stats().request.provider.require_parameters,true);assert.equal(f.stats().request.provider.data_collection,'deny');assert.equal(f.stats().request.response_format.json_schema.strict,true);assert.deepEqual(JSON.parse(f.stats().request.messages[1].content),{baseDate:input.baseDate,message:input.text});});
test('클라이언트: 정규화 계정에서 Firebase 토큰 사용, 실패는 입력 보존 결과',async()=>{
 const parser=require('../js/capture/ai-parser');const previousFetch=global.fetch,previousFb=global.firebase;
 try{global.firebase={auth:()=>({currentUser:{uid:'u',getIdToken:async()=> 'test-token'}})};global.fetch=async(url,opts)=>{assert.equal(opts.headers.Authorization,'Bearer test-token');return {ok:true,json:async()=>({result:{ok:true,candidates:[]}})};};assert.equal((await parser.parseWithAI('내용','2026-10-08',{user:{uid:'u'},familyId:'family'})).ok,true);global.fetch=async()=>{throw Error('offline');};assert.equal((await parser.parseWithAI('내용','2026-10-08',{user:{uid:'u'},familyId:'family'})).reason,'offline');}
 finally{global.fetch=previousFetch;global.firebase=previousFb;}
});

test('OpenRouter 잘린 응답·잘못된 JSON·서버 오류는 후보 적용 금지',async()=>{
 for(const opts of [{finish:'length'},{content:'not-json'},{error:true}]){const f=fixture(opts);await assert.rejects(f.parse('u',input));}
});

test('사진은 OCR 텍스트 없이 이미지 원본과 달력 추출 지시를 전달',async()=>{
 const f=fixture();const image='data:image/png;base64,aGVsbG8=';
 const result=await f.parse('u',{familyId:'family',baseDate:'2026-10-08',text:'',image});
 assert.equal(result.candidates[0].date,'2026-10-12');
 const req=f.stats().request;
 assert.equal(req.messages[1].content[1].image_url.url,image);
 assert.match(req.messages[0].content,/cell boundaries/);
 assert.match(req.messages[0].content,/use the year of baseDate/);
});
test('사진 검증: 잘못된 형식은 외부 전송 전 거부, 여러 일정은 모두 유지',async()=>{
 const f=fixture();await assert.rejects(f.parse('u',{...input,image:'https://example.com/image.png'}),e=>e.code==='invalid-argument');assert.equal(f.stats().calls,0);
 const rows=Array.from({length:31},(_,i)=>candidate({title:'행사 '+i,evidence:'소풍'}));
 assert.equal(validate({candidates:rows},'',true).length,31);
 assert.throws(()=>validate({candidates:[candidate({date:'2026-02-30',evidence:'소풍'})]},'',true));
});

test('사진의 연도 기본값은 서버에서도 기준 연도로 맞추고 학년도는 보존',()=>{
 const assumed=candidate({date:'2025-08-30',endDate:null,evidence:'8월 30일 체험',yearAssumed:true});
 const row=validate({candidates:[assumed]},'',true,'2026-10-11')[0];
 assert.equal(row.date,'2026-08-30');assert.equal(row.yearAssumed,true);
 const academic=candidate({date:'2027-01-01',endDate:'2027-01-08',evidence:'Winter Break',yearAssumed:false});
 assert.equal(validate({candidates:[academic]},'',true,'2026-10-11')[0].date,'2027-01-01');
 const span=candidate({date:'2025-12-30',endDate:'2026-01-02',evidence:'12월 30일~1월 2일',yearAssumed:true});
 const range=validate({candidates:[span]},'',true,'2026-10-11')[0];assert.equal(range.endDate,'2027-01-02');
});

test('주최자·카테고리·휴일 의미 추출 지시는 모델에 함께 전달',async()=>{
 const f=fixture();await f.parse('u',input);const instructions=f.stats().request.messages[0].content;
 for(const term of ['organizerName','티처투어','학교','학원','체험','School Closed','isHoliday','concise Korean','original visible language','second visual sweep'])assert(instructions.includes(term),term);
 assert.throws(()=>validate({candidates:[candidate({organizerName:'원문에 없는 주최자'})]},input.text));
 assert.throws(()=>validate({candidates:[candidate({isHoliday:'red'})]},input.text));
});

test('잘못된 서버 API 키는 사진·사용량 기록 전에 감지',async()=>{
 let touched=false,event;
 const parse=createMessageParser({db:{doc:()=>{touched=true;}},key:'invalid',reportFailure:e=>event=e});
 await assert.rejects(parse('u',input),e=>e.code==='failed-precondition');
 assert.equal(touched,false);assert.deepEqual(event,{stage:'configuration',reason:'invalid-key-format'});
 assert(!JSON.stringify(event).includes('invalid"'));
});
test('공급자 인증 실패와 요청 한도를 구분하여 직접 입력을 안내',async()=>{
 for(const [status,code] of [[401,'failed-precondition'],[403,'failed-precondition'],[429,'resource-exhausted'],[503,'unavailable']]){
  const f=fixture({error:true,status});await assert.rejects(f.parse('u',input),e=>e.code===code&&e.message.includes('직접 입력'));
 }
});

test('일정 배열 응답도 같은 날짜·시간·근거 검증을 통과한 후보만 허용',async()=>{
 const f=fixture({content:JSON.stringify([candidate()])});const result=await f.parse('u',input);assert.equal(result.candidates.length,1);
 assert.equal(f.stats().request.reasoning.enabled,false);
 const invalid=fixture({content:JSON.stringify([candidate({date:'2026-02-30'})])});await assert.rejects(invalid.parse('u',input));
});


test('공유파일 분석은 날짜 없이 문서 제목 하나만 반환한다',async()=>{
 const f=fixture({content:JSON.stringify({title:'가을 현장학습 안내문'})});
 const result=await f.parse('u',{...input,purpose:'shared-file-title',text:'가을 현장학습 안내문'});
 assert.deepEqual(result,{ok:true,title:'가을 현장학습 안내문'});
 const request=f.stats().request;
 assert.equal(request.max_tokens,200);
 assert.deepEqual(request.response_format.json_schema.schema.required,['title']);
 assert.match(request.messages[0].content,/do not extract events or dates/i);
 const invalid=fixture({content:JSON.stringify({title:'x'.repeat(61)})});
 await assert.rejects(invalid.parse('u',{...input,purpose:'shared-file-title'}));
 const denied=fixture({permission:'VIEWER'});
 await assert.rejects(denied.parse('u',{...input,purpose:'shared-file-title'}));
 assert.equal(denied.stats().calls,0);
});
