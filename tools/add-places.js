#!/usr/bin/env node
/*
 * add-places — data/places.json 에 새 장소를 덧붙인다(반영 시간 단축용).
 *   사용: node tools/add-places.js <입력.json | -> [--dry-run] [--data data/places.json]
 *   입력: 장소 객체 JSON 배열(기존 필드 + lat·lng). '-' 이면 표준입력.
 * 하는 일(하나라도 걸리면 아무것도 쓰지 않고 종료 코드 1):
 *   1) 입력 형식 확인  2) js/places.js validateData(기존+새 장소 전체)  3) id 중복(기존·입력 안)  4) 같은 시·도·시군구 안 이름 중복(공백 무시)
 *   5) 기존 서식(들여쓰기 2칸·키 순서) 그대로 뒤에 덧붙이기  6) coverage 에 새 시·군·구 이름 덧붙이기(이미 들어 있으면 그대로)
 * lat·lng 가 빠진 장소는 null 로 채우고 경고한다. 좌표 출처 확인은 사람이 한다(이 도구는 값을 만들지 않는다).
 */
const fs = require("fs");
const path = require("path");
const Places = require("../js/places.js");

const KEY_ORDER = Places.FIELDS.concat(["notice", "lat", "lng"]);
const norm = (s) => String(s == null ? "" : s).replace(/\s+/g, "");

/** 순수 함수: data(places.json 객체)에 input(배열)을 덧붙인 새 객체를 돌려준다. { ok, errors[], warnings[], data, added } */
function addPlaces(data, input) {
  const errors = [], warnings = [];
  if (!data || !Array.isArray(data.places)) return { ok: false, errors: ["places.json 형식 오류(places 배열 없음)"], warnings, data, added: [] };
  if (!Array.isArray(input) || input.length === 0) return { ok: false, errors: ["입력은 비어 있지 않은 JSON 배열이어야 한다"], warnings, data, added: [] };
  const fixed = input.map((p, i) => {
    if (!p || typeof p !== "object" || Array.isArray(p)) { errors.push(`#${i}: 객체가 아님`); return p; }
    const o = { ...p };
    if (!("notice" in o)) o.notice = null;
    ["lat", "lng"].forEach((k) => { if (!(k in o)) { o[k] = null; warnings.push(`${o.id || "#" + i}: ${k} 없음 → null`); } });
    const sorted = {};
    KEY_ORDER.forEach((k) => { if (k in o) sorted[k] = o[k]; });
    Object.keys(o).forEach((k) => { if (!(k in sorted)) sorted[k] = o[k]; }); // 정의 밖 필드는 뒤에 두어 validateData 가 거부하게 한다
    return sorted;
  });
  if (errors.length) return { ok: false, errors, warnings, data, added: [] };
  const seenId = new Set(data.places.map((p) => p.id));
  const seenName = new Map(data.places.map((p) => [`${p.province}|${p.district}|${norm(p.name)}`, p.id]));
  fixed.forEach((p, i) => {
    if (seenId.has(p.id)) errors.push(`${p.id}: id 중복`);
    seenId.add(p.id);
    const nk = `${p.province}|${p.district}|${norm(p.name)}`;
    if (seenName.has(nk)) errors.push(`${p.id}: 같은 지역(${p.province} ${p.district || ""})에 같은 이름 '${p.name}' 이미 있음(${seenName.get(nk)})`);
    seenName.set(nk, p.id);
  });
  const next = { ...data, places: data.places.concat(fixed) };
  Places.validateData(next).forEach((e) => { if (e.index >= data.places.length || e.index < 0) errors.push(`${e.id || "#" + (e.index - data.places.length)}: ${e.field} — ${e.message}`); });
  if (errors.length) return { ok: false, errors, warnings, data, added: [] };
  // coverage: 새 시·군·구 이름이 아직 없으면 '·' 로 덧붙인다
  if (typeof data.coverage === "string") {
    let cov = data.coverage;
    fixed.forEach((p) => { const d = p.district || p.province; if (d && !cov.includes(d)) cov += `·${d}`; });
    next.coverage = cov;
  }
  return { ok: true, errors, warnings, data: next, added: fixed.map((p) => p.id) };
}
/** 기존 파일과 같은 서식(들여쓰기 2칸 + 끝 줄바꿈)으로 직렬화. */
const serialize = (data) => JSON.stringify(data, null, 2) + "\n";

function main(argv) {
  const args = argv.slice(2);
  const dry = args.includes("--dry-run");
  const di = args.indexOf("--data");
  const dataPath = path.resolve(di >= 0 ? args[di + 1] : path.join(__dirname, "..", "data", "places.json"));
  const inArg = args.find((a, i) => !a.startsWith("--") && (di < 0 || i !== di + 1));
  if (!inArg) { console.error("사용: node tools/add-places.js <입력.json | -> [--dry-run] [--data data/places.json]"); return 2; }
  let input;
  try { input = JSON.parse(inArg === "-" ? fs.readFileSync(0, "utf8") : fs.readFileSync(inArg, "utf8")); } catch (e) { console.error("입력 JSON 을 읽지 못했어요: " + e.message); return 2; }
  const raw = fs.readFileSync(dataPath, "utf8");
  const data = JSON.parse(raw);
  if (serialize(data) !== raw) console.warn("주의: 기존 파일 서식이 도구 서식과 달라 저장 시 전체가 다시 쓰여요.");
  const r = addPlaces(data, input);
  r.warnings.forEach((w) => console.warn("경고: " + w));
  if (!r.ok) { r.errors.forEach((e) => console.error("오류: " + e)); console.error("아무것도 쓰지 않았어요."); return 1; }
  console.log(`추가 ${r.added.length}곳: ${r.added.join(", ")}${r.data.coverage !== data.coverage ? `\ncoverage: ${data.coverage} → ${r.data.coverage}` : ""}`);
  if (dry) { console.log("(--dry-run: 쓰지 않음)"); return 0; }
  fs.writeFileSync(dataPath, serialize(r.data), "utf8");
  console.log(`기록: ${dataPath} (전체 ${r.data.places.length}곳)`);
  return 0;
}

if (require.main === module) process.exit(main(process.argv));
module.exports = { addPlaces, serialize, KEY_ORDER };
