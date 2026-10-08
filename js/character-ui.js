/* Character presentation and family task rules. No storage or DOM dependencies. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.CharacterUI=factory();})(typeof window==='object'?window:globalThis,function(){
'use strict';
const base='icons/family/';
const categories={DAD:['회사','모임','운동','병원','취미','자기계발'],MOM:['회사','모임','운동','병원','취미','자기계발'],CHILD:['학교','학원','방과후','운동','친구','체험'],FAMILY:['여행','나들이','외식','행사','친척','모임'],OTHER:['돌봄','회사','병원','운동','모임','취미']};
const colors=['#b14d21','#3876a0','#7e5bb0','#427e56','#77716b','#77717f'];

function categoriesFor(person,today=new Date()){
 if(!person||person.role!=='CHILD')return categories[person&&person.role]||categories.OTHER;
 const birth=new Date(person.birthDate);if(!Number.isFinite(birth.getTime()))return categories.CHILD;
 let months=(today.getFullYear()-birth.getFullYear())*12+today.getMonth()-birth.getMonth();if(today.getDate()<birth.getDate())months--;
 const age=today.getFullYear()-birth.getFullYear()+1;
 return months<36?['어린이집','병원','접종','검진','놀이','체험']:age>=8?categories.CHILD:['유치원','학원','운동','병원','놀이','체험'];
}
function categoryBadge(category,person){const labels=categoriesFor(person);if(labels.includes(category))return {label:category,color:colors[labels.indexOf(category)]};const names={INSTITUTION:labels[0],LESSON:'학원',MEDICAL:'병원',FAMILY:person&&person.role==='CHILD'?'놀이':'가족',ETC:'기타'};const idx=['INSTITUTION','LESSON','MEDICAL','FAMILY','ETC'].indexOf(category);return {label:names[category]||category||'',color:colors[idx>=0?[0,1,3,4,5][idx]:5]};}

function scheduleCategory(label,person){return ['학교','유치원','어린이집','방과후'].includes(label)?'INSTITUTION':label==='학원'?'LESSON':['병원','접종','검진'].includes(label)?'MEDICAL':label==='가족'||person&&person.role==='FAMILY'?'FAMILY':'ETC';}
function normalizeGender(value){const v=String(value||'').trim().toLowerCase();return ['f','female','girl','여아','여자'].includes(v)?'female':['m','male','boy','남아','남자'].includes(v)?'male':null;}
function avatar(role,gender){gender=normalizeGender(gender);return base+(role==='MOM'?'mom-peach.png':role==='DAD'?'dad.jpg':role==='CHILD'?(gender==='male'?'boy.png':gender==='female'?'child.jpg':'child-neutral.svg'):'family-neutral.svg');}
function familyAvatar(children){children=children.map(c=>({...c,gender:normalizeGender(c.gender)}));if(children.length===1&&children[0].gender==='male')return base+'family-boy-lavender.png';if(children.length===1&&children[0].gender==='female')return base+'family-girl-lavender.png';if(children.length===2&&children.some(c=>c.gender==='male')&&children.some(c=>c.gender==='female'))return base+'family-four-lavender.png';return base+'family-neutral.svg';}
function title(raw){const lines=String(raw||'').split(/\n/).map(s=>s.trim()).filter(Boolean);return (lines.find(s=>! /^(안녕하세요|안녕하십니까|학부모님|감사합니다)/.test(s))||lines[0]||'').replace(/\s+/g,' ').slice(0,100);}
function owner(t){return t.ownerKey||'CHILD:'+t.childKey;}
function list(todos,members,today,home){const order=new Map(members.map((m,i)=>[m.key,i]));return todos.filter(t=>!t.deletedAt&&order.has(owner(t))&&(!home||!t.done&&(!t.dueDate||t.dueDate>=today))).slice().sort((a,b)=>(order.get(owner(a))-order.get(owner(b)))||String(a.dueDate||'9999').localeCompare(b.dueDate||'9999')||a.order-b.order);}
function deadline(iso,today){if(!iso)return {text:'',tomorrow:false};const next=new Date(today+'T00:00:00Z');next.setUTCDate(next.getUTCDate()+1);return {text:'~'+Number(iso.slice(5,7))+'/'+Number(iso.slice(8,10)),tomorrow:iso===next.toISOString().slice(0,10)};}
function duration(start,end,allDay){if(allDay||!/^([01]\d|2[0-3]):[0-5]\d$/.test(start||'')||!/^([01]\d|2[0-3]):[0-5]\d$/.test(end||''))return '';const minutes=t=>Number(t.slice(0,2))*60+Number(t.slice(3));const n=minutes(end)-minutes(start);return n>0?[Math.floor(n/60)?Math.floor(n/60)+'시간':'',n%60?n%60+'분':''].filter(Boolean).join(' '):'';}
return {scheduleCategory,categoriesFor,categoryBadge,duration,normalizeGender,avatar,familyAvatar,categories,colors,title,owner,list,deadline};
});
