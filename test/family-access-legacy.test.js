'use strict';
// 승인 방식 이전 가입자(예전 구성원) 이전·복구 — 메모리 가짜 Firestore 로 서버 로직만 검증한다(에뮬레이터·운영 접속 없음).
const assert=require('node:assert/strict');
const {createService,hash}=require('../functions/family-access');

function fakeDb(seed={}) {
  const data=new Map(Object.entries(seed).map(([k,v])=>[k,{...v}]));
  const snap=(path)=>({id:path.split('/').pop(),exists:data.has(path),data:()=>data.has(path)?{...data.get(path)}:undefined});
  const docRef=path=>({path,get:async()=>snap(path)});
  const colSnap=path=>{
    const depth=path.split('/').length+1;
    const docs=[...data.keys()].filter(k=>k.startsWith(path+'/')&&k.split('/').length===depth).map(k=>snap(k));
    return {docs};
  };
  const db={
    doc:docRef,
    collection:path=>({path,where:()=>({path}),get:async()=>colSnap(path)}),
    async runTransaction(fn) {
      const writes=[];
      const tx={
        get:async target=>target.get?target.get():colSnap(target.path),
        set:(r,v,o)=>writes.push(()=>data.set(r.path,o?.merge?{...(data.get(r.path)||{}),...v}:{...v})),
        update:(r,v)=>writes.push(()=>data.set(r.path,{...(data.get(r.path)||{}),...v})),
      };
      const out=await fn(tx);
      writes.forEach(w=>w());
      return out;
    },
  };
  return {db,data};
}
const T=1_000_000;
const base=()=>({
  'families/H1':{v:1,createdByUid:'mom'},
  'families/H1/members/mom':{v:1,uid:'mom',role:'MOM',label:'엄마',order:1},
  'families/H1/members/dad':{v:1,uid:'dad',role:'DAD',label:'중빠',order:2,colorKey:'p3'},
  'accounts/mom':{householdId:'H1',memberId:'mom',role:'MOM'},
  'accounts/dad':{householdId:'H1',memberId:'dad',role:'DAD'},
  'accounts/orphan':{householdId:'GONE',memberId:'x',role:'DAD'},
  'accounts/forged':{householdId:'H1',memberId:'mom',role:'DAD'},   // 남의 구성원 자리를 가리키는 계정
});
const svc=(seed)=>{const f=fakeDb(seed);return {...f,s:createService(f.db,{now:()=>T,codeGenerator:()=>'ABCD2345'})};};
const rejects=(fn,code)=>assert.rejects(fn,e=>e.code===code);

(async()=>{
  // 1) 예전 구성원(승인 문서 없음) → 로그인 때 이전: 만든 사람은 ADMIN, 나머지는 MEMBER, 구성원 자리·색은 그대로
  let {s,data}=svc(base());
  assert.equal((await s.status('dad')).status,'REVOKED');
  const c=await s.claimLegacy('dad');
  assert.deepEqual([c.claimed,c.householdId,c.permission],[true,'H1','MEMBER']);
  assert.equal(data.get('familyAccess/H1/members/dad').status,'ACTIVE');
  assert.equal(data.get('familyAccess/H1/members/dad').memberId,'dad');
  assert.equal(data.get('families/H1/members/dad').colorKey,'p3');
  const st=await s.status('dad');assert.deepEqual([st.status,st.householdId,st.permission],['ACTIVE','H1','MEMBER']);
  assert.equal((await s.claimLegacy('mom')).permission,'ADMIN');
  assert.equal((await s.claimLegacy('dad')).reason,'already-active');   // 두 번 해도 그대로

  // 2) 증거가 없으면 이전하지 않는다: 남의 자리를 가리키는 계정·없는 가족·연결 없는 계정
  ({s,data}=svc(base()));
  assert.equal((await s.claimLegacy('forged')).reason,'no-evidence');
  assert.equal((await s.claimLegacy('orphan')).reason,'no-evidence');
  assert.equal((await s.claimLegacy('nobody')).reason,'no-link');
  assert.equal(data.has('familyAccess/H1/members/forged'),false);

  // 3) 관리자가 끊은(REVOKED) 계정·삭제된 구성원은 되살리지 않는다
  ({s,data}=svc({...base(),'familyAccess/H1/members/dad':{status:'REVOKED'}}));
  assert.equal((await s.claimLegacy('dad')).reason,'revoked');
  assert.equal(data.get('familyAccess/H1/members/dad').status,'REVOKED');
  ({s,data}=svc({...base(),'families/H1/members/dad':{uid:'dad',role:'DAD',label:'중빠',deletedAt:5}}));
  assert.equal((await s.claimLegacy('dad')).reason,'no-evidence');

  // 4) 복구 가능한 예전 구성원은 새 가족을 만들거나 다른 초대로 합류할 수 없다(먼저 이전해야 한다)
  ({s}=svc(base()));
  await rejects(()=>s.createFamily('dad',{displayName:'중빠',role:'DAD'}),'failed-precondition');
  await rejects(()=>s.requestJoin('dad',{code:'ABCD2345',displayName:'중빠'},'ip'),'not-found');   // 초대가 없으니 코드 검사에서 막힘

  // 5) 고아 계정(가족 문서가 사라짐)은 막히지 않는다: 새 가족 만들기·초대 합류 모두 가능
  ({s,data}=svc(base()));
  const made=await s.createFamily('orphan',{displayName:'중빠',role:'DAD'});
  assert.equal(made.created,true);assert.notEqual(made.householdId,'GONE');
  assert.equal(data.get('accounts/orphan').householdId,made.householdId);

  // 6) 이전 전에는 관리자 문서가 없어 초대를 만들 수 없고, 이전 후에는 만들 수 있다. 고아 계정은 그 초대로 합류한다
  ({s,data}=svc(base()));
  await rejects(()=>s.issueInvite('mom',{householdId:'H1',role:'DAD'}),'permission-denied');
  await s.claimLegacy('mom');
  const inv=await s.issueInvite('mom',{householdId:'H1',role:'DAD'});
  assert.equal(inv.code,'ABCD2345');
  await rejects(()=>s.requestJoin('dad',{code:inv.code,displayName:'중빠'},'ip'),'failed-precondition');   // 복구 가능한 예전 구성원은 다른 초대로 합류 못 함
  await s.requestJoin('orphan',{code:inv.code,displayName:'중빠'},'ip');
  await s.decideJoin('mom',{householdId:'H1',targetUid:'orphan',approve:true});
  assert.equal(data.get('accounts/orphan').householdId,'H1');
  assert.equal(data.get('familyAccess/H1/members/orphan').status,'ACTIVE');
  assert.equal(hash('ABCD2345').length,64);
  console.log('Legacy member claim / orphan recovery: PASS');
})().catch(e=>{console.error(e);process.exitCode=1;});
