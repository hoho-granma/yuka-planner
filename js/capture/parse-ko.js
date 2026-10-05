/*
 * parse-ko — 2-1 붙여넣은 문장 → 일정 후보(순수, 서버·AI 없이 기기 안). 앱에는 아직 로드하지 않는다.
 * 근거: docs/한눈육아-디자인명세-붙여넣기확인.md §4 '확인 필요' 규칙(날짜를 임의로 확정하지 않는다, I9).
 *   parse(text, { today:Date, children:[{key,name}] }) → [candidate]
 * candidate = { index, title, eventDate:"YYYY-MM-DD"|"", endDate:""|"YYYY-MM-DD", periodStart/periodEnd 는 쓰지 않는다(기간 문장은 eventDate~endDate),
 *   allDay:boolean, startTime:"HH:MM"|"", endTime:"", childKeys:[], assigneeMemberId:"", repeat:"NONE"|"WEEKLY"|"BIWEEKLY", byDay:["MO".."SU"],
 *   categoryHint:""|"MEDICAL"|"INSTITUTION"|"LESSON", needsCheck:[{field, reason}], notes:[문장], source:원문 조각 }
 * 규칙: 월·일이 있으면 채움(오늘 이전이면 다음 해 + 확인 필요) / 요일·오늘·내일·다음 주만 있으면 오늘 기준 계산 + 항상 확인 필요 + 노트 / 요일과 날짜가 다르면 날짜 빈칸 /
 *       날짜 없음("10월 말"·"다음 달 중")은 빈칸 / 오전·오후 없으면 시각을 그대로(3시 → 03:00) + 확인 필요 / 담당은 절대 채우지 않는다 / 아이는 이름이 등록된 아이와 정확히 같을 때만.
 */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else root.ParseKo = factory();
})(typeof window !== "undefined" ? window : global, function () {
  "use strict";

  const DOW = "일월화수목금토";
  const DOW_KEY = { 월: "MO", 화: "TU", 수: "WE", 목: "TH", 금: "FR", 토: "SA", 일: "SU" };
  const pad = (n) => String(n).padStart(2, "0");
  const iso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
  const mk = (y, m, d) => new Date(y, m - 1, d);
  const isoOf = (dt) => iso(dt.getFullYear(), dt.getMonth() + 1, dt.getDate());
  const sod = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  const validMD = (y, m, d) => { const t = mk(y, m, d); return t.getFullYear() === y && t.getMonth() === m - 1 && t.getDate() === d; };

  // ── 날짜 패턴 ──
  const RE_MD = /(?:(\d{4})\s*년\s*)?(\d{1,2})\s*(?:월\s*(\d{1,2})\s*일|\/\s*(\d{1,2}))(?!\d)/;
  const WD = "[월화수목금토일]";
  const RE_WD_AFTER = new RegExp(`^\\s*[(（]?\\s*(${WD})\\s*(?:요일)?\\s*[)）]?`);
  const RE_REL = new RegExp(`(오늘|내일|모레|(?:다음|이번)\\s*주\\s*(${WD})\\s*요일?|(?:다음|이번)\\s*주(?!\\s*${WD})|(${WD})요일)`);
  const RE_VAGUE = /(?:(\d{1,2})\s*월\s*(초|중|말)|(다음|이번)\s*달\s*(?:초|중|말)?)/;
  const RE_MONTH_FROM = /(\d{1,2})\s*월\s*부터/;
  const RE_REPEAT_DAYS = new RegExp(`(매주\\s*)?(${WD}(?:\\s*[·,/ㆍ・]\\s*${WD})+|${WD}(?=\\s*요일에?\\s*마다))`);
  const RE_WEEKLY1 = new RegExp(`매주\\s*(${WD})(?:요일)?`);
  const RE_BIWEEK = /(격주|2\s*주\s*(?:마다|에\s*한\s*번))/;
  const RE_MONTHLY = /매\s*월/;
  const RE_RANGE_SEP = "\\s*[~∼～\\-–]\\s*";
  const RE_TIME_RANGE = new RegExp(`(오전|오후)?\\s*(\\d{1,2})(?::(\\d{2})|\\s*시(?:\\s*(\\d{1,2})\\s*분|\\s*(반))?)${RE_RANGE_SEP}(오전|오후)?\\s*(\\d{1,2})(?::(\\d{2})|\\s*시(?:\\s*(\\d{1,2})\\s*분|\\s*(반))?)`);
  const RE_TIME = /(오전|오후)?\s*(\d{1,2})(?::(\d{2})|\s*시(?:\s*(\d{1,2})\s*분|\s*(반))?)/;
  const RE_PENDING = /(추후|미정|별도\s*안내|개별\s*시간)/;

  /** 문장 조각 하나의 시각 파싱 → { startTime, endTime, check } (없으면 시각 없음). */
  function parseTimes(frag) {
    let m = RE_TIME_RANGE.exec(frag);
    const conv = (mer, h, mm1, mm2, half) => {
      let H = Number(h); const M = mm1 != null ? Number(mm1) : mm2 != null ? Number(mm2) : half ? 30 : 0;
      if (mer === "오후" && H < 12) H += 12; else if (mer === "오전" && H === 12) H = 0;
      return { hh: H, mm: M, ambiguous: !mer && H <= 12 };
    };
    if (m) {
      const a = conv(m[1], m[2], m[3], m[4], m[5]), b = conv(m[6] || m[1], m[7], m[8], m[9], m[10]);
      if (a.hh > 23 || a.mm > 59 || b.hh > 23 || b.mm > 59) return null;
      return { startTime: `${pad(a.hh)}:${pad(a.mm)}`, endTime: `${pad(b.hh)}:${pad(b.mm)}`, check: (!m[1] && !m[6] && a.ambiguous) || (!m[6] && !m[1] && b.ambiguous) };
    }
    m = RE_TIME.exec(frag);
    if (!m) return null;
    const t = conv(m[1], m[2], m[3], m[4], m[5]);
    if (t.hh > 23 || t.mm > 59) return null;
    // '10/14' 같은 날짜의 일부가 아니라 시각인지: ':'·'시'가 있어야 한다(위 정규식이 보장)
    return { startTime: `${pad(t.hh)}:${pad(t.mm)}`, endTime: "", check: t.ambiguous };
  }

  /** 월·일 → 날짜(연도는 오늘 이후 가장 가까운 해). 반환 { date:Date|null, yearBumped } */
  function resolveMD(y, m, d, today) {
    if (y) return validMD(y, m, d) ? { date: mk(y, m, d), yearBumped: false } : { date: null, yearBumped: false };
    const ty = today.getFullYear();
    if (!validMD(ty, m, d)) { // 2/29 등
      return validMD(ty + 1, m, d) ? { date: mk(ty + 1, m, d), yearBumped: true } : { date: null, yearBumped: false };
    }
    const c = mk(ty, m, d);
    return c < sod(today) ? (validMD(ty + 1, m, d) ? { date: mk(ty + 1, m, d), yearBumped: true } : { date: null, yearBumped: false }) : { date: c, yearBumped: false };
  }
  /** 요일(0=일)로 기준일 이후 첫 날(기준일 다음 날부터). */
  const nextDow = (today, dow) => { let d = addDays(sod(today), 1); while (d.getDay() !== dow) d = addDays(d, 1); return d; };

  // ── 조각 나누기 ──
  const ANCHOR = new RegExp(`${RE_MD.source}|${RE_VAGUE.source}|(?:오늘|내일|모레)`, "g");
  function splitPieces(text) {
    const pieces = [];
    for (const line of String(text || "").split(/\r?\n|(?<=[.。;!?])\s+/)) {
      const t = line.trim();
      if (t) pieces.push(t);
    }
    const out = [];
    for (let p of pieces) {
      p = p.replace(/^[^:：]{0,20}[:：]\s+(?=\S)/, (h) => (RE_MD.test(h) || RE_VAGUE.test(h) ? h : "")); // 머리말("10월 운영 안내:")은 버린다
      // 쉼표·가운뎃점 뒤에 새 날짜가 오면 나눈다 / 같은 조각에 날짜가 둘 이상이면(범위 제외) 두 번째부터 나눈다
      const idx = [];
      ANCHOR.lastIndex = 0;
      let m;
      while ((m = ANCHOR.exec(p))) {
        const before = p.slice(0, m.index);
        if (/[~∼～\-–]\s*$/.test(before)) continue; // 범위의 끝
        idx.push(m.index);
      }
      if (idx.length < 2) { out.push(p); continue; }
      let start = 0;
      for (let i = 1; i < idx.length; i++) { out.push(p.slice(start, idx[i]).replace(/[,，、]\s*$/, "").trim()); start = idx[i]; }
      out.push(p.slice(start).trim());
    }
    return out.filter(Boolean);
  }

  const CATEGORY_HINTS = [["MEDICAL", /(치과|병원|의원|검진|접종|예약진료|진료|한의원|소아과)/], ["INSTITUTION", /(유치원|어린이집|학교|소풍|학부모|상담|운영|행사|입학|졸업)/], ["LESSON", /(학원|수업|레슨|과외|영어|수학|피아노|태권도|발레|수영)/]];
  const ENDINGS = /(?:되었습니다|되었어요|됩니다|입니다|예정입니다|드립니다|하세요|해주세요|바랍니다)\.?$/;

  function parseFragment(frag, ctx, index) {
    const { today, children } = ctx;
    const check = [], notes = [];
    let rest = frag;
    const cand = { index, title: "", eventDate: "", endDate: "", allDay: true, startTime: "", endTime: "", childKeys: [], assigneeMemberId: "", repeat: "NONE", byDay: [], categoryHint: "", needsCheck: check, notes, source: frag };

    // 반복
    let byDay = [];
    const rd = RE_REPEAT_DAYS.exec(rest);
    if (rd) { byDay = [...rd[2].matchAll(new RegExp(WD, "g"))].map((x) => DOW_KEY[x[0]]); rest = rest.replace(rd[0], " "); }
    else { const w1 = RE_WEEKLY1.exec(rest); if (w1) { byDay = [DOW_KEY[w1[1]]]; rest = rest.replace(w1[0], " "); } }
    const bi = RE_BIWEEK.exec(rest);
    if (bi) rest = rest.replace(bi[0], " ");
    if (RE_MONTHLY.test(rest)) { check.push({ field: "repeat", reason: "매월 반복은 아직 지원하지 않아요" }); rest = rest.replace(RE_MONTHLY, " "); }
    if (bi && !byDay.length) { const w = new RegExp(`(${WD})(?:요일)?(?![가-힣])`).exec(rest); if (w) { byDay = [DOW_KEY[w[1]]]; rest = rest.replace(w[0], " "); } } // '격주 월' 처럼 요일 하나
    if (byDay.length) { cand.repeat = bi ? "BIWEEKLY" : "WEEKLY"; cand.byDay = byDay; }
    else if (bi) { cand.repeat = "BIWEEKLY"; check.push({ field: "repeat", reason: "요일을 확인해 주세요" }); }

    // 시각
    const tm = parseTimes(rest);
    if (tm) {
      cand.allDay = false; cand.startTime = tm.startTime; cand.endTime = tm.endTime;
      if (tm.check) check.push({ field: "time", reason: "오전/오후를 확인해 주세요" });
      rest = rest.replace(RE_TIME_RANGE.test(rest) ? RE_TIME_RANGE : RE_TIME, " ");
    }
    if (RE_PENDING.test(frag)) check.push({ field: "time", reason: "시간은 추후 안내예요(원문 확인)" });

    // 날짜
    const monthFrom = RE_MONTH_FROM.exec(rest);
    const md = RE_MD.exec(rest);
    const vague = !md && RE_VAGUE.exec(rest);
    const rel = !md && !vague && RE_REL.exec(rest);
    if (md) {
      const y = md[1] ? Number(md[1]) : 0, m = Number(md[2]), d = Number(md[3] != null ? md[3] : md[4]);
      let after = rest.slice(md.index + md[0].length);
      const wd = RE_WD_AFTER.exec(after);
      const r1 = resolveMD(y, m, d, today);
      let end = null;
      const er = new RegExp(`^${RE_WD_AFTER.source.slice(1)}${RE_RANGE_SEP}(?:(\\d{1,2})\\s*(?:월\\s*(\\d{1,2})\\s*일|/\\s*(\\d{1,2}))|(\\d{1,2})\\s*일)`).exec(after);
      if (r1.date) {
        if (wd && DOW.indexOf(wd[1]) !== r1.date.getDay()) { check.push({ field: "date", reason: "요일과 날짜가 달라요" }); }
        else {
          cand.eventDate = isoOf(r1.date);
          if (r1.yearBumped) check.push({ field: "date", reason: "연도를 넘겼어요(내년으로 계산)" });
        }
        if (wd) after = after.slice(wd[0].length);
        const rg = new RegExp(`^${RE_RANGE_SEP.slice(0)}(?:(\\d{1,2})\\s*(?:월\\s*(\\d{1,2})\\s*일|/\\s*(\\d{1,2}))|(\\d{1,2})\\s*일)`).exec(after);
        if (rg && cand.eventDate) {
          const em = rg[1] ? Number(rg[1]) : r1.date.getMonth() + 1, ed = Number(rg[2] || rg[3] || rg[4]);
          const ey = em < r1.date.getMonth() + 1 ? r1.date.getFullYear() + 1 : r1.date.getFullYear();
          if (validMD(ey, em, ed) && mk(ey, em, ed) >= r1.date) { cand.endDate = iso(ey, em, ed); rest = rest.replace(rg[0], " "); }
        }
      } else check.push({ field: "date", reason: "날짜를 확인해 주세요" });
      rest = rest.slice(0, md.index) + " " + rest.slice(md.index + md[0].length + (wd ? wd[0].length : 0));
    } else if (vague) {
      check.push({ field: "date", reason: `'${vague[0].trim()}'은 날짜가 아니에요` });
      rest = rest.replace(vague[0], " ");
    } else if (rel) {
      let d = null;
      const t0 = sod(today);
      if (rel[1] === "오늘") d = t0; else if (rel[1] === "내일") d = addDays(t0, 1); else if (rel[1] === "모레") d = addDays(t0, 2);
      else {
        const wdKey = rel[2] || rel[3], isNext = /다음/.test(rel[1]), isThis = /이번/.test(rel[1]);
        if (wdKey) {
          const dow = DOW.indexOf(wdKey);
          if (isNext || isThis) { const monday = addDays(t0, -((t0.getDay() + 6) % 7)); d = addDays(monday, ((dow + 6) % 7) + (isNext ? 7 : 0)); }
          else d = nextDow(t0, dow);
        }
      }
      if (d && /이번/.test(rel[1]) && d < t0) { d = null; check.push({ field: "date", reason: "이번 주 날짜가 이미 지났어요" }); } // 지난 요일을 '이번 주'로 채우지 않는다
      if (d) { cand.eventDate = isoOf(d); check.push({ field: "date", reason: "오늘(" + (today.getMonth() + 1) + "/" + today.getDate() + ") 기준으로 계산했어요" }); notes.push(`오늘(${today.getMonth() + 1}/${today.getDate()}) 기준 계산`); }
      else check.push({ field: "date", reason: "날짜를 확인해 주세요" });
      rest = rest.replace(rel[0], " ");
    } else if (cand.repeat !== "NONE" && monthFrom) {
      // 'N월부터' + 요일 반복 → 그 달에 처음 오는 해당 요일(시작일 계산 — 항상 확인)
      const m = Number(monthFrom[1]);
      const ty = today.getFullYear();
      let y = ty; if (mk(y, m, 28) < sod(today)) y += 1;
      let dt = mk(y, m, 1);
      while (!cand.byDay.includes(Object.values(DOW_KEY)[(dt.getDay() + 6) % 7]) && dt.getMonth() === m - 1) dt = addDays(dt, 1);
      if (dt.getMonth() === m - 1) { cand.eventDate = isoOf(dt); check.push({ field: "date", reason: "시작일은 계산한 값이에요(첫 해당 요일)" }); notes.push(`${m}월 첫 해당 요일로 계산`); }
    }
    if (monthFrom) rest = rest.replace(monthFrom[0], " ");
    if (!cand.eventDate && !check.some((c) => c.field === "date")) check.push({ field: "date", reason: "날짜를 확인해 주세요" });
    if (cand.repeat !== "NONE" && !cand.eventDate && !check.some((c) => c.field === "date")) check.push({ field: "date", reason: "시작일을 확인해 주세요" });

    // 아이: 이름이 문장에 있고 등록된 아이와 정확히 같을 때만
    const found = (children || []).filter((c) => c && c.name && new RegExp(`(^|[^가-힣])${String(c.name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![가-힣]*[가-힣]{2})`).test(frag));
    if (found.length === 1) cand.childKeys = [found[0].key];
    else if ((children || []).length >= 2) check.push({ field: "child", reason: "어느 아이 일정인지 확인해 주세요" });

    // 분류 힌트(제안만 — 사용자가 확인)와 제목
    for (const [k, re] of CATEGORY_HINTS) if (re.test(frag)) { cand.categoryHint = k; break; }
    let title = rest.replace(/[\[\]【】]/g, " ").replace(/\s*님(?=\s|$)/g, " ").replace(ENDINGS, " ").replace(/[,，、:：]+\s*$/g, " ").replace(/[()（）]\s*[)）]/g, "").replace(/\s+/g, " ").trim();
    title = title.replace(/^[,，、\s·~\-–]+|[,，、\s·~\-–]+$/g, "").trim().replace(/^(?:에는|에서|에|부터|까지)\s+/, "");
    cand.title = title.slice(0, 100);
    if (!cand.title) check.push({ field: "title", reason: "제목을 확인해 주세요" });
    return cand;
  }

  // ── 음성 받아쓰기 보정(2-2): 한글 숫자("시월 십사일", "세 시")를 숫자로. 못 읽는 건 그대로 둬 해석 단계가 '확인 필요'로 처리한다 ──
  const SINO = { 영: 0, 공: 0, 일: 1, 이: 2, 삼: 3, 사: 4, 오: 5, 육: 6, 칠: 7, 팔: 8, 구: 9 };
  const NATIVE_H = { 한: 1, 두: 2, 세: 3, 네: 4, 다섯: 5, 여섯: 6, 일곱: 7, 여덟: 8, 아홉: 9, 열: 10, 열한: 11, 열두: 12 };
  function sinoNum(w) { // 일~삼십일 정도(십·이십·삼십 + 일의 자리)
    if (!w) return null;
    const m = /^(?:(이|삼)?십)?([일이삼사오육칠팔구])?$/.exec(w);
    if (!m || (!m[0].includes("십") && !m[2])) return null;
    const tens = m[0].includes("십") ? (m[1] ? SINO[m[1]] : 1) : 0;
    return tens * 10 + (m[2] ? SINO[m[2]] : 0);
  }
  function normalizeSpoken(text) {
    let t = String(text || "");
    t = t.replace(/(시|십일|십이|십|[일이삼사오육칠팔구])월/g, (m, w) => (w === "시" ? "10" : w === "십일" ? "11" : w === "십이" ? "12" : w === "십" ? "10" : String(SINO[w])) + "월");
    t = t.replace(/(유)월/g, "6월");
    t = t.replace(/((?:이|삼)?십[일이삼사오육칠팔구]?|[일이삼사오육칠팔구])\s*일(?![가-힣]*요)/g, (m, w) => { const n = sinoNum(w); return n && n >= 1 && n <= 31 ? `${n}일` : m; });
    t = t.replace(/(열한|열두|다섯|여섯|일곱|여덟|아홉|한|두|세|네|열)\s*시/g, (m, w) => (NATIVE_H[w] ? `${NATIVE_H[w]}시` : m));
    return t;
  }

  function parse(text, opts) {
    const o = opts || {};
    if (!(o.today instanceof Date) || isNaN(o.today.getTime())) return [];
    if (o.spoken === true) text = normalizeSpoken(text); // 음성 받아쓰기 글자(한글 숫자 보정)
    const ctx = { today: o.today, children: Array.isArray(o.children) ? o.children : [] };
    const out = [];
    for (const piece of splitPieces(text)) {
      const hasInfo = RE_MD.test(piece) || RE_VAGUE.test(piece) || RE_REL.test(piece) || RE_TIME.test(piece) || RE_REPEAT_DAYS.test(piece) || RE_WEEKLY1.test(piece) || RE_BIWEEK.test(piece) || RE_MONTHLY.test(piece);
      if (!hasInfo) continue; // 날짜·시각·요일 단서가 하나도 없는 문장은 일정이 아니다
      out.push(parseFragment(piece, ctx, out.length));
    }
    return out;
  }

  return { parse, parseTimes, resolveMD, normalizeSpoken };
});
