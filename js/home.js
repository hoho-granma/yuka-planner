/*
 * 홈 화면 — "이번 달과 다가오는 일정" 중심. 분류는 js/hn-logic.js(classifyHomeItems)가 하고 여기서는 배치와 표시만 한다.
 * 순서: 이번 달 챙길 것 → 신청 가능한 혜택
 * 과거 월령의 미완료 항목은 홈에 올리지 않는다(삭제·자동 완료 처리는 하지 않고, 전체 할 일에서 확인한다).
 */
(function () {
  "use strict";
  const L = HNLogic;
  const MONTH_MAX = 6;
  const UPCOMING_MAX = 4;
  const PAST_MAX = 3;
  const SUB_MAX = 3;

  function row(ctx, e, sub, extraClass) {
    const g = ctx.calGroupFor(e);
    const title = ctx.esc(e.title.replace(/^⚠️ 확인 필요 · /, ""));
    return `<button type="button" class="home-row ${extraClass || ""}" data-open-event="${ctx.esc(e.id)}">
      <span class="cat-dot" style="background:${g.color}"></span>
      <span class="hr-body"><strong>${title}</strong><small>${sub}</small></span>
      <span class="hr-chev">›</span>
    </button>`;
  }

  function section(title, badge, inner, cls) {
    return `<section class="home-sec ${cls || ""}"><div class="home-sec-head"><h3>${title}</h3>${badge ? (badge.startsWith("<") ? badge : `<span class="count-badge">${badge}</span>`) : ""}</div>${inner}</section>`;
  }

  const isMonthLevel = (e) => (e.category === "예방접종" || e.category === "영유아검진") && e.scheduleKind === "window" && e.windowStart;
  /** 접종·검진은 카드·상세와 같은 월 단위 표기, 그 밖은 M/D~M/D. */
  function periodLabel(ctx, e) {
    return isMonthLevel(e) ? ctx.monthPeriodText(e) : L.periodText(e);
  }

  function subLine(ctx, e) {
    const tag = ctx.kindTagHtml(e);
    const period = periodLabel(ctx, e);
    return `${tag}${period ? ctx.esc(period) : "월령별로 살펴보세요"}`;
  }

  function pregnantBanner(ctx) {
    if (!ctx.pregnant) return "";
    const due = ctx.profile.birthDate;
    const days = Math.ceil((L.sod(due) - L.sod(ctx.today)) / L.DAY);
    const dText = days > 0 ? `출산 예정일까지 D-${days}` : days === 0 ? "오늘이 출산 예정일이에요" : "출산 예정일이 지났어요";
    return `<div class="home-banner"><strong>${dText}</strong><span>출산 전 준비와 임신 중 혜택을 먼저 보여드리고, 출산 후 검진·접종·발달 일정은 예정일 기준으로 미리 계산해 두었어요. 아이가 태어나면 프로필에서 “아이가 태어났어요”를 눌러 주세요.</span></div>`;
  }

  function render(ctx) {
    const wrap = document.getElementById("home-body");
    if (!wrap) return;
    const { events, completed, today } = ctx;
    const y = today.getFullYear();
    const m = today.getMonth();
    const html = [pregnantBanner(ctx)];

    const cls = L.classifyHomeItems(events, completed, { today, birthDate: ctx.profile.birthDate, monthKeysOf: ctx.monthKeysOf });
    const ymText = (d) => `${d.getMonth() + 1}월`;

    // 1. 이번 달 챙길 것 — 기간이 이번 달과 겹치는 항목을 카테고리별로 한 줄씩 요약한다(항목 이름은 체크리스트에서).
    const byCat = new Map();
    for (const x of cls.thisMonth) {
      if (!byCat.has(x.e.category)) byCat.set(x.e.category, []);
      byCat.get(x.e.category).push(x);
    }
    const shortTitle = (t) => t.replace(/^⚠️ 확인 필요 · /, "").replace(/\([^)]*\)/g, "").replace(/\s+/g, " ").trim();
    const catLines = Object.keys(ctx.CATEGORY_META)
      .filter((c) => byCat.has(c))
      .map((c) => {
        const meta = ctx.CATEGORY_META[c];
        const list = byCat.get(c);
        const todo = list.filter((x) => !x.done);
        // 발달 관찰은 제목이 "0~3개월 발달 관찰"처럼 뭘 보는지 알 수 없어서 관찰 내용(카드 요약)을 함께 보여준다.
        const label = (x) => (c === "발달관찰" && x.e.summary ? `${shortTitle(x.e.title).replace(/\s*발달\s*관찰$/, "")}: ${x.e.summary}` : shortTitle(x.e.title));
        const text = todo.length ? todo.map(label).join(", ") : "모두 완료";
        return `<button type="button" class="cat-line ${todo.length ? "" : "all-done"}" data-cat="${ctx.esc(c)}"><span class="cl-dot" style="background:${meta.color}"></span><span class="cl-label">${ctx.esc(meta.label)}</span><span class="cl-text">${ctx.esc(text)}</span>${todo.length ? `<span class="cl-n">${todo.length}</span>` : '<span class="cl-n ok">✓</span>'}</button>`;
      })
      .join("");
    html.push(
      section(
        `${m + 1}월 챙길 것`,
        cls.thisMonth.length ? `<button type="button" class="home-viewall" data-act="todos">전체보기 ›</button>` : "",
        cls.thisMonth.length ? catLines : `<p class="home-empty-line">이번 달에 챙길 항목이 없어요.</p>`,
        "sec-today"
      )
    );

    // 3. 신청 가능한 지원금 (마감 임박은 일반 일정과 다른 색으로 강조)
    const sctx = { today, ageNow: ctx.ageNow, pregnant: ctx.pregnant };
    const buckets = L.subsidyBuckets(events, completed, sctx, 30);
    const subList = buckets.available.slice(0, SUB_MAX);
    const subRows = subList
      .map((e) => {
        // 마감일은 연도까지 보여준다("9/1까지"만 쓰면 이미 지난 날짜로 오해). D-day 뱃지는 두지 않는다.
        const dl = L.subsidyDeadline(e);
        const sub = dl ? ctx.esc(`${ctx.formatDateKR(dl)}까지`) : "지금 신청할 수 있어요";
        return row(ctx, e, sub);
      })
      .join("");
    html.push(
      section(
        "신청 가능한 혜택",
        buckets.available.length ? `${buckets.available.length}개` : "",
        subList.length
          ? `${subRows}<button type="button" class="home-more" data-act="subsidy">육아 혜택 전체 보기</button>`
          : `<p class="home-empty-line">지금 신청할 수 있는 혜택이 없어요.</p><button type="button" class="home-more" data-act="subsidy">육아 혜택 보기</button>`,
        "sec-subsidy"
      )
    );

    wrap.innerHTML = html.join("");
    ctx.bindOpen(wrap);
    wrap.querySelectorAll("[data-act]").forEach((b) =>
      b.addEventListener("click", () => {
        const a = b.dataset.act;
        if (a === "todos") ctx.openTodos();
        else if (a === "subsidy") ctx.switchTab("subsidy");
        else if (a === "record") ctx.switchTab("record");
        else if (a === "cal-today") ctx.goCalendar(new Date());
        else if (a === "cal-next") ctx.goCalendar(new Date(today.getFullYear(), today.getMonth() + 1, 1));
      })
    );
    // 카테고리 줄을 누르면 체크리스트로 가지 않고, 그 카테고리의 이번 달 항목만 팝업으로 보여준다.
    wrap.querySelectorAll("[data-cat]").forEach((b) =>
      b.addEventListener("click", () => {
        const c = b.dataset.cat;
        const meta = ctx.CATEGORY_META[c] || { label: c };
        const list = cls.thisMonth.filter((x) => x.e.category === c).sort((a, z) => a.done - z.done);
        ctx.showModal(
          `<h3>${m + 1}월 ${ctx.esc(meta.label)} 챙길 것</h3><p class="fine-print ns-note">항목을 누르면 자세한 내용을 볼 수 있어요.</p><div class="event-list">${list.map((x) => ctx.eventItemHtml(x.e, { compact: true })).join("")}</div><button class="btn-close" id="cat-close">닫기</button>`,
          "category"
        );
        const box = document.getElementById("modal-content");
        ctx.bindOpen(box);
        document.getElementById("cat-close").addEventListener("click", ctx.closeModal);
      })
    );
    wrap.querySelectorAll("[data-rec]").forEach((b) => b.addEventListener("click", () => HNRecordsView.openDetail(ctx, b.dataset.rec)));
  }

  window.HNHome = { render };
})();
