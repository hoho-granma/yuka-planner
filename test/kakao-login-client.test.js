'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const K=require('../js/kakao-login');
const mem=()=>{const m={};return {getItem:k=>(k in m?m[k]:null),setItem:(k,v)=>{m[k]=String(v);},removeItem:k=>{delete m[k];}};};
const loc={origin:'https://yuka-planner.web.app',pathname:'/',assigned:null,assign(u){this.assigned=u;}};
const cr={getRandomValues:a=>{a.fill(7);return a;}};

test('콜백 주소는 /oauth, 로그인 주소에 client_id·redirect_uri·state 가 들어간다',()=>{
 assert.equal(K.redirectUri(loc),'https://yuka-planner.web.app/oauth');
 assert.equal(K.isCallback({pathname:'/oauth'}),true);assert.equal(K.isCallback({pathname:'/'}),false);
 const st=mem(),l={...loc,assign(u){this.assigned=u;}};
 const state=K.start({storage:st,location:l,crypto:cr});
 const u=new URL(l.assigned);
 assert.equal(u.origin+u.pathname,'https://kauth.kakao.com/oauth/authorize');
 assert.equal(u.searchParams.get('client_id'),K.REST_API_KEY);assert.equal(u.searchParams.get('redirect_uri'),'https://yuka-planner.web.app/oauth');
 assert.equal(u.searchParams.get('state'),state);assert.equal(st.getItem('hannun_kakao_state'),state);assert.equal(state,'07'.repeat(16));
});
test('state 가 같을 때만 서버에 코드를 넘기고 토큰을 돌려준다(한 번 쓴 state 는 지운다)',async()=>{
 const st=mem();st.setItem('hannun_kakao_state','ST');const calls=[];
 const call=async d=>{calls.push(d);return {token:'T',isNew:true,name:'수아엄마'};};
 assert.deepEqual(await K.complete({search:'?code=C&state=ST',storage:st,location:loc,call}),{ok:true,token:'T',isNew:true,name:'수아엄마'});
 assert.deepEqual(calls,[{code:'C',redirectUri:'https://yuka-planner.web.app/oauth',state:'ST'}]);
 assert.equal((await K.complete({search:'?code=C&state=ST',storage:st,location:loc,call})).ok,false);
});
test('state 불일치·없음·카카오 취소는 서버를 부르지 않는다',async()=>{
 const call=async()=>{throw new Error('호출되면 안 됨');};
 const a=mem();a.setItem('hannun_kakao_state','ST');
 assert.equal((await K.complete({search:'?code=C&state=OTHER',storage:a,location:loc,call})).message,K.MSG.invalid);
 assert.equal((await K.complete({search:'?code=C&state=ST',storage:mem(),location:loc,call})).message,K.MSG.invalid);
 const b=mem();b.setItem('hannun_kakao_state','ST');
 assert.equal((await K.complete({search:'?error=access_denied&state=ST',storage:b,location:loc,call})).message,K.MSG.cancelled);
});
test('서버가 준비 중 등으로 거부하면 그 문구, 그 밖의 오류는 일반 안내',async()=>{
 const mk=()=>{const s=mem();s.setItem('hannun_kakao_state','ST');return s;};
 const r1=await K.complete({search:'?code=C&state=ST',storage:mk(),location:loc,call:async()=>{throw Object.assign(new Error('카카오 로그인은 아직 준비 중이에요.'),{code:'functions/failed-precondition'});}});
 assert.equal(r1.message,'카카오 로그인은 아직 준비 중이에요.');
 const r2=await K.complete({search:'?code=C&state=ST',storage:mk(),location:loc,call:async()=>{throw Object.assign(new Error('internal'),{code:'functions/internal'});}});
 assert.equal(r2.message,K.MSG.generic);
});
