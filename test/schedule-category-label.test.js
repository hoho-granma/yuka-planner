const {test}=require('node:test'),assert=require('node:assert/strict');
const U=require('../js/user-schedule.js'),V=require('../js/user-schedule-view.js'),C=require('../js/character-ui.js');
test('회사 표시 카테고리는 생성·수정·재열기 및 반복 회차에도 보존',()=>{
 const raw={sourceType:'MANUAL',title:'DBT 미팅',category:'ETC',categoryLabel:'회사',scope:'FAMILY',dateKind:'FIXED',eventDate:'2026-10-08',allDay:true};
 const built=U.buildCreateDoc(raw,1);assert.ok(built.ok);assert.equal(built.doc.categoryLabel,'회사');
 const form=V.formFromSchedule({...built.doc,id:'a'});assert.equal(form.charCategory,'회사');
 const prep=V.prepareSave({...form,charCategory:'운동',categoryLabel:'운동'},2);assert.ok(prep.ok);assert.equal(prep.input.categoryLabel,'운동');
 assert.equal(C.categoryBadge('회사',{role:'DAD'}).label,'회사');
 assert.equal(C.scheduleCategory('회사',{role:'DAD'}),'ETC');
 const bad=U.buildCreateDoc({...raw,categoryLabel:'a'.repeat(31)},1);assert.equal(bad.ok,false);
 const legacy=U.buildCreateDoc({...raw,categoryLabel:undefined},1);assert.ok(legacy.ok);
});
