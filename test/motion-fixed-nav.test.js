'use strict';
// 하단 메뉴(position:fixed)는 #view-calendar 안에 있다. 그 영역에 translate/transform 애니메이션이 걸리면
// 애니메이션 동안 메뉴가 화면 바닥이 아니라 영역 바닥에 붙었다가 끝나면 내려오는 현상이 생긴다 — .hn-m-view 는 이동 없이 페이드만 쓴다.
const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('fs'),path=require('path');
const css=fs.readFileSync(path.join(__dirname,'..','css/motion.css'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
test('하단 메뉴는 view-calendar 안에 있고(그래서 이 영역에 이동 효과를 걸면 안 된다)',()=>{
 const a=html.indexOf('id="view-calendar"'),n=html.indexOf('class="bottom-nav"');
 assert.ok(a>0&&n>a);
});
test('.hn-m-view 는 translate 를 쓰는 keyframes 를 쓰지 않는다',()=>{
 const m=css.match(/\.hn-m-view\s*\{\s*animation:\s*([\w-]+)/);assert.ok(m);
 const kf=css.match(new RegExp('@keyframes\\s+'+m[1]+'\\s*\\{[^@]*?\\}\\s*\\}'));
 assert.ok(kf&&!/translate|transform/.test(kf[0]),m[1]);
});
