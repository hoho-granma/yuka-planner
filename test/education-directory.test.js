const {test}=require('node:test');const assert=require('node:assert/strict');const {createDirectory}=require('../functions/education-directory/directory');const C=require('../js/education-directory');
const row=(i,status='개원')=>({ATPT_OFCDC_SC_CODE:'J10',ADMST_ZONE_NM:'성남시',ACA_ASNUM:String(i),ACA_NM:'학원'+i,REG_STTUS_NM:status,FA_RDNMA:'성남시 분당구 판교로',LE_CRSE_NM:'보습'});
function response(total,rows){return {ok:true,json:async()=>({acaInsTiInfo:[{head:[{list_total_count:total},{RESULT:{CODE:'INFO-000'}}]},{row:rows}]})};}
test('all official pages are collected, closed entries excluded, IDs deduplicated and calls cached',async()=>{
 let calls=0;const read=createDirectory({key:'TEST_ONLY',fetchImpl:async u=>{calls++;const p=Number(new URL(u).searchParams.get('pIndex'));return p===1?response(102,Array.from({length:100},(_,i)=>row(i))):response(102,[row(0),row(101,'폐원')]);}});
 const [a,b]=await Promise.all([read(),read()]);assert.equal(a,b);assert.equal(a.rawCount,102);assert.equal(a.items.length,100);assert.equal(calls,2);await read();assert.equal(calls,2);
 assert.equal(C.filter(a.items,'학원99','분당구').length,1);assert.equal(C.filter(a.items,'','중원구').length,0);
});
test('sample limits, missing pages and network failures do not become complete or empty results',async()=>{
 await assert.rejects(createDirectory({key:'TEST',fetchImpl:async()=>response(3309,Array.from({length:5},(_,i)=>row(i)))})(),{code:'unavailable'});
 await assert.rejects(createDirectory({key:'TEST',fetchImpl:async()=>{throw Error('network')}})(),{code:'unavailable'});
 let n=0;await assert.rejects(createDirectory({key:'TEST',fetchImpl:async()=>response(101,++n===1?Array.from({length:100},(_,i)=>row(i)):[])})(),{code:'unavailable'});
 await assert.rejects(createDirectory({key:''})(),{code:'failed-precondition'});
});
test('directory result from a disposed child screen cannot replace the next child screen',async()=>{
 const E=require('../js/education-info');let resolve;const old={innerHTML:''};const cleanup=E.mount(old,{grade:3,provinceName:'경기도',district:'성남시',directoryReader:()=>new Promise(r=>resolve=r)});
 const click=data=>old.onclick({target:{closest:()=>({dataset:data})}});const pending=click({ei:'tab',tab:'choice'});cleanup();const next={innerHTML:''};E.mount(next,{grade:1});const before=next.innerHTML;resolve({items:[{name:'OLD_PRIVATE_NAME'}],checkedAt:'2026-10-08'});await pending;assert.equal(next.innerHTML,before);assert.doesNotMatch(next.innerHTML,/OLD_PRIVATE_NAME/);E.unmount();
});
test('choice auto-loads once with the profile ward and the toggle preserves filters',async()=>{
 const E=require('../js/education-info');let calls=0;const host={innerHTML:''};E.mount(host,{provinceName:'경기도',district:'성남시',gu:'분당구',grade:3,directoryReader:async()=>{calls++;return {checkedAt:'2026-10-08',items:[{id:'J10:100',name:'분당기관',course:'영어',address:'성남시 분당구'},{id:'J10:101',name:'수정기관',course:'영어',address:'성남시 수정구'}]};}});
 const click=d=>host.onclick({target:{closest:()=>({dataset:d})}});await click({ei:'tab',tab:'choice'});
 assert.equal(calls,1);assert.match(host.innerHTML,/성남·분당/);assert.match(host.innerHTML,/분당기관/);assert.doesNotMatch(host.innerHTML,/수정기관|전체 기관 불러오기|성남시 전체 등록 기관/);
 await click({ei:'collection',saved:'true'});await click({ei:'collection',saved:'false'});assert.match(host.innerHTML,/성남·분당/);await click({ei:'tab',tab:'trend'});await click({ei:'tab',tab:'choice'});assert.equal(calls,1);E.unmount();
});
test('non-curated official institutions can be expanded, saved, reopened and compared after remount',async()=>{
 const E=require('../js/education-info'),map=new Map(),storage={getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v)};
 const items=Array.from({length:42},(_,i)=>({id:'J10:'+String(9000000000+i),name:'전체목록기관'+i,address:'성남시 분당구 판교로 '+i,course:'영어'}));
 const opts={scope:'whole-directory-child',familyId:'whole-directory-family',provinceName:'경기도',district:'성남시',gu:'분당구',storage,directoryReader:async()=>({items,checkedAt:'2026-10-08',source:'https://open.neis.go.kr'})};
 let host={innerHTML:''};E.mount(host,opts);let click=d=>host.onclick({target:{closest:()=>({dataset:d})}});
 await click({ei:'tab',tab:'choice'});assert.equal((host.innerHTML.match(/class="ei-heart"/g)||[]).length,20);
 await click({ei:'directory-more'});assert.equal((host.innerHTML.match(/class="ei-heart"/g)||[]).length,40);
 for(const i of items.slice(0,2))await click({ei:'favorite',id:i.id});
 E.unmount();host={innerHTML:'',querySelector:()=>null};E.mount(host,opts);click=d=>host.onclick({target:{closest:()=>({dataset:d})}});await click({ei:'tab',tab:'choice'});await click({ei:'collection',saved:'true'});assert.equal((host.innerHTML.match(/class="ei-heart"/g)||[]).length,2);
 await click({ei:'institution',id:items[0].id});assert.match(host.innerHTML,/공식 교습 과정: 영어/);await click({ei:'back-choice'});
 for(const i of items.slice(0,2))await click({ei:'compare-select',id:i.id});await click({ei:'compare'});assert.match(host.innerHTML,/고른 후보 2곳 비교/);assert.match(host.innerHTML,/전체목록기관1/);assert.match(host.innerHTML,/미확인/);E.unmount();
});
test('official institution kinds and disclosed fee evidence are preserved without monthly fee inference',async()=>{
 const read=createDirectory({key:'TEST',fetchImpl:async()=>response(2,[{...row(1),ACA_INSTI_SC_NM:'학원',THCC_OTHBC_YN:'Y',PSNBY_THCC_CNTNT:'초등A:190000'},{...row(2),ACA_INSTI_SC_NM:'교습소',THCC_OTHBC_YN:'N',PSNBY_THCC_CNTNT:'NONPUBLIC'}])});
 const r=await read();assert.deepEqual(r.counts,{academy:1,teachingOffice:1});assert.equal(r.items[0].feeRaw,'초등A:190000');assert.equal(r.items[1].feeRaw,null);assert.equal(r.items[0].monthlyFee,undefined);
 const V=require('../js/education-reference-view');const items=r.items.map(i=>({...i,district:'분당구',subject:'수학'}));const html=V.choice({browse:'seongnam',institutionType:'교습소'},{directoryItems:items});assert.match(html,/학원2/);assert.doesNotMatch(html,/학원1/);
});
test('invalid key produces a sanitized configuration error rather than empty directory',async()=>{
 await assert.rejects(createDirectory({key:'TEST_NOT_REAL',fetchImpl:async()=>({ok:true,json:async()=>({RESULT:{CODE:'ERROR-290',MESSAGE:'untrusted error text'}})})})(),{code:'failed-precondition',message:'나이스 인증키 설정을 확인해야 해요.'});
});
