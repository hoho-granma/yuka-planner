'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const parser=require('../js/capture/ai-parser');
const source=fs.readFileSync(require.resolve('../js/app.js'),'utf8');
const body=source.split('  function addMessageAnalysisUI(){')[1].split('\n  const messageTodoRender=')[0].replace(/\n  }\s*$/,'');
function render(kind,form){let html='';const input={insertAdjacentHTML:(position,value)=>{html+=value;}};const el=id=>id==='hn-task-text'||id==='hn-schedule-content'?input:null;new Function('messageSource','el','AiParser','esc',body)(()=>({kind,form,text:'OCR 글자'}),el,parser,String);return html;}
test('사진·메시지 입력만 분석 대상이고 음성·직접 입력은 유지',()=>{
 assert.equal(parser.analysisMode('todo','photo'),'photo');assert.equal(parser.analysisMode('schedule','gallery'),'photo');assert.equal(parser.analysisMode('todo','message'),'message');assert.equal(parser.analysisMode('schedule','paste'),'message');for(const kind of ['todo','schedule'])for(const mode of ['direct','voice'])assert.equal(parser.analysisMode(kind,mode),null);
});
test('사진 OCR 전은 분석 비활성, OCR 완료 후 글자만 전송 안내',()=>{
 for(const [kind,mode] of [['todo','photo'],['schedule','gallery']]){const form=kind==='todo'?{inputMode:mode}:{capInputMode:mode};assert.match(render(kind,form),/data-message-analyze disabled/);const html=render(kind,{...form,ocrReady:true});assert.doesNotMatch(html,/data-message-analyze disabled/);assert.match(html,/사진 내용 분석해서 채우기/);assert.match(html,/사진 원본은 보내지 않아요/);}
});
test('메시지 분석 버튼은 그대로, 직접·음성에 추가 버튼 없음',()=>{
 assert.match(render('todo',{inputMode:'message'}),/메시지에서 찾아 채우기/);assert.equal(render('todo',{inputMode:'direct'}),'');assert.equal(render('schedule',{capInputMode:'voice'}),'');
});
