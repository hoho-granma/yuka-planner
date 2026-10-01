/*
 * T4 메타모픽 — USER 일정을 아무리 추가·수정·완료·삭제·예외 처리해도 autoEvents 와 displayDate Map 은 바이트 단위로 같고,
 * AUTO 칸 내용(benefit/planned)은 앱 공식과 같다. 프로필 3종(은찬 고정 계정 / 말일생 / 임신 중) × 고정 시드 무작위 연산 열.
 * 입력 배열은 얼리고 displayDate Map 의 변경 메서드는 막아, 변경하려 들면 즉시 예외가 나며, 이벤트 필드 변조는 직렬화 비교로 잡는다.
 * 실행: node test/t4-metamorphic.test.js
 */
const assert = require("assert");
const { HN, buildAuto, PROFILES, serialize } = require("./tools/load-engine.js");
const US = require("../js/user-schedule.js");
const CM = require("../js/calendar-model.js");

let seed = 20260930;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const pick = (a) => a[Math.floor(rnd() * a.length)];
const STEPS = 300;

function freezeAuto(a) {
  // 배열은 얼려 sort/push 를 막고, 개별 이벤트의 필드 변조는 얼리지 않은 채 직렬화 비교(아래)로 잡는다 — 비엄격 모드 대입은 freeze 에서 조용히 무시되기 때문.
  Object.freeze(a.events);
  const blocked = () => {
    throw new Error("displayDate Map 변경 시도");
  };
  a.displayDates.set = blocked;
  a.displayDates.delete = blocked;
  a.displayDates.clear = blocked;
}

const base = (over) => ({ sourceType: "MANUAL", title: "일정" + Math.floor(rnd() * 1000), category: pick(US.CATEGORIES), scope: "CHILD", childKeys: ["c1"], allDay: true, dateKind: "FIXED", ...over });
function randomInput(today) {
  const day = US.addDays(today, Math.floor(rnd() * 400) - 40);
  if (linkable.length && rnd() < 0.2) return base({ eventDate: day, category: "MEDICAL", autoRef: pick(linkable) }); // C2: 연결 일정
  switch (Math.floor(rnd() * 6)) {
    case 0: return base({ eventDate: day });
    case 1: return base({ eventDate: day, allDay: false, startTime: pick(["08:30", "09:00", "16:00"]), endTime: "18:00" });
    case 2: return base({ eventDate: day, endDate: US.addDays(day, 1 + Math.floor(rnd() * 5)) });
    case 3: return base({ dateKind: "PERIOD", periodStart: day, periodEnd: US.addDays(day, 5 + Math.floor(rnd() * 40)) });
    case 4: return base({ scope: "FAMILY", childKeys: undefined, category: "FAMILY", eventDate: day });
    default: return base({ recurrence: { freq: "WEEKLY", interval: 1, byDay: ["TU", "TH"], startDate: day, until: null } });
  }
}
let linkable = []; // 이 프로필의 연결 가능한 AUTO id(C2 autoRef 후보)
const clean = (o) => (Object.keys(o).forEach((k) => o[k] === undefined && delete o[k]), o);

let totalOps = 0;
for (const [pname, profile] of Object.entries(PROFILES)) {
  const auto = buildAuto(profile);
  freezeAuto(auto);
  linkable = auto.events.filter((e) => CM.isLinkableAuto(e)).map((e) => e.id);
  assert.ok(linkable.length > 0, pname + ": 연결 가능한 AUTO 가 있다");
  const before = serialize(auto.events, auto.displayDates);
  const today = "2026-09-30";
  const store = new Map(); // id -> doc
  let idSeq = 0;
  let hiddenCells = 0; // 연결 때문에 실제로 추천일 표식이 빠진 칸 수(숨김 로직이 실제로 검증됐는지)
  const counts = { add: 0, edit: 0, done: 0, del: 0, exc: 0 };

  for (let step = 0; step < STEPS; step++) {
    const ids = [...store.keys()];
    const r = rnd();
    const now = 1790000000000 + step;
    if (r < 0.4 || ids.length === 0) {
      const res = US.buildCreateDoc(clean(randomInput(today)), now);
      assert(res.ok, JSON.stringify(res.errors));
      store.set("s" + ++idSeq, res.doc);
      counts.add++;
    } else {
      const id = pick(ids);
      const doc = store.get(id);
      let res;
      if (r < 0.55) { res = US.buildPatch(doc, { title: "수정" + step, memo: "m" }, now); counts.edit++; }
      else if (r < 0.7) { res = US.isRecurring(doc) ? US.markDone(doc, now, { date: US.addDays(doc.recurrence.startDate, 7) }) : US.markDone(doc, now); counts.done++; }
      else if (r < 0.85) { res = US.softDelete(doc, now); counts.del++; }
      else if (US.isRecurring(doc)) { res = US.buildPatch(doc, { exceptions: { [US.addDays(doc.recurrence.startDate, 7)]: rnd() < 0.3 ? null : { status: "CANCELLED", note: "휴강" } } }, now); counts.exc++; }
      else { res = US.buildPatch(doc, { assigneeMemberId: "m1" }, now); counts.edit++; }
      assert(res.ok, JSON.stringify(res.errors));
      store.set(id, res.after);
    }

    const schedules = [...store.entries()].map(([id, d]) => ({ ...d, id }));
    const weekStart = US.addDays(today, Math.floor(rnd() * 300) - 20);
    const range = rnd() < 0.5 ? { start: weekStart, end: US.addDays(weekStart, 6) } : { start: weekStart, end: US.addDays(weekStart, 30) };
    const filter = pick([{ scope: "ALL", showAuto: true }, { scope: "ALL", showAuto: false }, { scope: "CHILD", childKey: "c1", showAuto: true }, { scope: "FAMILY", showAuto: true }]);
    const input = { view: range.end === US.addDays(range.start, 6) ? "week" : "month", range, filter, auto: { events: auto.events, displayDates: auto.displayDates, completed: {}, childKey: "c1" }, user: { schedules, childLinks: [{ childKey: "c1", displayName: "은찬" }], members: [{ memberId: "m1", label: "엄마" }] } };
    const m = CM.buildCalendarModel(input);
    const m2 = CM.buildCalendarModel(input);
    totalOps++;

    // (1) AUTO 입력 불변
    assert.strictEqual(serialize(auto.events, auto.displayDates), before, `${pname} step ${step}: AUTO 직렬화가 바뀜`);
    // (2) 결정적: 같은 입력 → 같은 USER 출력
    const u = (mm) => JSON.stringify([...mm.days].map(([k, c]) => [k, c.user.map((o) => o.key), c.marks.length, c.more]));
    assert.strictEqual(u(m), u(m2));
    // (3) AUTO 칸 = 앱 공식 (USER 가 아무리 많아도). 필터에서 AUTO 가 숨겨지면 비어 있어야 한다.
    const autoShown = filter.showAuto && filter.scope !== "FAMILY";
    // C2: 연결(autoRef)된 AUTO 의 추천일 표식만 숨는다 — 모델과 별개로 저장소에서 직접 계산한 기대값
    const hidden = new Set([...store.values()].filter((d) => d.autoRef && !d.deletedAt && d.status !== "CANCELLED" && (d.childKeys || [])[0] === "c1").map((d) => d.autoRef));
    for (const [k, cell] of m.days) {
      const [y, mo, d] = k.split("-").map(Number);
      const date = new Date(y, mo - 1, d);
      const expFixed = autoShown ? auto.events.filter((e) => e.scheduleKind === "fixed" && HN.coversDay(e, date)).map((e) => e.id) : [];
      const expPlanned = autoShown ? HN.plannedOnDay(auto.events, auto.displayDates, date).map((e) => e.id).filter((id) => !hidden.has(id)) : [];
      assert.deepStrictEqual(cell.benefit.map((e) => e.id), expFixed, `${pname} ${k} benefit`);
      assert.deepStrictEqual(cell.planned.map((e) => e.id), expPlanned, `${pname} ${k} planned`);
      if (autoShown && hidden.size && HN.plannedOnDay(auto.events, auto.displayDates, date).some((e) => hidden.has(e.id))) hiddenCells++;
    }
  }
  assert.ok(hiddenCells > 0, `${pname}: 연결 숨김이 한 번도 일어나지 않아 검증이 비어 있다`);
  // 모든 연산 후에도 동일, 그리고 USER 를 전부 지워도 AUTO 칸은 같다
  assert.strictEqual(serialize(auto.events, auto.displayDates), before);
  const empty = CM.buildCalendarModel({ view: "month", range: { start: "2026-10-01", end: "2026-10-31" }, filter: { scope: "ALL", showAuto: true }, auto: { events: auto.events, displayDates: auto.displayDates, completed: {} }, user: { schedules: [] } });
  // childKey 를 주지 않으면(어느 아이인지 모름) 연결이 있어도 AUTO 칸은 USER 가 없을 때와 같다 — C2 의 안전 기본값
  const full = CM.buildCalendarModel({ view: "month", range: { start: "2026-10-01", end: "2026-10-31" }, filter: { scope: "ALL", showAuto: true }, auto: { events: auto.events, displayDates: auto.displayDates, completed: {} }, user: { schedules: [...store.entries()].map(([id, d]) => ({ ...d, id })) } });
  for (const k of empty.days.keys()) {
    assert.deepStrictEqual(full.days.get(k).benefit.map((e) => e.id), empty.days.get(k).benefit.map((e) => e.id));
    assert.deepStrictEqual(full.days.get(k).planned.map((e) => e.id), empty.days.get(k).planned.map((e) => e.id));
  }
  console.log(`  ok  - ${pname}: ${STEPS}단계(추가 ${counts.add}·수정 ${counts.edit}·완료 ${counts.done}·삭제 ${counts.del}·예외 ${counts.exc}) 후에도 autoEvents ${auto.events.length}건·displayDate ${auto.displayDates.size}건 바이트 동일`);
}
console.log(`\n3개 프로필, 모델 ${totalOps}회 생성 — T4 통과`);
