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
 for(const text of ['기간','2026-08-03 ~ 2026-08-07','담당(주최자)','MIAC','준비물: 물통'])assert(html.includes(text),text);
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

test('사진 로딩은 접근성 상태, 실패는 X와 직접 입력 버튼이며 오류 문구를 이스케이프',()=>{
 const busy=Review.analysisStatus('busy','photo');assert(!busy.includes('내용을 정리'));assert(busy.includes('hn-analysis-sr'));
 const error=Review.analysisStatus('error','photo','<script>');assert(error.includes('×'));assert(error.includes('data-message-manual'));assert(!error.includes('<script>'));
});


test('주최자 접두어는 달력 제목에서 숨기고 상세 담당에는 유지',()=>{
 const occ={...base,title:'티처투어 빕스',date:'2026-10-25'};
 assert.equal(View.displayTitle(occ),'빕스');
 const card=View.cardData(occ,[]);assert.equal(card.title,'빕스');assert.equal(card.organizerText,'티처투어');
 assert.match(View.renderDetail(card),/티처투어/);
 assert.equal(View.displayTitle({...occ,title:'빕스 티처투어 체험'}),'빕스 티처투어 체험');
});
test('분석 중 사진을 추가로 만들지 않고 후보는 번호 대신 실제 제목 행으로 표시',()=>{
 assert(!Review.analysisStatus('busy','photo','','data:image/png;base64,aA==').includes('<img'));
 const html=Review.html([{title:'Summer Camp',date:'2026-08-03',endDate:'2026-08-07',category:'학교',ownerDisplay:'은찬',selected:true}]);
 assert(!html.includes('일정 1'));assert.match(html,/hn-review-head/);assert.match(html,/Summer Camp/);assert.match(html,/data-batch-select/);assert(!html.includes("hn-edit-icon"));assert.match(html,/data-batch-commit/);assert.match(html,/data-batch-close/);assert.match(html,/2026-08-03 ~ 2026-08-07/);
});

test('후보 편집 순서·한줄 안내·휴일 색상·담당 사진을 유지',()=>{
 const html=Review.html([{title:'휴교',date:'2026-08-15',category:'학교',isHoliday:true,selected:true,editing:true,ownerDisplay:'은찬',ownerImage:'icons/child.png'}]);
 const fields=[...html.matchAll(/data-batch-field="([^"]+)"/g)].map(m=>m[1]);
 assert.deepEqual(fields,['title','date','endDate','startTime','endTime','category','location','organizerName','memo','isImportant']);
 assert.match(html,/1개 · 1개 선택/);assert.match(html,/등록할 일정/);assert(!html.includes('선택·수정 후 저장해 주세요'));assert.match(html,/hn-holiday/);assert(!html.includes('hn-holiday-label'));assert(!html.includes('data-batch-field="isHoliday"'));assert.match(html,/hn-review-avatar/);assert.match(html,/src="icons\/child.png"/);assert(!html.includes('연도 미표기'));
});


test('휴일도 기존 카테고리 색상을 사용하고 제목만 휴일 클래스로 표시',()=>{
 const html=Review.timeline({title:'휴교',allDay:true,category:'학교',isHoliday:true},{categoryColor:'#dacff0'});
 assert.match(html,/hn-holiday/);assert.match(html,/background:#dacff0/);assert.match(html,/>종일<\/time>/);
});


test('즐겨찾기 태그가 있는 기존 일정의 별표와 설정을 복원',()=>{
 const occ={...base,date:'2026-10-25',tags:['체험','주최:티처투어','주요일정'],isImportant:true};
 const html=Review.html([{...occ,selected:true,editing:true}])+View.renderDetail(View.cardData(occ,[]));
 assert(html.includes('toggle-important'));assert(html.includes('hn-important'));assert(html.includes('data-batch-field="isImportant"'));assert(html.includes('★'));assert(html.includes('즐겨찾기'));
});

test('번역된 기간 제목은 저장 후 종료일까지 동일한 제목으로 표시',()=>{
 const doc=Schedule.buildCreateDoc(View.formToInput({...base,title:'여름 캠프',eventDate:'2026-08-03',endDate:'2026-08-07',multiDay:true,allDay:true,startTime:'',endTime:'',charCategory:'학교',category:'INSTITUTION'}),1).doc;
 const model=require('../js/calendar-model').buildCalendarModel({range:{start:'2026-08-01',end:'2026-08-10'},user:{schedules:[{...doc,id:'camp'}]}});
 for(const date of ['2026-08-03','2026-08-04','2026-08-05','2026-08-06','2026-08-07']){const rows=model.days.get(date).user;assert.equal(rows.length,1);assert.equal(View.cardData(rows[0],[]).title,'여름 캠프');}
 assert.equal(model.days.get('2026-08-08').user.length,0);
});

 test('후보 수정은 저장할 때만 반영하고 닫으면 버리며 원본 연결을 유지',()=>{
 const c={title:'원래 제목',date:'2026-08-03',endDate:'2026-08-07',selected:true,ownerColor:'#b6dfcd'};
 Review.beginEdit(c);c.editDraft.title='닫은 수정';Review.cancelEdit(c);assert.equal(c.title,'원래 제목');
 Review.beginEdit(c);c.editDraft.title='저장한 수정';c.editDraft.isImportant=true;Review.applyEdit(c);assert.equal(c.title,'저장한 수정');assert.equal(c.editing,false);
 const ref='원본사진:u:'+ 'a'.repeat(64);const form=Review.candidateForm(c,{tags:[ref]});assert(form.tags.includes(ref));assert(form.tags.includes('주요일정'));assert.equal(form.endDate,'2026-08-07');
 assert.match(Review.html([c]),/--hn-review-person:#b6dfcd/);assert(!Review.html([c]).includes('👶'));
 });

test('후보의 명시된 종료시간은 기본 폼의 자동 종료시간과 무관하게 저장',()=>{
 const f=Review.candidateForm({title:'체험',date:'2026-10-25',startTime:'10:00',endTime:'16:00',category:'체험'},{...base,endAuto:true});
 assert.equal(View.formToInput(f).endTime,'16:00');
});

test('기존 목록에 없던 새 분류(상담 등)도 기타 + 분류 태그로 저장됨',()=>{
 assert.equal(Review.categoryKey('상담'),'ETC');assert.equal(Review.categoryKey('상담','MEDICAL'),'MEDICAL');assert.equal(Review.categoryKey('상담','잘못된값'),'ETC');
 const form=Review.candidateForm({title:'전화 상담 예약',date:'2026-01-04',startTime:'15:00',category:'상담'},{...base,category:'',tags:[]});
 const prepared=View.prepareSave(form,1);assert.equal(prepared.ok,true);
 const doc=Schedule.buildCreateDoc(prepared.input,1).doc;assert.equal(doc.category,'ETC');assert.equal(doc.categoryLabel,'상담');assert.deepEqual(doc.tags,['상담']);
});

test('연도가 없어 채운 일정에만 안내를 보이고, 날짜를 고치면 안내를 거둠',()=>{
 const c={title:'상담',date:'2026-01-04',startTime:'15:00',yearAssumed:true,selected:true};
 assert.match(Review.html([c]),/원본에 연도가 없어 2026년으로 채웠어요/);
 assert(!Review.html([{...c,yearAssumed:false}]).includes('연도가 없어'));
 Review.beginEdit(c);c.editDraft.date='2027-01-04';Review.applyEdit(c);assert.equal(c.yearAssumed,false);assert(!Review.html([c]).includes('연도가 없어'));
});
