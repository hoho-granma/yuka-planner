'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const {createKakaoLogin,KakaoError,ALLOWED_REDIRECTS}=require('../functions/kakao-login');
const REDIR='https://yuka-planner.web.app/oauth';
const ok=o=>({ok:true,json:async()=>o});
function fakeAuth(existing=[]){const users=new Set(existing);const created=[],tokens=[];
 return {created,tokens,auth:{getUser:async uid=>{if(!users.has(uid))throw Object.assign(new Error('nf'),{code:'auth/user-not-found'});return {};},createUser:async p=>{users.add(p.uid);created.push(p);return {};},createCustomToken:async(uid,claims)=>{tokens.push({uid,claims});return 'tok-'+uid;}}};}
function fakeFetch(map,calls=[]){return async(url,init)=>{calls.push({url,body:init&&init.body,auth:init&&init.headers&&init.headers.Authorization});const k=Object.keys(map).find(x=>url.startsWith(x));return k?ok(map[k]):{ok:false,json:async()=>({})};};}
const KAKAO={'https://kauth.kakao.com/oauth/token':{access_token:'AT'},'https://kapi.kakao.com/v2/user/me':{id:777,kakao_account:{profile:{nickname:'수아엄마'},email:'a@b.com'}}};
const mk=(a,f,creds={id:'k',secret:'s'})=>createKakaoLogin({auth:a.auth,getCreds:async()=>creds,fetchImpl:f});

test('새 카카오 사용자는 hn_kakao_번호 계정이 만들어지고 이메일은 넣지 않는다',async()=>{
 const a=fakeAuth(),calls=[];
 const out=await mk(a,fakeFetch(KAKAO,calls))({code:'C',redirectUri:REDIR});
 assert.deepEqual(out,{token:'tok-hn_kakao_777',name:'수아엄마',isNew:true});
 assert.deepEqual(a.created,[{uid:'hn_kakao_777',displayName:'수아엄마'}]);
 assert.deepEqual(a.tokens[0].claims,{sso:'kakao',sname:'수아엄마'});
 assert.match(calls[0].body,/client_secret=s/);assert.match(calls[0].body,new RegExp('redirect_uri='+encodeURIComponent(REDIR)));
 assert.equal(calls[1].auth,'Bearer AT');
});
test('이미 있는 계정이면 새로 만들지 않고, 시크릿 없이도(client_secret 생략) 동작한다',async()=>{
 const a=fakeAuth(['hn_kakao_777']),calls=[];
 const out=await mk(a,fakeFetch({...KAKAO,'https://kapi.kakao.com/v2/user/me':{id:777}},calls),{id:'k',secret:''})({code:'C',redirectUri:REDIR});
 assert.equal(out.isNew,false);assert.equal(out.name,'카카오 계정');assert.equal(a.created.length,0);
 assert.doesNotMatch(calls[0].body,/client_secret/);
});
test('허용하지 않은 주소·빈 코드는 거부한다',async()=>{
 const a=fakeAuth();
 for(const d of [{code:'C',redirectUri:'https://evil.example/oauth'},{code:'',redirectUri:REDIR},{}])
  await assert.rejects(mk(a,fakeFetch({}))(d),e=>e instanceof KakaoError&&e.code==='invalid-argument');
 assert.ok(ALLOWED_REDIRECTS.includes(REDIR));
});
test('키가 아직 없으면 준비 중, 카카오가 코드를 거부하면 확인 실패, 번호가 이상하면 만들지 않는다',async()=>{
 const a=fakeAuth();
 await assert.rejects(mk(a,fakeFetch({}),{})({code:'C',redirectUri:REDIR}),e=>e.code==='failed-precondition'&&/준비 중/.test(e.message));
 await assert.rejects(mk(a,fakeFetch({}))({code:'C',redirectUri:REDIR}),e=>e.code==='failed-precondition');
 await assert.rejects(mk(a,fakeFetch({...KAKAO,'https://kapi.kakao.com/v2/user/me':{name:'x'}}))({code:'C',redirectUri:REDIR}),e=>e.code==='failed-precondition');
 assert.equal(a.created.length,0);
});
function fakeDb(init={}){const docs={...init};return {docs,collection:()=>({doc:id=>({get:async()=>({exists:id in docs,data:()=>docs[id]}),set:async v=>{docs[id]=v;}})})};}
const mkDb=(a,db,f)=>createKakaoLogin({auth:{...a.auth,verifyIdToken:async t=>{if(t!=='ID-mail')throw new Error('bad');return {uid:'mail-uid'};}},db,getCreds:async()=>({id:'k',secret:'s'}),fetchImpl:f});
test('연결 모드: 이메일 계정 로그인 토큰이 맞으면 카카오 번호를 그 계정에 묶는다',async()=>{
 const a=fakeAuth(),db=fakeDb();
 const out=await mkDb(a,db,fakeFetch(KAKAO))({code:'C',redirectUri:REDIR,idToken:'ID-mail'});
 assert.equal(out.linked,true);assert.equal(db.docs['777'].uid,'mail-uid');assert.equal(a.created.length,0);
});
test('연결된 카카오로 로그인하면 새 계정 대신 묶인 이메일 계정의 토큰을 받는다',async()=>{
 const a=fakeAuth(['mail-uid']),db=fakeDb({'777':{uid:'mail-uid'}});
 const out=await mkDb(a,db,fakeFetch(KAKAO))({code:'C',redirectUri:REDIR});
 assert.equal(out.token,'tok-mail-uid');assert.equal(out.isNew,false);assert.equal(a.created.length,0);
});
test('연결 모드 거부: 잘못된 토큰, 카카오 계정끼리, 이미 다른 계정에 묶인 카카오',async()=>{
 const a=fakeAuth(),db=fakeDb({'777':{uid:'other'}});
 await assert.rejects(mkDb(a,db,fakeFetch(KAKAO))({code:'C',redirectUri:REDIR,idToken:'x'}),e=>e.code==='unauthenticated');
 await assert.rejects(mkDb(a,db,fakeFetch(KAKAO))({code:'C',redirectUri:REDIR,idToken:'ID-mail'}),e=>e.code==='already-exists');
});
