'use strict';
const {initializeApp}=require('firebase-admin/app');
const {getFirestore}=require('firebase-admin/firestore');
const {onCall,HttpsError}=require('firebase-functions/v2/https');
const {createService}=require('./family-access');
const {defineSecret,defineString}=require('firebase-functions/params');
// Enable together with client App Check configuration before release.
const appCheckEnforced=process.env.APP_CHECK_ENFORCED === 'true';
initializeApp();
const {getAuth}=require('firebase-admin/auth');
const service=createService(getFirestore(),{emailOf:async uid=>(await getAuth().getUser(uid)).email});
exports.familyAccess=onCall({region:'asia-northeast3',enforceAppCheck:appCheckEnforced,maxInstances:5},async request=>{
  if(!request.auth)throw new HttpsError('unauthenticated','로그인이 필요해요.');
  const {action,...data}=request.data||{};
  if(!Object.hasOwn(service,action))throw new HttpsError('invalid-argument','잘못된 요청이에요.');
  try {
    return await service[action](request.auth.uid,data,request.rawRequest.ip);
  } catch(e) {
    const allowed=['invalid-argument','permission-denied','failed-precondition','not-found','resource-exhausted','aborted'];
    if(allowed.includes(e.code))throw new HttpsError(e.code,e.message);
    // Do not log request bodies, family codes, profile data or authentication tokens.
    throw new HttpsError('internal','처리하지 못했어요. 다시 시도해 주세요.');
  }
});

// Explicit deployment only; original message and model responses are never logged.
const {createMessageParser,DEFAULT_MODEL}=require('./message-parser');
const messageKey=defineSecret('OPENROUTER_API_KEY');
const messageModel=defineString('MESSAGE_PARSER_MODEL',{default:DEFAULT_MODEL});
exports.parseFamilyMessage=onCall({region:'asia-northeast3',enforceAppCheck:appCheckEnforced,secrets:[messageKey],maxInstances:2,concurrency:4,timeoutSeconds:120},async request=>{
 if(!request.auth)throw new HttpsError('unauthenticated','로그인이 필요해요.');
 try{return await createMessageParser({db:getFirestore(),key:messageKey.value(),model:messageModel.value(),reportFailure:event=>console.warn('schedule-analysis-failure',event)})(request.auth.uid,request.data);}
 catch(e){const codes=['invalid-argument','permission-denied','failed-precondition','resource-exhausted','unavailable'];throw new HttpsError(codes.includes(e.code)?e.code:'internal',codes.includes(e.code)?e.message:'분석하지 못했어요. 직접 입력은 계속할 수 있어요.');}
});

// Private originals are readable only through this authenticated owner-scoped service.
const {getStorage}=require('firebase-admin/storage');
const {createSchedulePhotoService}=require('./schedule-photos');
exports.schedulePhotos=onCall({region:'asia-northeast3',enforceAppCheck:appCheckEnforced,maxInstances:2,concurrency:4,timeoutSeconds:60,memory:'256MiB'},async request=>{
 if(!request.auth)throw new HttpsError('unauthenticated','로그인이 필요해요.');
 try{return await createSchedulePhotoService({db:getFirestore(),bucket:getStorage().bucket('yuka-planner.firebasestorage.app')})(request.auth.uid,request.data);}
 catch(e){const codes=['invalid-argument','permission-denied','not-found','resource-exhausted','unavailable'];throw new HttpsError(codes.includes(e.code)?e.code:'internal',codes.includes(e.code)?e.message:'사진을 처리하지 못했어요.');}
});

// 일정 사진 원본은 30일만 보관한다(매일 새벽 4시 KST). 사진 파일과 Firestore 메타를 함께 지운다.
const {onSchedule}=require('firebase-functions/v2/scheduler');
const {createRetention}=require('./schedule-photo-retention');
exports.expireSchedulePhotos=onSchedule({region:'asia-northeast3',schedule:'every day 04:00',timeZone:'Asia/Seoul',memory:'256MiB',timeoutSeconds:540,retryCount:0},async()=>{
 const result=await createRetention({db:getFirestore(),bucket:getStorage().bucket('yuka-planner.firebasestorage.app'),days:30})();
 console.log('schedule-photo-retention',JSON.stringify(result));
});
