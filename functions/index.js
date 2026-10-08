'use strict';
const {initializeApp}=require('firebase-admin/app');
const {getFirestore}=require('firebase-admin/firestore');
const {onCall,HttpsError}=require('firebase-functions/v2/https');
const {createService}=require('./family-access');
const {defineBoolean}=require('firebase-functions/params');
// Enable together with client App Check configuration before release.
const appCheckEnforced=defineBoolean('APP_CHECK_ENFORCED',{default:false});
initializeApp();
const service=createService(getFirestore());
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
