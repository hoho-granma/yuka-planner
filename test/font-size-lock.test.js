'use strict';
// 홈·달력 목록·할일 글자 크기 고정(15px) 회귀 검사. 실제 CSS(index.html 의 로드 순서)를 헤드리스 Chrome 에 올려 계산된 크기를 잰다.
// 15px: 섹션 제목. 14px: 일정·할일 제목·시간·기한. 10px: 카테고리 태그(홈·캘린더 목록·할일 탭). 작게 두는 것: (2시간) 같은 소요 시간(.hn-duration)만 12px.
// Chrome 이 없으면 건너뛴다. 사용: node test/font-size-lock.test.js
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process');
const CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
if(!fs.existsSync(CHROME)){console.log('SKIP: Chrome 없음');process.exit(0);}
const root=path.resolve(__dirname,'..');
const R=require('../js/capture/schedule-review.js');
const index=fs.readFileSync(path.join(root,'index.html'),'utf8');
const css=[...index.matchAll(/<link rel="stylesheet" href="(css\/[^"?]+)/g)].map(m=>m[1]);   // 실제 로드 순서 그대로
const tl=R.timeline({title:'스포츠데이 상의 준비',date:'2026-10-20',startTime:'09:00',endTime:'11:00',allDay:false,category:'학교'},{ownerHtml:'<img class="hn-face"/>',categoryColor:'#ff6a1a'});
const task='<div class="hn-task"><button class="hn-check"></button><img class="hn-face"/><time>10/20</time><button class="hn-task-title">준비물 챙기기</button><b class="hn-d1">D-1</b><span class="hn-category">학교</span></div>';
const head='<div class="hn-section-head"><h3>우리 가족 할일</h3></div>';
const expect=[
 ['#home-body .hn-section-head h3',15],['#home-body .hn-task-title',14],['#home-body .hn-task time',14],
 ['#home-body .hn-timeline time',14],['#home-body .hn-timeline strong',14],['#home-body .hn-duration',12],['#home-body .hn-category',10],['#selected-day-list .hn-category',10],
 ['#selected-day-list .hn-timeline time',14],['#selected-day-list .hn-timeline strong',14],['#selected-day-list .hn-duration',12],
 ['#hn-family-tasks-tab .hn-section-head h3',15],['#hn-family-tasks-tab .hn-task-title',14],['#hn-family-tasks-tab .hn-task time',14],['#hn-family-tasks-tab .hn-category',10],
];
const inline=(index.match(/<style id="hn-typography-lock">[\s\S]*?<\/style>/)||[''])[0];   // index.html 끝의 최종 잠금 블록(외부 CSS 뒤에 온다)
if(!inline){console.error('FAIL: index.html 에 hn-typography-lock 블록이 없음');process.exit(1);}
const html='<!doctype html><meta charset=utf8>'+css.map(f=>`<link rel=stylesheet href="file://${path.join(root,f)}">`).join('')+inline+
 `<body class="acct-design theme-warm"><div id="home-body"><section class="card hn-tasks">${head}${task}</section>${tl}</div><div id="selected-day-list">${tl}</div><div id="tab-checklist"><section id="hn-family-tasks-tab" class="card hn-tasks">${head}${task}</section></div>`+
 `<script>setTimeout(function(){var q=${JSON.stringify(expect.map(e=>e[0]))};document.body.insertAdjacentHTML('afterbegin','<pre id=res>'+q.map(function(s){var e=document.querySelector(s);return e?getComputedStyle(e).fontSize:'-'}).join(',')+'</pre>')},300)</script>`;
const file=path.join(os.tmpdir(),'font-size-lock.html');fs.writeFileSync(file,html);
const out=cp.execFileSync(CHROME,['--headless=new','--disable-gpu','--virtual-time-budget=3000','--dump-dom','file://'+file],{encoding:'utf8',stdio:['ignore','pipe','ignore']});
const got=(out.match(/<pre id="res">([^<]*)<\/pre>/)||[])[1];
if(!got){console.error('FAIL: 결과를 읽지 못함');process.exit(1);}
const sizes=got.split(',');let bad=0;
expect.forEach(([sel,px],i)=>{if(sizes[i]!==px+'px'){bad++;console.error(`FAIL ${sel}: ${sizes[i]} (기대 ${px}px)`);}});
if(bad)process.exit(1);
console.log(`font-size lock: PASS (${expect.length}개 — 제목·시간·기한 14px · 섹션 제목 15px · 태그 10px · 소요 시간 12px)`);
