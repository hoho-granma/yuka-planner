/*
 * edu-3to5-view — 3~5세 교육 탭 블록 렌더러(순수). 앱에는 아직 로드하지 않는다. 명세 docs/한눈육아-디자인명세-교육탭-3~5세.md.
 * 기존 교육 탭 클래스(.a36t-*)를 그대로 쓰고 새 색·카드 모양은 없다. 숫자·평균·비율은 하나도 그리지 않는다(D9). 또래 범위·지역 트렌드·'다음에 확인할 것'은 3~5세 분기에서 렌더하지 않는다(삭제 아님).
 *   render(st) → html
 * st = { region, ageLabel("N세", 세는 나이), decide:[{id,title,why}], support:[{id,title,why,applyUrl,officialUrl}], supportRegionPending:bool,
 *        find:{ links:[{key,name,url}] } | null, mine:{count,lessons:[{title,weekly}]}, canAdd, nextSchool:bool(만 5세), privacy(문장) }
 * B1 올해 정할 것(항목 없으면 숨김) → B2 받을 수 있는 지원(없으면 숨김) → B3 기관 찾기(공식 링크가 확인돼 넘어온 것만, 없으면 숨김) → B4 학원·체험(항상) → B5 현재 상태 → 개인정보 안내.
 */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory(require("./over36-view.js"));
  else root.Edu3to5View = factory(root.Over36View);
})(typeof window !== "undefined" ? window : global, function (Over36) {
  "use strict";

  const esc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const T = (Over36 && Over36.TREND) || {};
  const MSG = Object.freeze({
    lead: "어린이집·유치원·학원, 지금 무엇을 정하면 될까?", title: (region, age) => `${region ? region + " " : ""}${age ? age + " " : ""}교육 정보`,
    decideTitle: "올해 정할 것", plan: "일정 넣기", supportTitle: "받을 수 있는 교육·보육 지원", ifUse: "유치원·어린이집을 이용하면", apply: "신청하기", official: "공식 안내 보기",
    regionPending: (r) => `${r || "우리 동네"} 자체 지원은 아직 확인 중이에요`, findTitle: "우리 동네 기관 찾기", base: (r) => `${r} 기준`, openSite: "공식 사이트 열기", visitPlan: "상담·방문 일정 넣기",
    lessonTitle: "학원·체험", lessonAdd: "학원·체험 일정 넣기", lessonNote: "학원 일정을 넣으면 아래 '우리 아이 현재 상태'에 모여요.", nextSchool: "내년에는 초등 입학 준비가 시작돼요 ›",
    mineTitle: T.mineTitle || "우리 아이 현재 상태", mineNone: T.mineNone || "아직 등록한 학원 일정이 없어요.", weekly: (n) => `주 ${n}회`, noRepeat: "반복 없음",
    ifPlan: "유치원 보낼 계획이면", regionSet: "지역 설정하기",
  });
  // 상담·방문 일정의 미리 채울 제목(날짜는 비워 둔다)
  const VISIT_TITLE = { kindergarten: "유치원 상담", daycare: "어린이집 방문" };

  const row = (inner) => `<div class="a36t-row">${inner}</div>`;
  const btn = (attrs, label, ghost) => `<button type="button" class="${ghost ? "a36t-ghost" : "a36t-btn"}" ${attrs}>${esc(label)}</button>`;

  function render(st) {
    const s = st || {};
    const parts = [];
    parts.push(`<div class="a36t-head"><h2>${esc(MSG.title(s.region, s.ageLabel))}</h2><p>${esc(MSG.lead)}</p></div>`);
    if (!s.region) parts.push(`<section class="a36t-card a36t-region" data-a36t="region"><p class="a36t-note">${esc(T.noRegionNote || "")}</p>${btn('data-a36="trend-region"', MSG.regionSet)}</section>`);

    const decide = (s.decide || []).filter((d) => d && d.title);
    if (decide.length || s.nextSchool) { // B1
      parts.push(`<section class="a36t-card" data-a36t="decide"><h3>${esc(MSG.decideTitle)}</h3>${decide.map((d) => row(`<div><b>${esc(d.title)}</b>${d.confirm ? `<small class="a36t-nc">${esc(MSG.ifPlan)}</small>` : ""}${d.why ? `<p class="a36t-note">${esc(d.why)}</p>` : ""}</div>${btn(`data-a36="edu-plan" data-edu-id="${esc(d.id)}"`, MSG.plan)}`)).join("")}${s.nextSchool ? `<button type="button" class="a36t-note a36t-link" data-a36="edu-school">${esc(MSG.nextSchool)}</button>` : ""}</section>`);
    }
    const support = (s.support || []).filter((d) => d && d.title);
    if (support.length) { // B2
      parts.push(`<section class="a36t-card" data-a36t="support"><h3>${esc(MSG.supportTitle)}</h3>${support.map((d) => row(`<div><b>${esc(d.title)}</b><small class="a36t-nc">${esc(MSG.ifUse)}</small>${d.why ? `<p class="a36t-note">${esc(d.why)}</p>` : ""}</div>${d.applyUrl ? btn(`data-a36="edu-open" data-url="${esc(d.applyUrl)}"`, MSG.apply) : d.officialUrl ? btn(`data-a36="edu-open" data-url="${esc(d.officialUrl)}"`, MSG.official) : ""}`)).join("")}${s.supportRegionPending ? `<p class="a36t-note">${esc(MSG.regionPending(s.region))}</p>` : ""}</section>`);
    }
    const links = s.find && Array.isArray(s.find.links) ? s.find.links.filter((l) => l && l.name && /^https?:\/\//.test(l.url || "")) : [];
    if (links.length && s.region) { // B3 — 공식 링크가 확인돼 넘어온 것만(확인 전에는 블록 숨김). 기관 목록은 만들지 않는다
      parts.push(`<section class="a36t-card" data-a36t="find"><h3>${esc(MSG.findTitle)} <small>${esc(MSG.base(s.region))}</small></h3>${links.map((l) => row(`<b>${esc(l.name)}</b>${btn(`data-a36="edu-open" data-url="${esc(l.url)}"`, MSG.openSite)}${btn(`data-a36="edu-visit" data-edu-title="${esc(VISIT_TITLE[l.key] || "")}"`, MSG.visitPlan, true)}`)).join("")}</section>`);
    }
    // B4 항상
    parts.push(`<section class="a36t-card" data-a36t="lesson"><h3>${esc(MSG.lessonTitle)}</h3>${s.canAdd === false ? "" : btn('data-a36="trend-add"', MSG.lessonAdd)}<p class="a36t-note">${esc(MSG.lessonNote)}</p></section>`);
    // B5
    const mine = s.mine || { count: 0, lessons: [] };
    const lessons = mine.lessons && mine.lessons.length ? `<ul class="a36t-lessons">${mine.lessons.map((l) => `<li><b>${esc(l.title)}</b><small>${esc(l.weekly ? MSG.weekly(l.weekly) : MSG.noRepeat)}</small></li>`).join("")}</ul>` : `<p class="a36t-note">${esc(MSG.mineNone)}</p>`;
    parts.push(`<section class="a36t-card" data-a36t="mine"><h3>${esc(MSG.mineTitle)}</h3>${lessons}</section>`);
    parts.push(`<p class="a36t-privacy">${esc(s.privacy || T.privacy || "")}</p>`);
    return `<div class="a36t a36t-3to5" id="a36-trend">${parts.join("")}</div>`;
  }

  return { render, MSG, VISIT_TITLE };
});
