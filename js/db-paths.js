/* Collection v2 rollout; growth server remains disabled until Storage is ready. */
(function(root,factory){if(typeof module!=="undefined"&&module.exports)module.exports=factory();else root.DBPaths=factory();})(typeof window!=="undefined"?window:global,function(){
  "use strict";
  const deployment=Object.freeze({collectionV2:true,growthServer:false});
  function map(path,v2=deployment.collectionV2){
    if(!v2)return path;
    const p=path.split('/');
    if(p[0]==='families')p[0]='children';
    else if(p[0]==='households'){p[0]='families';if(p[2]==='children')p[2]='childLinks';}
    else if(p[0]==='householdCodes')p[0]='familyInviteCodes';
    else if(p[0]==='placeStats')p[0]='placeUsageStats';
    return p.join('/');
  }
  return {deployment,map};
});
