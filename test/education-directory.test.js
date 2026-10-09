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
 assert.equal(calls,1);assert.match(host.innerHTML,/data-district="분당구" aria-pressed="true"/);assert.match(host.innerHTML,/분당기관/);assert.doesNotMatch(host.innerHTML,/수정기관|전체 기관 불러오기|성남시 전체 등록 기관/);
 await click({ei:'collection',saved:'true'});await click({ei:'collection',saved:'false'});assert.match(host.innerHTML,/data-district="분당구" aria-pressed="true"/);await click({ei:'tab',tab:'trend'});await click({ei:'tab',tab:'choice'});assert.equal(calls,1);E.unmount();
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
 await click({ei:'institution',id:items[0].id});assert.match(host.innerHTML,/대상·과정<\/dt><dd>영어/);await click({ei:'back-choice'});
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

test('Seoul profile opens Bundang directly; region tags and favorites do not hide saved institutions',async()=>{
 const E=require('../js/education-info');const values=new Map();const storage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)};
 const items=[{id:'J10:501',name:'분당 수학',address:'성남시 분당구',course:'보습',courseList:'수학,영어'},{id:'J10:502',name:'중원 영어',address:'성남시 중원구',course:'영어'}];
 let calls=0;const host={innerHTML:''};E.mount(host,{provinceName:'서울특별시',district:'구로구',storage,scope:'regression-child',directoryReader:async()=>{calls++;return {items};}});
 const click=dataset=>host.onclick({target:{closest:()=>({dataset})}});
 await click({ei:'tab',tab:'choice'});assert.equal(calls,1);assert.match(host.innerHTML,/분당 수학/);assert.doesNotMatch(host.innerHTML,/중원 영어|data-ei-field="district"|data-ei-field="browse"/);
 host.onchange({target:{dataset:{eiField:'subject'},value:'수학'}});assert.match(host.innerHTML,/분당 수학/);
 await click({ei:'favorite',id:'J10:501'});await click({ei:'district',district:'중원구'});assert.doesNotMatch(host.innerHTML,/분당 수학/);
 await click({ei:'collection',saved:'true'});assert.match(host.innerHTML,/분당 수학/);assert.doesNotMatch(host.innerHTML,/이 조건에 맞는 등록 기관이 없어요/);
 await click({ei:'favorite',id:'J10:501'});assert.match(host.innerHTML,/관심 학원을 모아보세요/);assert.doesNotMatch(host.innerHTML,/role="alert"/);
 await click({ei:'collection',saved:'false'});assert.match(host.innerHTML,/data-district="중원구" aria-pressed="true"/);
 await click({ei:'reset-filters'});assert.match(host.innerHTML,/중원 영어/);assert.equal(calls,1);E.unmount();
});

test('institution detail uses live disclosed fees even for curated IDs and does not fabricate cafe reviews',()=>{
 const V=require('../js/education-reference-view');const html=V.choice({institution:'J10:3000050173'},{directoryItems:[{id:'J10:3000050173',name:'에이프릴',address:'성남시 분당구',feeRaw:'초등A:190000\n교재:20000'}]});
 assert.match(html,/초등A:190000\n교재:20000/);assert.match(html,/<h4>후기에서 언급된 내용<\/h4>/);assert.match(html,/후기 본문은 아직 확보하지 못했어요/);assert.doesNotMatch(html,/이 기관의 후기 찾아보기|공식 등록자료|월 190000/);
 const escaped=V.choice({institution:'J10:999'},{directoryItems:[{id:'J10:999',name:'학원',feeRaw:'<script>alert(1)</script>'}]});assert.doesNotMatch(escaped,/<script>/);assert.match(escaped,/&lt;script&gt;/);
});

test('verified opinions keep differing experiences, original grades and source; unknown institutions stay empty',()=>{
 const V=require('../js/education-reference-view'),R=require('../js/education-reference');
 const html=V.institution('J10:3000025694');assert.match(html,/좋게 언급된 점/);assert.match(html,/함께 살펴볼 점/);assert.match(html,/실험을 즐기면서/);assert.match(html,/교과·교육 중심으로 느꼈다는/);assert.match(html,/초5 · 창의융합과학 · 학부모 · 2025년/);assert.match(html,/오늘학교 아카데미/);assert.doesNotMatch(html,/자주 언급|연산 실력|진도가 너무 빠르|맘카페 후기/);
 const unknown=V.institution('J10:3000050173');assert.match(unknown,/후기 본문은 아직 확보하지 못했어요/);assert.doesNotMatch(unknown,/과학 실험을 즐기면서/);
 const compared=V.comparison(['J10:3000025694','J10:3000050173']);assert.match(compared,/교과·교육 중심으로 느꼈다는/);
 assert.equal(R.institutions.find(i=>i.id==='J10:3000050173').reviewEvidence,undefined);
});

test('cafe evidence is matched by registered name and street, preserves old date, and excludes other branches',()=>{
 const R=require('../js/education-reference'),V=require('../js/education-reference-view');
 const institution={id:'J10:999123',name:'정법수학학원',address:'경기도 성남시 분당구 구미로 100 , 203호',institutionType:'학원'};
 assert.equal(R.reviewFor(institution).sourceKind,'맘카페 후기');
 for(const changed of [{name:'다른수학학원'},{address:'경기도 성남시 분당구 구미로 1000'},{address:'경기도 성남시 분당구 구미로 100-2'},{address:'경기도 성남시 수정구 구미로 100'},{institutionType:'교습소'}])assert.equal(R.reviewFor({...institution,...changed}),null);
 const html=V.choice({institution:institution.id},{directoryItems:[institution]});assert.match(html,/자기주도학습/);assert.match(html,/시설이 오래된 느낌/);assert.match(html,/2021-07-31/);assert.match(html,/현재 운영과 상세 호수/);assert.match(html,/cafe.naver.com\/bundangchild\/13422/);assert.doesNotMatch(html,/초1|초2|연산 실력|네이버 AI 요약/);
});

test('official Bundang research roster tracks all academies and never counts pending sources as verified',()=>{
 const roster=require('../data/education/bundang-review-research.json');assert.equal(roster.items.length,1503);assert.equal(new Set(roster.items.map(i=>i.researchId)).size,1503);
 assert.ok(roster.items.every(i=>i.address.includes('분당구')&&['학교교과교습학원','평생직업교육학원'].includes(i.academyType)));
 for(const [status,count]of Object.entries(roster.counts)){if(status==='total')assert.equal(count,roster.items.length);else assert.equal(count,roster.items.filter(i=>i.status===status).length);}
 for(const r of roster.items.filter(i=>i.status==='verified_cafe'))assert.ok(r.sources.length&&r.opinions.length&&r.checkedAt);
 assert.equal(roster.items.find(i=>i.name==='미금컴퓨터보습학원').status,'matching_pending');
});
