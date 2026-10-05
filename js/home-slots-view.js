/*
 * home-slots-view — 1-1 홈 슬롯 렌더러(허브형 B 타임라인): curate() 결과 + 머리 줄 정보 → 마크업 문자열.
 * 기준: docs/한눈육아-디자인명세-홈슬롯-B타임라인.md (영역 0~6 순서, §3 날짜 표현, §4 빈 상태·넘침).
 * 순수 함수: DOM·저장소·현재 시각 없음(today 는 인자). 아직 앱에 연결하지 않는다. 슬롯 개수는 curate 결과를 그대로 따르고 여기서 자르지 않는다.
 *
 *   render(cur, o) → html
 *   cur = Curation.curate(...) 결과 { now, soon, know, moreCounts{now,soon,know,benefits}, ... }
 *   o = { today:Date,
 *         head:{ name, ageText, region },
 *         family:[{ title, time, color }] | null,        // 이번 주 · 우리 가족 일정(7일 안)
 *         familyLink:"캘린더 ›" 대상은 data-hs-go="calendar",
 *         benefits:{ count, check, regionPending } | null, // 혜택 한 줄(0이면 숨김). regionPending 이면 "OO구 자체 지원은…"
 *         nextStage:{ head, title, desc } | null,
 *         explore:[{ title, desc, go }] | null,
 *         nextHint:"다음: …" | null,                      // ① 빈 상태 둘째 줄(없으면 ② 첫 항목, 그다음 nextStage 로 만든다)
 *         }  // 'N개 더'를 펼치면 보일 단위는 cur.overflow{now,soon,know}(curate 가 돌려준다 — moreCounts 와 개수 일치)
 * 마감 임박(L1·L2) 날짜색은 CSS 변수 --hn-deadline 하나(css/home-slots.css, 기본 남색 → 사용자 결정(D17) 후 값만 교체).
 */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else root.HomeSlotsView = factory();
})(typeof window !== "undefined" ? window : global, function () {
  "use strict";

  const DAY = 86400000;
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const sod = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const md = (d) => `${d.getMonth() + 1}월 ${d.getDate()}일`;
  const ACT_LABEL = { apply: "신청하기", schedule: "일정 넣기", done: "완료", confirm: "해당돼요" };
  const CONFIRM_NO = "아니에요";
  const lv = (u) => Number(String(u.rule || u.level || "L7").slice(1));
  const CAT = { "예방접종": "접종", "건강검진": "검진", "행정·지원금": "지원" };

  const endDate = (u, today) => (Number.isFinite(u.daysToEnd) && today ? new Date(sod(today).getTime() + u.daysToEnd * DAY) : null);

  /** §3-3 날짜 글자: L1·L2 "D-N · M월 D일까지"(강조색+글자 같이), L3 문구, L4 "M월 D일까지". 색만으로 구분하지 않는다. */
  function dateHtml(u, today) {
    const e = endDate(u, today), r = lv(u);
    if ((r === 1 || r === 2) && e) return `<b class="hs-date hs-date-urgent">D-${u.daysToEnd} · ${md(e)}까지</b>`;
    if (r === 3) return `<b class="hs-date">기한이 지났지만 지금 가능</b>`;
    if (r === 4 && e) return `<b class="hs-date">${md(e)}까지</b>`;
    return "";
  }
  const catOf = (u) => { const it = u.items && u.items[0]; return (it && CAT[it.category]) || ""; };
  const tagsOf = (u) => {
    let h = "";
    if (u.type === "CHECK") h += `<span class="hs-tg-if">해당되면</span>`;
    if (u.items && u.items.some((i) => i && i.assumed)) h += `<span class="hs-tg-chk">확인 필요</span>`;
    return h;
  };

  function actionHtml(u) {
    const k = ACT_LABEL[u.actionKind] ? u.actionKind : "done";
    if (k === "confirm") return `<span class="hs-confirm"><button type="button" class="hs-act" data-hs-act="confirm-yes" data-hs-key="${esc(u.key)}">${ACT_LABEL.confirm}</button><button type="button" class="hs-act hs-act-no" data-hs-act="confirm-no" data-hs-key="${esc(u.key)}">${CONFIRM_NO}</button></span>`; // D14: 항목 단위 '해당돼요/아니에요'(알림 없음, 저장은 연결 단계)
    const url = k === "apply" && u.applyUrl ? ` data-hs-url="${esc(u.applyUrl)}"` : "";
    return `<button type="button" class="hs-act" data-hs-act="${k}" data-hs-key="${esc(u.key)}"${url}>${ACT_LABEL[k]}</button>`;
  }

  function nowRow(u, today) {
    const cat = catOf(u), date = dateHtml(u, today), why = u.reason && u.reason.text ? esc(u.reason.text) : "";
    return `<div class="hs-row" data-hs-key="${esc(u.key)}"><div class="hs-main"><div class="hs-it">${esc(u.title)}${tagsOf(u)}</div>` +
      `<div class="hs-why">${cat ? `<b>${cat}</b> · ` : ""}${date ? date + (why ? " · " : "") : ""}${date && lv(u) <= 3 ? "" : why}</div></div>${actionHtml(u)}</div>`;
  }
  function soonRow(u, today) {
    const e = endDate(u, today), start = u.items && u.items[0] && (u.items[0].entryDate || u.items[0].windowStart);
    const when = u.reason && u.reason.key === "starting_soon" && start instanceof Date ? `${md(start)}부터` : e ? `${md(e)} 마감` : "";
    return `<div class="hs-sr" data-hs-key="${esc(u.key)}"><span class="hs-sit">${esc(u.title)}${u.type === "CHECK" ? `<span class="hs-tg-if">해당되면</span>` : ""}</span>${when ? `<span class="hs-wh">${when}</span>` : ""}${u.actionKind === "confirm" ? actionHtml(u) : ""}</div>`;
  }
  function knowRow(u) {
    const why = u.reason && u.reason.text ? esc(u.reason.text) : "";
    return `<div class="hs-kn" data-hs-key="${esc(u.key)}"><div class="hs-it">${esc(u.title)}</div>${why ? `<div class="hs-why">${why}</div>` : ""}</div>`;
  }

  const moreHtml = (slot, n, label, rowFn, hidden, today) => {
    if (!(n > 0)) return "";
    const list = hidden && hidden[slot] && hidden[slot].length ? hidden[slot].map((u) => rowFn(u, today)).join("") : "";
    return `<details class="hs-fold" data-hs-more="${slot}"><summary class="hs-more">${label} ${n}개 더 ›</summary>${list}</details>`;
  };
  const node = (cls, name, body, extra) => `<section class="hs-node ${cls}"><i class="hs-dot${extra && extra.on ? " on" : ""}"></i><div class="hs-nl">${esc(name)}${extra && extra.link ? extra.link : ""}</div>${body}</section>`;

  function render(cur, o) {
    o = o || {};
    cur = cur || { now: [], soon: [], know: [], moreCounts: {} };
    const today = o.today instanceof Date ? o.today : null, mc = cur.moreCounts || {}, hid = cur.overflow || null;
    const fam = Array.isArray(o.family) ? o.family : [];
    const hasNow = cur.now.length > 0, hasSoon = cur.soon.length > 0 || mc.soon > 0, hasKnow = cur.know.length > 0 || mc.know > 0, benN = o.benefits && o.benefits.count > 0 ? o.benefits : null;
    const parts = [];

    const h = o.head;
    if (h) parts.push(`<div class="hs-head"><b>${esc(h.name)}${h.ageText ? ` · ${esc(h.ageText)}` : ""}</b>${h.region ? `<span>${esc(h.region)}</span>` : ""}</div>`);

    // ① 지금 꼭 할 것 — 항상. 비면 빈 상태(§4), 맨 위 점은 첫 번째로 보이는 마디 하나(①이 비면 가족 일정)
    let first = true;
    const on = () => { const v = first; first = false; return { on: v }; };
    if (hasNow) {
      parts.push(node("hs-s-now", "지금 꼭 할 것",
        `<div class="hs-card hs-now">${cur.now.map((u) => nowRow(u, today)).join("")}${moreHtml("now", mc.now, "지금 꼭 할 것", (u, t) => nowRow(u, t), hid, today)}</div>`, on()));
    } else {
      const next = o.nextHint || (cur.soon[0] ? `다음: ${cur.soon[0].title}` : o.nextStage ? `다음: ${o.nextStage.title}` : "");
      parts.push(node("hs-s-now", "지금 꼭 할 것", `<div class="hs-empty"><b>이번 달 꼭 할 것은 없어요</b>${next ? `<span>${esc(next)}</span>` : ""}</div>`, { on: false }));
      // 빈 ①은 점을 채우지 않고, 다음 마디(가족 일정)가 채운 점을 가진다
    }
    // ② 이번 주 · 우리 가족 일정 — 항상
    const famBody = fam.length
      ? `<div class="hs-card hs-fam">${fam.map((e) => `<div class="hs-ev"><i class="hs-bar" style="background:${esc(e.color || "")}"></i><span class="hs-evt">${esc(e.title)}</span>${e.time ? `<span class="hs-evm">${esc(e.time)}</span>` : ""}</div>`).join("")}</div>`
      : `<div class="hs-card hs-fam"><p class="hs-none">앞으로 7일 안에 등록된 가족 일정이 없어요.</p><button type="button" class="hs-add" data-hs-go="add-schedule">일정 추가하기</button></div>`;
    parts.push(node("hs-s-fam", "이번 주 · 우리 가족 일정", famBody, { on: !hasNow, link: `<button type="button" class="hs-lk" data-hs-go="calendar">캘린더 ›</button>` }));
    // ③ 곧 다가오는 것 — 항목 있을 때만
    if (hasSoon) {
      parts.push(node("hs-s-soon", "곧 다가오는 것",
        `<div class="hs-soon">${cur.soon.map((u) => soonRow(u, today)).join("")}${moreHtml("soon", mc.soon, "곧 다가오는 것", soonRow, hid, today)}</div>`, {}));
    }
    // ④ 이 시기 알아두기(+④-1 혜택 한 줄) — 알아두기 있거나 혜택 줄만 있어도 마디 유지
    if (hasKnow || benN || (o.benefits && o.benefits.regionPending)) {
      let body = "";
      if (hasKnow) body += `<div class="hs-know">${cur.know.map(knowRow).join("")}${moreHtml("know", mc.know, "이 시기 알아두기", knowRow, hid, today)}</div>`;
      if (benN) body += `<button type="button" class="hs-ben" data-hs-go="benefits">받을 수 있는 혜택 ${benN.count}개${benN.check > 0 ? ` · 확인할 것 ${benN.check}개` : ""} ›</button>`;
      else if (o.benefits && o.benefits.regionPending) body += `<p class="hs-ben hs-ben-pending">${esc(o.benefits.regionPending)}</p>`;
      parts.push(node("hs-s-know", "이 시기 알아두기", body, {}));
    }
    // ⑤ 다음 단계 배너 — 마디 점 없음
    if (o.nextStage) parts.push(`<button type="button" class="hs-next" data-hs-go="next-stage"><small>${esc(o.nextStage.head || "다음 단계")}</small><b>${esc(o.nextStage.title)}</b>${o.nextStage.desc ? `<span>${esc(o.nextStage.desc)}</span>` : ""}<i>›</i></button>`);
    // ⑥ 탐색 한 줄
    if (Array.isArray(o.explore) && o.explore.length) parts.push(`<div class="hs-exp">${o.explore.map((x) => `<button type="button" class="hs-xp" data-hs-go="${esc(x.go || "")}"><b>${esc(x.title)}</b>${x.desc ? `<span>${esc(x.desc)}</span>` : ""}</button>`).join("")}</div>`);

    return `<div class="hs-home">${parts.join("")}</div>`;
  }

  return { render, ACT_LABEL };
});
