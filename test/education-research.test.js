'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const research=require('../js/education-research');
const view=require('../js/education-reference-view');
test('DB research attaches by exact institution ID and only confirmed content receives added badge',()=>{
 research.load({items:[{id:'J10:123',added:true,checkedAt:'2026-10-12',summary:'초3~6 · 시간표',cost:'2025년 비용 · 현행 미확인',status:'일부 확인',record:'<script>alert(1)</script>',sources:['javascript:alert(1)','https://example.org/source']},{id:'J10:124',added:false,summary:'공식 원문 미확보',record:'미확인',sources:[]}]});
 const items=[{id:'J10:123',name:'학원A',institutionType:'학원'},{id:'J10:124',name:'교습소B',institutionType:'교습소'},{id:'J10:125',name:'같은 이름 다른 지점',institutionType:'학원'}];
 const list=view.choice({browse:'seongnam',favorites:[],compared:[]},{directoryItems:items});
 assert.equal((list.match(/class="ei-research-badge"/g)||[]).length,1);
 const detail=view.institution('J10:123',{directoryItems:items});
 assert.match(detail,/추가 조사 내용/);assert.match(detail,/2025년 비용 · 현행 미확인/);
 assert.match(detail,/&lt;script&gt;/);assert.doesNotMatch(detail,/<script>|href="javascript:/);
 assert.doesNotMatch(view.institution('J10:125',{directoryItems:items}),/추가 조사 내용/);
 assert.match(view.institution('J10:124',{directoryItems:items}),/공식 원문 미확보/);
 research.load(null);assert.equal(research.get('J10:123'),null);
});
