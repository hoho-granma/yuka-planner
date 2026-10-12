'use strict';
// 서버 이메일 동기화 로직(메모리 가짜 Firestore — 에뮬레이터는 JDK 21 이 필요해 family-access-server.test.js 에서 따로 돈다)
const test = require('node:test'), assert = require('node:assert/strict');
const { createService } = require('../functions/family-access');
function fakeDb() {
  const docs = new Map();
  const docRef = (path) => ({ path, id: path.split('/').pop() });
  const colSnap = (prefix) => ({ docs: [...docs].filter(([p]) => p.startsWith(prefix + '/') && !p.slice(prefix.length + 1).includes('/')).map(([p, d]) => ({ id: p.split('/').pop(), data: () => ({ ...d }), ref: docRef(p) })) });
  const getOf = (r) => r.col ? colSnap(r.col) : { data: () => (docs.has(r.path) ? { ...docs.get(r.path) } : undefined), exists: docs.has(r.path) };
  const write = (r, v, o) => docs.set(r.path, o && o.merge ? { ...(docs.get(r.path) || {}), ...v } : { ...v });
  const upd = (r, v) => { if (!docs.has(r.path)) throw new Error('no doc ' + r.path); docs.set(r.path, { ...docs.get(r.path), ...v }); };
  return {
    docs,
    doc: docRef,
    collection: (c) => ({ col: c, get: async () => colSnap(c) }),
    runTransaction: async (fn) => fn({ get: async (r) => getOf(r), set: write, update: upd }),
  };
}
const setup = (emails) => { const db = fakeDb(); return { db, s: createService(db, { emailOf: async (uid) => emails[uid] || '' }) }; };

test('가족 생성 때 서버가 읽은 이메일(소문자)을 구성원 문서에 남기고, 클라이언트가 보낸 값은 무시한다', async () => {
  const { db, s } = setup({ mom: 'Mom@Example.com' });
  const r = await s.createFamily('mom', { displayName: '엄마', role: 'MOM', email: 'forged@evil.com' });
  assert.equal(db.docs.get(`families/${r.householdId}/members/${r.memberId}`).email, 'mom@example.com');
});
test('이메일을 못 읽으면(Auth 오류) 이메일 없이 만들어진다', async () => {
  const db = fakeDb(), s = createService(db, { emailOf: async () => { throw new Error('auth down'); } });
  const r = await s.createFamily('mom', { displayName: '엄마', role: 'MOM' });
  assert.ok(!('email' in db.docs.get(`families/${r.householdId}/members/${r.memberId}`)));
});
test('syncMyEmail: 바뀐 이메일을 구성원·계정 문서에 맞추고, 같으면 쓰지 않으며, 가족이 없으면 아무 일 없다', async () => {
  const emails = { mom: 'a@x.com' };
  const { db, s } = setup(emails);
  const r = await s.createFamily('mom', { displayName: '엄마', role: 'MOM' });
  const mp = `families/${r.householdId}/members/${r.memberId}`;
  assert.equal((await s.syncMyEmail('mom')).synced, false);
  emails.mom = 'B@x.com';
  assert.equal((await s.syncMyEmail('mom')).synced, true);
  assert.equal(db.docs.get(mp).email, 'b@x.com');
  assert.equal(db.docs.get('accounts/mom').email, 'b@x.com');
  assert.equal((await s.syncMyEmail('nobody')).synced, false);
  db.docs.get(mp).deletedAt = 1; emails.mom = 'c@x.com';
  assert.equal((await s.syncMyEmail('mom')).synced, false, '삭제된 구성원 문서는 건드리지 않는다');
});
test('구성원 이름·역할 수정이 이메일을 지우지 않는다', async () => {
  const { db, s } = setup({ mom: 'm@x.com' });
  const r = await s.createFamily('mom', { displayName: '엄마', role: 'MOM' });
  await s.updateMember('mom', { householdId: r.householdId, memberId: r.memberId, label: '주연', role: 'MOM', order: 1 });
  assert.equal(db.docs.get(`families/${r.householdId}/members/${r.memberId}`).email, 'm@x.com');
});
test('초대 승인(decideJoin) 때 합류자의 이메일도 구성원 문서에 남는다', async () => {
  const { db, s } = setup({ mom: 'mom@x.com', dad: 'Dad@x.com' });
  const r = await s.createFamily('mom', { displayName: '엄마', role: 'MOM' });
  const inv = await s.issueInvite('mom', { householdId: r.householdId, role: 'DAD' });
  await s.requestJoin('dad', { code: inv.code, displayName: '아빠' }, '1.1.1.1');
  await s.decideJoin('mom', { householdId: r.householdId, targetUid: 'dad', approve: true });
  const mid = db.docs.get('accounts/dad').memberId;
  assert.equal(db.docs.get(`families/${r.householdId}/members/${mid}`).email, 'dad@x.com');
});
