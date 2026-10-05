/* G18 계정 모드가 모든 사용자의 기본값. 실행: node test/g18-default-on.test.js */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const read = (f) => fs.readFileSync(path.join(__dirname, "..", f), "utf8");
const APP = read("js/app.js");
let passed = 0;
function test(name, f) { try { f(); passed++; console.log("  ok  - " + name); } catch (e) { process.exitCode = 1; console.log("  FAIL- " + name + "\n      " + (e.stack || e).split("\n").slice(0, 4).join("\n      ")); } }
const flags = (store, throwing) => {
  const sb = { console, localStorage: { getItem: (k) => { if (throwing) throw new Error("blocked"); return k in store ? store[k] : null; } } };
  sb.window = sb; vm.createContext(sb); vm.runInContext(read("js/feature-flags.js"), sb);
  return JSON.parse(JSON.stringify(sb.FEATURES));
};
test("저장소가 비어 있으면(홈 화면 앱·새 기기) accounts·household·autoLink 모두 true", () => {
  assert.deepStrictEqual(flags({}), { household: true, autoLink: true, accounts: true });
  assert.strictEqual(flags({}, true).accounts, true, "저장소 접근이 막혀도 기본 ON");
});
test("hannun_feature_accounts='0' 이면 꺼짐(개발용): household 는 '1' 일 때만, autoLink 는 household 에 따른다", () => {
  assert.deepStrictEqual(flags({ hannun_feature_accounts: "0" }), { household: false, autoLink: false, accounts: false });
  assert.deepStrictEqual(flags({ hannun_feature_accounts: "0", hannun_feature_household: "1" }), { household: true, autoLink: true, accounts: false });
});
test("예전 베타 키 '1' 이 남은 기기도 그대로 ON, '0' 이외의 값은 끄지 않는다", () => {
  assert.deepStrictEqual(flags({ hannun_feature_accounts: "1", hannun_feature_household: "1" }), { household: true, autoLink: true, accounts: true });
  assert.strictEqual(flags({ hannun_feature_accounts: "false" }).accounts, true);
});
test("계정 모드에서는 베타 스위치·미리 써 보기·끄기 경로가 열리지 않는다(정적)", () => {
  assert.ok(/function betaOpenSlot[\s\S]*?acctEnabled\(\)\) \{ if \(slot\) slot\.innerHTML = ""; return; \}/.test(APP));
  assert.ok(/function betaOnClick[\s\S]*?if \(typeof acctEnabled === "function" && acctEnabled\(\)\) return;/.test(APP));
  assert.ok(/function previewOnClick[\s\S]*?if \(acctEnabled\(\)\) return;/.test(APP));
  assert.ok(APP.includes('if (action === "beta-off-ask") return;'));
  assert.ok(/slot\.innerHTML = !acctEnabled\(\) && !newChildMode \? AccountView\.renderBetaPreviewCard\(\)/.test(APP), "미리 써 보기 카드는 OFF 에서만");
});
test("feature-flags.js ?v 가 올라갔고 서비스워커는 앱 셸을 network-first(no-cache)로 받는다", () => {
  assert.ok(/feature-flags\.js\?v=([5-9]|\d\d)"/.test(read("index.html")));
  const sw = read("sw.js");
  assert.ok(/fetch\(event\.request, \{ cache: "no-cache" \}\)[\s\S]*\.catch\(\(\) => caches\.match\(event\.request\)\)/.test(sw));
});
console.log(`\n${passed}개 통과`);
