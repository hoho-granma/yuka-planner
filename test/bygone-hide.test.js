'use strict';
// 홈·캘린더·할 일의 목록(visibleSchedule)에서 "이미 받을 수 없게 끝난" 자동 항목은 빼고, 늦게라도 가능한(소급) 항목과 완료 기록은 남긴다.
const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('fs'),path=require('path'),vm=require('vm');
const ROOT=path.join(__dirname,'..');
global.DateCalc=require('../js/date-calc.js');global.ChildTimeline=require('../js/child-timeline.js');global.TodoEngine=require('../js/todo-engine.js');
const HN=require('../js/hn-logic.js');
vm.runInThisContext(fs.readFileSync(path.join(ROOT,'js/schedule.js'),'utf8')+'\n;globalThis.__bs=buildSchedule;');
const J=p=>JSON.parse(fs.readFileSync(path.join(ROOT,p),'utf8'));
const defs=['health-checkup','vaccination','development','feeding','oral','sleep','safety','daily-life','childcare'].flatMap(n=>{const f=J(`data/todos/${n}.json`);return f.todos||f;}).concat(J('data/subsidies/national-todos.json').todos);
const ds={todoDefinitions:defs,subsidy:{subsidies:J('data/subsidies/national.json').subsidies}};
const today=new Date();const birth=new Date(today.getFullYear(),today.getMonth(),today.getDate()-300);
const events=__bs({birthDate:birth,province:'서울특별시',district:'구로구',gender:'female',birthOrder:1,stage:'born'},ds,[]);
const ctx={today,ageNow:ChildTimeline.completedMonths(birth,today),pregnant:false,birthDate:birth};
const shown=(completed,hide)=>HN.visibleSchedule(events,{birthDate:birth,isShown:ChildTimeline.isEventShown,isBygone:hide?(e=>HN.isBygoneAuto(e,completed,ctx)):undefined});
test('300일 아이: 소급 불가로 끝난 항목(OVERDUE_FINAL)은 빠지고, 소급 가능(OVERDUE_CATCHUP)·지금 가능(DUE)은 남는다',()=>{
 const before=shown({},false),after=shown({},true);
 const fin=before.filter(e=>e.engineStatus==='OVERDUE_FINAL'),cu=before.filter(e=>e.engineStatus==='OVERDUE_CATCHUP'),due=before.filter(e=>e.engineStatus==='DUE');
 assert.ok(fin.length>0&&cu.length>0&&due.length>0,'테스트 데이터에 세 종류가 있어야 한다');
 assert.equal(after.filter(e=>e.engineStatus==='OVERDUE_FINAL'&&e.category!=='행정·지원금').length,0);
 assert.equal(after.filter(e=>e.engineStatus==='OVERDUE_CATCHUP').length,cu.length);
 assert.equal(after.filter(e=>e.engineStatus==='DUE').length,due.length);
});
test('완료한 항목은 지났어도 기록으로 남는다',()=>{
 const fin=shown({},false).find(e=>e.engineStatus==='OVERDUE_FINAL'&&e.category!=='행정·지원금');
 assert.ok(fin);
 const done={[fin.id]:{done:true}};
 assert.ok(shown(done,true).some(e=>e.id===fin.id));
 assert.ok(!shown({},true).some(e=>e.id===fin.id));
});
test('isBygoneAuto: 엔진 지원금이 소급 불가로 끝났으면 걸리고, 나이 조건이 맞는 지금 가능한 지원금은 안 걸린다',()=>{
 const sub=events.filter(e=>e.category==='행정·지원금');
 assert.ok(sub.length>0);
 sub.forEach(e=>{const exp=HN.subsidyStatus(e,{},ctx)==='expired';assert.equal(HN.isBygoneAuto(e,{},ctx),exp,e.id);});
});
