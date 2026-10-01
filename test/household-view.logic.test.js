/*
 * js/household-view.js 순수 함수 테스트 — 문구(승인본 D5)·마크업·목록 병합·플래그 OFF 시 빈 문자열.
 * 실행: node test/household-view.logic.test.js
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const HV = require("../js/household-view.js");

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ok  - ${name}`);
  } catch (e) {
    console.error(`FAIL - ${name}\n       ${e.stack || e.message}`);
    process.exitCode = 1;
  }
}
const M = HV.MSG;
const ON = { enabled: true, childName: "은찬이", code: "ABCD2345", view: "active" };
const VIEWS = ["none", "consent", "creating", "active", "reissue-confirm", "reissuing"];

console.log("플래그 OFF → 빈 문자열");
test("enabled 가 true 가 아니면 모든 render 가 정확히 빈 문자열(undefined·false·'true'·1·null state 포함)", () => {
  for (const enabled of [undefined, false, "true", 1, null]) {
    for (const view of VIEWS) assert.strictEqual(HV.renderSection({ ...ON, enabled, view, pending: 3, permissionDenied: true, rulesUnavailable: true, notice: { kind: "created" } }), "", `${enabled}/${view}`);
    assert.strictEqual(HV.renderCodeEntryHint({ enabled }), "");
    assert.strictEqual(HV.statusLine({ enabled, pending: 3, permissionDenied: true, rulesUnavailable: true }), "");
  }
  assert.strictEqual(HV.renderSection(null), "");
  assert.strictEqual(HV.renderSection(undefined), "");
  assert.strictEqual(HV.renderCodeEntryHint(), "");
});
test("isEnabled: FEATURES.household === true 일 때만 true", () => {
  assert.strictEqual(HV.isEnabled({ household: true }), true);
  [{ household: false }, {}, null, undefined, { household: "true" }, { household: 1 }].forEach((f) => assert.strictEqual(HV.isEnabled(f), false));
});
test("mergeChildren: mirror 가 없으면(OFF 경로) 입력 목록과 같은 항목·순서를 돌려준다", () => {
  const local = [{ code: "AAA111", name: "은찬이", stage: "born" }, { code: "BBB222", name: "둘째", stage: "pregnant" }];
  const r = HV.mergeChildren(local, null, "AAA111");
  assert.deepStrictEqual(r.map((e) => [e.code, e.name, e.stage]), local.map((e) => [e.code, e.name, e.stage]));
  assert(r.every((e) => e.source === "local" && !e.removed));
  assert.strictEqual(r[0].current, true);
  assert.strictEqual(r[1].current, false);
});

console.log("\n아이 목록 병합");
const mirror = {
  children: {
    c1: { familyCode: "AAA111", displayName: "캐시이름", order: 1, addedAt: 1 },
    c3: { familyCode: "CCC333", displayName: "셋째", order: 3, addedAt: 3 },
    c2: { familyCode: "BBB222", displayName: "둘째", order: 2, addedAt: 2 },
    c4: { familyCode: "DDD444", displayName: "분리된애", order: 4, addedAt: 4, removedAt: 9 },
  },
};
const local = [{ code: "AAA111", name: "은찬이", stage: "born" }, { code: "ZZZ999", name: "이 기기에만", stage: "pregnant" }];
test("코드 기준 중복 제거 · 이 기기 이름/stage 우선(링크 displayName 은 캐시) · source 구분", () => {
  const r = HV.mergeChildren(local, mirror, "AAA111");
  const a = r.find((e) => e.code === "AAA111");
  assert.strictEqual(a.name, "은찬이");
  assert.strictEqual(a.source, "both");
  assert.strictEqual(r.filter((e) => e.code === "AAA111").length, 1);
  assert.strictEqual(r.find((e) => e.code === "ZZZ999").source, "local");
  assert.strictEqual(r.find((e) => e.code === "BBB222").source, "household");
});
test("순서: 이 기기 목록 → 가구에만 있는 아이(order 순)", () => {
  assert.deepStrictEqual(HV.mergeChildren(local, mirror, null).map((e) => e.code), ["AAA111", "ZZZ999", "BBB222", "CCC333", "DDD444"]);
});
test("분리된(removedAt) 링크는 removed, 이 기기에 있는 아이가 분리돼도 표시", () => {
  const r = HV.mergeChildren(local, mirror, null);
  assert.strictEqual(r.find((e) => e.code === "DDD444").removed, true);
  const r2 = HV.mergeChildren([{ code: "DDD444", name: "로컬이름", stage: "born" }], mirror, null);
  const d = r2.filter((e) => e.code === "DDD444");
  assert.strictEqual(d.length, 1, "중복 없음");
  assert.strictEqual(d[0].removed, true);
  assert.strictEqual(d[0].name, "로컬이름");
  assert.strictEqual(d[0].source, "both");
});
test("입력을 변경하지 않는다 · 잘못된 입력에 안전하다", () => {
  const l = JSON.parse(JSON.stringify(local)), m = JSON.parse(JSON.stringify(mirror));
  HV.mergeChildren(l, m, "AAA111");
  assert.deepStrictEqual(l, local);
  assert.deepStrictEqual(m, mirror);
  assert.deepStrictEqual(HV.mergeChildren(undefined, undefined), []);
  assert.deepStrictEqual(HV.mergeChildren([null, {}, { code: "X1" }], { children: { a: {} } }).map((e) => e.code), ["X1"]);
  assert.strictEqual(HV.mergeChildren(local, { children: {} }).length, 2);
});
test("링크 order 가 같으면 addedAt → 키 순으로 안정 정렬", () => {
  const m = { children: { b: { familyCode: "B1", order: 1, addedAt: 5 }, a: { familyCode: "A1", order: 1, addedAt: 5 }, c: { familyCode: "C1", order: 1, addedAt: 1 } } };
  assert.deepStrictEqual(HV.mergeChildren([], m).map((e) => e.code), ["C1", "A1", "B1"]);
});
test("childSubtitle: 기존 문구 유지(임신 중 · 가족코드 X) · 가구 전용은 #29(아이 코드) · 분리는 #28", () => {
  assert.strictEqual(HV.childSubtitle({ code: "AAA111", stage: "born", source: "local" }), "가족코드 AAA111");
  assert.strictEqual(HV.childSubtitle({ code: "AAA111", stage: "pregnant", source: "both" }), "임신 중 · 가족코드 AAA111");
  assert.strictEqual(HV.childSubtitle({ code: "BBB222", stage: "born", source: "household" }), "가족 캘린더 · 아이 코드 BBB222");
  assert.strictEqual(HV.childSubtitle({ code: "DDD444", stage: "born", source: "household", removed: true }), "(분리된 아이) · 가족코드 DDD444");
  assert.strictEqual(HV.switchSubText(true), "이 기기에서 열어 본 아이와 가족 캘린더의 아이예요. 눌러서 바꿔 볼 수 있어요.");
  assert.strictEqual(HV.switchSubText(false), "이 기기에서 열어 본 아이예요. 눌러서 바꿔 볼 수 있어요.");
});

console.log("\n코드 입력 분류 (D2)");
test("6자리=아이 코드, 8자리=가족 코드, 그 외 invalid · 공백/소문자 정규화", () => {
  assert.deepStrictEqual(HV.classifyCode("abc234"), { kind: "child", code: "ABC234" });
  assert.deepStrictEqual(HV.classifyCode(" abcd 2345 "), { kind: "household", code: "ABCD2345" });
  ["", "ABC12", "ABCDEFG", "ABCDEFGHI", "ABC-234", null, undefined, "가나다라마바"].forEach((x) => assert.strictEqual(HV.classifyCode(x).kind, "invalid", String(x)));
});

console.log("\n문구·상태 (승인본)");
const text = (html) => html.replace(/<br>/g, "\n").replace(/<[^>]+>/g, "|").replace(/\|+/g, "|").replace(/&amp;/g, "&");
test("#19 입력 안내: 아이 코드(6자리) 또는 가족 코드(8자리), #20 참여 안내", () => {
  const h = HV.renderCodeEntryHint({ enabled: true });
  assert(h.includes("코드를 입력해 주세요. (아이 코드 6자리 또는 가족 코드 8자리)"));
  assert(h.includes("8자리 코드로 들어가면 이 가족의 아이와 일정이 모두 보여요."));
});
test("가구 없음(none): #1 제목 · #2 설명 · #3 만들기 버튼만(코드·재발급 없음)", () => {
  const h = HV.renderSection({ ...ON, view: "none" });
  assert(h.includes("가족 캘린더") && h.includes("아이와 가족 일정을 가족이 함께 볼 수 있어요.") && h.includes('data-hh-action="create"') && h.includes("가족 캘린더 만들기"));
  assert(!h.includes("hh-code") && !h.includes("reissue"));
});
test("동의(consent): #4 #5 #6 — 아이 이름이 들어가고 줄바꿈 처리, 확인/취소 버튼", () => {
  const h = HV.renderSection({ ...ON, view: "consent" });
  assert(h.includes("가족 캘린더를 만들까요?"));
  assert(h.includes("가족 코드 8자리가 만들어지고, 이 코드를 입력한 사람은 은찬이의 일정과 가족 일정을 모두 볼 수 있어요.<br>지금 쓰는 아이 정보와 완료 기록은 바뀌지 않아요."));
  assert(h.includes('data-hh-action="confirm-create"') && h.includes('data-hh-action="cancel-create"') && h.includes(">만들기<") && h.includes(">취소<"));
  assert(HV.renderSection({ ...ON, view: "consent", childName: "" }).includes("아이의 일정과"), "이름이 없으면 '아이'");
});
test("생성 중 #7 · 완료 알림 #8", () => {
  assert(HV.renderSection({ ...ON, view: "creating" }).includes("만드는 중이에요…"));
  assert(HV.renderSection({ ...ON, notice: { kind: "created" } }).includes("가족 캘린더를 만들었어요. 아래 코드로 가족을 초대해 보세요."));
});
test("활성(active): #9 코드 · #10 안내 · #11 가족에게만 공유 · #12 복사 · #31 재발급 버튼", () => {
  const h = HV.renderSection({ ...ON, view: "active" });
  assert(h.includes("가족 코드") && h.includes("ABCD2345"));
  assert(h.includes("이 코드로 아이 전부와 일정을 볼 수 있어요."));
  assert(h.includes("이 코드를 아는 사람은 누구나 우리 가족 일정을 볼 수 있어요. 가족에게만 알려 주세요."));
  assert(h.includes('data-hh-action="copy"') && h.includes("코드 복사") && h.includes('data-hh-action="reissue"') && h.includes("가족 코드 다시 만들기"));
});
test("복사 알림: #13 완료 · #14 실패(경고 스타일)", () => {
  assert(HV.renderSection({ ...ON, notice: { kind: "copied" } }).includes("복사했어요."));
  const f = HV.renderSection({ ...ON, notice: { kind: "copyFailed" } });
  assert(f.includes("복사하지 못했어요. 코드를 길게 눌러 복사해 주세요.") && f.includes("hh-warn"));
});
test("상태 줄 우선순위: 준비 중(#18) > 쓰기 거부(#17) > 대기열(#15) > 없음", () => {
  assert.strictEqual(HV.statusLine({ enabled: true, pending: 2 }), "이 기기에만 저장됨 · 인터넷이 연결되면 자동으로 올라가요. (2건 대기)");
  assert.strictEqual(HV.statusLine({ enabled: true, pending: 2, permissionDenied: true }), "지금은 서버에 저장할 수 없어요. 이 기기에만 저장돼 있어요.");
  assert.strictEqual(HV.statusLine({ enabled: true, pending: 2, permissionDenied: true, rulesUnavailable: true }), "가족 캘린더는 준비 중이에요. 조금만 기다려 주세요.");
  assert.strictEqual(HV.statusLine({ enabled: true, pending: 0 }), "");
  assert(HV.renderSection({ ...ON, pending: 3 }).includes("(3건 대기)"));
  assert(HV.renderSection({ ...ON, notice: { kind: "flushed" } }).includes("모두 저장했어요."));
});
test("규칙 미배포(#18): 제목 + 준비 중 한 줄만 — 버튼·코드가 전혀 없다", () => {
  for (const view of VIEWS) {
    const h = HV.renderSection({ ...ON, view, rulesUnavailable: true });
    assert(h.includes("가족 캘린더는 준비 중이에요. 조금만 기다려 주세요."));
    assert(!h.includes("<button") && !h.includes("ABCD2345"), view);
  }
});
test("참여 결과 문구: #21~#23, #25, #26 (not-found·inactive 는 #23 통일 / permission-denied / 그 외)", () => {
  assert.strictEqual(M.joining, "가족 캘린더를 불러오는 중이에요…");
  assert.strictEqual(HV.joinMessage({ ok: true, mirror: { children: { a: {}, b: {}, c: { removedAt: 1 } } } }), "가족 캘린더에 들어왔어요. 아이 2명을 불러왔어요.");
  assert.strictEqual(HV.joinMessage({ ok: true, mirror: { children: {} } }), "가족 캘린더에 들어왔어요. 아직 등록된 아이가 없어요.");
  assert.strictEqual(HV.joinMessage({ ok: false, reason: "not-found" }), "이 코드로 만든 가족 캘린더를 찾지 못했어요. 코드를 다시 확인해 주세요.");
  assert.strictEqual(HV.joinMessage({ ok: false, reason: "inactive" }), HV.MSG.joinNotFound, "비활성도 #23 으로 통일");
  assert.strictEqual(HV.MSG.joinInactive, undefined, "#24 문구는 두지 않는다");
  assert.strictEqual(HV.joinMessage({ ok: false, reason: "permission-denied" }), "지금은 가족 캘린더를 쓸 수 없어요. 잠시 후 다시 시도해 주세요.");
  assert.strictEqual(HV.joinMessage({ ok: false, reason: "disabled" }), "처리하지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.");
  assert.strictEqual(HV.joinMessage(null), "처리하지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.");
});
test("실패 문구: 네트워크 #25 · permission-denied #26 · 재발급 #36", () => {
  assert.strictEqual(HV.failMessage({ code: "unavailable" }), M.failNetwork);
  assert.strictEqual(HV.failMessage({ code: "permission-denied" }), M.failDenied);
  assert.strictEqual(HV.failMessage("permission-denied"), M.failDenied);
  assert.strictEqual(HV.failMessage(null), M.failNetwork);
  assert.strictEqual(HV.failMessage({ code: "unavailable" }, "reissue"), "코드를 다시 만들지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.");
  assert(HV.renderSection({ ...ON, notice: { kind: "error", text: M.failDenied } }).includes(M.failDenied));
});
test("재발급 확인 #32~#34 · 진행 · 완료 #35", () => {
  const h = HV.renderSection({ ...ON, view: "reissue-confirm" });
  assert(h.includes("가족 코드를 다시 만들까요?"));
  assert(h.includes("새 코드가 만들어지고, 지금 코드는 바로 쓸 수 없게 돼요.<br>이미 들어와 있는 가족 기기는 그대로 쓸 수 있지만, 새로 들어올 사람은 새 코드가 필요해요."));
  assert(h.includes('data-hh-action="confirm-reissue"') && h.includes('data-hh-action="cancel-reissue"') && h.includes(">다시 만들기<") && h.includes(">취소<"));
  assert(!h.includes("hh-code-box"), "확인 단계에는 코드 박스가 없다");
  assert(HV.renderSection({ ...ON, view: "reissuing" }).includes("만드는 중이에요…"));
  assert(HV.renderSection({ ...ON, notice: { kind: "reissued" } }).includes("새 코드를 만들었어요. 가족에게 새 코드를 알려 주세요."));
});
test("승인 문구 원문 고정: MSG 의 주요 문자열이 승인본과 같다", () => {
  assert.strictEqual(M.codeEntryHint, "코드를 입력해 주세요. (아이 코드 6자리 또는 가족 코드 8자리)");
  assert.strictEqual(M.removedChild, "(분리된 아이)");
  assert.strictEqual(M.switchFail, "불러오지 못했어요. 인터넷 연결을 확인해 주세요.");
  assert.strictEqual(M.copyDone, "복사했어요.");
  assert.strictEqual(M.linkedOnly("ABC123"), "가족 캘린더 · 아이 코드 ABC123");
});

console.log("\n안전성");
test("동적 값 이스케이프: 이름·코드·알림 텍스트의 HTML 은 실행되지 않는다", () => {
  const evil = '<img src=x onerror="alert(1)">';
  const html = [HV.renderSection({ ...ON, view: "consent", childName: evil }), HV.renderSection({ ...ON, code: evil }), HV.renderSection({ ...ON, notice: { kind: "error", text: evil } })].join("");
  assert(!html.includes("<img"), html);
  assert(html.includes("&lt;img"));
});
test("data-hh-action 은 정해진 8개만 쓴다(기본 상태에서 — child-switch 는 showChildSwitch 일 때만 추가로 나온다)", () => {
  const all = VIEWS.map((view) => HV.renderSection({ ...ON, view })).join("");
  const acts = new Set([...all.matchAll(/data-hh-action="([^"]+)"/g)].map((m) => m[1]));
  assert.deepStrictEqual([...acts].sort(), ["cancel-create", "cancel-reissue", "confirm-create", "confirm-reissue", "copy", "create", "join", "reissue"]);
});
test("정적 확인: DOM·저장소·네트워크·Firestore 를 참조하지 않는다(순수)", () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "js", "household-view.js"), "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
  ["document", "localStorage", "sessionStorage", "firebase", "fetch(", "FamilySync", "HouseholdSync", "navigator", "innerHTML", "addEventListener"].forEach((w) => assert(!src.includes(w), w + " 참조"));
});

console.log(`\n${passed}개 통과${process.exitCode ? ", 일부 실패" : ""}`);
