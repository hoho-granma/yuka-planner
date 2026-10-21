const test=require('node:test'),assert=require('node:assert/strict');
const Summary=require('../js/family-summary'),Calendar=require('../js/calendar-model'),US=require('../js/user-schedule');
const people=[{key:'CHILD:a',name:'첫째'},{key:'CHILD:b',name:'둘째'},{key:'FAMILY',name:'가족'}];
const links=[{childKey:'a',familyCode:'CODEA',displayName:'첫째'},{childKey:'b',familyCode:'CODEB',displayName:'둘째'}];
const date='2026-10-19';
test('ownerKey wins over immutable legacy childKey; only absent owners fall back',()=>{
 const todos=[{id:'moved',ownerKey:'CHILD:b',childKey:'a',title:'이동',order:1},
  {id:'legacy',childKey:'CODEA',title:'구문서',order:2},{id:'family',ownerKey:'FAMILY',childKey:'a',title:'공통',order:1}];
 const result=Summary.todosForDay(todos,people,links,date);
 assert.deepEqual(result.map(t=>t.id),['legacy','moved','family']);
 assert.equal(Summary.normalizeTodos(todos,links)[0].ownerKey,'CHILD:b');
 assert.equal(todos[1].ownerKey,undefined);
});
test('todo policy matches home: excludes done, deleted, expired and removed owner',()=>{
 const base={childKey:'a',title:'할일',order:1};
 const todos=[{...base,id:'today',dueDate:date},{...base,id:'future',dueDate:'2026-10-20'},
  {...base,id:'undated'},{...base,id:'expired',dueDate:'2026-10-18'},
  {...base,id:'done',done:true},{...base,id:'deleted',deletedAt:1},{...base,id:'unknown',ownerKey:'CHILD:gone'}];
 assert.deepEqual(Summary.todosForDay(todos,people,links,date).map(t=>t.id),['today','future','undated']);
 assert.deepEqual(Summary.todosForDay(todos,people,links,'2026-10-20').map(t=>t.id),['future','undated']);
});
test('same AUTO id across children preserves each child and completion isolation',()=>{
 const event={id:'VX-X__dose-1',title:'접종',scheduleKind:'fixed',fixedDate:date,date:new Date(date+'T00:00:00')};
 const sources=links.map(l=>({...l,childName:l.displayName,events:[event],displayDates:new Map(),completed:l.childKey==='a'?{[event.id]:true}:{}}));
 const model=Calendar.buildCalendarModel({range:{start:date,end:date},auto:{sources},user:{schedules:[],childLinks:links,members:[]}},
  {HNLogic:{coversDay:()=>true,plannedOnDay:()=>[]},UserSchedule:US});
 const result=Summary.build({model,todos:[],people,links,context:'user:family',now:1,observedAt:1,timeZone:'Asia/Seoul'});
 assert.equal(result.days[0].schedules.length,2);
 assert.deepEqual(result.days[0].schedules.map(o=>[o.owner,o.done]),[['첫째',true],['둘째',false]]);
 assert.notEqual(result.days[0].schedules[0].id,result.days[0].schedules[1].id);
 assert.equal(event.autoChildKey,undefined);
});
test('USER recurrence uses CalendarModel moved/cancelled/done result; shared children stay one row',()=>{
 const doc={id:'weekly',v:1,sourceType:'MANUAL',title:'수업',category:'LESSON',scope:'CHILD',childKeys:['a','b'],dateKind:'FIXED',allDay:false,startTime:'09:00',endTime:'10:00',createdAt:1,updatedAt:1,
  recurrence:{freq:'WEEKLY',startDate:date,endDate:'2026-11-02',byDay:['MO']},exceptions:{[date]:{status:'DONE'},'2026-10-26':{status:'CANCELLED'}}};
 const model=Calendar.buildCalendarModel({range:{start:date,end:'2026-10-26'},filter:{showAuto:false},user:{schedules:[doc],childLinks:links,members:[]}});
 const today=Summary.build({model,todos:[],people,links,context:'u:h',now:1,observedAt:1,timeZone:'Asia/Seoul'}).days;
 assert.equal(today[0].schedules.length,1);assert.equal(today[0].schedules[0].owner,'첫째·둘째');assert.equal(today[0].schedules[0].done,true);
 assert.equal(today.at(-1).schedules.length,0);
});
