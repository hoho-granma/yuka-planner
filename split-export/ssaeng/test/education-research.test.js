'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const research=require('../js/education-research');
const view=require('../js/education-reference-view');
test('DB research attaches by exact institution ID and only confirmed content receives added badge',()=>{
 research.load({items:[{id:'J10:123',added:true,checkedAt:'2026-10-12',summary:'초3~6 · 시간표',cost:'2025년 비용 · 현행 미확인',status:'일부 확인',record:'<script>alert(1)</script>',sources:['javascript:alert(1)','https://example.org/source']},{id:'J10:124',added:false,summary:'공식 원문 미확보',record:'미확인',sources:[]}]});
 const items=[{id:'J10:123',name:'학원A',institutionType:'학원'},{id:'J10:124',name:'교습소B',institutionType:'교습소'},{id:'J10:125',name:'같은 이름 다른 지점',institutionType:'학원'}];
 const list=view.choice({browse:'seongnam',favorites:[],compared:[]},{directoryItems:items});
 assert.equal((list.match(/class="ei-research-badge"/g)||[]).length,1);
 const detail=view.institution('J10:123',{directoryItems:items});
 assert.match(detail,/추가 조사 내용/);assert.match(detail,/2025년 비용 · 현행 미확인/);
 assert.match(detail,/&lt;script&gt;/);assert.doesNotMatch(detail,/<script>|href="javascript:/);
 assert.doesNotMatch(view.institution('J10:125',{directoryItems:items}),/추가 조사 내용/);
 assert.match(view.institution('J10:124',{directoryItems:items}),/공식 원문 미확보/);
 research.load(null);assert.equal(research.get('J10:123'),null);
});

test('compact facts: one-line values with visible evidence, 확인 안 됨 for gaps, phone link and 직접 문의 notice',()=>{
 research.load({items:[{id:'J10:200',added:true,checkedAt:'2026-10-12',status:'일부 확인',summary:'x',cost:'y',record:'원문',sources:[],phones:[{n:'031 703 9994',l:'중복'},{n:'010-2840-4148',l:'운영자 블로그'},{n:'010-0000-0000'}],sections:{
  fees:{v:'교실수업 월 30만원 <b>',tag:'지점 공식',more:['셔틀비 월 3만원','교재비 별도']},
  schedule:{v:'월수금 주 3회 90분',tag:'본사 공통',more:[]},
  program:{v:'초1~초6',tag:'과거 글',more:[]},
  levelTest:{v:null,tag:'',more:[]}}},
  {id:'J10:201',added:false,checkedAt:'2026-10-12',status:'x',summary:'x',cost:'y',record:'원문',sources:[],sections:{}}]});
 const items=[{id:'J10:200',name:'학원S',institutionType:'학원',district:'분당구',address:'경기도 성남시 분당구 성남대로 385 , 702~703호 (정자동, 분당클리닉빌딩)',course:'보습',phone:'031-703-9994',feeRaw:'고등 주1회 :400000, 중등영어:300000'},{id:'J10:201',name:'학원T',institutionType:'학원',phone:null,feeRaw:'초등영어A:100000'}];
 const html=view.institution('J10:200',{directoryItems:items});
 assert.match(html,/<h4>학원 정보<\/h4>/);
 assert.deepEqual([...html.matchAll(/data-research-item="(\w+)"/g)].map(m=>m[1]),['fees','schedule','program','levelTest','shuttle','method','trial']);
 assert.match(html,/교실수업 월 30만원 &lt;b&gt;/);assert.doesNotMatch(html,/<b>/);
 assert.match(html,/<li>셔틀비 월 3만원<\/li>/);assert.match(html,/<ul class="ei-kf-more"><li>교육청 공개 교습비: 고등 주1회 400,000원 · 중등영어 300,000원<\/li><li>셔틀비/);assert.doesNotMatch(html,/<details/);
 assert.match(html,/ei-kf-branch">지점 공식/);assert.match(html,/ei-kf-hq">본사 공통/);assert.match(html,/ei-kf-old">과거 글/);
 assert.equal((html.match(/확인 안 됨/g)||[]).length,4);
 assert.match(html,/href="tel:0317039994">031-703-9994</);assert.match(html,/학원에 직접 문의해서 확인해 주세요/);
 assert.doesNotMatch(html,/조사 원문 전체 보기|조사 출처 보기|상담에서 확인할 것|비용이 없다는 뜻|확보하지 못했어요/);
 for(const gone of ['전화','기관 종류','대상·과정'])assert.equal((html.match(new RegExp('<dt>'+gone+'</dt>','g'))||[]).length,0,gone);
 assert.equal((html.match(/<dt>연락처<\/dt>/g)||[]).length,1);assert.doesNotMatch(html,/<h4>연락처<\/h4>/);
 assert.match(html,/<dt>위치<\/dt><dd>경기도 성남시 분당구 성남대로 385, 702~703호<span class="ei-kf-sub">\(정자동, 분당클리닉빌딩\)<\/span><\/dd>/);
 assert.doesNotMatch(html,/<p>경기도 성남시/);assert.ok(html.indexOf('data-info="location"')<html.indexOf('data-research-item="fees"'));
 assert.equal((html.match(/class="ei-tel"/g)||[]).length,2);assert.match(html,/href="tel:01028404148">010-2840-4148<\/a><span class="ei-kf-sub-inline">운영자 블로그</);assert.doesNotMatch(html,/010-0000-0000|중복/);
 const none=view.institution('J10:201',{directoryItems:items});
 assert.match(none,/data-contact="phone"><dt>연락처<\/dt><dd><\/dd>/);assert.doesNotMatch(none,/data-info="location"/);assert.doesNotMatch(none,/href="tel:/);
 assert.match(none,/학원에 직접 문의해서 확인해 주세요/);
 assert.match(none.match(/data-research-item="fees"[\s\S]*?<\/div>/)[0],/초등영어A 100,000원<span class="ei-kf-tag ei-kf-etc">교육청 공개<\/span>/);assert.doesNotMatch(none,/<h4>공개 교습비<\/h4>|아래 공개 교습비 참고/);
 research.load(null);
});

test('public fee alone with several courses becomes a range summary with one bullet per course',()=>{
 research.load({items:[{id:'J10:202',added:true,checkedAt:'2026-10-12',status:'x',summary:'',cost:'',record:'',sources:[],sections:{}}]});
 const html=view.institution('J10:202',{directoryItems:[{id:'J10:202',name:'학원U',institutionType:'학원',feeRaw:'고등영어B:450000, 초등영어:300000, 고등영어D:600000'}]});
 const fees=html.match(/data-research-item="fees"[\s\S]*?<\/div>/)[0];
 assert.match(fees,/과정별 300,000~600,000원<span class="ei-kf-tag ei-kf-etc">교육청 공개<\/span>/);
 assert.deepEqual([...fees.matchAll(/<li>([^<]+)<\/li>/g)].map(m=>m[1]),['고등영어B 450,000원','초등영어 300,000원','고등영어D 600,000원']);
 const odd=view.institution('J10:202',{directoryItems:[{id:'J10:202',name:'학원U',institutionType:'학원',feeRaw:'월 25만원부터'}]});
 assert.match(odd.match(/data-research-item="fees"[\s\S]*?<\/div>/)[0],/월 25만원부터/);
 research.load(null);
});

test('all-empty research collapses to one line and uncertain branch values are shown weaker',()=>{
 research.load({items:[
  {id:'J10:203',added:false,checkedAt:'2026-10-12',status:'x',summary:'',cost:'',record:'',sources:[],sections:Object.fromEntries(['fees','schedule','program','levelTest','shuttle','method','trial'].map(k=>[k,{v:null,tag:'',more:[]}]))},
  {id:'J10:204',added:true,checkedAt:'2026-10-12',status:'x',summary:'',cost:'',record:'',sources:[],sections:{fees:{v:'영어 중등 월 130,000~357,000원',tag:'지점 확인 필요',more:['분당 몫인지 불명']},schedule:{v:'월수금',tag:'지점 공식',more:[]}}}]});
 const items=[{id:'J10:203',name:'학원V',institutionType:'학원',address:'경기도 성남시 분당구 A로 1'},{id:'J10:204',name:'학원W',institutionType:'학원'}];
 const empty=view.institution('J10:203',{directoryItems:items});
 assert.deepEqual([...empty.matchAll(/data-research-item="(\w+)"/g)].map(m=>m[1]),['none']);assert.match(empty,/<dt>조사 내용<\/dt><dd><span class="ei-kf-none">확인 안 됨/);assert.match(empty,/<dt>위치<\/dt>/);
 const weak=view.institution('J10:204',{directoryItems:items});
 assert.match(weak,/data-research-item="fees"><dt>수강료<\/dt><dd class="ei-kf-weak">영어 중등 월 130,000~357,000원<span class="ei-kf-tag ei-kf-doubt">지점 확인 필요/);
 assert.doesNotMatch(weak.match(/data-research-item="schedule"[\s\S]*?<\/div>/)[0],/ei-kf-weak/);
 research.load(null);
});

test('official site button sits under the contact row, opens in a new tab and accepts only http(s) URLs',()=>{
 const base={added:true,checkedAt:'2026-10-12',status:'x',summary:'',cost:'',record:'',sources:[],sections:{}};
 research.load({items:[{...base,id:'J10:301',site:{u:'https://blog.naver.com/abc',l:'운영자 블로그'}},{...base,id:'J10:302',site:{u:'javascript:alert(1)',l:'x'}},{...base,id:'J10:303'},{...base,id:'J10:304',site:{u:'https://a.example/x?a=1&b=2'}},{...base,id:'J10:305',site:{u:'https://a.example/',l:'공식 홈페이지'}},{...base,id:'J10:306',site:{u:'https://m.place.naver.com/place/1/home',l:'네이버 플레이스'}}]});
 const items=[301,302,303,304,305,306].map(n=>({id:'J10:'+n,name:'학원'+n,institutionType:'학원',phone:'031-111-2222'}));
 const ok=view.institution('J10:301',{directoryItems:items});
 assert.match(ok,/<a class="ei-site-btn" href="https:\/\/blog\.naver\.com\/abc" target="_blank" rel="noopener noreferrer">공식 사이트\(운영자 블로그\) 가기 ↗<\/a><\/div>/);
 assert.ok(ok.indexOf('data-contact="phone"')<ok.indexOf('ei-site-btn')&&ok.indexOf('ei-site-btn')<ok.indexOf('학원에 직접 문의'));
 for(const n of [302,303])assert.doesNotMatch(view.institution('J10:'+n,{directoryItems:items}),/ei-site-btn/);
 assert.match(view.institution('J10:304',{directoryItems:items}),/href="https:\/\/a\.example\/x\?a=1&amp;b=2"[^>]*>공식 사이트 가기 ↗/);
 assert.match(view.institution('J10:305',{directoryItems:items}),/>공식 사이트\(홈페이지\) 가기 ↗</);
 assert.match(view.institution('J10:306',{directoryItems:items}),/>공식 사이트\(네이버 플레이스\) 가기 ↗</);
 research.load(null);
});
