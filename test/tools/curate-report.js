/*
 * 1-0 ③ 고정 아이 6명 큐레이션 리포트 — docs/ux-review/07-큐레이션-6명-결과.md 를 만든다(읽기 전용: 앱·데이터를 바꾸지 않는다).
 *   node test/tools/curate-report.js            → 파일 쓰기
 *   node test/tools/curate-report.js --stdout   → 화면 출력
 * 오늘 2026-10-05 고정(Date 를 고정 날짜로 바꿔 엔진·판정이 같은 오늘을 본다), 완료 기록 없음. 기대값은 06 §8-2(정답이 아니라 검토 대상 — 코드를 기대에 맞추지 않는다).
 */
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..", "..");
const rd = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), "utf8"));
const RealDate = Date;
let NOW = new RealDate(2026, 9, 5, 12, 0, 0);
class FakeDate extends RealDate { constructor(...a) { if (a.length === 0) super(NOW.getTime()); else super(...a); } static now() { return NOW.getTime(); } static [Symbol.hasInstance](x) { return x instanceof RealDate; } }
global.Date = FakeDate;
require("./load-engine.js");
const HN = require("../../js/hn-logic.js"), CT = require("../../js/child-timeline.js"), CM = require("../../js/calendar-model.js"), AS = require("../../js/auto-steps.js");
const AL = require("../../js/apply-links.js"), C = require("../../js/curation.js"), SP = require("../../js/school-policy.js");
const AA = require("../../js/auto-after36.js");
const policy = C.normalizePolicy(rd("data/policy/curation.json"));
const schoolPolicy = SP.normalize(rd("data/policy/school.json"));
const reform = (() => { try { return rd("data/subsidies/reform-2027.json"); } catch (e) { return null; } })();
const applyBirthRule = (item) => { if (!item || !item.birthRule) return item; const eff = reform && reform.effectiveBirthDate; if (item.birthRule === "preReform") return eff ? { ...item, birthBefore: eff } : item; if (item.birthRule === "postReform") return { ...item, birthOnOrAfter: eff || "9999-12-31" }; return item; };
const FILES = ["health-checkup", "vaccination", "development", "feeding", "oral", "sleep", "safety", "daily-life", "childcare", "school", "school-age", "pregnancy"].map((f) => `data/todos/${f}.json`).concat("data/subsidies/national-todos.json");
const defs = FILES.flatMap((f) => rd(f).todos).filter((d) => d.todo_id !== "VX-RSV").map(applyBirthRule); // VX-RSV 는 커밋 전 잔여(제품 결정 전) — 6명 고정 기대값은 커밋된 데이터 기준이라 제외한다. RSV 가 확정·커밋되면 이 필터를 지우고 기대값을 갱신한다.
const subsidiesFor = (province, district) => {
  const paths = ["data/subsidies/national.json"];
  if (province === "서울특별시") paths.push("data/subsidies/seoul/city.json", `data/subsidies/seoul/districts/${district}.json`);
  else if (province === "경기도") paths.push("data/subsidies/gyeonggi/city.json", `data/subsidies/gyeonggi/${district}/subsidies.json`);
  return { subsidies: paths.filter((p) => fs.existsSync(path.join(ROOT, p))).flatMap((p) => rd(p).subsidies || []).map(applyBirthRule) };
};
const allow = AA.normalize ? AA.normalize(rd("data/policy/auto-after36.json")) : undefined;
const timing = rd("data/policy/pregnancy-timing.json").items;

const KIDS = [
  { key: "① 임신", label: "예정일 2027-01-15, 서울 구로구", birth: new RealDate(2027, 0, 15), stage: "pregnant", province: "서울특별시", district: "구로구",
    expect: [["now", ["PREG-005"], "PREG-005 임신부 독감 무료접종"], ["soon", ["PG-01", "SB-02", "SB-04"], "TO_BORN 묶음(출생신고·부모급여·아동수당)"], ["know", ["GURO-P01"], "GURO-P01 모자건강센터 프로그램"]] },
  { key: "② 0~12개월", label: "은찬 2026-06-20생(3개월), 서울 구로구", birth: new RealDate(2026, 5, 20), stage: "born", province: "서울특별시", district: "구로구",
    expect: [["soon", ["NAT-011"], "NAT-011 배우자 출산휴가(조건 키 없음 → CHECK, 곧)"], ["now", ["SB-01"], "SB-01 첫만남이용권"], ["now", ["SB-02", "SB-04"], "SB-02·SB-04 (미신청이면 1단위)"], ["now", ["VX-ROTA"], "VX-ROTA 2차(4개월 접종 묶음)"], ["soon", ["VX-DTAP", "VX-IPV", "VX-HIB", "VX-PCV"], "4개월 접종 묶음"], ["soon", ["HC-02"], "HC-02 2차 검진"], ["soon", ["SEOUL-001"], "SEOUL-001 서울형 산후조리경비"], ["know", ["DV-02", "SF-03"], "DV-02 또는 SF-03"]] },
  { key: "③ 12~36개월", label: "2024-12-10생(21개월), 서울 구로구", birth: new RealDate(2024, 11, 10), stage: "born", province: "서울특별시", district: "구로구",
    expect: [["now", ["HC-04"], "HC-04 4차 건강검진"], ["now", ["VX-DTAP"], "VX-DTAP 4차(미접종이면)"], ["know", ["DV-06"], "DV-06 19~24개월 발달 관찰"]] },
  { key: "④ 3~5세", label: "2022-03-15생(54개월), 경기 성남시", birth: new RealDate(2022, 2, 15), stage: "born", province: "경기도", district: "성남시",
    expect: [["now", ["HC-08"], "HC-08 7차 건강검진"], ["soon", ["VX-DTAP", "VX-IPV", "VX-MMR"], "VX-DTAP 5차·IPV 4차·MMR 2차(1단위)"], ["soon", ["NAT-020"], "NAT-020 유아학비(확인형)"]] },
  { key: "⑤ 6~7세", label: "2020-05-10생, 서울 구로구", birth: new RealDate(2020, 4, 10), stage: "born", province: "서울특별시", district: "구로구",
    expect: [["soon", ["SC-01", "SC-02"], "SC-01 취학통지서 → SC-02 예비소집(1단위)"], ["soon", ["SC-03"], "SC-03 입학연기(확인형)"], ["soon", ["SEOUL-S02"], "SEOUL-S02 서울 초등 입학준비금(확인형)"]] },
  { key: "⑥ 초등(초3)", label: "2017-09-01생(초3), 서울 구로구", birth: new RealDate(2017, 8, 1), stage: "born", province: "서울특별시", district: "구로구",
    expect: [["know", ["SC-16"], "SC-16 학교 구강검진"], ["soon", ["SEOUL-S01"], "SEOUL-S01 아동치과주치의(확인형)"]] },
];
const pre = (id) => String(id).split("__")[0];
const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function run(kid, today) {
  NOW = today;
  const profile = { birthDate: kid.birth, province: kid.province, district: kid.district, gender: "M", birthOrder: "first", stage: kid.stage, schoolPolicy };
  const sched = global.__buildSchedule(profile, { todoDefinitions: defs, subsidy: subsidiesFor(kid.province, kid.district), autoAfter36: allow, pregnancyTiming: timing }, []);
  const events = sched.filter((e) => CT.isEventShown(kid.birth, e));
  const pregnant = kid.stage === "pregnant";
  const ageMonths = pregnant ? null : CT.completedMonths(kid.birth, today);
  const present = new Set(events.map((e) => pre(e.id)));
  const aliasMap = policy.aliases;
  const unknown = global.__buildEligibilityUnknown(profile, defs, { aliases: aliasMap, present, today, ageMonths }).map((u) => ({ id: u.id, title: u.title }));
  const byRegion = {}; for (const s of subsidiesFor(kid.province, kid.district).subsidies) byRegion[s.id] = s;
  const state = {
    completed: {}, isNA: () => false, ageMonths, pregnant, birthDate: kid.birth, unknown,
    subsidyStatusOf: (e) => HN.subsidyStatus(e, {}, { today, ageNow: ageMonths == null ? undefined : ageMonths, pregnant, birthDate: kid.birth }),
    applyOf: (e) => { const d = e.detail && e.detail.definition; return d ? AL.forTodo(d, byRegion) : AL.forSubsidy(e.detail); },
    canSchedule: (e) => CM.isLinkableAuto(e) || AS.isFamilyLinkable(e, CM.isLinkableAuto, today),
  };
  return { out: C.curate(events, state, policy, today), events };
}
const unitText = (u) => (u.key === "REVIEW_PAST" ? u.title : `${u.ids.map(pre).join("+")} ${u.title}`).replace(/\|/g, "/");
const shortList = (arr) => (arr.length ? arr.map((u) => (u.key === "REVIEW_PAST" ? `지난기록${u.ids.length}` : u.ids.length > 3 ? `${u.ids.map(pre)[0]}외${u.ids.length - 1}` : u.ids.map(pre).join("+"))).join(", ") : "—");
const cell = (s) => String(s).replace(/\|/g, "/");

if (process.argv.includes("--json")) { // 6명 결과를 기대값 테스트로 고정할 때 쓰는 요약(오늘 고정, 슬롯별 단위 id·규칙·행동 종류)
  const sum = (arr) => arr.map((u) => `${u.ids.map(pre).join("+")}:${u.rule}:${u.actionKind}`);
  const o = {};
  for (const kid of KIDS) { const r = run(kid, new RealDate(2026, 9, 5, 12)).out; o[kid.key] = { now: sum(r.now), soon: sum(r.soon), know: sum(r.know), more: [r.moreCounts.now, r.moreCounts.soon, r.moreCounts.know, r.moreCounts.benefits] }; }
  process.stdout.write(JSON.stringify(o, null, 1) + "\n"); process.exit(0);
}
const lines = [];
const P = (s = "") => lines.push(s);
P("# 07 큐레이션 6명 결과 (1-0 ③)");
P();
P("> 생성: `node test/tools/curate-report.js` (hn_dev, 2026-10-05). 오늘 2026-10-05 고정·완료 기록 없음·조건 답 없음. 기대값은 06 §8-2 — **정답이 아니라 검토 대상**이며 코드를 기대에 맞추지 않았다. 판정은 hn_pm·사용자 검토.");
P("> 규칙 약어: G1 완료·미해당 / G2 일정으로 넘어감 / G3 놓침 / G4 지원금 미해당·미확정 / L1 놓치면 끝 / L2 마감 임박 / L3 늦었지만 가능 / L4 지금 기간 안 / L5 기간 안·여유 / L6 곧 시작. 숫자는 `data/policy/curation.json`(슬롯 3/2/1, 30/45/60/7일).");
P();
const DATES = [new RealDate(2026, 9, 5, 12), new RealDate(2026, 10, 20, 12), new RealDate(2027, 0, 10, 12)];
const odd = [];
for (const kid of KIDS) {
  const { out } = run(kid, DATES[0]);
  P(`## ${kid.key} — ${kid.label}`);
  P();
  P("| 슬롯 | 항목(id·제목) | 규칙 | 이유 문장 | 행동 |");
  P("|---|---|---|---|---|");
  const slotName = { now: "지금 꼭", soon: "곧", know: "알아두기" };
  for (const s of ["now", "soon", "know"]) {
    const list = out[s];
    const reasonEmpty = (() => {
      const t = out.stats.byType;
      const n = s === "now" ? t.ACT : s === "soon" ? t.ACT + t.CHECK : t.KNOW;
      return n === 0 ? "비어 있음 — 후보 0(데이터 없음)" : `비어 있음 — 후보 있으나 조건 미달(${s === "now" ? "ACT" : s === "soon" ? "ACT·CHECK" : "KNOW"} ${n}건, 이 슬롯 규칙에 안 걸림)`;
    })();
    if (!list.length) P(`| ${slotName[s]} | ${reasonEmpty} | | | |`);
    for (const u of list) P(`| ${slotName[s]} | ${cell(unitText(u))}${u.type === "CHECK" ? " (확인형)" : ""} | ${u.rule} | ${cell(u.reason.text)}${kid.key.startsWith("⑥") && u.ids.some((i) => pre(i) === "SB-04") && s === "now" ? "" : ""} | ${u.actionKind} |`);
    if (out.moreCounts[s] > 0) P(`| ${slotName[s]} — N개 더 | ${out.moreCounts[s]}개: ${cell(out.overflow[s].map(unitText).join(" / "))} | ${out.overflow[s].map((u) => u.rule).join(",")} | | |`);
  }
  P(`| 혜택 한 줄 | 받을 수 있는 혜택 ${out.moreCounts.benefits}개(상시·마감 없음, 슬롯 제외) | | | |`);
  P();
  P("**06 §8-2 기대와 비교**");
  P();
  P("| 기대(슬롯 · 항목) | 결과 | 실제 위치 |");
  P("|---|---|---|");
  const find = (ids) => { for (const s of ["now", "soon", "know"]) { for (const u of out[s]) if (u.ids.some((i) => ids.includes(pre(i)))) return s + (u.rule ? `(${u.rule})` : ""); for (const u of out.overflow[s]) if (u.ids.some((i) => ids.includes(pre(i)))) return s + " N개 더"; } return out.excluded.find((x) => ids.includes(pre(x.id))) ? "제외(" + out.excluded.find((x) => ids.includes(pre(x.id))).gate + ")" : "없음"; };
  for (const [slot, ids, text] of kid.expect) { const where = find(ids); P(`| ${slotName[slot]} · ${cell(text)} | ${where.startsWith(slot) ? "같음" : "다름"} | ${where} |`); }
  P();
  P("**날짜를 바꿔 돌린 요약**");
  P();
  for (const d of DATES) { const r = run(kid, d).out; P(`- ${fmt(d)}: 지금 꼭 ${shortList(r.now)}(+${r.moreCounts.now}) · 곧 ${shortList(r.soon)}(+${r.moreCounts.soon}) · 알아두기 ${shortList(r.know)}(+${r.moreCounts.know}) · 혜택 ${r.moreCounts.benefits}`); }
  P();
  kid.res = out;
}
NOW = DATES[0];
P("## hn_dev가 보기에 어색한 것 (판정하지 않음)");
P();
// 아래 5개는 2026-10-05 실행 결과(v3: C1 정책 id 우선·C3 '곧' 날짜순 반영)를 보고 hn_dev 가 적은 의견(판정 아님). 결과가 바뀌면 이 문구도 다시 봐야 한다.
const notes = [
  "임신 전용으로 보이는 지원이 출생 후 아이의 '곧'에 남는다(C2): ② 은찬·③ 21개월의 '곧' N개 더에 SEOUL-P01·SEOUL-P04·PREG-004·SEOUL-002(임산부 교통비)·NAT-008·PREG-006·NAT-016 등. curate는 schedule.js의 prenatalOnly 분기를 그대로 거친 이벤트를 받고(코드 문제 아님), 이 레코드들은 prenatalOnly 표식이 없고 출생 후 개월 범위(maxAge 6~24)가 있어 앱 혜택 탭에도 같은 이유로 보인다 — 출생 후에도 신청 가능한 제도인지는 데이터 판단(hn_data)이다.",
  "'N개 더'가 아직 크다: ② 곧 +31·알아두기 +12, ③ 곧 +15·알아두기 +34. 알아두기(KNOW)는 이 시기 발달·안전 전체가 후보라 '대표 1 + 나머지'가 사실상 월령 탭 목록 전체다. expandMax 5로 펼침은 5개까지 보이지만 후보 수 자체는 그대로다.",
  "임신(①)의 '곧'에는 PG-02·PREG-005가 오고 TO_BORN 묶음(PG-01·SB-02·SB-04)은 없다: 창이 출산 예정일부터라 시작까지 102일이라 L7. PREG-005는 정책 id 로 ACT(BOOK)가 됐지만 무료접종 기간이 7개월이라 긴 창(L5)이라 '지금 꼭(L4)'이 아니라 '곧'이다 — 06 기대(L4)와 다름. 판정 필요.",
  "'곧' 날짜순(C3) 후에도 마감 없는 상시 지원(SB-04 아동수당)이 날짜 있는 항목이 적은 단계에서는 '곧' 2칸에 남는다: ④ 3~5세는 접종 묶음과 SB-04, ⑤ 6~7세는 10-05에 SC-03·SB-04(11-20에는 SC-01+02 묶음이 위로 옴). 날짜 있는 항목이 없으면 상시가 채우는 구조다.",
  "'지난 접종·검진 기록 확인 N개'(D18)가 한 단위로 '곧' 1칸을 차지하지만 눌러서 갈 곳(체크리스트 필터)이 아직 없다(review 버튼 연결은 1-0 연결 때). 오래된 지원은 묶지 않고 L5로 내린다(초3 아동수당: ageCap 특례로 신청 가능 → '곧').",
];
for (const n of notes) P(`- ${n}`);
P();
const text = lines.join("\n") + "\n";
if (process.argv.includes("--stdout")) process.stdout.write(text);
else { const oi = process.argv.indexOf("--out"); const out = oi > 0 ? process.argv[oi + 1] : "docs/ux-review/07-큐레이션-6명-결과.md"; fs.writeFileSync(path.join(ROOT, out), text); console.log("written", out, text.length); }
