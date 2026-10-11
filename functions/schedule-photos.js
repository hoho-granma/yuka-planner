'use strict';
const {createHash}=require('node:crypto');
const fail=(code,message)=>{throw Object.assign(new Error(message),{code});};
const ID=/^[A-Za-z0-9_-]{1,128}$/,PHOTO=/^[a-f0-9]{64}$/;
const MAX_BYTES=6*1024*1024;
function decode(image){
 if(typeof image!=='string'||image.length>8500000)fail('invalid-argument','사진은 6MB 이하로 선택해 주세요.');
 const m=/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(image);if(!m)fail('invalid-argument','사진 형식을 확인해 주세요.');
 const bytes=Buffer.from(m[2],'base64');
 const valid=m[1]==='png'?bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):m[1]==='jpeg'?bytes[0]===255&&bytes[1]===216&&bytes[2]===255:bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP';
 if(!bytes.length||bytes.length>MAX_BYTES||!valid)fail('invalid-argument','사진 파일을 확인해 주세요.');
 return {bytes,contentType:'image/'+m[1],photoId:createHash('sha256').update(bytes).digest('hex')};
}
function createSchedulePhotoService({db,bucket,now=Date.now}){
 const privatePath=(uid,id)=>`privateSchedulePhotos/${uid}/${id}`;
 return async(uid,data)=>{
  if(!ID.test(uid||''))fail('unauthenticated','로그인 후 사용할 수 있어요.');
  if(data?.action==='save'){
   if(!ID.test(data.familyId||''))fail('invalid-argument','가족 연결을 확인해 주세요.');
   const account=(await db.doc('accounts/'+uid).get()).data();
   const access=(await db.doc(`familyAccess/${data.familyId}/members/${uid}`).get()).data();
   if(account?.householdId!==data.familyId||access?.status!=='ACTIVE'||access.memberId!==account.memberId||!['ADMIN','MEMBER'].includes(access.permission)||access.role==='CHILD')fail('permission-denied','승인된 보호자만 사진을 저장할 수 있어요.');
   const member=(await db.doc(`families/${data.familyId}/members/${account.memberId}`).get()).data();
   if(!member||member.uid!==uid||member.deletedAt)fail('permission-denied','가족 연결을 확인해 주세요.');
   const {bytes,contentType,photoId}=decode(data.image),meta=db.doc(`accounts/${uid}/privateSchedulePhotos/${photoId}`);
   if((await meta.get()).exists)return {ok:true,photoId};
   const usage=db.doc(`accounts/${uid}/privateUsage/schedulePhotos`),day=new Date(now()+9*3600000).toISOString().slice(0,10);
   await db.runTransaction(async tx=>{const old=(await tx.get(usage)).data(),count=old?.day===day?old.count:0;if(count>=20)fail('resource-exhausted','오늘 사진 저장 횟수를 모두 사용했어요.');tx.set(usage,{day,count:count+1});});
   const path=privatePath(uid,photoId);
   try{await bucket.file(path).save(bytes,{resumable:false,contentType,preconditionOpts:{ifGenerationMatch:0},metadata:{cacheControl:'private, no-store',metadata:{ownerUid:uid}}});}
   catch(e){if(e.code!==412)fail('unavailable','원본 사진을 저장하지 못했어요. 다시 시도해 주세요.');}
   await meta.set({storagePath:path,contentType,byteSize:bytes.length,createdAt:now()});
   return {ok:true,photoId};
  }
  if(data?.action==='read'){
   if(!PHOTO.test(data.photoId||''))fail('invalid-argument','원본 사진을 확인해 주세요.');
   // The requester cannot choose an owner or arbitrary Storage path. No public URL or download token is created.
   const meta=(await db.doc(`accounts/${uid}/privateSchedulePhotos/${data.photoId}`).get()).data();
   if(!meta||meta.storagePath!==privatePath(uid,data.photoId))fail('not-found','이 계정에서 볼 수 있는 원본 사진이 없어요.');
   if(!['image/jpeg','image/png','image/webp'].includes(meta.contentType)||!Number.isInteger(meta.byteSize)||meta.byteSize<=0||meta.byteSize>MAX_BYTES)fail('internal','원본 사진 정보를 확인하지 못했어요.');
   let bytes;try{[bytes]=await bucket.file(meta.storagePath).download();}catch{fail('unavailable','원본 사진을 불러오지 못했어요.');}
   if(bytes.length!==meta.byteSize||createHash('sha256').update(bytes).digest('hex')!==data.photoId)fail('internal','원본 사진을 확인하지 못했어요.');
   return {ok:true,image:`data:${meta.contentType};base64,${bytes.toString('base64')}`};
  }
  fail('invalid-argument','사진 요청을 확인해 주세요.');
 };
}
module.exports={createSchedulePhotoService,decode};
