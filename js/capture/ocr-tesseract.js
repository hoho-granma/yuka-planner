/*
 * ocr-tesseract — D37 웹용 글자 인식 어댑터(TextRecognition 계약, js/capture/text-recognition.js). 한글 tesseract.js(WebAssembly), 외부 CDN 없이 이 사이트의 vendor/ocr/ 파일만 쓴다.
 * 처음 사진 메뉴를 쓸 때만 데이터(약 5.7MB: 라이브러리 + 워커 + 코어 1개 + 한글 학습 데이터)를 받아 Cache Storage('hannun-ocr-v1')에 둔다 — 이후에는 오프라인에서도 이 기기 안에서 바로 읽는다.
 * 사진은 이 기기 안에서만 처리한다(서버 전송 없음). 일이 끝나면 워커를 곧 내려 메모리를 돌려준다.
 *   create({ win, base, idleMs }) → adapter { id, available, needsDownload, prepare({onProgress}), recognize(blob,{onProgress}), dispose, assets() }
 */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else root.OcrTesseract = factory();
})(typeof window !== "undefined" ? window : global, function () {
  "use strict";
  const CACHE_NAME = "hannun-ocr-v1"; // sw.js 가 이 이름의 캐시는 버전이 바뀌어도 지우지 않는다(다시 받지 않게)
  const SIMD_PROBE = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]); // WebAssembly SIMD 지원 검사(표준 탐지 바이트)
  const SIZES = Object.freeze({ lib: 62961, worker: 111307, coreSimd: 3899472, coreBasic: 3896484, lang: 1677415 }); // 진행 표시용 대략 바이트(Content-Length 가 있으면 그것을 쓴다)
  const err = (code, extra) => Object.assign({ code }, extra || {});

  function create(o) {
    const opts = o || {};
    const win = opts.win || (typeof window !== "undefined" ? window : null);
    const idleMs = opts.idleMs == null ? 30000 : opts.idleMs;
    const abs = (rel) => { try { return new URL(rel, (opts.baseHref || (win && win.location && win.location.href) || "http://localhost/")).href; } catch (e) { return rel; } };
    const base = abs(opts.base || "vendor/ocr/").replace(/\/?$/, "/");
    let worker = null, ready = false, idleTimer = null, preparing = null;

    const hasWasm = () => !!win && typeof win.WebAssembly === "object" && typeof win.Worker === "function";
    const simd = () => { try { return !!win.WebAssembly.validate(SIMD_PROBE); } catch (e) { return false; } };
    /** 받을 파일 목록(이 기기에서 쓸 코어 1개만). */
    function assets() {
      const core = simd() ? { id: "core", file: "tesseract-core-simd-lstm.wasm.js", bytes: SIZES.coreSimd } : { id: "core", file: "tesseract-core-lstm.wasm.js", bytes: SIZES.coreBasic };
      return [{ id: "lib", file: "tesseract.min.js", bytes: SIZES.lib }, { id: "worker", file: "worker.min.js", bytes: SIZES.worker }, core, { id: "lang", file: "kor.traineddata", bytes: SIZES.lang }].map((a) => ({ ...a, url: base + a.file }));
    }
    const totalBytes = () => assets().reduce((n, a) => n + a.bytes, 0);
    const store = async () => (win && win.caches && typeof win.caches.open === "function" ? win.caches.open(CACHE_NAME) : null);

    async function cachedAll() {
      try {
        const c = await store();
        if (!c) return false;
        for (const a of assets()) if (!(await c.match(a.url))) return false;
        return true;
      } catch (e) { return false; }
    }
    async function needsDownload() { return ready ? false : !(await cachedAll()); }

    /** 한 파일 받기(진행 바이트 보고) → Cache Storage 에 보관. 이미 있으면 바이트만 채운다. */
    async function fetchOne(a, report) {
      const c = await store().catch(() => null);
      if (c) { const hit = await c.match(a.url).catch(() => null); if (hit) { report(a.bytes); return; } }
      const res = await win.fetch(a.url, { cache: "no-cache" });
      if (!res || !res.ok) throw err("load-failed", { url: a.url, status: res && res.status });
      const keep = c ? res.clone() : null;
      const total = Number(res.headers && res.headers.get && res.headers.get("content-length")) || a.bytes;
      if (res.body && typeof res.body.getReader === "function") {
        const rd = res.body.getReader(); let got = 0;
        for (;;) { const { done, value } = await rd.read(); if (done) break; got += value.length; report(Math.min(a.bytes, Math.round((got / total) * a.bytes))); }
      } else { await res.arrayBuffer(); }
      report(a.bytes);
      if (keep) { try { await c.put(a.url, keep); } catch (e) { /* 저장 공간 부족 — 이번 한 번은 그냥 쓴다 */ } }
    }
    function loadScript(url) {
      return new Promise((resolve, reject) => {
        if (win.Tesseract) return resolve();
        const s = win.document.createElement("script");
        s.src = url; s.onload = () => resolve(); s.onerror = () => reject(err("load-failed", { url }));
        win.document.head.appendChild(s);
      });
    }

    async function prepare(p) {
      if (ready) return;
      if (!hasWasm()) throw err("unsupported");
      if (preparing) return preparing;
      const onProgress = (p && p.onProgress) || (() => {});
      preparing = (async () => {
        const list = assets(), total = totalBytes(), done = {};
        const report = (id) => (n) => { done[id] = n; onProgress(Math.min(1, Object.values(done).reduce((s, v) => s + v, 0) / total)); };
        try {
          for (const a of list) await fetchOne(a, report(a.id));
          await loadScript(list[0].url);
          if (!win.Tesseract || typeof win.Tesseract.createWorker !== "function") throw err("load-failed");
          ready = true; onProgress(1);
        } catch (e) { throw e && e.code ? e : err("load-failed"); }
      })();
      try { await preparing; } finally { preparing = null; }
    }

    async function ensureWorker(onProgress) {
      if (worker) return worker;
      const list = assets();
      try {
        worker = await win.Tesseract.createWorker("kor", 1, {
          workerPath: list[1].url, corePath: list[2].url, langPath: base.replace(/\/$/, ""), gzip: false, cacheMethod: "none", workerBlobURL: false,
          logger: (m) => { if (m && m.status === "recognizing text" && typeof m.progress === "number") onProgress(m.progress); },
        });
      } catch (e) { worker = null; throw err("load-failed"); }
      return worker;
    }
    const armIdle = () => { clearTimeout(idleTimer); idleTimer = setTimeout(dispose, idleMs); };
    function dispose() { clearTimeout(idleTimer); const w = worker; worker = null; if (w && typeof w.terminate === "function") { try { w.terminate(); } catch (e) {} } }

    async function recognize(blob, p) {
      const onProgress = (p && p.onProgress) || (() => {});
      clearTimeout(idleTimer);
      if (!ready) await prepare({ onProgress: () => {} });
      const w = await ensureWorker(onProgress);
      try {
        const r = await w.recognize(blob);
        const data = (r && r.data) || {};
        return { text: String(data.text || ""), lines: Array.isArray(data.lines) ? data.lines.map((l) => l.text) : undefined };
      } catch (e) { dispose(); throw err("error"); } finally { armIdle(); }
    }

    return { id: "web-tesseract", available: hasWasm, needsDownload, prepare, recognize, dispose, assets, totalBytes, CACHE_NAME };
  }
  return { CACHE_NAME, SIZES, create };
});
