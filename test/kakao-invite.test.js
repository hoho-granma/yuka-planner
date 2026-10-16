'use strict';
// 초대 링크: 카카오가 켜진 곳은 이메일 가입 시트 대신 초대 정보를 저장하고, 카카오 로그인 뒤 합류 화면(가족 코드 미리 채움)으로 이어진다.
const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('fs'),path=require('path');
const src=fs.readFileSync(path.join(__dirname,'..','js/app.js'),'utf8');
const fn=(name)=>{const i=src.indexOf('function '+name+'(');assert.ok(i>0,name);return src.slice(i,src.indexOf('\n  }\n',i)+4);};
test('링크 진입: 카카오가 켜져 있으면 가입 시트를 열지 않고 초대 정보를 저장한다',()=>{
 const b=fn('acctOpenLinkSignup');
 assert.ok(b.indexOf('KakaoLogin.enabled()')>0&&b.indexOf('acctPendingJoinSave(link)')>0&&b.indexOf('acctPendingJoinSave(link)')<b.indexOf('acctShowSheet("signup")'));
});
test('복구 시트를 여는 두 곳 모두 초대 정보를 먼저 적용한다',()=>{
 const n=(src.match(/acctApplyPendingJoin\(\);\s*acctShowSheet\("recover"\)/g)||[]).length;
 assert.equal(n,2);
});
test('합류·새 가족이 끝나면 초대 정보를 지운다',()=>{
 assert.ok(/acctPendingJoinClear\(\);\s*if\(fin\.pending\)/.test(src));
});
test('초대 정보는 8자 코드·24시간만 인정한다',()=>{
 const b=fn('acctPendingJoin');assert.ok(b.includes('[A-Z0-9]{8}')&&b.includes('24 * 3600 * 1000'));
});
test('구성원 삭제: 누르는 즉시 목록에서 숨기고, 끝나면(성공·실패 모두) 숨김을 푼다',()=>{
 assert.ok(/memHiding\.add\(id\);[\s\S]{0,200}acctNoticeToast\("삭제하는 중이에요/.test(src));
 assert.ok(/finally \{\s*mem\.saving = false;\s*memHiding\.delete\(id\);/.test(src));
 assert.ok(/filter\(\(\[memberId\]\) => !memHiding\.has\(memberId\)\)/.test(src));
});
