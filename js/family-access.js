/* Approval API. No legacy membership writes or code lookup fallback. */
(function(root,factory){if(typeof module!=="undefined"&&module.exports)module.exports=factory();else root.FamilyAccess=factory();})(typeof window!=="undefined"?window:global,function(){
  "use strict";
  let sdkPromise,appCheckPromise,appCheckActivated=false;
  function loadSdk(fb) {
    if(!sdkPromise)sdkPromise=(async()=>{
      for(const name of (typeof DBPaths!=="undefined"&&DBPaths.deployment.appCheckEnabled===true?["functions","appCheck"]:["functions"])) {
        if(typeof fb[name]==="function")continue;
        await new Promise((resolve,reject)=>{
          const script=document.createElement("script");
          script.src=`https://www.gstatic.com/firebasejs/10.14.1/firebase-${name==='appCheck'?'app-check':name}-compat.js`;
          script.onload=resolve;script.onerror=()=>reject(new Error("서버에 연결하지 못했어요."));document.head.appendChild(script);
        });
      }
    })().catch(e=>{sdkPromise=null;throw e;});
    return sdkPromise;
  }
  async function ensureAppCheck(fb) {
    await loadSdk(fb);
    if(typeof DBPaths==="undefined"||DBPaths.deployment.appCheckEnabled!==true)return;
    if(!appCheckPromise)appCheckPromise=(async()=>{
      const siteKey=typeof DBPaths!=="undefined"&&DBPaths.deployment.appCheckSiteKey;
      if(!siteKey)throw Object.assign(new Error("가족 연결 서버 설정이 아직 준비되지 않았어요."),{code:"failed-precondition"});
      if(!appCheckActivated){fb.appCheck().activate(new fb.appCheck.ReCaptchaEnterpriseProvider(siteKey),true);appCheckActivated=true;}
      await fb.appCheck().getToken(false);
    })().catch(e=>{appCheckPromise=null;throw e;});
    return appCheckPromise;
  }
  function create({firebase:fb,invoke}={}) {
    async function call(action,data={}) {
      if(invoke)return invoke({action,...data});
      fb=fb || window.firebase;
      if(!fb.auth().currentUser)throw Object.assign(new Error("로그인이 필요해요."),{code:"unauthenticated"});
      await ensureAppCheck(fb);
      return (await fb.app().functions("asia-northeast3").httpsCallable("familyAccess")({action,...data})).data;
    }
    return Object.fromEntries(["createFamily","issueInvite","requestJoin","decideJoin","status","cancelJoin","revokeInvite","removeMember","transferAdmin","listRequests","createChild","removeChild","resolveChild","updateMember"].map(action=>[action,data=>call(action,data)]));
  }
  return {create};
});
