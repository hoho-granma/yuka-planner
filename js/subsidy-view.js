/*
 * 지원금·제도 탭. 상태 3분류(신청 가능 / 신청 예정 / 신청 완료) × 범위 필터(전체·전국 공통·지역별).
 * 기한이 지난 혜택은 접어서 맨 아래에 둔다(숨기지 않는다). 공식 안내 페이지 링크는 상세 팝업에서 본다.
 * 카드·상세는 기존 eventItemHtml/openDetail을 그대로 쓴다 — 상세에서 지원 대상·금액·기간·공식 페이지·"신청 완료 표시"가 된다.
 * 새 지원금·신청 조건은 만들지 않는다: 화면에 나오는 항목은 전부 기존 데이터(data/subsidies)에서 온다.
 */
(function () {
  "use strict";
  const L = HNLogic;
  let statusTab = "available"; // available | upcoming | applied
  let scope = "all"; // all | national | regional
  let expiredOpen = false;
  let conditionalOpen = false;

  const isNational = (ctx, e) => {
    const p = ctx.subsidyProvider(e);
    return !!p && p.short === "전국 공통";
  };

  function cardHtml(ctx, e, extra) {
    return `<div class="sub-wrap ${extra && extra.urgent ? "urgent" : ""}">${extra && extra.badge ? extra.badge : ""}${ctx.eventItemHtml(e)}${extra && extra.foot ? extra.foot : ""}</div>`;
  }

  function render(ctx) {
    const seg = document.getElementById("subsidy-seg");
    const chips = document.getElementById("subsidy-scope");
    const body = document.getElementById("subsidy-body");
    if (!seg || !chips || !body) return;

    const sctx = { today: ctx.today, ageNow: ctx.ageNow, pregnant: ctx.pregnant };
    const all = L.subsidyBuckets(ctx.events, ctx.completed, sctx, 30);
    const inScope = (e) => (scope === "national" ? isNational(ctx, e) : scope === "regional" ? !isNational(ctx, e) : true);
    const b = {
      available: all.available.filter(inScope),
      urgent: all.urgent.filter(inScope),
      upcoming: all.upcoming.filter(inScope),
      applied: all.applied.filter(inScope),
      expired: all.expired.filter(inScope),
      conditional: all.conditional.filter(inScope),
    };

    seg.innerHTML = [
      ["available", "신청 가능", b.available.length],
      ["upcoming", "신청 예정", b.upcoming.length],
      ["applied", "신청 완료", b.applied.length],
    ]
      .map(([k, label, n]) => `<button type="button" class="seg-tab ${statusTab === k ? "active" : ""}" data-st="${k}">${label} <span class="seg-n">${n}</span></button>`)
      .join("");
    // 칩 숫자는 지금 선택한 상태 탭(신청 가능/예정/완료)의 목록 기준이다 — 화면에 보이는 목록 개수와 같아야 헷갈리지 않는다.
    // (조건 해당자 접이식·기한 지난 혜택은 목록 밖이라 세지 않는다)
    const tabList = statusTab === "available" ? all.available : statusTab === "upcoming" ? all.upcoming : all.applied;
    const natN = tabList.filter((e) => isNational(ctx, e)).length;
    const regN = tabList.length - natN;
    chips.innerHTML = [
      ["all", `전체 ${natN + regN}`],
      ["national", `전국 공통 ${natN}`],
      ["regional", `지역별 ${regN}`],
    ]
      .map(([k, label]) => `<button type="button" class="chip scope-chip ${scope === k ? "active" : ""}" data-scope="${k}">${label}</button>`)
      .join("");

    let html = `<p class="sub-region-note">📍 ${ctx.esc(ctx.profile.province)} ${ctx.esc(ctx.profile.district)} 기준이에요.${ctx.pregnant ? " 출산 예정일 기준으로 계산했어요." : ""}</p>`;

    if (statusTab === "available") {
      // 마감 임박 구분·뱃지는 두지 않는다 — 신청 가능 항목을 마감일이 가까운 순으로 나열한다.
      if (b.available.length) {
        html += `<h3 class="sub-group-title">지금 신청할 수 있어요</h3>`;
        html += b.available.map((e) => cardHtml(ctx, e)).join("");
      }
      if (!b.available.length) html += `<p class="empty">지금 신청할 수 있는 혜택이 없어요.</p>`;
      if (b.conditional.length) {
        html += `<button type="button" class="sub-expired-toggle sub-cond-toggle" data-act="conditional">조건에 해당하면 신청할 수 있는 혜택 ${b.conditional.length}개 ${conditionalOpen ? "접기" : "보기"}</button>`;
        if (conditionalOpen) html += `<div class="sub-conditional">${b.conditional.map((e) => cardHtml(ctx, e)).join("")}</div>`;
      }
      if (b.expired.length) {
        html += `<button type="button" class="sub-expired-toggle" data-act="expired">기한이 지난 혜택 ${b.expired.length}개 ${expiredOpen ? "접기" : "보기"}</button>`;
        if (expiredOpen) html += `<div class="sub-expired">${b.expired.map((e) => cardHtml(ctx, e)).join("")}</div>`;
      }
    } else if (statusTab === "upcoming") {
      html += b.upcoming.length ? `<h3 class="sub-group-title">앞으로 신청할 수 있어요</h3>` + b.upcoming.map((e) => cardHtml(ctx, e)).join("") : `<p class="empty">앞으로 신청할 혜택이 없어요.</p>`;
    } else {
      html += b.applied.length
        ? `<h3 class="sub-group-title">신청 완료한 혜택</h3>` +
          b.applied
            .map((e) => {
              const c = ctx.completed[e.id];
              const at = c && c.recordedAt ? `<div class="applied-at">신청 완료 · ${ctx.formatDateKR(new Date(c.recordedAt))}</div>` : "";
              return cardHtml(ctx, e, { badge: at });
            })
            .join("")
        : `<p class="empty">아직 신청 완료로 표시한 혜택이 없어요.<br />상세에서 “해당 (신청 완료)”를 누르면 여기에 모여요.</p>`;
    }

    body.innerHTML = html;
    ctx.bindOpen(body);
    const togCond = body.querySelector("[data-act='conditional']");
    if (togCond) togCond.addEventListener("click", () => { conditionalOpen = !conditionalOpen; render(ctx); });
    const tog = body.querySelector("[data-act='expired']");
    if (tog) tog.addEventListener("click", () => { expiredOpen = !expiredOpen; render(ctx); });
    seg.querySelectorAll("[data-st]").forEach((btn) => btn.addEventListener("click", () => { statusTab = btn.dataset.st; render(ctx); window.scrollTo(0, 0); }));
    chips.querySelectorAll("[data-scope]").forEach((btn) => btn.addEventListener("click", () => { scope = btn.dataset.scope; render(ctx); }));
  }

  window.HNSubsidyView = { render };
})();
