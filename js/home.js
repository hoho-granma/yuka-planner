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
    const title = ctx.esc(e.title.replace(/^(?:⚠️ )?확인 필요 · /, ""));
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

  /** G13-3: '챙길 것' 머리 — 아이가 여러 명이면 아이 칩(누르면 그 아이로 바꿔 보기), 지금 아이 한 줄. */
  function chipsHtml(ctx) {
    const kids = Array.isArray(ctx.homeChildren) ? ctx.homeChildren : [];
    return kids.length >= 2
      ? `<div class="home-child-chips" role="tablist">${kids.map((c) => `<button type="button" role="tab" aria-selected="${c.current ? "true" : "false"}" class="home-child-chip${c.current ? " active" : ""}" data-home-child="${ctx.esc(c.code)}">${ctx.esc(c.name)}</button>`).join("")}</div>`
      : "";
  }
  /** 4-1 A안: 아이 칩은 홈 맨 위(임신 배너 아래)로 올리고, 아이 나이 한 줄은 '챙길 것' 섹션 안에 남긴다. 아이가 1명이면 칩 없음. */
  const childChipsTop = chipsHtml;

  function render(ctx) {
    const wrap = document.getElementById("home-body");
    if (!wrap) return;
    const { events, completed, today } = ctx;
    const y = today.getFullYear();
    const m = today.getMonth();
    const html = [pregnantBanner(ctx)];
    const acctHomeTop = ctx.accountHome === true;
    if (acctHomeTop) { const chipsTop = childChipsTop(ctx); if (chipsTop) html.push(chipsTop); } // 4-1 A안: 아이 칩은 맨 위
    if (ctx.mustHtml) html.push(ctx.mustHtml); // 4-1 A안: '지금 꼭 할 것' 카드(최대 2줄, 없으면 "" → 이전 홈과 같은 화면)
    // 가족 캘린더(가구)가 켜져 있을 때만 앞으로 7일의 추가 일정 카드가 붙는다. 꺼져 있거나 가구가 없으면 ""(홈 DOM 그대로).
    // E(1-3): 가구가 활성이면 ctx.homeOrder()(["todo","family"] | ["family","todo"])가 '이번 달 챙길 것'과 이 카드의 순서만 정한다(내용 불변). 36개월 이상(family 먼저)이면 카드 제목이 '오늘·이번 주 우리 가족'.
    const order = typeof ctx.homeOrder === "function" ? ctx.homeOrder() : null;
    const acctHome = ctx.accountHome === true; // G13-3: 계정 모드 홈은 가족 일정이 먼저(나이와 상관없이)
    const todoFirst = !acctHome && !!order && order[0] === "todo";
    const usCard = typeof ctx.usUpcomingHtml === "function" ? ctx.usUpcomingHtml(acctHome ? { family: true } : order ? { family: !todoFirst } : undefined) : "";
    if (usCard && !todoFirst) html.push(usCard);

    const cls = L.classifyHomeItems(events, completed, { today, birthDate: ctx.profile.birthDate, monthKeysOf: ctx.monthKeysOf, periodRangeOf: ctx.periodRangeOf });
    const ymText = (d) => `${d.getMonth() + 1}월`;

    // 1. 이번 달 챙길 것 — 기간이 이번 달과 겹치는 항목을 카테고리별로 한 줄씩 요약한다(항목 이름은 체크리스트에서).
    const byCat = new Map();
    for (const x of cls.thisMonth) {
      if (!byCat.has(x.e.category)) byCat.set(x.e.category, []);
      byCat.get(x.e.category).push(x);
    }
    const shortTitle = (t) => t.replace(/^(?:⚠️ )?확인 필요 · /, "").replace(/\([^)]*\)/g, "").replace(/\s+/g, " ").trim();
    const catLines = Object.keys(ctx.CATEGORY_META)
      .filter((c) => byCat.has(c))
      .map((c) => {
        const meta = ctx.CATEGORY_META[c];
        const list = byCat.get(c);
        const todo = list.filter((x) => !x.done);
        // 발달 관찰은 제목이 "0~3개월 발달 관찰"처럼 뭘 보는지 알 수 없어서 관찰 내용(카드 요약)을 함께 보여준다.
        const label = (x) => (c === "발달관찰" && x.e.summary ? `${shortTitle(x.e.title).replace(/\s*발달\s*관찰$/, "")}: ${x.e.summary}` : shortTitle(x.e.title));
        const text = todo.length ? todo.map((x) => label(x) + (typeof ctx.autoLinkText === "function" && ctx.autoLinkText(x.e) ? ` (${ctx.autoLinkText(x.e)})` : "")).join(", ") : "모두 완료";
        return `<button type="button" class="cat-line ${todo.length ? "" : "all-done"}" data-cat="${ctx.esc(c)}"><span class="cl-dot" style="background:${meta.color}"></span><span class="cl-label">${ctx.esc(meta.label)}</span><span class="cl-text">${ctx.esc(text)}</span>${todo.length ? `<span class="cl-n">${todo.length}</span>` : '<span class="cl-n ok">✓</span>'}</button>`;
      })
      .join("");
    if (cls.thisMonth.length) html.push(
      section(
        `${m + 1}월 챙길 것`,
        cls.thisMonth.length ? `<button type="button" class="home-viewall" data-act="todos">전체보기 ›</button>` : "",
        (acctHome ? `<p class="home-child-line">${ctx.esc(ctx.homeChildText || "")}</p>` : "") + (cls.thisMonth.length ? catLines : `<p class="home-empty-line">이번 달에 챙길 항목이 없어요.</p>`),
        "sec-today"
      )
    );
    if (usCard && todoFirst) html.push(usCard); // 챙길 것 먼저(36개월 미만·임신 중): 가족 일정 카드는 그 아래

    // 2. 이 기간에 챙겨볼 것 — 기간형 AUTO(4~6세 추가접종 등)를 같은 성격끼리 카드 하나로 묶는다(항목·완료는 개별 그대로). 미완료만, 완료하면 빠진다.
    const pGroups = new Map();
    for (const x of cls.period) {
      const label = ctx.periodGroupLabel(x.e, { startKey: Math.min(...ctx.monthKeysOf(x.e).filter((k) => typeof k === "number")) });
      if (!pGroups.has(label)) pGroups.set(label, { cat: x.e.category, list: [] });
      pGroups.get(label).list.push(x);
    }
    if (pGroups.size) {
      const cards = [...pGroups.entries()]
        .map(
          ([label, g], i) =>
            `<button type="button" class="home-row" data-period-group="${i}"><span class="hr-body"><strong>${g.cat === "예방접종" ? "💉 " : ""}${ctx.esc(label)}</strong><small>${g.list.length}건 · 아직 완료하지 않았다면 확인해보세요</small></span><span class="hr-chev">›</span></button>`
        )
        .join("");
      html.push(section("이 기간에 챙겨볼 것", `${cls.period.length}건`, `${cards}<p class="home-note">정확한 시기는 질병관리청·보건소 등 공식 안내를 확인하세요.</p>`, "sec-period"));
    }

    // 3. 신청 가능한 지원금 (마감 임박은 일반 일정과 다른 색으로 강조)
    const sctx = { today, ageNow: ctx.ageNow, pregnant: ctx.pregnant, birthDate: ctx.profile && ctx.profile.birthDate };
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
        else if (a === "cal-today") ctx.goCalendar(new Date());
        else if (a === "us-cal") ctx.goCalendar(new Date());
        else if (a === "us-add") ctx.usAddFromHome();
        else if (a === "cal-next") ctx.goCalendar(new Date(today.getFullYear(), today.getMonth() + 1, 1));
      })
    );
    // G13-3: 아이 칩 → 그 아이로 바꿔 보기(아이 전환 시트와 같은 동작)
    wrap.querySelectorAll("[data-home-child]").forEach((b) => b.addEventListener("click", () => typeof ctx.switchChild === "function" && ctx.switchChild(b.dataset.homeChild)));
    // 다가오는 가족 일정 줄: 캘린더의 그 날짜로 이동한다.
    wrap.querySelectorAll("[data-home-date]").forEach((b) =>
      b.addEventListener("click", () => {
        const [y, mo, d] = b.dataset.homeDate.split("-").map(Number);
        ctx.goCalendar(new Date(y, mo - 1, d));
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
    const pGroupList = [...pGroups.entries()];
    wrap.querySelectorAll("[data-period-group]").forEach((b) =>
      b.addEventListener("click", () => {
        const [label, g] = pGroupList[Number(b.dataset.periodGroup)];
        ctx.showModal(
          `<h3>${ctx.esc(label)}</h3><p class="fine-print ns-note">항목을 누르면 자세한 내용을 볼 수 있어요.</p><div class="event-list">${g.list.map((x) => ctx.eventItemHtml(x.e, { compact: true })).join("")}</div><button class="btn-close" id="period-close">닫기</button>`,
          "category"
        );
        ctx.bindOpen(document.getElementById("modal-content"));
        document.getElementById("period-close").addEventListener("click", ctx.closeModal);
      })
    );
  }

  window.HNHome = { render };
})();
