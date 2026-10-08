const {test}=require('node:test');
const assert=require('node:assert/strict');
const R=require('../js/education-reference');
const V=require('../js/education-reference-view');
const E=require('../js/education-info');

test('verified cells preserve geography, year and denominator-specific costs',()=>{
  const s=R.statistics('gyeonggi',3);
  assert.equal(s.region,'경기도');assert.equal(s.year,2025);
  assert.deepEqual([s.participation,s.cost,s.participantCost],[87.5,46.6,53.3]);
  for(const region of ['seongnam','guro','seoul'])assert.equal(R.statistics(region,3),null);
  for(const grade of [0,7,3.5,NaN])assert.equal(R.statistics('national',grade),null);
  const html=V.trend({region:'gyeonggi',grade:'3'});
  assert.match(html,/미참여 포함/);assert.match(html,/사교육 참여학생 1명당/);
  assert.match(html,/위에서 고른 지역·학년의 시간이 아닙니다/);
  assert.doesNotMatch(V.trend({region:'national',grade:''}),/class="ei-metric"/);
});

test('catalogue filters never turn missing samples into absence of institutions',()=>{
  assert.equal(R.search().length,5);
  assert.equal(R.search({district:'중원구'}).length,1);
  assert.equal(R.search({query:'분당수내청담'}).length,1);
  const html=V.choice({browse:'seongnam',subject:'미술·음악',compared:[],query:'<img src=x onerror=alert(1)>'},{localCatalogue:false});
  assert.match(html,/기관이 없다는 뜻은 아니에요/);
  assert.match(html,/&lt;img/);assert.doesNotMatch(html,/<img src=x/);
  assert.match(html,/현재 신청 가능한 강좌 목록은 아닙니다/);
  assert.match(V.comparison(['J10:36022','J10:3000067743']),/기간·회차·추가비 미확인/);
});

test('drafts carry source questions but no invented booking date or course enrollment',()=>{
  const d=R.plan('J10:3000050173','상담');
  assert.match(d.title,/상담/);assert.match(d.memo,/공식 안내/);
  assert.equal(d.eventDate,undefined);assert.equal(d.startTime,undefined);
  assert.equal(R.plan('unknown','상담'),null);assert.equal(R.plan('J10:36022','등록'),null);
});

test('compact two tabs, institution details, child switches and disposal guard actions',async()=>{
  const host={innerHTML:''};let current=true,plans=[];
  const dispose=E.mount(host,{name:'은찬',months:3,provinceName:'서울특별시',district:'구로구',canPlan:true,isCurrent:()=>current,onPlan:d=>plans.push(d)});
  const click=data=>host.onclick({target:{closest:()=>({dataset:data})}});
  await click({ei:'tab',tab:'choice'});
  host.onchange({target:{dataset:{eiField:'browse'},value:'seongnam'}});
  assert.doesNotMatch(host.innerHTML,/比較|비교 담기|관심 분야로 후보 찾기/);
  assert.match(host.innerHTML,/ei-institution-row/);
  await click({ei:'institution',id:R.institutions[0].id});
  assert.match(host.innerHTML,/상담에서 확인할 것/);
  await click({ei:'back-choice'});assert.match(host.innerHTML,/ei-institution-row/);
  await click({ei:'plan',id:R.institutions[0].id,kind:'상담'});assert.equal(plans.length,1);
  current=false;await click({ei:'plan',id:R.institutions[0].id,kind:'상담'});assert.equal(plans.length,1);
  dispose();assert.equal(host.onclick,null);assert.equal(host.onchange,null);assert.equal(host.oninput,null);
  const next={innerHTML:''};E.mount(next,{name:'은찬',months:3,provinceName:'서울특별시',district:'구로구'});
  dispose();assert.equal(typeof next.onclick,'function');E.unmount();
});
