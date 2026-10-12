const {test}=require('node:test'),assert=require('node:assert/strict'),C=require('../js/character-ui.js');
test('확정한 역할별 6개와 36개월·8세 경계',()=>{
 const now=new Date(2026,9,8),categories=date=>C.categoriesFor({role:'CHILD',birthDate:date},now);
 assert.deepEqual(categories(new Date(2023,9,9)),['어린이집','병원','접종','검진','놀이','체험']);
 assert.deepEqual(categories(new Date(2023,9,8)),['유치원','학원','운동','병원','놀이','체험']);
 assert.deepEqual(categories(new Date(2019,0,1)),['학교','학원','방과후','운동','친구','체험','병원','기타']);
 assert.deepEqual(C.categories.MOM,['회사','모임','운동','병원','자기계발','기타']);assert.deepEqual(C.categories.MOM,C.categories.DAD);
 assert.deepEqual(C.categories.FAMILY,['여행','나들이','외식','행사','친척','모임']);
});
test('기존 카테고리 표시와 접종·검진의 의료 분류 유지',()=>{
 assert.equal(C.categoryBadge('ETC',{role:'CHILD'}).label,'기타');
 assert.equal(C.scheduleCategory('접종',{role:'CHILD'}),'MEDICAL');
 assert.equal(C.scheduleCategory('검진',{role:'CHILD'}),'MEDICAL');
});

test('입력 폼 카테고리는 역할별 고정 목록 — 다른 프로필의 값이 섞이지 않는다', () => {
  const C = require('../js/character-ui');
  const mom = C.categoriesFor({ role: 'MOM' }), kid = C.categoriesFor({ role: 'CHILD', birthDate: '2017-01-01' });
  assert.equal(mom[0], '회사');
  assert.equal(kid.includes('회사'), false);
  assert.equal(kid.length, 8);
  assert.deepEqual(C.categoriesFor({ role: 'CHILD', birthDate: '2017-01-01' }), kid);
});

test('확정 색: 아이는 파스텔+어두운 글씨, 어른은 진한 색+흰 글씨', () => {
  const C = require('../js/character-ui');
  const kid = { role: 'CHILD', birthDate: '2017-01-01' };
  assert.deepEqual(C.paletteFor(kid), ['#f0ccdc', '#cadcf0', '#c9e4d7', '#efddba', '#E8C6C8', '#D2C9E4', '#c8e3e6', '#E2E2E5']);
  assert.deepEqual(C.paletteFor({ role: 'MOM' }), ['#7c5cc4', '#2a6fb0', '#2b8a5e', '#b06a12', '#c04a7c', '#5d5a68']);
  assert.equal(C.categoryBadge('학교', kid).color, '#f0ccdc');
  assert.equal(C.categoryBadge('학교', kid).ink, '#40374b');
  assert.equal(C.categoryBadge('회사', { role: 'MOM' }).color, '#7c5cc4');
  assert.equal(C.categoryBadge('회사', { role: 'MOM' }).ink, '#ffffff');
});
