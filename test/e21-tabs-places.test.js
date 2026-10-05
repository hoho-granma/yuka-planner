/*
 * E(2-1·2-2) 하단 탭 교체(가구·계정 ON: 기록→어디갈까, OFF 불변) + 프로필 '기록 보기' + 어디갈까 연결, E(1-2b) 챙길 것 5개 제한·마감 표기.
 * 실행: node test/e21-tabs-places.test.js
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const V = require("../js/user-schedule-view.js");
const P = require("../js/places.js");
const PV = require("../js/places-view.js");
const AV = require("../js/account-view.js");
const read = (f) => fs.readFileSync(path.join(__dirname, "..", f), "utf8");
const APP = read("js/app.js"), HTML = read("index.html");
let passed = 0;
function test(name, fn) { try { fn(); passed++; console.log("  ok  - " + name); } catch (e) { process.exitCode = 1; console.log("  FAIL- " + name + "\n      " + (e.stack || e).split("\n").slice(0, 6).join("\n      ")); } }
const PLACES = JSON.parse(read("data/places.json"));

console.log("마크업·정적 연결");
test("index.html: 어디갈까 nav(기본 hidden, 라벨 '어디갈까' 물음표 없음, 선 굵기 1.8 SVG)·기록 nav 그대로·패널 제목 '어디갈까?'·스크립트/CSS 순서·돌아가기 버튼(기본 hidden)", () => {
  const nav = HTML.match(/<button type="button" class="nav-item hidden" data-nav="places">[\s\S]*?<\/button>/)[0];
  assert.ok(nav.includes('stroke-width="1.8"') && nav.includes("<span>어디갈까</span>") && !nav.includes("?"));
  assert.ok(/<button type="button" class="nav-item" data-nav="record">[\s\S]*?<span>기록<\/span>/.test(HTML), "기록 nav 는 기본 노출(OFF 불변)");
  assert.ok(HTML.indexOf('data-nav="record"') < HTML.indexOf('data-nav="places"'));
  assert.ok(/<div id="tab-places" class="tab-panel hidden">\s*<div class="sub-header"><h2>어디갈까\?<\/h2><\/div>\s*<div id="places-body"><\/div>/.test(HTML));
  assert.ok(HTML.includes('<button type="button" class="btn-back hidden" id="btn-record-back">‹ 돌아가기</button>'));
  const i = (s) => HTML.indexOf(s);
  assert.ok(i("css/places.css") > i("css/style.css") && i("js/places.js") > 0 && i("js/places.js") < i("js/places-view.js") && i("js/places-view.js") < i("js/app.js"));
  const sw = read("sw.js");
  ["./js/places.js", "./js/places-view.js", "./css/places.css"].forEach((f) => assert.ok(sw.includes(`"${f}"`), f));
  assert.ok(APP.includes('const TAB_NAMES = ["home", "calendar", "record", "subsidy", "checklist", "places"];'));
  assert.ok(AV.MSG.emptyTab.places && AV.renderEmptyTab("places", {}).includes("갈 만한 곳"), "빈 홈 탭 문구");
});

console.log("탭 레이아웃·기록 보기·어디갈까 동작");
function env(o) {
  const a = APP.indexOf("  // ── E(2-1·2-2) 하단 탭 교체"), b = APP.indexOf("  function switchTab(name) {");
  const mkEl = (hidden) => ({ hidden, classList: { toggle(n, on) { this.owner.hidden = on; }, remove(n) { this.owner.hidden = false; }, add(n) { this.owner.hidden = true; }, owner: null }, innerHTML: "", listeners: {}, querySelector: () => null });
  const nodes = { rec: mkEl(false), pl: mkEl(true), back: mkEl(true), body: mkEl(false), modal: mkEl(true), content: mkEl(false), close: mkEl(false) };
  Object.values(nodes).forEach((n) => (n.classList.owner = n));
  nodes.close.addEventListener = (t, f) => (nodes.close.listeners[t] = f);
  const log = { switched: [], closed: 0, form: null, profileSheet: 0, shown: 0 };
  const us = { form: null, messages: ["x"], saving: true };
  const sb = { console, JSON, Promise, Places: P, PlacesView: PV, ChildTimeline: { ageLabelAt: () => "7개월", completedMonths: () => 7, OVER36_FROM_MONTHS: 36 }, UserScheduleView: V, us,
    document: { querySelector: (sel) => (sel.includes("record") ? nodes.rec : sel.includes("places") ? nodes.pl : null) },
    el: (id) => ({ "btn-record-back": nodes.back, "places-body": nodes.body, "modal-content": nodes.content, "detail-modal": nodes.modal, "btn-places-close": nodes.close }[id] || null),
    hhEnabled: () => o.on, usActive: () => o.active !== false, usActiveChildKey: () => "c1", usLinks: () => [{ childKey: "c1", displayName: "수아", order: 1 }], memActiveId: () => "m1", usShowForm: () => { log.shown++; log.form = { ...sb.us.form }; },
    esc: (x) => String(x), ADD_MENU_MSG: { needHousehold: "가족 캘린더를 만들어 주세요", close: "닫기" }, closeDetail: () => { log.closed++; }, showProfileSheet: () => { log.profileSheet++; },
    HNDatePicker: { markup: () => '<div id="plr-dp-btn"></div>', bindById: () => ({ set() {} }) }, usMembers: () => [{ memberId: 'm1', role: 'MOM', label: '엄마', order: 1 }], HouseholdView: require('../js/household-view.js'), formatDateKR: () => '', toISODate: () => '2026-10-03', UserSchedule: require('../js/user-schedule.js'), HouseholdSync: {}, usRefreshCalendar() {},
    switchTab: (n) => { log.switched.push(n); sb.currentTab = n; }, currentTab: o.tab || "home", modalMode: null, loadJsonOrNull: async () => PLACES,
    profile: o.profile === undefined ? { name: "수아", province: "서울특별시", district: "구로구", birthDate: new Date(2026, 2, 2) } : o.profile, isPregnant: () => false, childDisplayName: () => "수아", ageInMonths: () => 7 };
  vm.createContext(sb);
  vm.runInContext(APP.slice(a, b).replace(/^  let (\w+) =/gm, "var $1 =").replace(/^  const (\w+) =/gm, "var $1 =") + "\n;globalThis.__t = { applyTabLayout, openRecordView, renderPlacesTab, placesOnClick, placesViewHtml, get recordReturnTab() { return recordReturnTab; }, get placesCat() { return placesCat; } };", sb);
  return { sb, nodes, log, t: sb.__t, us };
}
test("applyTabLayout: ON 이면 기록 nav 숨김·어디갈까 nav 표시·돌아가기 표시 / OFF 면 기록 nav 그대로·어디갈까 숨김(불변)", () => {
  const on = env({ on: true }); on.t.applyTabLayout();
  assert.deepStrictEqual([on.nodes.rec.hidden, on.nodes.pl.hidden, on.nodes.back.hidden], [true, false, false]);
  const off = env({ on: false }); off.t.applyTabLayout();
  assert.deepStrictEqual([off.nodes.rec.hidden, off.nodes.pl.hidden, off.nodes.back.hidden], [false, true, true]);
});
test("기록 보기: 시트를 닫고 기록 탭으로 이동, 돌아가기용 이전 탭 기억(기록·어디갈까에서 열면 홈)", () => {
  const e = env({ on: true, tab: "calendar" });
  e.t.openRecordView();
  assert.deepStrictEqual([e.log.closed, e.log.switched, e.t.recordReturnTab], [1, ["record"], "calendar"]);
  const p = env({ on: true, tab: "places" }); p.t.openRecordView();
  assert.strictEqual(p.t.recordReturnTab, "home");
  assert.ok(/id="btn-view-records"/.test(APP) && /\$\{hhEnabled\(\) \? '<button type="button" class="btn-close" id="btn-view-records">기록 보기<\/button>' : ""\}/.test(APP), "프로필 시트 버튼은 가구·계정 ON 일 때만");
  assert.ok(APP.includes('el("btn-record-back").addEventListener("click", () => switchTab(recordReturnTab || "home"));'));
});
test("어디갈까 렌더: places.json 을 읽어 내 지역·월령으로 거르고(카드 렌더), 분류 칩을 누르면 다시 그리며, 탭이 바뀌었으면 그리지 않는다", async () => {
  const e = env({ on: true, tab: "places" });
  await e.t.renderPlacesTab();
  assert.ok(e.nodes.body.innerHTML.includes("places-view") && !e.nodes.body.innerHTML.replace(/<p class="places-basis">[\s\S]*?<\/p>/, "").includes("수아") && !e.nodes.body.innerHTML.includes("places-ctx") && e.nodes.body.innerHTML.includes("data-places-id=") && e.nodes.body.innerHTML.includes("data-places-drive="));
  const total = (e.nodes.body.innerHTML.match(/data-places-id=/g) || []).length;
  assert.ok(total >= 1 && total <= PLACES.places.length);
  const cat = PLACES.places[0].category;
  e.t.placesOnClick({ target: { closest: (s) => (s === "[data-places-cat]" ? { getAttribute: () => cat } : null) } });
  assert.strictEqual(e.t.placesCat, cat);
  assert.ok((e.nodes.body.innerHTML.match(/data-places-id=/g) || []).length >= 1 && e.nodes.body.innerHTML.includes(`data-places-cat="${cat}"`));
  const other = env({ on: true, tab: "home" }); await other.t.renderPlacesTab();
  assert.strictEqual(other.nodes.body.innerHTML, "");
  const none = env({ on: true, tab: "places", profile: null }); await none.t.renderPlacesTab();
  assert.ok(none.nodes.body.innerHTML.includes("프로필에서 지역을 정하면 거리로 볼 수 있어요"), "프로필(지역) 없음 → 거리 안내");
});
test("[일정 추가](G2): 장소 상세 시트의 일정 등록 단계가 바로 열린다(기존 일정 폼은 열지 않음), 가구 없으면 등록 없이 상세+안내", async () => {
  const e = env({ on: true, tab: "places" });
  await e.t.renderPlacesTab();
  const pl = PLACES.places[0];
  e.t.placesOnClick({ target: { closest: (s) => (s === "[data-places-add]" ? { getAttribute: () => pl.id } : null) } });
  assert.strictEqual(e.log.shown, 0, "일정 폼(usShowForm)은 열지 않는다");
  assert.ok(e.nodes.content.innerHTML.includes('data-places-detail="register"') && e.nodes.content.innerHTML.includes(pl.name));
  const nh = env({ on: true, tab: "places", active: false });
  await nh.t.renderPlacesTab();
  nh.t.placesOnClick({ target: { closest: (s) => (s === "[data-places-add]" ? { getAttribute: () => pl.id } : null) } });
  assert.ok(nh.log.shown === 0 && nh.nodes.content.innerHTML.includes('data-places-detail="info"') && nh.nodes.content.innerHTML.includes("가족 캘린더를 만들면 일정으로 등록할 수 있어요") && !nh.nodes.content.innerHTML.includes("data-places-reg-open"));
});
test("switchTab: places 로 가면 어디갈까를 그린다(소스), 플래그 OFF 에서는 places nav 가 숨겨져 도달 불가", () => {
  assert.ok(/window\.scrollTo\(0, 0\);\n    if \(name === "places"\) renderPlacesTab\(\);/.test(APP));
  assert.ok(APP.includes("    applyTabLayout();\n"));
});

console.log("1-2b 챙길 것 목록");
const IT = (n, extra) => Array.from({ length: n }, (_, i) => ({ id: "i" + i, title: "항목" + i, deadlineText: "", done: false, reservedText: "", canReserve: false, apply: null, ...(extra || {}) }));
test("미완료 5개만 보이고 '나머지 N개 더 보기'(헤더 N은 전체 수), 펼치면 전부+'접기', 5개 이하면 버튼 없음, 완료 그룹은 그대로", () => {
  const items = IT(57);
  const h = V.renderTodoLine({ label: "이번 달", open: true, items });
  assert.ok(h.includes("이번 달 챙길 것 57개") && (h.match(/<li /g) || []).length === 5 && h.includes(">나머지 52개 더 보기<") && h.includes('data-cal-todo-act="more"'));
  const all = V.renderTodoLine({ label: "이번 달", open: true, showAll: true, items });
  assert.ok((all.match(/<li /g) || []).length === 57 && all.includes(">접기<"));
  assert.ok(!V.renderTodoLine({ label: "이번 달", open: true, items: IT(5) }).includes("data-cal-todo-act=\"more\""));
  const mixed = V.renderTodoLine({ label: "이번 달", open: true, items: [...IT(6), ...IT(2, { done: true, id: "d" })].map((x, i) => ({ ...x, id: x.id + "-" + i })) });
  assert.ok(mixed.includes("나머지 1개 더 보기") && mixed.includes("완료한 항목 2개") && (mixed.match(/<li /g) || []).length === 7);
  assert.ok(!V.renderTodoLine({ label: "이번 달", open: false, items }).includes("<li"), "접힘에서는 목록 없음");
  assert.strictEqual(V.TODO_LIMIT, 5);
});
test("마감 표기: 올해는 'M/D까지', 올해가 아니면 'YYYY. M/D까지', 이미 지났으면 '기한 지남'(오늘은 지남 아님), 잘못된 값은 ''", () => {
  const today = new Date(2026, 9, 2);
  assert.strictEqual(V.todoDeadlineText(new Date(2026, 9, 31), today), "10/31까지");
  assert.strictEqual(V.todoDeadlineText(new Date(2026, 9, 2), today), "10/2까지");
  assert.strictEqual(V.todoDeadlineText(new Date(2027, 2, 5), today), "2027. 3/5까지");
  assert.strictEqual(V.todoDeadlineText(new Date(2026, 9, 1), today), "기한 지남");
  assert.strictEqual(V.todoDeadlineText(new Date(2025, 11, 31), today), "기한 지남");
  assert.strictEqual(V.todoDeadlineText(null, today), "");
  assert.strictEqual(V.todoDeadlineText(new Date("x"), today), "");
  assert.ok(V.renderTodoLine({ label: "이번 달", open: true, items: IT(1, { deadlineText: "기한 지남" }) }).includes("기한 지남"));
  assert.ok(APP.includes('deadlineText: end ? UserScheduleView.todoDeadlineText(end, new Date()) : ""'));
  assert.ok(/if \(act === "more"\) \{\n      calTodoAll = !calTodoAll;\n      return renderCalTodoLine\(\);/.test(APP) && APP.includes("showAll: calTodoAll"));
});
console.log(`\n${passed}개 통과${process.exitCode ? ", 일부 실패" : ""}`);
