/* Date facts checked against KASA/KASI calendars on 2026-10-09.
   Coverage is explicit: do not infer unannounced future holidays. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.KoreanHolidays=factory();})(typeof window==='undefined'?globalThis:window,function(){
 'use strict';
 const source='https://www.kasa.go.kr/prog/plcyBrf/brief/kor/sub01_01_04/view.do?plcyBrfNo=431';
 const fixed={'01-01':'신정','03-01':'삼일절','05-01':'노동절','05-05':'어린이날','06-06':'현충일','07-17':'제헌절','08-15':'광복절','10-03':'개천절','10-09':'한글날','12-25':'성탄절'};
 const special={
  2026:{'02-16':'설 연휴','02-17':'설날','02-18':'설 연휴','03-02':'대체공휴일(삼일절)','05-24':'부처님오신날','05-25':'대체공휴일(부처님오신날)','06-03':'전국동시지방선거','08-17':'대체공휴일(광복절)','09-24':'추석 연휴','09-25':'추석','09-26':'추석 연휴','10-05':'대체공휴일(개천절)'},
  2027:{'02-06':'설 연휴','02-07':'설날','02-08':'설 연휴','02-09':'대체공휴일(설날)','05-03':'대체공휴일(노동절)','05-13':'부처님오신날','07-19':'대체공휴일(제헌절)','08-16':'대체공휴일(광복절)','09-14':'추석 연휴','09-15':'추석','09-16':'추석 연휴','10-04':'대체공휴일(개천절)','10-11':'대체공휴일(한글날)','12-27':'대체공휴일(성탄절)'}
 };
 function get(iso){if(!/^\d{4}-\d{2}-\d{2}$/.test(iso)||!special[iso.slice(0,4)])return '';return special[iso.slice(0,4)][iso.slice(5)]||fixed[iso.slice(5)]||'';}
 return {get,source,years:[2026,2027]};
});
