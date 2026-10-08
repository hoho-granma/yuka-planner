const {test}=require('node:test'),assert=require('node:assert/strict'),C=require('../js/character-ui.js');
test('확정한 역할별 6개와 36개월·8세 경계',()=>{
 const now=new Date(2026,9,8),categories=date=>C.categoriesFor({role:'CHILD',birthDate:date},now);
 assert.deepEqual(categories(new Date(2023,9,9)),['어린이집','병원','접종','검진','놀이','체험']);
 assert.deepEqual(categories(new Date(2023,9,8)),['유치원','학원','운동','병원','놀이','체험']);
 assert.deepEqual(categories(new Date(2019,0,1)),['학교','학원','방과후','운동','친구','체험']);
 assert.deepEqual(C.categories.MOM,['회사','모임','운동','병원','취미','자기계발']);assert.deepEqual(C.categories.MOM,C.categories.DAD);
 assert.deepEqual(C.categories.FAMILY,['여행','나들이','외식','행사','친척','모임']);
});
test('기존 카테고리 표시와 접종·검진의 의료 분류 유지',()=>{
 assert.equal(C.categoryBadge('ETC',{role:'CHILD'}).label,'기타');
 assert.equal(C.scheduleCategory('접종',{role:'CHILD'}),'MEDICAL');
 assert.equal(C.scheduleCategory('검진',{role:'CHILD'}),'MEDICAL');
});
