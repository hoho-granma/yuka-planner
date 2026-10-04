/* W4 패키지 1: 정보 상세 4단계 스텝 · 가족 캘린더에 넣기 한 장 시트 · 신청 링크 · 완료한 사람 기록. 실행: node --test test/k1-auto-steps.test.js */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
require("./tools/load-engine.js");
const AS = require("../js/auto-steps.js");
const AL = require("../js/apply-links.js");
const CM = require("../js/calendar-model.js");
const US = require("../js/user-schedule.js");
const SP = require("../js/school-policy.js");
const AA = require("../js/auto-after36.js");
const ROOT = path.join(__dirname, "..");
const rd = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), "utf8"));
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const defs = ["health-checkup", "vaccination", "development", "feeding", "oral", "sleep", "safety", "daily-life", "childcare", "school", "school-age", "pregnancy"].flatMap((f) => rd(`data/todos/${f}.json`).todos).concat(rd("data/subsidies/national-todos.json").todos);
const subs = rd("data/subsidies/national.json").subsidies;
const policy = SP.normalize(rd("data/policy/school.json"));
const allow = AA.normalize(rd("data/policy/auto-after36.json"));
const timing = rd("data/policy/pregnancy-timing.json").items;
const build = (birth, stage) => global.__buildSchedule({ birthDate: birth, province: "서울특별시", district: "구로구", gender: "M", birthOrder: "first", stage, schoolPolicy: policy }, { todoDefinitions: defs, subsidy: { subsidies: subs }, autoAfter36: allow, pregnancyTiming: timing }, []);
const now = new Date();

test("가족 캘린더에 넣을 수 있는 항목: SC·PG·SB 정의와 36개월 이상 허용 목록 항목(지역 지원금 포함), 기존 예약 흐름(VX·HC·OR-03·04)은 겹치지 않는다", () => {
  const ev = build(new Date(now.getFullYear() - 7, 5, 1), "born");
  const fam = ev.filter((e) => AS.isFamilyLinkable(e, CM.isLinkableAuto));
  const ids = new Set(fam.map((e) => e.id));
  assert.ok([...ids].some((i) => /^SC-/.test(i)) && ids.has("NAT-020") && [...ids].some((i) => /^SB-/.test(i)));
  assert.ok(ev.filter((e) => CM.isLinkableAuto(e)).every((e) => !AS.isFamilyLinkable(e, CM.isLinkableAuto)), "VX·HC 는 기존 흐름이 맡는다");
  const preg = build(new Date(now.getFullYear(), now.getMonth() + 4, 15), "pregnant");
  assert.ok(preg.some((e) => /^PG-0[12]__/.test(e.id) && AS.isFamilyLinkable(e, CM.isLinkableAuto)));
  assert.ok(ev.filter((e) => e.category === "발달관찰").every((e) => !AS.isFamilyLinkable(e, CM.isLinkableAuto)), "그 밖의 정보 항목은 대상이 아니다");
});

test("autoRef: 엔진 항목은 id 그대로, 지역 지원금처럼 '__' 가 없는 id 는 '__default' — 모두 규칙·클라이언트 검증 형식(<id>__<키>)을 통과하고 연결 색인이 찾는다", () => {
  const ev = build(new Date(now.getFullYear() - 7, 5, 1), "born").filter((e) => AS.isFamilyLinkable(e, CM.isLinkableAuto));
  assert.ok(ev.length > 3);
  const RULE = /^[A-Za-z0-9-]+__[A-Za-z0-9-]+$/; // firestore.rules autoRefOk
  for (const e of ev) {
    const ref = AS.autoRefOf(e);
    assert.ok(RULE.test(ref) && ref.length <= 80, ref);
    const r = US.buildCreateDoc({ sourceType: "MANUAL", title: e.title.slice(0, 100), category: AS.categoryOf(e), scope: "CHILD", childKeys: ["c1"], dateKind: "FIXED", allDay: true, eventDate: "2026-12-01", autoRef: ref }, 1000);
    assert.ok(r.ok, ref + " " + JSON.stringify(r.errors));
    const m = CM.linksByAutoId([{ ...r.doc, id: "s1" }], "c1", {});
    assert.ok(AS.linkOf(m, e), "연결 색인에서 찾는다: " + e.id);
  }
  assert.strictEqual(AS.autoRefOf({ id: "NAT-020" }), "NAT-020__default");
  assert.strictEqual(AS.autoRefOf({ id: "SC-01__default" }), "SC-01__default");
  assert.strictEqual(AS.categoryOf(ev.find((e) => /^SC-/.test(e.id))), "INSTITUTION");
});

test("날짜 자동 입력: 지금 이후 마감일 우선, 없거나 지났으면 권장일, 둘 다 지났으면 오늘, 날짜가 없으면 빈 값(확인 필요)", () => {
  assert.deepStrictEqual(AS.pickDate({ deadlineIso: "2026-12-31", recommendedIso: "2026-12-01", todayIso: "2026-10-05" }), { iso: "2026-12-31", kind: "deadline", uncertain: false });
  assert.deepStrictEqual(AS.pickDate({ deadlineIso: "2026-09-01", recommendedIso: "2026-12-01", todayIso: "2026-10-05" }).iso, "2026-12-01");
  assert.deepStrictEqual(AS.pickDate({ recommendedIso: "2026-12-01", todayIso: "2026-10-05", uncertain: true }), { iso: "2026-12-01", kind: "recommended", uncertain: true });
  assert.strictEqual(AS.pickDate({ recommendedIso: "2026-01-01", todayIso: "2026-10-05" }).iso, "2026-10-05");
  assert.strictEqual(AS.pickDate({ todayIso: "2026-10-05" }).iso, "");
});

test("스텝 모델: 신청 링크가 없으면 신청 단계 숨김, 넣을 수 없으면 일정 단계 숨김, 연결이 있으면 '넣었어요'+보기, 완료하면 완료한 사람이 보인다", () => {
  const link = { url: "https://example.kr/", label: "안내 보기" };
  const keys = (m) => AS.model(m).map((s) => s.key);
  assert.deepStrictEqual(keys({ applyLink: null, canLink: false, link: null, done: false }), ["learn", "done"]);
  assert.deepStrictEqual(keys({ applyLink: link, canLink: true, link: null, done: false }), ["learn", "apply", "plan", "done"]);
  const st = AS.model({ applyLink: link, canLink: false, link: { date: "2026-12-01", scheduleId: "s1" }, done: true, doneIso: "2026-10-05", doneBy: "엄마", category: "행정·지원금" });
  assert.deepStrictEqual(st.map((s) => s.state), ["done", "done", "done", "done"]);
  assert.ok(st[2].sub.includes("12월 1일") && st[2].action.kind === "view" && st[3].sub === "10월 5일 · 엄마");
  assert.strictEqual(AS.model({ applyLink: null, canLink: true, link: null, done: false, dateText: "권장 12월 1일", externalPlan: true })[1].action, null, "기존 예약 버튼은 앱이 옮긴다");
});

test("마크업: 4단계(시안 B)·한 장 시트(시안 A) — 담당자 선택 없음, 반복 없음 고정, 메모 선택, 이스케이프", () => {
  const h = AS.renderSteps(AS.model({ applyLink: { url: "https://example.kr/a?b=1&c=2", label: "신청하러 가기" }, canLink: true, link: null, done: false, dateText: "권장 12월 1일 <b>", category: "행정·지원금", toggleLabel: "해당 (신청 완료)" }));
  assert.ok(/as-steps/.test(h) && h.includes('data-as="apply"') && h.includes('data-as="link"') && h.includes('data-as="toggle"') && h.includes('rel="noopener noreferrer"') && h.includes('target="_blank"'));
  assert.ok(!h.includes("<b>\"") && h.includes("&lt;b&gt;") && h.includes("b=1&amp;c=2"));
  const s = AS.renderAddSheet({ title: "취학통지서 확인", date: "2026-12-01", dateKind: "recommended", dateUncertain: true, childName: "하준", memo: "", error: "", saving: false });
  assert.ok(s.includes("가족 캘린더에 넣기") && s.includes("항목에서 자동 입력") && s.includes("확인 필요") && s.includes("반복 없음") && s.includes("하준") && s.includes('data-as="save"'));
  assert.ok(!/담당/.test(s), "담당자 선택 없음");
  assert.ok(!/알림/.test(AS.renderSteps(AS.model({ applyLink: null, canLink: true, link: null, done: false })) + s), "알림을 약속하는 문구 없음");
});

test("신청 링크(W4 조사 반영): SC-01·SC-12·PG-01·PG-02·SB-08·NAT-020 만, SC-02·SC-03 은 링크 없음(단계 숨김), 금지 링크 없음", () => {
  const by = Object.fromEntries(subs.map((s) => [s.id, s]));
  const todo = (id) => defs.find((d) => d.todo_id === id);
  assert.strictEqual(AL.forTodo(todo("SC-01"), by).url, "https://www.gov.kr/portal/service/serviceInfo/134200005008");
  assert.strictEqual(AL.forTodo(todo("SC-12"), by).url, "https://nip.kdca.go.kr/irhp/infm/goVcntInfo.do?menuLv=1&menuCd=136");
  assert.strictEqual(AL.forTodo(todo("PG-01"), by).url, "https://efamily.scourt.go.kr/index.jsp");
  assert.ok(/nhis\.or\.kr\/nhis\/minwon\/minwonServiceBoard\.do/.test(AL.forTodo(todo("PG-02"), by).url));
  assert.ok(/WLF00000969/.test(AL.forTodo(todo("SB-08"), by).url) && /WLF00000969/.test(AL.forSubsidy(by["NAT-020"]).url));
  assert.ok(/WLF00003250/.test(AL.forTodo(todo("SB-07"), by).url));
  assert.strictEqual(AL.forTodo(todo("SC-02"), by), null);
  assert.strictEqual(AL.forTodo(todo("SC-03"), by), null);
  const applyUrls = [...defs, ...subs].map((x) => x.applyUrl).filter(Boolean);
  assert.ok(applyUrls.length >= 7 && applyUrls.every((u) => /^https:\/\//.test(u) && !/voucher\.go\.kr|wbhace06900m01/.test(u)), "신청 링크에 반영 금지 주소(voucher.go.kr·옛 검진 주소) 없음");
  assert.ok(!/로그인 필요/.test(JSON.stringify(defs)), "로그인 필요 표기 없음");
});

test("완료한 사람 기록은 규칙 변경 없이 된다: completed 는 맵 필드(항목 모양을 규칙이 보지 않음), 일정의 assigneeMemberId 는 허용 필드 / firestore.rules 는 이번 변경에서 손대지 않았다", () => {
  const rules = read("firestore.rules");
  assert.ok(/hasOnly\(\['profile', 'completed', 'records', 'updatedAt'/.test(rules), "families 업데이트는 completed 맵 전체만 보고 항목 안은 보지 않는다");
  assert.ok(/'recurrence', 'exceptions', 'assigneeMemberId'/.test(rules) && /d\.assigneeMemberId is string/.test(rules));
  const APP = read("js/app.js");
  assert.ok(/completed\[id\] = \{ done: true, todo_id: todoId, occurrenceKey, recordType: "TODO_COMPLETED", recordedAt: nowIso, \.\.\.\(typeof usCompletedByField/.test(APP));
  // 완료 시 담당 자동 기록: 담당 없는 비반복 일정만, 이미 담당이 있으면 그대로
  const before = { v: 1, sourceType: "MANUAL", title: "t", category: "ETC", scope: "CHILD", childKeys: ["c1"], dateKind: "FIXED", allDay: true, eventDate: "2026-12-01", createdAt: 1, updatedAt: 1, status: "TODO" };
  const r = US.buildPatch(before, { status: "DONE", assigneeMemberId: "m1" }, 2);
  assert.ok(r.ok && r.patch.status === "DONE" && r.patch.assigneeMemberId === "m1");
  assert.ok(/function usMarkDoneBy/.test(APP) && /before\.assigneeMemberId \|\| before\.recurrence/.test(APP));
});

test("pregnancy·36개월 미만 회귀: 새 모듈은 앱 로드 목록에 있고 sw 캐시에도 있다 / 스텝은 계정 모드 상세 래퍼에서만 붙는다", () => {
  assert.ok(/js\/auto-steps\.js/.test(read("index.html")) && /auto-steps\.js/.test(read("sw.js")));
  const APP = read("js/app.js");
  assert.ok(/openDetailBase\(e, cameFromDayList\);\n    if \(!acctEnabled\(\) \|\| !e\) return;/.test(APP) && /acctDesignSteps\(el\("modal-content"\), e\)/.test(APP));
});

test("완료한 정보 항목도 상세에서 스텝이 유지돼 '완료한 사람'이 보인다(링크·연결이 없는 SC-02 같은 항목 포함) / 36개월 이상 날짜 시트는 완료한 자동 일정을 '완료'로 보여 준다", () => {
  const APP = read("js/app.js");
  assert.ok(/!applyLink && !canLink && !link && !\(done && \(existing \|\| family\)\)/.test(APP), "완료했고 정보 항목이면 스텝 유지");
  assert.ok(/done: !!completed\[e\.id\], sub: e\.dateLabel \|\| "", auto: true/.test(APP), "날짜 시트 자동 행에 완료 상태 전달");
  const V = require("../js/over36-view.js");
  const h = V.renderDaySheet({ iso: "2026-12-01", month: 12, day: 1, weekday: 2, prevDay: 30, nextDay: 2, rows: [{ autoId: "SC-02__default", title: "예비소집 확인", allDay: true, startTime: "", color: "", done: true, sub: "지금 챙기세요", auto: true }] });
  assert.ok(/a36-auto done/.test(h) && h.includes("완료") && !h.includes("지금 챙기세요"));
  // 완료 상태 모델: 링크·일정 없이도 알아보기 → 완료 두 단계로 완료한 사람이 나온다
  const st = AS.model({ applyLink: null, canLink: false, link: null, done: true, doneIso: "2026-10-04", doneBy: "엄마", category: "생활·수유", toggleLabel: "확인 취소" });
  assert.deepStrictEqual(st.map((s) => s.key), ["learn", "done"]);
  assert.strictEqual(st[1].sub, "10월 4일 · 엄마");
});
