/*
 * voice — 2-2 음성 입력 래퍼(브라우저 음성 인식 결과 '글자'만 받는다). 앱에는 아직 로드하지 않는다. 명세 docs/한눈육아-디자인명세-음성입력.md.
 * 녹음은 만들지도 저장하지도 보내지도 않는다. 인식된 글자는 onText 로만 넘기고 자동 해석하지 않는다('해석하기' 버튼이 parse-ko 를 부른다).
 *   create({ win, storage, onText, onState }) → { mode(), start(), stop(), isListening(), noteSeen(), markNoteSeen() }
 *   mode: "mic"(API 있고 이 기기에서 실패한 적 없음) | "keyboard"(API 없음/시작 실패 기억 — 키보드 받아쓰기 안내)
 * 첫 시작이 실패(권한 거부·서비스 불가·시작 예외)하면 그 기기에서는 keyboard 로 바꾸고 기억해 다시 묻지 않는다. 'no-speech'·'aborted' 는 실패가 아니다(빈 결과 안내).
 */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else root.CaptureVoice = factory();
})(typeof window !== "undefined" ? window : global, function () {
  "use strict";

  const FAIL_KEY = "hannun_voice_fail", NOTE_KEY = "hannun_voice_note";
  const HARD_ERRORS = ["not-allowed", "service-not-allowed", "audio-capture", "language-not-supported"];
  const get = (st, k) => { try { return st ? st.getItem(k) : null; } catch (e) { return null; } };
  const set = (st, k, v) => { try { if (st) st.setItem(k, v); } catch (e) {} };

  function create(opts) {
    const o = opts || {}, win = o.win || {}, storage = o.storage || null;
    const emit = typeof o.onState === "function" ? o.onState : () => {};
    const Ctor = win.SpeechRecognition || win.webkitSpeechRecognition || null;
    let rec = null, listening = false, failed = get(storage, FAIL_KEY) === "1";
    const mode = () => (Ctor && !failed ? "mic" : "keyboard");
    const fail = (reason) => { failed = true; set(storage, FAIL_KEY, "1"); listening = false; rec = null; emit({ mode: "keyboard", listening: false, reason }); };

    function start() {
      if (mode() !== "mic" || listening) return false;
      try {
        rec = new Ctor();
        rec.lang = "ko-KR"; rec.interimResults = false; rec.continuous = false; rec.maxAlternatives = 1;
        rec.onresult = (ev) => {
          let text = "";
          const res = ev && ev.results ? ev.results : [];
          for (let i = 0; i < res.length; i++) { const alt = res[i] && res[i][0]; if (alt && alt.transcript) text += (text ? " " : "") + String(alt.transcript).trim(); }
          listening = false;
          if (!text) return emit({ mode: "mic", listening: false, empty: true });
          if (typeof o.onText === "function") o.onText(text); // 글자만 — 자동 해석 없음
          emit({ mode: "mic", listening: false, heard: true });
        };
        rec.onerror = (ev) => {
          const err = ev && ev.error;
          if (HARD_ERRORS.includes(err)) return fail(err);
          listening = false;
          emit({ mode: "mic", listening: false, empty: err === "no-speech" || err === "aborted" });
        };
        rec.onend = () => { if (listening) { listening = false; emit({ mode: mode(), listening: false }); } };
        rec.start();
        listening = true;
        emit({ mode: "mic", listening: true });
        return true;
      } catch (e) { fail("start-failed"); return false; }
    }
    function stop() { if (rec && listening) { try { rec.stop(); } catch (e) {} } listening = false; }
    return { mode, start, stop, isListening: () => listening, noteSeen: () => get(storage, NOTE_KEY) === "1", markNoteSeen: () => set(storage, NOTE_KEY, "1") };
  }

  return { create, FAIL_KEY, NOTE_KEY };
});
