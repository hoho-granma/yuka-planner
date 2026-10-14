/* Optional evidence contract. No inference, scoring, or automatic institution matching. */
(function(root,factory){if(typeof module!=='undefined'&&module.exports)module.exports=factory();else root.GrowthEvidence=factory();})(typeof window!=='undefined'?window:global,function(){
 'use strict';
 const FIELDS=['experienceId','experienceStatus','occurredDate','datePrecision','feedbackAt','institutionRef','activitySnapshot','occurrenceRef','relationshipStatus','evidenceEntries'];
 const clone=v=>JSON.parse(JSON.stringify(v));
 function fields(record){const out={};for(const key of FIELDS)if(record[key]!==undefined)out[key]=clone(record[key]);validate(out);return out;}
 function validate(d){
  if(JSON.stringify(d).length>64000)throw Error('근거 메타데이터가 너무 커요.');
  for(const key of ['experienceId','experienceStatus','datePrecision','relationshipStatus'])if(d[key]!=null&&typeof d[key]!=='string')throw Error('경험 메타데이터를 확인해 주세요.');
  if(d.experienceStatus&&!['unknown','planned','occurred','notOccurred'].includes(d.experienceStatus))throw Error('실제 경험 상태를 확인해 주세요.');
  if(d.relationshipStatus&&!['unknown','confirmed','duplicateCandidate'].includes(d.relationshipStatus))throw Error('경험 연결 상태를 확인해 주세요.');
  for(const key of ['occurredDate','feedbackAt'])if(d[key]!=null&&(!/^\d{4}-\d{2}-\d{2}$/.test(d[key])||new Date(d[key]+'T00:00:00Z').toISOString().slice(0,10)!==d[key]))throw Error('경험·피드백 날짜를 확인해 주세요.');
  if(d.evidenceEntries!==undefined){
   if(!Array.isArray(d.evidenceEntries)||d.evidenceEntries.length>20)throw Error('근거는 기록당 20개 이내로 연결해 주세요.');
   const ids=new Set();for(const e of d.evidenceEntries){if(!e||typeof e.evidenceId!=='string'||!e.evidenceId||!Number.isInteger(e.evidenceVersion)||e.evidenceVersion<1||ids.has(e.evidenceId))throw Error('근거 ID와 버전을 확인해 주세요.');ids.add(e.evidenceId);}
  }
  return d;
 }
 function project(r,ctx){return {recordId:r.id,revision:r.revision,childKey:ctx.childKey,familyId:ctx.familyId,recordDate:r.date,registeredAt:r.registeredAt||r.createdAt,experienceId:r.experienceId||null,experienceStatus:r.experienceStatus||'unknown',occurredDate:r.occurredDate||null,institutionRef:r.institutionRef||null,activityId:r.activityId||null,evidenceEntries:r.evidenceEntries||[],original:r};}
 function reference(r,ctx,evidenceId){const e=(r.evidenceEntries||[]).find(x=>x.evidenceId===evidenceId);if(evidenceId&&!e)throw Error('근거를 찾을 수 없어요.');return {familyId:ctx.familyId,childKey:ctx.childKey,recordId:r.id,revision:r.revision,evidenceId:e?e.evidenceId:null,version:e?e.evidenceVersion:null};}
 function resolve(r,ref,ctx){
  if(ref.familyId!==ctx.familyId||ref.childKey!==ctx.childKey)return {status:'context_changed'};
  if(!r||r.deletedAt)return {status:'missing'};
  if(r.id!==ref.recordId||r.revision!==ref.revision)return {status:'stale'};
  if(ref.evidenceId){const e=(r.evidenceEntries||[]).find(x=>x.evidenceId===ref.evidenceId);if(!e||e.supersededBy||e.evidenceVersion!==ref.version||(r.evidenceEntries||[]).some(x=>x.supersedes===e.evidenceId))return {status:'stale'};}
  return {status:'ok',record:r};
 }
 function experiences(records){const ids=new Set();let unconfirmed=0;for(const r of records){if(r.deletedAt)continue;if(r.experienceStatus==='occurred'&&r.relationshipStatus==='confirmed'&&r.experienceId)ids.add(r.experienceId);else unconfirmed++;}return {confirmedExperienceCount:ids.size,unconfirmedRecordCount:unconfirmed};}
 function mapActivity({activityId,childKey,institutionRef,legacyAliases=[],linkedScheduleIds=[],confirmed=false}){if(!confirmed||!activityId||!childKey)throw Error('활동 연결은 명시적 확인이 필요해요.');return {activityId,childKey,institutionRef:institutionRef?clone(institutionRef):null,legacyAliases:[...legacyAliases],linkedScheduleIds:[...linkedScheduleIds],status:'confirmed'};}
 return {FIELDS,fields,validate,project,reference,resolve,experiences,mapActivity};
});
