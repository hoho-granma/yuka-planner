'use strict';
// 카카오 첫 시작 시나리오: 첫 화면(카카오 + 이메일 로그인, 회원가입 없음) → 1/3 상황·역할·이름 → 2/3 아이 정보 → 3/3 사는 지역.
const assert = require('node:assert/strict'), fs = require('node:fs');
const A = require('../js/account-view.js');
const withKakao = (on, fn) => { const had = 'KakaoLogin' in globalThis; const prev = globalThis.KakaoLogin; globalThis.KakaoLogin = on ? { enabled: () => true } : undefined; try { fn(); } finally { if (had) globalThis.KakaoLogin = prev; else delete globalThis.KakaoLogin; } };
let n = 0; const t = (name, fn) => { fn(); n++; console.log('  ok  -', name); };

t('첫 화면: 카카오가 켜지면 카카오 버튼 + 이메일 로그인 링크만, 회원가입 버튼 없음', () => withKakao(true, () => {
  const h = A.renderLanding({});
  assert.ok(h.includes('data-acct-action="kakao-login"') && h.includes(A.MSG.landingEmailLogin) && h.includes('data-acct-action="open-login"'));
  assert.ok(!h.includes('data-acct-action="open-signup"'));
  assert.ok(h.indexOf('kakao-login') < h.indexOf('open-login'), '카카오 버튼이 먼저(주인공)');
}));
t('첫 화면: 카카오가 꺼져 있으면(테스트·키 없음) 기존 로그인·회원가입 화면 그대로', () => withKakao(false, () => {
  const h = A.renderLanding({});
  assert.ok(h.includes('data-acct-action="open-signup"') && h.includes('data-acct-action="open-login"') && !h.includes('kakao-login'));
}));
t('로그인 시트: 카카오가 켜지면 회원가입 전환 링크 없음, 꺼지면 있음', () => {
  withKakao(true, () => assert.ok(!A.renderLogin({}).includes('data-acct-action="open-signup"')));
  withKakao(false, () => assert.ok(A.renderLogin({}).includes('data-acct-action="open-signup"')));
});
t('1/3 연결 복구(카카오 새 가족): 상황 → 역할(상황에 맞는 것만) → 이름, 다음·가족 코드 합류·나중에', () => {
  const none = A.renderRecover({ kakao: true, joining: false, form: { displayName: '다은' } });
  assert.ok(none.includes('1/3') && none.includes('data-acct-radio="situation"') && !none.includes('data-acct-radio="role"'), '상황을 고르기 전에는 역할을 보이지 않는다');
  assert.ok(none.includes('data-acct-action="recover-new"') && none.includes('data-acct-action="recover-join-open"') && none.includes('data-acct-action="close"'));
  const exp = A.renderRecover({ kakao: true, joining: false, form: { situation: 'EXPECTING' } });
  assert.ok(exp.includes('예비엄마') && !exp.includes('>자녀<'));
  const has = A.renderRecover({ kakao: true, joining: false, form: { situation: 'HAS_CHILD' } });
  assert.ok(has.includes('엄마') && has.includes('자녀') && !has.includes('예비엄마'));
});
t('1/3 연결 복구: 카카오가 아니거나 합류 모드면 기존 시트 그대로(1/3 표시 없음)', () => {
  assert.ok(!A.renderRecover({ kakao: false, joining: false, form: {} }).includes('1/3'));
  assert.ok(!A.renderRecover({ kakao: true, joining: true, form: {} }).includes('1/3'));
});
t('검증: 카카오 새 가족은 상황 필수·역할은 상황과 맞아야 하고 intent 에 상황이 실린다', () => {
  const base = { role: 'MOM', displayName: '다은', email: '' };
  assert.deepEqual(Object.keys(A.validateRecover({ ...base, needSituation: true }, false).errors), ['situation']);
  const ok = A.validateRecover({ ...base, needSituation: true, situation: 'HAS_CHILD' }, false);
  assert.ok(ok.ok && ok.intent.situation === 'HAS_CHILD' && ok.intent.joiningCode === null);
  assert.ok(!A.validateRecover({ ...base, role: 'CHILD', needSituation: true, situation: 'EXPECTING' }, false).ok, '임신 중에는 자녀 역할 불가');
  const legacy = A.validateRecover(base, false); assert.ok(legacy.ok && !('situation' in legacy.intent), '기존 호출(needSituation 없음)은 그대로');
  assert.ok(A.validateRecover({ ...base, familyCode: 'ABCDEFGH', needSituation: true }, true).ok, '합류는 상황을 묻지 않는다');
});
t('2·3/3 시작 시트: 같은 id 로 기존 저장 로직 재사용, 페이지별 표시·단계 표시', () => {
  const regions = [{ code: '11', name: '서울특별시', districts: ['구로구'] }];
  const p2 = A.renderOnboardChild({ expecting: false, regions, page: 2 });
  for (const id of ['cr-role', 'cr-name', 'cr-date', 'cr-gender', 'cr-province', 'cr-district', 'cr-dong', 'cr-save', 'cr-next', 'cr-prev', 'cr-later', 'cr-error', 'cr-step', 'cr-title']) assert.ok(p2.includes(`id="${id}"`), id);
  assert.ok(p2.includes('2/3') && p2.includes('value="CHILD"') && p2.includes('생년월일') && !p2.includes('출산 예정일</label>'));
  assert.ok(/data-cr-page="3" hidden/.test(p2) && !/data-cr-page="2" hidden/.test(p2), '2페이지가 보이고 3페이지는 숨김');
  const p3 = A.renderOnboardChild({ expecting: true, regions, page: 3, province: '11' });
  assert.ok(p3.includes('3/3') && /data-cr-page="2" hidden/.test(p3) && !/data-cr-page="3" hidden/.test(p3) && p3.includes('출산 예정일') && p3.includes('value="11" selected'));
});
t('초대 링크는 새 주소(옛 주소는 안내 화면이라 초대 정보를 잃는다)', () => {
  assert.ok(A.inviteLink('ABCD1234', 'DAD', 'm1').startsWith('https://yuka-planner.web.app/?join=ABCD1234'));
});
t('app.js 연결: 카카오 여부 전달 · 상황 필수 · 가족 만들기 뒤 시작 시트 · 덮어쓴 가족 추가 시트 앞에서 분기', () => {
  const s = fs.readFileSync('js/app.js', 'utf8');
  assert.ok(s.includes('kakao: !!(acct.user && acct.user.provider === "kakao")') && s.includes('needSituation: !!(acct.user && acct.user.provider === "kakao")'));
  assert.ok(s.includes('acctChildSheetOpen({ onboard: true })') && s.includes('function acctChildSheetOpen(opts)'));
  assert.ok(s.includes('acctChildSheetRender=function(){if(crState&&crState.onboard)return acctOnboardRender();'));
});
console.log(`kakao-onboarding: ${n}개 통과`);
