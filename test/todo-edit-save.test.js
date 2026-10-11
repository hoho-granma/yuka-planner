'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../js/app.js'),'utf8'),start=source.indexOf('  async function charSaveTodo(remove)'),end=source.indexOf('  const charModelBase',start),code=source.slice(start,end);
function world({entered='수영복 챙기기',failure=false,review=false}={}){
 const button={disabled:false},nodes={'hn-task-text':{value:entered},'hn-task-has-due':{checked:true},'hn-task-due':{value:'2026-10-12'},'hn-task-calendar':{checked:false},'hn-task-error':{textContent:''},'hn-message-title':{value:'직접 확인한 제목'}};
 const saved=[],renders=[];const ctx={charTodoForm:{id:'t1',title:'이전 제목',titleEdited:true,description:'원본 안내 메모',ownerKey:'CHILD:c1',category:'체험',messageTitleReview:review},document:{querySelector:()=>button},el:id=>nodes[id],CharacterUI:require('../js/character-ui'),HouseholdSync:{patchTodo:async(h,id,fields)=>{if(failure)return {ok:false};saved.push({h,id,fields});return {ok:true};}},hh:{hid:'family'},closeDetail:()=>renders.push('close'),usRefreshCalendar:()=>renders.push('calendar'),renderHome:()=>renders.push('home'),renderChecklistTab:()=>renders.push('tasks')};vm.createContext(ctx);vm.runInContext(code,ctx);return {ctx,nodes,button,saved,renders};
}
test('이전 제목 캐시·입력 이벤트 유무와 관계없이 현재 수정값을 저장하고 두 목록을 갱신',async()=>{
 const w=world();await w.ctx.charSaveTodo(false);assert.equal(w.saved[0].fields.title,'수영복 챙기기');assert.equal(w.saved[0].fields.dueDate,'2026-10-12');assert.equal(w.saved[0].fields.description,'원본 안내 메모');assert.deepEqual(w.renders,['close','calendar','home','tasks']);assert.equal(w.ctx.charTodoForm,null);
});
test('현재 입력을 지웠으면 이전 제목으로 저장하지 않고 폼에 남아 오류 표시',async()=>{
 const w=world({entered:' '});await w.ctx.charSaveTodo(false);assert.equal(w.saved.length,0);assert.match(w.nodes['hn-task-error'].textContent,/입력/);assert.equal(w.renders.length,0);assert.equal(w.button.disabled,false);
});
test('별도 제목 확인 입력이 있는 AI 할일은 확인한 제목을 저장',async()=>{
 const w=world({review:true});await w.ctx.charSaveTodo(false);assert.equal(w.saved[0].fields.title,'직접 확인한 제목');
});
test('저장 실패는 목록을 닫거나 성공 처리하지 않고 재시도 가능',async()=>{
 const w=world({failure:true});await w.ctx.charSaveTodo(false);assert.equal(w.renders.length,0);assert.equal(w.button.disabled,false);assert.match(w.nodes['hn-task-error'].textContent,/저장하지 못/);assert(w.ctx.charTodoForm);
});
