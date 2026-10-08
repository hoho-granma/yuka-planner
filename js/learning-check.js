/* Child-scoped local evidence. Descriptive checks, never a standardized diagnosis. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.LearningCheck=factory();})(typeof window==='undefined'?globalThis:window,function(){
 'use strict';
 const SUBJECTS=['국어','수학','사회','영어','과학'];
 const HELP=['혼자 수행','문제만 읽어줌','단어 뜻 설명','풀이 도움','답 보고 다시 수행'];
 const CONTEXT=['normal','new','language','unknown'];
 const OBS=['supported','uncertain','not-yet'];
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function identity(opts){return JSON.stringify([opts.scope,opts.familyId||'local']);}
 function result(items,answers){
  const relevant=items.filter(i=>i.level==='reference');
  const areas=[...new Set(relevant.map(i=>i.area))].map(area=>{
   const qs=relevant.filter(i=>i.area===area),seen=qs.map(i=>({item:i,answer:answers[i.id]})).filter(x=>x.answer);
   let status=seen.length?'check_more':'not_checked';
   const independent=seen.filter(x=>x.answer.context==='normal'&&x.answer.help===HELP[0]&&x.answer.observation==='supported'&&!x.answer.rehearsal&&x.answer.itemVersion===x.item.itemVersion&&x.answer.curriculumVersion===x.item.curriculumVersion);
   if(independent.length>=2&&seen.length===qs.length)status='observed';
   if(seen.length&&seen.every(x=>x.answer.context==='new'))status='new';
   if(seen.length&&seen.every(x=>x.answer.context==='language'))status='language';
   return {area,status,label:LABELS[status],seen,independent:independent.length};
  });
  return {areas,answered:relevant.filter(i=>answers[i.id]).length,total:relevant.length};
 }
 const LABELS={not_checked:'아직 확인하지 않음',check_more:'조금 더 확인',observed:'이번 두 문항에서 확인',new:'처음 접한 내용',language:'문장·용어 확인 필요'};
 function normalizeAnswer(input,item,now){
  const response=String(input.response||'').trim(),reason=String(input.reason||'').trim();
  if(response.length>2000||reason.length>2000)throw Error('답과 설명은 각각 2,000자 이내로 남겨 주세요.');
  if(!CONTEXT.includes(input.context)||!HELP.includes(input.help)||!OBS.includes(input.observation))throw Error('답안 확인 내용을 골라 주세요.');
  if(input.context==='normal'&&!response)throw Error('아이의 답을 남기거나 모름·처음 보는 내용을 선택해 주세요.');
  return {response,reason,context:input.context,help:input.help,observation:input.observation,rehearsal:!!input.rehearsal,itemVersion:item.itemVersion,curriculumVersion:item.curriculumVersion,answeredAt:now,recordedAt:now,performedAt:null,performanceStatus:input.context==='normal'?'parent-reported':'unconfirmed',itemSnapshot:{id:item.id,subject:item.subject,area:item.area,prompt:item.prompt,expected:item.expected,observe:item.observe,standardCodes:[...(item.standardCodes||[])],sourceUrl:item.sourceUrl},authorRole:'parent-recorder',performerRole:'child',evidenceKind:'performed-response-with-parent-observation',educationRefs:[{id:'curriculum:'+item.curriculumVersion+':'+item.subject+':'+item.area,version:item.itemVersion}],previous:input.previous||null};
 }
 function openStore(){return new Promise((resolve,reject)=>{const r=indexedDB.open('hannun-learning-checks',1);r.onupgradeneeded=()=>r.result.createObjectStore('checks',{keyPath:'key'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
 async function stored(key,write){const db=await openStore();try{return await new Promise((resolve,reject)=>{const tx=db.transaction('checks',write?'readwrite':'readonly'),store=tx.objectStore('checks');let value,problem;const r=store.get(key);r.onsuccess=()=>{value=r.result;if(write){if((value?.revision||0)!==(write.revision||1)-1){problem=Error('다른 탭에서 점검 기록이 바뀌었어요. 다시 불러온 뒤 이어해 주세요.');tx.abort();return;}store.put(write);value=write;}};tx.oncomplete=()=>resolve(value);tx.onerror=tx.onabort=()=>reject(problem||tx.error||Error('기기 저장 실패'));});}finally{db.close();}}

 const copy=x=>JSON.parse(JSON.stringify(x));
 let dispose=()=>{};
 function mount(host,opts){
  dispose();let alive=true,screen='overview',subject='',index=0,mode='reference',revealed=false,state=null,firstDraft=null,error='',busy=false,loading=true;
  const bank=opts.bank||globalThis.LearningCheckBank,key=identity(opts),storage=opts.storage||stored;
  dispose=()=>{alive=false;host.onclick=null;host.oninput=null;host.onsubmit=null;};
  const valid=()=>{const ok=alive&&(!opts.isCurrent||opts.isCurrent());if(!ok&&alive)host.innerHTML="";return ok;};
  const items=()=>bank.items.filter(i=>i.subject===subject&&i.level===mode);
  const refs=s=>bank.items.filter(i=>i.subject===s&&i.level==='reference');
  const stats=s=>result(refs(s),state.answers);
  function header(title,back){return `<div class="lc-head">${back?'<button type="button" class="lc-link" data-lc="overview">← 과목 목록</button>':''}<p class="lc-kicker">${esc(opts.name)} · 현재 상태 점검</p><h2>${esc(title)}</h2></div>`;}
  function criteria(){return `<details class="lc-details"><summary>참고 기준과 점검 범위</summary><p>${esc(bank.referenceScope)}</p><p>직접 만든 부분 점검 문항입니다. 교사 검토·초3 교과서 배치 대조는 진행 전입니다. 전범위·학년 수준·현재 학교 진도를 판정하지 않아요.</p><p>기초 문항도 이전 학년 판정에 사용하지 않아요. 영어 듣기·말하기와 과목별 미점검 영역이 있어요.</p><a href="${esc(bank.sourceUrl)}" target="_blank" rel="noopener noreferrer">교육부 원문 보기 ↗</a></details>`;}
  function footer(){return `<p class="lc-storage">답안은 이 기기에 아이별로 저장돼요. 가족·다른 기기와 자동 공유되지 않아요. 기기 데이터 삭제 시 사라질 수 있어요.</p>${error?`<p class="lc-error" role="alert">${esc(error)}</p><button type="button" class="lc-link" data-lc="reload">점검 기록 다시 불러오기</button>`:''}`;}
  function render(){
   if(!valid()){host.innerHTML='';return;}
   if(loading){host.innerHTML='<div class="lc-card" role="status">점검 기록을 불러오는 중이에요.</div>';return;}
   if(!state){host.innerHTML=`<div class="lc-card"><p role="alert">점검 기록을 불러오지 못했어요. 기존 기록을 덮어쓰지 않았어요.</p><button data-lc="reload">다시 시도</button></div>`;return;}
   const errorMarkup=footer();
   if(screen==='overview'){
    host.innerHTML=`<div class="lc-page">${header('우리 아이, 지금 어떤 내용을 이해할까?')}<div class="lc-tabs"><button type="button" aria-pressed="true">현재 상태 점검</button><button type="button" data-lc="history">성장 이력</button></div><section class="lc-card lc-intro"><span class="lc-badge">부분 점검 · 테스트용</span><h3>공립 초3 교과 참고 내용 살펴보기</h3><p>교과서를 몰라도 시작할 수 있어요. 한 과목씩 아이가 풀고, 답과 도움 조건을 함께 확인해요.</p><p class="lc-muted">현재 학년을 자동 확정하지 않아요. 이번 문항은 초3 후보·3~4학년군 일부 내용입니다.</p></section><div class="lc-subjects">${SUBJECTS.map((s,n)=>{const r=stats(s);return `<section class="lc-card lc-subject"><span class="lc-number">0${n+1}</span><div><h3>${s}</h3><p>${r.answered?`${r.answered}/${r.total}응답 저장 · 부분 점검`:'아직 점검하지 않았어요'}</p></div><div class="lc-actions"><button type="button" data-lc="${r.answered===r.total?'result':'start'}" data-subject="${s}">${r.answered===r.total?'결과 보기':r.answered?'이어하기':'시작'}</button>${r.answered&&r.answered<r.total?`<button type="button" class="lc-link" data-lc="result" data-subject="${s}">결과</button>`:''}</div></section>`;}).join('')}</div>${criteria()}<div class="lc-actions"><button type="button" class="lc-secondary" data-lc="education">관련 교육정보 보기</button>${Object.keys(state.answers).length?'<button type="button" class="lc-secondary" data-lc="export">답안 내려받기</button>':''}</div>${errorMarkup}</div>`;
   }else if(screen==='question'){
    const qs=items(),q=qs[index],a=state.answers[q.id]||(typeof state.disclosed[q.id]==='object'?state.disclosed[q.id]:null);
    host.innerHTML=`<div class="lc-page">${header(subject+' · '+(mode==='reference'?'참고 내용 점검':'기초 내용 재확인'),true)}<div class="lc-progress" aria-label="${index+1}/${qs.length}문항"><span style="width:${(index+1)/qs.length*100}%"></span></div><section class="lc-card"><div class="lc-row"><span class="lc-badge">${esc(q.area)}</span><span>${index+1} / ${qs.length}</span></div><h3 class="lc-prompt">${esc(q.prompt).replace(/\n/g,'<br>')}</h3><form id="lc-answer"><label>아이의 답<textarea name="response" maxlength="2000" placeholder="아이가 쓴 답 또는 말한 내용을 그대로 남겨요.">${esc(a?.response||'')}</textarea></label><label>풀이·이유 <span class="lc-muted">선택</span><textarea name="reason" maxlength="2000" placeholder="어떻게 생각했는지 짧게 남겨요.">${esc(a?.reason||'')}</textarea></label><label>이번 내용은<select name="context">${[['normal','답을 해봤어요'],['new','처음 보는 내용이에요'],['language','문장·용어 뜻이 어려워요'],['unknown','잘 모르겠어요']].map(([v,l])=>`<option value="${v}"${a?.context===v?' selected':''}>${l}</option>`).join('')}</select></label><details class="lc-details"${a&&a.help!==HELP[0]?' open':''}><summary>도움을 줬다면 표시하기</summary><label>수행 조건<select name="help">${HELP.map(h=>`<option${a?.help===h?' selected':''}>${h}</option>`).join('')}</select></label></details><button type="button" class="lc-primary" data-lc="reveal">${revealed?'답안 확인 기준 열림':'답을 남기고 확인 기준 보기'}</button><div id="lc-rubric">${revealed?`<div class="lc-rubric"><h4>부모가 답을 확인하는 기준</h4><p>${esc(q.expected)}</p><p class="lc-muted">${esc(q.observe)}</p>${q.exactAnswer?`<p>계산 답 참고: ${esc(q.exactAnswer)}. 숫자가 같아도 풀이 이해를 확정하지 않아요.</p>`:''}<label>답과 설명을 비교하면<select name="observation"><option value="uncertain">설명·맥락을 조금 더 확인해야 해요</option><option value="supported"${a?.observation==='supported'?' selected':''}>이 문항의 답과 이유를 확인했어요</option><option value="not-yet"${a?.observation==='not-yet'?' selected':''}>이번에는 확인하지 못했어요</option></select></label><p class="lc-muted">부모의 확인이며 객관적인 검사 결과가 아니에요.</p><button type="submit" class="lc-primary" ${busy?'disabled':''}>${busy?'저장 중…':'이 답안 저장하고 다음'}</button></div>`:''}</div></form><div class="lc-actions">${index?'<button type="button" class="lc-link" data-lc="prev">← 이전 문항</button>':''}<button type="button" class="lc-link" data-lc="skip">건너뛰기</button><button type="button" class="lc-link" data-lc="result" data-subject="${subject}">여기까지 결과 보기</button></div><p class="lc-muted">정답을 본 뒤 다시 수행한 답은 연습으로 구분해요.</p></section>${errorMarkup}</div>`;
   }else{
    const r=stats(subject);
    host.innerHTML=`<div class="lc-page">${header(subject+' 점검 결과',true)}<section class="lc-card lc-intro"><span class="lc-badge">점검한 문항에 한정</span><h3>${r.answered?'이번 답안에서 확인한 내용을 정리했어요':'아직 결과를 해석할 답안이 없어요'}</h3><p>초3 전체 이해도나 학년 수준은 판단하지 않아요. 답안과 부모의 확인, 도움 조건을 근거로 표시해요.</p></section>${r.areas.map(a=>`<section class="lc-card"><div class="lc-row"><h3>${esc(a.area)}</h3><span class="lc-badge">${LABELS[a.status]}</span></div><p>${a.status==='observed'?'같은 영역의 두 문항에서 혼자 답과 이유를 설명한 것으로 부모가 확인했어요. 다른 상황의 이해나 숙달까지 확정하지 않아요.':a.status==='new'?'접한 경험이 없어 현재 이해를 판단하지 않아요.':a.status==='language'?'문장·용어의 어려움과 교과 이해를 분리해 다시 확인할 수 있어요.':a.status==='not_checked'?'이 영역에 저장된 응답이 없어요.':'단일 답·도움·서로 다른 응답만으로 이해 부족을 판단하지 않아요. 다른 예에서 다시 확인할 수 있어요.'}</p><details class="lc-details"><summary>근거 답안 ${a.seen.length}건 보기</summary>${a.seen.map(({item:q,answer:x})=>`<div class="lc-evidence"><b>${esc(x.itemSnapshot?.prompt||q.prompt)}</b><p>아이 답: ${esc(x.response||'응답 없음')}</p><p>설명: ${esc(x.reason||'남기지 않음')}</p><p>맥락: ${esc({normal:'답을 해봄',new:'처음 접함',language:'문장·용어 어려움',unknown:'모름'}[x.context])} · ${esc(x.help)}${x.rehearsal?' · 답안 확인 후 재수행':''}</p><p>부모 확인: ${esc({supported:'이 문항의 답과 이유 확인',uncertain:'추가 확인 필요','not-yet':'이번에는 확인하지 못함'}[x.observation])}</p><small>답안 기록 ${esc(new Date(x.answeredAt).toLocaleString('ko-KR'))} · 문항 ${esc(x.itemVersion)} · ${esc(x.curriculumVersion)}</small>${x.itemVersion!==q.itemVersion||x.curriculumVersion!==q.curriculumVersion?'<p class="lc-muted">문항·기준 버전이 달라 현재 기준으로 재확인이 필요해요.</p>':''}<button type="button" class="lc-link" data-lc="review" data-id="${esc(q.id)}">답안 다시 보기</button></div>`).join('')||'<p>아직 저장된 답안이 없어요.</p>'}</details><button type="button" class="lc-link" data-lc="area" data-area="${esc(a.area)}">이 영역 다시 확인</button></section>`).join('')}<section class="lc-card"><h3>아직 확인하지 않은 것</h3><p>${esc({국어:'듣기·말하기, 실제 읽기 수행, 다양한 글과 쓰기 전반',수학:'도형·측정·자료와 가능성, 다른 단원의 개념',사회:'다른 지역·역사·생활 주제와 실제 자료 탐구',영어:'실제 듣기·발음·말하기, 다양한 낱말과 문장',과학:'실제 실험·관찰 수행, 다른 탐구 주제'}[subject])}</p><p>기초 내용은 선택해서 확인할 수 있어요. 이전 학년 수준을 정하는 검사는 아니에요.</p><button type="button" class="lc-secondary" data-lc="foundation">기초 내용부터 확인</button>${bank.items.filter(q=>q.subject===subject&&q.level==='foundation'&&state.answers[q.id]).map(q=>{const x=state.answers[q.id];return `<details class="lc-details"><summary>기초 재확인 답안 보기 · ${esc(q.area)}</summary><p>아이 답: ${esc(x.response||'응답 없음')}</p><p>설명: ${esc(x.reason||'남기지 않음')}</p><p>${esc(x.help)}${x.rehearsal?' · 연습 응답':''}</p><p>부모 확인: ${esc({supported:'이 문항의 답과 이유 확인',uncertain:'추가 확인 필요','not-yet':'이번에는 확인하지 못함'}[x.observation])}</p><p>이 답은 참고 내용의 결과나 학년 판정을 대신하지 않아요.</p><button type="button" class="lc-link" data-lc="review" data-id="${esc(q.id)}">기초 답안 다시 보기</button></details>`;}).join('')}</section><div class="lc-actions"><button type="button" class="lc-primary" data-lc="education">관련 교육정보 보기</button><button type="button" class="lc-secondary" data-lc="export">답안 내려받기</button></div>${criteria()}${errorMarkup}</div>`;
   }
   host.querySelector('h2')?.setAttribute('tabindex','-1');
  }
  function draft(form){const d=new FormData(form);return {response:d.get('response'),reason:d.get('reason'),context:d.get('context'),help:d.get('help'),observation:d.get('observation')||'uncertain'};}
  async function load(){loading=true;render();try{const value=await storage(key);if(!valid())return;state=value||{key,schemaVersion:1,bankVersion:bank.version,interpretationVersion:bank.interpretationVersion,referencePurpose:'public-school-reference-readiness',scope:opts.scope,familyId:opts.familyId||null,answers:{},attempts:{},disclosed:{},revision:0,createdAt:Date.now(),updatedAt:Date.now()};if(state.schemaVersion!==1||state.key!==key||state.scope!==opts.scope||!state.answers||!state.disclosed)throw Error('저장 형식 확인 필요');if(!state.attempts)state.attempts={};error='';}catch(e){state=null;error=e.message;}loading=false;render();}
  host.onclick=async e=>{
   const b=e.target.closest('[data-lc]');if(!b||!valid()||busy)return;const action=b.dataset.lc;
   if(action==='history'){opts.onHistory?.();return;}
   if(action==='education'){opts.onEducation?.(subject);return;}
   if(action==='reload'){load();return;}
   if(action==='overview'){screen='overview';subject='';error='';render();return;}
   if(action==='start'){subject=b.dataset.subject;mode='reference';const qs=items();index=Math.max(0,qs.findIndex(i=>!state.answers[i.id]));screen='question';revealed=false;firstDraft=null;error='';render();return;}
   if(action==='result'){subject=b.dataset.subject;screen='result';error='';render();return;}
   if(action==='foundation'){mode='foundation';index=0;screen='question';revealed=false;firstDraft=null;render();return;}
   if(action==='area'){mode='reference';index=items().findIndex(i=>i.area===b.dataset.area);screen='question';revealed=false;firstDraft=null;render();return;}
   if(action==='review'){mode=bank.items.find(i=>i.id===b.dataset.id)?.level||'reference';index=items().findIndex(i=>i.id===b.dataset.id);screen='question';revealed=false;firstDraft=null;render();return;}
   if(action==='prev'||action==='skip'){index+=action==='prev'?-1:1;revealed=false;error='';if(index>=items().length)screen='result';render();return;}
   if(action==='export'){
    const json=JSON.stringify({...state,exportedAt:Date.now(),childName:opts.name,bankVersion:bank.version,items:bank.items.filter(i=>state.answers[i.id])},null,2);
    let panel=host.querySelector('.lc-export');if(!panel){panel=document.createElement('section');panel.className='lc-card lc-export';host.querySelector('.lc-page').append(panel);}
    panel.innerHTML=`<h3>답안 보관</h3><p>파일 내려받기가 시작돼요. 저장되지 않으면 아래 원문을 복사해 별도로 보관할 수 있어요.</p><label>구조화 답안 원문<textarea readonly rows="6">${esc(json)}</textarea></label>`;
    const blob=new Blob([json],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='교과-부분점검-답안.json';a.hidden=true;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);panel.scrollIntoView({block:'start'});return;
   }

   if(action==='reveal'){
    if(revealed)return;
    const form=host.querySelector('form'),d=draft(form),q=items()[index];
    try{normalizeAnswer(d,q,Date.now());busy=true;const next=copy(state);firstDraft=state.disclosed[q.id]?null:copy(d);next.disclosed[q.id]=state.disclosed[q.id]||{...normalizeAnswer(d,q,Date.now()),disclosedAt:Date.now()};next.updatedAt=Date.now();next.revision=(state.revision||0)+1;await storage(key,next);if(!valid())return;state=next;revealed=true;busy=false;error='';const values=d;render();const f=host.querySelector('form');f.elements.response.value=values.response;f.elements.reason.value=values.reason;f.elements.context.value=values.context;f.elements.help.value=values.help;}
    catch(err){error=err.message;const errorNode=document.createElement('p');errorNode.className='lc-error';errorNode.setAttribute('role','alert');errorNode.textContent=error;form.append(errorNode);const retry=document.createElement('button');retry.type='button';retry.className='lc-link';retry.dataset.lc='reload';retry.textContent='점검 기록 다시 불러오기';form.append(retry);}finally{busy=false;}
   }
  };
  host.onsubmit=async e=>{
   e.preventDefault();if(!valid()||busy||!revealed)return;const q=items()[index],d=draft(e.target),old=state.answers[q.id];
   try{busy=true;const next=copy(state);if(old){const previousId=old.attemptId||'legacy_'+q.id+'_'+old.answeredAt;next.attempts[previousId]=copy(old);}next.answers[q.id]=normalizeAnswer({...d,rehearsal:!!old||!firstDraft||d.response!==firstDraft.response||d.reason!==firstDraft.reason||d.help!==firstDraft.help||d.context!==firstDraft.context||d.help===HELP[4],previous:old?{attemptId:old.attemptId||'legacy_'+q.id+'_'+old.answeredAt}:null},q,Date.now());next.answers[q.id].attemptId=globalThis.crypto?.randomUUID?.()||'attempt_'+Date.now()+'_'+Math.random().toString(36).slice(2);next.answers[q.id].recordedByScope=opts.scope;next.attempts[next.answers[q.id].attemptId]=copy(next.answers[q.id]);next.updatedAt=Date.now();next.bankVersion=bank.version;next.revision=(state.revision||0)+1;await storage(key,next);if(!valid())return;state=next;index++;revealed=false;error='';if(index>=items().length)screen='result';}
   catch(err){error=err.message;const p=document.createElement('p');p.className='lc-error';p.setAttribute('role','alert');p.textContent=error;e.target.append(p);const retry=document.createElement('button');retry.type='button';retry.className='lc-link';retry.dataset.lc='reload';retry.textContent='점검 기록 다시 불러오기';e.target.append(retry);return;}finally{busy=false;}
   render();host.querySelector('h2')?.focus({preventScroll:true});
  };
  load();return ()=>{if(alive)dispose();};
 }
 return {SUBJECTS,HELP,identity,result,normalizeAnswer,mount,unmount:()=>dispose()};
});
