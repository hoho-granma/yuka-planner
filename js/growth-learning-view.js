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
  box.innerHTML=`<button type="button" class="gr-disclosure" data-growth-status aria-expanded="${statusOpen}">현재 상태 확인 <span>${statusOpen?'⌄':'›'}</span></button>${statusOpen?`<section class="lc-card gr-check"><div class="lc-row"><h3>교과 이해 확인</h3><span class="lc-muted">${esc(grade)}</span></div>${referenceAvailable?`<div class="lc-actions gr-subjects">${subjects.map(s=>`<button type="button" class="lc-secondary" data-growth-subject="${s}" aria-pressed="${s===subject}">${s}</button>`).join('')}</div><p class="lc-muted" role="status">${state.loading?'기록 확인 중…':state.failed?'기록 조회 실패 · 측정이력 유무를 확인할 수 없습니다.':history.length?`${subject} 답안 기록 ${history.length}건 · 최근 ${esc(history[0].date)} (수준 판정 아님)`:'기존 측정이력이 없습니다.'}</p><div class="lc-actions"><a class="lc-primary" href="${esc(new URL("learning-check-paper.html",new URL("../",document.querySelector('script[src*="growth-learning-view.js"]').src)).href)}?subject=${encodeURIComponent(subject)}" target="_blank" rel="noopener">문제지 보기/인쇄</a><a class="lc-secondary" style="text-decoration:none;display:inline-block;padding:12px 15px;border-radius:10px;font-size:13px" href="${esc(new URL("curriculum-map.html",new URL("../",document.querySelector('script[src*="growth-learning-view.js"]').src)).href)}?grade=${opts.grade>=1&&opts.grade<=6?opts.grade:3}&term=${opts.semester||2}" target="_blank" rel="noopener">학기별 배우는 내용</a><button type="button" class="lc-secondary" data-gr-paper-record="${subject}"${state.loading||state.failed?' disabled':''}>결과 등록</button></div>`:'<p class="lc-muted">현재 준비된 문항은 초3 참고용입니다. 이 학년의 문항은 검토 후 제공해요.</p>'}<details class="lc-details"><summary>확인 기준 안내</summary><p>공립 3~4학년군 일부 기준을 참고한 검토 중 문항입니다. 학기별 대응·교사 검토는 미완료이며 현재 학교 진도나 학년 수준을 판정하지 않아요.</p><p>결과 등록에는 종이 답안 사진 또는 실제 답·도움 조건을 남겨요. 자동 채점하지 않으며 부모 관찰과 객관적 검사를 구분합니다.</p></details></section>`:''}<button type="button" class="gr-disclosure" data-growth-info aria-expanded="${infoOpen}">기록과 관련된 교육정보 <span>${infoOpen?'⌄':'›'}</span></button>${infoOpen?'<section class="lc-card"><p class="lc-muted">기록의 출처·실제 수행·받은 도움을 확인하며 선택 기준을 살펴봐요. 기록 수만으로 성장이나 추가 교육 필요성을 판단하지 않습니다.</p><button type="button" class="lc-link" data-growth-education>관련 교육 선택지 살펴보기 →</button></section>':''}`;
  container.querySelector('.gr-records').after(box);
  box.querySelector('[data-growth-status]').onclick=()=>{statusOpen=!statusOpen;box.remove();extras(container,state);};
  box.querySelector('[data-growth-info]').onclick=()=>{infoOpen=!infoOpen;box.remove();extras(container,state);};
  box.querySelector('[data-growth-education]')?.addEventListener('click',()=>opts.onEducation?.(subject));
  box.querySelectorAll('[data-growth-subject]').forEach(b=>b.onclick=()=>{subject=b.dataset.growthSubject;box.remove();extras(container,state);});
 }
 root.GrowthRecords.mount(host,{...opts,compact:true,onRendered:extras});
 cleanup=()=>{alive=false;root.GrowthRecords.unmount?.();host.innerHTML='';};return cleanup;
 },unmount(){cleanup();}};
})(window);
