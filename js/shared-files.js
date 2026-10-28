/* Family documents: authenticated metadata and compressed, private images. */
window.SharedFiles=(()=>{
 'use strict';
 const esc=s=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let ctx,key='',unsubscribe,rows=[],error='',form,storagePromise;
 const urls=new Map();
 const loader=label=>`<span class="hn-shared-loading" role="status" aria-label="${esc(label)}"><span class="hn-shared-spinner" aria-hidden="true"></span></span>`;
 const identity=c=>c?.user?.uid&&c.familyId?c.user.uid+':'+c.familyId:'';
 const current=c=>identity(c)===key&&identity(ctx)===key;
 const mayEdit=()=>ctx?.canManage!==false;
 const collection=c=>c.adapter?c.adapter.collection:firebase.firestore().collection(`families/${c.familyId}/sharedFiles`);
 async function storage(){
  if(!storagePromise)storagePromise=(async()=>{
   if(!firebase.storage)await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='https://www.gstatic.com/firebasejs/10.14.1/firebase-storage-compat.js';s.onload=resolve;s.onerror=()=>{s.remove();reject(Error('사진 저장 기능을 불러오지 못했어요.'));};document.head.append(s);});
   return import('https://www.gstatic.com/firebasejs/10.14.1/firebase-storage.js');
  })().catch(e=>{storagePromise=null;throw e;});
  return storagePromise;
 }
 async function image(path){if(ctx?.adapter)return ctx.adapter.image(path);const sdk=await storage();return sdk.getBlob(firebase.storage().ref(path),4*1024*1024);}
 async function compress(file,max=1920,quality=.82){
  if(!file.type.startsWith('image/')||file.size>30*1024*1024)throw Error('30MB 이하의 사진을 선택해 주세요.');
  const url=URL.createObjectURL(file),img=new Image();
  try{img.src=url;await img.decode();const scale=Math.min(1,max/Math.max(img.naturalWidth,img.naturalHeight)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));const g=canvas.getContext('2d');g.fillStyle='#fff';g.fillRect(0,0,canvas.width,canvas.height);g.drawImage(img,0,0,canvas.width,canvas.height);const blob=await new Promise(r=>canvas.toBlob(r,'image/jpeg',quality));if(!blob||blob.size>4*1024*1024)throw Error('사진을 압축하지 못했어요. 다른 사진을 선택해 주세요.');return blob;}catch(e){throw Error(e.message||'사진을 읽지 못했어요. JPG 또는 PNG로 선택해 주세요.');}finally{URL.revokeObjectURL(url);}
 }
 const dataUrl=blob=>new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(blob);});
 function mount(c){ctx=c;const next=identity(c);if(next!==key){unsubscribe?.();unsubscribe=null;key=next;rows=[];error='';form=null;for(const u of urls.values())URL.revokeObjectURL(u);urls.clear();if(key)unsubscribe=collection(c).onSnapshot(s=>{if(!current(c))return;rows=s.docs.map(d=>({id:d.id,...d.data()})).filter(r=>!r.deletedAt).sort((a,b)=>b.createdAt-a.createdAt);error='';draw();},()=>{if(current(c)){error='공유파일을 불러오지 못했어요. 가족 연결과 접근 권한을 확인해 주세요.';draw();}});}draw();}
 function draw(){const container=ctx?.container;if(!container?.isConnected)return;container.querySelector('#hn-shared-files')?.remove();if(!key)return;
  container.insertAdjacentHTML('beforeend',`<section class="card hn-shared-files" id="hn-shared-files"><div class="hn-section-head"><h3>우리가족 공유 파일<button type="button" class="hn-heading-shortcut" data-shared-list aria-label="우리가족 공유 파일 전체 목록"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17 17 7M7 7h10v10"/></svg></button></h3>${mayEdit()?'<button type="button" class="hn-header-add" data-shared-add aria-label="파일 추가하기"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg></button>':''}</div>${error?`<p role="alert">${esc(error)}</p>`:rows.length?rows.map(r=>`<button type="button" class="hn-shared-row" data-shared-open="${esc(r.id)}"><span class="hn-shared-thumb">${r.imagePath?`${loader('사진 불러오는 중')}<img data-shared-thumb="${esc(r.id)}" alt="" hidden/>`:'메시지'}</span><span class="hn-shared-copy"><strong>${esc(r.title)}</strong><span>${esc(r.message)}</span></span></button>`).join(''):'<p class="fine-print">가족과 함께 볼 사진과 메시지를 보관해요.</p>'}</section>`);
  hydrateThumbnails(container);
  const box=document.getElementById('modal-content');if(box?.querySelector('.hn-shared-library')&&!document.getElementById('detail-modal')?.classList.contains('hidden'))renderLibrary(false);
 }
 function hydrateThumbnails(container){
  const c=ctx;for(const r of rows.filter(r=>r.thumbPath)){const node=container.querySelector(`[data-shared-thumb="${r.id}"]`);if(!node)continue;const reveal=()=>{node.hidden=false;node.parentElement?.querySelector('.hn-shared-loading')?.remove();};node.onload=reveal;if(urls.has(r.thumbPath)){node.src=urls.get(r.thumbPath);continue;}image(r.thumbPath).then(blob=>{if(!current(c))return;const url=URL.createObjectURL(blob);if(urls.has(r.thumbPath))URL.revokeObjectURL(url);else urls.set(r.thumbPath,url);if(node.isConnected)node.src=urls.get(r.thumbPath);}).catch(()=>{if(node.isConnected){node.parentElement.querySelector('.hn-shared-loading')?.remove();node.hidden=false;node.alt='사진';}});}
 }
 function renderLibrary(open=true){
  const card=ctx?.container?.querySelector('#hn-shared-files');if(!card||!key)return;
  form=null;if(open)ctx.openModal();const box=document.getElementById('modal-content');box.dataset.sharedView=crypto.randomUUID();box.classList.remove('hn-photo-mode');
  const list=card.cloneNode(true);list.removeAttribute('id');list.classList.add('hn-shared-library');list.querySelector('h3').textContent='우리가족 공유 파일';box.replaceChildren(list);hydrateThumbnails(list);
 }
 function renderForm(){const f=form;ctx.openModal();document.getElementById('modal-content').classList.remove('hn-photo-mode');document.getElementById('modal-content').innerHTML=`<div class="hn-entry hn-file-entry" role="group" aria-label="${f.id?'공유파일 수정':'공유파일 추가'}">${f.id?'<div class="hn-section-head"><h3>공유파일 수정</h3></div>':''}<div class="hn-methods"><button type="button" data-shared-mode="photo" class="${f.mode==='photo'?'on':''}">사진</button><button type="button" data-shared-mode="message" class="${f.mode==='message'?'on':''}">메시지</button></div><div ${f.mode==='photo'?'':'hidden'}><label class="hn-shared-pick">사진 선택하기<input id="hn-shared-photo" type="file" accept="image/*"/></label>${(f.preview||urls.get('full:'+f.id)||urls.get(f.thumbPath))?`<div class="hn-photo-preview"><img src="${esc(f.preview||urls.get('full:'+f.id)||urls.get(f.thumbPath))}" alt="선택한 공유 사진"/></div>`:''}</div><label ${f.mode==='message'?'':'hidden'}>메시지<textarea id="hn-shared-message" rows="5" maxlength="4000" placeholder="가족과 공유할 메시지를 붙여넣으세요.">${esc(f.message)}</textarea></label><button type="button" class="btn-complete" data-shared-analyze>${f.mode==='photo'?'사진 내용 분석해서 채우기':'메시지에서 찾아 채우기'}</button><label>제목<input id="hn-shared-title" maxlength="60" value="${esc(f.title)}" placeholder="공유파일 제목"/></label><p class="fine-print">가족이 함께 보는 파일이에요.</p><div id="hn-shared-error" class="hn-shared-status" role="alert"></div><div class="hn-entry-actions"><button type="button" class="btn-complete" data-shared-save>저장</button></div></div>`;
  document.getElementById('hn-shared-title').oninput=e=>{f.title=e.target.value;f.revision++;};document.getElementById('hn-shared-message').oninput=e=>{f.message=e.target.value;f.revision++;};
  document.getElementById('hn-shared-photo').onchange=async e=>{const file=e.target.files[0];if(!file)return;const job=++f.revision;f.busy=true;showBusy('사진 준비 중');document.querySelectorAll('.hn-file-entry button').forEach(n=>n.disabled=true);try{const blob=await compress(file),preview=await dataUrl(blob);if(form!==f||job!==f.revision)return;f.blob=blob;f.preview=preview;renderForm();}catch(e){if(form===f)notice(e.message);}finally{f.busy=false;if(form===f){const status=document.getElementById('hn-shared-error');if(status?.hasAttribute('aria-busy'))notice('');document.querySelectorAll('.hn-file-entry button').forEach(n=>n.disabled=false);}}};
 }
 function notice(s){const n=document.getElementById('hn-shared-error');if(n){n.setAttribute('role','alert');n.removeAttribute('aria-busy');n.textContent=s;}}
 function showBusy(label){const n=document.getElementById('hn-shared-error');if(n){n.removeAttribute('role');n.setAttribute('aria-busy','true');n.innerHTML=loader(label);}}
 async function openRecord(r){
  const c={...ctx};form=null;ctx.openModal();const box=document.getElementById('modal-content'),viewId=crypto.randomUUID();box.dataset.sharedView=viewId;box.classList.remove('hn-photo-mode');
  box.innerHTML=`<div class="hn-shared-view"><h3>${esc(r.title)}</h3><p style="white-space:pre-wrap">${esc(r.message)}</p><div class="hn-shared-media">${r.imagePath?loader('사진 불러오는 중'):''}</div>${mayEdit()?`<div class="hn-shared-view-actions"><button type="button" data-shared-edit="${esc(r.id)}">수정하기</button><button type="button" data-shared-delete="${esc(r.id)}">삭제하기</button></div>`:''}<div data-shared-view-status aria-live="polite"></div></div>`;
  if(!r.imagePath)return;
  try{const blob=await image(r.imagePath);if(!current(c)||box.dataset.sharedView!==viewId)return;const url=URL.createObjectURL(blob);if(urls.has('full:'+r.id))URL.revokeObjectURL(urls.get('full:'+r.id));urls.set('full:'+r.id,url);const img=document.createElement('img');img.src=url;img.alt=r.title;img.style.width='100%';await img.decode();if(!current(c)||box.dataset.sharedView!==viewId||!box.querySelector('.hn-shared-media'))return;box.querySelector('.hn-shared-media').replaceChildren(img);}
  catch{if(current(c)&&box.dataset.sharedView===viewId){const media=box.querySelector('.hn-shared-media');if(media){media.setAttribute('role','alert');media.textContent='사진을 불러오지 못했어요. 다시 열어 주세요.';}}}
 }
 document.addEventListener('click',async e=>{
  if(e.target.closest('[data-shared-list]')){renderLibrary();return;}
  if(e.target.closest('[data-shared-add]')&&mayEdit()){form={mode:'photo',title:'',message:'',revision:0,context:{...ctx}};renderForm();return;}
  const mode=e.target.closest('[data-shared-mode]');if(mode&&form&&!form.busy){form.mode=mode.dataset.sharedMode;form.revision++;renderForm();return;}
  const open=e.target.closest('[data-shared-open]');if(open){const r=rows.find(r=>r.id===open.dataset.sharedOpen);if(r)await openRecord(r);return;}
  const edit=e.target.closest('[data-shared-edit]');if(edit&&mayEdit()){const r=rows.find(r=>r.id===edit.dataset.sharedEdit);if(!r)return;form={...r,mode:r.imagePath?'photo':'message',revision:0,context:{...ctx}};document.getElementById('modal-content').dataset.sharedView=crypto.randomUUID();renderForm();return;}
  const remove=e.target.closest('[data-shared-delete]');if(remove&&mayEdit()){
   const r=rows.find(r=>r.id===remove.dataset.sharedDelete),c={...ctx},box=document.getElementById('modal-content'),viewId=box.dataset.sharedView;if(!r||remove.disabled)return;
   if(!window.confirm('이 공유파일을 삭제할까요? 가족의 공유파일 목록에서도 사라져요.'))return;
   const status=box.querySelector('[data-shared-view-status]');box.querySelectorAll('.hn-shared-view-actions button').forEach(b=>b.disabled=true);status.innerHTML=loader('파일 삭제 중');
   try{if(!current(c)||!mayEdit())throw Error('가족 연결과 수정 권한을 확인해 주세요.');await collection(c).doc(r.id).update({deletedAt:Date.now(),updatedAt:Date.now()});if(current(c)&&box.dataset.sharedView===viewId){ctx.closeModal();for(const k of [r.thumbPath,'full:'+r.id]){if(urls.has(k)){URL.revokeObjectURL(urls.get(k));urls.delete(k);}}}}
   catch(error){if(current(c)&&box.dataset.sharedView===viewId){status.textContent=error.message||'삭제하지 못했어요. 다시 시도해 주세요.';status.setAttribute('role','alert');}}
   finally{if(current(c)&&box.dataset.sharedView===viewId){status.querySelector('.hn-shared-loading')?.remove();box.querySelectorAll('.hn-shared-view-actions button').forEach(b=>b.disabled=false);}}return;
  }
  const f=form;if(!f||f.busy||!e.target.closest('[data-shared-analyze],[data-shared-save]'))return;if(!current(f.context)||!mayEdit()){notice('가족 연결이 바뀌었어요. 다시 열어 주세요.');return;}
  const analyze=!!e.target.closest('[data-shared-analyze]');if(f.mode==='photo'&&!f.blob&&!f.imagePath){notice('사진을 선택해 주세요.');return;}if(!analyze&&!f.title.trim()){notice('제목을 입력하거나 분석해서 채워 주세요.');return;}if(f.mode==='message'&&!f.message.trim()){notice('공유할 메시지를 입력해 주세요.');return;}
  f.busy=true;const revision=f.revision;document.querySelectorAll('.hn-file-entry button,.hn-file-entry input,.hn-file-entry textarea').forEach(n=>n.disabled=true);showBusy(analyze?'제목 분석 중':'파일 저장 중');
  try{if(analyze){if(f.mode==='photo'&&!f.preview){f.preview=await dataUrl(await image(f.imagePath));if(form!==f||!current(f.context))return;}const result=await AiParser.parseWithAI(f.mode==='message'?f.message:'',new Date().toLocaleDateString('sv-SE'),{user:f.context.user,familyId:f.context.familyId,purpose:'shared-file-title',...(f.mode==='photo'?{image:f.preview}:{})});if(form!==f||!current(f.context)||revision!==f.revision)return;if(!result.ok||!result.title)throw Error(result.message||'제목을 찾지 못했어요. 제목을 입력해 주세요.');f.title=result.title;renderForm();notice('제목을 확인하고 저장해 주세요.');}else{
   const doc=f.id?collection(f.context).doc(f.id):collection(f.context).doc(),base=`families/${f.context.familyId}/sharedFiles/${doc.id}`;let imagePath=f.mode==='photo'?f.imagePath||null:null,thumbPath=f.mode==='photo'?f.thumbPath||null:null;
   if(f.mode==='photo'&&f.blob){const sdk=f.context.adapter?null:await storage();const suffix=f.id?'_'+crypto.randomUUID():'';imagePath=base+'/image'+suffix+'.jpg';thumbPath=base+'/thumb'+suffix+'.jpg';const thumb=await compress(f.blob,320,.72);for(const [path,blob] of [[imagePath,f.blob],[thumbPath,thumb]])if(f.context.adapter)await f.context.adapter.upload(path,blob);else await sdk.uploadBytes(firebase.storage().ref(path),blob,{contentType:'image/jpeg'});}
   if(form!==f||!current(f.context))throw Error('가족 연결이 바뀌었어요. 다시 열어 주세요.');const fields={title:f.title.trim(),message:f.mode==='message'?f.message.trim():'',imagePath,thumbPath};if(f.id)await doc.update({...fields,updatedAt:Date.now()});else await doc.set({...fields,createdAt:Date.now(),createdByUid:f.context.user.uid});if(form===f&&current(f.context)){form=null;ctx.closeModal();}
  }}catch(e){if(form===f)notice(e.message||'저장하지 못했어요. 다시 시도해 주세요.');}finally{f.busy=false;if(form===f){const status=document.getElementById('hn-shared-error');if(status?.hasAttribute('aria-busy'))notice('');document.querySelectorAll('.hn-file-entry button,.hn-file-entry input,.hn-file-entry textarea').forEach(n=>n.disabled=false);}}
 });
 function reset(){unsubscribe?.();unsubscribe=null;key='';ctx=null;form=null;rows=[];error='';for(const url of urls.values())URL.revokeObjectURL(url);urls.clear();}
 return {mount,compress,reset};
})();
