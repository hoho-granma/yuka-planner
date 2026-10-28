'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const app=fs.readFileSync(require.resolve('../js/app.js'),'utf8');
function line(prefix){const a=app.indexOf(prefix);assert(a>=0,prefix);return app.slice(a,app.indexOf('\n',a));}
test('home uses one header add button for all three days without footer arrows',()=>{
 const c={usActive:()=>true,toISODate:d=>d.toISOString().slice(0,10),usBuildModel:()=>({days:{get:()=>({user:[{}]})}}),charRow:()=>'<div class="schedule-row">일정</div>',hnHomeDay:0};vm.createContext(c);vm.runInContext(line('  usHomeCardHtml=function()'),c);
 for(const day of [0,1,2]){c.hnHomeDay=day;const html=c.usHomeCardHtml();assert.match(html,/<button[^>]+class="hn-header-add" data-hn-hadd aria-label="일정 추가하기">/);assert.equal((html.match(/data-hn-hadd/g)||[]).length,1);assert.match(html,/<button[^>]+class="hn-heading-shortcut" data-char-calendar/);assert.doesNotMatch(html,/hn-hday-more|→/);assert(html.indexOf('data-hn-hadd')<html.indexOf('schedule-row'));}
});
test('home todo adds from the header while the full todo tab retains its footer',()=>{
 const c={charTodoRows:()=>'<div class="task-row">할일</div>',hnTodoHideDone:false};vm.createContext(c);vm.runInContext(line('  function charTodoSection(home)'),c);
 const home=c.charTodoSection(true);assert.match(home,/<button[^>]+class="hn-header-add" data-char-add aria-label="할일 추가하기">/);assert.equal((home.match(/data-char-add/g)||[]).length,1);assert.match(home,/<button[^>]+class="hn-heading-shortcut" data-char-checklist/);assert.doesNotMatch(home,/hn-home-todo-add|→/);assert(home.indexOf('data-char-add')<home.indexOf('task-row'));
 assert.match(c.charTodoSection(false),/hn-todo-add-wide/);
});
test('calendar top has no people or add controls and old hidden filters are cleared',()=>{
 let base=0,cleared=0;const c={charCalSlotsBase:()=>base++,acctEnabled:()=>true,el:()=>({replaceChildren:()=>cleared++})};vm.createContext(c);vm.runInContext(line('  usRenderCalendarSlots=function(model)'),c);c.usRenderCalendarSlots({});assert.equal(base,1);assert.equal(cleared,1);
 const ctx={acctEnabled:()=>true,us:{selection:['CHILD:old'],onlyUser:true},charNone:true,usSel:()=>['CHILD:old'],charModelBase:()=>({days:new Map(),periodList:[]})};vm.createContext(ctx);vm.runInContext(line('  usBuildModel=function(start,end,filter,view)'),ctx);ctx.usBuildModel('a','b');assert.equal(ctx.us.selection.length,0);assert.equal(ctx.us.onlyUser,false);assert.equal(ctx.charNone,false);
});
