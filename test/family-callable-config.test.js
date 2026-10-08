'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../functions/index.js'),'utf8');
function load(value){const exports={};class HttpsError extends Error{constructor(code,message){super(message);this.code=code;}}
 const mocks={'firebase-admin/app':{initializeApp(){}},'firebase-admin/firestore':{getFirestore:()=>({})},'firebase-functions/v2/https':{HttpsError,onCall:(options,handler)=>({options,handler})},'firebase-functions/params':{defineBoolean:()=>{throw Error('App Check must be a boolean at runtime');},defineSecret:()=>({value:()=>''}),defineString:()=>({value:()=>''})},'./family-access':{createService:()=>({status:async uid=>({status:'NONE',uid})})},'./message-parser':{createMessageParser:()=>async()=>({})}};
 vm.runInNewContext(source,{exports,process:{env:value===undefined?{}:{APP_CHECK_ENFORCED:value}},require:name=>{if(!mocks[name])throw Error(name);return mocks[name];}});return exports.familyAccess;
}
test('App Check is a boolean and disabled for development, not a truthy parameter object',()=>{for(const value of [undefined,'false',''])assert.equal(load(value).options.enforceAppCheck,false);assert.equal(load('true').options.enforceAppCheck,true);});
test('App Check deferral retains mandatory login and server action validation',async()=>{const fn=load('false');await assert.rejects(fn.handler({data:{action:'status'}}),e=>e.code==='unauthenticated');assert.equal((await fn.handler({auth:{uid:'test'},data:{action:'status'},rawRequest:{ip:'127.0.0.1'}})).uid,'test');await assert.rejects(fn.handler({auth:{uid:'test'},data:{action:'forged'},rawRequest:{ip:'127.0.0.1'}}),e=>e.code==='invalid-argument');});
