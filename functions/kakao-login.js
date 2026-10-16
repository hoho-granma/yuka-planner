'use strict';
// 카카오 로그인(서버). 브라우저가 받은 인가 코드를 카카오에 확인하고, 한눈육아 전용 계정(uid=hn_kakao_<번호>)의 로그인 토큰을 만든다.
// - 쓰앵님 계정(kakao_<번호>)과 섞이지 않게 접두사를 다르게 둔다. 카카오 이메일은 받지도, Firebase 계정에 넣지도 않는다(이메일 계정과 충돌하지 않는다).
// - 토큰에 sso:"kakao"와 표시 이름(sname)을 넣는다. 인가 코드를 받을 수 있는 주소는 아래 목록의 /oauth 만 허용한다.
const ALLOWED_REDIRECTS=['https://yuka-planner.web.app/oauth','https://yuka-planner.firebaseapp.com/oauth','http://localhost:8080/oauth','http://localhost:5000/oauth'];
const UID_PREFIX='hn_kakao_';
class KakaoError extends Error{constructor(code,message){super(message);this.code=code;}}
const str=(v,max=60)=>typeof v==='string'?v.trim().slice(0,max):'';
const form=o=>new URLSearchParams(o).toString();
async function json(res,what){if(!res.ok)throw new KakaoError('failed-precondition',what+'을(를) 확인하지 못했어요.');return res.json();}

/** 인가 코드 → 카카오 회원번호와 닉네임. */
async function fetchProfile({code,redirectUri,creds,fetchImpl=fetch}){
 const t=await json(await fetchImpl('https://kauth.kakao.com/oauth/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:form({grant_type:'authorization_code',client_id:creds.id,...(creds.secret?{client_secret:creds.secret}:{}),redirect_uri:redirectUri,code})}),'카카오 로그인');
 const u=await json(await fetchImpl('https://kapi.kakao.com/v2/user/me',{headers:{Authorization:'Bearer '+str(t.access_token,4000)}}),'카카오 사용자 정보');
 const nick=str(u.kakao_account&&u.kakao_account.profile&&u.kakao_account.profile.nickname)||str(u.properties&&u.properties.nickname);
 return {id:String(u.id==null?'':u.id),name:nick};
}

function createKakaoLogin({auth,getCreds,fetchImpl}){
 return async function kakaoLogin(data){
  const code=str(data&&data.code,2000),redirectUri=str(data&&data.redirectUri,200);
  if(!code||!ALLOWED_REDIRECTS.includes(redirectUri))throw new KakaoError('invalid-argument','요청을 확인해 주세요.');
  const creds=await getCreds();
  if(!creds||!creds.id)throw new KakaoError('failed-precondition','카카오 로그인은 아직 준비 중이에요.');
  const p=await fetchProfile({code,redirectUri,creds,fetchImpl});
  if(!/^[0-9]{1,30}$/.test(p.id))throw new KakaoError('failed-precondition','사용자 정보를 확인하지 못했어요.');
  const uid=UID_PREFIX+p.id;
  let isNew=false;
  try{await auth.getUser(uid);}
  catch(e){
   if(!e||e.code!=='auth/user-not-found')throw e;
   await auth.createUser({uid,displayName:p.name||undefined});isNew=true;
  }
  const name=p.name||'카카오 계정';
  return {token:await auth.createCustomToken(uid,{sso:'kakao',sname:name.slice(0,30)}),name,isNew};
 };
}
module.exports={createKakaoLogin,fetchProfile,KakaoError,ALLOWED_REDIRECTS,UID_PREFIX};
