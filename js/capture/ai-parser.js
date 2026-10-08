/* Message-only AI adapter. No API secret or automatic persistence in the browser. */
(function(root,factory){if(typeof module!=='undefined'&&module.exports)module.exports=factory();else root.AiParser=factory();})(typeof window!=='undefined'?window:global,function(){
 'use strict';
 const RULE_FAILED='rule-failed';
 const ruleFailed=(text,cands)=>/[0-9A-Za-z가-힣]/.test(String(text||''))&&!(cands||[]).some(c=>c&&c.eventDate);
 const enabled=()=>true;
 async function parseWithAI(text,baseDate,context){
  const c=context||{},user=c.user;
  if(!user)return {ok:false,reason:'unauthenticated',message:'로그인 후 사용할 수 있어요.'};
  if(!text.trim()||text.length>4000)return {ok:false,reason:'invalid',message:'메시지는 4,000자 이내로 입력해 주세요.'};
  try{
   const authUser=typeof user.getIdToken==='function'?user:typeof firebase!=='undefined'&&firebase.auth?firebase.auth().currentUser:null;
   if(!authUser||authUser.uid!==user.uid)return {ok:false,reason:'unauthenticated',message:'다시 로그인해 주세요.'};
   const token=await authUser.getIdToken(),response=await fetch('https://asia-northeast3-yuka-planner.cloudfunctions.net/parseFamilyMessage',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},signal:AbortSignal.timeout(35000),body:JSON.stringify({data:{text,baseDate,familyId:c.familyId}})});
   const body=await response.json();
   if(!response.ok||body.error)return {ok:false,reason:'failed',message:body.error?.message||'메시지 분석을 사용할 수 없어요. 직접 입력해 주세요.'};
   const result=body.result||body.data;
   return result?.ok&&Array.isArray(result.candidates)?result:{ok:false,reason:'failed',message:'분석 결과를 확인하지 못했어요.'};
  }catch{return {ok:false,reason:'offline',message:'서버에 연결하지 못했어요. 입력한 내용은 그대로 유지돼요.'};}
 }
 return {RULE_FAILED,ruleFailed,enabled,parseWithAI};
});
