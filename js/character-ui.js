/* Character presentation and family task rules. No storage or DOM dependencies. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.CharacterUI=factory();})(typeof window==='object'?window:globalThis,function(){
'use strict';
const base='icons/family/';
const categories={DAD:['회식','친구약속','회사','운동','기타'],MOM:['회사','친구약속','가족','운동','기타'],CHILD:['학교','학원','병원','놀이','기타'],FAMILY:['여행','외식','행사','운동','기타'],OTHER:['약속','가족','병원','운동','기타']};
const colors=['#b14d21','#3876a0','#7e5bb0','#427e56','#77716b'];
function normalizeGender(value){const v=String(value||'').trim().toLowerCase();return ['f','female','girl','여아','여자'].includes(v)?'female':['m','male','boy','남아','남자'].includes(v)?'male':null;}
function avatar(role,gender){gender=normalizeGender(gender);return base+(role==='MOM'?'mom.jpg':role==='DAD'?'dad.jpg':role==='CHILD'?(gender==='male'?'boy.png':gender==='female'?'child.jpg':'child-neutral.svg'):'family-neutral.svg');}
function familyAvatar(children){children=children.map(c=>({...c,gender:normalizeGender(c.gender)}));if(children.length===1&&children[0].gender==='male')return base+'family-boy-final.png';if(children.length===1&&children[0].gender==='female')return base+'family-girl-final.png';if(children.length===2&&children.some(c=>c.gender==='male')&&children.some(c=>c.gender==='female'))return base+'family-four-final.png';return base+'family-neutral.svg';}
function title(raw){const lines=String(raw||'').split(/\n/).map(s=>s.trim()).filter(Boolean);return (lines.find(s=>! /^(안녕하세요|안녕하십니까|학부모님|감사합니다)/.test(s))||lines[0]||'').replace(/\s+/g,' ').slice(0,100);}
function owner(t){return t.ownerKey||'CHILD:'+t.childKey;}
function list(todos,members,today,home){const order=new Map(members.map((m,i)=>[m.key,i]));return todos.filter(t=>!t.deletedAt&&order.has(owner(t))&&(!home||!t.done&&(!t.dueDate||t.dueDate>=today))).slice().sort((a,b)=>(order.get(owner(a))-order.get(owner(b)))||String(a.dueDate||'9999').localeCompare(b.dueDate||'9999')||a.order-b.order);}
function deadline(iso,today){if(!iso)return {text:'',tomorrow:false};const next=new Date(today+'T00:00:00Z');next.setUTCDate(next.getUTCDate()+1);return {text:'~'+Number(iso.slice(5,7))+'/'+Number(iso.slice(8,10)),tomorrow:iso===next.toISOString().slice(0,10)};}
return {normalizeGender,avatar,familyAvatar,categories,colors,title,owner,list,deadline};
});
