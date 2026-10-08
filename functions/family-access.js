'use strict';
const {randomBytes, createHash} = require('node:crypto');
const hash = s => createHash('sha256').update(s).digest('hex');
const ROLES = ['MOM','DAD','GRANDPARENT','CAREGIVER','OTHER','CHILD'];
const fail = (code, message) => { throw Object.assign(new Error(message), {code}); };
const id = value => {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(value)) fail('invalid-argument','잘못된 식별자예요.');
  return value;
};
const label = value => {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 20) fail('invalid-argument','이름을 확인해 주세요.');
  return value.trim();
};
const relation = value => { if (!ROLES.includes(value)) fail('invalid-argument','관계를 확인해 주세요.'); return value; };
const CODE_CHARS='23456789ABCDEFGHJKMNPQRSTUVWXYZ';
function newCode() {
  // Rejection sampling avoids modulo bias; keep existing eight-character input UI.
  let code='';
  while(code.length<8) for(const b of randomBytes(16)) {
    if(b<256-256%CODE_CHARS.length) code+=CODE_CHARS[b%CODE_CHARS.length];
    if(code.length===8)break;
  }
  return code;
}
function createService(db, {now=Date.now, codeGenerator=newCode}={}) {
  const ref=p=>db.doc(p);
  const get=async(tx,p)=>(await tx.get(ref(p))).data();
  const accessPath=(hid,uid)=>`familyAccess/${hid}/members/${uid}`;
  const active=m=>m && m.status==='ACTIVE';
  async function manager(tx,hid,uid) {
    const m=await get(tx,accessPath(hid,uid));
    if(!active(m)||m.permission!=='ADMIN')fail('permission-denied','가족 관리자만 할 수 있어요.');
    return m;
  }
  // Counts commit before the operation, so failed code guesses consume quota too.
  async function throttle(uid,ip) {
    const t=now(), window=Math.floor(t/600000);
    const limits=[['uid:'+uid,10],['ip:'+ip,40]];
    await db.runTransaction(async tx=>{
      const rows=await Promise.all(limits.map(async([key,max])=>({p:`familyRateLimits/${hash(key+':'+window)}`,max})));
      const docs=await Promise.all(rows.map(r=>get(tx,r.p)));
      if(rows.some((r,i)=>(docs[i]?.count||0)>=r.max))fail('resource-exhausted','시도가 많아요. 잠시 후 다시 시도해 주세요.');
      rows.forEach((r,i)=>tx.set(ref(r.p),{count:(docs[i]?.count||0)+1,expiresAt:new Date((window+2)*600000)}));
    });
  }
  function profileFields(data) {
    const out={};
    for(const k of ['province','district'])if(typeof data[k]==='string'&&data[k].length<=30)out[k]=data[k];
    if(['HAS_CHILD','EXPECTING'].includes(data.situation))out.situation=data.situation;
    if(['DAYCARE','KINDERGARTEN','ELEMENTARY','NONE'].includes(data.institution))out.institution=data.institution;
    return out;
  }
  async function createFamily(uid,data) {
    const name=label(data.displayName),role=relation(data.role);
    if(role==='CHILD')fail('permission-denied','보호자가 만든 가족에 초대받아 주세요.');
    const hid=ref('families/'+randomBytes(16).toString('hex')).id;
    return db.runTransaction(async tx=>{
      const a=await get(tx,'accounts/'+uid);
      if(a?.householdId) {
        const m=await get(tx,accessPath(a.householdId,uid));
        if(!active(m))fail('failed-precondition','기존 가족 연결을 먼저 확인해 주세요.');
        return {ok:true,householdId:a.householdId,memberId:m.memberId,created:false};
      }
      const t=now(),memberId=uid;
      tx.set(ref('families/'+hid),{v:1,createdAt:t,updatedAt:t,createdByUid:uid});
      tx.set(ref(`families/${hid}/members/${memberId}`),{v:1,uid,role,label:name,order:1,createdAt:t,updatedAt:t});
      tx.set(ref(accessPath(hid,uid)),{status:'ACTIVE',permission:'ADMIN',memberId,role,approvedByUid:uid,approvedAt:t});
      tx.set(ref('accounts/'+uid),{v:1,displayName:name,role,householdId:hid,memberId,createdAt:a?.createdAt||t,updatedAt:t,...profileFields(data)},{merge:true});
      return {ok:true,householdId:hid,memberId,created:true};
    });
  }
  async function issueInvite(uid,data) {
    const hid=id(data.householdId),code=codeGenerator(),key=hash(code);
    const requestedRole=relation(data.role||'OTHER'),slotMemberId=data.slotMemberId?id(data.slotMemberId):null;
    return db.runTransaction(async tx=>{
      await manager(tx,hid,uid);
      const family=await get(tx,'families/'+hid),collision=await get(tx,'privateFamilyInvites/'+key);
      if(slotMemberId) {
        const slot=await get(tx,`families/${hid}/members/${slotMemberId}`);
        if(!slot||slot.uid||slot.deletedAt||slot.role!==requestedRole)fail('failed-precondition','초대할 가족 구성원을 확인해 주세요.');
      }
      if(collision)fail('aborted','초대코드를 다시 만들어 주세요.');
      if(family.currentInviteHash)tx.update(ref('privateFamilyInvites/'+family.currentInviteHash),{status:'REVOKED'});
      const t=now();
      tx.set(ref('privateFamilyInvites/'+key),{householdId:hid,status:'ACTIVE',issuedByUid:uid,createdAt:t,expiresAt:t+86400000,requestedRole,...(slotMemberId?{slotMemberId}:{})});
      tx.update(ref('families/'+hid),{currentInviteHash:key,updatedAt:t});
      return {ok:true,code,expiresAt:t+86400000};
    });
  }
  async function requestJoin(uid,data,ip) {
    await throttle(uid,ip||'unknown');
    const code=String(data.code||'').trim().toUpperCase();
    if(!/^[A-Z0-9]{8}$/.test(code))fail('not-found','사용할 수 없는 초대코드예요.');
    const name=label(data.displayName),key=hash(code);
    return db.runTransaction(async tx=>{
      const inv=await get(tx,'privateFamilyInvites/'+key),a=await get(tx,'accounts/'+uid),previous=await get(tx,'familyJoinRequests/'+uid);
      if(!inv || inv.status!=='ACTIVE'||inv.expiresAt<=now())fail('not-found','사용할 수 없는 초대코드예요.');
      const oldAccess=a?.householdId?await get(tx,accessPath(a.householdId,uid)):null;
      if(a?.householdId&&(!oldAccess||active(oldAccess)))fail('failed-precondition','이미 연결된 가족이 있어요.');
      const previousInvite=previous?.status==='PENDING'?await get(tx,'privateFamilyInvites/'+previous.inviteHash):null;
      if(previous?.status==='PENDING' && previous.inviteHash!==key && previousInvite?.status==='ACTIVE' && previousInvite.expiresAt>now())fail('failed-precondition','기존 참여 요청을 먼저 취소해 주세요.');
      if(previous?.status==='PENDING' && previous.inviteHash===key)return {ok:true,status:'PENDING'};
      tx.set(ref('familyJoinRequests/'+uid),{uid,householdId:inv.householdId,inviteHash:key,label:name,requestedRole:inv.requestedRole,status:'PENDING',createdAt:now()});
      // Never expose family id, profile or roster before approval.
      return {ok:true,status:'PENDING'};
    });
  }
  async function decideJoin(uid,data) {
    const hid=id(data.householdId),target=id(data.targetUid),approve=data.approve;
    if(typeof approve!=='boolean')fail('invalid-argument','승인 여부를 확인해 주세요.');
    return db.runTransaction(async tx=>{
      await manager(tx,hid,uid);
      const req=await get(tx,'familyJoinRequests/'+target);
      if(!req||req.householdId!==hid||req.status!=='PENDING')fail('failed-precondition','처리할 참여 요청이 없어요.');
      const inv=await get(tx,'privateFamilyInvites/'+req.inviteHash),a=await get(tx,'accounts/'+target);
      const members=await tx.get(db.collection(`families/${hid}/members`));
      const existing=await get(tx,accessPath(hid,target));
      const previousAccess=a?.householdId?await get(tx,accessPath(a.householdId,target)):null;
      const slot=inv?.slotMemberId?members.docs.find(d=>d.id===inv.slotMemberId):null;
      if(approve && inv?.slotMemberId && (!slot||slot.data().uid||slot.data().deletedAt))fail('failed-precondition','초대된 자리가 변경됐어요. 새로 초대해 주세요.');
      if(approve && (!inv||inv.status!=='ACTIVE'||inv.expiresAt<=now()))fail('failed-precondition','초대가 만료됐어요. 다시 초대해 주세요.');
      if(approve && ((a?.householdId&&(!previousAccess||active(previousAccess))) || active(existing)))fail('failed-precondition','이미 가족에 연결된 계정이에요.');
      if(approve && !slot && members.docs.filter(d=>!d.data().deletedAt).length>=10)fail('resource-exhausted','가족 구성원 수를 확인해 주세요.');
      const t=now();
      if(approve) {
        const role=relation(req.requestedRole),childKey=role==='CHILD'?id(data.childKey):null;
        if(childKey) {
          const child=await get(tx,`families/${hid}/childLinks/${childKey}`);
          if(!child||child.removedAt)fail('failed-precondition','연결할 아이를 확인해 주세요.');
        }
        // Relation is chosen by the issuer. Approval never grants administrator rights.
        const old=slot?.data(),memberId=slot?.id||existing?.memberId||target;
        const order=old?.order||Math.max(0,...members.docs.map(d=>d.data().order||0))+1;
        tx.set(ref(`families/${hid}/members/${memberId}`),{v:1,uid:target,role,label:req.label,order,createdAt:old?.createdAt||t,updatedAt:t,...(old?.colorKey?{colorKey:old.colorKey}:{}),...(childKey?{childKey}:{})});
        tx.set(ref(accessPath(hid,target)),{status:'ACTIVE',permission:'MEMBER',role,memberId,approvedByUid:uid,approvedAt:t,...(childKey?{childKey}:{})});
        tx.set(ref('accounts/'+target),{v:1,displayName:req.label,role,householdId:hid,memberId,createdAt:a?.createdAt||t,updatedAt:t},{merge:true});
        tx.update(ref('privateFamilyInvites/'+req.inviteHash),{status:'USED',usedByUid:target,usedAt:t});
      }
      tx.update(ref('familyJoinRequests/'+target),{status:approve?'APPROVED':'REJECTED',decidedByUid:uid,decidedAt:t});
      return {ok:true};
    });
  }
  async function status(uid) {
    const r=(await ref('familyJoinRequests/'+uid).get()).data();
    const a=(await ref('accounts/'+uid).get()).data();
    if(a?.householdId) {
      const m=(await ref(accessPath(a.householdId,uid)).get()).data();
      if(active(m))return {ok:true,status:'ACTIVE',householdId:a.householdId,memberId:m.memberId,permission:m.permission};
      if(r?.status!=='PENDING')return {ok:true,status:'REVOKED'};
    }
    if(r?.status==='PENDING') {
      const inv=(await ref('privateFamilyInvites/'+r.inviteHash).get()).data();
      if(!inv||inv.status!=='ACTIVE'||inv.expiresAt<=now())return {ok:true,status:'EXPIRED'};
    }
    return {ok:true,status:r?.status||'NONE'};
  }
  async function cancelJoin(uid) {
    return db.runTransaction(async tx=>{
      const r=await get(tx,'familyJoinRequests/'+uid);
      if(r?.status==='PENDING')tx.update(ref('familyJoinRequests/'+uid),{status:'CANCELLED',decidedAt:now()});
      return {ok:true};
    });
  }
  async function revokeInvite(uid,data) {
    const hid=id(data.householdId);
    return db.runTransaction(async tx=>{
      await manager(tx,hid,uid);const f=await get(tx,'families/'+hid);
      if(f.currentInviteHash)tx.update(ref('privateFamilyInvites/'+f.currentInviteHash),{status:'REVOKED'});
      return {ok:true};
    });
  }
  async function removeMember(uid,data) {
    const hid=id(data.householdId);
    return db.runTransaction(async tx=>{
      await manager(tx,hid,uid);
      const display=data.memberId?await get(tx,`families/${hid}/members/${id(data.memberId)}`):null;
      const target=data.targetUid?id(data.targetUid):display?.uid;
      if(!target) {
        if(!display)fail('not-found','가족 구성원을 찾을 수 없어요.');
        tx.update(ref(`families/${hid}/members/${id(data.memberId)}`),{deletedAt:now(),updatedAt:now()});return {ok:true};
      }
      const m=await get(tx,accessPath(hid,target));
      if(!active(m))return {ok:true};
      // Transfer administrator first; never allow accidental last-admin removal.
      if(m.permission==='ADMIN')fail('failed-precondition','관리자 권한을 먼저 이전해 주세요.');
      tx.update(ref(accessPath(hid,target)),{status:'REVOKED',revokedByUid:uid,revokedAt:now()});
      tx.update(ref(`families/${hid}/members/${m.memberId}`),{deletedAt:now(),updatedAt:now()});
      return {ok:true};
    });
  }
  async function transferAdmin(uid,data) {
    const hid=id(data.householdId),target=id(data.targetUid);
    if(target===uid)fail('invalid-argument','다른 보호자를 선택해 주세요.');
    return db.runTransaction(async tx=>{
      await manager(tx,hid,uid);const m=await get(tx,accessPath(hid,target));
      if(!active(m)||m.role==='CHILD')fail('failed-precondition','승인된 보호자를 선택해 주세요.');
      tx.update(ref(accessPath(hid,target)),{permission:'ADMIN'});
      tx.update(ref(accessPath(hid,uid)),{permission:'MEMBER'});
      return {ok:true};
    });
  }
  async function listRequests(uid,data) {
    const hid=id(data.householdId);
    return db.runTransaction(async tx=>{
      await manager(tx,hid,uid);
      const snap=await tx.get(db.collection('familyJoinRequests').where('householdId','==',hid));
      const members=await tx.get(db.collection(`families/${hid}/members`));
      const access=await tx.get(db.collection(`familyAccess/${hid}/members`));
      const kids=await tx.get(db.collection(`families/${hid}/childLinks`));
      const permissions=new Map(access.docs.map(d=>[d.id,d.data()]));
      return {ok:true,requests:snap.docs.map(d=>d.data()).filter(r=>r.status==='PENDING').map(r=>({uid:r.uid,label:r.label,role:r.requestedRole,createdAt:r.createdAt})),
        members:members.docs.map(d=>({...d.data(),memberId:d.id,permission:permissions.get(d.data().uid)?.permission})).filter(m=>!m.deletedAt),
        children:kids.docs.map(d=>({...d.data(),childKey:d.id})).filter(d=>!d.removedAt)};
    });
  }
  async function createChild(uid,data) {
    const hid=id(data.householdId),profile=data.profile;
    if(!profile || typeof profile!=='object' || Array.isArray(profile) || Buffer.byteLength(JSON.stringify(profile))>750000)
      fail('invalid-argument','아이 정보를 확인해 주세요.');
    // Legacy profile shape is retained. New code is an identifier, never a credential.
    const code=codeGenerator().slice(0,6);
    return db.runTransaction(async tx=>{
      const m=await get(tx,accessPath(hid,uid));
      if(!active(m)||!['ADMIN','MEMBER'].includes(m.permission)||m.role==='CHILD')fail('permission-denied','보호자만 아이를 등록할 수 있어요.');
      const existing=await get(tx,'children/'+code);
      if(existing)fail('aborted','아이 등록을 다시 시도해 주세요.');
      const t=now();
      tx.set(ref('children/'+code),{profile,completed:{},updatedAt:t});
      tx.set(ref('childAccess/'+code),{householdId:hid,childKey:code,createdByUid:uid,createdAt:t});
      tx.set(ref(`families/${hid}/childLinks/${code}`),{v:1,familyCode:code,displayName:String(profile.name||'').slice(0,40),order:t,addedAt:t,createdByUid:uid});
      return {ok:true,code,childKey:code};
    });
  }
  async function removeChild(uid,data) {
    const hid=id(data.householdId),code=id(data.code);
    return db.runTransaction(async tx=>{
      await manager(tx,hid,uid);
      const index=await get(tx,'childAccess/'+code);
      if(!index||index.householdId!==hid)fail('permission-denied','이 가족의 아이가 아니에요.');
      const link=await get(tx,`families/${hid}/childLinks/${index.childKey}`);
      if(!index||index.householdId!==hid||!link)fail('permission-denied','이 가족의 아이가 아니에요.');
      tx.update(ref(`families/${hid}/childLinks/${index.childKey}`),{removedAt:now()});
      // Retain data for recovery; rules deny profile/child writes after removal.
      return {ok:true};
    });
  }
  async function resolveChild(uid,data) {
    const hid=id(data.householdId),code=id(data.code);
    return db.runTransaction(async tx=>{
      const m=await get(tx,accessPath(hid,uid)),index=await get(tx,'childAccess/'+code);
      if(!active(m)||!index||index.householdId!==hid)fail('permission-denied','이 가족에 연결된 아이만 불러올 수 있어요.');
      const link=await get(tx,`families/${hid}/childLinks/${index.childKey}`);
      if(!link||link.removedAt)fail('not-found','연결된 아이 기록을 찾을 수 없어요.');
      return {ok:true,childKey:index.childKey};
    });
  }
  async function updateMember(uid,data) {
    const hid=id(data.householdId),mid=id(data.memberId);
    const name=label(data.label),role=relation(data.role);
    if(!Number.isFinite(data.order)||data.order<0)fail('invalid-argument','정렬 순서를 확인해 주세요.');
    if(data.colorKey&&!/^p(?:[1-9]|10)$/.test(data.colorKey))fail('invalid-argument','색을 확인해 주세요.');
    return db.runTransaction(async tx=>{
      const caller=await get(tx,accessPath(hid,uid)),member=await get(tx,`families/${hid}/members/${mid}`);
      if(!active(caller)||caller.role==='CHILD'||caller.permission==='VIEWER'||!member||member.deletedAt)fail('permission-denied','가족 구성원을 변경할 수 없어요.');
      const linked=member.uid?await get(tx,accessPath(hid,member.uid)):null;
      if(role!==member.role&&caller.permission!=='ADMIN')fail('permission-denied','관계 변경은 가족 관리자만 할 수 있어요.');
      if(linked&&role==='CHILD'&&(!linked.childKey||linked.permission==='ADMIN'))fail('failed-precondition','아이 계정 연결을 먼저 확인해 주세요.');
      const patch={label:name,role,order:data.order,updatedAt:now(),...(data.colorKey?{colorKey:data.colorKey}:{})};
      tx.update(ref(`families/${hid}/members/${mid}`),patch);
      if(linked) {
        tx.update(ref(accessPath(hid,member.uid)),{role});
        tx.update(ref('accounts/'+member.uid),{displayName:name,role:['MOM','DAD','CHILD','CAREGIVER'].includes(role)?role:'CAREGIVER',updatedAt:now()});
      }
      return {ok:true};
    });
  }
  return {createFamily,issueInvite,requestJoin,decideJoin,status,cancelJoin,revokeInvite,removeMember,transferAdmin,listRequests,createChild,removeChild,resolveChild,updateMember};
}
module.exports={createService,newCode,hash};
