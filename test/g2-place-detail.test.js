/*
 * G2 어디갈까 장소 상세 시트 + 같은 시트 안 일정 등록. 실행: node test/g2-place-detail.test.js
 * (data/places.json 은 읽기 전용으로만 쓴다 — 편집 중인 데이터 파일이라 이 테스트가 수정하지 않는다.)
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const P = require("../js/places.js");
const PV = require("../js/places-view.js");
const V = require("../js/user-schedule-view.js");
const US = require("../js/user-schedule.js");
const HV = require("../js/household-view.js");
const read = (f) => fs.readFileSync(path.join(__dirname, "..", f), "utf8");
const APP = read("js/app.js");
let passed = 0;
const pending = [];
function test(name, fn) { const p = Promise.resolve().then(fn).then(() => { passed++; console.log("  ok  - " + name); }, (e) => { process.exitCode = 1; console.log("  FAIL- " + name + "\n      " + (e.stack || e).split("\n").slice(0, 6).join("\n      ")); }); pending.push(p); return p; }

const PL = { id: "guro-lib-001", name: "구로 <b>어린이</b> 도서관", category: "LIBRARY", province: "서울특별시", district: "구로구", ageMonths: { min: 12, max: 72 }, indoor: "INDOOR", cost: "FREE", reservation: "REQUIRED", address: "서울특별시 구로구 가마산로 245 & 별관", officialUrl: "https://www.guro.go.kr/lib?a=1&b=2", summary: "책 읽는 \"아이\" 공간", checkedAt: "2026-09-20", example: true };
const UNKNOWN = { id: "x-1", name: "빈 정보", category: "PARK", province: "서울특별시", district: null, ageMonths: null, indoor: null, cost: null, reservation: null, address: null, officialUrl: null, summary: null, checkedAt: null };

console.log("상세 마크업");
test("상세: 이름·분류·설명·주소(복사)·권장 나이·실내외·비용·예약·확인 날짜·'편집 추천'·[공식 홈페이지]·[지도에서 보기], 이스케이프", () => {
  const h = PV.renderDetail(PL, { mode: "info", canRegister: true, today: new Date(2026, 9, 3) });
  assert.ok(h.includes("구로 &lt;b&gt;어린이&lt;/b&gt; 도서관") && !h.includes("<b>어린이") && h.includes("책 읽는 &quot;아이&quot; 공간"));
  assert.ok(h.includes(">도서관<") && !h.includes("편집 추천") && h.includes("예시") && h.includes("서울특별시 구로구 가마산로 245 &amp; 별관") && h.includes('data-places-copy="서울특별시 구로구 가마산로 245 &amp; 별관"'));
  assert.ok(h.includes("12~72개월") && h.includes("실내") && h.includes("무료") && h.includes("예약 필요") && h.includes("2026-09-20 확인"));
  assert.ok(h.includes('href="https://www.guro.go.kr/lib?a=1&amp;b=2" target="_blank" rel="noopener noreferrer">공식 홈페이지</a>'));
  assert.ok(h.includes('>지도에서 보기</a>') && h.includes("예약이 필요한 곳이에요. 공식 홈페이지에서 먼저 예약하세요.") && h.includes("data-places-reg-open"));
});
test("지도 링크: 카카오맵 검색 URL + 주소 encodeURIComponent(키·SDK 없음), 주소가 없으면 시·도·시군구·이름, 새 탭", () => {
  assert.strictEqual(PV.mapUrl(PL), "https://map.kakao.com/link/search/" + encodeURIComponent("서울특별시 구로구 가마산로 245 & 별관"));
  assert.ok(!PV.mapUrl(PL).includes(" ") && !PV.mapUrl(PL).includes("&%") && PV.mapUrl(PL).includes("%26"));
  assert.strictEqual(PV.mapUrl(UNKNOWN), "https://map.kakao.com/link/search/" + encodeURIComponent("서울특별시 빈 정보"));
  assert.ok(PV.renderDetail(PL, { mode: "info" }).includes(`href="${PV.mapUrl(PL).replace(/&/g, "&amp;")}" target="_blank" rel="noopener noreferrer"`));
});
test("미확인 값은 '방문 전 확인', 공식 링크가 https 가 아니면 홈페이지 버튼 없음, 주소 없으면 복사 버튼 없음, 가구 없으면 등록 대신 안내", () => {
  const h = PV.renderDetail(UNKNOWN, { mode: "info", canRegister: false, today: new Date(2026, 9, 3) });
  assert.ok((h.match(/방문 전 확인/g) || []).length >= 5, "나이·실내외·비용·예약·확인 날짜");
  assert.ok(!h.includes("공식 홈페이지<") && !h.includes("data-places-copy") && !h.includes("data-places-reg-open") && h.includes("가족 캘린더를 만들면 일정으로 등록할 수 있어요") && !h.includes("예약이 필요한 곳이에요"));
  for (const bad of ["http://x.kr", "javascript:alert(1)", "https://x y"]) assert.ok(!PV.renderDetail({ ...PL, officialUrl: bad }, { mode: "info" }).includes("공식 홈페이지<"), bad);
  assert.ok(PV.renderDetail({ ...PL, reservation: "PARTLY" }, { mode: "info" }).includes("일부는 예약이 필요해요") && !PV.renderDetail({ ...PL, reservation: "NONE" }, { mode: "info" }).includes("예약이 필요한 곳이에요"));
});
test("카드: 누르면 상세(data-places-open), [일정 추가]는 그대로 / 메모는 공식 링크(https 만, 500자 이내)", () => {
  assert.ok(PV.renderCard(PL, new Date(2026, 9, 3)).includes('data-places-open="guro-lib-001"') && PV.renderCard(PL, new Date(2026, 9, 3)).includes('data-places-add="guro-lib-001"'));
  assert.strictEqual(PV.memoFor(PL), "공식 홈페이지: https://www.guro.go.kr/lib?a=1&b=2");
  assert.strictEqual(PV.memoFor(UNKNOWN), "");
  assert.strictEqual(PV.memoFor({ officialUrl: "http://x.kr" }), "");
  assert.ok(PV.memoFor({ officialUrl: "https://x.kr/" + "a".repeat(600) }).length <= 500);
});
test("날짜 기본값: 다가오는 토요일(오늘이 토요일이면 오늘), 월말 경계, 라벨 '10/10(토)'", () => {
  const d = (y, m, dd) => PV.defaultVisitDate(new Date(y, m - 1, dd));
  assert.strictEqual(d(2026, 10, 2), "2026-10-03");
  assert.strictEqual(d(2026, 10, 3), "2026-10-03");
  assert.strictEqual(d(2026, 10, 4), "2026-10-10");
  assert.strictEqual(d(2026, 10, 9), "2026-10-10");
  assert.strictEqual(d(2026, 12, 28), "2027-01-02");
  assert.strictEqual(PV.dateLabel("2026-10-10"), "10/10(토)");
  assert.strictEqual(PV.dateLabel("2026-10-11"), "10/11(일)");
  assert.strictEqual(PV.dateLabel("x"), "");
  assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(PV.defaultVisitDate()));
});
test("등록 단계 마크업: 날짜(주입한 date-picker)·종일 칩(기본)·담당 칩·대상 칩(가족 전체 기본 + 아이)·시간 선택은 종일 해제 때만·오류 표시·저장 중 비활성", () => {
  const reg = { date: "2026-10-03", allDay: true, assignee: "m1", scope: "FAMILY", childKeys: [] };
  const h = PV.renderDetail(PL, { mode: "register", reg, pickerHtml: "<div id=\"plr-dp-btn\"></div>", members: [{ memberId: "m1", label: "엄마" }, { memberId: "m2", label: "아빠" }], kids: [{ childKey: "c1", name: "수아" }] });
  assert.ok(h.includes('id="plr-dp-btn"') && h.includes("data-places-allday") && h.includes('data-places-assignee="m1"') && h.includes('data-places-target="FAMILY"') && h.includes('data-places-target="c1"') && h.includes("data-places-save") && !h.includes("plr-start-h"));
  assert.ok(/aria-pressed="true" data-places-assignee="m1"/.test(h) && /aria-pressed="true" data-places-target="FAMILY"/.test(h));
  const timed = PV.renderDetail(PL, { mode: "register", reg: { ...reg, allDay: false, startTime: "10:30", error: "시작 시각을 골라 주세요" }, members: [], kids: [] });
  assert.ok(timed.includes('id="plr-start-h"') && timed.includes('<option value="10" selected>') && timed.includes('<option value="30" selected>') && timed.includes("시작 시각을 골라 주세요") && !timed.includes("data-places-assignee"));
  assert.ok(PV.renderDetail(PL, { mode: "register", reg: { ...reg, saving: true } }).includes("disabled"));
  const done = PV.renderDetail(PL, { mode: "done", doneLabel: "10/11(토)" });
  assert.ok(done.includes("10/11(토) 캘린더에 등록했어요") && done.includes("data-places-view-cal"));
});

console.log("앱 연결(소스 추출)");
function env(o) {
  const a = APP.indexOf("  // ── G2 장소 상세 시트"), b = APP.indexOf("  function switchTab(name) {");
  const content = { innerHTML: "", listeners: {}, querySelector: () => ({ addEventListener: (t, f) => (content.listeners[t] = f) }) };
  const modal = { classList: { remove() {}, add() {} } };
  const log = { counted: [], created: [], switched: [], rendered: 0, closed: 0, refreshed: 0, picker: [] };
  const sels = o.sels || {};
  const sb = { console: { error() {}, log() {} }, Date, JSON, Promise, setTimeout, PlacesView: PV, UserScheduleView: V, UserSchedule: US, HouseholdView: HV,
    el: (id) => (id === "modal-content" ? content : id === "detail-modal" ? modal : id === "plr-dp-btn" ? { addEventListener: (t, f) => (log.btnClick = f) } : id === "plr-dp-popup" ? { classList: { contains: () => !o.popupOpen }, scrollIntoView: (a) => (log.scrolled = a) } : sels[id] ? { value: sels[id] } : null),
    usActive: () => o.active !== false, usLinks: () => [{ childKey: "c1", displayName: "수아", order: 1 }], usMembers: () => [{ memberId: "m1", role: "MOM", label: "엄마", order: 1 }, { memberId: "m2", role: "DAD", label: "아빠", order: 2 }], usActiveChildKey: () => "c1", memActiveId: () => "m1",
    HNDatePicker: { markup: () => "<div id=\"plr-dp-btn\"></div>", bindById: (prefix, op) => { log.picker.push(prefix); return { set(d) { log.set = d; } }; } }, formatDateKR: () => "", toISODate: (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
    HouseholdSync: { createSchedule: async (hid, doc) => { if (o.fail) return { ok: false, reason: "x" }; log.created.push([hid, doc]); return { ok: true }; } }, hh: { hid: "h1" }, usRefreshCalendar: () => { log.refreshed++; }, placesCountOnce: (id) => { log.counted.push(id); },
    closeDetail: () => { log.closed++; }, switchTab: (n) => log.switched.push(n), renderCalendar() {}, renderSelectedDayPanel() {}, attachListHandlers() {}, modalMode: null, viewMonth: null, selectedCalendarDate: null,
    navigator: { clipboard: { writeText: async (t) => (log.copied = t) } } };
  vm.createContext(sb);
  vm.runInContext(APP.slice(a, b) + "\n;globalThis.__t = { placesDetailOpen, placesDetailClick, placesSave, placesReg };", sb);
  const click = (attr, extra) => sb.__t.placesDetailClick({ target: { closest: (s) => (s === `[${attr}]` ? { getAttribute: () => (extra === undefined ? "" : extra), textContent: "" } : null) } });
  return { sb, content, log, t: sb.__t, click, reg: sb.__t.placesReg };
}
test("[일정 추가] → 등록 단계(기본 날짜=다가오는 토요일, 담당=나, 대상=가족 전체, 종일) 시트가 열리고 date-picker 가 붙는다 / 가구 없으면 상세만", () => {
  const e = env({});
  e.t.placesDetailOpen(PL, "register");
  assert.deepStrictEqual([e.reg.mode, e.reg.date === PV.defaultVisitDate(new Date()), e.reg.assignee, e.reg.scope, e.reg.allDay], ["register", true, "m1", "FAMILY", true]);
  assert.ok(e.content.innerHTML.includes('data-places-detail="register"') && e.log.picker.includes("plr") && e.log.set instanceof Date);
  const nh = env({ active: false });
  nh.t.placesDetailOpen(PL, "register");
  assert.ok(nh.reg.mode === "info" && nh.content.innerHTML.includes("가족 캘린더를 만들면 일정으로 등록할 수 있어요"));
  const info = env({}); info.t.placesDetailOpen(PL, "info");
  assert.ok(info.content.innerHTML.includes("data-places-reg-open") && !info.content.innerHTML.includes("data-places-save"));
});
test("날짜 팝업이 열리면 시트를 팝업 아래까지 스크롤(scrollIntoView block:nearest), 닫혀 있으면 스크롤 안 함", async () => {
  const open = env({ popupOpen: true });
  open.t.placesDetailOpen(PL, "register");
  open.log.btnClick();
  await new Promise((r) => setTimeout(r, 5));
  assert.deepStrictEqual(JSON.parse(JSON.stringify(open.log.scrolled)), { block: "nearest" });
  const closed = env({ popupOpen: false });
  closed.t.placesDetailOpen(PL, "register");
  closed.log.btnClick();
  await new Promise((r) => setTimeout(r, 5));
  assert.strictEqual(closed.log.scrolled, undefined);
});
test("[캘린더에 등록]: 기존 buildCreateDoc 경로로 저장 — 제목=장소명·장소=주소·분류 FAMILY·대상 가족·eventDate·종일·담당·메모(공식 링크), 성공 토스트 라벨·캘린더 이동", async () => {
  const e = env({});
  e.t.placesDetailOpen(PL, "register");
  e.reg.date = "2026-10-10";
  await e.click("data-places-save");
  assert.strictEqual(e.log.created.length, 1);
  const [hid, d] = e.log.created[0];
  assert.deepStrictEqual([hid, d.title, d.location, d.category, d.scope, d.eventDate, d.allDay, d.assigneeMemberId, d.memo, d.dateKind, d.status], ["h1", PL.name.slice(0, 100), PL.address.slice(0, 100), "FAMILY", "FAMILY", "2026-10-10", true, "m1", "공식 홈페이지: https://www.guro.go.kr/lib?a=1&b=2", "FIXED", "TODO"]);
  assert.deepStrictEqual([e.reg.mode, e.reg.doneLabel, e.log.refreshed, e.log.counted.length], ["done", "10/10(토)", 1, 1]); // P4: 등록 성공 → 인기 신호 +1 호출
  assert.ok(e.content.innerHTML.includes("10/10(토) 캘린더에 등록했어요") && e.content.innerHTML.includes("data-places-view-cal"));
  await e.click("data-places-view-cal");
  assert.deepStrictEqual([e.log.closed, e.log.switched, e.sb.selectedCalendarDate.getDate(), e.sb.viewMonth.getMonth()], [1, ["calendar"], 10, 9]);
});
test("시간·담당·대상 선택이 저장에 반영된다(종일 해제 시 시작·끝, 담당 해제, 아이 대상 → CHILD)", async () => {
  const e = env({ sels: { "plr-start-h": "10", "plr-start-m": "30", "plr-end-h": "12", "plr-end-m": "" } });
  e.t.placesDetailOpen(PL, "register");
  e.reg.date = "2026-10-10";
  await e.click("data-places-allday");
  assert.strictEqual(e.reg.allDay, false);
  await e.click("data-places-assignee", "m2");
  assert.strictEqual(e.reg.assignee, "m2");
  await e.click("data-places-assignee", "m2");
  assert.strictEqual(e.reg.assignee, "", "다시 누르면 해제");
  await e.click("data-places-assignee", "m2");
  await e.click("data-places-target", "c1");
  assert.deepStrictEqual(JSON.parse(JSON.stringify([e.reg.scope, e.reg.childKeys])), ["CHILD", ["c1"]]);
  await e.click("data-places-save");
  const d = e.log.created[0][1];
  assert.deepStrictEqual(JSON.parse(JSON.stringify([d.allDay, d.startTime, d.endTime, d.assigneeMemberId, d.scope, d.childKeys])), [false, "10:30", "12:00", "m2", "CHILD", ["c1"]]);
  const g = env({}); g.t.placesDetailOpen(PL, "register"); await g.click("data-places-target", "c1"); await g.click("data-places-target", "FAMILY");
  assert.deepStrictEqual(JSON.parse(JSON.stringify([g.reg.scope, g.reg.childKeys])), ["FAMILY", []]);
});
test("실패 처리: 날짜 없음·종일 해제 후 시작 시각 없음은 저장하지 않고 안내, 서버 실패는 오류 문구·저장 중 해제, 가구 없으면 저장 호출 0, 중복 저장 방지", async () => {
  const e = env({});
  e.t.placesDetailOpen(PL, "register");
  e.reg.date = "";
  await e.click("data-places-save");
  assert.ok(e.log.created.length === 0 && e.reg.error && e.content.innerHTML.includes("places-reg-err"));
  e.reg.date = "2026-10-10"; e.reg.allDay = false;
  await e.click("data-places-save");
  assert.ok(e.log.created.length === 0 && e.reg.error);
  const f = env({ fail: true });
  f.t.placesDetailOpen(PL, "register"); f.reg.date = "2026-10-10";
  await f.click("data-places-save");
  assert.deepStrictEqual([f.reg.saving, f.reg.mode, f.reg.error], [false, "register", PV.TEXT.saveFail]);
  const nh = env({ active: false }); nh.t.placesDetailOpen(PL, "register"); await nh.t.placesSave();
  assert.strictEqual(nh.log.created.length, 0);
  const s = env({}); s.t.placesDetailOpen(PL, "register"); s.reg.date = "2026-10-10"; s.reg.saving = true; await s.t.placesSave();
  assert.strictEqual(s.log.created.length, 0);
});
test("복사·닫기·뒤로: 주소 복사(클립보드), 닫기, 등록 단계 → 뒤로 = 상세", async () => {
  const e = env({});
  e.t.placesDetailOpen(PL, "info");
  await e.click("data-places-copy", "서울 구로구");
  assert.strictEqual(e.log.copied, "서울 구로구");
  e.t.placesDetailOpen(PL, "register");
  await e.click("data-places-back");
  assert.strictEqual(e.reg.mode, "info");
  await e.click("data-places-close");
  assert.strictEqual(e.log.closed, 1);
});
test("연결: 카드 누르기(data-places-open)=상세·링크 클릭은 그대로·기존 일정 폼 경로(usOpenForm) 소스 불변·places.json 은 이 변경에서 읽기만", () => {
  assert.ok(APP.includes('const card = ev.target.closest("[data-places-open]");') && APP.includes("if (ev.target.closest(\"a\")) return;"));
  assert.ok(APP.includes("function usOpenForm(id, dateIso, opts) {") && !/placesDetail[\s\S]{0,400}usShowForm\(\)/.test(APP.slice(APP.indexOf("  // ── G2 장소 상세 시트"), APP.indexOf("  function switchTab(name) {"))));
  const g2 = APP.slice(APP.indexOf("  // ── G2 장소 상세 시트"), APP.indexOf("  function switchTab(name) {"));
  assert.ok(!/places\.json|writeFile|fetch\(/.test(g2));
  assert.ok(!/<script|innerHTML\s*=\s*[^;]*place\.(name|address)/.test(g2));
});
Promise.all(pending).then(() => console.log(`\n${passed}개 통과${process.exitCode ? ", 일부 실패" : ""}`));
