/*
 * 기록 화면 — 아이의 성장·활동이 쌓이는 곳.
 *  - 자동 기록: 완료한 할 일(completed 맵)에서 파생. 별도 저장 없음 → 기존 완료 내역이 그대로 기록이 된다.
 *  - 직접 기록: 부모가 남기는 성장·활동 기록(js/records.js). 제목·날짜·카테고리·메모·사진(이 기기 전용)·작성자.
 * 카테고리 필터: 전체 · 건강 · 성장·발달 · 생활 · 활동 (지원금 신청 기록은 "제도"로 전체에만 나온다).
 */
(function () {
  "use strict";
  const L = HNLogic;
  const FILTERS = ["전체", "건강", "성장·발달", "생활", "활동"];
  let filter = "전체";
  let showNA = false; // "미해당 항목 보기" — 내 달력에서 뺀 혜택 목록

  const pad = (n) => String(n).padStart(2, "0");
  const isoOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  const RECORD_LINK_LABEL = "예약 일정 연결";

  function allRecords(ctx) {
    const { records, orphanCount } = L.deriveAutoRecords(ctx.allEvents, ctx.completed, ctx.profile.birthDate);
    const manual = L.manualRecordList(HNRecords.getMap(), ctx.profile.birthDate);
    return { auto: records, manual, orphanCount };
  }

  function syncNote(ctx) {
    const err = HNRecords.syncError();
    if (!ctx.familyCode) return `<p class="sync-note">가족코드가 아직 없어서, 직접 남긴 기록은 이 기기에만 저장돼요.</p>`;
    if (err) return `<p class="sync-note warn">가족과 기록을 공유하지 못하고 있어요(${ctx.esc(err)}). 직접 남긴 기록은 이 기기에는 안전하게 저장돼 있어요.</p>`;
    return "";
  }

  function render(ctx) {
    const list = document.getElementById("list-record");
    const chips = document.getElementById("record-filter");
    const empty = document.getElementById("empty-record");
    if (!list || !chips || !empty) return;
    const { auto, manual, orphanCount } = allRecords(ctx);
    const count = (f) => L.mergeRecords(auto, manual, f).length;
    chips.innerHTML = FILTERS.map((f) => `<button type="button" class="chip rec-chip ${filter === f ? "active" : ""}" data-f="${f}">${f} ${count(f)}</button>`).join("");
    chips.querySelectorAll("[data-f]").forEach((b) => b.addEventListener("click", () => { filter = b.dataset.f; showNA = false; render(ctx); }));
    const naList = ctx.notApplicable().sort((a, b) => String(b.at).localeCompare(String(a.at)));
    if (showNA) chips.querySelectorAll(".rec-chip").forEach((c) => c.classList.remove("active"));

    const items = showNA ? [] : L.mergeRecords(auto, manual, filter);
    let html = syncNote(ctx);
    // G15-5: 직접 기록 진입점 — 계정 모드에서만 위쪽에 [+ 기록 추가](OFF 화면은 그대로). 기존 작성 화면(openEditor)을 연다.
    if (ctx.accountDesign === true) html += `<button type="button" class="rec-add" data-rec-add="1">＋ 기록 추가</button>`;
    html += `<button type="button" class="na-toggle ${showNA ? "active" : ""}" data-na="1">미해당 항목 ${showNA ? "닫기" : "보기"} (${naList.length})</button>`;
    if (showNA) {
      html += naList.length
        ? `<p class="sync-note">나에게 해당하지 않아 내 달력·홈에서 뺀 혜택이에요. 눌러서 다시 포함할 수 있어요.</p>` +
          naList
            .map(
              ({ event: e, at }) => `<button type="button" class="rec-row na" data-na-open="${ctx.esc(e.id)}">
                <span class="rec-day">${new Date(at).getMonth() + 1}/${new Date(at).getDate()}</span>
                <span class="rec-main"><span>${ctx.providerTagHtml(e)}</span><strong>${ctx.esc(e.title)}</strong><small>미해당으로 표시</small></span>
                <span class="hr-chev">›</span></button>`
            )
            .join("")
        : `<p class="sync-note">미해당으로 표시한 항목이 없어요.</p>`;
    }
    let lastMonth = "";
    for (const r of items) {
      const mk = `${r.date.getFullYear()}년 ${r.date.getMonth() + 1}월`;
      if (mk !== lastMonth) {
        html += `<h3 class="rec-month">${mk}</h3>`;
        lastMonth = mk;
      }
      const meta = [ChildTimeline.ageLabelAt(ctx.profile.birthDate, r.date), r.category, r.source === "auto" ? "자동" : r.authorLabel ? `직접 · ${ctx.esc(r.authorLabel)}` : "직접"].join(" · ");
      // C2-b3(표시만): 연결된 예약 일정이 있는 자동 기록에 보조 표시. autoLink 플래그 OFF 면 ctx.autoLinkedIds 가 null 이라 아무것도 더하지 않는다.
      const linkedTag = r.source === "auto" && ctx.autoLinkedIds && ctx.autoLinkedIds.has(r.eventId) ? `<span class="rec-linked">${RECORD_LINK_LABEL}</span>` : "";
      // G14-6: 계정 모드(ctx.accountDesign)는 날짜 타임라인 — 큰 날짜 숫자 + '자동'/'직접' 태그. 클릭·데이터는 그대로이고 꺼져 있으면 아래 기존 마크업 그대로다.
      const acctD = ctx.accountDesign === true;
      const dayHtml = acctD ? `<span class="rec-day"><b>${r.date.getDate()}</b>${r.date.getMonth() + 1}월</span>` : `<span class="rec-day">${r.date.getMonth() + 1}/${r.date.getDate()}</span>`;
      const srcTag = acctD ? `<span class="rec-src ${r.source}">${r.source === "auto" ? "자동" : "직접"}</span> ` : "";
      html += `<button type="button" class="rec-row ${r.source}" data-rec="${ctx.esc(r.id)}">
        ${dayHtml}
        <span class="rec-main"><strong>${srcTag}${ctx.esc(r.title)}</strong><small>${meta}</small>${linkedTag}${r.memo ? `<em>${ctx.esc(r.memo.length > 46 ? r.memo.slice(0, 46) + "…" : r.memo)}</em>` : ""}</span>
        <span class="hr-chev">›</span>
      </button>`;
    }
    if (orphanCount > 0 && filter === "전체") {
      html += `<p class="sync-note">이전 버전에서 완료 표시한 ${orphanCount}개는 항목 정보를 찾을 수 없어 기록 목록에 표시하지 못했어요(완료 상태 자체는 그대로예요).</p>`;
    }
    list.innerHTML = html;
    // 자동 기록(완료한 할 일)은 메모·사진 화면 없이 바로 원래 할 일 상세를 연다. 직접 남긴 기록만 기록 상세를 쓴다.
    list.querySelectorAll("[data-rec]").forEach((b) =>
      b.addEventListener("click", () => {
        const id = b.dataset.rec;
        if (id.startsWith("c:")) {
          const ev = ctx.allEvents.find((e) => e.id === id.slice(2));
          if (ev) return ctx.openDetail(ev);
        }
        openDetail(ctx, id);
      })
    );
    const addBtn = list.querySelector("[data-rec-add]");
    if (addBtn) addBtn.addEventListener("click", () => openEditor(ctx));
    const naBtn = list.querySelector("[data-na]");
    if (naBtn) naBtn.addEventListener("click", () => { showNA = !showNA; render(ctx); });
    list.querySelectorAll("[data-na-open]").forEach((b) =>
      b.addEventListener("click", () => {
        const ev = ctx.allEvents.find((x) => x.id === b.dataset.naOpen);
        if (ev) ctx.openDetail(ev);
      })
    );

    empty.classList.toggle("hidden", showNA || items.length > 0);
    empty.innerHTML =
      filter === "전체"
        ? `아직 기록이 없어요.<br />할 일을 완료하면 자동으로 쌓이고, 아이의 성장·활동은 ${ctx.accountDesign === true ? "위 [＋ 기록 추가]" : "아래 ＋ 버튼"}으로 직접 남길 수 있어요.`
        : filter === "활동"
        ? "아이가 경험한 활동(첫 물놀이, 산책 등)을 ＋ 버튼으로 남겨 보세요."
        : `${ctx.esc(filter)} 기록이 아직 없어요.`;
  }

  // ── 상세 ────────────────────────────────────────────────────────────────
  function openDetail(ctx, id, notice) {
    const { auto, manual } = allRecords(ctx);
    const r = [...auto, ...manual].find((x) => x.id === id);
    if (!r) return;
    const isAuto = r.source === "auto";
    const next = isAuto ? L.nextRelatedEvent(ctx.allEvents, r.eventId, ctx.completed) : null;
    const nextHtml = next
      ? `<div class="detail-row"><div class="label">관련 다음 일정</div><button type="button" class="rv-next" data-open-event="${ctx.esc(next.id)}">${ctx.esc(next.title)}<small>${ctx.kindTagHtml(next)}${ctx.esc(L.periodText(next) || "월령별로 살펴보세요")}</small></button></div>`
      : "";
    ctx.showModal(
      `<span class="cat-badge" style="background:var(--text-muted)">${ctx.esc(r.category)}</span><span class="scope-tag detail-tag">${isAuto ? "자동 기록" : "직접 기록"}</span>
       <h3>${ctx.esc(r.title)}</h3>
       ${notice ? `<p class="sync-note ${notice.warn ? "warn" : ""}">${ctx.esc(notice.text)}</p>` : ""}
       <div class="detail-row"><div class="label">기록 날짜</div>${ctx.formatDateKR(r.date)}</div>
       <div class="detail-row"><div class="label">해당 월령</div>${ChildTimeline.ageLabelAt(ctx.profile.birthDate, r.date)}</div>
       <div class="detail-row"><div class="label">카테고리</div>${ctx.esc(r.category)}${isAuto ? " · 완료한 할 일에서 자동으로 만들어졌어요" : ""}</div>
       ${!isAuto && r.authorLabel ? `<div class="detail-row"><div class="label">작성자</div>${ctx.esc(r.authorLabel)}</div>` : ""}
       <div class="detail-row"><div class="label">부모 메모</div>
         ${isAuto ? `<textarea id="rv-memo" class="rv-textarea" rows="3" maxlength="500" placeholder="예: 접종 후 열 없었어요">${ctx.esc(r.memo)}</textarea><button type="button" class="completion-save rv-save" id="rv-save-memo">메모 저장</button>` : r.memo ? `<div class="rv-memo-text">${ctx.esc(r.memo)}</div>` : `<span class="rv-none">남긴 메모가 없어요</span>`}
       </div>
       ${nextHtml}
       ${isAuto ? `<button class="btn-complete" id="rv-open-source">원래 할 일 보기</button>` : `<button class="btn-complete" id="rv-edit">수정하기</button><button class="btn-close rv-danger" id="rv-delete">이 기록 삭제</button>`}
       <button class="btn-close" id="rv-close">닫기</button>`,
      "record"
    );
    const q = (i) => document.getElementById(i);
    q("rv-close").addEventListener("click", ctx.closeModal);
    ctx.bindOpen(document.getElementById("modal-content"));
    if (isAuto) {
      q("rv-save-memo").addEventListener("click", () => {
        ctx.setCompletionMemo(r.eventId, q("rv-memo").value);
        openDetail(ctx, id, { text: "메모를 저장했어요." });
      });
      q("rv-open-source").addEventListener("click", () => {
        const ev = ctx.allEvents.find((e) => e.id === r.eventId);
        if (ev) ctx.openDetail(ev);
      });
    } else {
      q("rv-edit").addEventListener("click", () => openEditor(ctx, id));
      // 브라우저 확인창 대신 모달 안에서 한 번 더 누르게 한다(자동화·PWA에서 확인창이 화면을 막는 문제 방지).
      let armed = false;
      q("rv-delete").addEventListener("click", async (ev) => {
        if (!armed) {
          armed = true;
          ev.target.textContent = "정말 삭제할까요? 한 번 더 누르면 삭제돼요";
          setTimeout(() => { armed = false; if (ev.target.isConnected) ev.target.textContent = "이 기록 삭제"; }, 4000);
          return;
        }
        await HNRecords.remove(id);
        ctx.closeModal();
      });
    }
  }

  // ── 추가/수정 ───────────────────────────────────────────────────────────
  function openEditor(ctx, editId) {
    const existing = editId ? HNRecords.getMap()[editId] : null;
    const today = ctx.today;
    let cat = existing ? existing.category : filter !== "전체" && L.MANUAL_CATEGORIES.includes(filter) ? filter : "성장·발달";
    const todayIso = isoOf(today);
    ctx.showModal(
      `<h3>${existing ? "기록 수정" : "성장·활동 기록 추가"}</h3>
       <div class="rv-field"><label>카테고리</label><div class="rv-cats" id="rv-cats">${L.MANUAL_CATEGORIES.map((c) => `<button type="button" class="chip rv-cat ${c === cat ? "active" : ""}" data-c="${c}">${c}</button>`).join("")}</div></div>
       <div class="rv-field"><label for="rv-title">제목 <span class="req">*</span></label><input type="text" id="rv-title" maxlength="40" placeholder="예: 첫 뒤집기, 처음 물놀이" value="${existing ? ctx.esc(existing.title) : ""}" /></div>
       <div class="rv-field"><label for="rv-date">날짜 <span class="req">*</span></label><input type="date" id="rv-date" max="${todayIso}" value="${existing ? existing.date : todayIso}" /><small id="rv-age" class="rv-age"></small></div>
       <div class="rv-field"><label for="rv-memo-new">메모</label><textarea id="rv-memo-new" class="rv-textarea" rows="3" maxlength="500" placeholder="그날의 모습이나 느낌을 적어 보세요">${existing ? ctx.esc(existing.memo || "") : ""}</textarea></div>
       <div class="rv-field"><label for="rv-author">작성자 <small>(가족이 볼 때 표시돼요)</small></label><input type="text" id="rv-author" maxlength="10" placeholder="예: 엄마, 아빠" value="${ctx.esc(existing ? existing.authorLabel || "" : HNRecords.authorLabel())}" /></div>
       <p id="rv-error" class="fine-print hidden" style="color:var(--c-danger)">제목과 날짜를 입력해 주세요.</p>
       <button class="btn-complete" id="rv-save">${existing ? "저장" : "기록 남기기"}</button>
       <button class="btn-close" id="rv-cancel">취소</button>`,
      "record"
    );
    const q = (i) => document.getElementById(i);
    const updateAge = () => {
      const v = q("rv-date").value;
      q("rv-age").textContent = v ? ChildTimeline.ageLabelAt(ctx.profile.birthDate, new Date(v + "T12:00:00")) : "";
    };
    updateAge();
    q("rv-date").addEventListener("change", updateAge);
    q("rv-cats").querySelectorAll(".rv-cat").forEach((b) =>
      b.addEventListener("click", () => {
        cat = b.dataset.c;
        q("rv-cats").querySelectorAll(".rv-cat").forEach((x) => x.classList.toggle("active", x === b));
      })
    );
    q("rv-cancel").addEventListener("click", () => {
      editId ? openDetail(ctx, editId) : ctx.closeModal();
    });
    q("rv-save").addEventListener("click", async () => {
      const title = q("rv-title").value.trim();
      const date = q("rv-date").value;
      if (!title || !date) {
        q("rv-error").classList.remove("hidden");
        (title ? q("rv-date") : q("rv-title")).focus();
        return;
      }
      const author = q("rv-author").value.trim();
      HNRecords.setAuthorLabel(author);
      const res = await HNRecords.save({ id: editId, category: cat, title, date, memo: q("rv-memo-new").value, authorLabel: author });
      const notice = res.synced
        ? { text: "기록을 남겼어요." }
        : { warn: true, text: ctx.familyCode ? "가족과 공유하지 못해 이 기기에만 저장했어요." : "가족코드가 없어 이 기기에만 저장했어요." };
      openDetail(ctx, res.id, notice);
    });
  }

  window.HNRecordsView = { render, openDetail, openEditor };
})();
