/* Device-local, account/family/child-scoped interests. Selection is transient. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.EducationInterests=factory();})(typeof window==='undefined'?globalThis:window,function(){'use strict';
 const key=opts=>'hannun-education-interests:v1:'+JSON.stringify([opts.scope,opts.familyId||'local']);
 function read(storage,opts,valid){try{const raw=storage.getItem(key(opts));const ids=raw?JSON.parse(raw):[];if(!Array.isArray(ids)||ids.some(x=>typeof x!=='string'))throw Error('관심 학원 저장 형식을 확인해 주세요.');return {ids:[...new Set(ids)].filter(x=>valid.includes(x)),error:''};}catch(e){return {ids:[],error:'관심 학원을 불러오지 못했어요. 기존 저장값은 덮어쓰지 않습니다.'};}}
 function write(storage,opts,ids){storage.setItem(key(opts),JSON.stringify([...new Set(ids)]));}
 function select(ids,id){if(ids.includes(id))return {ids:ids.filter(x=>x!==id),error:''};if(ids.length>=3)return {ids,error:'최대 3곳까지 비교할 수 있어요.'};return {ids:ids.concat(id),error:''};}
 return {key,read,write,select};
});
