/* Family growth storage. No automatic import, no deletion of local originals. */
(function(root,factory){if(typeof module!=="undefined"&&module.exports)module.exports=factory();else root.GrowthSync=factory();})(typeof window!=="undefined"?window:global,function(){
  "use strict";
  const Evidence=typeof module!=='undefined'&&module.exports?require('./growth-evidence'):globalThis.GrowthEvidence;
  const GROUPS=['school','academy','activity','home'];
  const ID=/^[A-Za-z0-9_-]{1,160}$/;
  function context(c){if(!c||!ID.test(c.familyId||'')||!ID.test(c.childKey||'')||!c.uid)throw Error('로그인과 아이의 가족 연결을 확인해 주세요.');return c;}
  async function digest(value){const bytes=value instanceof Uint8Array?value:new TextEncoder().encode(value);const sum=await crypto.subtle.digest('SHA-256',bytes);return Array.from(new Uint8Array(sum),x=>x.toString(16).padStart(2,'0')).join('');}
  function validate(r){
    if(!r||!ID.test(r.id||'')||!GROUPS.includes(r.group)||!r.activity||r.activity.length>60||!r.title||r.title.length>100||typeof r.text!=='string'||r.text.length>10000)throw Error('성장기록 내용을 확인해 주세요.');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(r.date)||Number.isNaN(Date.parse(r.date+'T00:00:00Z'))||new Date(r.date+'T00:00:00Z').toISOString().slice(0,10)!==r.date)throw Error('기록 날짜를 확인해 주세요.');
    if(r.image&&(!/^image\//.test(r.image.type)||r.image.size>15*1024*1024))throw Error('15MB 이하의 이미지를 선택해 주세요.');
  }
  let storagePromise;
  async function storageSdk(){
    if(!storagePromise)storagePromise=(async()=>{
      // Compat references keep the app's existing Auth provider and login session.
      if(typeof firebase.storage!=='function')await new Promise((resolve,reject)=>{
        const script=document.createElement('script');script.src='https://www.gstatic.com/firebasejs/10.14.1/firebase-storage-compat.js';
        script.onload=resolve;script.onerror=()=>{script.remove();reject(Error('사진 저장 기능을 불러오지 못했어요.'));};document.head.appendChild(script);
      });
      return import('https://www.gstatic.com/firebasejs/10.14.1/firebase-storage.js');
    })().catch(e=>{storagePromise=null;throw e;});
    return storagePromise;
  }
  function browserAdapter(){
    const db=firebase.firestore();
    // Modular Blob downloads accept a compat reference via its delegate.
    const ref=async path=>{const sdk=await storageSdk();return {sdk,ref:firebase.storage().ref(path)};};
    return {
      async list(path,childKey){const s=await db.collection(path).where('childKey','==',childKey).get({source:'server'});return s.docs.map(d=>({id:d.id,...d.data()}));},
      async transaction(path,update){return db.runTransaction(async tx=>{const doc=db.doc(path),s=await tx.get(doc);const next=update(s.exists?s.data():null);if(next)tx.set(doc,next);return next||s.data();});},
      async upload(path,image,childKey){const x=await ref(path);try{await x.sdk.getMetadata(x.ref);return;}catch(e){if(e.code!=='storage/object-not-found')throw e;}await x.sdk.uploadBytes(x.ref,image,{contentType:image.type,customMetadata:{childKey}});},
      async image(path){const x=await ref(path);return x.sdk.getBlob(x.ref,15*1024*1024);},
    };
  }
  function create({getContext,adapter,now=()=>Date.now(),hash=digest,structuredWrites=false}){
    let ad=adapter;
    const a=()=>ad||(ad=browserAdapter());
    const c=()=>context(getContext());
    const root=ctx=>'families/'+ctx.familyId;
    function same(ctx){const next=c();if(next.uid!==ctx.uid||next.familyId!==ctx.familyId||next.childKey!==ctx.childKey)throw Error('선택한 가족이나 아이가 변경됐어요. 다시 열어 주세요.');}
    const recordsPath=ctx=>root(ctx)+'/growthRecords';
    async function hydrate(d,ctx,scope,attachments=true){
      let image=null,imageError=false,attachmentStatus=d.attachment?(attachments?'pending':'not_requested'):'none';
      if(d.attachment&&attachments){try{image=await a().image(d.attachment.storagePath);attachmentStatus='ok';}catch(e){imageError=true;attachmentStatus=/unauthorized|permission-denied/.test(e.code||'')?'permission_denied':'failed';}}
      same(ctx);
      return {...Evidence.fields(d),schemaVersion:d.schemaVersion||1,registeredAt:d.createdAt,deletedAt:d.deletedAt||null,id:d.id,scope,group:d.group,activity:d.activity,activityId:d.activityId,title:d.title,text:d.text,date:d.recordDate,createdAt:d.legacyCreatedAt||d.createdAt,revision:d.revision,image,imageError,attachmentStatus,attachment:d.attachment||null,server:true};
    }
    async function read(scope,options={}){const ctx=c(),rows=await a().list(recordsPath(ctx),ctx.childKey);same(ctx);return Promise.all(rows.filter(d=>!d.deletedAt).map(d=>hydrate(d,ctx,scope,options.attachments!==false)));}
    async function fingerprintOf(record){
      const imageHash=record.image?await hash(new Uint8Array(await record.image.arrayBuffer())):'';
      const parts=[record.group,record.activity,record.title,record.text,record.date,imageHash];const extension=Evidence.fields(record);if(Object.keys(extension).length)parts.push(extension);return {imageHash,fingerprint:await hash(JSON.stringify(parts))};
    }
    async function pendingLocal(records,scope){
      const ctx=c();if(scope!==JSON.stringify([ctx.uid,ctx.childCode]))throw Error('기기 기록의 대상 아이를 확인해 주세요.');
      const remote=await a().list(recordsPath(ctx),ctx.childKey),pending=[];
      for(const r of records){if(r.scope!==scope)throw Error('기기 기록의 계정을 확인해 주세요.');const id='import_'+await hash(r.scope+'\u0000'+r.id);const existing=remote.find(d=>d.id===id);if(!existing||existing.importFingerprint!==(await fingerprintOf(r)).fingerprint)pending.push(r);}
      same(ctx);return pending;
    }
    async function save(record,options={}){
      validate(record);const extension=Evidence.fields(record);if(Object.keys(extension).length&&!structuredWrites)throw Error('구조화 기록 저장 규칙이 아직 활성화되지 않았어요. 원문은 변경하지 않았습니다.');const ctx=c();
      const imported=!!options.import;
      const id=imported?'import_'+await hash(record.scope+'\u0000'+record.id):record.id;
      const activityId=record.activityId||'activity_'+await hash(ctx.childKey+'\u0000'+record.group+'\u0000'+record.activity);
      const path=recordsPath(ctx)+'/'+id;
      // Content hash also makes import retries safe without replacing a server edit.
      const {imageHash,fingerprint}=await fingerprintOf(record);
      let attachment=record.attachment||null;
      if(record.image&&(!record.server||record.imageChanged)){
        const storagePath=root(ctx)+'/growthRecords/'+id+'/image_'+imageHash;
        same(ctx);await a().upload(storagePath,record.image,ctx.childKey);
        const check=await a().image(storagePath);
        if(check.size!==record.image.size||await hash(new Uint8Array(await check.arrayBuffer()))!==imageHash)throw Error('사진 업로드 확인에 실패했어요. 다시 시도해 주세요.');
        attachment={storagePath,contentType:record.image.type,size:record.image.size,hash:imageHash};
      }
      same(ctx);
      const saved=await a().transaction(path,existing=>{
        if(existing&&existing.childKey!==ctx.childKey)throw Error('다른 아이의 기록과 충돌했어요.');
        if(imported&&existing){if(existing.importFingerprint!==fingerprint)throw Error('이전 기록이 서버에서 변경됐어요. 덮어쓰지 않았습니다.');return null;}
        if(!imported&&existing&&existing.revision!==record.revision)throw Error('가족이 이 기록을 수정했어요. 다시 불러온 뒤 수정해 주세요.');
        if(!imported&&!existing&&record.server)throw Error('기존 기록을 찾을 수 없어요. 다시 불러와 주세요.');
        return {...(existing?Evidence.fields(existing):{}),...extension,schemaVersion:Object.keys(extension).length||existing?.schemaVersion===2?2:1,childKey:ctx.childKey,activityId,group:record.group,activity:record.activity,recordDate:record.date,title:record.title,text:record.text,attachment,
          createdByUid:existing?existing.createdByUid:ctx.uid,updatedByUid:ctx.uid,createdAt:existing?existing.createdAt:now(),updatedAt:now(),revision:existing?existing.revision+1:1,
          ...(imported?{importKey:id,importFingerprint:fingerprint,legacyCreatedAt:record.createdAt}:existing&&existing.importKey?{importKey:existing.importKey,importFingerprint:existing.importFingerprint,legacyCreatedAt:existing.legacyCreatedAt}:{})};
      });
      same(ctx);return hydrate({id,...saved},ctx,record.scope);
    }
    async function importLocal(records,scope,onProgress=()=>{}){
      // Scope matching must be exact; never import another login's local data.
      const ctx=c(),expected=JSON.stringify([ctx.uid,ctx.childCode]);
      if(!ctx.childCode||scope!==expected||records.some(r=>r.scope!==scope))throw Error('이 기기 기록의 계정·아이를 확인할 수 없어요.');
      const result={done:0,failed:[]};
      for(const record of records){same(ctx);try{await save(record,{import:true});result.done++;}catch(e){result.failed.push({id:record.id,message:e.message});}onProgress({...result});}
      return result;
    }
    function status(e){return /permission-denied|unauthorized|unauthenticated/.test(e.code||'')?'permission_denied':/선택한 가족/.test(e.message||'')?'context_changed':'failed';}
    async function related(scope,filter={}){
      let ctx;try{ctx=c();}catch(e){return {status:'permission_denied',items:[],message:e.message};}if(scope!==JSON.stringify([ctx.uid,ctx.childCode]))return {status:'context_changed',items:[]};try{const records=await read(scope,{attachments:false});same(ctx);const items=records.filter(r=>(!filter.activityId||r.activityId===filter.activityId)&&(!filter.educationRef||(r.evidenceEntries||[]).some(e=>(e.educationRefs||[]).some(x=>x.id===filter.educationRef))));return {status:items.length?'ok':'empty',items:items.map(r=>Evidence.project(r,ctx)),context:{familyId:ctx.familyId,childKey:ctx.childKey}};}catch(e){return {status:status(e),items:[],message:e.message};}
    }
    async function resolveReference(scope,ref){
      let ctx;try{ctx=c();}catch(e){return {status:'permission_denied',message:e.message};}if(scope!==JSON.stringify([ctx.uid,ctx.childCode]))return {status:'context_changed'};if(ref.familyId!==ctx.familyId||ref.childKey!==ctx.childKey)return {status:'context_changed'};
      try{const records=await read(scope);same(ctx);return Evidence.resolve(records.find(r=>r.id===ref.recordId),ref,ctx);}catch(e){return {status:status(e),message:e.message};}
    }
    return {read,save,importLocal,pendingLocal,related,resolveReference};
  }
  return {create,validate,context};
});
