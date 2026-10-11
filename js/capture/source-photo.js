/* Account-private originals. Image bytes are never put into family documents or browser storage. */
(function(root,factory){if(typeof module!=='undefined'&&module.exports)module.exports=factory();else root.SourcePhoto=factory();})(typeof window!=='undefined'?window:global,function(){
 'use strict';
 const PREFIX='원본사진:';
 function reference(tags){const tag=(tags||[]).find(t=>typeof t==='string'&&/^원본사진:[A-Za-z0-9_-]{1,128}:[a-f0-9]{64}$/.test(t));if(!tag)return null;const [,uid,photoId]=tag.split(':');return {uid,photoId,tag};}
 async function call(data,user){
  if(!user?.uid)throw Error('로그인 후 사용할 수 있어요.');
  const auth=typeof user.getIdToken==='function'?user:typeof firebase!=='undefined'&&firebase.auth?firebase.auth().currentUser:null;
  if(!auth||auth.uid!==user.uid)throw Error('다시 로그인해 주세요.');
  const token=await auth.getIdToken(),response=await fetch('https://asia-northeast3-yuka-planner.cloudfunctions.net/schedulePhotos',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},cache:'no-store',signal:AbortSignal.timeout(65000),body:JSON.stringify({data})});
  const body=await response.json();if(!response.ok||body.error)throw Error(body.error?.message||'원본 사진을 처리하지 못했어요.');
  const result=body.result||body.data;if(!result?.ok)throw Error('원본 사진을 확인하지 못했어요.');return result;
 }
 async function save(photo,context){const r=await call({action:'save',familyId:context.familyId,image:photo.image},context.user);if(!/^[a-f0-9]{64}$/.test(r.photoId||''))throw Error('원본 사진 저장 결과를 확인하지 못했어요.');return PREFIX+context.user.uid+':'+r.photoId;}
 async function read(tags,user){const ref=reference(tags);if(!ref||ref.uid!==user?.uid)throw Error('원본은 등록한 계정에서만 볼 수 있어요.');const r=await call({action:'read',photoId:ref.photoId},user);if(typeof r.image!=='string'||!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(r.image))throw Error('원본 사진을 확인하지 못했어요.');return r.image;}
 return {reference,save,read};
});
