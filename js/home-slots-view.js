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
  /** 날짜 표기(hn_pm 결정): 올해 안·6개월 이내는 M월 D일, 해가 넘어가거나 6개월을 넘으면 연도를 붙인다. today 없으면 연도 없이. */
  const dmd = (d, today) => (today && (d.getFullYear() !== today.getFullYear() || d.getTime() - today.getTime() > 183 * DAY) ? `${d.getFullYear()}년 ` : "") + md(d);
  /** 항목 끝날짜의 종류(hn_pm 마감 표기 기준 #1): "deadline" 신청 기한(지원금·제도) · "age" 나이 상한(받을 수 있는 나이의 끝) · "period" 접종·검진·방문 권고 기간. '마감'은 deadline 에만 쓴다. */
  const APPLY_DEADLINE_IDS = ["SC-03"];
  const endKind = (u) => {
    const it = u.items && u.items[0];
    if (it && APPLY_DEADLINE_IDS.includes(String(it.id || "").split("__")[0])) return "deadline"; // 지원금이 아니어도 신청 기한이 있는 항목(06 §6: SC-03 입학연기 신청 10/1~12/31) — '마감'
    if (!it || it.category !== "행정·지원금") return "period";
    const d = it.detail || {}, def = d.definition || {};
    return d.deadlineType === "age_window" || def.triggerType === "AGE_WINDOW" ? "age" : "deadline";
  };
  const isPast = (u) => Number.isFinite(u.daysToEnd) && u.daysToEnd < 0;
  const PAST_OK = "기한이 지났지만 지금도 할 수 있어요";
  /** 끝 날짜 문구: 신청 기한 → "{날짜} 마감"(suffix) · 접종·검진·방문 기간 → "{날짜}까지" · 나이 상한 → "○○년 ○월까지 받을 수 있어요". 이미 지난 날짜는 빈 문자열(날짜를 보이지 않는다 — 호출부가 이유 문장을 쓴다). */
  function endText(u, e, today, suffix) {
    if (isPast(u)) return "";
    const k = endKind(u);
    if (k === "age") return `${e.getFullYear()}년 ${e.getMonth() + 1}월까지 받을 수 있어요`;
    return k === "period" ? `${dmd(e, today)}까지` : `${dmd(e, today)}${suffix}`;
  }
  const ACT_LABEL = { apply: "신청하기", schedule: "일정 넣기", done: "완료", confirm: "해당돼요", review: "기록 확인" };
  const CONFIRM_NO = "아니에요";
  const lv = (u) => Number(String(u.rule || u.level || "L7").slice(1));
  const CAT = { "예방접종": "접종", "건강검진": "검진", "행정·지원금": "지원" };

  const endDate = (u, today) => (Number.isFinite(u.daysToEnd) && today ? new Date(sod(today).getTime() + u.daysToEnd * DAY) : null);

  /** §3-3 날짜 글자: L1·L2 "D-N · M월 D일까지"(강조색+글자 같이), L3 문구, L4 "M월 D일까지". 색만으로 구분하지 않는다. */
  function dateHtml(u, today) {
    const e = endDate(u, today), r = lv(u);
    if ((r === 1 || r === 2) && e && !isPast(u)) return `<b class="hs-date hs-date-urgent">D-${u.daysToEnd} · ${endText(u, e, today, "까지")}</b>`;
    if (r === 3) return `<b class="hs-date">기한이 지났지만 지금 가능</b>`;
    if (r === 4 && e && !isPast(u)) return `<b class="hs-date">${endText(u, e, today, "까지")}</b>`;
    if ((r === 1 || r === 2 || r === 4) && e && isPast(u) && endKind(u) !== "age") return `<b class="hs-date">${PAST_OK}</b>`; // 지난 날짜는 숨기고 이유 문장만
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
  /** 빈 상태 '다음' 줄의 월(명세 §4 ①: "다음: 12월 취학통지서 확인"): 시작일이 있으면 시작 월, 없으면 끝나는 달, 둘 다 없으면 빈 문자열. */
  function monthOf(u, today) {
    const it = u.items && u.items[0], start = it && (it.entryDate || it.windowStart);
    const d = start instanceof Date ? start : endDate(u, today);
    return d instanceof Date && !isNaN(d.getTime()) && (!today || sod(d) >= sod(today)) ? `${d.getMonth() + 1}월 ` : ""; // 지난 날짜의 월은 '다음'이 아니라 붙이지 않는다
  }
  function soonRow(u, today) {
    const e = endDate(u, today), start = u.items && u.items[0] && (u.items[0].entryDate || u.items[0].windowStart);
    const when = u.reason && u.reason.key === "starting_soon" && start instanceof Date ? `${dmd(start, today)}부터` : e ? (isPast(u) ? (endKind(u) === "age" ? "" : PAST_OK) : endText(u, e, today, " 마감")) : "";
    return `<div class="hs-sr" data-hs-key="${esc(u.key)}"><span class="hs-sit">${esc(u.title)}${u.type === "CHECK" ? `<span class="hs-tg-if">해당되면</span>` : ""}</span>${when ? `<span class="hs-wh">${when}</span>` : ""}${u.actionKind === "confirm" || u.actionKind === "review" ? actionHtml(u) : ""}</div>`;
  }
  function knowRow(u) {
    const why = u.reason && u.reason.text ? esc(u.reason.text) : "";
    return `<div class="hs-kn" data-hs-key="${esc(u.key)}"><div class="hs-it">${esc(u.title)}</div>${why ? `<div class="hs-why">${why}</div>` : ""}</div>`;
  }

  const moreHtml = (slot, n, label, rowFn, hidden, today, expandMax) => {
    if (!(n > 0)) return "";
    const all = hidden && hidden[slot] ? hidden[slot] : [];
    const max = Number.isInteger(expandMax) && expandMax > 0 ? expandMax : all.length; // D20: 펼침 최대 개수는 정책 값(slots.expandMax), 없으면 제한 없음
    const list = all.slice(0, max).map((u) => rowFn(u, today)).join("");
    const go = slot === "know" ? "month" : "checklist"; // 전체 보기: 지금 꼭·곧 → 체크리스트, 알아두기 → 월령 탭
    const more = all.length > max ? `<button type="button" class="hs-all" data-hs-go="${go}">전체 보기 →</button>` : "";
    return `<details class="hs-fold" data-hs-more="${slot}"><summary class="hs-more">${label} ${n}개 더 ›</summary>${list}${more}</details>`;
  };
  const node = (cls, name, body, extra) => `<section class="hs-node ${cls}"><i class="hs-dot${extra && extra.on ? " on" : ""}"></i><div class="hs-nl">${esc(name)}${extra && extra.link ? extra.link : ""}</div>${body}</section>`;

  function render(cur, o) {
    o = o || {};
    cur = cur || { now: [], soon: [], know: [], moreCounts: {} };
    const today = o.today instanceof Date ? o.today : null, mc = cur.moreCounts || {}, hid = cur.overflow || null;
    const famHidden = o.family === null; // 가구 기능이 꺼진 기기에 직접 일정도 없으면 '우리 가족 일정' 영역 자체를 숨긴다(06 §4-3 빈 섹션 숨김). 배열(빈 배열 포함)이면 보인다.
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
        `<div class="hs-card hs-now">${cur.now.map((u) => nowRow(u, today)).join("")}${moreHtml("now", mc.now, "지금 꼭 할 것", (u, t) => nowRow(u, t), hid, today, cur.expandMax)}</div>`, on()));
    } else {
      const next = o.nextHint || (cur.soon[0] ? `다음: ${monthOf(cur.soon[0], today)}${cur.soon[0].title}` : o.nextStage ? `다음: ${o.nextStage.title}` : "");
      parts.push(node("hs-s-now", "지금 꼭 할 것", `<div class="hs-empty"><b>이번 달 꼭 할 것은 없어요</b>${next ? `<span>${esc(next)}</span>` : ""}</div>`, { on: famHidden }));
      // 빈 ①은 점을 채우지 않고, 다음 마디(가족 일정)가 채운 점을 가진다
    }
    // ② 이번 주 · 우리 가족 일정 — 항상
    const famBody = fam.length
      ? `<div class="hs-card hs-fam">${fam.map((e) => `<div class="hs-ev"><i class="hs-bar" style="background:${esc(e.color || "")}"></i><span class="hs-evt">${esc(e.title)}</span>${e.time ? `<span class="hs-evm">${esc(e.time)}</span>` : ""}</div>`).join("")}</div>`
      : `<div class="hs-card hs-fam"><p class="hs-none">앞으로 7일 안에 등록된 가족 일정이 없어요.</p><button type="button" class="hs-add" data-hs-go="add-schedule">일정 추가하기</button></div>`;
    if (!famHidden) parts.push(node("hs-s-fam", "이번 주 · 우리 가족 일정", famBody, { on: !hasNow, link: `<button type="button" class="hs-lk" data-hs-go="calendar">캘린더 ›</button>` }));
    // ③ 곧 다가오는 것 — 항목 있을 때만
    if (hasSoon) {
      parts.push(node("hs-s-soon", "곧 다가오는 것",
        `<div class="hs-soon">${cur.soon.map((u) => soonRow(u, today)).join("")}${moreHtml("soon", mc.soon, "곧 다가오는 것", soonRow, hid, today, cur.expandMax)}</div>`, {}));
    }
    // ④ 이 시기 알아두기(+④-1 혜택 한 줄) — 알아두기 있거나 혜택 줄만 있어도 마디 유지
    if (hasKnow || benN || (o.benefits && o.benefits.regionPending)) {
      let body = "";
      if (hasKnow) body += `<div class="hs-know">${cur.know.map(knowRow).join("")}${moreHtml("know", mc.know, "이 시기 알아두기", knowRow, hid, today, cur.expandMax)}</div>`;
      if (benN) body += `<button type="button" class="hs-ben" data-hs-go="benefits">받을 수 있는 혜택 ${benN.count}개${benN.check > 0 ? ` · 확인할 것 ${benN.check}개` : ""} ›</button>`;
      else if (o.benefits && o.benefits.regionPending) body += `<p class="hs-ben hs-ben-pending">${esc(o.benefits.regionPending)}</p>`;
      parts.push(node("hs-s-know", "이 시기 알아두기", body, {}));
    }
    // ⑤ 다음 단계 배너 — 마디 점 없음
    if (o.nextStage) parts.push(`<button type="button" class="hs-next" data-hs-go="next-stage"><small>${esc(o.nextStage.head || "다음 단계")}</small><b>${esc(o.nextStage.title)}</b>${o.nextStage.desc ? `<span>${esc(o.nextStage.desc)}</span>` : ""}<i>›</i></button>`);
    // ⑥ 탐색 한 줄
    if (Array.isArray(o.explore) && o.explore.length) parts.push(`<div class="hs-exp">${o.explore.map((x) => `<button type="button" class="hs-xp" data-hs-go="${esc(x.go || "")}"><b>${esc(x.title)}</b>${x.desc ? `<span>${esc(x.desc)}</span>` : ""}</button>`).join("")}</div>`);

    if (typeof o.todosHtml === "string" && o.todosHtml) parts.push(`<div class="hs-todos">${o.todosHtml}</div>`); // 36+ 메모장 할 일: 맨 아래로 이동(삭제 아님) — 마크업은 기존 것을 그대로 받는다
    return `<div class="hs-home">${parts.join("")}</div>`;
  }

  return { render, ACT_LABEL };
});
