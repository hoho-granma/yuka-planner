'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');
const source=fs.readFileSync('js/app.js','utf8');
const restore=source.slice(source.indexOf('  async function acctApprovalRestore(u) {'),source.indexOf('  async function acctApprovalOpenManage()'));
function env(statusFn) {
 const calls=[];const ctx={acct:{user:{uid:'test'},approvalEpoch:1,sync:{restore:async()=>({ok:true,account:{displayName:'은찬',householdId:'f1'}})}},profile:null,familyCode:null,completed:{},approvalUnsubscribe:null,approvalViewDispose:null,
 approvalApi:()=>({status:statusFn}),acctApprovalGate:(s)=>calls.push(['gate',s]),acctApprovalQuarantine:()=>calls.push(['quarantine']),acctReadIntent:()=>null,acctShowSheet:s=>calls.push(['sheet',s]),showLandingView:()=>{},acctOwnerSync:()=>{},acctClearIntent:()=>{},
 HouseholdSync:{joinHousehold:async id=>{calls.push(['join',id]);return {ok:true,mirror:{children:{}}};}},hhSetJoined:(id,code)=>calls.push(['joined',id,code]),acctAfterHousehold:async()=>{},acctGoHome:async()=>calls.push(['home']),acctSplashRelease:()=>{},
 firebase:{firestore:()=>({doc:()=>({onSnapshot:()=>()=>{}})})}};
 vm.createContext(ctx);vm.runInContext(restore,ctx);return {ctx,calls,run:()=>ctx.acctApprovalRestore(ctx.acct.user)};
}
test('pending restoration shows gate without household reads',async()=>{const e=env(async()=>({status:'PENDING'}));await e.run();assert.deepEqual(e.calls,[['gate','PENDING']]);});
test('confirmed removal quarantines local edits and blocks home',async()=>{const e=env(async()=>({status:'REVOKED'}));await e.run();assert.deepEqual(e.calls,[['quarantine'],['gate','REVOKED']]);});
test('network failures never delete or classify membership as revoked',async()=>{const e=env(async()=>{throw new Error('offline');});await e.run();assert.deepEqual(e.calls,[['gate','UNKNOWN']]);});
test('active restore joins by stable family ID and ignores invitation expiry',async()=>{const e=env(async()=>({status:'ACTIVE',householdId:'f1',permission:'MEMBER'}));await e.run();assert.deepEqual(e.calls,[['join','f1'],['joined','f1','f1'],['home']]);assert.equal(e.ctx.acct.account.householdCode,'f1');});
test('stale auth response cannot restore into a different session',async()=>{let release;const e=env(()=>new Promise(r=>release=r));const run=e.run();e.ctx.acct.user={uid:'next'};e.ctx.acct.approvalEpoch=2;release({status:'ACTIVE',householdId:'f1'});await run;assert.deepEqual(e.calls,[]);});
test('stale family read cannot overwrite the current login account',async()=>{
 let release;const e=env(async()=>({status:'ACTIVE',householdId:'f1'}));e.ctx.acct.sync.restore=()=>new Promise(r=>release=r);const run=e.run();await new Promise(r=>setImmediate(r));e.ctx.acct.user={uid:'next'};e.ctx.acct.approvalEpoch=2;release({ok:true,account:{householdId:'f1'}});await run;assert.deepEqual(e.calls,[['join','f1']]);assert.equal(e.ctx.acct.account,undefined);assert.ok(!e.calls.some(([kind])=>kind==='joined'||kind==='home'));
});

test('account and household reads overlap after ACTIVE approval',async()=>{let finishAccount,finishJoin;const e=env(async()=>({status:'ACTIVE',householdId:'f1'}));e.ctx.acct.sync.restore=()=>new Promise(r=>finishAccount=r);e.ctx.HouseholdSync.joinHousehold=()=>new Promise(r=>finishJoin=r);const run=e.run();await new Promise(r=>setImmediate(r));assert.equal(typeof finishAccount,'function');assert.equal(typeof finishJoin,'function');assert.equal(e.ctx.acct.account,undefined);finishJoin({ok:true,mirror:{children:{}}});finishAccount({ok:true,account:{householdId:'f1'}});await run;assert.ok(e.calls.some(([kind])=>kind==='home'));});
