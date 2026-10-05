// 1-6 '무엇이 달라지나' 카드 연결: changes 는 정책에서만, C(_changesPending)는 읽지 않음, 30~32개월 카드 단독·33개월부터 배너+시트 카드. 실행: node --test test/m10-next-stage-card.test.js
const test = require("node:test"), assert = require("node:assert"), fs = require("fs"), path = require("path");
const NS = require("../js/next-stage.js"), CARD = require("../js/next-stage-card.js");
const raw = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data/policy/next-stage.json"), "utf8"));
const pol = NS.normalizePolicy(raw);
const app = fs.readFileSync(path.join(__dirname, "..", "js/app.js"), "utf8");
test("정책: TO_3_5 에만 changes 3줄, 학년 전환(_changesPending)은 어느 단계에도 안 실린다", () => {
  const s = pol.stages.find((x) => x.id === "TO_3_5");
  assert.deepStrictEqual(s.changes, raw.stages.find((x) => x.id === "TO_3_5").changes); assert.strictEqual(s.infoWindowMonths, 6);
  for (const st of pol.stages) if (st.id !== "TO_3_5" && !raw.stages.find((x) => x.id === st.id).changes) assert.strictEqual(st.changes, undefined, st.id);
  assert.ok(!JSON.stringify(pol).includes("입학 후 90일"), "C 문구 비노출");
});
test("연결: 카드는 시트(cardHtml)와 30~32개월 홈 카드 단독에만, 문장이 없으면 빈 문자열", () => {
  assert.ok(/cardHtml: nsCardHtml\(NSS\.m\)/.test(app) && /m\.bannerOn === false/.test(app));
  const s = pol.stages.find((x) => x.id === "TO_3_5");
  assert.ok(CARD.render(s, { ageMonths: 31 }, []).includes("교육 탭이 새로 열려요"));
  assert.strictEqual(CARD.render(pol.stages.find((x) => x.id === "TO_BORN"), { ageMonths: null }, []), "");
  assert.strictEqual(CARD.render(s, { ageMonths: 29 }, []), "", "29개월은 아직");
});
