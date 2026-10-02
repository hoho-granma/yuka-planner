/*
 * 기능 플래그 — 새 기능은 여기서 켜고 끈다. 기본값은 모두 꺼짐(기존 동작 그대로).
 * household: 가구(가족 캘린더) 기능(B1~). 꺼져 있으면 js/household-sync.js 는 Firestore 를 읽지도 쓰지도 않고, js/household-view.js 는 아무것도 그리지 않는다.
 * B3/B4 도 같은 플래그를 읽는다.
 *
 * autoLink: AUTO 항목↔가구 일정 연결(C2-b). household 가 켜져 있을 때만 의미가 있고, 규칙(autoRef) 배포를 확인하기 전에는 켜지 않는다.
 *
 * accounts: 회원가입·로그인(D1~). 켜면 가족 캘린더(household)도 함께 켜진다(계정 기능이 켜지면 가족 캘린더가 기본 구조). 꺼져 있으면 Firebase Auth SDK 를 불러오지도 부르지도 않는다.
 *
 * 개발용 override: 이 기기의 localStorage "hannun_feature_household" / "hannun_feature_autolink" / "hannun_feature_accounts" 가 정확히 "1" 일 때만 켜진다(2기기 테스트용).
 * 규칙(firestore.rules)이 배포되기 전에는 아무도 켜지 않는다. 페이지를 새로 불러올 때 한 번만 읽는다.
 */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory(null);
  else root.FEATURES = factory(root.localStorage);
})(typeof window !== "undefined" ? window : global, function (storage) {
  "use strict";
  const flags = { household: false, autoLink: false, accounts: false };
  try {
    if (storage && storage.getItem("hannun_feature_household") === "1") flags.household = true;
    if (storage && storage.getItem("hannun_feature_accounts") === "1") {
      flags.accounts = true;
      flags.household = true; // 계정 기능이 켜지면 가족 캘린더가 기본 구조
    }
    // autoLink 는 household 가 켜져 있을 때만 읽는다 — household 가 꺼진 기기는 localStorage 를 한 번만(household 키) 읽고 그 뒤 접근이 없다.
    // E(1-2): 규칙 배포·수동 검증이 끝났으므로 가구가 켜지면 기본 ON. 끄려면 hannun_feature_autolink = "0".
    if (flags.household && storage.getItem("hannun_feature_autolink") !== "0") flags.autoLink = true;
  } catch (e) {}
  return flags;
});
