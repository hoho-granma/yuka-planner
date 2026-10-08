const {test}=require('node:test');const assert=require('node:assert/strict');
const I=require('../js/education-interests');const V=require('../js/education-reference-view');const R=require('../js/education-reference');
test('interest persistence isolates child, family and account; invalid data remains untouched',()=>{
 const map=new Map(),storage={getItem:k=>map.get(k),setItem:(k,v)=>map.set(k,v)};const a={scope:'account:child',familyId:'family'};const id=R.institutions[0].id;
 I.write(storage,a,[id,id,'unknown']);assert.deepEqual(I.read(storage,a,[id]).ids,[id]);
 for(const b of [{...a,scope:'account:other-child'},{...a,familyId:'other-family'},{...a,scope:'other-account:child'}])assert.deepEqual(I.read(storage,b,[id]).ids,[]);
 storage.setItem(I.key(a),'broken');assert.ok(I.read(storage,a,[id]).error);assert.equal(storage.getItem(I.key(a)),'broken');
 assert.throws(()=>I.write({setItem(){throw Error('quota');}},a,[id]),/quota/);
});
test('comparison is limited to two or three real institutions, fourth selection is rejected',()=>{
 let ids=[];for(const i of R.institutions.slice(0,3))ids=I.select(ids,i.id).ids;
 const fourth=I.select(ids,R.institutions[3].id);assert.equal(fourth.ids.length,3);assert.ok(fourth.error);
 assert.equal(I.select(ids,ids[0]).ids.length,2);assert.equal(V.comparison(ids.slice(0,1)),'');assert.equal(V.comparison(R.institutions.slice(0,4).map(i=>i.id)),'');
 const html=V.comparison(ids);assert.match(html,/공식 출처/);assert.match(html,/검증된 의견 자료 미확보/);
 const list=V.choice({browse:'seongnam',favorites:ids,savedOnly:true,compared:ids,showComparison:true});assert.equal((list.match(/class="ei-heart"/g)||[]).length,3);assert.match(list,/aria-pressed="true"/);assert.match(list,/비교 선택 3\/3/);
});
