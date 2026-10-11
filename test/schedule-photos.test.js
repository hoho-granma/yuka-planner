'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {createSchedulePhotoService,decode}=require('../functions/schedule-photos');
const Source=require('../js/capture/source-photo'),Review=require('../js/capture/schedule-review');
const image='data:image/png;base64,'+Buffer.from([137,80,78,71,13,10,26,10,1,2,3]).toString('base64');
function fixture(){
 const docs=new Map([
  ['accounts/parent',{householdId:'family',memberId:'m1'}],
  ['familyAccess/family/members/parent',{status:'ACTIVE',permission:'ADMIN',memberId:'m1',role:'PARENT'}],
  ['families/family/members/m1',{uid:'parent'}]
 ]),files=new Map(),writes=[];
 const db={doc:path=>({path,get:async()=>({exists:docs.has(path),data:()=>docs.get(path)}),set:async value=>docs.set(path,value)}),runTransaction:async fn=>fn({get:ref=>ref.get(),set:(ref,value)=>docs.set(ref.path,value)})};
 const bucket={file:path=>({save:async(bytes,options)=>{writes.push({path,options});files.set(path,bytes);},download:async()=>[files.get(path)]})};
 return {docs,files,writes,service:createSchedulePhotoService({db,bucket,now:()=>Date.UTC(2026,9,11)})};
}
test('원본을 개인 경로에 한 번 저장하고 같은 계정만 다시 읽음',async()=>{
 const f=fixture(),r=await f.service('parent',{action:'save',familyId:'family',image});
 assert.equal(f.writes.length,1);assert.equal(f.writes[0].path,'privateSchedulePhotos/parent/'+r.photoId);
 assert.equal(f.writes[0].options.metadata.cacheControl,'private, no-store');
 assert.equal(f.writes[0].options.metadata.metadata.firebaseStorageDownloadTokens,undefined);
 assert.deepEqual(await f.service('parent',{action:'save',familyId:'family',image}),r);assert.equal(f.writes.length,1);
 assert.equal((await f.service('parent',{action:'read',photoId:r.photoId})).image,image);
 await assert.rejects(f.service('other',{action:'read',photoId:r.photoId,uid:'parent',storagePath:f.writes[0].path}),{code:'not-found'});
});
test('로그인·승인된 보호자·실제 이미지 검증',async()=>{
 const f=fixture();await assert.rejects(f.service('',{action:'save',familyId:'family',image}),{code:'unauthenticated'});
 f.docs.get('familyAccess/family/members/parent').role='CHILD';
 await assert.rejects(f.service('parent',{action:'save',familyId:'family',image}),{code:'permission-denied'});assert.equal(f.writes.length,0);
 assert.throws(()=>decode('data:image/png;base64,'+Buffer.from('not a photo').toString('base64')),{code:'invalid-argument'});
 assert.throws(()=>decode('data:text/html;base64,YQ=='),{code:'invalid-argument'});
});
test('저장 한도·다른 경로의 메타데이터·손상된 원본 차단',async()=>{
 const f=fixture();f.docs.set('accounts/parent/privateUsage/schedulePhotos',{day:'2026-10-11',count:20});
 await assert.rejects(f.service('parent',{action:'save',familyId:'family',image}),{code:'resource-exhausted'});assert.equal(f.writes.length,0);
 f.docs.delete('accounts/parent/privateUsage/schedulePhotos');const r=await f.service('parent',{action:'save',familyId:'family',image});
 const meta=f.docs.get('accounts/parent/privateSchedulePhotos/'+r.photoId),path=meta.storagePath;
 meta.storagePath='privateSchedulePhotos/other/'+r.photoId;
 await assert.rejects(f.service('parent',{action:'read',photoId:r.photoId}),{code:'not-found'});
 meta.storagePath=path;f.files.set(path,Buffer.from('corrupt'));
 await assert.rejects(f.service('parent',{action:'read',photoId:r.photoId}),{code:'internal'});
});
test('체크 해제·저장 완료 항목은 일괄 등록 대상에서 제외',()=>{
 const selected={selected:true,title:'선택'},unchecked={selected:false,title:'제외'},saved={selected:true,saved:true,title:'이미 저장'};
 assert.deepEqual(Review.selectedCandidates([selected,unchecked,saved,{selected:undefined}]),[selected]);
 assert.deepEqual(Review.selectedCandidates([unchecked]),[]);
});
test('원본 참조는 수정·별표 변경에도 유지되며 타 계정은 요청 전에 차단',async()=>{
 const tag='원본사진:parent:'+'a'.repeat(64);assert.equal(Source.reference([tag]).uid,'parent');
 assert(Review.tagsFor({category:'학교',organizerName:'MIAC',isImportant:true},[tag]).includes(tag));
 await assert.rejects(Source.read([tag],{uid:'other'}),/등록한 계정/);
 assert.equal(Source.reference(['원본사진:parent:../other']),null);
});
