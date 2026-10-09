/* External references and choice criteria; no invented trend data or suitability ranking. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./education-reference.js'),require('./education-reference-view.js'),require('./education-interests.js'));else root.EducationInfo=factory(root.EducationReference,root.EducationReferenceView,root.EducationInterests);})(typeof window==='undefined'?globalThis:window,function(reference,referenceView,interests){
 'use strict';
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const CRITERIA=[['목표·대상','무엇을 배우고 어떤 경험을 하는가? 대상 학년과 실제 시작 수준은?'],['수업 방식','개별·그룹, 진도 방식, 활동·문제 풀이 비중은?'],['부담·흥미','숙제·가정 준비는 어느 정도인가? 아이가 어떻게 느끼는가?'],['피드백','무엇을 얼마나 자주 알려주는가? 실제 결과물도 확인 가능한가?'],['비용·시간','공개 교습비와 추가 비용은? 실제 수업 시간과 휴강 조건은?'],['이동·운영','정확한 지점·반, 위치·차량·운영시간은?'],['상담·체험','체험 가능 여부와 신청·취소 조건은?']];
 function summary(bank,subject){return [...new Set(bank.items.filter(i=>i.level==='reference'&&(!subject||i.subject===subject)).map(i=>i.subject+' · '+i.area))];}
 let stop=()=>{};
 function mount(host,opts){
  stop();let alive=true,tab='trend',chosenSubject=opts.subject||'국어',related='',relatedLoading=false,relatedError='',requestSequence=0;
  const cleanup=()=>{alive=false;host.onclick=null;host.onchange=null;host.oninput=null;};stop=cleanup;
  const localCatalogue=opts.provinceName==='경기도'&&/성남시/.test(opts.district||'');
  const referenceState={region:opts.provinceName==='경기도'?'gyeonggi':'national',grade:Number.isInteger(Number(opts.grade))&&Number(opts.grade)>=1&&Number(opts.grade)<=6?String(opts.grade):'',browse:'seongnam',subject:'',institutionType:'',district:'분당구',query:'',compared:[],notice:''};
  let storage;try{storage=opts.storage||globalThis.localStorage;}catch(e){}
  const saved=interests.read(storage,opts,id=>reference.institutions.some(i=>i.id===id)||/^J10:\d+$/.test(id));Object.assign(referenceState,{favorites:saved.ids,savedOnly:false,storageError:saved.error,showComparison:false});
  let programs=null,programLoading=false,programError='',programSequence=0;
  let listFilters=null;
  let directory=null,directoryLoading=false,directoryError='',directoryLimit=20,directorySequence=0;
  const bank=opts.bank||globalThis.LearningCheckBank;
  function render(){if(!alive||opts.isCurrent&&!opts.isCurrent()){host.innerHTML="";return;}
   const head=`<div class="ei-tabs" role="group" aria-label="교육정보 종류">${[['trend','또래·지역'],['choice','교육 선택']].map(([k,l])=>`<button type="button" data-ei="tab" data-tab="${k}" aria-pressed="${tab===k}">${l}</button>`).join('')}</div>`;
   let body='';
   if(tab==='child'){
    const preschool=opts.months<96;
    body=`<section class="ei-card lc-intro"><span class="lc-badge">${preschool?'경험과 선택':'우리 아이 기록 연결'}</span><h3>${preschool?(opts.months<72?'지금 필요한 경험부터 살펴봐요':'초등 준비와 지역 선택지를 살펴봐요'):'아이의 실제 답과 기록에서 시작해요'}</h3><p>${preschool?'놀이·언어·수 경험·사회적 경험을 중심으로 살펴봐요. 초등 학습 점검을 유아에게 적용하지 않아요.':'개인 점검과 결과는 성장기록에서 확인해요. 또래 참여량으로 아이의 이해도를 대신 판단하지 않아요.'}</p><div class="lc-actions"><button type="button" class="ei-primary" data-ei="history">우리 아이 성장기록 보기</button>${!preschool&&opts.months>=96?'<button type="button" class="lc-secondary ei-primary" data-ei="check">현재 상태 점검</button>':''}</div></section>${preschool?`<section class="ei-card"><h3>선택 전에 확인할 경험</h3><ul class="ei-option-list"><li>언어와 이야기, 책을 접하는 경험</li><li>놀이 속 수·모양·비교 경험</li><li>또래와 놀이하고 몸을 움직이는 경험</li><li>기관의 활동 방식·생활 리듬·이동 부담</li></ul><p class="lc-muted">발달·학습 평가 문항은 아닙니다. 연령별 판단 기준은 별도 교육적 검토가 필요해요.</p></section>`:`<section class="ei-card"><h3>${esc(chosenSubject)} 관련 참고 내용</h3><div class="lc-actions" role="group" aria-label="교육 참고 과목">${['국어','수학','사회','영어','과학'].map(s=>`<button type="button" class="lc-secondary" data-ei="subject" data-subject="${s}" aria-pressed="${s===chosenSubject}">${s}</button>`).join('')}</div><ul class="ei-option-list">${summary(bank,chosenSubject).map(x=>`<li>${esc(x)} <button type="button" class="lc-link" data-ei="related" data-topic="${esc(x)}">연결된 성장기록</button></li>`).join('')}</ul><p>교육부 2022 개정 3~4학년군 일부 기준을 참고한 초안이에요. 초3 학기별 배치·최신 개정 영향·교사 검토는 아직 완료되지 않았어요.</p><a href="${esc(bank.sourceUrl)}" target="_blank" rel="noopener noreferrer">교육부 기준 원문 ↗</a></section>`}<section class="ei-card"><h3>기록을 어떻게 참고하나요?</h3><p>부모 관찰, 교사 피드백, 실제 수행 자료는 출처와 맥락을 구분해서 보세요. 단일 기록이나 도움을 받은 사실만으로 부족·추가 교육 필요성을 정하지 않아요.</p><p>관련 기록이 확인되지 않으면 아이의 특징을 추정하지 않습니다. 자동 패턴·개인화 리포트는 아직 제공하지 않아요.</p></section>`;
   }else if(tab==='trend'){
    body=referenceView.trend(referenceState);
   }else{
    body=referenceView.choice(referenceState,{localCatalogue,directoryItems:[...(directory?.items||[]),...reference.institutions.filter(i=>referenceState.favorites.includes(i.id)&&!directory?.items.some(x=>x.id===i.id))],loading:directoryLoading,error:directoryError,limit:directoryLimit,canPlan:!!opts.canPlan&&typeof opts.onPlan==='function'});
   }
   if(tab==='choice'&&referenceState.publicOpen){const selected=globalThis.EducationPublicPrograms&&programs?globalThis.EducationPublicPrograms.select(programs.items,{grade:opts.grade,birthDate:opts.birthDate}):{items:[],uncertain:0};body+=`<section class="ei-card" role="region" aria-label="공공 프로그램"><h3>공공 프로그램</h3>${programLoading?'<p role="status">접수 기간과 대상 정보를 확인하고 있어요.</p>':''}${programError?`<p class="lc-error" role="alert">${esc(programError)}</p>`:''}${programs?`${selected.items.map(p=>`<article class="ei-program-row"><span class="lc-badge">${p.status==='open'?'접수 중':'접수 예정'}</span><h4>${esc(p.title)}</h4><p>${esc(p.provider)} · ${esc(p.target)}</p><p>접수 ${esc(p.registrationStart.slice(0,16).replace('T',' '))} ~ ${esc(p.registrationEnd.slice(0,16).replace('T',' '))}</p><a href="${esc(p.url)}" target="_blank" rel="noopener noreferrer">공식 신청 안내 ↗</a></article>`).join('')}${selected.items.length?'':(programs.coverage||[]).some(c=>['partial','ok'].includes(c.status))?'<p>확인된 자료에서 우리 아이에게 맞는 접수 중·예정 프로그램을 찾지 못했어요.</p>':'<p>접수 가능한 목록을 확인하지 못했어요. 프로그램이 없다는 뜻은 아니에요.</p>'}${selected.uncertain?'<p class="ei-brief-note">대상 연령·학년을 확정할 수 없는 항목은 표시하지 않았어요.</p>':''}<p class="ei-brief-note">확인 ${esc(programs.checkedAt.slice(0,10))}</p><ul class="ei-option-list">${(programs.coverage||[]).map(c=>`<li>${esc(c.name)}: ${c.status==='partial'?'일부 분야 확인':c.status==='failed'?'조회 실패':'조회 연결 준비 중'}</li>`).join('')}</ul>`:''}</section>`;}
   host.innerHTML=`<div class="ei-page">${head}${body}${relatedLoading?'<section class="ei-card" role="status">연결된 기록을 확인하고 있어요.</section>':related}${relatedError?`<p class="lc-error" role="alert">${esc(relatedError)}</p>`:''}</div>`;
  }
  async function loadDirectory(){if(directoryLoading)return;const seq=++directorySequence;directoryLoading=true;directoryError='';const cached=!opts.directoryReader&&globalThis.EducationDirectory?.peek?.();if(!cached)render();try{const data=cached||await (opts.directoryReader||globalThis.EducationDirectory?.read||(()=>Promise.reject(Error('not ready'))))();if(!alive||seq!==directorySequence||opts.isCurrent&&!opts.isCurrent())return;
   directory={...data,items:data.items.map(i=>{const rich=reference.institutions.find(x=>x.id===i.id);const district=['분당구','수정구','중원구'].find(g=>String(i.address||'').includes(g))||i.district||'';const course=[i.course,i.courseList].filter(Boolean).join(' ');const subject=rich?.subject||(/영어|외국어|실용외국어/.test(course)?'영어':/수학/.test(course)?'수학':/과학/.test(course)?'과학':/독서|논술|국어/.test(course)?'국어·독서':/미술|음악|피아노|예능/.test(course)?'미술·음악':/체육|태권도|줄넘기/.test(course)?'체육·줄넘기':course);const subjects=[['영어',/영어|외국어/],['수학',/수학/],['과학',/과학/],['국어·독서',/독서|논술|국어/],['미술·음악',/미술|음악|피아노|예능/],['체육·줄넘기',/체육|태권도|줄넘기/]].filter(([,pattern])=>pattern.test(course)).map(([name])=>name);return {...rich,...i,reviewEvidence:reference.reviewFor(i)||rich?.reviewEvidence,district,subject,subjects:[...new Set([subject,...subjects])]};})};
   if(!referenceState.district&&opts.dong){const dong=opts.dong.trim();const matches=[...new Set(directory.items.filter(i=>i.address.includes(dong)).map(i=>i.district).filter(Boolean))];if(matches.length===1)referenceState.district=matches[0];}directoryLimit=20;
  }catch(e){if(alive&&seq===directorySequence)directoryError=String(e.code||'').includes('failed-precondition')?'기관 조회 서버 설정을 확인 중이에요.':'기관 목록을 불러오지 못했어요. 잠시 후 다시 시도하세요.';}finally{if(alive&&seq===directorySequence){directoryLoading=false;render();}}}
  host.onclick=async e=>{const b=e.target.closest('[data-ei]');if(!b||!alive)return;if(opts.isCurrent&&!opts.isCurrent()){host.innerHTML='';return;}
   if(b.dataset.ei==='filter-region'){referenceState.regionOpen=!referenceState.regionOpen;render();}
   if(b.dataset.ei==='filter-subject'&&['','수학','영어','과학','국어·독서','미술·음악','체육·줄넘기'].includes(b.dataset.subject)){referenceState.subject=b.dataset.subject;directoryLimit=20;render();}
   if(b.dataset.ei==='filter-search'){referenceState.searchOpen=!referenceState.searchOpen;render();if(referenceState.searchOpen)host.querySelector('[data-ei-field="query"]')?.focus();}
   if(b.dataset.ei==='public-programs'){referenceState.publicOpen=!referenceState.publicOpen;if(!referenceState.publicOpen){render();return;}const seq=++programSequence;programLoading=true;programError='';render();try{const result=await (opts.programReader||globalThis.EducationDirectory?.readPrograms||(()=>Promise.reject(Error('not ready'))))();if(!alive||seq!==programSequence||opts.isCurrent&&!opts.isCurrent())return;programs=result;}catch(e){if(alive&&seq===programSequence)programError='공공 프로그램을 불러오지 못했어요. 로그인과 조회 서버를 확인해 주세요.';}finally{if(alive&&seq===programSequence){programLoading=false;render();}}}
   if(b.dataset.ei==='directory')await loadDirectory();
   if(b.dataset.ei==='directory-more'){directoryLimit+=20;render();}
   if(b.dataset.ei==='tab'){requestSequence++;relatedLoading=false;tab=['trend','choice'].includes(b.dataset.tab)?b.dataset.tab:'trend';referenceState.institution='';related='';relatedError='';render();if(tab==='choice'&&referenceState.browse==='seongnam'&&!directory&&!directoryLoading)await loadDirectory();}
   if(b.dataset.ei==='favorite'){const id=b.dataset.id;if(![...reference.institutions,...(directory?.items||[])].some(i=>i.id===id)||referenceState.storageError)return;const next=referenceState.favorites.includes(id)?referenceState.favorites.filter(x=>x!==id):referenceState.favorites.concat(id);try{interests.write(storage,opts,next);referenceState.favorites=next;referenceState.compared=referenceState.compared.filter(x=>next.includes(x));referenceState.notice='';if(referenceState.compared.length<2)referenceState.showComparison=false;}catch(err){referenceState.notice='관심 학원을 저장하지 못했어요. 저장 공간을 확인해 주세요.';}render();}
   if(b.dataset.ei==='collection'){const savedOnly=b.dataset.saved==='true';if(savedOnly&&!referenceState.savedOnly){listFilters={district:referenceState.district,subject:referenceState.subject,institutionType:referenceState.institutionType,query:referenceState.query};Object.assign(referenceState,{district:'',subject:'',institutionType:'',query:''});}else if(!savedOnly&&referenceState.savedOnly&&listFilters){Object.assign(referenceState,listFilters);listFilters=null;}Object.assign(referenceState,{savedOnly,browse:'seongnam',notice:'',showComparison:false,institution:''});directoryLimit=20;render();if(!directory&&!directoryLoading)await loadDirectory();}
   if(b.dataset.ei==='district'&&['','분당구','수정구','중원구'].includes(b.dataset.district)){referenceState.district=b.dataset.district;referenceState.browse='seongnam';directoryLimit=20;render();if(!directory&&!directoryLoading)await loadDirectory();}
   if(b.dataset.ei==='compare-select'){const id=b.dataset.id;if(!referenceState.favorites.includes(id))return;const next=interests.select(referenceState.compared,id);referenceState.compared=next.ids;referenceState.notice=next.error;referenceState.showComparison=false;render();}
   if(b.dataset.ei==='compare'){referenceState.showComparison=referenceState.compared.length>=2&&referenceState.compared.length<=3;render();host.querySelector('#ei-comparison')?.scrollIntoView({block:'start'});}
   if(b.dataset.ei==='subject'){requestSequence++;relatedLoading=false;chosenSubject=b.dataset.subject;related='';relatedError='';render();}
   if(b.dataset.ei==='institution'){if([...reference.institutions,...(directory?.items||[])].some(i=>i.id===b.dataset.id)){referenceState.institution=b.dataset.id;render();}}
   if(b.dataset.ei==='back-choice'){referenceState.institution='';render();}
   if(b.dataset.ei==='reset-filters'){Object.assign(referenceState,{subject:'',institutionType:'',district:'',query:'',notice:''});render();}
   if(b.dataset.ei==='plan'&&opts.canPlan){const draft=reference.plan(b.dataset.id,b.dataset.kind);if(draft)opts.onPlan?.(draft);}
   if(b.dataset.ei==='history')opts.onHistory?.();
   if(b.dataset.ei==='check')opts.onCheck?.();
   if(b.dataset.ei==='related'){
    if(relatedLoading)return;const request=++requestSequence;const topic=b.dataset.topic,ref='curriculum:MOE-2022-33:'+topic.replace(' · ',':');
    relatedLoading=true;relatedError='';related='';render();
    try{if(!opts.reader)throw Error('서버 연결을 확인한 뒤 관련 기록을 조회할 수 있어요. 성장기록 메뉴의 기기 기록은 그대로 볼 수 있어요.');
     const r=await opts.reader.related(opts.scope,{educationRef:ref});if(!alive||request!==requestSequence||opts.isCurrent&&!opts.isCurrent())return;
     if(r.status!=='ok'&&r.status!=='empty')throw Error(r.status==='permission_denied'?'기록 열람 권한을 확인해 주세요.':'관련 기록을 불러오지 못했어요. 기록이 없는 것으로 해석하지 않아요.');
     related=`<section class="ei-card"><h3>${esc(topic)} · 연결된 성장기록</h3>${r.items.length?`<ul class="ei-option-list">${r.items.map(x=>`<li>${esc(x.original.title)} · ${esc(x.original.date)}<br>원문과 출처는 성장기록에서 확인해요.</li>`).join('')}</ul>`:'<p>현재 이 주제에 명시적으로 연결된 기록이 없어요. 기존 기록 전체가 없다는 뜻은 아니에요. 제목·학원명만으로 자동 연결하지 않아요.</p>'}<button type="button" class="ei-primary" data-ei="history">성장기록 원문 보기</button></section>`;
    }catch(err){if(alive&&request===requestSequence)relatedError=err.message;}finally{if(request===requestSequence){relatedLoading=false;if(alive)render();}}
   }
  };
  host.onchange=e=>{
   if(!alive||opts.isCurrent&&!opts.isCurrent())return;
   const key=e.target.dataset.eiField;
   if(key==='collection'){referenceState.savedOnly=e.target.value==='saved';Object.assign(referenceState,{query:'',subject:'',district:'',notice:'',institution:'',showComparison:false,publicOpen:false});render();return;}
   if(!['region','grade','browse','subject','district','query','institutionType'].includes(key))return;
   referenceState[key]=e.target.value;referenceState.notice='';directoryLimit=20;render();if(key==='browse'&&referenceState.browse==='seongnam'&&!directory&&!directoryLoading)loadDirectory();
  };
  host.oninput=e=>{if(!alive||opts.isCurrent&&!opts.isCurrent()||e.target.dataset.eiField!=='query')return;const position=e.target.selectionStart;referenceState.query=e.target.value;render();const input=host.querySelector('[data-ei-field="query"]');if(input){input.focus();input.setSelectionRange(position,position);}};
  render();
  if(!opts.directoryReader&&globalThis.firebase?.auth().currentUser?.uid)globalThis.EducationDirectory?.read().catch(()=>{});
  return cleanup;
 }
 return {mount,summary,CRITERIA,unmount:()=>stop()};
});
