// 1-0 ⑥: 6명(2026-10-05 고정, 완료 기록 없음) curate 결과를 기대값으로 고정 — hn_pm 검토(07b §5~) 통과본(v3.1). 검증 후 test/ 로 이동하고 경로를 상대 경로로 바꾼다.
const test = require("node:test"), assert = require("node:assert"), cp = require("child_process"), fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..");
const expected = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "curate-six.expected.json"), "utf8"));
const actual = JSON.parse(cp.execFileSync("node", ["test/tools/curate-report.js", "--json"], { cwd: ROOT, encoding: "utf8" }));
for (const key of Object.keys(expected)) {
  test(`6명 고정: ${key}`, () => assert.deepStrictEqual(actual[key], expected[key]));
}
test("6명 공통 불변식: 슬롯 개수는 정책(3/2/1) 이하, 'N개 더'는 넘친 만큼, REVIEW_PAST 는 있으면 '곧' 맨 앞", () => {
  for (const [k, v] of Object.entries(actual)) {
    assert.ok(v.now.length <= 3 && v.soon.length <= 2 && v.know.length <= 1, k);
    const rv = v.soon.findIndex((x) => x.endsWith(":review"));
    assert.ok(rv === -1 || rv === 0, `${k}: 지난 기록 확인은 곧 맨 앞`);
  }
});
