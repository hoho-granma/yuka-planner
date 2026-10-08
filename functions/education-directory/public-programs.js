'use strict';
const library='https://lib.goe.go.kr/sn/module/teach/index.do?menu_idx=142&search_large_code=54';
const clean=s=>String(s||'').replace(/<!--[\s\S]*?-->/g,'').replace(/<[^>]*>/g,' ').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&#39;/g,"'").replace(/&quot;/g,'"').replace(/\s+/g,' ').trim();
function parseLibrary(html){
 const body=html.match(/<tbody\s+id="teach_list"[^>]*>([\s\S]*?)<\/tbody>/i)?.[1];if(body==null)throw Error('schema');
 const rows=[];for(const match of body.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)){
  const block=match[1],cell=label=>block.match(new RegExp('<td[^>]*data-th="'+label+'"[^>]*>([\\s\\S]*?)<\\/td>','i'))?.[1]||'';
  const state=clean(cell('접수상태'));if(!['수강신청','신청대기','접수중','접수예정'].includes(state))continue;
  const dates=clean(cell('접수기간')).match(/\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}/g),title=clean(cell('강좌명').match(/<a[^>]*class="detail-btn"[^>]*>([\s\S]*?)<\/a>/i)?.[1]);
  const id=cell('강좌명').match(/keyValue3="(\d+)"/i)?.[1],target=clean(cell('강좌명').match(/<dd\s+class="con"[^>]*>([\s\S]*?)<\/dd>/i)?.[1]);
  if(!title||!id||dates?.length!==2||!target)continue;
  rows.push({id:'snlib:'+id,title,provider:'경기도교육청성남도서관',target:target.replace(/^대상\s*:\s*/,''),registrationStart:dates[0].replace(' ','T')+':00+09:00',registrationEnd:dates[1].replace(' ','T')+':00+09:00',status:state==='신청대기'||state==='접수예정'?'upcoming':'open',url:library,source:library});
 }return rows;
}
function createPublicPrograms({fetchImpl=fetch,now=Date.now}={}){let cache,pending;return async()=>{
 if(cache&&now()-cache.time<15*60000)return cache.data;
 if(!pending)pending=(async()=>{
 const coverage=[{name:'성남아트센터',status:'unsupported'},{name:'판교환경생태학습원',status:'unsupported'},{name:'성남시청소년재단',status:'unsupported'}];let items=[];
 try{const results=await Promise.all(['0,1','6'].map(async status=>{const u=new URL(library);u.searchParams.set('search_status',status);const r=await fetchImpl(u,{signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('fetch');const html=await r.text();if(/key="[2-9]"|keyValue="[2-9]"/.test(html.match(/<div[^>]*class="paging"[\s\S]*$/)?.[0]||''))throw Error('pagination');return parseLibrary(html);}));items=[...new Map(results.flat().map(x=>[x.id,x])).values()];coverage.unshift({name:'경기도교육청성남도서관',status:'partial',note:'독서문화행사 접수 중·예정 목록 확인. 도서관의 모든 분야 목록은 아닙니다.'});}catch(e){coverage.unshift({name:'경기도교육청성남도서관',status:'failed'});}
 const data={items,coverage,checkedAt:new Date(now()).toISOString(),source:library};cache={time:now(),data};return data;
 })().finally(()=>pending=null);return pending;
};}
module.exports={parseLibrary,createPublicPrograms};
