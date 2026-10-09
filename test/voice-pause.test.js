const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const PV=require('../js/capture/photo-view');
const app=fs.readFileSync(require.resolve('../js/app.js'),'utf8');
const flag=app.match(/const VOICE_INPUT_ENABLED = (true|false);/)[0];

test('paused capture menu retains photo, message and direct input without microphone entry',()=>{
 const html=PV.renderMenu('gallery',{voiceEnabled:false});
 assert.doesNotMatch(html,/data-cap-menu="voice"/);
 for(const mode of ['gallery','paste','direct'])assert.match(html,new RegExp('data-cap-menu="'+mode+'"'));
});

test('stale schedule and task voice actions cannot create a microphone controller',()=>{
 assert.match(flag,/false/);
 const task=app.slice(app.indexOf('  function charStartVoice(){'),app.indexOf('\n',app.indexOf('  function charStartVoice(){')));
 const scheduleStart=app.indexOf('  function capMenuClick(id) {');
 const schedule=app.slice(scheduleStart,app.indexOf('\n  }',scheduleStart)+4);
 const sharedStart=app.indexOf('  capMenuClick=function(mode){');
 const shared=app.slice(sharedStart,app.indexOf('\n  };',sharedStart)+5);
 // No browser/form globals are provided: disabled handlers must return before touching them.
 const context=vm.createContext({});
 vm.runInContext(flag+task+schedule+';charStartVoice();capMenuClick("voice");'+shared+';capMenuClick("voice");',context);
});

test('schedule and task method lists remove voice while keeping the other methods',()=>{
 const lists=[
  /\[\["direct","직접 입력"\][^\n]+?\.filter\(\(\[mode\]\)=>mode!=="voice"\|\|VOICE_INPUT_ENABLED\)/,
  /\[\['direct','직접 입력'\][^\n]+?\.filter\(\(\[mode\]\)=>mode!=='voice'\|\|VOICE_INPUT_ENABLED\)/,
 ];
 for(const pattern of lists){
  const expression=app.match(pattern)?.[0];assert.ok(expression);
  const modes=vm.runInNewContext(flag+expression).map(([mode])=>mode);
  assert.equal(modes.includes('voice'),false);assert.equal(modes.includes('direct'),true);
  assert.equal(modes.length,3);
 }
 for(const line of app.split('\n').filter(line=>line.includes('CapturePhotoView.renderMenu(')))assert.match(line,/voiceEnabled: VOICE_INPUT_ENABLED/);
});
