/* W5 다음 단계 안내: 정책·판정(가장 가까운 단계 하나, 숨김 조건), 날짜 제안(날짜를 지어내지 않음), 일정 저장 형식, 마크업. 실행: node --test test/k3-next-stage.test.js */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
require("./tools/load-engine.js");
const NS = require("../js/next-stage.js");
const AS = require("../js/auto-steps.js");
const US = require("../js/user-schedule.js");
const SP = require("../js/school-policy.js");
const AA = require("../js/auto-after36.js");
const CT = global.ChildTimeline;
const ROOT = path.join(__dirname, "..");
const rd = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), "utf8"));
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const policyRaw = rd("data/policy/next-stage.json");
const policy = NS.normalizePolicy(policyRaw);
const defs = ["health-checkup", "vaccination", "development", "feeding", "oral", "sleep", "safety", "daily-life", "childcare", "school", "school-age", "pregnancy"].flatMap((f) => rd(`data/todos/${f}.json`).todos).concat(rd("data/subsidies/national-todos.json").todos);
const subs = rd("data/subsidies/national.json").subsidies;
const schoolPolicy = SP.normalize(rd("data/policy/school.json"));
const allow = AA.normalize(rd("data/policy/auto-after36.json"));
const timing = rd("data/policy/pregnancy-timing.json").items;

// 기준일을 고정해 달 경계 흔들림을 없앤다(오늘 = 2026-10-05)
const TODAY = new Date(2026, 9, 5);
const RealDate = Date;
function withToday(fn) { // 엔진·ChildTimeline 이 new Date() 를 쓰므로 잠시 고정
  global.Date = class extends RealDate { constructor(...a) { if (a.length === 0) super(TODAY.getTime()); else super(...a); } static now() { return TODAY.getTime(); } };
  try { return fn(); } finally { global.Date = RealDate; }
}
function kidCtx(birth, stage, o = {}, todayOverride) {
  const T = todayOverride || TODAY;
  const { ev, st } = withToday(() => ({
    ev: global.__buildSchedule({ birthDate: birth, province: "서울특별시", district: "구로구", gender: "M", birthOrder: "first", stage, schoolPolicy }, { todoDefinitions: defs, subsidy: { subsidies: subs }, autoAfter36: allow, pregnancyTiming: timing }, []),
    st: CT.stageOf({ birthDate: birth, asOf: T, stage, policy: schoolPolicy }),
  }));
  const events = new Map(ev.map((e) => [e.id, e]));
  const done = o.done || new Set(), linked = o.linked || new Set(), na = o.na || new Set();
  return NS.pick({ policy: o.policy || policy, kid: { name: "하준", pregnant: stage === "pregnant", stage: st.stage, ageMonths: st.ageMonths, dueDate: stage === "pregnant" ? birth : null }, today: T, events, isDone: (id) => done.has(id), isLinked: (e) => linked.has(e.id), isNA: (id) => na.has(id) });
}
const ago = (m) => new Date(2026, 9 - m, 1);

test("정책 파일: 4개 단계(출산·3~5세·6~7세·학교 준비), 기본 창 3개월(단계별 2·3·3·날짜 기준), 항목은 기존 id 참조, 금액·로그인·알림 표현 없음", () => {
  assert.deepStrictEqual(policy.stages.map((s) => s.id).slice(0, 4), ["TO_BORN", "TO_3_5", "TO_6_7", "TO_SCHOOL"]); // 단계 0 이후 초등 단계가 뒤에 더해질 수 있다(앞 4개는 고정)
  assert.strictEqual(policy.windowMonthsDefault, 3);
  assert.deepStrictEqual(policy.stages.slice(0, 4).map((s) => s.windowMonths), [2, 3, 3, 0], "출산 2개월·3~5세 3개월·6~7세 3개월·취학 임박은 날짜 기준");
  assert.ok(policyRaw.stages.every((s) => /제안값|날짜 기준/.test(s.windowBasis)), "단계별 창의 근거(제안값/날짜 기준)를 적었다");
  const text = JSON.stringify(policyRaw);
  assert.ok(!/\d+\s*(만\s*원|원)\b/.test(text), "금액 수치 없음");
  assert.ok(!/로그인 필요|알림|푸시|놓치지/.test(text), "알림·불안 표현 없음");
  const ids = new Set(defs.map((d) => d.todo_id).concat(subs.map((s) => s.id)));
  for (const s of policy.stages) for (const it of s.items) assert.ok([it.ref, ...it.also].every((r) => ids.has(r.split("__")[0])), "존재하지 않는 id 참조 " + it.ref);
  assert.deepStrictEqual(NS.normalizePolicy({ stages: [{ id: "x", match: { kind: "age" }, headline: "h", items: [] }, null, { id: "y", match: { kind: "bogus" }, headline: "h", items: [{ ref: "A", label: "a" }] }] }).stages, []);
});

test("임신 중: 출산 예정일 2개월 이내면 '곧 출산' 배너(출생신고·부모급여·아동수당), 그보다 멀면 없음", () => {
  const near = kidCtx(new Date(2026, 10, 25), "pregnant");
  assert.ok(near && near.id === "TO_BORN");
  assert.deepStrictEqual(near.items.map((i) => i.id), ["PG-01__default", "SB-02__default", "SB-04__default"]);
  assert.ok(near.headline.includes("출산") && near.sub.includes("1개월"));
  assert.strictEqual(kidCtx(new Date(2027, 0, 20), "pregnant"), null, "예정일 3개월 반 뒤는 아직(창 2개월)");
  assert.strictEqual(kidCtx(new Date(2027, 6, 20), "pregnant"), null, "예정일 9개월 뒤는 아직");
});

test("0~35개월: 36개월 전 3개월 구간(33~35개월)에만 '곧 3~5세', 유아학비는 NAT-020·SB-08 중복 없이 한 줄, 영유아검진 6차 포함", () => {
  for (const m of [32, 30, 12, 3]) assert.strictEqual(kidCtx(ago(m), "born"), null, m + "개월");
  for (const m of [33, 34, 35]) {
    const r = kidCtx(ago(m), "born");
    assert.ok(r && r.id === "TO_3_5", m + "개월");
    assert.deepStrictEqual(r.items.map((i) => i.id), ["NAT-020", "HC-07__default"]);
    assert.ok(r.sub.includes("하준") && /[1-3]개월 뒤부터/.test(r.sub), r.sub);
  }
  assert.strictEqual(kidCtx(ago(35), "born").sub.includes("1개월 뒤부터"), true);
  assert.strictEqual(kidCtx(ago(36), "born"), null, "36개월 정각에는 이 안내가 끝난다");
});

test("3~5세 후반(69~71개월, 입학 전해가 아닌 아이): '곧 6~7세' 입학 전 추가접종 3개 — 취학 항목은 아직 이벤트가 없으면 나오지 않는다", () => {
  const r = kidCtx(ago(69), "born");
  assert.strictEqual(kidCtx(ago(68), "born"), null, "68개월은 아직(창 3개월)");
  assert.ok(r && r.id === "TO_6_7", r && r.id);
  assert.deepStrictEqual(r.items.map((i) => i.id), ["VX-DTAP__dose-5", "VX-IPV__dose-4", "VX-MMR__dose-2"]);
  assert.strictEqual(kidCtx(ago(60), "born"), null);
});

test("취학 임박: 입학 전해(6~7세)에 SC-03·SC-01·SC-02 — 학교 단계 이벤트가 있는 동안만, 초등 아이에게는 없음", () => {
  const r = kidCtx(new Date(2020, 5, 1), "born"); // 2026-10 기준 6세, 입학은 2027
  assert.ok(r && r.id === "TO_SCHOOL", r && r.id);
  assert.deepStrictEqual(r.items.map((i) => i.id), ["SC-03__default", "SC-01__default", "SC-02__default"]);
  assert.ok(r.headline.includes("12월 무렵") && !/20\d\d/.test(r.headline + r.sub), "연도를 확정적으로 쓰지 않는다");
  assert.strictEqual(kidCtx(new Date(2018, 5, 1), "born"), null, "초등은 이번에 만들지 않는다");
  // 날짜 기준 창: 입학 연기 신청이 시작되는 10월 1일부터 12월 31일까지만 보인다(9월·1월에는 없음)
  const b = new Date(2020, 5, 1);
  // 사양 변경에 따른 테스트 수정(0-C3, 2026-10-05 승인): 취학 배너는 12월 31일에서 끝나지 않고 예비소집(SC-02, 12~1월) 창 끝까지 이어진다 — 9월에 안 보이는 조건은 그대로.
  const jan = JSON.parse(JSON.stringify(policyRaw));
  jan.stages.find((s) => s.id === "TO_SCHOOL").match.untilRef = "SC-02__default";
  const policyJan = NS.normalizePolicy(jan);
  for (const [d, want] of [[new Date(2026, 8, 30), false], [new Date(2026, 9, 1), true], [new Date(2026, 11, 31), true], [new Date(2027, 0, 1), true], [new Date(2027, 0, 31), true], [new Date(2027, 1, 1), false]]) {
    assert.strictEqual(!!kidCtx(b, "born", { policy: policyJan }, d), want, d.toDateString());
  }
  // 1월에는 기간이 끝난 항목(입학 연기 12/31까지·12월 취학통지서)이 'open'으로 남지 않는다(완료로 치지 않고 날짜도 만들지 않는다).
  const j = kidCtx(b, "born", { policy: policyJan }, new Date(2027, 0, 10));
  const st = Object.fromEntries(j.items.map((i) => [i.id, i.state]));
  assert.strictEqual(st["SC-03__default"], "past");
  assert.strictEqual(st["SC-02__default"], "open");
  assert.strictEqual(j.remaining, j.items.filter((i) => i.state === "open").length);
  assert.ok(NS.renderSheet(j, { applyOf: () => null, canPlan: true }).includes("기간이 지났어요"));
});

test("숨김: 남은 항목이 모두 완료·일정 넣음·미해당이면 배너 없음, 일부만 하면 남은 것만 센다, 항목이 없으면 만들지 않는다", () => {
  const b = new Date(2026, 10, 25), all = ["PG-01__default", "SB-02__default", "SB-04__default"];
  assert.strictEqual(kidCtx(b, "pregnant", { done: new Set(["PG-01__default"]), linked: new Set(["SB-02__default"]), na: new Set(["SB-04__default"]) }), null);
  const part = kidCtx(b, "pregnant", { done: new Set(["PG-01__default"]) });
  assert.strictEqual(part.remaining, 2);
  assert.deepStrictEqual(part.items.map((i) => i.state), ["done", "open", "open"]);
  assert.strictEqual(kidCtx(b, "pregnant", { na: new Set(all) }), null);
  const empty = NS.pick({ policy, kid: { name: "x", pregnant: true, dueDate: b }, today: TODAY, events: new Map() });
  assert.strictEqual(empty, null, "이벤트가 없으면 항목도 없다");
  assert.strictEqual(NS.pick({ policy: { stages: [] }, kid: { pregnant: true, dueDate: b }, today: TODAY, events: new Map() }), null);
});

test("날짜 제안: 기한이 있으면 그 하루(FIXED), 시기면 기간 전체(PERIOD), 근거가 없거나 지났으면 NONE — 날짜를 지어내지 않는다", () => {
  const ctx = kidCtx(new Date(2020, 5, 1), "born");
  const byId = Object.fromEntries(ctx.items.map((i) => [i.id, i]));
  const today = "2026-10-05";
  const p3 = NS.proposal(byId["SC-03__default"].event, "deadline", today);
  assert.deepStrictEqual([p3.kind, p3.eventDate.slice(5)], ["FIXED", "12-31"]);
  const p1 = NS.proposal(byId["SC-01__default"].event, "window", today);
  assert.strictEqual(p1.kind, "PERIOD");
  assert.ok(p1.text.includes("날짜는 나중에") && p1.periodStart >= today && p1.periodEnd >= p1.periodStart);
  assert.strictEqual(NS.proposal({ windowStart: new Date(2020, 0, 1), windowEnd: new Date(2020, 1, 1) }, "window", today).kind, "NONE");
  assert.strictEqual(NS.proposal({}, "start", today).kind, "NONE");
  assert.strictEqual(NS.proposal(null, "window", today).text, "날짜 확인 필요");
});

test("일정 저장 형식: 모든 시작 항목의 제안이 W4 저장 경로(buildCreateDoc, autoRef, 담당자·반복 없음)로 검증을 통과한다", () => {
  const cases = [[new Date(2026, 10, 25), "pregnant"], [ago(33), "born"], [ago(69), "born"], [new Date(2020, 5, 1), "born"]];
  let n = 0;
  for (const [b, st] of cases) {
    const m = kidCtx(b, st);
    for (const it of m.items) {
      const p = NS.proposal(it.event, it.dateMode, "2026-10-05");
      if (p.kind === "NONE") continue;
      const r = US.buildCreateDoc({ sourceType: "MANUAL", title: it.event.title.slice(0, 100), category: AS.categoryOf(it.event), scope: "CHILD", childKeys: ["c1"], allDay: true, autoRef: AS.autoRefOf(it.event),
        ...(p.kind === "FIXED" ? { dateKind: "FIXED", eventDate: p.eventDate } : { dateKind: "PERIOD", periodStart: p.periodStart, periodEnd: p.periodEnd }) }, 1000);
      assert.ok(r.ok, it.id + " " + JSON.stringify(r.errors));
      assert.ok(!("assigneeMemberId" in r.doc) && !("recurrence" in r.doc), "담당자·반복 없음");
      n++;
    }
  }
  assert.ok(n >= 9, "검증한 항목 수 " + n);
  assert.strictEqual(AS.categoryOf({ detail: { definition: { category: "HC" } } }), "MEDICAL");
  assert.strictEqual(AS.categoryOf({ detail: { definition: { category: "VX" } } }), "MEDICAL");
});

test("마크업: 배너는 홈 안 한 줄(알림·푸시 표현 없음), 타임라인은 시기 순서·확인 필요·신청 링크·상태, 일정 시트는 체크 개수 버튼 / 이스케이프", () => {
  const m = kidCtx(new Date(2020, 5, 1), "born");
  const bn = NS.renderBanner(m);
  assert.ok(bn.includes('id="ns-banner"') && bn.includes('data-ns="open"') && bn.includes("곧") && bn.includes("미리 알아보기"));
  assert.ok(!/알림|푸시|notification/i.test(bn));
  assert.strictEqual(NS.renderBanner(null), "");
  const sh = NS.renderSheet({ ...m, items: m.items.map((i, k) => ({ ...i, state: k === 1 ? "done" : "open" })) }, { applyOf: (id) => (id === "SC-01__default" ? { url: "https://example.kr/a?b=1&c=2", label: "안내 보기" } : null), canPlan: true });
  assert.ok(sh.indexOf("입학 연기") < sh.indexOf("취학통지서") && sh.indexOf("취학통지서") < sh.indexOf("예비소집"));
  assert.ok(sh.includes("확인 필요") && sh.includes('data-ns="plan"') && sh.includes('data-ns="detail"') && sh.includes("b=1&amp;c=2") && sh.includes("ns-st"));
  assert.ok(NS.renderSheet(m, { canPlan: false }).includes("가족 캘린더에 연결되면"), "연결이 없으면 일정 넣기 대신 안내");
  const pl = NS.renderPlanSheet(m, [{ id: "a", label: "<x>", sub: "12월 (날짜는 나중에)", checked: true }, { id: "b", label: "b", sub: "날짜 확인 필요", checked: false, disabled: true }], {});
  assert.ok(pl.includes("선택한 1개 일정으로 넣기") && pl.includes("&lt;x&gt;") && pl.includes("disabled") && !/담당/.test(pl));
  assert.ok(NS.renderPlanSheet(m, [{ id: "a", label: "a", sub: "", checked: false }], {}).includes("넣을 일정을 골라 주세요"));
});

test("앱 연결: 홈 맨 아래 배너(계정 모드)·시트·저장 경로가 W4 와 같다 / 36개월 미만 홈은 기존 함수 그대로 부른 뒤 배너만 더한다", () => {
  const APP = read("js/app.js");
  assert.ok(/renderHome = function renderHome\(\) \{\n\s*if \(!acct36Active\(\)\) renderHomeBase\.apply\(this, arguments\);\n\s*else acct36RenderHome\(\);\n\s*nsSync\(\);/.test(APP));
  assert.ok(/if \(!acctEnabled\(\) \|\| !profile \|\| typeof NextStage === "undefined"/.test(APP), "계정 모드·아이가 있을 때만");
  assert.ok(/HouseholdSync\.createSchedule\(hh\.hid, doc\.doc\)/.test(APP) && /autoRef: AutoSteps\.autoRefOf\(e\)/.test(APP) && /ChildTimeline\.stageOf\(/.test(APP));
  assert.ok(/data\/policy\/next-stage\.json/.test(APP) && /js\/next-stage\.js/.test(read("index.html")) && /next-stage\.js/.test(read("sw.js")));
  assert.ok(!/assigneeMemberId/.test(APP.slice(APP.indexOf("async function nsSavePlan"), APP.indexOf("function nsOnClick"))), "담당자 선택·기록 없음");
});
