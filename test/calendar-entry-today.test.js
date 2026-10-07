const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const source=fs.readFileSync(require.resolve('../js/app.js'),'utf8');
const start=source.indexOf('  function switchTab(name) {');
const end=source.indexOf('\n  async function buildAndRender()',start);
test('홈·다른 메뉴에서 캘린더 진입하면 이전 선택 날짜와 월 대신 오늘을 표시',()=>{
 const c={selectedCalendarDate:new Date(2000,0,1),viewMonth:new Date(2000,0,1),currentTab:'home',emptyHome:false,profile:{},checklistScope:null,TAB_NAMES:['home','calendar'],applyTabLayout(){},el(){return {classList:{toggle(){}}}},document:{querySelectorAll(){return []}},window:{scrollTo(){}},renderCalendar(){c.monthRenders=(c.monthRenders||0)+1},renderSelectedDayPanel(){c.dayRenders=(c.dayRenders||0)+1}};
 vm.createContext(c);vm.runInContext(source.slice(start,end),c);
 for(const previous of ['home','trend','checklist']){c.currentTab=previous;c.activeCats=new Set();c.CATEGORY_META={};c.selectedCalendarDate=new Date(2000,0,1);c.switchTab('calendar');const now=new Date();assert.equal(c.selectedCalendarDate.getDate(),now.getDate());assert.equal(c.viewMonth.getMonth(),now.getMonth());assert.equal(c.viewMonth.getFullYear(),now.getFullYear());}
 assert.equal(c.monthRenders,3);assert.equal(c.dayRenders,3);
});
