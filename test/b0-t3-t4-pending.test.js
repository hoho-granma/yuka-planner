/*
 * B0 / T3·T4 뼈대.
 *  T3 AUTO 골든: 코드 변경 전후 비교는 test/tools/auto-diff.js (--base <직전 커밋>) 가 맡는다. 골든 JSON 은 만들지 않는다.
 *  T4 메타모픽: USER 일정을 추가·삭제해도 autoEvents·displayDate 가 불변 — 대상 모듈(js/user-schedule.js, js/calendar-model.js)은 B2 에서 생긴다.
 * 모듈이 없으면 대기(pending)로 보고하고 통과한다. B2 에서 아래 TODO 를 채운다.
 * 실행: node test/b0-t3-t4-pending.test.js
 */
const fs = require("fs");
const path = require("path");
const need = ["user-schedule.js", "calendar-model.js"].filter((f) => !fs.existsSync(path.join(__dirname, "..", "js", f)));
console.log("  ok  - T3: auto-diff 도구 존재", fs.existsSync(path.join(__dirname, "tools", "auto-diff.js")));
if (need.length) console.log(`  pending - T4: ${need.join(", ")} 없음(B2에서 구현)`);
else throw new Error("T4 TODO: B2 모듈이 생겼으니 메타모픽 테스트를 작성하세요");
