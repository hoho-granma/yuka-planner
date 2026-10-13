/* One growth tree; paper checks and history use the existing record editor/backend. */
(function(root){'use strict';let cleanup=()=>{};
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const subjects=['국어','수학','사회','영어','과학'];
 root.GrowthLearningView={mount(host,opts){cleanup();let alive=true,statusOpen=opts.initialView==='check',infoOpen=false,subject='수학';
 const current=()=>alive&&(!opts.isCurrent||opts.isCurrent());
 function extras(container,state){if(!current())return;
  const box=document.createElement('div');box.className='gr-connected';
  const referenceAvailable=opts.grade===3;const grade=opts.grade>=1&&opts.grade<=6?`${opts.grade}학년 ${opts.semester||1}학기`:'학년 미확인';
  // These are labelled answer records, not objective measurements or level results.
  const history=state.records.filter(r=>r.group==='home'&&r.activity===subject+' 교과 이해 확인');
  const done=subjects.filter(s=>state.records.some(r=>r.group==='home'&&r.activity===s+' 교과 이해 확인'));
  const gradeText=opts.grade>=1&&opts.grade<=6?`${opts.grade}학년 ${opts.semester||1}학기`:'학년 미확인';
  const segs=subjects.map(s=>`<div class="${done.includes(s)?'on':''}"><i></i>${s}</div>`).join('');
  box.innerHTML=`<button type="button" class="gr-diag" data-growth-status aria-expanded="${statusOpen}"><span class="gr-diag-head"><b>${esc(gradeText)} 진단</b><span>${state.loading?'확인 중…':`<b>${done.length}/${subjects.length}</b> 완료`} ${statusOpen?'⌄':'›'}</span></span><span class="gr-diag-segs">${segs}</span></button>${statusOpen?`<section class="lc-card gr-check"><div class="lc-row"><h3>교과 이해 확인</h3><span class="lc-muted">${esc(grade)}</span></div>${referenceAvailable?`<div class="lc-actions gr-subjects">${subjects.map(s=>`<button type="button" class="lc-secondary" data-growth-subject="${s}" aria-pressed="${s===subject}">${s}</button>`).join('')}</div><p class="lc-muted" role="status">${state.loading?'기록 확인 중…':state.failed?'기록 조회 실패 · 측정이력 유무를 확인할 수 없습니다.':history.length?`${subject} 답안 기록 ${history.length}건 · 최근 ${esc(history[0].date)} (수준 판정 아님)`:'기존 측정이력이 없습니다.'}</p><div class="lc-actions gr-check-actions"><button type="button" class="lc-primary" data-growth-paper>문제지 보기/인쇄</button><button type="button" class="lc-secondary" data-growth-curriculum>학기별 배우는 내용</button><button type="button" class="lc-secondary" data-gr-paper-record="${subject}"${state.loading||state.failed?' disabled':''}>결과 등록</button></div>`:'<p class="lc-muted">현재 준비된 문항은 초3 참고용입니다. 이 학년의 문항은 검토 후 제공해요.</p>'}</section>`:''}`;
  container.querySelector('.gr-folder').before(box);
  box.querySelector('[data-growth-status]').onclick=()=>{statusOpen=!statusOpen;box.remove();extras(container,state);};
  const pageUrl=(file,query)=>{const base=new URL("../",document.querySelector('script[src*="growth-learning-view.js"]').src);return new URL(file,base).href+query;};
  box.querySelector('[data-growth-paper]')?.addEventListener('click',()=>{const url=pageUrl("learning-check-paper.html","?subject="+encodeURIComponent(subject));opts.onOpenPaper?opts.onOpenPaper(subject,url):window.open(url,"_blank","noopener");});
  box.querySelector('[data-growth-curriculum]')?.addEventListener('click',()=>{const url=pageUrl("curriculum-map.html","?grade="+(opts.grade>=1&&opts.grade<=6?opts.grade:3)+"&term="+(opts.semester||2));opts.onOpenCurriculum?opts.onOpenCurriculum(url):window.open(url,"_blank","noopener");});
  box.querySelectorAll('[data-growth-subject]').forEach(b=>b.onclick=()=>{subject=b.dataset.growthSubject;box.remove();extras(container,state);});
 }
 root.GrowthRecords.mount(host,{...opts,compact:true,onRendered:extras});
 cleanup=()=>{alive=false;root.GrowthRecords.unmount?.();host.innerHTML='';};return cleanup;
 },unmount(){cleanup();}};
})(window);
