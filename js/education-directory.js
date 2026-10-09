(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.EducationDirectory=factory();})(typeof window==='undefined'?globalThis:window,function(){
 'use strict';let sdk,cacheUser='';const cache=new Map(),pending=new Map(),CACHE_MS=5*60*1000;
 async function invoke(fb,name){
 if(!fb.app().functions){if(!sdk)sdk=new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='https://www.gstatic.com/firebasejs/10.14.1/firebase-functions-compat.js';s.onload=resolve;s.onerror=()=>{sdk=null;reject(new Error('조회 서버에 연결하지 못했어요.'));};document.head.append(s);});await sdk;}
 const r=(await fb.app().functions('asia-northeast3').httpsCallable(name,{timeout:190000})({})).data;
 if(!Array.isArray(r?.items)||!r.source||!r.checkedAt)throw new Error('기관 목록을 확인하지 못했어요.');return r;
 }
 async function call(name){
  const fb=globalThis.firebase,uid=fb?.auth().currentUser?.uid;
  if(!uid){cache.clear();pending.clear();cacheUser='';throw new Error('로그인 후 전체 기관을 조회할 수 있어요.');}
  if(cacheUser!==uid){cache.clear();pending.clear();cacheUser=uid;}
  const cached=cache.get(name);if(cached&&Date.now()-cached.at<CACHE_MS)return cached.data;
  let job=pending.get(name);
  if(!job){job=invoke(fb,name).then(data=>{if(cacheUser!==uid||fb.auth().currentUser?.uid!==uid)throw new Error('로그인 정보가 바뀌었어요. 다시 조회해 주세요.');cache.set(name,{at:Date.now(),data});return data;}).finally(()=>{if(pending.get(name)===job)pending.delete(name);});pending.set(name,job);}
  return job;
 }
 function filter(items,query,district){return items.filter(i=>(!query||[i.name,i.address,i.course].join(' ').includes(query.trim()))&&(!district||i.address.includes(district)));}
 function peek(){const uid=globalThis.firebase?.auth().currentUser?.uid,c=cache.get('educationDirectory');return uid&&uid===cacheUser&&c&&Date.now()-c.at<CACHE_MS?c.data:null;}
 return {peek,read:()=>call('educationDirectory'),readPrograms:()=>call('publicEducationPrograms'),filter};
});
