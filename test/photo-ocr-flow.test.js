'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync(require.resolve('../js/app.js'),'utf8');
const todo=source.slice(source.indexOf('  async function charReadPhoto(){'),source.indexOf('  let charVoice=null;'));
const schedule=source.slice(source.indexOf('  capMenuClick=function(mode){'),source.indexOf('  const charFinalCloseBase='));
function fixture(kind,{prepare={ok:true},recognize}={}){
 const form=kind==='todo'?{inputMode:'photo',text:'기존'}:{capInputMode:'gallery',charText:'기존'};
 const nodes={'modal-content':{querySelector:()=>({})},'hn-task-error':{textContent:''},'hn-task-text':{value:'기존'},'hn-schedule-content':{value:'기존'}};
 const inputs=[],context={hh:{hid:'family'},acct:{user:{uid:'user'}},charTodoForm:form,us:{form,messages:[]},el:id=>nodes[id],CharacterUI:{title:t=>t.slice(0,20)},document:{createElement:()=>{const input={files:[{}],click(){}};inputs.push(input);return input;}},capSvc:()=>({available:()=>true,prepare:async()=>prepare,recognize:recognize|| (async()=>({ok:true,text:'2026년 10월 12일 수업'}))}),charTodoRender:()=>{},usShowForm:()=>{},charScheduleVoice:null,charCapMenuBase:()=>{},charScheduleText:(f,text)=>{f.charText=text.slice(0,500);f.memo=f.charText;},capMenuClick:null};
 vm.createContext(context);vm.runInContext(kind==='todo'?todo:schedule,context);
 const select=async()=>{if(kind==='todo')await context.charReadPhoto();else context.capMenuClick('gallery');return inputs.at(-1).onchange();};
 return {context,form,nodes,select};
}
for(const kind of ['todo','schedule']){
 test(kind+': OCR 결과는 같은 폼에 반영하고 분석 가능한 상태로 변경',async()=>{const f=fixture(kind);await f.select();assert.equal(f.form.ocrReady,true);assert.match(kind==='todo'?f.form.text:f.form.charText,/10월 12일/);});
 test(kind+': 준비 실패 시 인식·분석하지 않고 기존 입력 보존',async()=>{let calls=0;const f=fixture(kind,{prepare:{ok:false},recognize:async()=>{calls++;}});await f.select();assert.equal(calls,0);assert.equal(f.form.ocrReady,false);assert.equal(kind==='todo'?f.form.text:f.form.charText,'기존');});
 test(kind+': 계정 변경 후 늦은 OCR 결과는 적용하지 않음',async()=>{let finish;const f=fixture(kind,{recognize:()=>new Promise(r=>finish=r)});const pending=f.select();await new Promise(r=>setImmediate(r));f.context.acct.user={uid:'other'};finish({ok:true,text:'다른 기록'});await pending;assert.equal(kind==='todo'?f.form.text:f.form.charText,'기존');});
 test(kind+': 두 사진을 연속 선택하면 마지막 사진만 반영',async()=>{const finishes=[];const f=fixture(kind,{recognize:()=>new Promise(r=>finishes.push(r))});const first=f.select();await new Promise(r=>setImmediate(r));const second=f.select();await new Promise(r=>setImmediate(r));finishes[1]({ok:true,text:'두 번째 사진'});await second;finishes[0]({ok:true,text:'첫 번째 사진'});await first;assert.equal(kind==='todo'?f.form.text:f.form.charText,'두 번째 사진');});
 test(kind+': 닫은 폼으로 늦은 결과나 오류를 반영하지 않음',async()=>{let reject;const f=fixture(kind,{recognize:()=>new Promise((r,j)=>reject=j)});const pending=f.select();await new Promise(r=>setImmediate(r));delete f.nodes['hn-task-text'];delete f.nodes['hn-schedule-content'];const before=f.nodes['hn-task-error'].textContent;reject(Error('늦은 실패'));await pending;if(kind==='todo')assert.equal(f.nodes['hn-task-error'].textContent,before);else assert.notEqual(f.context.us.messages[0],'늦은 실패');});
 test(kind+': 500자 초과 사진은 잘림 안내 표시',async()=>{const f=fixture(kind,{recognize:async()=>({ok:true,text:'가'.repeat(501)})});await f.select();assert.equal(f.form.ocrTruncated,true);assert.equal((kind==='todo'?f.form.text:f.form.charText).length,500);assert.match(kind==='todo'?f.nodes['hn-task-error'].textContent:f.context.us.messages[0],/500자/);});
}
for(const kind of ['todo','schedule'])test(kind+': 사진 AI 후보 적용 시 원문·사진 모드와 날짜 보존, 저장은 호출하지 않음',async()=>{
 const start=source.lastIndexOf("  document.addEventListener('click',async e=>{"),code=source.slice(start,source.indexOf('  init();',start));
 const form={inputMode:'photo',capInputMode:'gallery',ocrReady:true,ownerKey:'FAMILY',scope:'FAMILY'};
 const state={kind,form,text:'2026년 10월 12일 미술 수업',analysisMode:'photo',family:'family',uid:'u',candidates:[{kind,title:'미술 수업',date:'2026-10-12',startTime:kind==='schedule'?'15:07':null,endTime:kind==='schedule'?'16:07':null,category:null}]};
 let listener,saveCalls=0;
 const ctx={messageAnalysis:state,messageSource:()=>({kind,form,text:state.text}),hh:{hid:'family'},acct:{user:{uid:'u'}},charTodoForm:form,us:{form},CharacterUI:{categoriesFor:()=>[]},charPerson:()=>({}),charTodoRender:()=>{},usShowForm:()=>{},el:()=>({textContent:''}),charSaveTodo:()=>saveCalls++,document:{addEventListener:(event,fn)=>listener=fn}};
 vm.createContext(ctx);vm.runInContext(code,ctx);
 await listener({target:{closest:selector=>selector==='[data-message-apply]'?{dataset:{messageApply:'0'}}:null}});
 assert.equal(form.title,'미술 수업');assert.equal(kind==='todo'?form.text:form.memo,state.text);assert.equal(kind==='todo'?form.inputMode:form.capInputMode,kind==='todo'?'photo':'gallery');assert.equal(kind==='todo'?form.dueDate:form.eventDate,'2026-10-12');if(kind==='schedule'){assert.equal(form.startTime,'15:07');assert.equal(form.endTime,'16:07');assert.equal(form.allDay,false);}assert.equal(saveCalls,0);assert.equal(ctx.messageAnalysis,null);
});
