/* Account-scoped app opens/resumes. No page views, device IDs or personal profiles. */
(function(root,factory){
  const api=factory();
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
  else root.AppAccess=api;
})(typeof globalThis!=="undefined"?globalThis:this,function(){
  "use strict";
  const INTERVAL=30*60*1000,RETRY_INTERVAL=60*1000;
  function create({db,getUid,getVersion,now=()=>Date.now(),timestamp}){
    const successful=new Map(),failed=new Map(),pending=new Map();
    function record(reason="app_open"){
      const uid=getUid();
      if(!uid||!["app_open","resume"].includes(reason))return Promise.resolve({status:"skipped"});
      if(pending.has(uid))return pending.get(uid);
      const time=now();
      if(successful.has(uid)&&time-successful.get(uid)<INTERVAL)return Promise.resolve({status:"throttled"});
      if(failed.has(uid)&&time-failed.get(uid)<RETRY_INTERVAL)return Promise.resolve({status:"retry_later"});
      const task=(async()=>{
        try{
          const account=db().collection("accounts").doc(uid);
          const snapshot=await account.get();
          if(getUid()!==uid||!snapshot.exists)return {status:"skipped"};
          const version=String(getVersion()||"").slice(0,32);
          if(!version)return {status:"skipped"};
          await account.collection("appAccess").doc().set({schemaVersion:1,accessedAt:timestamp(),appVersion:version,reason});
          successful.set(uid,time);failed.delete(uid);
          return {status:"recorded"};
        }catch(_){failed.set(uid,now());return {status:"failed"};}
        finally{pending.delete(uid);}
      })();
      pending.set(uid,task);return task;
    }
    return {record};
  }
  return {create,INTERVAL};
});
