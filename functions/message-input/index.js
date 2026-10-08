'use strict';
const {initializeApp}=require('firebase-admin/app');
const {getFirestore}=require('firebase-admin/firestore');
const {onCall,HttpsError}=require('firebase-functions/v2/https');
const {defineSecret,defineString}=require('firebase-functions/params');
initializeApp();
// Explicit deployment only; original message and model responses are never logged.
const {createMessageParser}=require('./message-parser');
const messageKey=defineSecret('OPENROUTER_API_KEY');
const messageModel=defineString('MESSAGE_PARSER_MODEL',{default:'qwen/qwen3.8-flash'});
exports.parseFamilyMessage=onCall({region:'asia-northeast3',secrets:[messageKey],maxInstances:2,concurrency:4,timeoutSeconds:35},async request=>{
 if(!request.auth)throw new HttpsError('unauthenticated','로그인이 필요해요.');
 try{return await createMessageParser({db:getFirestore(),key:messageKey.value(),model:messageModel.value()})(request.auth.uid,request.data);}
 catch(e){const codes=['invalid-argument','permission-denied','failed-precondition','resource-exhausted','unavailable'];throw new HttpsError(codes.includes(e.code)?e.code:'internal',codes.includes(e.code)?e.message:'분석하지 못했어요. 직접 입력은 계속할 수 있어요.');}
});
