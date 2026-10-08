'use strict';
const {initializeApp}=require('firebase-admin/app');
const {getFirestore}=require('firebase-admin/firestore');
const {onCall,HttpsError}=require('firebase-functions/v2/https');
const {defineSecret}=require('firebase-functions/params');
const {createDirectory}=require('./directory');
initializeApp();const key=defineSecret('NEIS_API_KEY');let read;
exports.educationDirectory=onCall({region:'asia-northeast3',secrets:[key],maxInstances:1,concurrency:8,timeoutSeconds:180,memory:'256MiB'},async request=>{
 if(!request.auth)throw new HttpsError('unauthenticated','로그인이 필요해요.');
 const account=await getFirestore().doc('accounts/'+request.auth.uid).get();
 if(!account.exists)throw new HttpsError('permission-denied','가입 정보를 확인해 주세요.');
 if(!read)read=createDirectory({key:key.value()});
 try{return await read();}catch(e){throw new HttpsError(['failed-precondition','unavailable'].includes(e.code)?e.code:'unavailable',e.code==='failed-precondition'?'나이스 인증키 설정을 확인해야 해요.':'기관 목록을 불러오지 못했어요. 잠시 후 다시 시도하세요.');}
});

const {createPublicPrograms}=require('./public-programs');
const readPrograms=createPublicPrograms();
exports.publicEducationPrograms=onCall({region:'asia-northeast3',maxInstances:1,concurrency:8,timeoutSeconds:40},async request=>{
 if(!request.auth)throw new HttpsError('unauthenticated','로그인이 필요해요.');
 const account=await getFirestore().doc('accounts/'+request.auth.uid).get();
 if(!account.exists)throw new HttpsError('permission-denied','가입 정보를 확인해 주세요.');
 return readPrograms();
});
