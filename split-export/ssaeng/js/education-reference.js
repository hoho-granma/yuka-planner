/* Curated research snapshot, not a live API or a complete local directory. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.EducationReference=factory();})(typeof window==='undefined'?globalThis:window,function(){
 'use strict';
 const checkedAt='2026-10-08',year=2025;
 const source=id=>'https://kosis.kr/statHtml/statHtml.do?orgId=101&tblId='+id;
 const sources={participation:source('DT_1PE107_1'),cost:source('DT_1PE105_1'),participantCost:source('DT_1PE109_1'),hours:source('DT_1PE103'),subjects:source('DT_1PE301')};
 // Only cells directly read in the research report. Never interpolate other provinces.
 const regions={
  national:{label:'전국',participation:[84.4,83.9,86.5,86.5,84.8,84.4,80.8],cost:[43.3,35.2,38.8,42.7,45.8,47.2,47.1],participantCost:[51.2,41.9,44.9,49.3,54.0,55.9,58.3]},
  gyeonggi:{label:'경기도',participation:[86.0,87.1,86.7,87.5,84.7,86.6,83.8],cost:[47.0,38.7,42.2,46.6,47.2,49.9,54.7],participantCost:[54.6,44.4,48.7,53.3,55.7,57.6,65.2]}
 };
 const subjects=[['국어',20.3],['영어',46.8],['수학',44.8],['사회·과학',8.9],['논술',15.5],['음악',29.0],['미술',16.6],['체육',50.8],['취미·교양',7.0]];
 const neis='https://open.neis.go.kr/portal/data/service/selectServicePage.do?infId=OPEN19220231012134453534385&infSeq=1';
 const institutions=[
  {id:'cms-bundang-sunae',name:'CMS 분당수내영재교육센터',subject:'수학',district:'분당구',address:'수내로46번길 12 코아빌딩 2층',target:'공식 안내: 초1~3·초4~6 입학전형',registration:'교육청 등록상태 미대조',course:'초등 수학 과정. 실제 반·레벨은 상담 확인',fee:'공식 규정의 과정별 금액은 실제 반·교재비를 포함한 총액과 다를 수 있어요.',hours:'수업 요일·시각 미확인',transport:'셔틀 안내 있음. 해당 반·정류장·시간 재확인',url:'https://creverse.com/mt/bundangsunae/curriculum/system/',links:[['교습 규정','https://creverse.com/mt/bundangsunae/introduction/rule'],['차량 안내','https://www.creverse.com/mt/bundangsunae/introduction/shuttle-bus/list']],mapping:'자체 등록번호 제5471호. 다른 주소의 CMS 수내영재관과 별개'},
  {id:'J10:3000050173',name:'April 분당수내 캠퍼스',registeredName:'분당수내청담에이프릴어학원',subject:'영어',district:'분당구',address:'수내로46번길 12 코아빌딩 5층',target:'공식 안내: 초등 영어 프로그램',registration:'나이스 개원 · 연계일 2026-09-06',course:'Seed·Sprout·Sapling 등. 학년으로 레벨 배정하지 않아요',fee:'공개 여부 Y이나 금액 빈 값. 실제 총액·추가비 확인 필요',hours:'수업 요일·시각 미확인',transport:'셔틀 메뉴 있음. 실제 노선·비용 미확인',url:'https://creverse.com/april/Bundang',links:[['교육청 등록정보',neis]],mapping:'등록명과 지점 주소·층 대조 후보. 홈페이지 등록번호 대응은 추가 확인'},
  {id:'J10:3000025694',name:'와이즈만 영재교육 분당센터',registeredName:'와이즈만영재교육분당센터학원',subject:'과학',district:'분당구',address:'백현로 97 다운타운 2층 203호',target:'2026-05-20 지점 안내: 초4·5 과학. 초3 반 미확인',registration:'나이스 개원 · 연계일 2026-09-06',course:'실험·탐구 과학 안내. 현재 모집 학년·반 확인 필요',fee:'공개 여부 Y이나 금액 빈 값. 실제 총액·추가비 확인 필요',hours:'수업 요일·시각 미확인',transport:'차량·체험 조건 미확인',url:'https://www.askwhy.co.kr/center_info/?bmode=view&idx=15264286',links:[['지점 상담','https://pf.kakao.com/_iIexgC'],['교육청 등록정보',neis]],mapping:'203호 등록 표본. 같은 건물 202호 영재입시센터와 별개'},
  {id:'J10:36022',name:'한우리국어야탑교습소',subject:'국어·독서',district:'분당구',address:'판교로 437 숭문상가 2층 203호',target:'교육청 과정목록: 국어 초등. 상세 학년 미확인',registration:'나이스 개원 · 연계일 2025-08-31',course:'국어 초등·중등 원문 과정',fee:'등록 원문: 국어 초등:57000, 국어 중등:100500. 기간·회차·추가비 미확인',hours:'수업 요일·시각 미확인',transport:'차량·상담·체험 조건 미확인',url:neis,links:[],mapping:'교육청 기관키 J10 / 36022'},
  {id:'J10:3000067743',name:'한우리금광동논술교습소',subject:'국어·독서',district:'중원구',address:'광명로395번길 7 (금광동, 현대아파트)',target:'등록 비용 문자열: 초등심화·초등논술. 상세 학년 미확인',registration:'나이스 개원 · 연계일 2024-03-03',course:'대표 과정은 중등논술. 초등 과정은 별도 확인',fee:'등록 원문: 초등심화:150000, 초등논술:130000, 중등논술:190000. 기간·회차·추가비 미확인',hours:'수업 요일·시각 미확인',transport:'차량·상담·체험 조건 미확인',url:neis,links:[],mapping:'교육청 기관키 J10 / 3000067743. 상세 호수 확인 필요'}
 ];
 // Brief paraphrases from directly inspected public reviews; never infer missing opinions or grade-specific outcomes.
 const reviewEvidence={
  'J10:3000025694':{checkedAt:'2026-10-09',sourceName:'오늘학교 아카데미',sourceKind:'수강 후기',url:'https://academy.prompie.com/academies/detail/w5l8l1b/와이즈만영재교육분당센터학원/',matchedName:'와이즈만영재교육분당센터학원',matchedAddress:'경기 성남시 분당구 백현로 97',opinions:[
   {kind:'positive',text:'과학 실험을 즐기면서 진학 준비도 할 수 있었다는 학부모 의견이 있어요.',context:'초5 · 창의융합과학 · 학부모 · 2025년'},
   {kind:'positive',text:'학습 수준에 맞게 가르쳐 준다는 학생 의견도 있어요.',context:'중1 · 과학 · 학생 · 2025년'},
   {kind:'consideration',text:'다른 실험 중심 기관에 비해 교과·교육 중심으로 느꼈다는 의견도 있어요.',context:'초5 · 창의융합과학 · 학부모 · 2025년'}
  ]}
 };
 for(const i of institutions){if(reviewEvidence[i.id])i.reviewEvidence=reviewEvidence[i.id];}
 const catalogueReviews=[{name:'정법수학학원',street:'구미로 100',checkedAt:'2026-10-09',sourceName:'분당맘스쿨',sourceKind:'맘카페 후기',url:'https://cafe.naver.com/bundangchild/13422',matchedName:'정법수학학원',matchedAddress:'경기도 성남시 분당구 구미로 100',note:'2021년 과거 수강 경험 · 현재 운영과 상세 호수는 다시 확인해 주세요.',opinions:[
  {kind:'positive',text:'자기주도학습을 할 수 있는 환경과 동기부여가 좋았다는 의견이 있어요.',context:'중3·중1 수강 경험 · 2021-07-31'},
  {kind:'consideration',text:'시설이 오래된 느낌이고 학부모 대상의 개별 상담·성적 안내는 자주 받지 못했다는 의견도 있어요.',context:'중3·중1 수강 경험 · 2021-07-31'}
 ]}];
 function reviewFor(i){if(!i||i.institutionType==='교습소')return null;const name=String(i.registeredName||i.name||'').replace(/\s/g,'');const address=String(i.address||'');return catalogueReviews.find(r=>r.name.replace(/\s/g,'')===name&&address.includes('분당구')&&new RegExp(r.street.replace(' ','\\s*')+'(?![0-9-])').test(address))||null;}
 // Discovery links only: no expired offering, seat count or unconfirmed price is republished.
 const publicLinks=[
  {name:'경기도교육청성남도서관',topic:'독서·도서관 프로그램',url:'https://lib.goe.go.kr/sn/module/teach/index.do?menu_idx=142&search_large_code=54',note:'조사한 겨울 독서교실은 종료됐어요. 새 공고에서 대상·비용·접수를 확인하세요.'},
  {name:'성남아트센터',topic:'미술·음악 등 강좌',url:'https://www.snart.or.kr/main/education/list.do',note:'조사한 미술 강좌는 초1~2 대상이며 중간등록 조건이 있어요. 현재 접수 가능 여부를 확인하세요.'},
  {name:'판교환경생태학습원',topic:'과학·생태 체험',url:'https://ppark.seongnam.go.kr:10013/program_list',note:'초등 대상 프로그램 안내가 있어요. 현재 일정·비용·장소·신청 조건은 원문에서 확인하세요.'},
  {name:'성남시청소년재단',topic:'체육·줄넘기 등 강좌',url:'https://www.snyouth.or.kr/',note:'조사한 음악줄넘기 강좌는 마감 상태였어요. 다음 회차는 공식 사이트에서 확인하세요.'}
 ];
 function statistics(region,grade){const r=regions[region];if(!r||!Number.isInteger(grade)||grade<1||grade>6)return null;return {region:r.label,grade,year,checkedAt,participation:r.participation[grade],cost:r.cost[grade],participantCost:r.participantCost[grade],sources};}
 function search({subject='',district='',query=''}={}){const q=String(query).trim().toLowerCase();return institutions.filter(i=>(!subject||i.subject===subject)&&(!district||i.district===district)&&(!q||[i.name,i.registeredName,i.address].filter(Boolean).join(' ').toLowerCase().includes(q)));}
 function plan(id,kind){const i=institutions.find(x=>x.id===id);if(!i||!['상담','체험 확인'].includes(kind))return null;return {title:i.name+' · '+kind,location:'성남시 '+i.district+' '+i.address,memo:('확인할 것: 대상 학년·반, 수업 요일·시간, 교재·재료·차량을 포함한 총액, 체험 가능 여부와 비용.\n공식 안내: '+i.url+'\n자료 확인: '+checkedAt+' (현재 조건 재확인 필요)').slice(0,500)};}
 return {checkedAt,year,sources,regions,subjects,institutions,publicLinks,statistics,search,plan,reviewFor};
});
