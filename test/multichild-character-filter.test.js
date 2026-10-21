'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(__dirname+'/../js/app.js','utf8');
const start=source.indexOf('  async function charSelectCalendarFilter(');
const helper=source.slice(start,source.indexOf('\n  }',start)+4);
function fixture(selection,none=false){
 const calls=[];const c={us:{selection,selTouched:false},charNone:none,usCalendarChildSwitchBusy:false,
 usSaveSelection:()=>{},charPeople:()=>['CHILD:baby','CHILD:older','MEMBER:m'].map(key=>({key})),
 usSelectCalendarChild:async id=>calls.push(id),renderCalendar:()=>calls.push('calendar'),renderSelectedDayPanel:()=>calls.push('day')};
 vm.createContext(c);vm.runInContext(helper,c);return {c,calls};
}
test('캐릭터 칩에서 마지막 아이 하나만 남겨도 AUTO 전환 호출',async()=>{
 const {c,calls}=fixture(['CHILD:baby','CHILD:older']);await c.charSelectCalendarFilter('CHILD:older');
 assert.deepEqual(Array.from(c.us.selection),['CHILD:baby']);assert.equal(calls[0],'CHILD:baby');assert.equal(c.us.selTouched,true);
});
test('아이 추가·전체 복원·선택 없음은 필터 의미를 보존',async()=>{
 const {c,calls}=fixture(['CHILD:baby']);await c.charSelectCalendarFilter('CHILD:older');assert.equal(calls[0],'CHILD:older');
 await c.charSelectCalendarFilter('MEMBER:m');assert.equal(c.us.selection.length,0);assert.equal(c.charNone,false);
 const f=fixture(['CHILD:baby']);await f.c.charSelectCalendarFilter('CHILD:baby');assert.equal(f.c.charNone,true);assert.equal(f.c.us.selection.length,0);
});
test('전환 중 추가 클릭은 필터를 바꾸지 않는다',async()=>{
 const {c,calls}=fixture(['CHILD:baby']);c.usCalendarChildSwitchBusy=true;await c.charSelectCalendarFilter('CHILD:older');assert.equal(calls.length,0);assert.deepEqual(c.us.selection,['CHILD:baby']);
});
test('실제 표시 칩 이벤트가 전환 helper를 호출한다',()=>{assert.ok(source.includes('if(b.dataset.charFilter){await charSelectCalendarFilter(b.dataset.charFilter);return;}'));});
test('새로고침 필터는 같은 가족의 세션에서만 복원한다',()=>{
 const a=source.indexOf('  const usSel = () => {');const body=source.slice(a,source.indexOf('\n  };',a)+5).replace('const usSel','this.usSel');
 const c={hh:{hid:'familyA'},usSelectionHousehold:null,us:{selection:[]},charNone:false,usLinks:()=>[],usMembers:()=>[],usSelOpts:()=>({}),UserScheduleView:{normalizeSelection:s=>s},sessionStorage:{getItem:key=>key.endsWith('familyA')?JSON.stringify({selection:['CHILD:baby'],none:false}):null}};
 vm.createContext(c);vm.runInContext(body,c);assert.deepEqual(Array.from(c.usSel()),['CHILD:baby']);
 c.hh.hid='familyB';assert.equal(c.usSel().length,0);
});
