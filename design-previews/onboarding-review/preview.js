const designs=[{id:'cards',title:'03 넓은 원 · 라벤더 그레이',note:'문구·배치는 배포된 화면 그대로입니다. 흰 배경과 보라색 브랜드·라벤더 로그인 버튼은 고정하고, 원 두 개의 색만 비교합니다.'}];
const circles=[
{id:'lavender',name:'01 라벤더 · 미스트',top:'#e4daf3',bottom:'#f0eaf8'},
{id:'mint',name:'02 라벤더 · 민트',top:'#e4daf3',bottom:'#dcefe6'},
{id:'peach',name:'03 라벤더 · 피치',top:'#e4daf3',bottom:'#f6e1d5'},
{id:'sky',name:'04 스카이 · 라벤더',top:'#dce9f7',bottom:'#e8ddf3'},
{id:'sand',name:'05 샌드 · 라벤더',top:'#eee1cf',bottom:'#e8ddf3'},
{id:'rose',name:'06 로즈 · 라벤더',top:'#f1dce5',bottom:'#e6dcf1'},
{id:'sage',name:'07 세이지 · 크림',top:'#e0e9db',bottom:'#f3ebd9'},
{id:'blue',name:'08 블루그레이 · 피치',top:'#dfe6f0',bottom:'#f4dfd2'},
{id:'lilac',name:'09 라일락 · 로즈',top:'#e4d8ed',bottom:'#f3e2e9'},
{id:'grey',name:'10 라벤더그레이 · 샌드',top:'#e1dee9',bottom:'#efe5d6'}
];
let active='cards',circle='sand';

const signup={step:1,role:'MOM',situation:'HAS_CHILD',email:'',password:'',displayName:'',familyCode:'',province:'',district:''};
const login={email:'',password:''};
const regions=[{code:'서울특별시',name:'서울특별시',districts:['종로구','구로구','강남구']},{code:'경기도',name:'경기도',districts:['성남시','수원시']}];
function render(){const design=designs[0],selected=circles.find(p=>p.id===circle);document.body.dataset.design=active;document.body.style.setProperty('--circle-top',selected.top);document.body.style.setProperty('--circle-bottom',selected.bottom);document.body.style.setProperty('--preview-bg','#fff');document.body.style.setProperty('--preview-accent','#715697');document.body.style.setProperty('--preview-soft','#e9e1f3');document.getElementById('design-title').textContent=design.title;document.getElementById('design-note').textContent=design.note;document.getElementById('designs').innerHTML=circles.map(p=>`<button data-circle="${p.id}" aria-pressed="${circle===p.id}"><span class="circle-swatches"><i style="background:${p.top}"></i><i style="background:${p.bottom}"></i></span>${p.name}</button>`).join('');document.getElementById('theme').innerHTML=circles.map(p=>`<option value="${p.id}" ${p.id===circle?'selected':''}>${p.name}</option>`).join('');
 document.getElementById('intro').innerHTML=`<div id="view-landing" class="acct-on acct-simple">${AccountView.renderLanding({})}</div>`;
 const fields=[];for(let step=1;step<=3;step++){const tmp=document.createElement('div');tmp.innerHTML=AccountView.renderSignup({form:{...signup,join:false,familyCode:'',step},regions,errors:{}});for(const node of tmp.querySelectorAll('.acct-field'))fields.push(node.outerHTML);}
 document.getElementById('signup').innerHTML=`<div class="acct-form unified-signup"><h3>회원가입</h3>${fields.join('')}<button class="acct-btn-primary" data-acct-action="submit-signup">회원가입</button><button class="acct-link" data-acct-action="open-login">이미 계정이 있어요 · 로그인</button></div>`;
 const code=document.querySelector('#signup [data-acct-input="familyCode"]');if(code)code.value=signup.familyCode||'';
 document.getElementById('login').innerHTML=AccountView.renderLogin({form:login,errors:{}});

}
function choose(id){circle=id;try{localStorage.setItem('hn_onboarding_circle_palette',circle);}catch{}render();}
document.getElementById('designs').onclick=e=>{const b=e.target.closest('[data-circle]');if(b)choose(b.dataset.circle);};
document.getElementById('theme').onchange=e=>choose(e.target.value);
document.addEventListener('input',e=>{const key=e.target.dataset.acctInput;if(key)(e.target.closest('#login')?login:signup)[key]=e.target.value;});
document.addEventListener('change',e=>{const key=e.target.dataset.acctInput;if(key){signup[key]=e.target.value;if(key==='province'){signup.district='';render();}}});
document.addEventListener('click',e=>{const b=e.target.closest('[data-acct-action],[data-acct-radio],[data-demo]');if(!b)return;e.preventDefault();const action=b.dataset.acctAction||b.dataset.demo;if(b.dataset.acctRadio){signup[b.dataset.acctRadio]=b.dataset.value;render();return;}if(action==='next-step'){signup.step=Math.min(AccountView.signupTotal(signup),signup.step+1);render();return;}if(action==='prev-step'){signup.step=Math.max(1,signup.step-1);render();return;}if(action==='join'){signup.join=true;signup.step=2;render();}if(action==='join-off'){signup.join=false;signup.familyCode='';signup.step=1;render();}if(['signup','open-signup','join'].includes(action))document.getElementById('signup').scrollIntoView({behavior:'smooth',block:'center'});else if(['login','open-login'].includes(action))document.getElementById('login').scrollIntoView({behavior:'smooth',block:'center'});else if(!['next-step','prev-step','join-off'].includes(action))document.getElementById('feedback').textContent='디자인 시연입니다. 실제 계정 생성·로그인·복구는 실행하지 않습니다.';});
render();
