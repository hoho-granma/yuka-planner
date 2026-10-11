'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const Review=require('../js/capture/schedule-review'),View=require('../js/user-schedule-view'),Schedule=require('../js/user-schedule');
const base={...View.newForm({date:'2026-10-25',activeChildKey:'c1'}),title:'빕스 + 경복궁',category:'ETC',scope:'CHILD',childKeys:['c1'],allDay:false,startTime:'10:00',endTime:'16:00',charCategory:'체험',tags:Review.tagsFor({category:'체험',organizerName:'티처투어',isHoliday:false})};
test('외부 주최·체험 태그는 기존 문서로 저장되며 가족 구성원 ID를 만들지 않음',()=>{
 const prepared=View.prepareSave(base,1);assert.equal(prepared.ok,true);const r=Schedule.buildCreateDoc(prepared.input,1);assert.equal(r.ok,true);
 assert.deepEqual(r.doc.tags,['체험','주최:티처투어']);assert.equal(r.doc.categoryLabel,'체험');assert.equal(r.doc.assigneeMemberId,undefined);
 const form=View.formFromSchedule(r.doc),input=View.formToInput(form);assert.deepEqual(input.tags,r.doc.tags);
 assert.deepEqual(View.changesFromForm(form,r.doc),{});
});
test('시간 → 대상 → 제목(6시간) → 체험, 주최자는 목록에 노출하지 않음',()=>{
 const html=Review.timeline({...base,categoryLabel:'체험'},{ownerName:'은찬'});
 assert(!html.includes('티처투어'));
 const markers=['10:00','은찬','빕스 + 경복궁','6시간','체험'];let last=-1;
 for(const marker of markers){const at=html.indexOf(marker,last+1);assert(at>last,marker);last=at;}
 assert(!Review.timeline({...base,title:'<script>alert(1)</script>'}).includes('<script>'));
});
test('학교 휴일은 태그·목록·상세의 휴일 표시를 유지하고 일반 행사는 유지하지 않음',()=>{
 const tags=Review.tagsFor({category:'학교',organizerName:'MICA',isHoliday:true});
 const built=Schedule.buildCreateDoc(View.formToInput({...base,title:'광복절',charCategory:'학교',category:'INSTITUTION',tags,allDay:true,startTime:'',endTime:''}),1);assert.equal(built.ok,true);
 const occ=Schedule.expandOccurrences({...built.doc,id:'school'},'2026-10-01','2026-10-31')[0],card=View.cardData(occ,[]);
 assert.equal(card.isHoliday,true);assert.equal(card.organizerText,'MICA');assert.equal(card.categoryLabel,'학교');
 assert.match(Review.timeline(occ),/hn-holiday/);assert.match(View.renderDetail(card),/us-detail hn-holiday/);assert.match(View.renderDetail(card),/MICA/);
 assert(!Review.timeline({...base,tags:['체험','주최:티처투어']}).includes('hn-holiday'));
});
test('학교·학원·체험 분류는 기존 enum으로 매핑하고 기존 태그를 보존',()=>{
 assert.equal(Review.categoryKey('학교'),'INSTITUTION');assert.equal(Review.categoryKey('학원'),'LESSON');assert.equal(Review.categoryKey('체험'),'ETC');
 assert.deepEqual(Review.tagsFor({category:'학원',organizerName:'수학학원',isHoliday:false},['학교','주최:MICA','휴일','보존']),['학원','주최:수학학원','보존']);
});

test('제목 편집은 저장된 메모를 제목으로 읽거나 메모를 덮어쓰지 않음',()=>{
 const doc=Schedule.buildCreateDoc(View.formToInput({...base,memo:'정확한 시간은 5일 전에 안내합니다.',endDate:'2026-10-27',multiDay:true}),1).doc;
 const form=View.formFromSchedule(doc);assert.equal(Review.entryText(form),'빕스 + 경복궁');
 Review.applyEntryText(form,'경복궁 현장체험');assert.equal(form.memo,doc.memo);
 const patch=View.changesFromForm(form,doc);assert.equal(patch.title,'경복궁 현장체험');assert.equal(patch.memo,undefined);assert.equal(patch.endDate,undefined);
 const changed=Schedule.buildPatch(doc,patch,2);assert.equal(changed.ok,true);assert.equal(changed.after.title,'경복궁 현장체험');assert.equal(changed.after.memo,doc.memo);assert.equal(changed.after.endDate,'2026-10-27');
});
test('시작시간만 있던 일정은 화면용 종료시간을 저장하지 않으며 사용자가 정하면 저장',()=>{
 const doc=Schedule.buildCreateDoc({...View.formToInput(base),endTime:undefined},1).doc;
 const f=View.formFromSchedule(doc);Object.assign(f,{endTime:'11:00',endAuto:true,title:'제목 수정'});
 let patch=View.changesFromForm(f,doc);assert.equal(patch.endTime,undefined);assert.equal(Schedule.buildPatch(doc,patch,2).after.endTime,undefined);
 f.endAuto=false;f.endTime='12:00';patch=View.changesFromForm(f,doc);assert.equal(patch.endTime,'12:00');
});
test('기간·담당(주최자)·메모를 상세에 표시하며 주요 일정 상태는 편집 후에도 유지',()=>{
 const tags=Review.tagsFor({category:'학교',organizerName:'MIAC',isImportant:true,isHoliday:false});
 const doc=Schedule.buildCreateDoc(View.formToInput({...base,title:'여름 캠프',allDay:true,startTime:'',endTime:'',eventDate:'2026-08-03',endDate:'2026-08-07',multiDay:true,charCategory:'학교',category:'INSTITUTION',tags,memo:'준비물: 물통'}),1).doc;
 const occ=Schedule.expandOccurrences({...doc,id:'camp'},'2026-08-01','2026-08-31')[0],card=View.cardData(occ,[]),html=View.renderDetail(card);
 for(const text of ['기간','2026-08-03 ~ 2026-08-07','담당(주최자)','MIAC','준비물: 물통','toggle-important'])assert(html.includes(text),text);
 assert.equal(card.isImportant,true);const f=View.formFromSchedule(doc);Review.applyEntryText(f,'여름 캠프 변경');
 const after=Schedule.buildPatch(doc,View.changesFromForm(f,doc),2).after;assert(after.tags.includes('주요일정'));assert(after.tags.includes('주최:MIAC'));
});
test('원본 버튼은 업로더에게만 표시하고 편집 시 원본 참조를 보존',()=>{
 const source='원본사진:parent:'+'a'.repeat(64);
 const tags=Review.tagsFor({category:'학교',organizerName:'MIAC',isHoliday:true,isImportant:true},[source,...Array.from({length:8},(_,i)=>'태그'+i)]);
 assert(tags.includes(source));assert.equal(tags.length,10);
 const card=View.cardData({...base,id:'original',date:'2026-10-25',tags},[]);
 assert(View.renderDetail(card,{canViewOriginal:true}).includes('원본 보기'));
 assert(!View.renderDetail(card,{canViewOriginal:false}).includes('원본 보기'));
 const doc=Schedule.buildCreateDoc(View.formToInput({...base,tags}),1).doc;
 const form=View.formFromSchedule(doc);Review.applyEntryText(form,'수정한 제목');
 assert(Schedule.buildPatch(doc,View.changesFromForm(form,doc),2).after.tags.includes(source));
});

test('사진 로딩은 스캔용 상태, 실패는 X와 직접 입력 버튼이며 오류 문구를 이스케이프',()=>{
 const busy=Review.analysisStatus('busy','photo');assert(!busy.includes('내용을 정리'));assert(busy.includes('hn-analysis-sr'));
 const error=Review.analysisStatus('error','photo','<script>');assert(error.includes('×'));assert(error.includes('data-message-manual'));assert(!error.includes('<script>'));
});
