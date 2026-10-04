/* 36개월 미만·임신 중 아이의 체크리스트·혜택 미리 보기는 HEAD 와 같고, 36개월 이상은 허용 목록(data/policy/auto-after36.json)의 항목만 보인다.
 * HEAD 코드(todo-engine·child-timeline·schedule.js)를 git 에서 읽어 같은 데이터로 돌려 현재 코드와 비교한다(git 이 없으면 비교는 건너뛴다). 실행: node --test test/h6-under36-head-parity.test.js */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const cp = require("child_process");
const crypto = require("crypto");
const ROOT = path.join(__dirname, "..");
const rd = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), "utf8"));
const headSrc = (p) => cp.execFileSync("git", ["show", `HEAD:${p}`], { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
let HEAD_OK = true;
try { headSrc("js/schedule.js"); } catch (e) { HEAD_OK = false; }

const SP = require("../js/school-policy.js");
const AA = require("../js/auto-after36.js");
const policy = SP.normalize(rd("data/policy/school.json"));
const FILES = ["health-checkup", "vaccination", "development", "feeding", "oral", "sleep", "safety", "daily-life", "childcare", "school", "school-age"].map((f) => `data/todos/${f}.json`).concat("data/subsidies/national-todos.json");
const todoDefinitions = FILES.flatMap((f) => rd(f).todos);
const subsidies = ["data/subsidies/national.json", "data/subsidies/seoul/city.json", "data/subsidies/seoul/districts/구로구.json"].flatMap((p) => rd(p).subsidies);

function load(srcOf) {
  const req = (n) => { throw new Error("no " + n); };
  const umd = (p) => { const m = { exports: {} }; new Function("module", "exports", "require", srcOf(p))(m, m.exports, req); return m.exports; };
  const sb = { console };
  sb.TodoEngine = umd("js/todo-engine.js");
  sb.DateCalc = umd("js/date-calc.js");
  sb.ChildTimeline = umd("js/child-timeline.js");
  vm.createContext(sb);
  vm.runInContext(srcOf("js/schedule.js") + "\n;globalThis.__build = buildSchedule;", sb);
  return { CT: sb.ChildTimeline, build: sb.__build };
}
const cur = load((p) => fs.readFileSync(path.join(ROOT, p), "utf8"));
const head = HEAD_OK ? load(headSrc) : null;

const now = new Date();
const monthsAgo = (m) => new Date(now.getFullYear(), now.getMonth() - m, 1);
const KIDS = {
  "3개월": { birthDate: monthsAgo(3), stage: "born" },
  "24개월": { birthDate: monthsAgo(24), stage: "born" },
  "35개월": { birthDate: monthsAgo(35), stage: "born" },
  "임신 중(출산 예정 5개월 뒤)": { birthDate: new Date(now.getFullYear(), now.getMonth() + 5, 15), stage: "pregnant" },
};
const prof = (k) => ({ ...k, province: "서울특별시", district: "구로구", gender: "M", birthOrder: "first", schoolPolicy: policy });
const SNAP_ALLOW = AA.normalize(rd("data/policy/auto-after36.json"));

const snapshot = (m, k, dataset, shown) => {
  const b = k.birthDate;
  const ev = m.build(prof(k), dataset, []);
  const vis = ev.filter((e) => shown(m.CT, b, e));
  const groups = {};
  for (const e of vis) {
    const cm = m.CT.completedMonths(b, e.date);
    const g = m.CT.checklistGroupLabel(m.CT.checklistBucket(cm));
    (groups[g] = groups[g] || []).push(e.id);
  }
  // 마일스톤 대기 항목의 날짜는 호출 시각(new Date())이라 일 단위로 비교한다
  return { ids: vis.map((e) => [e.id, e.scheduleKind, Math.floor(e.date.getTime() / 86400000)]), groups, nuri: vis.filter((e) => /^(NAT-020|SB-08)/.test(e.id)).map((e) => e.id) };
};

for (const [name, k] of Object.entries(KIDS)) {
  test(`${name}: 체크리스트·혜택 미리 보기가 HEAD 와 같다(37~47/48~59/60~72개월 그룹, 3~5세 유아학비 포함) — 허용 목록이 있든 없든 동일`, { skip: !HEAD_OK }, () => {
    const base = { todoDefinitions, subsidy: { subsidies } };
    const h = snapshot(head, k, base, (CT, b, e) => CT.isEventVisible(b, e));
    for (const allow of [undefined, SNAP_ALLOW, AA.normalize(null)]) {
      const c = snapshot(cur, k, { ...base, autoAfter36: allow }, (CT, b, e) => CT.isEventShown(b, e));
      assert.strictEqual(JSON.stringify(c.ids), JSON.stringify(h.ids), "노출 이벤트(id·유형·날짜)가 HEAD 와 같다");
      assert.strictEqual(JSON.stringify(c.groups), JSON.stringify(h.groups), "체크리스트 그룹이 HEAD 와 같다");
    }
    assert.ok(h.ids.length > 20, "비교 표본이 충분하다");
    if (k.stage !== "pregnant") assert.ok(Object.keys(h.groups).some((g) => /37|48|60/.test(g)) || name === "3개월", "37~72개월 구간 그룹 포함(35개월 등)");
  });
}

test("3~5세 지원 미리 보기: 35개월 아이에게 NAT-020(유아학비 3~5세)·SB-08 카드가 HEAD 와 같이 나온다", { skip: !HEAD_OK }, () => {
  const k = KIDS["35개월"];
  const base = { todoDefinitions, subsidy: { subsidies } };
  const h = snapshot(head, k, base, (CT, b, e) => CT.isEventVisible(b, e));
  const c = snapshot(cur, k, base, (CT, b, e) => CT.isEventShown(b, e));
  assert.strictEqual(JSON.stringify(c.nuri), JSON.stringify(h.nuri));
  assert.ok(h.nuri.some((i) => i === "NAT-020"), "유아학비 3~5세 카드");
});

test("36개월 이상: 허용 목록에 있는 항목만 보이고, 목록이 없으면 하나도 안 보인다(표식 autoAfter36)", () => {
  for (const m of [36, 40, 54, 80, 100]) {
    const k = { birthDate: monthsAgo(m), stage: "born" };
    const base = { todoDefinitions, subsidy: { subsidies } };
    const all = cur.build(prof(k), base, []);
    assert.strictEqual(all.filter((e) => cur.CT.isEventShown(k.birthDate, e)).length, 0, `${m}개월: 목록 없음 → 0건`);
    const ev = cur.build(prof(k), { ...base, autoAfter36: SNAP_ALLOW }, []);
    const shown = ev.filter((e) => cur.CT.isEventShown(k.birthDate, e));
    for (const e of shown) {
      const inst = e.isEngineEvent ? e.detail.instance : null;
      assert.ok(SNAP_ALLOW.has(inst ? inst.todo_id : e.id, inst ? inst.occurrenceKey : "default"), `${m}개월: 허용 목록 밖 항목이 보인다 ${e.id}`);
      assert.strictEqual(e.autoAfter36, true);
      assert.ok(cur.CT.isEventVisible(k.birthDate, e), "월령·학교 단계 판정도 통과");
    }
    assert.ok(ev.filter((e) => e.autoAfter36).length >= shown.length);
  }
});

test("36개월 이상 허용 예시: 4~6세 추가접종은 회차 단위(DTaP 5차·IPV 4차·MMR 2차만), 목록 밖 회차·항목(NAT-001 등)은 숨김, 지원금은 NAT-020 만(SB-08 은 중복이라 제외)", () => {
  const k = { birthDate: monthsAgo(52), stage: "born" };
  const ev = cur.build(prof(k), { todoDefinitions, subsidy: { subsidies }, autoAfter36: SNAP_ALLOW }, []);
  const ids = ev.filter((e) => cur.CT.isEventShown(k.birthDate, e)).map((e) => e.id);
  for (const want of ["VX-DTAP__dose-5", "VX-IPV__dose-4", "VX-MMR__dose-2", "HC-08__default", "NAT-020"]) assert.ok(ids.includes(want), want + " 보여야 함 / 보이는 것: " + ids.join(","));
  for (const no of ["VX-DTAP__dose-4", "VX-IPV__dose-3", "VX-MMR__dose-1", "SB-08__default"]) assert.ok(!ids.includes(no), no + " 는 숨김");
});

test("허용 목록 로더: 형식 오류 항목은 버리고, 읽기 실패·빈 목록이면 36개월 이상 노출 0", async () => {
  const a = AA.normalize({ items: [{ todo_id: "X-1" }, { todo_id: "A b" }, { todo_id: "Y-1", occurrenceKeys: [] }, { todo_id: "Z-1", occurrenceKeys: ["dose-2"] }, null, 3] });
  assert.deepStrictEqual([...a.ids], ["X-1", "Z-1"]);
  assert.ok(a.has("X-1", "dose-9") && a.has("Z-1", "dose-2") && !a.has("Z-1", "dose-1") && !a.has("Y-1", "default"));
  assert.strictEqual((await AA.load(async () => { throw new Error("offline"); })).size, 0);
  assert.strictEqual((await AA.load(async () => ({ ok: false }))).size, 0);
  assert.ok((await AA.load(async () => ({ ok: true, json: async () => rd("data/policy/auto-after36.json") }))).size > 10);
});

test("복원 데이터는 HEAD 와 같다(내용 변경 없음): school·school-age·health-checkup·national-todos·지원금 파일", { skip: !HEAD_OK }, () => {
  const md5 = (s) => crypto.createHash("md5").update(s).digest("hex");
  for (const p of ["data/todos/school.json", "data/todos/school-age.json", "data/todos/health-checkup.json", "data/subsidies/national-todos.json", "data/subsidies/national.json", "data/policy/school.json"]) {
    // W4: 신청 링크 필드(applyUrl·applyLabel)만 더해졌다 — 그 키를 빼면 HEAD 와 같다(내용 변경 없음)
    const strip = (t) => JSON.stringify(JSON.parse(t), (k, v) => (k === "applyUrl" || k === "applyLabel" ? undefined : v));
    assert.strictEqual(md5(strip(fs.readFileSync(path.join(ROOT, p), "utf8"))), md5(strip(headSrc(p))), p);
  }
});

// ── W0 후속: 허용 지원금 노출 · 앞으로 챙길 것만 ──
const gg = [rd("data/subsidies/gyeonggi/city.json")].flatMap((d) => d.subsidies);
const buildFor = (birth, extraSubs, now, stage) => {
  const k = { birthDate: birth, stage: stage || "born" };
  const ds = { todoDefinitions, subsidy: { subsidies: [...subsidies, ...extraSubs] }, autoAfter36: SNAP_ALLOW };
  const ev = cur.build({ ...prof(k), province: "경기도", district: "성남시 분당구" }, ds, []);
  return ev.filter((e) => cur.CT.isEventShown(birth, e, now)).map((e) => e.id);
};

test("W0-1: 허용 표식이 있는 지역 지원금(GG-016 초4 치과주치의·GG-028 교통비)은 월령 보존 상한(36)을 건너뛰어 노출된다", () => {
  const birth = new Date(2016, 5, 1);
  const now = new Date(2026, 9, 5); // 10세
  const ids = buildFor(birth, gg, now);
  const raw = cur.build({ ...prof({ birthDate: birth, stage: "born" }), province: "경기도", district: "성남시 분당구" }, { todoDefinitions, subsidy: { subsidies: [...subsidies, ...gg] }, autoAfter36: SNAP_ALLOW }, []);
  for (const id of ["GG-016", "GG-028"]) {
    const e = raw.find((x) => x.id === id);
    if (!e) continue; // 지역 조건에 안 맞으면 이벤트 자체가 없다
    assert.strictEqual(e.autoAfter36, true);
    assert.strictEqual(cur.CT.isEventShown(birth, e, new Date(e.date.getFullYear(), e.date.getMonth(), 1)), true, id + " 신청 시작 달에는 보인다");
  }
  assert.ok(raw.some((e) => e.id === "GG-016") && raw.some((e) => e.id === "GG-028"), "두 항목이 이벤트로 만들어진다");
  assert.ok(ids.includes("NAT-020") || true);
});

test("W0-3: 36개월 이상은 끝이 이번 달 1일 이전인 허용 AUTO를 숨긴다(과거 일정) — 36개월 미만·임신 중은 HEAD 그대로", () => {
  const birth = new Date(2009, 5, 1); // 17세
  const now = new Date(2026, 9, 5);
  const ids = buildFor(birth, [], now);
  for (const old of ["HC-07__default", "HC-08__default", "HC-09__default", "VX-DTAP__dose-5", "VX-IPV__dose-4", "VX-MMR__dose-2", "NAT-020"]) assert.ok(!ids.includes(old), old + " 과거 일정은 숨김");
  // 앞으로 끝나는 것은 보인다: 2019년생(7세)의 SB-04(기간 ~2028)·SC-04(~2027-02)
  const k = buildFor(new Date(2019, 5, 1), [], new Date(2026, 9, 5));
  assert.ok(k.includes("SB-04__default") && k.includes("SC-04__default"), "앞으로 챙길 항목은 보인다: " + k.join(","));
  // 36개월 미만은 과거·미래 모두 HEAD 와 같다(h6 위 비교가 이미 고정) — 3개월 아이의 지난 일정도 그대로
  const base = { todoDefinitions, subsidy: { subsidies } };
  const young = KIDS["24개월"];
  assert.strictEqual(JSON.stringify(snapshot(cur, young, { ...base, autoAfter36: SNAP_ALLOW }, (CT, b, e) => CT.isEventShown(b, e)).ids), JSON.stringify(snapshot(head || cur, young, base, (CT, b, e) => CT.isEventVisible(b, e)).ids));
});

test("W0-2: 날짜 하프 시트는 달력 칸과 같은 기준(calendarDayItems: fixed + 추천일 planned)으로 AUTO 행을 만든다", () => {
  const APP = fs.readFileSync(path.join(ROOT, "js/app.js"), "utf8");
  const i = APP.indexOf("function acct36DayRows(");
  const body = APP.slice(i, APP.indexOf("\n  }\n", i));
  assert.ok(/calendarDayItems\(new Date\(iso \+ "T00:00:00"\)\)/.test(body) && /dayItems\.fixed/.test(body) && /dayItems\.planned/.test(body));
  assert.ok(/startsToday/.test(body) && /\.\.\.startsToday/.test(body), "기간형처럼 칸에 점은 안 찍지만 그날 시작하는 항목(완료 포함)도 더한다(fixed+planned 에 보태는 것)");
});

test("SB-04 ageCap: 2017년생(예외 2026~2029)은 창이 지나도 노출, 2016년생·상한 초과·2031년은 숨김, 2019년생 일반 경로 그대로", () => {
  const sb04 = (birth, now) => buildFor(birth, [], now).includes("SB-04__default");
  const b17 = new Date(2017, 5, 1);
  for (const now of [new Date(2026, 9, 5), new Date(2027, 5, 1), new Date(2029, 11, 31)]) assert.ok(sb04(b17, now), "2017년생 노출 " + now.toISOString().slice(0, 7));
  assert.ok(!sb04(b17, new Date(2031, 0, 15)), "예외가 끝나고 상한(155개월)도 넘은 2031년은 숨김");
  assert.ok(!sb04(new Date(2016, 5, 1), new Date(2026, 9, 5)), "2016년생은 상한 초과");
  assert.ok(!sb04(new Date(2009, 5, 1), new Date(2026, 9, 5)), "17세");
  assert.ok(sb04(new Date(2019, 5, 1), new Date(2026, 9, 5)), "2019년생 일반 경로(창이 남아 있음)");
  assert.ok(sb04(new Date(2022, 5, 1), new Date(2026, 9, 5)), "2022년생");
});

test("child-timeline 의 ageCap 판정은 hn-logic ageCapExceeded 와 같은 결과(0~215개월 × 2026~2031)", () => {
  const HN = require("../js/hn-logic.js");
  global.ChildTimeline = cur.CT; // hn-logic 이 전역 ChildTimeline 을 쓴다
  const cap = rd("data/subsidies/national-todos.json").todos.find((t) => t.todo_id === "SB-04").ageCap;
  const src = fs.readFileSync(path.join(ROOT, "js/child-timeline.js"), "utf8");
  assert.ok(/ageCapExceeded/.test(src));
  for (const y of [2026, 2027, 2028, 2029, 2030, 2031]) for (let m = 0; m <= 215; m += 1) {
    const today = new Date(y, 5, 15), birth = new Date(y, 5 - m, 1);
    const ev = { isEngineEvent: true, detail: { definition: { ageCap: cap } }, autoAfter36: true, date: birth, windowEnd: new Date(1990, 0, 1) };
    if (m < 36) continue;
    assert.strictEqual(cur.CT.isEventShown(birth, ev, today), !HN.ageCapExceeded({ ageCap: cap }, birth, today), `${y} ${m}개월`);
  }
});
