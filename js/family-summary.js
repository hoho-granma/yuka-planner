/* Read-only projection of CalendarModel + CharacterUI. No date/recurrence engine in Swift. */
(function(root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory(require('./character-ui.js'));
  else root.FamilySummary = factory(root.CharacterUI);
})(typeof window !== 'undefined' ? window : globalThis, function(UI) {
  'use strict';
  function normalizeTodos(todos, links) {
    return (todos || []).map(t => {
      if (t.ownerKey) return t;
      const l = (links || []).find(l => !l.removedAt && l.familyCode === t.childKey);
      return l ? {...t, ownerKey: 'CHILD:' + l.childKey} : t;
    });
  }
  const ownerOf = t => UI.owner(t);
  function todosForDay(todos, people, links, date) {
    return UI.list(normalizeTodos(todos, links), people, date, true);
  }
  // 홈은 이번 주(월~일)에 기한이 있는 미완료 할일만, 기한 오름차순으로 보여준다.
  function todosForWeek(todos, people, links, date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return [];
    const start = new Date(date + 'T00:00:00Z');
    if (!Number.isFinite(start.getTime())) return [];
    start.setUTCDate(start.getUTCDate() - (start.getUTCDay() + 6) % 7);
    const end = new Date(start); end.setUTCDate(end.getUTCDate() + 6);
    const first = start.toISOString().slice(0, 10), last = end.toISOString().slice(0, 10);
    return UI.list(normalizeTodos(todos, links), people, date, false)
      .filter(t => !t.done && /^\d{4}-\d{2}-\d{2}$/.test(t.dueDate || '') && t.dueDate >= first && t.dueDate <= last)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  }
  function schedulesForDay(model, date) {
    const day = model.days.get(date);
    if (!day) return [];
    const seen = new Set();
    return [...day.user, ...day.benefit, ...day.planned].filter(o => {
      const key = o.autoChildKey ? JSON.stringify(['AUTO', o.autoChildKey, o.id]) : JSON.stringify(['USER', o.key]);
      if (seen.has(key)) return false;
      seen.add(key); return true;
    });
  }
  const personColor = (people,key) => {const color=(people.find(p=>p.key===key)||{}).color;return /^#[0-9a-f]{6}$/i.test(color||'')?color:'#c2c0e5';};
  function build({model, todos, people, links, context, now, observedAt, timeZone, partial}) {
    const label = key => (people.find(p => p.key === key) || {}).name || '가족';
    const days = [...model.days.keys()].map(date => ({
      date,
      schedules: schedulesForDay(model, date).map(o => {
        const auto = !!o.autoChildKey;
        const owners = auto ? ['CHILD:' + o.autoChildKey] : o.childKeys?.length ? o.childKeys.map(k => 'CHILD:' + k) : [o.assigneeMemberId ? 'MEMBER:' + o.assigneeMemberId : 'FAMILY'];
        return {id: auto ? JSON.stringify([o.autoChildKey, o.id]) : o.key,
          kind: auto ? 'auto' : 'schedule', sourceId: auto ? o.id : o.scheduleId,
          occurrenceKey: auto ? '' : (o.key || ''), childKey: auto ? o.autoChildKey : '',
          title: o.title || '', owner: owners.map(label).join('·'), ownerColor:personColor(people,owners[0]),
          time: o.allDay === false ? o.startTime || '' : '종일',
          done: auto ? !!o.autoDone : !!o.done};
      }),
      todos: todosForDay(todos, people, links, date).map(t => ({id:t.id,kind:'todo',sourceId:t.id,
        occurrenceKey:'',childKey:'',title:t.title,owner:label(ownerOf(t)),ownerColor:personColor(people,ownerOf(t)),time:t.dueDate ? '~' + t.dueDate.slice(5).replace('-', '/') : '',done:false}))
    }));
    return {schemaVersion:1, context, state:'ready', generatedAt:now, observedAt,
      timeZone, partial:!!partial, days};
  }
  return {normalizeTodos, todosForDay, todosForWeek, schedulesForDay, personColor, build};
});
