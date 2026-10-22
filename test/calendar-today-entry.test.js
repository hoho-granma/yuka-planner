'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),test=require('node:test');
const app=fs.readFileSync(require('node:path').join(__dirname,'../js/app.js'),'utf8');
const extract=name=>{const start=app.indexOf('  function '+name+'(');return app.slice(start,app.indexOf('\n  }',start)+4);};
function fixture(){
 const RealDate=Date;class Clock extends RealDate{constructor(...args){super(...(args.length?args:[2027,0,1,0,5]));}}
 const draws=[];let hidden=false;
 const c={Date:Clock,document:{visibilityState:'visible',querySelectorAll:()=>[]},window:{scrollTo(){}},el:()=>({classList:{contains:()=>hidden,toggle(){}}}),currentTab:'home',selectedCalendarDate:new Clock(2026,10,10),viewMonth:new Clock(2026,10,1),emptyHome:false,profile:{},checklistScope:null,TAB_NAMES:[],placesHiddenNow:()=>false,applyTabLayout(){},renderCalendar(){draws.push(c.selectedCalendarDate.getTime());},renderSelectedDayPanel(){draws.push(c.selectedCalendarDate.getTime());},renderRemainingList(){},attachListHandlers(){}};
 vm.createContext(c);vm.runInContext(['resetCalendarToToday','resumeCalendarToToday','switchTab'].map(extract).join('\n'),c);
 return {c,draws,setHidden:v=>hidden=v};
}
test('calendar entry resets stale day and month before rendering at year rollover',()=>{const {c,draws}=fixture();c.switchTab('calendar');assert.equal(c.selectedCalendarDate.getFullYear(),2027);assert.equal(c.selectedCalendarDate.getMonth(),0);assert.equal(c.selectedCalendarDate.getDate(),1);assert.equal(c.viewMonth.getMonth(),0);assert.equal(c.viewMonth.getDate(),1);assert.deepEqual(draws,[new c.Date(2027,0,1).getTime(),new c.Date(2027,0,1).getTime()]);});
test('returning to calendar after another menu resets the previous selection',()=>{const {c}=fixture();c.switchTab('calendar');c.selectedCalendarDate=new c.Date(2027,2,15);c.viewMonth=new c.Date(2027,2,1);c.switchTab('home');c.switchTab('calendar');assert.equal(c.selectedCalendarDate.getDate(),1);assert.equal(c.viewMonth.getMonth(),0);});
test('visible app resume resets calendar, while hidden or other menus do not',()=>{const {c,draws,setHidden}=fixture();c.currentTab='calendar';c.document.visibilityState='hidden';c.resumeCalendarToToday();assert.equal(draws.length,0);c.document.visibilityState='visible';setHidden(true);c.resumeCalendarToToday();assert.equal(draws.length,0);setHidden(false);c.currentTab='home';c.resumeCalendarToToday();assert.equal(draws.length,0);c.currentTab='calendar';c.resumeCalendarToToday();assert.equal(draws.length,2);assert.equal(c.selectedCalendarDate.getFullYear(),2027);});
