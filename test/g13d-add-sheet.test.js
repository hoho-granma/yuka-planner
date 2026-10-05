/* G13-2 일정 추가 시트(계정 모드): 누구 일정 → 나이별 카테고리 → 제목 자동, 반복 매월 칩·비공개 칩은 비활성, 저장 필드는 기존 그대로. 실행: node test/g13d-add-sheet.test.js */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const V = require("../js/user-schedule-view.js");
const US = require("../js/user-schedule.js");
const read = (f) => fs.readFileSync(path.join(__dirname, "..", f), "utf8");
const APP = read("js/app.js"), CSS = read("css/style.css"), HTML = read("index.html"), SW = read("sw.js");
let passed = 0;
function test(name, fn) { try { fn(); passed++; console.log("  ok  - " + name); } catch (e) { process.exitCode = 1; console.log("  FAIL- " + name + "\n      " + (e.stack || e).split("\n").slice(0, 4).join("\n      ")); } }
const links = [{ childKey: "c1", displayName: "은찬", order: 1 }, { childKey: "c2", displayName: "서윤", order: 2 }];
const members = [{ memberId: "m-mom", label: "엄마" }, { memberId: "m-dad", label: "아빠" }];
const AGE = { c1: 3, c2: 60 };
const ctx = { meId: "m-mom", ageOf: (k) => AGE[k] };
const fresh = () => V.upgradeFormG13(V.newForm({ date: "2026-10-14", activeChildKey: null, links, defaultAssigneeId: "m-mom", defaultScope: "FAMILY" }), ctx);
const chipsOf = (h, attr) => [...h.matchAll(new RegExp(`data-us-${attr}="([^"]*)"[^>]*>([^<]*)`, "g"))].map((m) => m[2]);
const render = (f) => V.renderFormG13(f, links, { members, ctx });

test("새 일정 기본: 본인('나'), 어른 카테고리 6개, 제목 비어 있음, 날짜는 고른 날짜", () => {
  const f = fresh();
  assert.deepStrictEqual([f.g13, f.scope, f.assigneeMemberId, f.whoPerson, f.title, f.eventDate], [true, "FAMILY", "m-mom", true, "", "2026-10-14"]);
  const h = render(f);
  assert.deepStrictEqual(chipsOf(h, "who"), ["나", "아빠", "은찬", "서윤", "가족"]);
  assert.deepStrictEqual(chipsOf(h, "sk"), ["회사", "모임·약속", "병원", "운동", "개인 일정", "집안일"]);
  assert.ok(!/data-us-quick/.test(h) && !h.includes("data-us-cat="), "빠른 입력 칩·옛 분류 칩 없음");
  assert.ok(/data-us-who="MEMBER:m-mom"[^>]*>나/.test(h) && /us-chip active" data-us-who="MEMBER:m-mom"/.test(h));
});
test("아이를 고르면 그 아이 나이에 맞는 카테고리(0~12개월 / 4~7세), 나이를 모르는 아이는 공통 목록, 가족 전체는 가족 목록", () => {
  const f = fresh();
  V.g13ApplyWho(f, "CHILD:c1", ctx);
  assert.deepStrictEqual([f.scope, f.childKeys, f.assigneeMemberId], ["CHILD", ["c1"], ""], "D40: 아이 일정에는 담당 기본값을 두지 않는다");
  assert.deepStrictEqual(chipsOf(render(f), "sk"), ["병원·검진", "예방접종", "문화센터", "육아 모임"]);
  V.g13ApplyWho(f, "CHILD:c2", ctx);
  assert.deepStrictEqual(chipsOf(render(f), "sk"), ["어린이집·유치원", "수업·학원", "병원·검진", "놀이·체험", "친구 약속"]);
  const unknown = { ...ctx, ageOf: () => null };
  V.g13ApplyWho(f, "CHILD:c1", unknown);
  assert.deepStrictEqual(V.g13Kinds(f, unknown).map((x) => x.label), ["병원·검진", "어린이집·유치원", "수업·학원", "놀이·체험", "친구 약속"]);
  V.g13ApplyWho(f, "CHILD:c1", { ...ctx, ageOf: () => "PREGNANT" });
  assert.deepStrictEqual(V.g13Kinds(f, { ageOf: () => "PREGNANT" }).map((x) => x.label), ["병원·검진", "출산 준비", "산후조리 예약"]);
  V.g13ApplyWho(f, "FAMILY", ctx);
  assert.deepStrictEqual([f.scope, f.childKeys, f.assigneeMemberId, f.whoPerson], ["FAMILY", [], "", false], "D40: 아이·가족 전체에는 담당 값이 없다");
  assert.deepStrictEqual(chipsOf(render(f), "sk"), ["가족 행사", "나들이", "여행", "기념일"]);
});
test("카테고리를 고르면 enum 이 정해지고 이름이 제목에 자동으로 들어간다. 다른 카테고리로 바꾸면 제목도 바뀐다", () => {
  const f = fresh();
  V.g13PickKind(f, "병원", ctx);
  assert.deepStrictEqual([f.category, f.title, f.kindPick], ["MEDICAL", "병원", "병원"]);
  V.g13PickKind(f, "운동", ctx);
  assert.deepStrictEqual([f.category, f.title], ["ETC", "운동"]);
  V.g13PickKind(f, "집안일", ctx);
  assert.strictEqual(f.category, "FAMILY");
});
test("직접 고친 제목(titleTouched)은 카테고리를 바꿔도 덮어쓰지 않는다", () => {
  const f = fresh();
  V.g13PickKind(f, "병원", ctx);
  f.title = "치과 정기검진"; f.titleTouched = true;
  V.g13PickKind(f, "운동", ctx);
  assert.deepStrictEqual([f.title, f.category], ["치과 정기검진", "ETC"]);
});
test("사람을 바꿔 새 목록에 없는 카테고리가 되면 카테고리를 비운다(자동 입력된 제목만 함께 비움)", () => {
  const f = fresh();
  V.g13PickKind(f, "병원", ctx);
  V.g13ApplyWho(f, "CHILD:c1", ctx); // 아기 목록에도 '병원'은 없다('병원·검진')
  assert.deepStrictEqual([f.kindPick, f.category, f.title], ["", "", ""]);
  V.g13PickKind(f, "예방접종", ctx);
  f.title = "내 제목"; f.titleTouched = true;
  V.g13ApplyWho(f, "FAMILY", ctx);
  assert.deepStrictEqual([f.kindPick, f.category, f.title], ["", "", "내 제목"]);
});
test("저장 필드는 기존 그대로: 어른=FAMILY+담당 본인, 아이=CHILD+childKeys, 가족 전체=FAMILY. 새 필드 없음, 검증 통과", () => {
  const save = (who, kind) => { const f = fresh(); V.g13ApplyWho(f, who, ctx); V.g13PickKind(f, kind, ctx); return V.prepareSave(f, 1); };
  const adult = save("MEMBER:m-dad", "회사");
  assert.ok(adult.ok, adult.messages.join());
  assert.deepStrictEqual([adult.input.scope, adult.input.assigneeMemberId, adult.input.category, adult.input.title, "childKeys" in adult.input, "kind" in adult.input], ["FAMILY", "m-dad", "ETC", "회사", false, false]);
  const kid = save("CHILD:c1", "예방접종");
  assert.deepStrictEqual([kid.ok, kid.input.scope, kid.input.childKeys, kid.input.category, kid.input.title], [true, "CHILD", ["c1"], "MEDICAL", "예방접종"]);
  const fam = save("FAMILY", "나들이");
  assert.deepStrictEqual([fam.ok, fam.input.scope, fam.input.category, "assigneeMemberId" in fam.input], [true, "FAMILY", "FAMILY", false]);
  assert.ok(Object.keys(adult.input).every((k) => US.ALLOWED_KEYS.includes(k)));
  const noKind = V.prepareSave(fresh(), 1);
  assert.strictEqual(noKind.ok, false, "카테고리를 안 고르면 저장되지 않는다");
});
test("날짜·시간: 고른 날짜가 기본, 종일을 끄면 시간 입력(시작 필수), 여러 날·기간·장소·메모 유지", () => {
  const f = fresh(); V.g13PickKind(f, "회사", ctx);
  assert.strictEqual(V.prepareSave({ ...f, allDay: false, startTime: "" }, 1).ok, false);
  const t = V.prepareSave({ ...f, allDay: false, startTime: "09:00", endTime: "18:00", location: "사무실", memo: "회의" }, 1);
  assert.ok(t.ok && t.input.eventDate === "2026-10-14" && t.input.startTime === "09:00" && t.input.location === "사무실" && t.input.memo === "회의");
  const h = render(f);
  assert.ok(h.includes('id="us-allday"') && h.includes('id="us-multi"') && h.includes('data-us-kind="PERIOD"') && h.includes('id="us-location"') && h.includes('id="us-memo"'));
});
test("반복: 반복 안 함·매주 활성, 매월·매월 같은 요일은 '곧 추가돼요' 비활성(저장 불가 — 규칙이 WEEKLY 만 허용), 매주는 시작 날짜 요일 기본", () => {
  const h = render(fresh());
  assert.ok(/data-us-repeat="NONE"/.test(h) && /data-us-repeat="WEEKLY"/.test(h) && /data-us-repeat="BIWEEKLY"/.test(h) && !/data-us-repeat="MONTHLY/.test(h)); // 2-4: 새 일정에도 '2주마다' 노출(매월은 D5로 제외)
  assert.strictEqual((h.match(/us-chip us-chip-soon" disabled aria-disabled="true">(매월|매월 같은 요일)<small>곧 추가돼요<\/small>/g) || []).length, 2);
  const w = { ...fresh(), repeat: "WEEKLY", byDay: ["TU"] };
  assert.strictEqual(V.formToInput(w).recurrence.freq, "WEEKLY");
  assert.ok(V.prepareSave((V.g13PickKind(w, "회사", ctx), w), 1).ok);
  assert.ok(/UserSchedule\.weekdayOf\(us\.form\.eventDate\)/.test(APP));
});
test("공개 범위: G21 — 화면에서 숨김(공개/비공개 항목·안내 없음), 저장 문서에 공개 범위 필드 없음", () => {
  const h = render(fresh());
  assert.ok(!h.includes("data-us-vis") && !h.includes("공개 범위") && !h.includes("비공개 (나만 보기)") && !h.includes("지금은 모든 일정이 가족 캘린더에 공개로"));
  const f = fresh(); V.g13PickKind(f, "회사", ctx);
  assert.ok(!Object.keys(V.prepareSave(f, 1).input).some((k) => /vis|private|public/i.test(k)));
});
test("담당 칩 제거(D40): 어떤 대상이든 '누가 데려가나요?' 담당 칩이 없고, 아이·가족 일정에는 담당 값이 저장되지 않으며 구성원 일정만 그 구성원을 저장한다", () => {
  assert.ok(!render(fresh()).includes("data-us-assignee-field"));
  const f = fresh(); V.g13ApplyWho(f, "CHILD:c1", ctx);
  assert.ok(!render(f).includes("data-us-assignee-field") && !render(f).includes("누가 데려가나요?"));
  const fam = fresh(); V.g13ApplyWho(fam, "FAMILY", ctx); assert.ok(!render(fam).includes("data-us-assignee-field"));
  const save = (x) => V.formToInput({ ...x, title: "t", category: "ETC", eventDate: "2026-10-20", allDay: true });
  const kid = fresh(); V.g13ApplyWho(kid, "CHILD:c1", ctx); kid.assigneeMemberId = "m-mom"; assert.ok(!("assigneeMemberId" in save(kid)), "아이 일정에 옛 담당 값이 남아 있어도 저장하지 않는다");
  const mem = fresh(); V.g13ApplyWho(mem, "MEMBER:m-dad", ctx); assert.strictEqual(save(mem).assigneeMemberId, "m-dad");
});
test("수정: 저장된 제목은 덮어쓰지 않고(titleTouched), 어른 일정은 본인 칩, 제목이 카테고리 이름이면 그 칩이 선택돼 있다", () => {
  const doc = { id: "s1", title: "병원", category: "MEDICAL", scope: "FAMILY", dateKind: "FIXED", eventDate: "2026-10-20", allDay: true, assigneeMemberId: "m-dad" };
  const f = V.upgradeFormG13(V.formFromSchedule(doc), ctx);
  assert.deepStrictEqual([f.g13, f.titleTouched, f.whoPerson, f.kindPick], [true, true, true, "병원"]);
  const h = render(f);
  assert.ok(/us-chip active" data-us-who="MEMBER:m-dad"/.test(h) && /us-chip active" data-us-sk="병원"/.test(h));
  const other = V.upgradeFormG13(V.formFromSchedule({ ...doc, title: "치과 검진" }), ctx);
  assert.strictEqual(other.kindPick, "");
  V.g13PickKind(other, "운동", ctx);
  assert.strictEqual(other.title, "치과 검진");
});
test("앱 연결: 계정 모드에서만(usG13=acctEnabled), usOpenForm·usShowForm 본문은 그대로, AUTO 연결 예약은 옛 시트, 클릭·입력 핸들러·기억해 둔 생일", () => {
  assert.ok(/const usG13 = \(\) => acctEnabled\(\) && typeof ScheduleKinds !== "undefined";/.test(APP));
  assert.ok(/usShowForm = function usShowForm\(\) \{\n    if \(us\.form && !us\.form\.g13 && !us\.form\.autoRef && \(us\.form\.mode === "create" \|\| us\.form\.mode === "edit"\) && usG13\(\)\) UserScheduleView\.upgradeFormG13/.test(APP));
  assert.ok(/data-us-who"\);?/.test(APP) && APP.includes('closest("[data-us-who]")') && APP.includes('closest("[data-us-sk]")') && APP.includes('us.form.titleTouched = true'));
  assert.ok(APP.includes("JSON.parse(localStorage.getItem(CHILD_BIRTHS_KEY)") && !APP.includes('stage: profile.stage || "born", birthDate'), "나이는 이미 기억해 둔 아이별 생일을 쓴다(새로 저장·서버 읽기 없음)");
});
test("파일: schedule-kinds.js 를 index.html·sw.js 에 등록, firestore.rules·user-schedule.js 는 바꾸지 않았다(새 필드·규칙 없음), CSS 비활성 칩", () => {
  assert.ok(/<script src="js\/schedule-kinds\.js\?v=\d+"><\/script>\s*<script src="js\/user-schedule-view\.js/.test(HTML) && SW.includes('"./js/schedule-kinds.js"'));
  assert.ok(/\.us-chip-soon \{ opacity: \.55; cursor: not-allowed/.test(CSS));
  assert.deepStrictEqual(US.OPTIONAL_KEYS.includes("kind"), false);
});
console.log(`\n${passed}개 통과`);
