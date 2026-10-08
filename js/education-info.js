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
  const localCatalogue=opts.provinceName==='경기도'&&opts.district==='성남시';
  const referenceState={region:opts.provinceName==='경기도'?'gyeonggi':'national',grade:'',browse:localCatalogue?'seongnam':'',subject:'',district:'',query:'',compared:[],notice:''};
  let storage;try{storage=opts.storage||globalThis.localStorage;}catch(e){}
  const saved=interests.read(storage,opts,reference.institutions.map(i=>i.id));Object.assign(referenceState,{favorites:saved.ids,savedOnly:false,storageError:saved.error,showComparison:false});
  const bank=opts.bank||globalThis.LearningCheckBank;
  function render(){if(!alive||opts.isCurrent&&!opts.isCurrent()){host.innerHTML="";return;}
   const head=`<div class="ei-head"><p class="lc-kicker">${esc(opts.name)} · ${esc(opts.region||'지역 미확인')} · ${esc(opts.ageLabel||'')}</p><h2>교육정보</h2></div><div class="ei-tabs" role="group" aria-label="교육정보 종류">${[['trend','또래·지역'],['choice','교육 선택']].map(([k,l])=>`<button type="button" data-ei="tab" data-tab="${k}" aria-pressed="${tab===k}">${l}</button>`).join('')}</div>`;
   let body='';
   if(tab==='child'){
    const preschool=opts.months<96;
    body=`<section class="ei-card lc-intro"><span class="lc-badge">${preschool?'경험과 선택':'우리 아이 기록 연결'}</span><h3>${preschool?(opts.months<72?'지금 필요한 경험부터 살펴봐요':'초등 준비와 지역 선택지를 살펴봐요'):'아이의 실제 답과 기록에서 시작해요'}</h3><p>${preschool?'놀이·언어·수 경험·사회적 경험을 중심으로 살펴봐요. 초등 학습 점검을 유아에게 적용하지 않아요.':'개인 점검과 결과는 성장기록에서 확인해요. 또래 참여량으로 아이의 이해도를 대신 판단하지 않아요.'}</p><div class="lc-actions"><button type="button" class="ei-primary" data-ei="history">우리 아이 성장기록 보기</button>${!preschool&&opts.months>=96?'<button type="button" class="lc-secondary ei-primary" data-ei="check">현재 상태 점검</button>':''}</div></section>${preschool?`<section class="ei-card"><h3>선택 전에 확인할 경험</h3><ul class="ei-option-list"><li>언어와 이야기, 책을 접하는 경험</li><li>놀이 속 수·모양·비교 경험</li><li>또래와 놀이하고 몸을 움직이는 경험</li><li>기관의 활동 방식·생활 리듬·이동 부담</li></ul><p class="lc-muted">발달·학습 평가 문항은 아닙니다. 연령별 판단 기준은 별도 교육적 검토가 필요해요.</p></section>`:`<section class="ei-card"><h3>${esc(chosenSubject)} 관련 참고 내용</h3><div class="lc-actions" role="group" aria-label="교육 참고 과목">${['국어','수학','사회','영어','과학'].map(s=>`<button type="button" class="lc-secondary" data-ei="subject" data-subject="${s}" aria-pressed="${s===chosenSubject}">${s}</button>`).join('')}</div><ul class="ei-option-list">${summary(bank,chosenSubject).map(x=>`<li>${esc(x)} <button type="button" class="lc-link" data-ei="related" data-topic="${esc(x)}">연결된 성장기록</button></li>`).join('')}</ul><p>교육부 2022 개정 3~4학년군 일부 기준을 참고한 초안이에요. 초3 학기별 배치·최신 개정 영향·교사 검토는 아직 완료되지 않았어요.</p><a href="${esc(bank.sourceUrl)}" target="_blank" rel="noopener noreferrer">교육부 기준 원문 ↗</a></section>`}<section class="ei-card"><h3>기록을 어떻게 참고하나요?</h3><p>부모 관찰, 교사 피드백, 실제 수행 자료는 출처와 맥락을 구분해서 보세요. 단일 기록이나 도움을 받은 사실만으로 부족·추가 교육 필요성을 정하지 않아요.</p><p>관련 기록이 확인되지 않으면 아이의 특징을 추정하지 않습니다. 자동 패턴·개인화 리포트는 아직 제공하지 않아요.</p></section>`;
   }else if(tab==='trend'){
    body=referenceView.trend(referenceState);
   }else{
    body=referenceView.choice(referenceState,{localCatalogue,canPlan:!!opts.canPlan&&typeof opts.onPlan==='function'});
   }
   host.innerHTML=`<div class="ei-page">${head}${body}${relatedLoading?'<section class="ei-card" role="status">연결된 기록을 확인하고 있어요.</section>':related}${relatedError?`<p class="lc-error" role="alert">${esc(relatedError)}</p>`:''}<details class="ei-legacy"><summary>현재 등록한 교육 일정·기존 안내 보기</summary>${opts.legacy||''}</details></div>`;
  }
  host.onclick=async e=>{const b=e.target.closest('[data-ei]');if(!b||!alive)return;if(opts.isCurrent&&!opts.isCurrent()){host.innerHTML='';return;}
   if(b.dataset.ei==='tab'){requestSequence++;relatedLoading=false;tab=['trend','choice'].includes(b.dataset.tab)?b.dataset.tab:'trend';referenceState.institution='';related='';relatedError='';render();}
   if(b.dataset.ei==='favorite'){const id=b.dataset.id;if(!reference.institutions.some(i=>i.id===id)||referenceState.storageError)return;const next=referenceState.favorites.includes(id)?referenceState.favorites.filter(x=>x!==id):referenceState.favorites.concat(id);try{interests.write(storage,opts,next);referenceState.favorites=next;referenceState.compared=referenceState.compared.filter(x=>next.includes(x));referenceState.notice='';if(referenceState.compared.length<2)referenceState.showComparison=false;}catch(err){referenceState.notice='관심 학원을 저장하지 못했어요. 저장 공간을 확인해 주세요.';}render();}
   if(b.dataset.ei==='collection'){referenceState.savedOnly=b.dataset.saved==='true';Object.assign(referenceState,{query:'',subject:'',district:'',notice:''});if(referenceState.savedOnly)referenceState.browse='seongnam';referenceState.showComparison=false;referenceState.institution='';render();}
   if(b.dataset.ei==='compare-select'){const id=b.dataset.id;if(!referenceState.favorites.includes(id))return;const next=interests.select(referenceState.compared,id);referenceState.compared=next.ids;referenceState.notice=next.error;referenceState.showComparison=false;render();}
   if(b.dataset.ei==='compare'){referenceState.showComparison=referenceState.compared.length>=2&&referenceState.compared.length<=3;render();host.querySelector('#ei-comparison')?.scrollIntoView({block:'start'});}
   if(b.dataset.ei==='subject'){requestSequence++;relatedLoading=false;chosenSubject=b.dataset.subject;related='';relatedError='';render();}
   if(b.dataset.ei==='institution'){if(reference.institutions.some(i=>i.id===b.dataset.id)){referenceState.institution=b.dataset.id;render();}}
   if(b.dataset.ei==='back-choice'){referenceState.institution='';render();}
   if(b.dataset.ei==='reset-filters'){Object.assign(referenceState,{subject:'',district:'',query:'',notice:''});render();}
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
   if(!['region','grade','browse','subject','district','query'].includes(key))return;
   referenceState[key]=e.target.value;referenceState.notice='';render();
  };
  host.oninput=e=>{if(!alive||opts.isCurrent&&!opts.isCurrent()||e.target.dataset.eiField!=='query')return;const position=e.target.selectionStart;referenceState.query=e.target.value;render();const input=host.querySelector('[data-ei-field="query"]');if(input){input.focus();input.setSelectionRange(position,position);}};
  render();return cleanup;
 }
 return {mount,summary,CRITERIA,unmount:()=>stop()};
});
