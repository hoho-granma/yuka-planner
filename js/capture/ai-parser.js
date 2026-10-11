/* Text AI adapter for pasted messages and direct image analysis. No API secret or automatic persistence in the browser. */
(function(root,factory){if(typeof module!=='undefined'&&module.exports)module.exports=factory();else root.AiParser=factory();})(typeof window!=='undefined'?window:global,function(){
 'use strict';
 const RULE_FAILED='rule-failed';
 const ruleFailed=(text,cands)=>/[0-9A-Za-z가-힣]/.test(String(text||''))&&!(cands||[]).some(c=>c&&c.eventDate);
 const enabled=()=>true;
 const analysisMode=(kind,mode)=>kind==='todo'?(mode==='photo'?'photo':mode==='message'?'message':null):(mode==='gallery'?'photo':mode==='paste'?'message':null);
 async function parseWithAI(text,baseDate,context){
  const c=context||{},user=c.user;
  if(!user)return {ok:false,reason:'unauthenticated',message:'로그인 후 사용할 수 있어요.'};
  if((!text.trim()&&!c.image)||text.length>4000)return {ok:false,reason:'invalid',message:'메시지는 4,000자 이내로 입력해 주세요.'};
  try{
   const authUser=typeof user.getIdToken==='function'?user:typeof firebase!=='undefined'&&firebase.auth?firebase.auth().currentUser:null;
   if(!authUser||authUser.uid!==user.uid)return {ok:false,reason:'unauthenticated',message:'다시 로그인해 주세요.'};
   const token=await authUser.getIdToken(),response=await fetch('https://asia-northeast3-yuka-planner.cloudfunctions.net/parseFamilyMessage',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},signal:AbortSignal.timeout(c.image?125000:35000),body:JSON.stringify({data:{text,baseDate,familyId:c.familyId,...(c.image?{image:c.image}:{})}})});
   const body=await response.json();
   if(!response.ok||body.error)return {ok:false,reason:'failed',message:body.error?.message||'메시지 분석을 사용할 수 없어요. 직접 입력해 주세요.'};
   const result=body.result||body.data;
   return result?.ok&&Array.isArray(result.candidates)?result:{ok:false,reason:'failed',message:'분석 결과를 확인하지 못했어요.'};
  }catch{return {ok:false,reason:'offline',message:'서버에 연결하지 못했어요. 입력한 내용은 그대로 유지돼요.'};}
 }
 async function preparePhoto(file){
  if(!file||!/^image\/(jpeg|png|webp|heic|heif)$/.test(file.type)&&! /\.(heic|heif)$/i.test(file.name))throw Error('사진 파일을 선택해 주세요.');
  if(file.size>6000000)throw Error('사진은 6MB 이하로 선택해 주세요.');
  let data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('사진을 불러오지 못했어요.'));reader.readAsDataURL(file);});
  if(!/^image\/(jpeg|png|webp)$/.test(file.type)){
   try{const img=await new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=reject;img.src=data;});const canvas=document.createElement('canvas');canvas.width=img.naturalWidth;canvas.height=img.naturalHeight;canvas.getContext('2d').drawImage(img,0,0);data=canvas.toDataURL('image/jpeg',0.92);}
   catch{throw Error('이 브라우저에서 HEIC 사진을 읽지 못해요. 사진을 JPG로 내보내거나 화면을 캡처해 선택해 주세요.');}
  }
  if(data.length>8000000)throw Error('변환한 사진이 너무 커요. 사진 크기를 줄여 다시 선택해 주세요.');
  return {image:data,name:file.name};
 }

 return {preparePhoto,RULE_FAILED,ruleFailed,enabled,analysisMode,parseWithAI};
});
