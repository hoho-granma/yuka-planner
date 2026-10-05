/*
 * text-recognition — D37 사진 글자 인식 계약(플랫폼 비의존)과 읽은 글 정리. 계획서 docs/한눈육아-자동입력-사진음성-계획서.md §8·P4.
 * 사진은 저장하지도 보내지도 않는다: 어댑터는 이 기기 안에서 글자만 읽고, 이 모듈은 DOM·저장소·네트워크를 만지지 않는다(어댑터가 한다).
 *
 *   어댑터 계약 adapter = {
 *     id: "web-tesseract" | "native-…",
 *     available(): boolean,                         // 이 기기에서 쓸 수 있는가(WebAssembly·Worker 등)
 *     needsDownload(): Promise<boolean>,            // 처음 한 번 받을 데이터가 남았는가
 *     prepare({ onProgress(0..1) }): Promise<void>, // 데이터 받기(없으면 즉시). 실패하면 { code: "load-failed" } 를 던진다
 *     recognize(blob, { onProgress(0..1) }): Promise<{ text, lines?: string[] }>,
 *     dispose(): void
 *   }
 *   createService({ adapter, timeoutMs }) → { available, needsDownload, prepare, recognize(blob, o) → { ok:true, text, lines, source } | { ok:false, reason } }
 *   reason: "unsupported"(어댑터 없음/못 씀) | "load-failed"(데이터 받기 실패) | "timeout" | "empty"(글자를 못 찾음) | "error"
 *   cleanText(raw) → 정리한 글 / splitByDateDividers(text, today) → [{ baseDate: Date|null, text }]  (대화 캡처: 날짜 구분선을 '기준일'로)
 */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else root.TextRecognition = factory();
})(typeof window !== "undefined" ? window : global, function () {
  "use strict";
  const REASONS = Object.freeze(["unsupported", "load-failed", "timeout", "empty", "error"]);
  const DEFAULT_TIMEOUT_MS = 90000;

  /** 한글 한 글자 토큰이 3개 이상 띄어 쓰인 줄('내 일 오 후')만 붙인다 — 보통 말(2자 이상)은 건드리지 않는다. */
  function joinSpacedHangul(line) {
    return line.replace(/(?:^|(?<=\s))(?:[가-힣]\s){2,}[가-힣](?=\s|$|[0-9.,:)])/g, (m) => m.replace(/\s/g, ""));
  }
  /** OCR 흔한 오독만 숫자 문맥에서 바로잡는다(글자 모양이 같아 헷갈리는 O/o→0, l/I/|→1). 문장 속 영문은 건드리지 않는다. */
  function fixDigitLookalikes(line) {
    return line
      .replace(/(?<=\d)[Oo](?=\d|\s*[월일시분:])/g, "0")
      .replace(/(?<=\d)[lI|](?=\d)/g, "1")
      .replace(/(?<![A-Za-z가-힣])[lI|](?=\d{1,2}\s*[월일시분:])/g, "1")
      .replace(/(?<=\d\s*)[Oo](?=\s*[월일시분])/g, "0")
      .replace(/(?<=\d:\d)[Oo](?![A-Za-z])/g, "0");
  }
  /** 붙여 놓은 자주 쓰는 말 사이에 한 칸('내일오후'→'내일 오후')과 숫자·단위 사이 군더더기 칸('3 시'→'3시')을 정리한다. */
  function fixSpacing(line) {
    return line
      .replace(/(내일|모레|글피|오늘)(?=[가-힣0-9])/g, "$1 ")
      .replace(/(오전|오후)(?=[0-9])/g, "$1 ")
      .replace(/(오전|오후)(?=[가-힣])(?!오전|오후)/g, "$1 ")
      .replace(/(\d)\s+(시|분|월|일)(?=\s|$|[0-9(.,~)])/g, "$1$2");
  }
  function cleanText(raw) {
    const s = String(raw == null ? "" : raw)
      .replace(/[​-‍﻿]/g, "")
      .replace(/ /g, " ")
      .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
      .replace(/[：]/g, ":")
      .replace(/[～〜]/g, "~")
      .replace(/\r\n?/g, "\n");
    return s.split("\n").map((l) => fixSpacing(fixDigitLookalikes(joinSpacedHangul(l.replace(/[ \t]+/g, " ").trim())))).filter((l) => l !== "").join("\n");
  }
  const hasText = (t) => /[0-9A-Za-z가-힣]/.test(String(t || ""));

  const pad = (n) => String(n).padStart(2, "0");
  /** 단독 날짜 줄: "2026년 10월 3일 토요일" · "10월 3일 금요일" · "2026. 10. 3. 토" · "— 2026년 10월 3일 —" */
  const DIVIDER = /^[\s\-—–_~·•]*(?:(\d{4})\s*[년.\-/]\s*)?(\d{1,2})\s*[월.\-/]\s*(\d{1,2})\s*일?\.?\s*(?:\(?[월화수목금토일](?:요일)?\)?)?[\s\-—–_~·•]*$/;
  /**
   * 대화 캡처 기준일: 날짜 구분선 줄이 나오면 그 아래 글은 그 날짜를 '오늘'로 해석한다(예: 구분선 10월 3일 아래 "내일" = 10월 4일).
   * 구분선이 하나도 없으면 [{ baseDate: null, text }] 한 덩어리. 연도가 없으면 today 의 연도(미래로 6개월 넘게 앞서면 작년). 날짜가 아닌 줄(예: "10월 14일(화) 오후 3시 …")은 구분선이 아니다.
   */
  function splitByDateDividers(text, today) {
    const lines = String(text == null ? "" : text).split("\n");
    const t = today instanceof Date ? today : new Date();
    const chunks = [];
    let cur = { baseDate: null, lines: [] };
    for (const line of lines) {
      const m = DIVIDER.exec(line);
      if (m && line.trim().length <= 24) {
        const mo = Number(m[2]), d = Number(m[3]);
        let y = m[1] ? Number(m[1]) : t.getFullYear();
        const dt = new Date(y, mo - 1, d);
        if (dt.getMonth() === mo - 1 && dt.getDate() === d) {
          if (!m[1] && dt.getTime() - t.getTime() > 183 * 86400000) dt.setFullYear(y - 1);
          if (cur.lines.length || cur.baseDate) chunks.push(cur);
          cur = { baseDate: dt, lines: [] };
          continue;
        }
      }
      cur.lines.push(line);
    }
    if (cur.lines.length || cur.baseDate || !chunks.length) chunks.push(cur);
    const out = chunks.map((c) => ({ baseDate: c.baseDate, text: c.lines.join("\n").trim() })).filter((c) => c.text !== "");
    return out.length ? out : [{ baseDate: null, text: String(text || "").trim() }];
  }
  const isoOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  const withTimeout = (p, ms) => new Promise((resolve, reject) => {
    const t = setTimeout(() => reject({ code: "timeout" }), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });

  function createService({ adapter, timeoutMs } = {}) {
    const ok = () => !!adapter && typeof adapter.available === "function" && adapter.available() === true;
    const fail = (reason) => ({ ok: false, reason });
    return {
      available: ok,
      totalBytes: () => (adapter && typeof adapter.totalBytes === "function" ? adapter.totalBytes() : 0),
      needsDownload: async () => (ok() && typeof adapter.needsDownload === "function" ? !!(await adapter.needsDownload()) : false),
      /** 데이터 받기. { ok:true } | { ok:false, reason: "unsupported"|"load-failed" } */
      async prepare(o) {
        if (!ok()) return fail("unsupported");
        try { await adapter.prepare({ onProgress: (o && o.onProgress) || (() => {}) }); return { ok: true }; } catch (e) { return fail("load-failed"); }
      },
      async recognize(blob, o) {
        if (!ok()) return fail("unsupported");
        try {
          const r = await withTimeout(Promise.resolve(adapter.recognize(blob, { onProgress: (o && o.onProgress) || (() => {}) })), timeoutMs || DEFAULT_TIMEOUT_MS);
          const text = cleanText(r && r.text);
          if (!hasText(text)) return fail("empty");
          return { ok: true, text, lines: text.split("\n"), source: adapter.id || "unknown" };
        } catch (e) {
          if (e && e.code === "timeout") return fail("timeout");
          if (e && e.code === "load-failed") return fail("load-failed");
          return fail("error");
        }
      },
      dispose() { try { adapter && adapter.dispose && adapter.dispose(); } catch (e) {} },
    };
  }

  return { REASONS, DEFAULT_TIMEOUT_MS, cleanText, joinSpacedHangul, splitByDateDividers, isoOf, createService, hasText };
});
