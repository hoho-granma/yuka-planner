(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.EducationPublicPrograms=factory();})(typeof window==='undefined'?globalThis:window,function(){
 'use strict';
 function eligible(target,profile,at){
  const birth=profile.birthDate,grade=Number(profile.grade);let m;
  if((m=target.match(/(20\d{2})\s*[~～-]\s*(20\d{2})\s*년생/))){if(!birth)return null;const year=Number(birth.slice(0,4));return year>=Number(m[1])&&year<=Number(m[2]);}
  if((m=target.match(/초(?:등)?\s*(\d)\s*[~～-]\s*(?:초(?:등)?\s*)?(\d)/)))return grade>=1&&grade<=6?grade>=Number(m[1])&&grade<=Number(m[2]):null;
  if((m=target.match(/초(?:등)?\s*(\d)\s*학년/)))return grade>=1&&grade<=6?grade===Number(m[1]):null;
  if((m=target.match(/만\s*(\d+)\s*[~～-]\s*(\d+)\s*세/))){if(!birth)return null;const b=new Date(birth+'T00:00:00Z'),d=new Date(at+9*3600000);let age=d.getUTCFullYear()-b.getUTCFullYear();if(d.getUTCMonth()<b.getUTCMonth()||d.getUTCMonth()===b.getUTCMonth()&&d.getUTCDate()<b.getUTCDate())age--;return age>=Number(m[1])&&age<=Number(m[2]);}
  if(/초등학생/.test(target)&&!/[고중]\s*\d|청소년/.test(target))return grade>=1&&grade<=6;
  if(/누구나|전연령|연령\s*제한\s*없음/.test(target))return true;
  return null;
 }
 function select(items,profile,at=Date.now()){
  const result={items:[],uncertain:0};for(const p of items){const start=Date.parse(p.registrationStart),end=Date.parse(p.registrationEnd);if(!Number.isFinite(start)||!Number.isFinite(end)||end<start||at>end||!['open','upcoming'].includes(p.status))continue;const fits=eligible(p.target||'',profile,at);if(fits===null){result.uncertain++;continue;}if(!fits)continue;result.items.push({...p,status:at<start?'upcoming':'open'});}return result;
 }
 return {eligible,select};
});
