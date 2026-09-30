/*
 * 데이터 가드: 달력 월 계산(DateCalc.addMonthsClamped)에 들어가는 월 값이 전부 정수인지 검사한다.
 * addMonthsClamped는 비정수를 RangeError로 거부하므로(조용한 오계산 방지), 잘못된 데이터는 배포 전에 여기서 잡는다.
 *
 * 검사 대상 = js/schedule.js buildSubsidyEvents가 addMonths에 넘기는 값 + app.js 대표 월령 계산이 쓰는 값.
 *   - data/subsidies/** 의 subsidies[] 중 status === "확인완료"인 항목(화면에 노출되어 addMonths에 도달하는 것)의
 *       minAgeMonths / maxAgeMonths,
 *       deadlineType "birth_relative_months" → deadlineValue 는 정수 숫자,
 *       deadlineType "age_window"            → deadlineValue 는 { minMonths, maxMonths } 정수 숫자를 가진 객체
 *     (문자열 "12" 나 "96~155개월(…)" 같은 값은 실패로 본다 — 수정 전 코드는 이런 값을 조용히 Invalid Date 등으로 계산했다)
 *   - data/todos/*.json · national-todos.json 의 displayMonth (숫자일 때)
 * "확인필요" 항목은 schedule.js가 addMonths 이전에 건너뛰므로 실패로 보지 않고 참고로만 센다.
 * 검사하지 않는 것: 엔진(todo-engine.js) 트리거의 startMonth/endMonth — 엔진은 일수 근사(소수 월령 0.47 등을 의도적으로 사용)라 이 함수와 무관하다.
 *
 * 알려진 위반(KNOWN_VIOLATIONS): 배포 데이터에 이미 있는 아래 2건만 이슈 번호(docs/한눈육아-이슈기록.md I-4)와 함께 명시적으로 허용한다.
 * 이 항목들은 이 테스트에서 수정하지 않는다(데이터 트랙 소유). 앱은 schedule.js addMonths 래퍼가 그 항목만 Invalid Date로 남겨
 * 지역 전체 일정 계산이 중단되지 않게 한다. 목록에 없는 새 위반(MAPO-001이 확인완료로 바뀌는 경우 포함)은 계속 실패한다.
 * 데이터가 고쳐지면 아래 목록에서 해당 줄을 지운다(고쳐졌는데 남아 있으면 안내만 출력한다).
 *
 * 실행: node test/data-month-integers.test.js
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

function walk(dir) {
  const out = [];
  for (const name of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, name.name);
    if (name.isDirectory()) out.push(...walk(p));
    else if (name.name.endsWith(".json")) out.push(p);
  }
  return out;
}

const KNOWN_VIOLATIONS = new Map([
  ["data/subsidies/gyeonggi/과천시/subsidies.json#GGM-GWACHEON-03", "I-4"], // age_window인데 deadlineValue가 문자열
  ["data/subsidies/gyeonggi/양주시/subsidies.json#GGM-YANGJU-04", "I-4"], // age_window인데 deadlineValue가 숫자(객체 아님)
]);
const knownSeen = new Set();
const known = []; // 알려진 위반(허용)
const bad = []; // 화면에 노출되는데 addMonths가 거부할 값(알려진 위반 제외)
const info = []; // 확인필요 항목의 같은 문제(현재는 노출되지 않음)
let checked = 0;
const isInt = (v) => typeof v === "number" && Number.isInteger(v);
const rel = (f) => path.relative(ROOT, f);

function checkSubsidy(file, s) {
  const problems = [];
  for (const k of ["minAgeMonths", "maxAgeMonths"]) {
    if (s[k] === null || s[k] === undefined) continue;
    checked++;
    if (!isInt(s[k])) problems.push(`${k}=${JSON.stringify(s[k])}`);
  }
  if (s.deadlineType === "birth_relative_months") {
    checked++;
    if (!isInt(s.deadlineValue)) problems.push(`deadlineValue=${JSON.stringify(s.deadlineValue)} (birth_relative_months는 정수 숫자)`);
  }
  if (s.deadlineType === "age_window") {
    checked++;
    const v = s.deadlineValue;
    if (!v || typeof v !== "object" || !isInt(v.minMonths) || !isInt(v.maxMonths)) {
      problems.push(`deadlineValue=${JSON.stringify(v)} (age_window는 {minMonths, maxMonths} 정수 객체)`);
    }
  }
  if (problems.length) {
    const line = `${rel(file)} ${s.id} [${s.status}] ${problems.join("; ")}`;
    const key = `${rel(file).split(path.sep).join("/")}#${s.id}`;
    if (s.status !== "확인완료") info.push(line);
    else if (KNOWN_VIOLATIONS.has(key)) {
      knownSeen.add(key);
      known.push(`${line}  ← 알려진 위반 ${KNOWN_VIOLATIONS.get(key)}`);
    } else bad.push(line);
  }
}

for (const file of walk(path.join(ROOT, "data", "subsidies"))) {
  let d;
  try {
    d = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (e) {
    continue; // 작업 중인 원본/메모 JSON은 건너뛴다(이 검사는 앱이 읽는 데이터 모양만 본다)
  }
  for (const s of d && Array.isArray(d.subsidies) ? d.subsidies : []) checkSubsidy(file, s);
}

const todoFiles = fs.readdirSync(path.join(ROOT, "data", "todos")).filter((f) => f.endsWith(".json") && !f.startsWith("_")).map((f) => path.join(ROOT, "data", "todos", f));
todoFiles.push(path.join(ROOT, "data", "subsidies", "national-todos.json"));
for (const file of todoFiles) {
  for (const t of JSON.parse(fs.readFileSync(file, "utf8")).todos || []) {
    if (t.displayMonth === null || t.displayMonth === undefined) continue;
    checked++;
    if (!isInt(t.displayMonth)) bad.push(`${rel(file)} ${t.todo_id} displayMonth=${JSON.stringify(t.displayMonth)}`);
  }
}

console.log(`검사한 월 값 ${checked}개 · 새 위반 ${bad.length}개 · 알려진 위반(허용) ${known.length}개 · (참고) 확인필요 항목의 같은 문제 ${info.length}개`);
known.forEach((x) => console.log("  허용:", x));
info.forEach((x) => console.log("  참고:", x));
for (const key of KNOWN_VIOLATIONS.keys()) if (!knownSeen.has(key)) console.log(`  안내: 알려진 위반 ${key}가 더는 발견되지 않습니다 — KNOWN_VIOLATIONS에서 지워 주세요`);
assert.ok(checked > 500, "검사 대상이 비정상적으로 적습니다(경로·모양 변경 확인)");
assert.deepStrictEqual(bad, [], `화면에 노출되는 항목의 월 값이 정수가 아닙니다 — 알려진 위반 목록에 없는 새 위반(${bad.length}개):\n  ${bad.join("\n  ")}`);
console.log("  ok  - 알려진 위반(I-4) 2건을 제외하면 화면에 노출되는 항목의 월 값은 전부 정수(age_window는 {minMonths,maxMonths} 객체)");
