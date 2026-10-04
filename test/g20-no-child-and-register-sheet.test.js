/* G20 아이 없는 계정 화면(배너 한 줄 + 평소 화면) · 아이 등록 바텀시트(시안 A). 실행: node test/g20-no-child-and-register-sheet.test.js */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const AV = require("../js/account-view.js");
const DP = require("../js/date-picker.js");
const read = (f) => fs.readFileSync(path.join(__dirname, "..", f), "utf8");
const APP = read("js/app.js");
let passed = 0;
async function test(name, f) { try { await f(); passed++; console.log("  ok  - " + name); } catch (e) { process.exitCode = 1; console.log("  FAIL- " + name + "\n      " + (e.stack || e).split("\n").slice(0, 4).join("\n      ")); } }
function fn(name, async_) { const i = APP.indexOf(`  ${async_ ? "async " : ""}function ${name}(`); assert.ok(i >= 0, name); return APP.slice(i, APP.indexOf("\n  }\n", i) + 4); }
const bannerCount = (h) => (h.match(/id="acct-nc-banner"/g) || []).length;
const st = { user: { uid: "u1", displayName: "주연" }, account: { displayName: "주연", role: "MOM", province: "서울특별시", district: "구로구" } };

(async () => {
  await test("홈·체크리스트·혜택·기록: 배너가 정확히 한 번, '등록 ›'은 data-acct-action=empty-register, 큰 [아이 등록하기] 버튼은 없다", () => {
    const pages = { home: AV.renderNoChildHome({ ...st, familyHtml: "<section>가족</section>", mineHtml: "<section>내</section>" }), checklist: AV.renderNoChildTab("checklist", st), subsidy: AV.renderNoChildTab("subsidy", st), record: AV.renderNoChildTab("record", st) };
    for (const [k, h] of Object.entries(pages)) {
      assert.strictEqual(bannerCount(h), 1, k);
      assert.ok(h.includes('class="acct-nc-ban-go" data-acct-action="empty-register">등록 ›</button>'), k);
      assert.ok(!h.includes("btn-complete") && !h.includes("아이 등록하기"), k + " 큰 버튼 반복 금지");
    }
    assert.ok(pages.home.indexOf("acct-nc-banner") < pages.home.indexOf("acct-nc-me") && pages.home.indexOf("acct-nc-me") < pages.home.indexOf("가족") && pages.home.indexOf("가족") < pages.home.indexOf("내</section>"), "배너 → 내 카드 → 가족 일정 → 내 일정");
    assert.ok(pages.home.includes("주연 · 나(엄마)") && pages.home.includes("서울특별시 구로구") && pages.home.includes('data-acct-action="nc-me"'));
    assert.ok(pages.checklist.includes("acct-nc-ghost") && pages.subsidy.includes("신청 가능") && pages.subsidy.includes("acct-nc-ghost"));
    assert.ok(AV.renderNoChildTab("checklist", { expecting: true }).includes("출산 예정일을 등록하면"));
  });

  await test("아이 없는 계정의 캘린더·어디갈까는 빈 안내 패널이 아니라 평소 탭이다(switchTab 분기 + acctNoChildTab: 안내 패널 숨김, 탭 그리기)", () => {
    assert.ok(/function switchTab\(name\) \{\n\s*if \(emptyHome && !profile\) return name === "calendar" \|\| name === "places" \? acctNoChildTab\(name\) : emptyRender\(name\);/.test(APP));
    const cls = (init) => { const s = new Set(init); return { classList: { add: (c) => s.add(c), remove: (c) => s.delete(c), toggle: (c, on) => (on ? s.add(c) : s.delete(c)), contains: (c) => s.has(c) } }; };
    const els = { "empty-panel": cls([]), "tab-home": cls(["hidden"]), "tab-calendar": cls(["hidden"]), "tab-record": cls(["hidden"]), "tab-subsidy": cls(["hidden"]), "tab-checklist": cls(["hidden"]), "tab-places": cls(["hidden"]) };
    const calls = [];
    const sb = { el: (id) => els[id], TAB_NAMES: ["home", "calendar", "record", "subsidy", "checklist", "places"], currentTab: "home", document: { querySelectorAll: () => [] }, window: { scrollTo() {} }, renderCalendar: () => calls.push("cal"), renderSelectedDayPanel: () => calls.push("day"), attachListHandlers: () => calls.push("attach"), renderPlacesTab: () => calls.push("places") };
    vm.createContext(sb);
    vm.runInContext(fn("acctNoChildTab"), sb);
    sb.acctNoChildTab("calendar");
    assert.deepStrictEqual(calls, ["cal", "day", "attach"]);
    assert.ok(els["empty-panel"].classList.contains("hidden") && !els["tab-calendar"].classList.contains("hidden") && els["tab-home"].classList.contains("hidden"));
    sb.acctNoChildTab("places");
    assert.strictEqual(calls[calls.length - 1], "places");
    assert.ok(!els["tab-places"].classList.contains("hidden"));
    // 월령 배치(computeCalendarDays)는 아이가 없으면 건너뛴다(캘린더는 가족·내 일정만)
    assert.ok(APP.includes("if (!profile) { calDisplayDays = new Map(); return; }"));
  });

  await test("계정 모드에서 view-landing 폼이 열리지 않는다: enterNewChildEntry 는 등록 시트로 바뀌고(OFF 만 기존 폼), 시트는 showLandingView·setLandingStage 를 열기 전에 부르지 않는다", () => {
    assert.ok(/enterNewChildEntry = function \(opts\) \{\n\s*if \(!acctEnabled\(\)\) return enterNewChildEntryBase\(opts\);\n\s*return acctChildSheetOpen\(\);/.test(APP));
    const open = fn("acctChildSheetOpen");
    assert.ok(!/showLandingView|setLandingStage|query-form/.test(open), "열 때 옛 폼을 건드리지 않는다");
    assert.ok(!/showLandingView/.test(fn("acctChildSheetRender")) && !/showLandingView/.test(fn("acctChildSheetSave", true)));
    // 진입점 3곳(+ 메뉴 · 배너 · 프로필)은 모두 beginNewChildEntry → enterNewChildEntry 로 모인다
    assert.ok(APP.includes("return beginNewChildEntry({ codeEntry: false });") && APP.includes('return beginNewChildEntry(); // 기존 아이 입력 흐름') && APP.includes("closeDetail(); beginNewChildEntry();"));
    assert.ok(/async function beginNewChildEntry[\s\S]*?enterNewChildEntry\(opts\);/.test(APP));
  });

  const sheetEnv = (o) => {
    const vals = { "cr-name": o.name, "cr-date": o.date };
    const log = { submit: 0, closed: 0, stage: null, filled: {} };
    const btn = { disabled: false, textContent: "저장" };
    const err = { textContent: "", classList: { remove() { err.shown = true; }, add() {} } };
    const mkI = (id) => ({ get value() { return vals[id] || ""; }, set value(v) { vals[id] = v; log.filled[id] = v; }, focus() {} });
    const els = { "cr-name": mkI("cr-name"), "cr-date": mkI("cr-date"), "cr-save": btn, "cr-error": err, childName: mkI("childName"), birthDate: mkI("birthDate"), birthOrder: mkI("birthOrder"), province: mkI("province"), district: mkI("district") };
    const sb = {
      console, setInterval, clearInterval, Date, AccountView: AV, HNDatePicker: DP, ChildTimeline: { SERVICE_RANGE: { pickerYearsBack: 8 } },
      crPb: null, pbCollect: () => ({ ok: false, message: "x" }), pregRegBasis: undefined, // 임신 입력 방식 블록(임신 등록에서만 쓰인다)
      crState: { kind: o.kind || "born", gender: o.gender || "", photo: o.photo || null }, modalMode: "child-register", profile: o.profile || null, schedule: [],
      el: (id) => els[id], acctChildRegion: () => o.region === undefined ? { province: "서울특별시", district: "구로구" } : o.region, acctKidCount: () => o.kids || 0,
      setLandingStage: (k) => (log.stage = k), populateDistricts() {}, saveProfile() {}, pushProfileToFamily() {}, buildAndRender: async () => {}, closeDetail: () => log.closed++,
      handleSubmit: async () => { log.submit++; if (!o.reject) { sb.profile = { name: vals.childName, stage: log.stage }; sb.schedule = [1]; } },
    };
    vm.createContext(sb);
    vm.runInContext([fn("acctChildSheetError"), fn("acctChildSheetSave", true)].join("\n"), sb);
    return { sb, log, err, btn, vals };
  };
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const plus = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d); };

  await test("저장: 이름 비면 오류(handleSubmit 호출 0), 날짜 없음/범위 밖(생년월일=미래, 예정일=300일 초과·과거)도 같은 규칙의 오류 문구", async () => {
    const N = AV.MSG.nc;
    let t = sheetEnv({ name: "  ", date: plus(-30) }); await t.sb.acctChildSheetSave(); assert.strictEqual(t.err.textContent, N.errName); assert.strictEqual(t.log.submit, 0);
    t = sheetEnv({ name: "은찬", date: "" }); await t.sb.acctChildSheetSave(); assert.strictEqual(t.err.textContent, N.errDate); assert.strictEqual(t.log.submit, 0);
    t = sheetEnv({ name: "은찬", date: plus(5), kind: "born" }); await t.sb.acctChildSheetSave(); assert.strictEqual(t.err.textContent, N.errDateBorn); assert.strictEqual(t.log.submit, 0);
    t = sheetEnv({ name: "은찬", date: plus(400), kind: "pregnant" }); await t.sb.acctChildSheetSave(); assert.strictEqual(t.err.textContent, N.errDateDue); assert.strictEqual(t.log.submit, 0);
    t = sheetEnv({ name: "은찬", date: plus(-10), kind: "pregnant" }); await t.sb.acctChildSheetSave(); assert.strictEqual(t.err.textContent, N.errDateDue, "예정일은 오늘 이후");
    t = sheetEnv({ name: "은찬", date: plus(-30), region: null }); await t.sb.acctChildSheetSave(); assert.strictEqual(t.err.textContent, N.errRegion);
  });
  await test("저장 성공: 기존 handleSubmit 에 숨은 옛 폼 칸(이름·날짜·몇째·지역·날짜종류)을 채워 그대로 맡기고, 성별·사진은 받지 않으므로 profile 에 얹지 않고, 시트를 닫는다 → 홈에 아이가 나온다", async () => {
    const t = sheetEnv({ name: " 은찬 ", date: plus(-30), kind: "born", kids: 1 });
    await t.sb.acctChildSheetSave();
    assert.strictEqual(t.log.submit, 1);
    assert.deepStrictEqual([t.log.stage, t.log.filled.childName, t.log.filled.birthDate, t.log.filled.birthOrder, t.log.filled.province, t.log.filled.district], ["born", "은찬", plus(-30), "second", "서울특별시", "구로구"]);
    assert.ok(t.sb.profile && t.sb.profile.name === "은찬" && t.sb.profile.gender === undefined && t.sb.profile.photoDataUrl === undefined);
    assert.strictEqual(t.log.closed, 1);
    const p = sheetEnv({ name: "콩이", date: plus(100), kind: "pregnant" });
    await p.sb.acctChildSheetSave();
    assert.deepStrictEqual([p.log.stage, p.log.filled.birthOrder, p.sb.profile.gender], ["pregnant", "first", undefined], "성별은 묻지 않으므로 저장하지 않는다");
  });
  await test("handleSubmit 이 저장하지 않으면(검증 실패 등) 시트를 닫지 않고 저장 버튼을 되살린다", async () => {
    const t = sheetEnv({ name: "은찬", date: plus(-30), reject: true });
    const t0 = Date.now(); // 8초 대기 규칙이 있어 handleSubmit 이 끝나면 곧바로 빠져나온다
    await t.sb.acctChildSheetSave();
    assert.ok(Date.now() - t0 < 3000 && t.log.closed === 0 && t.btn.disabled === false && t.err.shown === true);
  });
  await test("시트 마크업(하네스용): 한 장 A — 이름·날짜 종류 토글·날짜·미리보기·저장·오류(성별·사진 없음), 지역은 묻지 않는다(계정 지역 사용), 지역 정보가 없을 때만 선택칸", () => {
    const h = AV.renderChildSheet({ kind: "pregnant", dateMarkup: '<i id="d"></i>' });
    ["cr-name", "data-cr-kind=\"born\"", "data-cr-kind=\"pregnant\"", "cr-date-slot", "cr-preview", "cr-save", "cr-error", "data-acct-child-sheet"].forEach((k) => assert.ok(h.includes(k), k));
    assert.ok(h.indexOf("cr-name") < h.indexOf("data-cr-kind") && h.indexOf("data-cr-kind") < h.indexOf("cr-date-slot") && h.indexOf("cr-date-slot") < h.indexOf("cr-preview") && h.indexOf("cr-preview") < h.indexOf("cr-save"));
    ["data-cr-gender", "cr-photo", "성별", "사진"].forEach((k) => assert.ok(!h.includes(k), "빠진 항목: " + k));
    assert.ok(!h.includes("cr-province"));
    assert.ok(AV.renderChildSheet({ needRegion: true, regions: [{ code: "서울특별시", name: "서울특별시" }] }).includes("cr-province"));
    assert.ok(h.includes('aria-checked="true"') && /data-cr-kind="pregnant" aria-checked="true"/.test(h));
    assert.deepStrictEqual([AV.MSG.nc.previewDue(36, 28, "2026년 10월 31일").main, AV.MSG.nc.previewDue(36, 28, "x").sub.startsWith("출산까지 28일")], ["임신 36주", true]);
    assert.ok(AV.MSG.nc.previewBorn("생후 3개월").main === "생후 3개월");
  });
  await test("OFF('0')·로그아웃 화면은 그대로: 새 화면은 계정 모드 분기 안에서만(emptyRender·enterNewChildEntry 래퍼·acctOnClick), CSS 는 body.acct-design 범위", () => {
    assert.ok(fn("emptyRender").includes("AccountView.renderNoChildHome") && !/renderEmptyTab|renderEmptyHome/.test(fn("emptyRender")));
    const css = read("css/style.css");
    const i = css.indexOf("/* ===== G20:");
    assert.ok(i > 0);
    const rules = css.slice(i).replace(/\/\*[\s\S]*?\*\//g, "").replace(/@media[^{]*\{/g, "").split("}").map((r) => r.split("{")[0].trim()).filter(Boolean);
    rules.forEach((sel) => sel.split(",").forEach((s) => assert.ok(s.trim().startsWith("body.acct-design"), s)));
  });
  await test("작은 화면: [저장]은 시트 아래 고정(sticky + safe-area), 낮은 화면(≤760px)에서는 간격 축소 — 모두 body.acct-design 범위", () => {
    const css = read("css/style.css");
    assert.ok(/body\.acct-design \.acct-cs-foot \{ position: sticky; bottom: -32px;[^}]*env\(safe-area-inset-bottom\)/.test(css));
    assert.ok(/@media \(max-height: 760px\) \{\n\s*body\.acct-design \.acct-cs \{ gap: 5px; \}/.test(css));
    assert.ok(AV.renderChildSheet({}).includes('<div class="acct-cs-foot"><button type="button" class="acct-cs-save" id="cr-save">'));
  });
  console.log(`\n${passed}개 통과`);
})();
