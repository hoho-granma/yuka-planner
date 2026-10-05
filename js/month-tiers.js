/*
 * month-tiers — 1-3 월령 탭 + 1-5 달력 두 층의 순수 도우미. 앱에는 아직 연결하지 않는다(연결 줄은 docs/agents/dev-note-1-3-5.md '커밋 뒤 패치').
 * 명세 docs/한눈육아-디자인명세-월령탭-달력두층.md. 분류 기준은 정책(curation.json)의 actionType 하나 — 미분류 id 는 ACT 로 폴백(지금 동작 유지).
 *   1층 = 날짜가 있는 행동형(ACT·CHECK): 할 것 / 곧 준비 — 달력 칸과 목록 위쪽 / 2층 = 정보·관찰형(KNOW): 관찰·해볼 것·주의 — 칸에는 나오지 않고 접힘 안에만.
 * 지원금(행정·지원금)은 지금처럼 별도 경로라 이 분류를 적용하지 않는다. 숫자(남은 개수)에는 KNOW 를 넣지 않는다(D10).
 */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory(require("./curation.js"));
  else root.MonthTiers = factory(root.Curation);
})(typeof window !== "undefined" ? window : global, function (Curation) {
  "use strict";

  const MSG = Object.freeze({
    layer1: "이번 달 챙길 것", doIt: "할 것", soon: "곧 준비", know: (n) => `이 시기 알아두기 ${n}개 ›`, observe: "관찰", tryIt: "해볼 것", caution: "주의",
    deadlinePrefix: "마감 ",     remaining: (n) => `남은 ${n}개`, calendarHead: (n) => (n > 0 ? `이번 달 챙길 것 · 남은 ${n}개` : "이번 달 챙길 것"), ack: "확인했어요", acked: (n) => `확인한 것 ${n}개`,
    laterGroups: (n) => `나중 시기 ${n}개 그룹 보기 ›`, from: (md) => `${md}부터`, emptyMonth: "이 달에 새로 챙길 항목은 없어요", milestoneNew: "이번 달 새로 시작하는 관찰 항목이에요",
  });
  const SUBSIDY = "행정·지원금";
  const KNOW_GROUP = { OBSERVE: "observe", MILESTONE: "observe", TRY: "tryIt", INFO: "tryIt", INFO_BENEFIT: "tryIt", CAUTION: "caution" };
  const sod = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const md = (d) => `${d.getMonth() + 1}월 ${d.getDate()}일`;

  /** 층·구분 하나: { layer:1|2, group:"do"|"soon"|"observe"|"tryIt"|"caution", type, sub }. 정책이 없으면(null) 모두 1층(지금 동작 유지). */
  function classify(e, ctx) {
    const o = ctx || {};
    if (!o.policy || !Curation || e.category === SUBSIDY) return { layer: 1, group: "do", type: "ACT", sub: "" };
    const c = Curation.classify(e, o.policy);
    if (c.type === "KNOW") return { layer: 2, group: KNOW_GROUP[c.sub] || "tryIt", type: "KNOW", sub: c.sub || "" };
    const start = o.startOf ? o.startOf(e) : null;
    const upcoming = (e.engineStatus === "UPCOMING" || e.engineStatus === "SCHEDULED") && start && o.today && sod(start) > sod(o.today);
    return { layer: 1, group: upcoming ? "soon" : "do", type: c.type, sub: c.sub || "" };
  }
  /** 달력 칸에 올릴지(inCalendar 술어용): 1층만. 정책이 없으면 전부(현재 동작). */
  const inCalendarOf = (ctx) => (e) => classify(e, ctx).layer === 1;

  /** '왜 지금' 한 줄 — curate 의 판정·문장표를 재사용(새 사실을 만들지 않는다). 이번 달 새로 시작하는 KNOW 는 전용 문장. */
  function whyOf(e, ctx) {
    const o = ctx || {};
    if (!o.policy || !Curation || !o.today) return "";
    const d = Curation.describe(e, o.state || {}, o.policy, o.today);
    const def = e.detail && e.detail.definition;
    if (d.type === "KNOW" && def && typeof def.displayMonth === "number" && def.displayMonth === o.ageMonths) return MSG.milestoneNew;
    return d.text;
  }

  /**
   * 한 월령 그룹의 구성. events = 그 그룹 항목들, ctx = { policy, today, state, ageMonths, startOf(e), isDone(id), isAcked(id) }.
   * 반환 { doList, soonList, know:{observe, tryIt, caution}, ackedList, knowCount, remaining, empty }. 항목은 { e, why, done?, from? }.
   */
  function group(events, ctx) {
    const o = ctx || {};
    const out = { doList: [], soonList: [], know: { observe: [], tryIt: [], caution: [] }, ackedList: [], knowCount: 0, remaining: 0, empty: false };
    for (const e of events || []) {
      const c = classify(e, o);
      const it = { e, why: whyOf(e, o) };
      if (c.layer === 1) {
        it.done = !!(o.isDone && o.isDone(e.id));
        if (c.group === "soon") { const st = o.startOf ? o.startOf(e) : null; it.from = st ? MSG.from(md(st)) : ""; out.soonList.push(it); }
        else out.doList.push(it);
        if (!it.done) out.remaining++; // 1층 미완료만(D10) — 2층은 세지 않는다
      } else if (c.group === "caution" && o.isAcked && o.isAcked(e.id)) out.ackedList.push(it); // 확인한 것은 그 구간 동안 '확인한 것 N개' 접힘으로
      else { out.know[c.group].push(it); out.knowCount++; }
    }
    out.empty = !out.doList.length && !out.soonList.length && !out.knowCount && !out.ackedList.length;
    return out;
  }

  /** 월령 그룹 접기: 지금 그룹은 열림, 지난 그룹은 접힘(그대로), 지금 다음 1개 그룹은 접힘으로 보이고 그 뒤는 '나중 시기 N개 그룹'으로 묶는다. keys 는 시기순. */
  function groupFold(keys, nowKey, extra) {
    const ks = Array.isArray(keys) ? keys : [], i = ks.indexOf(nowKey);
    const keep = new Set(extra || []); // '그때그때 확인해요'·'학교·입학' 같은 특수 그룹은 지금 위치 그대로
    if (i < 0) return { visible: ks.slice(), later: [] };
    const after = ks.slice(i + 1).filter((k) => !keep.has(k));
    const next = after.slice(0, 1), later = after.slice(1);
    const hide = new Set(later);
    return { visible: ks.filter((k) => !hide.has(k)), later, next };
  }

  /** 달력 위 '이번 달 챙길 것' 카드: 1층만 + 머리 문구, 2층은 접힘 개수. events = 그 달 항목들. */
  function calendarCard(events, ctx) {
    const g = group(events, ctx);
    return { head: MSG.calendarHead(g.remaining), list: g.doList.concat(g.soonList), knowCount: g.knowCount, knowLabel: g.knowCount ? MSG.know(g.knowCount) : "", know: g.know, remaining: g.remaining };
  }

  /**
   * 1-5b 마감형 신청의 달력 칸 날짜(표시 층 전용): 신청 기한(마감)이 있는 지원금·제도만 그 마감일 칸으로 옮겨 보인다.
   * 엔진 fixedDate(신청 시작일)는 바꾸지 않는다 — 이 함수는 날짜만 돌려주고, 호출부가 표시용 복사본을 만든다.
   * 제외: 마감 미확인(unconfirmed)·상시(ongoing)·나이 상한(age_window / 엔진 AGE_WINDOW — '받을 수 있는 나이의 끝'이지 신청 기한이 아님)·fixed 가 아닌 항목.
   */
  function deadlineDayOf(e, HN) {
    if (!e || e.scheduleKind !== "fixed" || e.category !== "행정·지원금") return null;
    const d = e.detail || {}, def = d.definition || {};
    if (d.deadlineType === "unconfirmed" || d.deadlineType === "ongoing" || d.deadlineType === "age_window" || def.triggerType === "AGE_WINDOW") return null;
    const end = HN && typeof HN.subsidyDeadline === "function" ? HN.subsidyDeadline(e) : e.deadlineDate;
    return end instanceof Date && !isNaN(end.getTime()) ? end : null;
  }
  const sodD = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  /** 표시용 복사본 { ...e, fixedDate: 마감일, title: "마감 …", calDeadline: true, calUrgent: 임박(오늘~deadlineSoonDays일 안이면 true), calDays }. 대상이 아니면 e 그대로. */
  function deadlineView(e, ctx) {
    const c = ctx || {}, end = deadlineDayOf(e, c.HN);
    if (!end) return e;
    const today = c.today instanceof Date ? sodD(c.today) : null;
    const days = today ? Math.round((sodD(end) - today) / 86400000) : null;
    const soon = c.soonDays != null ? c.soonDays : 30;
    return { ...e, fixedDate: end, title: `${MSG.deadlinePrefix}${e.title}`, calDeadline: true, calDays: days, calUrgent: days != null && days >= 0 && days <= soon };
  }

  return { classify, inCalendarOf, whyOf, group, groupFold, calendarCard, deadlineDayOf, deadlineView, MSG };
});
