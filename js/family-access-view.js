/* Isolated approval screens; API is injected. Mount only after verified migration. */
(function(root,factory){if(typeof module!=="undefined"&&module.exports)module.exports=factory();else root.FamilyAccessView=factory();})(typeof window!=="undefined"?window:global,function(){
  'use strict';
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const relation={MOM:'엄마',DAD:'아빠',GRANDPARENT:'조부모',CAREGIVER:'보호자',OTHER:'가족',CHILD:'아이'};
  function pending(status) {
    const text={PENDING:'가족에게 참여 승인을 요청했어요.',UNKNOWN:'가족 연결을 확인하지 못했어요. 인터넷 연결 후 다시 확인해 주세요.',EXPIRED:'초대가 만료됐어요. 가족에게 새 초대를 받아 주세요.',REJECTED:'참여 요청이 승인되지 않았어요.',REVOKED:'가족 연결이 해제됐어요.',CANCELLED:'참여 요청을 취소했어요.'};
    return `<section class="fa-card"><h2>가족과 함께하기</h2><p>${esc(text[status]||'가족에게 초대를 받아 주세요.')}</p><p>승인 후 가족 캘린더를 함께 볼 수 있어요.</p><button data-fa-action="status">상태 확인</button>${status==='PENDING'?'<button data-fa-action="cancelJoin">요청 취소</button>':''}</section>`;
  }
  function management({requests=[],members=[],children=[]}={}) {
    return `<section class="fa-card"><h2>가족 참여 요청</h2>${requests.length?requests.map(r=>`<div class="fa-row"><strong>${esc(r.label)}</strong><span>${esc(relation[r.role]||'가족')}</span>${r.role==='CHILD'?`<label>연결할 아이<select data-fa-child="${esc(r.uid)}"><option value="">선택해 주세요</option>${children.map(c=>`<option value="${esc(c.childKey)}">${esc(c.displayName)}</option>`).join('')}</select></label>`:''}<button data-fa-action="approve" data-fa-uid="${esc(r.uid)}">승인</button><button data-fa-action="reject" data-fa-uid="${esc(r.uid)}">거절</button></div>`).join(''):'<p>새로운 참여 요청이 없어요.</p>'}</section>
    <section class="fa-card"><h2>가족 초대</h2><label>누구를 초대하나요?<select data-fa-role>${Object.entries(relation).map(([key,value])=>`<option value="${key}">${value}</option>`).join('')}</select></label><p>초대는 24시간 동안 유효하며, 한 명을 승인하면 사용이 끝나요. 새 코드를 만들면 이전 초대는 취소돼요.</p><button data-fa-action="issueInvite">초대코드 만들기</button><button data-fa-action="revokeInvite">현재 초대 취소</button></section>
    <section class="fa-card"><h2>가족 구성원 관리</h2>${members.map(m=>`<div class="fa-row"><strong>${esc(m.label)}</strong><span>${esc(relation[m.role]||'가족')} · ${m.permission==='ADMIN'?'관리자':m.uid?'구성원':'가입 전'}</span>${m.permission!=='ADMIN'?`<button data-fa-action="removeMember" data-fa-uid="${esc(m.uid)}" data-fa-mid="${esc(m.memberId)}">연결 해제</button>${m.uid&&m.role!=='CHILD'?`<button data-fa-action="transferAdmin" data-fa-uid="${esc(m.uid)}">관리자 이전</button>`:''}`:''}</div>`).join('')}</section>`;
  }
  function mount(root,{api,householdId,model,onStatus=()=>{},onRefresh=async()=>model,confirmAction=message=>window.confirm(message),mode='management',status='PENDING'}) {
    let busy=false,disposed=false,inviteCode='';
    const render=()=>{if(disposed)return;const controls=[...root.querySelectorAll('[data-acct-action]')];root.innerHTML=(mode==='pending'?pending(status):management(model))+'<p data-fa-notice role="status"></p>';controls.forEach(control=>root.appendChild(control));};
    render();
    const listener=async ev=>{
      const button=ev.target.closest('[data-fa-action]');if(!button||busy)return;
      const action=button.dataset.faAction,targetUid=button.dataset.faUid;
      if(action==='copyInvite') {
        try{await navigator.clipboard.writeText(inviteCode);root.querySelector('[data-fa-notice]').textContent='초대코드를 복사했어요.';}
        catch{root.querySelector('[data-fa-notice]').textContent=`초대코드: ${inviteCode} · 코드를 직접 복사해 주세요.`;}
        return;
      }
      if(['removeMember','transferAdmin'].includes(action)&&!confirmAction(action==='removeMember'?'이 구성원의 가족 정보 접근을 해제할까요?':'이 구성원에게 관리자 권한을 이전할까요?'))return;
      busy=true;root.querySelectorAll('button').forEach(b=>b.disabled=true);
      try {
        let result;
        if(action==='approve'||action==='reject') {
          const select=[...root.querySelectorAll('[data-fa-child]')].find(e=>e.dataset.faChild===targetUid);
          if(action==='approve'&&select&&!select.value)throw new Error('연결할 아이를 선택해 주세요.');
          result=await api.decideJoin({householdId,targetUid,approve:action==='approve',...(select?{childKey:select.value}:{})});
        } else {
          const role=root.querySelector('[data-fa-role]')?.value;
          const slot=action==='issueInvite'?(model.members||[]).find(m=>!m.uid&&m.role===role):null;
          result=await api[action]({householdId,...(targetUid?{targetUid}:{}),...(button.dataset.faMid?{memberId:button.dataset.faMid}:{}),role,...(slot?{slotMemberId:slot.memberId}:{})});
        }
        if(disposed)return;
        if(action==='status'||action==='cancelJoin') {
          const state=await api.status();status=state.status;await onStatus(state);
          if(disposed||state.status==='ACTIVE')return;
        } else if(action==='transferAdmin') {
          root.innerHTML='<section class="fa-card"><h2>관리자 권한을 이전했어요.</h2><p>이제 일반 가족 구성원으로 함께할 수 있어요.</p></section>';await onStatus(await api.status());return;
        }
        else model=await onRefresh();
        render();
        root.querySelector('[data-fa-notice]').textContent=action==='issueInvite'?`초대코드: ${result.code} · 승인 후 함께 볼 수 있어요.`:'처리했어요.';
        if(action==='issueInvite'){
          inviteCode=result.code;const copy=document.createElement('button');copy.type='button';copy.dataset.faAction='copyInvite';copy.textContent='초대코드 복사';root.querySelector('[data-fa-notice]').after(copy);
        }
      } catch(e) {if(!disposed)root.querySelector('[data-fa-notice]').textContent=e.message||'처리하지 못했어요.';}
      finally {busy=false;if(!disposed)root.querySelectorAll('button').forEach(b=>b.disabled=false);}
    };
    root.addEventListener('click',listener);
    return ()=>{disposed=true;root.removeEventListener('click',listener);root.innerHTML='';};
  }
  return {pending,management,mount};
});
