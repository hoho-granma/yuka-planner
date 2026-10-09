/* D37 사진 → 글자 인식 → 규칙 파서 → 후보. 어댑터·화면·서비스워커·번들 확인(실제 인식 엔진은 돌리지 않는다 — 벤치는 따로 1회). 실행: node test/m29-photo-ocr.test.js */
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const TR = require("../js/capture/text-recognition.js");
const OT = require("../js/capture/ocr-tesseract.js");
const PC = require("../js/capture/photo-compress.js");
const PV = require("../js/capture/photo-view.js");
const AI = require("../js/capture/ai-parser.js");
const P = require("../js/capture/parse-ko.js");
const read = (f) => fs.readFileSync(path.join(__dirname, "..", f), "utf8");
let passed = 0;
async function test(name, f) { try { await f(); passed++; console.log("  ok  - " + name); } catch (e) { process.exitCode = 1; console.log("  FAIL- " + name + "\n      " + (e.stack || e).split("\n").slice(0, 3).join("\n      ")); } }
const TODAY = new Date(2026, 9, 5); // 2026-10-05(월)
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
function pipeline(raw, children) { // 앱(capParseRead)과 같은 순서: 정리 → 날짜 구분선 기준일 → 규칙 파서
  const text = TR.cleanText(raw), out = [];
  for (const ch of TR.splitByDateDividers(text, TODAY)) for (const c of P.parse(ch.text, { today: ch.baseDate || TODAY, children: children || [] })) out.push(c);
  return { text, cands: out };
}

(async () => {
  console.log("글 정리·기준일");
  await test("OCR 흔한 잡음: 띄어진 한글·숫자 오독(O→0, l→1)·전각 숫자·'3 시' 군더더기를 바로잡고 보통 문장은 건드리지 않는다", () => {
    assert.strictEqual(TR.cleanText("내 일 오 후 3 시 소아과"), "내일 오후 3시 소아과");
    assert.strictEqual(TR.cleanText("1O월 2O일 15:3O 치과"), "10월 20일 15:30 치과");
    assert.strictEqual(TR.cleanText("l0월 5일 상담"), "10월 5일 상담");
    assert.strictEqual(TR.cleanText("０９：３０ 접종"), "09:30 접종");
    assert.strictEqual(TR.cleanText("다음 주 화요일 어린이집 상담\n\n  \n오후 2시  "), "다음 주 화요일 어린이집 상담\n오후 2시");
    assert.strictEqual(TR.cleanText("Hello Open Office"), "Hello Open Office", "영문 단어 속 O 는 그대로");
  });
  await test("대화 캡처: 날짜 구분선이 그 아래 글의 기준일 — '내일'=구분선 다음 날, 구분선이 바뀌면 기준일도 바뀐다, 날짜가 든 일반 줄은 구분선이 아니다", () => {
    const raw = "2026년 10월 3일 토요일\n엄마 내일 오후 3시에 소아과 가자\n2026년 10월 7일 수요일\n아빠 모레 오후 2시 상담\n10월 14일(수) 오후 4시 치과";
    const { cands } = pipeline(raw);
    const by = (t) => cands.find((c) => c.title.includes(t));
    assert.strictEqual(by("소아과").eventDate, "2026-10-04"); assert.strictEqual(by("소아과").startTime, "15:00");
    assert.strictEqual(by("상담").eventDate, "2026-10-09");
    assert.strictEqual(by("치과").eventDate, "2026-10-14");
    assert.strictEqual(TR.splitByDateDividers("10월 14일(수) 오후 4시 치과", TODAY).length, 1);
    assert.deepStrictEqual(TR.splitByDateDividers("그냥 글", TODAY), [{ baseDate: null, text: "그냥 글" }]);
    assert.strictEqual(TR.isoOf(TR.splitByDateDividers("10월 3일 금요일\n내일 오후 3시", TODAY)[0].baseDate), "2026-10-03");
  });

  console.log("샘플 글 → 후보(규칙 파서)");
  await test("가정통신문·안내장 글: 날짜·시각·제목을 찾고, 날짜 없는 줄은 날짜 칸을 비운다(I9: 임의로 채우지 않음)", () => {
    const { cands } = pipeline("[알림장] 10월 14일(수) 오후 3시 30분 하린 치과 예약입니다\n다음 주 목요일 오전 10시 어린이집 상담\n10월 말 학부모 총회", [{ key: "k1", name: "하린" }]);
    const a = cands.find((c) => c.title.includes("치과")); assert.strictEqual(a.eventDate, "2026-10-14"); assert.strictEqual(a.startTime, "15:30"); assert.deepStrictEqual(a.childKeys, ["k1"]);
    const b = cands.find((c) => c.title.includes("상담")); assert.ok(b.eventDate && b.needsCheck.length > 0, "상대 날짜는 확인 필요");
    const c = cands.find((c) => c.title.includes("총회")); assert.strictEqual(c.eventDate, "", "날짜 없음은 빈칸");
  });
  await test("표형 목록 글(10/20 예방접종(수) 09:30 …)과 잡음 섞인 글도 후보로 나오고, 날짜가 전혀 없는 글만 '규칙으로 분석하지 못했어요'", () => {
    const { text, cands } = pipeline("10/20 예방접종(수) 09:30 구로구 보건소\n10/27 가정통신문 제출\n11월 5일 학부모 상담 16:00");
    assert.ok(cands.filter((c) => c.eventDate).length >= 2 && !AI.ruleFailed(text, cands));
    const none = pipeline("준비물: 체육복, 실내화\n학부모님께 안내드립니다"); assert.ok(AI.ruleFailed(none.text, none.cands), "날짜 없는 글");
    assert.strictEqual(AI.ruleFailed("", []), false, "글이 없으면 '규칙 실패'가 아니라 '못 읽음'");
  });

  console.log("서비스(계약)");
  const svcWith = (adapter, ms) => TR.createService({ adapter, timeoutMs: ms });
  const ad = (over) => ({ id: "fake", available: () => true, needsDownload: async () => false, prepare: async () => {}, recognize: async () => ({ text: "10월 14일 오후 3시 치과" }), dispose() {}, ...over });
  await test("recognize: 성공/빈 글(empty)/시간 초과(timeout)/데이터 실패(load-failed)/미지원(unsupported)/오류(error)", async () => {
    const ok = await svcWith(ad()).recognize({}); assert.ok(ok.ok && ok.text === "10월 14일 오후 3시 치과" && ok.source === "fake");
    assert.deepStrictEqual(await svcWith(ad({ recognize: async () => ({ text: " \n ~ " }) })).recognize({}), { ok: false, reason: "empty" });
    assert.deepStrictEqual(await svcWith(ad({ recognize: () => new Promise(() => {}) }), 20).recognize({}), { ok: false, reason: "timeout" });
    assert.deepStrictEqual(await svcWith(ad({ recognize: async () => { throw { code: "load-failed" }; } })).recognize({}), { ok: false, reason: "load-failed" });
    assert.deepStrictEqual(await svcWith(ad({ available: () => false })).recognize({}), { ok: false, reason: "unsupported" });
    assert.deepStrictEqual(await svcWith(null).recognize({}), { ok: false, reason: "unsupported" });
    assert.deepStrictEqual(await svcWith(ad({ recognize: async () => { throw new Error("x"); } })).recognize({}), { ok: false, reason: "error" });
    assert.deepStrictEqual(await svcWith(ad({ prepare: async () => { throw { code: "load-failed" }; } })).prepare(), { ok: false, reason: "load-failed" });
  });

  console.log("웹 어댑터(가짜 브라우저)");
  function fakeWin(o = {}) {
    const store = new Map(), fetched = [], created = [];
    const win = { location: { href: "https://app.example/index.html" }, WebAssembly: { validate: () => o.simd !== false }, Worker: function () {}, document: { head: { appendChild(s) { setTimeout(() => { win.Tesseract = { createWorker: async (lang, oem, opt) => { created.push({ lang, oem, opt }); return { recognize: async () => ({ data: { text: o.text || "오후 3시 치과", lines: [{ text: "오후 3시 치과" }] } }), terminate() { created.terminated = true; } }; } }; s.onload(); }, 0); } }, createElement: () => ({}) },
      fetch: async (url) => { fetched.push(url); if (o.failFetch) throw new Error("offline"); return { ok: true, headers: { get: () => null }, body: null, arrayBuffer: async () => new ArrayBuffer(8), clone() { return this; } }; },
      caches: o.noCaches ? undefined : { open: async () => ({ match: async (u) => store.get(u) || undefined, put: async (u, r) => { store.set(u, r); } }) } };
    return { win, store, fetched, created };
  }
  await test("처음엔 받을 데이터가 있고(needsDownload) 받은 뒤에는 없다 — 진행은 0→1 단조, 코어는 SIMD 가능하면 simd-lstm 아니면 기본 lstm, 모든 주소는 이 사이트의 vendor/ocr/(외부 CDN 없음)", async () => {
    const f = fakeWin(), a = OT.create({ win: f.win });
    assert.ok(a.available() && await a.needsDownload());
    const seen = []; await a.prepare({ onProgress: (p) => seen.push(p) });
    assert.ok(seen.length >= 4 && seen.every((v, i) => i === 0 || v >= seen[i - 1]) && seen[seen.length - 1] === 1);
    assert.ok(f.fetched.every((u) => u.startsWith("https://app.example/vendor/ocr/")) && f.fetched.some((u) => u.endsWith("tesseract-core-simd-lstm.wasm.js")) && f.fetched.some((u) => u.endsWith("kor.traineddata")) && f.fetched.length === 4);
    assert.strictEqual(await a.needsDownload(), false);
    const b = OT.create({ win: fakeWin({ simd: false }).win }); assert.ok(b.assets().some((x) => x.file === "tesseract-core-lstm.wasm.js") && !b.assets().some((x) => /simd/.test(x.file)));
    const g = fakeWin(); const a2 = OT.create({ win: g.win }); await a2.prepare({}); const second = OT.create({ win: g.win }); assert.strictEqual(await second.needsDownload(), false, "캐시에 있으면 다시 받지 않는다");
  });
  await test("인식: createWorker 는 한글(kor)·LSTM·같은 사이트 경로·압축 없음·IndexedDB 캐시 없음으로 만들고, 끝나면 곧 워커를 내린다(dispose)", async () => {
    const f = fakeWin(), a = OT.create({ win: f.win, idleMs: 1 });
    const r = await a.recognize({}, { onProgress() {} });
    assert.strictEqual(r.text, "오후 3시 치과"); const o = f.created[0];
    assert.deepStrictEqual([o.lang, o.oem, o.opt.gzip, o.opt.cacheMethod, o.opt.workerBlobURL], ["kor", 1, false, "none", false]);
    assert.ok(o.opt.workerPath.endsWith("/vendor/ocr/worker.min.js") && o.opt.corePath.endsWith(".wasm.js") && o.opt.langPath.endsWith("/vendor/ocr") && !/^https?:\/\/(?!app\.example)/.test(o.opt.langPath));
    await new Promise((res) => setTimeout(res, 15)); assert.ok(f.created.terminated, "한가해지면 워커 종료(메모리 반환)");
  });
  await test("데이터 받기 실패(오프라인)·WebAssembly 없음은 각각 load-failed·unsupported", async () => {
    const off = OT.create({ win: fakeWin({ failFetch: true }).win });
    await assert.rejects(() => off.prepare({}), (e) => e.code === "load-failed");
    const no = fakeWin(); delete no.win.WebAssembly; const a = OT.create({ win: no.win }); assert.strictEqual(a.available(), false);
    await assert.rejects(() => a.prepare({}), (e) => e.code === "unsupported");
  });
  await test("사진 줄이기(fitSize): 긴 변 1800 초과만 비율 유지로 줄이고 작으면 그대로", () => {
    assert.deepStrictEqual(PC.fitSize(4000, 3000), { width: 1800, height: 1350, scaled: true });
    assert.deepStrictEqual(PC.fitSize(1200, 800), { width: 1200, height: 800, scaled: false });
    assert.deepStrictEqual(PC.fitSize(1000, 5000, 1000), { width: 200, height: 1000, scaled: true });
  });

  console.log("화면 상태(명세 §1~§3)");
  await test("입력 방식(D82): 5개 타일(3+2), 순서 사진 찍기·사진 불러오기·메시지 붙여넣기·음성 입력·직접 입력, 기본 선택 '직접 입력', 보조 문구는 명세 그대로", () => {
    const h = PV.renderMenu(); assert.strictEqual((h.match(/class="cap-tile(?: active)?"/g) || []).length, 4);
    assert.deepStrictEqual((h.match(/data-cap-menu="([a-z]+)"/g) || []).map((x) => x.slice(15, -1)), ["gallery", "paste", "voice", "direct"]);
    assert.ok(h.includes('aria-label="음성 입력"') && h.includes('<rect x="9" y="3" width="6" height="11" rx="3"/>') && !/[\u{1F300}-\u{1FAFF}]/u.test(h), "마이크 아이콘 SVG, 이모지 없음");
    assert.ok(/cap-tile active" data-cap-menu="voice"/.test(PV.renderMenu("voice")));
    assert.ok(/cap-tile active" data-cap-menu="gallery" aria-pressed="true"/.test(h) && !/cap-tile active" data-cap-menu="camera"/.test(h));
    for (const t of ["사진 불러오기", "저장된 사진·캡처", "메시지 붙여넣기", "문자·가정통신문 글", "직접 입력", "날짜·제목을 직접"]) assert.ok(h.includes(t), t);
    assert.ok(!PV.renderMenu("camera").includes('data-cap-menu="camera"'));
  });
  await test("모든 상태에 [직접 입력으로 계속]·[붙여넣기로 계속] 중 하나 이상(막다른 화면 없음), 데이터 받기·읽는 중에는 [그만두기]", () => {
    for (const k of ["readFail", "unparsed", "downloadFail", "unavailable"]) { const h = PV.renderState(k, { rawText: "x", from: "camera" }); assert.ok(/data-cap-direct/.test(h) || /data-cap-open|data-cap-paste-prefill/.test(h), k); }
    for (const k of ["download", "reading"]) assert.ok(PV.renderState(k, { percent: 10, bytes: 5751155 }).includes("data-cap-photo-stop"), k);
    assert.ok(PV.renderState("readFail", { from: "gallery" }).includes("다시 고르기") && PV.renderState("readFail", { from: "camera" }).includes("다시 찍기"));
    assert.ok(PV.renderState("downloadFail").includes("data-cap-photo-retry"));
  });
  await test("문구: 읽는 중에 '저장하지도 서버로 보내지도 않아요' 고지, 10초 넘으면 안내 교체, 첫 데이터 받기에 용량(약 6MB)·와이파이 권유, ⑤에는 '규칙으로 분석하지 못했어요'", () => {
    assert.ok(PV.renderState("reading", {}).includes("고른 사진은 저장하지도, 서버로 보내지도 않아요. 이 기기 안에서 글자만 읽고 바로 잊어요."));
    assert.ok(PV.renderState("reading", { long: true }).includes("아직 읽고 있어요. 사진이 크면 오래 걸려요") && !PV.renderState("reading", { long: true }).includes("서버로 보내지도"));
    const d = PV.renderState("download", { percent: 42, bytes: 5751155 }); assert.ok(d.includes("약 6MB") && d.includes("와이파이") && /aria-valuenow="42"/.test(d) && /width:42%/.test(d));
    assert.ok(PV.renderState("unparsed", { rawText: "읽은 글" }).includes("규칙으로 분석하지 못했어요") && PV.renderState("unparsed", { rawText: "읽은 글" }).includes("읽은 글 보기 ›"));
  });
  await test("사진 상태 화면은 자동 AI 처리를 암시하지 않고, 메시지 AI는 비로그인 호출을 차단한다", async () => {
    const all = ["download", "reading", "readFail", "unparsed", "downloadFail", "unavailable"].map((k) => PV.renderState(k, { rawText: "x" })).join("") + PV.renderMenu();
    assert.ok(!/\bAI\b|인공지능|자동 보정/.test(all));
    const originalFetch = global.fetch; let calls = 0;
    try {
      global.fetch = async () => { calls++; throw Error('unexpected network call'); };
      assert.strictEqual(AI.enabled(), true);
      assert.strictEqual((await AI.parseWithAI("x", new Date(), {})).reason, "unauthenticated");
      assert.strictEqual(calls, 0);
    } finally { global.fetch = originalFetch; }
  });

  console.log("배포·번들");
  await test("서비스워커: 글자 인식 파일은 사전 캐시에 넣지 않고(처음 쓸 때만) 캐시 우선, 버전이 바뀌어도 hannun-ocr-* 캐시는 지우지 않는다. 새 스크립트는 index·sw 에 등록", () => {
    const sw = read("sw.js"), html = read("index.html");
    assert.ok(!/vendor\/ocr/.test(sw.slice(0, sw.indexOf("self.addEventListener"))), "SHELL_ASSETS 에 vendor 없음");
    assert.ok(/pathname\.includes\("\/vendor\/ocr\/"\)/.test(sw) && /startsWith\(OCR_CACHE_PREFIX\)/.test(sw) && sw.includes('OCR_CACHE = "hannun-ocr-v1"'));
    assert.strictEqual(OT.CACHE_NAME, "hannun-ocr-v1");
    for (const f of ["text-recognition", "photo-compress", "photo-crop", "ocr-tesseract", "photo-view", "ai-parser"]) assert.ok(html.includes(`js/capture/${f}.js`) && sw.includes(`./js/capture/${f}.js`), f);
  });
  await test("번들: vendor/ocr 에 라이브러리·워커·코어 2종(SIMD/기본)·한글 데이터·라이선스, 처음 받는 양은 6MB 안팎, 새 코드에 외부 주소 없음", () => {
    const dir = path.join(__dirname, "..", "vendor", "ocr"), size = (f) => fs.statSync(path.join(dir, f)).size;
    for (const f of ["tesseract.min.js", "worker.min.js", "tesseract-core-simd-lstm.wasm.js", "tesseract-core-lstm.wasm.js", "kor.traineddata", "LICENSE-tesseract.js.md", "LICENSE-tesseract.js-core.txt"]) assert.ok(fs.existsSync(path.join(dir, f)), f);
    const a = OT.create({ win: fakeWin().win }), first = a.assets().reduce((n, x) => n + size(x.file), 0);
    assert.ok(first > 5.5e6 && first < 6.2e6, "처음 받는 양 " + first);
    for (const x of a.assets()) assert.ok(Math.abs(size(x.file) - x.bytes) < 3000, x.file + " 크기 상수가 실제와 같다");
    for (const f of ["text-recognition", "photo-compress", "photo-crop", "ocr-tesseract", "photo-view", "ai-parser"]) assert.ok(!/https?:\/\//.test(read(`js/capture/${f}.js`).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")), f + " 외부 주소 없음");
  });
  await test("앱 연결: 기본 ON(저장값 '0'이면 OFF), 사진은 저장·전송 없이 메모리에서 버리고(token·revoke), 못 읽으면 직접 입력·붙여넣기로 이어진다", () => {
    const APP = read("js/app.js");
    const line = APP.split("\n").find((l) => l.startsWith("  const capPhotoOn = ")).replace(/;\s*$/, "");
    const run = (stored, flags) => require("vm").runInNewContext(line.replace("  const capPhotoOn = ", "(") + ")()", { localStorage: { getItem: () => stored }, window: { FEATURES: flags } });
    assert.strictEqual(run(null, {}), true, "저장값이 없으면 켜짐"); assert.strictEqual(run("1", {}), true); assert.strictEqual(run("0", {}), false, "'0' 이면 꺼짐"); assert.strictEqual(run(null, { photoInput: false }), false);
    assert.strictEqual(require("vm").runInNewContext(line.replace("  const capPhotoOn = ", "(") + ")()", { localStorage: { getItem() { throw new Error("blocked"); } }, window: {} }), true, "저장소가 막혀도 기본값(ON)");
    assert.ok(APP.includes('hannun_feature_photoinput'));
    const i = APP.indexOf("// ═══ D37 사진으로 추가"), blk = APP.slice(i, APP.indexOf("  function capOnClick(ev) {", i));
    assert.ok(!/setItem|Firestore|HouseholdSync|createSchedule|fetch\(|FileReader\.readAsDataURL|toDataURL/.test(blk), "사진·글을 저장·전송하지 않는다");
    assert.ok(/URL\.revokeObjectURL\(CAPP\.previewUrl\)/.test(blk) && /CAPP\.blob = null; \/\/ 사진은 글자를 읽자마자 버린다/.test(blk));
    assert.ok(blk.includes('renderState("unparsed"') && blk.includes('"readFail"') && blk.includes('"downloadFail"') && blk.includes('"unavailable"') && /AiParser\.ruleFailed/.test(blk) && !/parseWithAI/.test(blk), "AI 호출 없음");
    assert.ok(/data-cap-paste-prefill/.test(APP) && APP.includes("CAP.text = CAPP.rawText || \"\""));
  });
  console.log(`\n${passed} passed`);
})();
