'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../js/app.js'),'utf8');
const start=source.indexOf('  renderCalendar=function(){charCalBase();');
const renderer=source.slice(start,source.indexOf('\n  const charDayBase',start));
test('multiple owners show their avatar tint as bars and counts, while a single owner retains category bars',()=>{
 const marker={innerHTML:''},day={user:[{owner:'CHILD:a',title:'일정'},{owner:'CHILD:a',title:'일정2'},{owner:'MEMBER:b',title:'가족 일정'}],benefit:[],planned:[]};
 const people={'CHILD:a':{name:'아이',color:'#b6dfcd'},'MEMBER:b':{name:'보호자',color:'#a4cedc'}};
 let selection=[];
 const ctx={charCalBase(){},usActive:()=>true,acctEnabled:()=>true,calWeekOn:()=>false,viewMonth:new Date(2026,9,1),toISODate:()=> '2026-10-01',usBuildModel:()=>({days:new Map([['2026-10-01',day]])}),el:()=>({querySelectorAll:()=>[{querySelector:s=>s==='.num'?{textContent:'1'}:marker}]}),usSel:()=>selection,charOccOwner:o=>o.owner,charPerson:k=>people[k],charTint:p=>p.color,charImage:p=>'<img class="hn-face hn-avatar" alt="'+p.name+'">',esc:String,charBadgeOf:()=>({slot:0,color:'#abcdef'}),usAutoTitleOfEvent:()=>''};
 vm.createContext(ctx);vm.runInContext(renderer,ctx);ctx.renderCalendar();
 assert.match(marker.innerHTML,/hn-day-owner-bar/);assert.match(marker.innerHTML,/background:#b6dfcd/);assert.match(marker.innerHTML,/background:#a4cedc/);assert.match(marker.innerHTML,/<small>\+2<\/small>/);assert.equal((marker.innerHTML.match(/<img/g)||[]).length,2);assert.match(marker.innerHTML,/background:#b6dfcd[^>]*>.*<img[^>]*>.*<small>\+2/);
 selection=['CHILD:a'];ctx.renderCalendar();assert.match(marker.innerHTML,/hn-category-bar/);assert.match(marker.innerHTML,/hn-bar-more">\+1/);
});
