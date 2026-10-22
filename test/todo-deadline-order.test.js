'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const app=fs.readFileSync(require.resolve('../js/app.js'),'utf8');
test('todo tab prioritizes deadline across owners and keeps undated tasks last',()=>{
 const people=[{key:'CHILD:a'},{key:'CHILD:b'}];const tasks=[{id:'late',ownerKey:'CHILD:a',dueDate:'2026-10-30',order:0},{id:'undated',ownerKey:'CHILD:a',order:1},{id:'early',ownerKey:'CHILD:b',dueDate:'2026-10-21',order:99},{id:'past',ownerKey:'CHILD:b',dueDate:'2026-10-15',order:100},{id:'done',ownerKey:'CHILD:a',dueDate:'2026-10-22',done:true},{id:'deleted',ownerKey:'CHILD:a',dueDate:'2026-10-20',deletedAt:1}].map(t=>({...t,title:t.id}));
 const snapshot=JSON.stringify(tasks),c={usActive:()=>true,toISODate:()=> '2026-10-21',charPeople:()=>people,HouseholdSync:{getTodos:()=>tasks},hh:{hid:'f'},usLinks:()=>[],CharacterUI:require('../js/character-ui'),FamilySummary:require('../js/family-summary'),hnTodoHideDone:false,charImage:()=>'',charPerson:()=>({}),esc:s=>String(s??'')};vm.createContext(c);vm.runInContext(app.match(/  function charTodoRows\(home\)[^\n]+/)[0],c);
 const ids=html=>[...html.matchAll(/data-char-edit="([^"]+)"/g)].map(m=>m[1]);assert.deepEqual(ids(c.charTodoRows(false)),['past','early','done','late','undated']);c.hnTodoHideDone=true;assert.deepEqual(ids(c.charTodoRows(false)),['past','early','late','undated']);assert.equal(JSON.stringify(tasks),snapshot);
});
