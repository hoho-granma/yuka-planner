// 도서관 등 권장 나이: 12의 배수−1 개월 끝(71·131·167)은 '만 N세 미만', 그 밖은 지금 표기 그대로. 실행: node --test test/m11-age-label.test.js
const test = require("node:test"), assert = require("node:assert"), fs = require("fs"), path = require("path");
const src = fs.readFileSync(path.join(__dirname, "..", "js/places-view.js"), "utf8");
const i = src.indexOf("  function ageText(a) {"), fn = src.slice(i, src.indexOf("\n  }\n", i) + 4);
const ageText = new Function(`${fn}; return ageText;`)();
test("만 N세 미만 표기·그 밖은 기존 그대로", () => {
  assert.strictEqual(ageText({ min: null, max: 167 }), "만 14세 미만"); assert.strictEqual(ageText({ min: null, max: 71 }), "만 6세 미만");
  assert.strictEqual(ageText({ min: 0, max: 131 }), "0개월~만 11세 미만");
  assert.strictEqual(ageText({ min: 0, max: 72 }), "0~72개월"); assert.strictEqual(ageText({ min: null, max: 24 }), "24개월까지"); assert.strictEqual(ageText({ min: 36, max: null }), "36개월 이상"); assert.strictEqual(ageText(null), null);
});
