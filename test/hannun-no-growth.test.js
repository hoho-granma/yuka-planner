'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'js/app.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
assert(!html.includes('data-nav="growth"'), '한눈육아 하단에 성장기록 진입이 없어야 한다');
assert(!html.includes('id="tab-growth"'), '성장기록 화면 자체를 포함하지 않는다');
assert(!app.includes('의 성장 이야기</h3>'), '홈 성장 이야기 카드를 생성하지 않는다');
const gate = app.match(/  function growthActive\(\) \{[\s\S]*?\n  \}/)[0];
const layout = app.match(/  function applyTabLayout\(\) \{[\s\S]*?\n  \}/)[0];
const hidden = new Map();
const ctx = {
  profile: null, currentTab: 'home', acct: {user: {uid: 'test'}},
  // 이전 전체 번들의 성장 모듈이 남아 있어도 활성화되면 안 된다.
  GrowthRecords: {eligible: () => true}, ChildTimeline: {completedMonths: () => 96},
  isPregnant: () => false, acctExpecting: () => false, tabLayoutOn: () => true,
  document: {querySelector: selector => ({classList: {toggle: (_, value) => hidden.set(selector, value), remove: () => hidden.set(selector, false)}})},
  renderAll: () => {}, tabChildBarSync: () => {},
  switchTab: name => {ctx.currentTab = name;},
  growthNeedsRender: () => {throw Error('성장 화면을 조회하면 안 된다');},
  renderGrowthTab: () => {throw Error('성장 화면을 그리면 안 된다');},
  GrowthSync: {warm: () => {throw Error('성장 자료를 읽으면 안 된다');}},
  growthWarmed: false,
};
vm.createContext(ctx);
vm.runInContext(gate + '\n' + app.match(/  const placesHiddenNow = .*;/)[0] + '\n' + layout + '\n' + app.match(/  const renderAllTcbBase = renderAll;[\s\S]*?\n  \};/)[0], ctx);
for (const profile of [{name:'수아'}, {name:'아기'}, {name:'수아'}, null]) {
  ctx.profile = profile;
  ctx.currentTab = 'growth'; // 삭제·아이 교체 전에 남아 있던 옛 화면
  vm.runInContext('renderAll()', ctx);
  assert.equal(ctx.currentTab, 'home');
  assert.equal(hidden.get('.nav-item[data-nav="growth"]'), true);
  assert.equal(hidden.get('.nav-item[data-nav="places"]'), false);
}
console.log('한눈육아 성장기록 제거: 아이 등록·교체·삭제·빈 가구 및 이전 모듈 잔존 검사 PASS');
