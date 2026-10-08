'use strict';
const fail=(code,message)=>{throw Object.assign(new Error(message),{code});};
function createDirectory({key,fetchImpl=fetch,now=Date.now}={}){
 let cache=null,pending=null;
 async function load(){
  if(!key)fail('failed-precondition','기관 조회 설정을 준비 중이에요.');
  async function page(index){
   const url=new URL('https://open.neis.go.kr/hub/acaInsTiInfo');
   for(const [k,v]of Object.entries({KEY:key,Type:'json',pIndex:index,pSize:100,ATPT_OFCDC_SC_CODE:'J10',ADMST_ZONE_NM:'성남시'}))url.searchParams.set(k,v);
   let r;try{r=await fetchImpl(url.toString(),{signal:AbortSignal.timeout(15000)});}catch(e){fail('unavailable','공식 기관 목록에 연결하지 못했어요.');}
   if(!r.ok)fail('unavailable','공식 기관 목록에 연결하지 못했어요.');
   let body;try{body=await r.json();}catch(e){fail('unavailable','공식 응답을 읽지 못했어요.');}
   if(body.RESULT?.CODE==='ERROR-290')fail('failed-precondition','나이스 인증키 설정을 확인해야 해요.');
   const block=body.acaInsTiInfo,head=block?.[0]?.head,code=head?.find(x=>x.RESULT)?.RESULT?.CODE;
   if(code!=='INFO-000'||!Array.isArray(block?.[1]?.row))fail('unavailable','공식 목록을 확인하지 못했어요. 다시 시도하세요.');
   const count=Number(head.find(x=>x.list_total_count!=null)?.list_total_count);if(!Number.isInteger(count)||block[1].row.length!==Math.min(100,Math.max(0,count-(index-1)*100)))fail('unavailable','공식 목록 일부가 누락되었어요.');
   return {total:head.find(x=>x.list_total_count!=null)?.list_total_count,rows:block[1].row};
  }
  const first=await page(1),total=Number(first.total);
  if(!Number.isInteger(total)||total<1||total>20000||first.rows.length!==Math.min(100,total))fail('unavailable','전체 목록을 확인하지 못했어요. 인증키와 조회 제한을 확인하세요.');
  const raw=[...first.rows],pages=Math.ceil(total/100);
  for(let start=2;start<=pages;start+=4){const results=await Promise.all(Array.from({length:Math.min(4,pages-start+1)},(_,i)=>page(start+i)));for(const r of results){if(Number(r.total)!==total)fail('unavailable','기관 목록이 갱신 중이에요. 다시 시도하세요.');raw.push(...r.rows);}}
  if(raw.length!==total)fail('unavailable','기관 목록 일부가 누락되어 다시 조회가 필요해요.');
  const seen=new Map();for(const r of raw){if(r.ADMST_ZONE_NM!=='성남시'||r.REG_STTUS_NM!=='개원')continue;const id=String(r.ATPT_OFCDC_SC_CODE)+':'+String(r.ACA_ASNUM);if(!r.ACA_ASNUM||!r.ACA_NM)fail('unavailable','기관 식별 정보를 확인하지 못했어요.');seen.set(id,{id,name:r.ACA_NM,address:[r.FA_RDNMA,r.FA_RDNDA].filter(Boolean).join(' '),course:r.LE_CRSE_NM||r.REALM_SC_NM||'',courseList:r.LE_CRSE_LIST_NM||'',institutionType:r.ACA_INSTI_SC_NM||'미확인',academyType:r.ACA_KND_NM||'',realm:r.REALM_SC_NM||'',status:r.REG_STTUS_NM,feeRaw:r.THCC_OTHBC_YN==='Y'?(r.PSNBY_THCC_CNTNT||''):null,phone:r.FA_TELNO||null,sourceUpdatedAt:r.LOAD_DTM||null});}
  return {items:[...seen.values()].sort((a,b)=>a.name.localeCompare(b.name,'ko')),rawCount:total,counts:{academy:[...seen.values()].filter(i=>i.institutionType==='학원').length,teachingOffice:[...seen.values()].filter(i=>i.institutionType==='교습소').length},checkedAt:new Date(now()).toISOString(),source:'https://open.neis.go.kr/portal/data/service/selectServicePage.do?infId=OPEN19220231012134453534385&infSeq=1'};
 }
 return async()=>{if(cache&&now()-cache.time<6*3600000)return cache.data;if(!pending)pending=load().then(data=>{cache={time:now(),data};return data;}).finally(()=>{pending=null});return pending;};
}
module.exports={createDirectory};
