const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const source = fs.readFileSync(__dirname + '/../js/app.js', 'utf8');
const start = source.indexOf('  async function usSelectCalendarChild(');
const helper = source.slice(start, source.indexOf('\n  }\n', start) + 4);
function fixture(selected = ['CHILD:baby']) {
  const calls = [];
  const context = { familyCode: 'older-code', us: { selection: selected },
    viewMonth: 'October', selectedCalendarDate: 'October 4', usCalendarChildSwitchBusy: false,
    usLinks: () => [{ childKey: 'baby', familyCode: 'baby-code' }, { childKey: 'old', familyCode: 'older-code' }],
    switchTab: tab => calls.push(tab) };
  context.switchToChild = async code => { calls.push(code); context.familyCode = code; context.viewMonth = 'current-month'; context.selectedCalendarDate = 'today'; };
  vm.createContext(context); vm.runInContext(helper, context);
  return { context, calls };
}
test('다른 아이 칩 선택은 AUTO 기준 아이를 전환하고 달·날짜·선택을 유지한다', async () => {
  const { context: c, calls } = fixture();
  await c.usSelectCalendarChild('CHILD:baby');
  assert.equal(c.familyCode, 'baby-code');
  assert.equal(c.viewMonth, 'October'); assert.equal(c.selectedCalendarDate, 'October 4');
  assert.deepEqual(c.us.selection, ['CHILD:baby']);
  assert.deepEqual(calls, ['baby-code', 'calendar']); assert.equal(c.usCalendarChildSwitchBusy, false);
  assert.ok(source.includes('await usSelectCalendarChild(id);'));
});
test('아이 해제·어른 선택·현재 아이 선택은 전환하지 않는다', async () => {
  for (const [selected, id] of [[[], 'CHILD:baby'], [['MEMBER:m'], 'MEMBER:m'], [['CHILD:old'], 'CHILD:old']]) {
    const { context: c, calls } = fixture(selected); await c.usSelectCalendarChild(id); assert.deepEqual(calls, []);
  }
});
test('불러오기 실패에도 필터 전환 잠금 해제', async () => {
  const { context: c } = fixture(); c.switchToChild = async () => { throw new Error('offline'); };
  await assert.rejects(c.usSelectCalendarChild('CHILD:baby'), /offline/);
  assert.equal(c.usCalendarChildSwitchBusy, false);
});
