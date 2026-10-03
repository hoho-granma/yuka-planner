/*
 * 기능 플래그 — 새 기능은 여기서 켜고 끈다.
 * G18: accounts·household 는 모든 사용자의 기본값이 ON(저장소에 아무 값도 없는 기기·홈 화면 앱 포함). 개발용으로 "hannun_feature_accounts" = "0" 을 넣으면 예전(OFF) 경로로 끌 수 있다.
 * household: 가구(가족 캘린더) 기능(B1~). 꺼져 있으면 js/household-sync.js 는 Firestore 를 읽지도 쓰지도 않고, js/household-view.js 는 아무것도 그리지 않는다.
 * B3/B4 도 같은 플래그를 읽는다.
 *
 * autoLink: AUTO 항목↔가구 일정 연결(C2-b). household 가 켜져 있을 때만 의미가 있고, 규칙(autoRef) 배포를 확인하기 전에는 켜지 않는다.
 *
 * accounts: 회원가입·로그인(D1~). 켜면 가족 캘린더(household)도 함께 켜진다(계정 기능이 켜지면 가족 캘린더가 기본 구조). 꺼져 있으면 Firebase Auth SDK 를 불러오지도 부르지도 않는다.
 *
 * 개발용 override: "hannun_feature_accounts" = "0" 이면 계정을 끄고(OFF 경로 검증용) 가구는 "hannun_feature_household" = "1" 일 때만 켠다. "hannun_feature_autolink" = "0" 이면 자동 연결을 끈다.
 * 페이지를 새로 불러올 때 한 번만 읽는다.
 */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory(null);
  else root.FEATURES = factory(root.localStorage);
})(typeof window !== "undefined" ? window : global, function (storage) {
  "use strict";
  const flags = { household: true, autoLink: false, accounts: true };
  try {
    const get = (k) => (storage ? storage.getItem(k) : null);
    if (get("hannun_feature_accounts") === "0") {
      flags.accounts = false;
      flags.household = get("hannun_feature_household") === "1"; // 계정을 끈 개발 기기: 가구는 예전처럼 "1" 일 때만
    }
    // autoLink: household 가 켜져 있으면 기본 ON. 끄려면 hannun_feature_autolink = "0".
    if (flags.household && get("hannun_feature_autolink") !== "0") flags.autoLink = true;
  } catch (e) {
    // 저장소 접근이 막혀도 기본값(ON)을 쓴다
  }
  return flags;
});
