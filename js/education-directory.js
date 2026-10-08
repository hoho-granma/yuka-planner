(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.EducationDirectory=factory();})(typeof window==='undefined'?globalThis:window,function(){
 'use strict';let sdk;
 async function call(name){const fb=globalThis.firebase;if(!fb?.auth().currentUser)throw new Error('로그인 후 전체 기관을 조회할 수 있어요.');
 if(!fb.app().functions){if(!sdk)sdk=new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='https://www.gstatic.com/firebasejs/10.14.1/firebase-functions-compat.js';s.onload=resolve;s.onerror=()=>{sdk=null;reject(new Error('조회 서버에 연결하지 못했어요.'));};document.head.append(s);});await sdk;}
 const r=(await fb.app().functions('asia-northeast3').httpsCallable(name,{timeout:190000})({})).data;
 if(!Array.isArray(r?.items)||!r.source||!r.checkedAt)throw new Error('기관 목록을 확인하지 못했어요.');return r;
 }
 function filter(items,query,district){return items.filter(i=>(!query||[i.name,i.address,i.course].join(' ').includes(query.trim()))&&(!district||i.address.includes(district)));}
 return {read:()=>call('educationDirectory'),readPrograms:()=>call('publicEducationPrograms'),filter};
});
