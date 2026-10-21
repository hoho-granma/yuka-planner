'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const M=require('../js/calendar-model.js');
const e={id:'VX-DTAP__dose-2',title:'DTaP 2차',category:'예방접종',scheduleKind:'window',windowStart:new Date(2026,9,18),windowEnd:new Date(2026,10,18)};
const source=(key,done={})=>({childKey:key,familyCode:'CODE_'+key,childName:key,events:[e,e],displayDates:new Map([[e.id,[new Date(2026,9,19)]]]),completed:done,hideLinked:true});
function build(sources,schedules=[],filter={}){return M.buildCalendarModel({range:{start:'2026-10-19',end:'2026-10-19'},filter,auto:{sources},user:{schedules,childLinks:[],members:[]}});}
test('같은 AUTO id는 자녀마다 보존, 같은 자녀/소스 중복만 제거',()=>{
 const a=source('baby'),b=source('older');const m=build([a,b,a,{...a,childKey:"duplicate-link"}]);const list=m.days.get('2026-10-19').planned;
 assert.equal(list.length,2);assert.deepEqual(list.map(x=>x.autoChildKey),['baby','older']);assert.equal(m.counts.planned,2);assert.equal(e.autoChildKey,undefined);
});
test('완료·미완료는 자녀별로 분리하고 원본 id를 유지',()=>{
 const a=source('baby',{[e.id]:{done:true}}),b=source('older');const list=build([a,b]).days.get('2026-10-19').planned;
 assert.equal(list[0].autoDone,true);assert.equal(list[1].autoDone,false);assert.equal(list[0].id,e.id);assert.equal(a.events[0],e);assert.equal(b.completed[e.id],undefined);
});
test('자녀별 필터·가족 필터·직접일정 전용은 AUTO 혼입 없음',()=>{
 const sources=[source('baby'),source('older')];
 const list=build(sources,[],{owners:['CHILD:older']}).days.get('2026-10-19').planned;
 assert.deepEqual(list.map(x=>x.autoChildKey),['older']);
 for(const filter of [{scope:'FAMILY'},{showAuto:false},{owners:['MEMBER:m']}])assert.equal(build(sources,[],filter).counts.planned,0);
});
test('예약은 해당 자녀의 추천만 숨기며 취소·삭제시 복원',()=>{
 const reservation={id:'r1',autoRef:e.id,scope:'CHILD',childKeys:['baby'],dateKind:'FIXED',eventDate:'2026-10-19',title:'예약',allDay:true,status:'TODO'};
 const sources=[source('baby'),source('older')];
 assert.deepEqual(build(sources,[reservation]).days.get('2026-10-19').planned.map(x=>x.autoChildKey),['older']);
 for(const patch of [{status:'CANCELLED'},{deletedAt:1}])assert.equal(build(sources,[{...reservation,...patch}]).counts.planned,2);
 assert.equal(reservation.status,'TODO');
});
test('별칭 연결도 자녀 범위에서만 숨기고 다른 자녀 완료를 변경하지 않는다',()=>{
 const a={...source('baby'),autoIdAliases:{'OLD__dose-2':e.id}},b=source('older',{[e.id]:true});
 const reservation={id:'r1',autoRef:'OLD__dose-2',scope:'CHILD',childKeys:['baby'],dateKind:'FIXED',eventDate:'2026-10-19',title:'예약',allDay:true,status:'DONE'};
 const list=build([a,b],[reservation]).days.get('2026-10-19').planned;assert.equal(list.length,1);assert.equal(list[0].autoChildKey,'older');assert.equal(list[0].autoDone,true);
});
