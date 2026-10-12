#!/usr/bin/env node
'use strict';
// 한 계정(--to)을 다른 계정(--from)이 속한 가족에 구성원으로 연결한다. 기본은 점검만(dry-run)이고 --apply 를 줘야 쓴다.
//
//   GOOGLE_APPLICATION_CREDENTIALS=서비스계정키.json node tools/link-account-to-family.js \
//     --from test1@naver.com --to jwebse@gmail.com --role DAD [--admin] [--apply]
//
// 하는 일(승인 방식 데이터 모델 그대로):
//   families/{가족}/members/{to uid}      새 구성원 자리(기존 구성원 문서는 건드리지 않는다)
//   familyAccess/{가족}/members/{to uid}  ACTIVE, MEMBER(또는 --admin 이면 ADMIN)
//   accounts/{to uid}                     householdId·memberId·role·displayName 병합
// 안전장치: from 이 ACTIVE 가 아니면 중단 · to 가 이미 다른 가족의 ACTIVE 면 중단 · 쓰기는 한 트랜잭션.
const path = require('node:path');
const serverRequire = require('node:module').createRequire(path.resolve(__dirname, '../functions/package.json'));
const {initializeApp} = serverRequire('firebase-admin/app');
const {getAuth} = serverRequire('firebase-admin/auth');
const {getFirestore} = serverRequire('firebase-admin/firestore');

const args = process.argv.slice(2);
const opt = k => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : undefined; };
const flag = k => args.includes('--' + k);
const ROLES = ['MOM', 'DAD', 'GRANDPARENT', 'CAREGIVER', 'OTHER'];
const mask = e => e.replace(/^(.{2}).*(@.*)$/, '$1***$2');

(async () => {
  const fromEmail = opt('from'), toEmail = opt('to'), role = opt('role') || 'OTHER', apply = flag('apply'), admin = flag('admin');
  if (!fromEmail || !toEmail || !ROLES.includes(role)) { console.error('사용: --from <이메일> --to <이메일> --role ' + ROLES.join('|') + ' [--admin] [--apply]'); process.exit(2); }
  initializeApp({projectId: 'yuka-planner'});
  const auth = getAuth(), db = getFirestore();
  const [from, to] = await Promise.all([auth.getUserByEmail(fromEmail), auth.getUserByEmail(toEmail)]);
  console.log(`기준 계정 ${mask(fromEmail)} (${from.uid.slice(0, 6)}…) → 연결할 계정 ${mask(toEmail)} (${to.uid.slice(0, 6)}…)  [${apply ? '적용' : '점검만'}]`);
  const result = await db.runTransaction(async tx => {
    const get = async p => (await tx.get(db.doc(p))).data();
    const fromAcc = await get('accounts/' + from.uid);
    if (!fromAcc?.householdId) throw new Error('기준 계정에 연결된 가족이 없어요.');
    const hid = fromAcc.householdId;
    const fromAccess = await get(`familyAccess/${hid}/members/${from.uid}`);
    if (fromAccess?.status !== 'ACTIVE') throw new Error('기준 계정이 그 가족의 ACTIVE 구성원이 아니에요(' + (fromAccess?.status || '승인 문서 없음') + '). 먼저 claimLegacy 또는 초대 승인으로 복구하세요.');
    const toAcc = await get('accounts/' + to.uid);
    if (toAcc?.householdId && toAcc.householdId !== hid) {
      const other = await get(`familyAccess/${toAcc.householdId}/members/${to.uid}`);
      if (other?.status === 'ACTIVE') throw new Error('연결할 계정이 이미 다른 가족의 ACTIVE 구성원이에요. 먼저 그 연결을 정리해야 해요.');
    }
    const already = await get(`familyAccess/${hid}/members/${to.uid}`);
    const members = await tx.get(db.collection(`families/${hid}/members`));
    const order = Math.max(0, ...members.docs.map(d => d.data().order || 0)) + 1;
    const label = (toAcc?.displayName || to.displayName || toEmail.split('@')[0]).slice(0, 20);
    const plan = {householdId: hid.slice(0, 6) + '…', alreadyActive: already?.status === 'ACTIVE', role, permission: admin ? 'ADMIN' : 'MEMBER', label, order,
      existingMembers: members.docs.filter(d => !d.data().deletedAt).map(d => `${d.data().label || '?'}(${d.data().role}${d.data().uid ? ',연결됨' : ''})`)};
    if (apply && !plan.alreadyActive) {
      const t = Date.now();
      tx.set(db.doc(`families/${hid}/members/${to.uid}`), {v: 1, uid: to.uid, role, label, order, createdAt: t, updatedAt: t});
      tx.set(db.doc(`familyAccess/${hid}/members/${to.uid}`), {status: 'ACTIVE', permission: plan.permission, role, memberId: to.uid, approvedByUid: 'admin-script', approvedAt: t, linkedFromAccount: from.uid});
      tx.set(db.doc('accounts/' + to.uid), {v: 1, displayName: label, role, householdId: hid, memberId: to.uid, createdAt: toAcc?.createdAt || t, updatedAt: t}, {merge: true});
    }
    return plan;
  });
  console.log(JSON.stringify(result, null, 2));
  console.log(apply ? (result.alreadyActive ? '이미 연결돼 있어 바꾼 것이 없어요.' : '연결을 적용했어요. 대상 계정으로 다시 로그인해 확인하세요.') : '점검만 했어요. 문제가 없으면 --apply 를 붙여 다시 실행하세요.');
})().catch(e => { console.error('중단:', e.message); process.exit(1); });
