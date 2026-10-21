'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),Summary=require('../js/family-summary');
const people=[{key:'CHILD:a'},{key:'CHILD:b'},{key:'FAMILY'}],links=[{childKey:'a',familyCode:'CODEA'}];
const todo=(id,dueDate,extra={})=>({id,dueDate,ownerKey:'CHILD:a',order:1,...extra});
test('home filters Monday through Sunday and sorts by deadline across owners',()=>{
 const todos=[todo('sunday','2026-10-25'),todo('friday','2026-10-23'),todo('monday','2026-10-19',{ownerKey:'CHILD:b'}),todo('today','2026-10-21'),todo('next','2026-10-26'),todo('previous','2026-10-18'),todo('undated',''),todo('done','2026-10-22',{done:true}),todo('deleted','2026-10-22',{deletedAt:1}),todo('removed-owner','2026-10-22',{ownerKey:'CHILD:gone'})];
 const before=JSON.stringify(todos);assert.deepEqual(Summary.todosForWeek(todos,people,links,'2026-10-21').map(t=>t.id),['monday','today','friday','sunday']);assert.equal(JSON.stringify(todos),before);
 // 기존 하루 조회/전체 할일·위젯 정책을 바꾸지 않는다.
 assert(Summary.todosForDay(todos,people,links,'2026-10-21').some(t=>t.id==='next'));
 assert(Summary.todosForDay(todos,people,links,'2026-10-21').some(t=>t.id==='undated'));
});
test('week boundaries include Sunday, month/year crossings, and legacy child references',()=>{
 const todos=[todo('dec','2026-12-28'),todo('jan','2027-01-03',{ownerKey:null,childKey:'CODEA'}),todo('next','2027-01-04')];
 assert.deepEqual(Summary.todosForWeek(todos,people,links,'2027-01-03').map(t=>t.id),['dec','jan']);
 assert.deepEqual(Summary.todosForWeek(todos,people,links,'2027-01-04').map(t=>t.id),['next']);
 assert.deepEqual(Summary.todosForWeek(todos,people,links,'not-a-date'),[]);
});
