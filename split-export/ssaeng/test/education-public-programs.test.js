const {test}=require('node:test');const assert=require('node:assert/strict');const P=require('../js/education-public-programs');const {parseLibrary,createPublicPrograms}=require('../functions/education-directory/public-programs');
const at=Date.parse('2026-10-08T12:00:00+09:00');
const item={target:'초등학생 30명',registrationStart:'2026-10-01T10:00:00+09:00',registrationEnd:'2026-10-10T23:59:00+09:00',status:'open'};
test('programs filter expired and ineligible records and distinguish uncertain targets',()=>{
 const r=P.select([item,{...item,target:'초1~2'},{...item,target:'어린이 및 가족'},{...item,registrationEnd:'2026-10-07T23:59:00+09:00'},{...item,registrationStart:'2026-10-09T10:00:00+09:00'}],{grade:3,birthDate:'2017-06-20'},at);
 assert.equal(r.items.length,2);assert.equal(r.items[1].status,'upcoming');assert.equal(r.uncertain,1);
 assert.equal(P.eligible('만 8~10세',{birthDate:'2017-06-20'},at),true);assert.equal(P.eligible('2020~2021년생',{birthDate:'2017-06-20'},at),false);assert.equal(P.eligible('초1~2',{grade:3},at),false);
});
function html(state='수강신청'){return `<tbody id="teach_list"><tr><td data-th="강좌명"><a class="detail-btn" keyValue3="123">독서</a><dd class="con">대상 : 초등학생 20명</dd></td><td data-th="접수기간">2026-10-01 10:00 ~ 2026-10-10 23:59</td><td data-th="접수상태">${state}</td></tr></tbody>`;}
test('official parser preserves reception dates, excludes closed rows and rejects unknown schema',()=>{
 const rows=parseLibrary(html());assert.equal(rows.length,1);assert.equal(rows[0].target,'초등학생 20명');assert.equal(rows[0].registrationEnd,'2026-10-10T23:59:00+09:00');assert.equal(parseLibrary(html('접수마감')).length,0);assert.throws(()=>parseLibrary('<html>login</html>'));
});
test('partial coverage and source failures are never represented as full successful empty coverage',async()=>{
 const good=await createPublicPrograms({fetchImpl:async()=>({ok:true,text:async()=>html()})})();assert.equal(good.items.length,1);assert.equal(good.coverage[0].status,'partial');assert.equal(good.coverage[1].status,'unsupported');
 const bad=await createPublicPrograms({fetchImpl:async()=>{throw Error('network')}})();assert.equal(bad.items.length,0);assert.equal(bad.coverage[0].status,'failed');
});

test('default runtime collector can be constructed without options',()=>{assert.equal(typeof createPublicPrograms(),'function');});
