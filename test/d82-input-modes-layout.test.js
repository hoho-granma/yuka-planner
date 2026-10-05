const assert = require("assert"), fs = require("fs"), path = require("path");
const PV = require("../js/capture/photo-view.js"), SK = require("../js/schedule-kinds.js"), V = require("../js/user-schedule-view.js"), US = require("../js/user-schedule.js");
const read = (f) => fs.readFileSync(path.join(__dirname, "..", f), "utf8");
const CSS = read("css/capture.css"), APP = read("js/app.js");
let fail = 0;
function test(n, f) { try { f(); console.log("  ok  -", n); } catch (e) { fail++; console.log("  FAIL-", n, "\n", e.stack.split("\n").slice(0, 3).join("\n")); } }
test("5칩 3+2: 6칸 그리드, 윗줄 각 2칸·아랫줄 각 3칸, 세로형 64px, 설명 줄 숨김, 둥근 사각형(12px)·흰 면·선택=2px 진한 테두리", () => {
  assert.ok(/\.cap-menu \{[^}]*grid-template-columns: repeat\(6, 1fr\)/.test(CSS));
  assert.ok(/\.cap-tile \{[^}]*grid-column: span 2;[^}]*flex-direction: column;[^}]*min-height: 64px;[^}]*border: 1\.5px solid var\(--line\);[^}]*border-radius: 12px;[^}]*background: #fff/.test(CSS));
  assert.ok(/\.cap-tile:nth-child\(n\+4\) \{ grid-column: span 3; \}/.test(CSS));
  assert.ok(/\.cap-tile\.active \{[^}]*background: #fff; border: 2px solid var\(--us-fx-deep, var\(--c-select-border\)\)/.test(CSS));
  assert.ok(/\.cap-tile-t small \{ display: none; \}/.test(CSS) && /\.cap-tile:focus-visible \{ outline: 2px solid/.test(CSS) && !/nd-yellow/.test(CSS.slice(CSS.indexOf(".cap-menu {"), CSS.indexOf(".cap-state h3"))), "선택 표시에 노랑·구성원 색 채움 없음");
});
test("두 폼(g13·기존)이 같은 renderMenu 한 곳(capInjectEntry)을 쓴다 — 5칩, 기본 direct, 라벨 사용자 문구 그대로", () => {
  assert.strictEqual((APP.match(/CapturePhotoView\.renderMenu\(/g) || []).length >= 1, true);
  const i = APP.indexOf("function capInjectEntry()"), fn = APP.slice(i, APP.indexOf("\n  }\n", i));
  assert.ok(fn.includes('renderMenu("direct")') && /usShowForm = function usShowForm\(\)/.test(APP) && fn.indexOf("usShowFormBase") < 0);
  const h = PV.renderMenu("direct");
  ["사진 찍기", "사진 불러오기", "메시지 붙여넣기", "음성 입력", "직접 입력"].forEach((l) => assert.ok(h.includes(`<b>${l}</b>`), l));
  assert.ok(/role="group" aria-label="일정 추가 방법"/.test(h) && (h.match(/aria-pressed="/g) || []).length === 5);
});
test("기존 4개 동작 분기 불변 + 음성 입력은 capOpenVoice", () => {
  assert.ok(APP.includes('if (id === "camera" || id === "gallery") return capPickPhoto(id);') && APP.includes('if (id === "voice") { capPhotoReset(); return capOpenVoice(); }') && APP.includes('if (id === "paste") { CAP.text = ""; CAP.s = null; capPhotoReset(); return capShowPaste(); }'));
});
test("'집안일' 칩 삭제: 어른 목록 5개, 모든 목록에 없음. 기존 저장 일정(category FAMILY)의 표시·분류 enum은 그대로", () => {
  const all = [...Object.values(SK.CHILD_KINDS).flat(), ...SK.PREGNANT_KINDS, ...SK.COMMON_CHILD_KINDS, ...SK.ADULT_KINDS, ...SK.FAMILY_KINDS];
  assert.deepStrictEqual(SK.ADULT_KINDS.map((x) => x.label), ["회사", "모임·약속", "병원", "운동", "개인 일정"]);
  assert.ok(!all.some((x) => x.label === "집안일"));
  assert.ok(US.CATEGORIES.includes("FAMILY") && V.CATEGORIES.some((c) => c.key === "FAMILY"));
  const doc = { ...US.buildCreateDoc({ sourceType: "MANUAL", title: "집안일", category: "FAMILY", scope: "FAMILY", dateKind: "FIXED", eventDate: "2026-10-10", allDay: true }, 1790000000000).doc, id: "s1" };
  const occ = US.expandOccurrences(doc, "2026-10-10", "2026-10-10")[0];
  const c = V.cardData({ ...occ, badges: [] }, [], {});
  assert.ok(c.title === "집안일" && c.categoryLabel && V.renderCard(c).includes("집안일"));
  assert.ok(!/집안일/.test(read("js/capture/parse-ko.js")) && !/집안일/.test(read("js/app.js")));
});
test("카테고리 칩 줄만 좌우 패딩 10px·간격 5px(다른 칩·필터 칩 불변)", () => {
  const css = read("css/style.css");
  assert.ok(/\.modal-panel:has\(\.us-form\) \.us-chips\[data-us-kinds\] \{ gap: 5px; \}/.test(css) && /\.us-chips\[data-us-kinds\] \.us-chip \{ padding-left: 10px; padding-right: 10px; \}/.test(css));
  assert.ok(/\.us-chip \{ padding: 7px 12px;/.test(css) && /\.us-chips \{ display: flex; flex-wrap: wrap; gap: 6px; \}/.test(css), "기본 칩·다른 칩 줄 불변");
  assert.ok(read("js/user-schedule-view.js").includes('data-us-kinds>${kindChips}'));
});
process.exit(fail ? 1 : 0);
