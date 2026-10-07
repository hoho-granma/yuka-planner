/* Draft-only tone controls. They change both preview frames, never stored family data. */
const palettes = [
 {id:'orange',name:'오렌지 차콜',bg:'#f4f3f1',ink:'#24252a',accent:'#b84c15',soft:'#ffe2d0',family:'#8e532f',labels:['#99512e','#657442','#587393','#825f94','#a14f65','#686662']},
 {id:'cobalt',name:'코발트 블루',bg:'#f2f5fa',ink:'#243047',accent:'#2457bd',soft:'#e2ebfc',family:'#41649b',labels:['#41649b','#34777f','#6960a3','#a0663c','#4e785a','#737079']},
 {id:'sand',name:'샌드 베이지',bg:'#f6f2ec',ink:'#322d27',accent:'#86623e',soft:'#ede1d0',family:'#94714f',labels:['#86623e','#79754a','#617e78','#8d607d','#a3634e','#736b61']},
 {id:'forest',name:'딥 포레스트',bg:'#f1f5f0',ink:'#24342b',accent:'#246449',soft:'#deece2',family:'#50785d',labels:['#246449','#657440','#457c87','#8c6750','#7b618a','#6c726d']},
 {id:'olive',name:'올리브 크림',bg:'#f6f5ed',ink:'#303229',accent:'#66713b',soft:'#e9ecd7',family:'#7a794d',labels:['#66713b','#957348','#52817b','#8c6476','#687399','#727267']},
 {id:'teal',name:'틸 미스트',bg:'#f0f5f5',ink:'#27383b',accent:'#246c75',soft:'#daecec',family:'#477d83',labels:['#246c75','#537aa0','#75814c','#9a6b46','#8b6080','#6d777b']},
 {id:'lavender',name:'라벤더 그레이',bg:'#f4f2f7',ink:'#302c3c',accent:'#715697',soft:'#e9e1f3',family:'#86709b',labels:['#715697','#54759c','#4f827b','#98704c','#a05f79','#77717f']},
 {id:'rose',name:'로즈 클레이',bg:'#f8f2f2',ink:'#3c2e33',accent:'#9e4e65',soft:'#f2e0e6',family:'#a46c79',labels:['#9e4e65','#a2714c','#6b7e58','#507c8b','#84669e','#817176']},
 {id:'navy',name:'네이비 아이보리',bg:'#f5f4ef',ink:'#283147',accent:'#34496f',soft:'#e3e8f1',family:'#566b8d',labels:['#34496f','#3c7b81','#74744c','#97664c','#80648a','#6d7380']},
 {id:'mocha',name:'모카 브라운',bg:'#f5f1ee',ink:'#352c29',accent:'#76564b',soft:'#eee1db',family:'#94756a',labels:['#76564b','#977347','#687852','#537d8b','#8f6484','#78706b']}
];
const slots = [['background','전체 배경'],['buttons','버튼·선택 탭'],['family','가족명'],['calendar','캘린더 선택 테두리'],['labels','카테고리 뱃지'],['growth','성장기록 버튼'],['benefits','혜택 탭·전국 표시']];
let choices=Object.fromEntries(slots.map(([id])=>[id,'lavender']));
try{const saved=localStorage.getItem('hn_review_tag_palette');if(palettes.some(p=>p.id===saved))choices.labels=saved;}catch{}
const palette=id=>palettes.find(p=>p.id===id)||palettes[0];
const controls=document.getElementById('tone-controls');
const tagNames=['어스 멀티','블루 밸런스','베이지 믹스','포레스트 믹스','올리브 포인트','틸 조화','라벤더 믹스','로즈 포인트','네이비 클래식','모카 믹스'];
controls.innerHTML='<h2>글자·표시 색상</h2><p>공통 톤과 태그 색상은 확정된 라벤더 믹스입니다.</p><p id="tone-summary" hidden></p>';
choices.labels='lavender';
const vividPalettes=[
{id:'vivid-primary',name:'선명한 기본',labels:['#2455d6','#9138c8','#158454','#a86505','#d12c63','#6550c7']},
{id:'vivid-jewel',name:'보석 포인트',labels:['#5441ce','#a82985','#087c85','#b55b09','#c93245','#287144']},
{id:'vivid-pop',name:'컬러 팝',labels:['#1764ce','#ba2874','#008367','#a76a00','#ce3b30','#7942bd']},
{id:'vivid-deep',name:'딥 브라이트',labels:['#3346bf','#a135c0','#147747','#b9560a','#b72759','#146e97']},
{id:'vivid-candy',name:'캔디 포인트',labels:['#6748ce','#d1256c','#18814d','#ae6500','#d43e35','#256fc3']}
];palettes.push(...vividPalettes);
choices.labels='vivid-pop';
const pastels=[
{id:'pastel-lavender',name:'라벤더 파스텔',labels:['#d9cdef','#cadcf0','#c9e4d7','#efddba','#f0ccdc','#d8d4e4']},
{id:'pastel-mint',name:'민트 브리즈',labels:['#bfe1d7','#c6dced','#d9cfee','#ecd8bd','#efcfd6','#d5dfe0']},
{id:'pastel-peach',name:'피치 크림',labels:['#efd0bf','#e6d8b6','#cbded4','#cbd9ed','#e4cbe1','#ddd4cd']},
{id:'pastel-sky',name:'스카이 소프트',labels:['#c4daef','#c9e2e1','#d9ceec','#eed6bc','#edccda','#d0d8e4']},
{id:'pastel-rose',name:'로즈 블룸',labels:['#ecc8d7','#e7cde4','#cddcef','#cee2d1','#eedcbe','#dcd0da']},
{id:'pastel-sand',name:'샌드 가든',labels:['#e7d6be','#dbdfc0','#c6ded5','#cbd7e7','#e4cddb','#d9d2c6']}
];palettes.push(...pastels);
const pastelChoices={bars:'pastel-lavender',entry:'pastel-lavender',steps:'pastel-sand'};

controls.innerHTML=`<h2>파스텔 색상 6개</h2><p>공통 톤: 라벤더 그레이 · 카테고리: 컬러팝<br>홈 글자색은 확정값을 유지합니다.</p>${[['bars','달력 카테고리 막대'],['entry','일정·할일 입력 태그'],['steps','신청·공식 사이트 버튼']].map(([id,name])=>`<label>${name}<select data-pastel="${id}" style="display:block;width:100%;margin:6px 0 16px">${pastels.map(p=>`<option value="${p.id}" ${pastelChoices[id]===p.id?'selected':''}>${p.name}</option>`).join('')}</select></label>`).join('')}<div style="display:grid;gap:8px">${pastels.map(p=>`<div>${p.name}<span style="display:flex;gap:3px">${p.labels.map(c=>`<i style="width:22px;height:12px;background:${c};border-radius:3px"></i>`).join('')}</span></div>`).join('')}</div>`;
controls.addEventListener('change',e=>{const key=e.target.dataset.pastel;if(!key)return;pastelChoices[key]=e.target.value;try{localStorage.setItem('hn_review_pastels',JSON.stringify(pastelChoices));}catch{}refresh();});
const textChoice={'home-date':'#a5524a','home-time':'#655f70','house-name':'#715697','auto-badge':'#715697','calendar-time':'#715697'};
try{const previous=JSON.parse(localStorage.getItem('hn_review_text_colors')||'{}');if(previous['auto-badge'])textChoice['auto-badge']=previous['auto-badge'];if(previous['calendar-time'])textChoice['calendar-time']=previous['calendar-time'];}catch{}
const previewDocs = new Map();
function colors(d){
 const bg=palette(choices.background),button=palette(choices.buttons),family=palette(choices.family),calendar=palette(choices.calendar),growth=palette(choices.growth),benefits=palette(choices.benefits);
 let style=d.getElementById('review-tones');if(!style){style=d.createElement('style');style.id='review-tones';d.head.append(style);}
 const css=`body{--hn-auto-color:${textChoice['auto-badge']};--hn-house-color:${textChoice['house-name']};--hn-home-date-color:${textChoice['home-date']};--hn-home-time-color:${textChoice['home-time']};--hn-calendar-time-color:${textChoice['calendar-time']}}body,body.acct-design,body.theme-forest{--bg:${bg.bg};--text:${bg.ink};--c-ink:${bg.ink};--nd-home-bg:${bg.bg};--nd-ink:${bg.ink};--card-bg:#fff;--surface:#fff;--nd-soft:${growth.soft};--nd-soft2:${growth.soft};--c-badge-nation:${benefits.soft};--c-badge-nation-ink:${benefits.accent};--c-badge-region:${benefits.soft};--c-badge-region-ink:${benefits.accent};--accent-soft:${button.soft};--accent:${button.accent};--accent-dark:${button.accent};--c-active:${button.accent};--c-primary:${button.accent};--c-primary-ink:#fff;--on-accent:#fff;--c-link:${button.accent};--c-select:${calendar.accent};--c-select-border:${calendar.accent};background:${bg.bg}!important;color:${bg.ink}}body.theme-forest #view-calendar,#view-calendar,body.theme-forest .app-header,.app-header{background:${bg.bg}!important}#brand-text{color:${bg.ink}!important}#brand-text .hn-house-name{color:${textChoice['house-name']}!important}.hn-people .on .hn-face{outline-color:${calendar.accent}}.hn-text-link{color:${button.accent}}body.acct-design #subsidy-seg .seg-tab.active,body.acct-design #subsidy-scope .scope-chip.active{background:${button.accent};border-color:${button.accent};color:#fff}.hn-category{background:var(--review-category)!important;color:#fff}.tab-btn.active,.nav-tab.active{color:${button.accent}}
.gr-home-link{background:${growth.soft}!important;border-color:${growth.accent}!important;color:${growth.accent}!important}.gr-home-link strong{color:${growth.accent}!important}.gr-home-link small{color:${bg.ink}!important}
#subsidy-seg .seg-tab,#subsidy-scope .scope-chip{color:#24252a!important;background:#f5eee3!important;border-color:#e1d3bd!important}
#subsidy-seg .seg-tab.active,#subsidy-scope .scope-chip.active{background:#e7d6be!important;color:#24252a!important;border-color:#d7c3a5!important}
#subsidy-seg .seg-tab.active .seg-n{color:#24252a!important;background:#e3d4be!important}
.prov-tag.prov-nation,.prov-tag.prov-region{background:${benefits.soft}!important;color:${benefits.accent}!important}
`;
 if(style.textContent!==css)style.textContent=css;
 const labels=palette(choices.labels).labels;
 const semantic=['접종','검진','발달','생활','안전','혜택','자동','직접','전국','지역','학교','학원','병원','놀이','기타'];
 const roots=d.querySelectorAll('body');roots.forEach(n=>['vx','hc','dv','lf','sf','bn'].forEach((key,i)=>n.style.setProperty('--k-'+key,labels[i])));
 d.querySelectorAll('.cat-chip,.hn-category,.cat-badge,.prov-tag,.scope-tag,.us-src-auto,.us-src-user,.hn-categories button,.hn-schedule-category').forEach(n=>{
  const name=(n.dataset.cat||n.textContent).trim();let index=semantic.findIndex(t=>name.includes(t));if(index<0){index=0;for(const c of name)index=(index+c.charCodeAt(0))%labels.length;}const color=labels[index%labels.length];
  n.style.setProperty('--cat',color);n.style.setProperty('--category',color);n.style.setProperty('--review-category',color);
  const selectable=n.matches('.cat-chip,.hn-categories button,.hn-schedule-category'),active=n.classList.contains('active')||n.classList.contains('on')||n.getAttribute('aria-pressed')==='true';
  n.style.setProperty('background',selectable&&!active?'transparent':color,'important');n.style.setProperty('color',selectable&&!active?color:'#fff','important');n.style.setProperty('border-color',color,'important');
 });
 d.querySelectorAll('.hn-entry .hn-categories').forEach(group=>group.querySelectorAll('button').forEach((n,i)=>{const color=palette(pastelChoices.entry).labels[i%6],active=n.classList.contains('on')||n.classList.contains('active');n.style.setProperty('--category',color);n.style.setProperty('background',active?color:'transparent','important');n.style.setProperty('color',active?'#40374b':'#665873','important');n.style.setProperty('border-color',color,'important');}));

 d.querySelectorAll('.hn-category-bar').forEach(n=>{const key=n.dataset.hnCategory,keys=['INSTITUTION','LESSON','MEDICAL','FAMILY','ETC'],i=Math.max(0,keys.indexOf(key));n.style.setProperty('background',palette(pastelChoices.bars).labels[i%6],'important');});
 const step=palette(pastelChoices.steps);d.body.style.setProperty('--hn-step-bg',step.labels[0]);d.body.style.setProperty('--hn-step-border',step.labels[1]);d.body.style.setProperty('--hn-step-ink','#50435f');

}
function refresh(){for(const d of previewDocs.values())colors(d);}

for(const frame of document.querySelectorAll('iframe'))frame.addEventListener('load',()=>{
 const d=frame.contentDocument,style=d.createElement('link');style.rel='stylesheet';style.href='design-previews/production-review/approved-theme.css?v=18';d.head.append(style);previewDocs.set(frame.id,d);
 const apply=()=>{
  const brand=d.getElementById('brand-text');if(brand&&!brand.querySelector('.hn-house-name')){const text=brand.textContent,split=text.indexOf(' – ');if(split>=0){brand.replaceChildren(d.createTextNode(text.slice(0,split)+' '));const family=d.createElement('span');family.className='hn-house-name';family.textContent='– '+text.slice(split+3);brand.append(family);}}
  const date=d.querySelector('.hn-home-date-label')||d.querySelector('.hn-home-date');if(date&&date.textContent.includes(' 오늘 일정'))date.textContent=date.textContent.replace(' 오늘 일정','');
  const view=d.getElementById('view-calendar'),active=view&&!view.classList.contains('hidden');const message=active?'실제 앱 데이터로 렌더링 · 프로필에서 대상 아이 확인':'로그인하면 실제 가족 정보와 일정이 표시됩니다';const state=document.getElementById('state-'+frame.id);if(state.textContent!==message)state.textContent=message;colors(d);
 };
 new MutationObserver(apply).observe(d.body,{subtree:true,childList:true});apply();refresh();
});
refresh();
