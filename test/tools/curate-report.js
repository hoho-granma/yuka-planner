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
const defs = FILES.flatMap((f) => rd(f).todos).map(applyBirthRule);
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
const unitText = (u) => `${u.ids.map(pre).join("+")} ${u.title}`.replace(/\|/g, "/");
const shortList = (arr) => (arr.length ? arr.map((u) => u.ids.map(pre).join("+")).join(", ") : "—");
const cell = (s) => String(s).replace(/\|/g, "/");

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
    for (const u of list) P(`| ${slotName[s]} | ${cell(unitText(u))}${u.type === "CHECK" ? " (확인형)" : ""} | ${u.rule} | ${cell(u.reason.text)}${kid.key.startsWith("⑥") && u.ids.some((i) => pre(i) === "SB-04") && s === "now" ? " **(D19 대기: ageCap 특례로 신청 가능, 긴 창 상향 규칙 승인 시 '곧'으로 내려감)**" : ""} | ${u.actionKind} |`);
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
// 아래 5개는 2026-10-05 실행 결과를 보고 hn_dev 가 적은 의견(판정 아님). 결과가 바뀌면 이 문구도 다시 봐야 한다.
const notes = [
  "슬롯 넘침이 크다: ② 지금 꼭 8건(+5), ③ 17건(+14). '완료 기록 없음' 가정이라 이미 지났을 접종·검진(VX-HEPB·BCG 등 OVERDUE_CATCHUP)이 전부 L3로 올라와 슬롯 3을 채운다. 21개월 아이에게 HEPB 1차·BCG가 '지금 꼭'의 맨 위인 것이 부모가 먼저 볼 일인지 검토 필요(실사용에서는 완료 기록·나이 지난 항목 처리가 결과를 좌우한다).",
  "'N개 더'가 사실상 전체 목록이다: ② 곧 +25·알아두기 +16, ③ 알아두기 +36. 접힘을 펼치면 홈이 목록 화면이 되므로 펼침 상한 또는 분류가 필요한지 검토.",
  "curation.json에 bundles 가 없어 TO_BORN(PG-01·SB-02·SB-04)·SC-01·02 묶음이 만들어지지 않았다(접종 같은 창 묶음만 동작). ① 임신 '곧'에 출산 후 묶음이 안 나오고, ⑤ SC-01·02는 시작이 45일 뒤라 L7로 빠진다(기대는 곧).",
  "임신(①)에서 출산 후 항목(NAT-004·GURO-P02·NAT-011·SEOUL-001 등)이 '곧' 후보로 많이 섞이고(+21), PREG-005 독감 접종은 기대(지금 꼭)와 달리 알아두기(KNOW, L5)로 갔다 — 임신 항목의 분류(ids 표에 PREG-005 없음)와 임신 전용 필터 확인 필요.",
  "연령과 맞지 않아 보이는 항목이 상위에 뜬다: ⑥ 초3에 SB-04 아동수당이 '지금 꼭'(L3), ④~⑥에 SB-06~09(미숙아·어린이집 보육료·아이돌봄)가 '곧'의 확인형으로 반복. 나이 상한(ageCap) 반영·확인형의 노출 조건(조건 답이 없을 때 모든 나이에 노출)을 검토. 또 확인형 일부의 actionKind가 done(링크·일정 연결 없음)이라 행동 버튼이 '완료'로 나온다.",
];
for (const n of notes) P(`- ${n}`);
P();
const text = lines.join("\n") + "\n";
if (process.argv.includes("--stdout")) process.stdout.write(text);
else { fs.writeFileSync(path.join(ROOT, "docs/ux-review/07-큐레이션-6명-결과.md"), text); console.log("written", text.length); }
