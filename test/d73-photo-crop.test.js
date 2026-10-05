const assert = require("assert"), fs = require("fs"), path = require("path");
const C = require("../js/capture/photo-crop.js"), PC = require("../js/capture/photo-compress.js"), PV = require("../js/capture/photo-view.js");
const read = (f) => fs.readFileSync(path.join(__dirname, "..", f), "utf8");
let fail = 0;
function test(n, f) { try { f(); console.log("  ok  -", n); } catch (e) { fail++; console.log("  FAIL-", n, "\n", e.message); } }
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, a + " vs " + b);
test("clamp: 사진 밖으로 못 나가고 최소 크기 이상", () => {
  assert.deepStrictEqual(C.clampRect({ x: -1, y: 2, w: 0.5, h: 0.5 }, null), { x: 0, y: 0.5, w: 0.5, h: 0.5 });
  const r = C.clampRect({ x: 0.9, y: 0.9, w: 0.01, h: 0.01 }, { w: 0.2, h: 0.2 });
  near(r.w, 0.2); near(r.x, 0.8); near(r.y, 0.8);
  assert.deepStrictEqual(C.clampRect({ x: 0, y: 0, w: 5, h: 5 }, null), { x: 0, y: 0, w: 1, h: 1 });
});
test("move: 경계에서 멈춤", () => {
  const r = C.moveRect({ x: 0.2, y: 0.2, w: 0.5, h: 0.5 }, 1, -1);
  near(r.x, 0.5); near(r.y, 0); near(r.w, 0.5);
});
test("resize: 반대편 고정·최소 크기·뒤집힘 없음·경계", () => {
  const m = { w: 0.1, h: 0.1 }, base = { x: 0.2, y: 0.2, w: 0.4, h: 0.4 };
  let r = C.resizeRect(base, "se", 0.1, 0.1, m); near(r.x, 0.2); near(r.y, 0.2); near(r.w, 0.5); near(r.h, 0.5);
  r = C.resizeRect(base, "nw", 0.9, 0.9, m); near(r.x + r.w, 0.6); near(r.w, 0.1); near(r.h, 0.1); // 뒤집히지 않고 최소에서 멈춤
  r = C.resizeRect(base, "e", 5, 5, m); near(r.x + r.w, 1); near(r.y, 0.2); near(r.h, 0.4); // 변 핸들은 한 방향만
  r = C.resizeRect(base, "w", -5, 0, m); near(r.x, 0); near(r.x + r.w, 0.6);
});
test("minNorm: 화면 80px·원본 120px 중 큰 쪽", () => {
  const m = C.minNorm(4000, 3000, 400, 300); near(m.w, 0.2); near(m.h, 80 / 300);
  assert.strictEqual(C.minNorm(50, 50, 400, 400).w, 1);
});
test("fitContain·toSourceRect", () => {
  const f = C.fitContain(4000, 2000, 400, 400); near(f.w, 400); near(f.h, 200); near(f.y, 100);
  assert.deepStrictEqual(C.toSourceRect({ x: 0.25, y: 0.5, w: 0.5, h: 0.5 }, 4000, 2000), { sx: 1000, sy: 1000, sw: 2000, sh: 1000 });
  assert.deepStrictEqual(C.toSourceRect(C.FULL, 1234, 777), { sx: 0, sy: 0, sw: 1234, sh: 777 });
  assert.deepStrictEqual(C.toSourceRect({ x: 1, y: 1, w: 0, h: 0 }, 10, 10), { sx: 9, sy: 9, sw: 1, sh: 1 });
});
test("전체 박스를 잘라도 compress 와 같은 크기(회귀)", () => {
  const r = C.toSourceRect(C.FULL, 4032, 3024), a = PC.fitSize(r.sw, r.sh), b = PC.fitSize(4032, 3024);
  assert.deepStrictEqual(a, b);
  assert.strictEqual(typeof PC.open, "function"); assert.strictEqual(typeof PC.cropToBlob, "function");
});
test("renderCrop 마크업: 업로드·취소·다시 고르기·개인정보 문구", () => {
  const h = PV.renderCrop({ from: "gallery" });
  ["data-crop-stage", "data-cap-crop-ok", "data-cap-crop-cancel", "data-cap-photo-again"].forEach((k) => assert.ok(h.includes(k), k));
  assert.ok(h.includes(">업로드<") && h.includes(">취소<") && h.includes(">다시 고르기<") && h.includes(PV.MSG.privacy) && h.includes("읽을 부분 고르기"));
  assert.ok(PV.renderCrop({ from: "camera" }).includes(">다시 찍기<"));
  assert.ok(PV.renderState("loading").includes("사진을 불러오는 중") && PV.renderState("loading").includes("data-cap-photo-stop"));
  const d = PV.renderState("decodeFail", { from: "gallery" });
  assert.ok(d.includes("이 사진은 열 수 없어요") && d.includes("data-cap-direct") && d.includes("data-cap-open"));
});
test("CSS·연결: touch-action none, safe-area, 핸들 44px, index·sw 등록, app 흐름", () => {
  const css = read("css/capture.css"), APP = read("js/app.js");
  assert.ok(/\.crop-stage[^}]*touch-action: none/.test(css) && /\.crop-box[^}]*touch-action: none/.test(css) && css.includes("env(safe-area-inset-bottom)") && /\.crop-h \{[^}]*width: 44px; height: 44px/.test(css));
  assert.ok(read("index.html").includes("js/capture/photo-crop.js") && read("sw.js").includes("./js/capture/photo-crop.js"));
  assert.ok(APP.includes("PhotoCompress.open(file)") && APP.includes("PhotoCompress.cropToBlob(bmp, r)") && !APP.includes("PhotoCompress.compress(file)"));
  assert.ok(/function capCropClose\(\)/.test(APP) && /function capPhotoReset\(\) \{[^}]*capCropClose\(\)/.test(APP));
});
process.exit(fail ? 1 : 0);
