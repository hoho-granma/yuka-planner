/*
 * 카카오 로그인(브라우저). 카카오 로그인 화면으로 보냈다가 /oauth 로 돌아오면, 인가 코드를 서버 함수(kakaoLogin)에 넘겨
 * 한눈육아 전용 로그인 토큰을 받는다(서버가 카카오에 코드를 확인한다). 카카오에서는 번호와 닉네임만 쓰고 이메일은 받지 않는다.
 * REST API 키는 공개값(로그인 주소에 들어가는 클라이언트 ID)이고, 비밀키는 서버 시크릿(HANNUN_KAKAO)에만 있다.
 * 순수 로직과 주입형 의존성(저장소·위치·함수 호출)으로 나눠 테스트한다.
 */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else root.KakaoLogin = factory();
})(typeof window !== "undefined" ? window : global, function () {
  "use strict";

  const REST_API_KEY = "2a1ff92227b536ebb3c7cbc7da05290b";
  const STATE_KEY = "hannun_kakao_state";
  const CALLBACK_PATH = "/oauth";
  const MSG = Object.freeze({
    cancelled: "카카오 로그인을 취소하셨거나 허용되지 않았어요.",
    invalid: "로그인 요청을 확인하지 못했어요. 처음부터 다시 시도해 주세요.",
    generic: "카카오 로그인 중 문제가 생겼어요. 잠시 뒤에 다시 시도해 주세요.",
  });

  const enabled = () => REST_API_KEY.length > 0;
  const redirectUri = (loc) => String(loc.origin) + CALLBACK_PATH;
  const isCallback = (loc) => !!loc && loc.pathname === CALLBACK_PATH;
  const rand = (cryptoObj) => Array.from((cryptoObj || (typeof crypto !== "undefined" ? crypto : null)).getRandomValues(new Uint8Array(16))).map((b) => b.toString(16).padStart(2, "0")).join("");

  function authorizeUrl(state, redirect, key) {
    const q = new URLSearchParams({ client_id: key || REST_API_KEY, redirect_uri: redirect, response_type: "code", state });
    return "https://kauth.kakao.com/oauth/authorize?" + q.toString();
  }

  /** 카카오 로그인 화면으로 이동한다. 돌아왔을 때 우리가 보낸 요청인지 확인하려고 state 를 이 탭에 적어 둔다. */
  function start({ storage, location, crypto: c } = {}) {
    const st = storage || sessionStorage, loc = location || window.location;
    const state = rand(c);
    try { st.setItem(STATE_KEY, state); } catch (e) { /* 저장 불가면 돌아와서 실패 안내 */ }
    loc.assign(authorizeUrl(state, redirectUri(loc)));
    return state;
  }

  /** /oauth 로 돌아왔을 때: state 확인 → 서버 함수에 코드 전달 → { ok, token, isNew } 또는 { ok:false, message }. */
  async function complete({ search, storage, location, call } = {}) {
    const st = storage || sessionStorage, loc = location || window.location;
    const q = new URLSearchParams(search || "");
    let saved = null;
    try { saved = st.getItem(STATE_KEY); st.removeItem(STATE_KEY); } catch (e) { /* 아래에서 실패 */ }
    if (q.get("error")) return { ok: false, message: MSG.cancelled };
    const code = q.get("code"), state = q.get("state");
    if (!code || !saved || saved !== state) return { ok: false, message: MSG.invalid };
    try {
      const data = await call({ code, redirectUri: redirectUri(loc), state });
      if (!data || !data.token) return { ok: false, message: MSG.generic };
      return { ok: true, token: data.token, isNew: data.isNew === true, name: data.name || "" };
    } catch (e) {
      const fromServer = e && typeof e.code === "string" && e.code.indexOf("functions/") === 0 && e.code !== "functions/internal" && e.message;
      return { ok: false, message: fromServer ? e.message : MSG.generic };
    }
  }

  return { enabled, isCallback, redirectUri, authorizeUrl, start, complete, MSG, CALLBACK_PATH, REST_API_KEY };
});
