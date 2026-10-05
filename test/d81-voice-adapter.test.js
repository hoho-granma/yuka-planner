const assert = require("assert"), fs = require("fs"), path = require("path"), vm = require("vm");
const CV = require("../js/capture/voice.js"), DV = require("../js/capture/draft-view.js");
const read = (f) => fs.readFileSync(path.join(__dirname, "..", f), "utf8");
const APP = read("js/app.js");
let fail = 0;
async function test(n, f) { try { await f(); console.log("  ok  -", n); } catch (e) { fail++; console.log("  FAIL-", n, "\n", e.stack.split("\n").slice(0, 3).join("\n")); } }
const src = APP.slice(APP.indexOf("  const CAPV = {"), APP.indexOf("  function capVoiceStop()") + APP.slice(APP.indexOf("  function capVoiceStop()")).indexOf("\n") + 1);
function rig(Rec) {
  const store = {}, shown = [];
  const win = { localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } } };
  if (Rec) win.SpeechRecognition = Rec;
  const sb = { window: win, CAP: { text: "", s: null, spoken: false }, CaptureVoice: CV, CaptureDraftView: DV, capShow: (h) => shown.push(h) };
  vm.createContext(sb);
  vm.runInContext(src + ";globalThis.api={capStartVoice,capOpenVoice,capVoiceStop,capShowVoice,CAPV};", sb);
  return { api: sb.api, CAP: sb.CAP, shown, store, last: () => shown[shown.length - 1] };
}
const fakeRec = (behavior) => class { constructor() { fakeRec.last = this; } start() { behavior(this); } stop() { this.onend && this.onend(); } };
(async () => {
  await test("성공: 마이크 → 글자가 붙여넣기 칸에 채워지고 자동 해석은 없다(후보 없음, spoken 표시)", () => {
    const r = rig(fakeRec((x) => setTimeout(() => {}, 0)));
    r.api.capOpenVoice();
    assert.ok(r.last().includes("data-cap-mic") && r.last().includes("음성은 이 기기의 음성 인식으로 글자가 돼요. 기기에 따라 Apple·Google의 서버에서 처리될 수 있어요. 한눈육아는 녹음을 저장하지 않아요.") && r.last().includes("<h3>음성 입력</h3>") && !/AI/.test(r.last()));
    assert.strictEqual(r.api.capStartVoice(), true);
    assert.ok(r.last().includes('aria-pressed="true"') && r.last().includes("듣고 있어요"));
    const rec = fakeRec.last; rec.onresult({ results: [[{ transcript: "다음 주 화요일 세 시에 치과" }]] });
    assert.strictEqual(r.CAP.text, "다음 주 화요일 세 시에 치과");
    assert.ok(r.last().includes("다음 주 화요일 세 시에 치과") && r.last().includes("해석하기") && r.CAP.s === null && r.CAP.spoken === true);
    r.api.capStartVoice(); fakeRec.last.onresult({ results: [[{ transcript: "하린이" }]] });
    assert.strictEqual(r.CAP.text, "다음 주 화요일 세 시에 치과 하린이", "이어 말하면 뒤에 붙는다");
  });
  await test("권한 거부: 키보드 받아쓰기 안내로 바뀌고 그 기기에 기억(다시 묻지 않음)", () => {
    const r = rig(fakeRec(() => {}));
    r.api.capOpenVoice(); r.api.capStartVoice(); fakeRec.last.onerror({ error: "not-allowed" });
    assert.ok(r.last().includes("키보드의 마이크(받아쓰기)") && !r.last().includes("data-cap-mic") && r.last().includes("Apple·Google"), "키보드 모드에도 고지 표시");
    assert.strictEqual(r.store[CV.FAIL_KEY], "1");
    const r2 = rig(fakeRec(() => {})); r2.store[CV.FAIL_KEY] = "1"; r2.api.capOpenVoice();
    assert.ok(!r2.last().includes("data-cap-mic"));
  });
  await test("시작 예외도 키보드 폴백", () => {
    const r = rig(class { start() { throw new Error("x"); } stop() {} });
    r.api.capOpenVoice(); assert.strictEqual(r.api.capStartVoice(), false);
    assert.ok(r.last().includes("키보드의 마이크(받아쓰기)"));
  });
  await test("미지원(SpeechRecognition 없음): 마이크 버튼 없이 키보드 안내, 시작은 false", () => {
    const r = rig(null);
    r.api.capOpenVoice();
    assert.ok(!r.last().includes("data-cap-mic") && r.last().includes("키보드의 마이크(받아쓰기)"));
    assert.strictEqual(r.api.capStartVoice(), false);
  });
  await test("빈 결과·no-speech: 안내만, 글자 불변, 실패로 기억하지 않음", () => {
    const r = rig(fakeRec(() => {}));
    r.api.capOpenVoice(); r.api.capStartVoice(); fakeRec.last.onresult({ results: [] });
    assert.ok(r.last().includes("잘 듣지 못했어요") && r.CAP.text === "" && r.last().includes("data-cap-mic"));
    r.api.capStartVoice(); fakeRec.last.onerror({ error: "no-speech" });
    assert.ok(r.last().includes("잘 듣지 못했어요") && !(CV.FAIL_KEY in r.store));
  });
  await test("듣는 중 다시 누르면 정지, 취소·해석 때 정지(capVoiceStop)", () => {
    const r = rig(fakeRec(() => {}));
    r.api.capOpenVoice(); r.api.capStartVoice(); assert.strictEqual(r.api.CAPV.listening, true);
    r.api.capStartVoice(); assert.strictEqual(r.api.CAPV.listening, false);
    r.api.capStartVoice(); r.api.capVoiceStop(); assert.strictEqual(r.api.CAPV.listening, false);
  });
  await test("앱 연결: 마이크 클릭·voice 메뉴·해석 때 spoken·취소 때 정지, 기존 4개 메뉴 분기 불변, index·sw 등록", () => {
    assert.ok(APP.includes('if (t.hasAttribute("data-cap-mic")) return capStartVoice();') && APP.includes('if (id === "voice") { capPhotoReset(); return capOpenVoice(); }') && APP.includes("spoken: CAP.spoken === true"));
    ["camera", "gallery"].forEach(() => assert.ok(APP.includes('if (id === "camera" || id === "gallery") return capPickPhoto(id);')));
    assert.ok(APP.includes('if (id === "paste") { CAP.text = ""; CAP.s = null; capPhotoReset(); return capShowPaste(); }') && /\[data-cap-mic\]"\) : null/.test(APP));
    assert.ok(read("index.html").includes("js/capture/voice.js") && read("sw.js").includes("./js/capture/voice.js"));
    assert.ok(!/js\/capture\/voice\.js[^\n]*https?:/.test(read("index.html")));
  });
  process.exit(fail ? 1 : 0);
})();
