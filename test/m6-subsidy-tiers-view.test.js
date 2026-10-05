// 1-4 지원 목록 3단 연결: subsidy-view.js 가 SubsidyTiers 모델로 ①마감 임박 ②확실히 받는 것 ③조건 확인 + 해당 없음 접힘을 그린다. 실행: node --test test/m6-subsidy-tiers-view.test.js
const test = require("node:test"), assert = require("node:assert"), fs = require("fs"), path = require("path"), vm = require("vm");
const ROOT = path.join(__dirname, "..");
const HN = require("../js/hn-logic.js"), ST = require("../js/subsidy-tiers.js");
const today = new Date(2026, 9, 5);
const sub = (id, o) => ({ id, title: id, category: "행정·지원금", isLegacySubsidy: true, minAgeMonths: 0, maxAgeMonths: 200, entryDate: new Date(2026, 0, 1), detail: { id, deadlineType: "ongoing", ...(o && o.detail) }, ...o });
function run(events, extra) {
  const els = { "subsidy-seg": {}, "subsidy-scope": {}, "subsidy-body": {} };
  for (const k of Object.keys(els)) els[k] = { innerHTML: "", querySelector: () => null, querySelectorAll: () => [], dataset: {} };
  const sb = { window: { FEATURES: { curation: !(extra && extra.off) }, SubsidyTiers: ST, scrollTo() {}, localStorage: null }, document: { getElementById: (id) => els[id] }, HNLogic: HN, console };
  sb.window.window = sb.window;
  vm.createContext(sb);
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/subsidy-view.js"), "utf8").replace("const L = HNLogic;", "const L = HNLogic;"), sb);
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
  sb.window.HNSubsidyView.render({ events, completed: {}, today, ageNow: 6, pregnant: false, profile: { province: "서울특별시", district: "구로구", birthDate: new Date(2026, 3, 1) }, subsidyProvider: () => ({ short: "지역" }), eventItemHtml: (e) => `<div class="event-item" data-id="${e.id}">${e.id}</div>`, bindOpen() {}, esc, formatDateKR: () => "", ...extra });
  return els["subsidy-body"].innerHTML;
}
const dl = (id, days) => sub(id, { deadlineDate: new Date(2026, 9, 5 + days), detail: { id, deadlineType: "birth_relative_days", deadlineValue: 200 } });
test("3단: 마감 임박(D-N 와인 줄) · 확실히 받는 것(마감 먼저 상시 뒤) · 조건 확인 접이식, 개수 요약 줄 없음", () => {
  const html = run([dl("URG", 10), dl("LATER", 100), sub("ONGOING"), sub("COND", { detail: { conditionLabel: "맞벌이", deadlineType: "ongoing" } })]);
  assert.ok(html.includes("마감 임박") && html.includes("D-10 · 10월 15일까지") && html.includes("확실히 받는 것"));
  assert.ok(html.indexOf("LATER") < html.indexOf("ONGOING"), "마감 있는 것 먼저");
  assert.ok(html.includes("조건 확인 1개 보기") && !html.includes("data-sub-answer"), "접힌 상태에서는 답 버튼 없음");
  assert.ok(!/지금 신청 가능 \d+개|이번 달 마감 \d+개/.test(html));
});
test("답: 해당돼요 → 확실히 받는 것으로 + '해당 확인', 아니에요 → '해당 없음 N개' 접힘, 모두 비면 빈 문구", () => {
  const cond = sub("COND", { detail: { conditionLabel: "맞벌이", deadlineType: "ongoing" } }), cond2 = sub("COND2", { detail: { conditionLabel: "x", deadlineType: "ongoing" } });
  const yes = run([cond, cond2], { answers: { COND: "yes", COND2: "no" } });
  assert.ok(yes.includes("확실히 받는 것") && yes.includes("해당 확인") && yes.includes("해당 없음 1개 보기") && !yes.includes("조건 확인"));
  assert.ok(run([], {}).includes("지금 신청할 수 있는 혜택이 없어요."));
  assert.ok(run([cond], { answers: { COND: "no" }, isNA: () => false }).includes("지금 신청할 수 있는 혜택이 없어요."));
  assert.ok(run([sub("NA1")], { isNA: (id) => id === "NA1" }).includes("해당 없음 1개 보기"), "기존 미해당도 읽는다");
});
test("5개 초과는 'N개 더 보기'(정책 expandMax), 없으면 모두 보임; 신청 예정·완료 탭 코드는 그대로", () => {
  const many = [1, 2, 3, 4, 5, 6, 7].map((i) => dl("S" + i, 40 + i));
  assert.ok(run(many, { expandMax: 5 }).includes("2개 더 보기"));
  assert.ok(!run(many, { expandMax: null }).includes("개 더 보기"));
  const src = fs.readFileSync(path.join(ROOT, "js/subsidy-view.js"), "utf8");
  assert.ok(src.includes('data-act="expired"') && src.includes("앞으로 신청할 수 있어요") && src.includes("신청 완료한 혜택"));
});
test("연결: hnCtx 에 답·isNA·expandMax, index/sw 에 subsidy-tiers(subsidy-view 앞), 저장은 기기 저장뿐", () => {
  const app = fs.readFileSync(path.join(ROOT, "js/app.js"), "utf8"), idx = fs.readFileSync(path.join(ROOT, "index.html"), "utf8"), sw = fs.readFileSync(path.join(ROOT, "sw.js"), "utf8");
  assert.ok(/answers: typeof SubsidyTiers !== "undefined" \? SubsidyTiers\.loadAnswers/.test(app) && /expandMax: curationPolicy && curationPolicy\.slots/.test(app));
  assert.ok(idx.indexOf("js/subsidy-tiers.js") < idx.indexOf("js/subsidy-view.js") && sw.includes("subsidy-tiers.js"));
  assert.ok(!/setDoc|addDoc|updateDoc|firestore/i.test(fs.readFileSync(path.join(ROOT, "js/subsidy-tiers.js"), "utf8").replace(/Firestore[^\n]*/g, "")));
});

test("플래그 curation OFF: SubsidyTiers 가 로드돼 있어도 기존 렌더('지금 신청할 수 있어요' 한 목록), 3단·답 버튼 없음. ON 은 3단", () => {
  const evs = [dl("URG", 10), sub("ONGOING"), sub("COND", { detail: { conditionLabel: "맞벌이", deadlineType: "ongoing" } })];
  const off = run(evs, { off: true });
  assert.ok(off.includes("지금 신청할 수 있어요") && !off.includes("마감 임박") && !off.includes("확실히 받는 것") && !off.includes("조건 확인") && !off.includes("data-sub-answer"), off);
  assert.ok(run(evs).includes("확실히 받는 것"));
});
test("[해당돼요]는 홈 카드처럼 상세를 연다(아니에요는 열지 않음)", () => {
  const src = fs.readFileSync(path.join(ROOT, "js/subsidy-view.js"), "utf8");
  assert.ok(/v === "yes" && Array\.isArray\(ctx\.events\)/.test(src) && src.includes("ctx.openDetail(target)"));
});

test("플래그 OFF 렌더 = v1.12.102(HEAD 871cac1) 문구·구조: 조건 접힘 버튼(닫힘·열림)·빈 문구 포함", () => {
  const cond = sub("COND", { detail: { conditionLabel: "맞벌이", deadlineType: "ongoing" } });
  const closed = run([sub("A"), cond], { off: true });
  assert.ok(closed.includes('<button type="button" class="sub-expired-toggle sub-cond-toggle" data-act="conditional">조건에 해당하면 신청할 수 있는 혜택 1개 보기</button>') && !closed.includes('class="sub-conditional"'), closed);
  const only = run([cond], { off: true });
  assert.ok(only.includes("지금 신청할 수 있는 혜택이 없어요.") && only.includes("혜택 1개 보기"), only);
  const els = {}; // 열림: 토글 클릭 뒤 접기 + 목록(원본 핸들러 그대로)
  const src = fs.readFileSync(path.join(ROOT, "js/subsidy-view.js"), "utf8");
  assert.ok(src.includes('<div class="sub-conditional">${b.conditional.map((e) => cardHtml(ctx, e)).join("")}</div>') && src.includes('conditionalOpen ? "접기" : "보기"}</button>`;\n          if (conditionalOpen)'));
});
