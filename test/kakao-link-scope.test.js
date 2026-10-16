'use strict';
// 카카오 연결 코드가 app.js 바깥 범위(IIFE 최상위)에 있고, 클릭 처리 줄이 실제로 실행되는 위치에 있는지 확인한다.
// (줄 번호 기반 패치로 함수가 다른 블록 안에 들어가 "변수를 찾을 수 없음"으로 시트가 비었던 사고의 재발 방지)
const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('fs'),path=require('path');
const src=fs.readFileSync(path.join(__dirname,'..','js/app.js'),'utf8');
const L=src.split('\n');
const topScope=name=>{const c=L.slice();c.splice(1,0,'return typeof '+name+';');
 return new Function('self','window','document',c.join('\n').replace(/^\(function \(\) \{/,'').replace(/\}\)\(\);\s*$/,''))({}, {}, {});};
test('카카오 연결 함수들은 최상위 범위의 함수다',()=>{
 for(const n of ['acctKakaoLinkable','acctNoticeToast','acctKakaoComplete','acctRenderSlot','famCardData'])assert.equal(topScope(n),'function',n);
});
test('kakao-link 클릭 처리는 kakao-login 바로 다음 줄에 있다',()=>{
 const i=L.findIndex(l=>l.includes('if (action === "kakao-login")'));
 assert.ok(i>0&&L[i+1].includes('if (action === "kakao-link")'));
});
