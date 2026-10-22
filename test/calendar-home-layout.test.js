'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const app=fs.readFileSync(require.resolve('../js/app.js'),'utf8');
function line(prefix){const a=app.indexOf(prefix);assert(a>=0,prefix);return app.slice(a,app.indexOf('\n',a));}
test('home today/tomorrow have a bottom add button; day after tomorrow retains calendar navigation',()=>{
 const c={usActive:()=>true,toISODate:d=>d.toISOString().slice(0,10),usBuildModel:()=>({days:{get:()=>({user:[{}]})}}),charRow:()=>'<div class="schedule-row">일정</div>',hnHomeDay:0};vm.createContext(c);vm.runInContext(line('  usHomeCardHtml=function()'),c);
 for(const day of [0,1]){c.hnHomeDay=day;const html=c.usHomeCardHtml();assert.match(html,/<button[^>]+class="hn-hday-more" data-hn-hadd>일정 추가하기/);assert.doesNotMatch(html,/hn-reg-plus/);assert.match(html,/hn-section-link" data-char-calendar/);assert(html.indexOf('schedule-row')<html.indexOf('data-hn-hadd'));}
 c.hnHomeDay=2;const html=c.usHomeCardHtml();assert.match(html,/data-char-calendar>이후 일정은 가족캘린더 보기/);assert.doesNotMatch(html,/data-hn-hadd|hn-reg-plus/);
});
test('calendar top has no people or add controls and old hidden filters are cleared',()=>{
 let base=0,cleared=0;const c={charCalSlotsBase:()=>base++,acctEnabled:()=>true,el:()=>({replaceChildren:()=>cleared++})};vm.createContext(c);vm.runInContext(line('  usRenderCalendarSlots=function(model)'),c);c.usRenderCalendarSlots({});assert.equal(base,1);assert.equal(cleared,1);
 const ctx={acctEnabled:()=>true,us:{selection:['CHILD:old'],onlyUser:true},charNone:true,usSel:()=>['CHILD:old'],charModelBase:()=>({days:new Map(),periodList:[]})};vm.createContext(ctx);vm.runInContext(line('  usBuildModel=function(start,end,filter,view)'),ctx);ctx.usBuildModel('a','b');assert.equal(ctx.us.selection.length,0);assert.equal(ctx.us.onlyUser,false);assert.equal(ctx.charNone,false);
});
