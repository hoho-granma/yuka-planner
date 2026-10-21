'use strict';
// 실제 DOM·CSS에서 연령 경계/아이 교체/접기/메뉴/홈 순서를 검사한다. 서버 자료는 읽지 않는다.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
const app=read('js/app.js'),index=read('index.html');
const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
if(!fs.existsSync(chrome)){console.log('SKIP: Chrome 없음');process.exit(0);}
const fn=name=>{const found=app.match(new RegExp('  function '+name+'\\([^]*?\\n  \\}'));assert(found,name);return found[0];};
const home=app.match(/  renderHome=function\(\)\{\n[\s\S]*?\n  \};/)[0];
const checklist=app.match(/  renderChecklistTab=function\(\)\{\n[\s\S]*?\n  \};/)[0];
const tasks=app.match(/  function charTodoSection\(home\)\{[^\n]+/)[0];
const checklistMarkup=index.slice(index.indexOf('      <div id="tab-checklist"'),index.indexOf('      <!-- 어디갈까'));
const nav=index.match(/<nav class="bottom-nav"[\s\S]*?<\/nav>/)[0];
const css=[...index.matchAll(/<link rel="stylesheet" href="(css\/[^"?]+)/g)].map(m=>`<link rel="stylesheet" href="file://${path.join(root,m[1])}">`).join('');
const script=`
const checks=[];function check(ok,label){if(!ok)throw Error(label);checks.push(label);}
const el=id=>document.getElementById(id),esc=s=>String(s??''),acctEnabled=()=>true,usActive=()=>true;
let months=4,pregnant=false,profile={name:'은찬',birthDate:'2026-06-20'},familyCode='baby',currentTab='subsidy',hnTodoHideDone=false;
const acct36Active=()=>months>=36,ChildTimeline={completedMonths:()=>months,OVER36_FROM_MONTHS:36},isPregnant=()=>pregnant;
const kids=[{code:'baby',name:'은찬',current:true},{code:'older',name:'수아',current:false}];
let roster=kids;const acctHomeChildren=()=>roster,childDisplayName=()=>profile.name,tcbAgeText=()=>'',charTodoRows=()=>'';
const updateBrandText=()=>{},charHeader=()=>{};
const charHomeBase=()=>{el('home-body').innerHTML='<section class="card hn-schedules"><h3>가족 캘린더</h3></section><div class="home-child-chips">옛 아이 선택</div>';};
const charChecklistBase=()=>{el('list-checklist').innerHTML='<div class="month-group-card">월령별 체크리스트</div>';};
let renderHome,renderChecklistTab;
${fn('acct36Sync')}
${fn('infantChecklistActive')}
${app.match(/  const placesHiddenNow = .*;/)[0]}
${fn('growthActive')}
${fn('applyTabLayout')}
${fn('syncHomeChildPicker')}
${tasks}
${home}
${checklist}
try{
for(const width of [320,390,768]){
document.querySelector('#fixture').style.width=width+'px';
for(const age of [4,35,36,96,4]){
months=age;profile=age<36?{name:'은찬',birthDate:'2026-06-20'}:{name:'수아',birthDate:'2018-06-20'};familyCode=age<36?'baby':'older';
kids.forEach(k=>k.current=k.code===familyCode);roster=kids;
acct36Sync();applyTabLayout();renderChecklistTab();renderHome();
const menus=[...document.querySelectorAll('.nav-item')].filter(n=>getComputedStyle(n).display!=='none');
check(menus.length===5,'5개 고정 메뉴 '+age+'/'+width);
check(menus.map(n=>n.dataset.nav).join(',')==='home,calendar,checklist,subsidy,places','메뉴 순서');
check(menus[2].textContent.trim()==='할일','할일 이름');
check(currentTab==='subsidy','36개월 이상도 혜택 화면 유지');
const details=el('hn-age-checklist'),task=el('hn-family-tasks-tab');
check(details.hidden===(age>=36),'체크리스트는 36개월 미만만');
check((getComputedStyle(details).display==='none')===(age>=36),'실제 체크리스트 노출 조건');
if(age<36){
check(!details.open,'아이 교체 후 기본 접힘');
check(task.compareDocumentPosition(details)&Node.DOCUMENT_POSITION_FOLLOWING,'챙길 것 아래 체크리스트');
check(Math.abs(task.getBoundingClientRect().width-details.getBoundingClientRect().width)<1,'카드 너비 동일');
details.querySelector('summary').click();check(details.open,'체크리스트 펼치기');
check(getComputedStyle(el('status-filter-checklist')).display!=='none','상태 탭 표시');
renderChecklistTab();check(details.open,'다시 그릴 때 펼침 유지');details.querySelector('summary').click();
}
const picker=el('home-body').querySelector('.home-child-chips'),calendar=el('home-body').querySelector('.hn-schedules');
check(picker&&picker===el('home-body').firstElementChild,'아이 선택은 항상 홈 맨 위');
check(picker.getBoundingClientRect().bottom<=calendar.getBoundingClientRect().top,'아이 선택이 가족 캘린더 위');
check(picker.querySelectorAll('[data-home-child]').length===2,'두 아이 선택');
check(el('home-body').querySelectorAll('#hn-family-tasks').length===1,'모든 나이에서 가족 할일 표시');
const tokens=getComputedStyle(document.body);check(tokens.getPropertyValue('--k-bn')!==tokens.getPropertyValue('--k-hc'),'검진과 혜택 색 구분');
roster=[kids[0]];renderHome();check(!el('home-body').querySelector('.home-child-chips'),'아이가 한 명이면 선택 숨김');
}
}
profile=null;renderChecklistTab();check(el('hn-age-checklist').hidden,'아이 삭제 후 체크리스트 숨김');
document.body.insertAdjacentHTML('afterbegin','<pre id="result">PASS '+checks.length+'</pre>');
}catch(e){document.body.insertAdjacentHTML('afterbegin','<pre id="result">FAIL '+e.message+'</pre>');}
`;
const html='<!doctype html><meta charset="utf-8">'+css+'<body class="acct-design theme-warm"><main id="fixture"><div id="home-body"></div>'+checklistMarkup.replace('tab-panel hidden','tab-panel')+nav+'</main><script>'+read('js/tab-child-bar.js')+'</script><script>'+script+'</script>';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hannun-menu-')),file=path.join(dir,'fixture.html');fs.writeFileSync(file,html);
const out=cp.execFileSync(chrome,['--headless=new','--disable-gpu','--user-data-dir='+path.join(dir,'chrome'),'--virtual-time-budget=3000','--dump-dom','file://'+file],{encoding:'utf8',stdio:['ignore','pipe','ignore']});
const result=out.match(/<pre id="result">([^<]*)<\/pre>/)?.[1];assert(result?.startsWith('PASS'),result||'검사 결과 없음');console.log('고정 메뉴·체크리스트·아이 선택 회귀 검사: '+result);
