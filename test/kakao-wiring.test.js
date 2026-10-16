'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const AS=require('../js/auth-service');const AV=require('../js/account-view');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');

test('토큰 로그인: 어댑터의 signInWithToken 으로 로그인하고, 빈 토큰·꺼진 플래그는 어댑터를 부르지 않는다',async()=>{
 const calls=[];const adapter={signInWithToken:async t=>{calls.push(t);return {uid:'hn_kakao_1',email:'',displayName:'수아엄마',provider:'kakao'};}};
 const svc=AS.create({features:()=>({accounts:true}),adapter});
 const r=await svc.signInWithToken('TOKEN');
 assert.equal(r.ok,true);assert.equal(r.user.uid,'hn_kakao_1');assert.deepEqual(calls,['TOKEN']);assert.equal(svc.currentUser().uid,'hn_kakao_1');
 assert.equal((await svc.signInWithToken('')).ok,false);assert.equal(calls.length,1);
 const off=AS.create({features:()=>({accounts:false}),adapter});
 assert.deepEqual(await off.signInWithToken('T'),{ok:false,reason:'disabled'});assert.equal(calls.length,1);
});
test('실제 어댑터: signInWithCustomToken 결과를 받고, hn_kakao_ 계정에는 provider 표시가 붙는다',async()=>{
 const fb={auth:()=>({signInWithCustomToken:async t=>({user:{uid:'hn_kakao_9',displayName:'민수',email:null}}),onAuthStateChanged(){}})};
 const a=AS.firebaseAdapter(fb);
 assert.deepEqual(await a.signInWithToken('T'),{uid:'hn_kakao_9',email:'',displayName:'민수',provider:'kakao'});
});
test('카카오 버튼: 카카오 모듈이 켜져 있을 때만 첫 화면·로그인·가입 1단계에 보인다',()=>{
 const has=h=>h.includes('data-acct-action="kakao-login"');
 const views=()=>[AV.renderLanding({}),AV.renderLogin({form:{},errors:{}}),AV.renderSignup({form:{},errors:{},regions:[]})];
 views().forEach(h=>assert.equal(has(h),false)); // 모듈이 없으면 그리지 않는다
 global.KakaoLogin={enabled:()=>true};
 try{views().forEach(h=>assert.equal(has(h),true));assert.match(AV.renderLogin({form:{},errors:{}}),/카카오로 1초 만에 시작하기/);}
 finally{delete global.KakaoLogin;}
 global.KakaoLogin={enabled:()=>false};
 try{views().forEach(h=>assert.equal(has(h),false));}finally{delete global.KakaoLogin;}
});
test('연결: app.js 가 /oauth 복귀를 처리하고 index.html·sw.js·호스팅 규칙이 새 파일과 주소를 안다',()=>{
 const app=read('js/app.js');
 assert.match(app,/acctKakaoComplete\(\);/);assert.match(app,/action === "kakao-login"/);assert.match(app,/httpsCallable\("kakaoLogin"\)/);
 assert.match(app,/acct\.svc\.signInWithToken\(r\.token\)/);
 assert.match(read('index.html'),/<script src="js\/kakao-login\.js\?v=\d+"><\/script>/);
 assert.ok(read('sw.js').includes('"./js/kakao-login.js"'));
 const fj=JSON.parse(read('firebase.json'));
 assert.deepEqual(fj.hosting.rewrites,[{source:'/oauth',destination:'/index.html'}]);
});
test('카카오 계정은 이메일이 없어도 내 계정 줄이 깨지지 않는다',()=>{
 const html=AV.renderAccountSlot?AV.renderAccountSlot({user:{uid:'hn_kakao_1',email:'',displayName:'수아엄마',provider:'kakao'},account:{role:'MOM'},withCode:false}):'';
 assert.ok(!html.includes('undefined'));
});
