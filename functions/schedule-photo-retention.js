'use strict';
// 일정 사진 원본(privateSchedulePhotos/{uid}/{photoId})을 보관기간(기본 30일)이 지나면 지운다.
// Storage 파일을 먼저 지우고 Firestore 메타(accounts/{uid}/privateSchedulePhotos/{photoId})를 지운다 — 메타만 남는 일이 없게.
// 기준은 Storage 객체 생성 시각(timeCreated)이다. 파일이 이미 없으면 메타만 정리한다.
const PREFIX='privateSchedulePhotos/',DAY=24*60*60*1000,PATH=/^privateSchedulePhotos\/([A-Za-z0-9_-]{1,128})\/([a-f0-9]{64})$/;
function createRetention({db,bucket,days=30,now=Date.now,pageSize=500}){
 return async()=>{
  const cutoff=now()-days*DAY;let token,scanned=0,deleted=0,failed=0;
  do{
   const [files,next]=await bucket.getFiles({prefix:PREFIX,autoPaginate:false,maxResults:pageSize,pageToken:token}).then(r=>[r[0],r[1]&&r[1].pageToken]);
   for(const file of files){
    scanned++;
    const m=PATH.exec(file.name),created=Date.parse(file.metadata&&file.metadata.timeCreated);
    if(!m||!Number.isFinite(created)||created>=cutoff)continue;
    try{
     await file.delete({ignoreNotFound:true});
     await db.doc(`accounts/${m[1]}/privateSchedulePhotos/${m[2]}`).delete();
     deleted++;
    }catch(e){failed++;}
   }
   token=next;
  }while(token);
  return {scanned,deleted,failed,days};
 };
}
module.exports={createRetention,PREFIX};
