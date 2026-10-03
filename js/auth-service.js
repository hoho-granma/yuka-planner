/*
 * 계정(D1): Firebase Auth(compat) 이메일/비밀번호 래퍼. 플래그 FEATURES.accounts 가 꺼져 있으면 SDK 를 불러오지도 부르지도 않는다(어떤 메서드도 {ok:false, reason:"disabled"}).
 * 순수 로직(검증·오류 문구)과 어댑터 주입형 서비스로 나눠 가짜 어댑터로 테스트한다. 서버(Firestore)에는 아무것도 쓰지 않는다 — accounts 문서·가구 연결은 D2.
 * 어댑터 계약: { createUser(email, password) → user, signIn(email, password) → user, signOut(), sendReset(email), updateDisplayName(user, name), onChange(cb) → unsubscribe }
 *   user = { uid, email, displayName } — 오류는 { code: "auth/..." } 를 던진다.
 */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else root.AuthService = factory();
})(typeof window !== "undefined" ? window : global, function () {
  "use strict";

  const SDK_URL = "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth-compat.js";
  const PASSWORD_MIN = 8;
  const MSG = Object.freeze({
    emailInUse: "이미 가입된 이메일이에요. 로그인해 주세요.",
    weakPassword: "비밀번호가 너무 약해요. 8자 이상으로 만들어 주세요.",
    invalidEmail: "이메일 형식을 확인해 주세요.",
    wrongCredential: "이메일 또는 비밀번호가 맞지 않아요.",
    network: "인터넷 연결을 확인하고 다시 시도해 주세요.",
    tooMany: "시도가 너무 많아요. 잠시 후 다시 시도해 주세요.",
    notReady: "로그인 기능이 아직 준비되지 않았어요.",
    serverNotReady: "계정 서버 설정이 아직 준비되지 않았어요. 잠시 후 다시 시도해 주세요.",
    codeNotFound: "가족코드를 찾을 수 없어요. 코드를 다시 확인해 주세요.",
    linkFailed: "가족 캘린더를 연결하지 못했어요. 인터넷 연결을 확인하고 다시 로그인해 주세요.",
    generic: "처리하지 못했어요. 잠시 후 다시 시도해 주세요.",
    resetSent: "비밀번호 재설정 메일을 보냈어요. 메일함을 확인해 주세요.",
  });

  const CODE_TO_MSG = Object.freeze({
    "auth/email-already-in-use": MSG.emailInUse,
    "auth/weak-password": MSG.weakPassword,
    "auth/invalid-email": MSG.invalidEmail,
    "auth/missing-email": MSG.invalidEmail,
    "auth/wrong-password": MSG.wrongCredential,
    "auth/invalid-credential": MSG.wrongCredential,
    "auth/invalid-login-credentials": MSG.wrongCredential,
    "auth/user-not-found": MSG.wrongCredential,
    "auth/user-disabled": MSG.wrongCredential,
    "auth/network-request-failed": MSG.network,
    "auth/too-many-requests": MSG.tooMany,
    "auth/operation-not-allowed": MSG.notReady,
    "auth/configuration-not-found": MSG.notReady,
  });
  /** 오류(코드 속성 또는 문자열) → 한국어 문구. 모르는 코드는 일반 안내. */
  function errorMessage(err) {
    const code = err && typeof err === "object" ? err.code : err;
    return CODE_TO_MSG[code] || MSG.generic;
  }

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const normEmail = (e) => String(e == null ? "" : e).trim();
  /** 로컬 검증(서버 호출 전): { ok, code, message } */
  function validateCredentials(email, password) {
    if (!EMAIL_RE.test(normEmail(email))) return { ok: false, code: "auth/invalid-email", message: MSG.invalidEmail };
    if (typeof password !== "string" || password.length < PASSWORD_MIN) return { ok: false, code: "auth/weak-password", message: MSG.weakPassword };
    return { ok: true };
  }

  /** 실제 Firebase Auth(compat) 어댑터. firebase.auth 가 불러와진 뒤에만 만든다. */
  function firebaseAdapter(fb) {
    const auth = fb.auth();
    const pick = (u) => (u ? { uid: u.uid, email: u.email || "", displayName: u.displayName || "" } : null);
    return {
      async createUser(email, password) { return pick((await auth.createUserWithEmailAndPassword(email, password)).user); },
      async signIn(email, password) { return pick((await auth.signInWithEmailAndPassword(email, password)).user); },
      async signOut() { await auth.signOut(); },
      async deleteUser() { if (auth.currentUser) await auth.currentUser.delete(); },
      async sendReset(email) { await auth.sendPasswordResetEmail(email); },
      async updateDisplayName(user, name) { if (auth.currentUser) await auth.currentUser.updateProfile({ displayName: name }); return { ...user, displayName: name }; },
      onChange(cb) { return auth.onAuthStateChanged((u) => cb(pick(u))); },
    };
  }

  /** 브라우저에서 Auth SDK 를 한 번만 불러온다(플래그가 켜진 뒤에만 호출됨). */
  function defaultLoadSdk() {
    if (typeof firebase !== "undefined" && typeof firebase.auth === "function") return Promise.resolve();
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = SDK_URL;
      s.onload = () => resolve();
      s.onerror = () => reject(Object.assign(new Error("auth sdk"), { code: "auth/network-request-failed" }));
      document.head.appendChild(s);
    });
  }

  const DISABLED = Object.freeze({ ok: false, reason: "disabled" });

  function create(opts) {
    opts = opts || {};
    const features = opts.features || (() => (typeof window !== "undefined" && window.FEATURES) || {});
    const enabled = () => features().accounts === true;
    let adapterP = null;
    const getAdapter = () => {
      if (!adapterP) {
        adapterP = opts.adapter
          ? Promise.resolve(opts.adapter)
          : (opts.loadSdk || defaultLoadSdk)().then(() => firebaseAdapter(opts.firebase || firebase));
        adapterP.catch(() => { adapterP = null; }); // 실패하면 다음 호출에서 다시 시도
      }
      return adapterP;
    };
    let user = null;

    async function run(fn) {
      if (!enabled()) return DISABLED;
      try {
        return await fn(await getAdapter());
      } catch (e) {
        return { ok: false, code: (e && e.code) || "error", message: errorMessage(e) };
      }
    }

    function signUp({ email, password, displayName } = {}) {
      if (!enabled()) return Promise.resolve(DISABLED);
      const v = validateCredentials(email, password);
      if (!v.ok) return Promise.resolve({ ok: false, code: v.code, message: v.message });
      return run(async (a) => {
        let u = await a.createUser(normEmail(email), password);
        const name = String(displayName || "").trim();
        if (name) u = await a.updateDisplayName(u, name);
        user = u;
        return { ok: true, user: u };
      });
    }
    function signIn({ email, password } = {}) {
      if (!enabled()) return Promise.resolve(DISABLED);
      if (!EMAIL_RE.test(normEmail(email))) return Promise.resolve({ ok: false, code: "auth/invalid-email", message: MSG.invalidEmail });
      if (!password) return Promise.resolve({ ok: false, code: "auth/wrong-password", message: MSG.wrongCredential });
      return run(async (a) => {
        user = await a.signIn(normEmail(email), password);
        return { ok: true, user };
      });
    }
    function signOut() {
      return run(async (a) => {
        await a.signOut();
        user = null;
        return { ok: true };
      });
    }
    /** 방금 만든 계정을 지운다(가입 중 서버 설정이 안 된 경우의 롤백). */
    function deleteCurrentUser() {
      return run(async (a) => {
        await a.deleteUser();
        user = null;
        return { ok: true };
      });
    }
    function sendPasswordReset(email) {
      if (!enabled()) return Promise.resolve(DISABLED);
      if (!EMAIL_RE.test(normEmail(email))) return Promise.resolve({ ok: false, code: "auth/invalid-email", message: MSG.invalidEmail });
      return run(async (a) => {
        await a.sendReset(normEmail(email));
        return { ok: true, message: MSG.resetSent };
      });
    }
    /** 로그인 상태 구독. 꺼져 있으면 아무것도 하지 않고 no-op 해제 함수를 돌려준다. */
    function onChange(cb) {
      if (!enabled()) return () => {};
      let off = null, dead = false;
      getAdapter().then((a) => {
        if (dead) return;
        off = a.onChange((u) => { user = u; cb(u); });
      }).catch(() => cb(null, { unknown: true })); // SDK 로드 실패·확인 불가는 '로그아웃됨'이 아니다(두 번째 인자로 구분)
      return () => { dead = true; if (off) off(); };
    }
    return { isEnabled: enabled, signUp, signIn, signOut, deleteCurrentUser, sendPasswordReset, onChange, currentUser: () => user };
  }

  return { create, errorMessage, validateCredentials, firebaseAdapter, MSG, PASSWORD_MIN, SDK_URL };
});
