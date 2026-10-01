/*
 * 기능 플래그 — 새 기능은 여기서 켜고 끈다. 기본값은 모두 꺼짐(기존 동작 그대로).
 * household: 가구(가족 캘린더) 기능(B1~). 꺼져 있으면 js/household-sync.js 는 Firestore 를 읽지도 쓰지도 않는다.
 * B3/B4 도 같은 플래그를 읽는다.
 */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else root.FEATURES = factory();
})(typeof window !== "undefined" ? window : global, function () {
  "use strict";
  return { household: false };
});
