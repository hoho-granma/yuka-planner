/* Approved family access uses canonical collections. Legacy paths are accepted only for owned offline queues. */
(function(root,factory){if(typeof module!=="undefined"&&module.exports)module.exports=factory();else root.DBPaths=factory();})(typeof window!=="undefined"?window:global,function(){
  "use strict";
  const deployment=Object.freeze({collectionV2:true,growthServer:true,familyApproval:true,appCheckEnabled:false,appCheckSiteKey:""});
  function queuedPath(path){
    const p=String(path).split('/');
    if(p[0]==='households'){p[0]='families';if(p[2]==='children')p[2]='childLinks';}
    if(p[0]!=='families'||p.length!==4||!['childLinks','members','schedules','todos'].includes(p[2])||p.some(s=>!s||! /^[A-Za-z0-9_-]{1,160}$/.test(s)))throw new Error('지원하지 않는 오프라인 변경 경로입니다.');
    return p.join('/');
  }
  return {deployment,queuedPath};
});
