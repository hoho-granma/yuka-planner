'use strict';
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'shared-files-test-'));
const html=`<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="file://${root}/css/shared-files.css"><div id="home-body"></div><div id="modal-content"></div><script src="file://${root}/js/shared-files.js"></script><script>
(async()=>{try{
 const results=[],check=(v,name)=>{if(!v)throw Error(name);results.push(name);},tick=()=>new Promise(r=>setTimeout(r,30));
 let notify,unsubscribed=false;const docs=[],blobs=new Map();
 const c={container:document.getElementById('home-body'),familyId:'family',user:{uid:'mom'},openModal(){},closeModal(){},adapter:{collection:{onSnapshot(fn){notify=()=>fn({docs:docs.map((d,i)=>({id:'file'+i,data:()=>d}))});notify();return ()=>unsubscribed=true;},doc(){return {id:'new',async set(d){docs.push(d);notify();}};}},async upload(p,b){blobs.set(p,b);},async image(p){return blobs.get(p);}}};
 window.AiParser={async parseWithAI(text,date,context){check(context.purpose==='shared-file-title','title-only analysis request');return {ok:true,title:'가족 안내문'};}};
 SharedFiles.mount(c);check(document.querySelector('[data-shared-add]'),'home add button');
 document.querySelector('[data-shared-add]').click();check(document.querySelectorAll('[data-shared-mode]').length===2,'only photo and message modes');check(!document.querySelector('[type=date]'),'no due date');
 document.querySelector('[data-shared-mode=message]').click();const message=document.getElementById('hn-shared-message');message.value='가족에게 전할 메시지';message.dispatchEvent(new Event('input'));document.querySelector('[data-shared-analyze]').click();await tick();check(document.getElementById('hn-shared-title').value==='가족 안내문','title filled');document.querySelector('[data-shared-save]').click();await tick();check(docs.length===1&&docs[0].message==='가족에게 전할 메시지'&&docs[0].imagePath===null,'message saved without image');
 document.querySelector('[data-shared-add]').click();
 const canvas=document.createElement('canvas');canvas.width=3000;canvas.height=2000;canvas.getContext('2d').fillRect(0,0,3000,2000);const blob=await new Promise(r=>canvas.toBlob(r,'image/png'));
 const transfer=new DataTransfer();transfer.items.add(new File([blob],'sample.png',{type:'image/png'}));const input=document.getElementById('hn-shared-photo');input.files=transfer.files;await input.onchange({target:input});
 const title=document.getElementById('hn-shared-title');title.value='사진 안내';title.dispatchEvent(new Event('input'));document.querySelector('[data-shared-save]').click();await tick();await tick();check(docs.length===2&&blobs.size===2,'compressed photo and thumbnail uploaded');
 const full=blobs.get(docs[1].imagePath),bitmap=await createImageBitmap(full);check(bitmap.width===1920&&bitmap.height===1280&&full.type==='image/jpeg','photo resized to 1920 JPEG');bitmap.close();
 const thumb=document.querySelector('.hn-shared-thumb');check(getComputedStyle(thumb).width==='52px'&&getComputedStyle(thumb).height==='52px','52px thumbnail');check(getComputedStyle(document.querySelector('.hn-section-head')).backgroundColor==='rgb(255, 243, 204)','pale yellow header');
 document.querySelector('[data-shared-open=file1]').click();await tick();check(document.querySelector('.hn-shared-view img'),'saved image opens');SharedFiles.reset();check(unsubscribed,'listener released on reset');
 document.body.dataset.testResult='PASS '+results.length;
}catch(e){document.body.dataset.testResult='FAIL '+e.message;}})();</script>`;
const file=path.join(tmp,'fixture.html');fs.writeFileSync(file,html);
(async()=>{
 let chrome,ws;
 try{
  chrome=cp.spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',['--headless=new','--disable-gpu','--allow-file-access-from-files','--no-first-run','--remote-debugging-port=0','--user-data-dir='+path.join(tmp,'chrome'),'about:blank'],{stdio:['ignore','ignore','pipe']});
  const address=await new Promise((resolve,reject)=>{let text='';const timer=setTimeout(()=>reject(Error('Chrome startup timeout')),15000);chrome.stderr.on('data',b=>{text+=b;const m=text.match(/DevTools listening on (ws:\/\/[^\s]+)/);if(m){clearTimeout(timer);resolve(m[1]);}});chrome.on('error',reject);});
  ws=new WebSocket(address);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});let seq=0;const pending=new Map();ws.onmessage=e=>{const m=JSON.parse(e.data);if(pending.has(m.id)){const {resolve,reject}=pending.get(m.id);pending.delete(m.id);m.error?reject(Error(m.error.message)):resolve(m.result);}};
  const call=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));});
  const target=await call('Target.createTarget',{url:'about:blank'});const {sessionId}=await call('Target.attachToTarget',{targetId:target.targetId,flatten:true});
  await call('Page.enable',{},sessionId);await call('Page.navigate',{url:'file://'+file},sessionId);await new Promise(r=>setTimeout(r,400));
  const result=await call('Runtime.evaluate',{expression:"new Promise((resolve,reject)=>{const start=Date.now();const poll=()=>{const r=document.body?.dataset.testResult;if(r)resolve(r);else if(Date.now()-start>25000)reject(Error('test timeout'));else setTimeout(poll,100);};poll();})",awaitPromise:true,returnByValue:true},sessionId);
  assert.match(result.result?.value||JSON.stringify(result),/^PASS \d+$/);console.log('Shared files browser: '+result.result.value);
 }finally{ws?.close();chrome?.kill();await new Promise(r=>setTimeout(r,250));fs.rmSync(tmp,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
