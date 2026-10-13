(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else root.GrowthRecords = factory();
})(typeof window !== "undefined" ? window : global, function () {
  "use strict";
  const Evidence=typeof module!=='undefined'&&module.exports?require('./growth-evidence'):globalThis.GrowthEvidence;
  const GROUPS = [{ id: "school", label: "학교", hint: "학교에서의 하루" }, { id: "academy", label: "학원", hint: "배우는 즐거움" }, { id: "activity", label: "그 외 활동", short: "그 외", hint: "새로운 경험" }, { id: "home", label: "가정 활동", short: "가정활동", hint: "함께하는 일상" }];
  const TAB_ORDER = ["school", "academy", "home", "activity"];
  // 분류별 색 = 나무 잎 색(파스텔 바탕 · 진한 글씨)
  const COLORS = { school: { bg: "#d8e7f6", ink: "#35587e" }, academy: { bg: "#e5d6fa", ink: "#6c4696" }, activity: { bg: "#e3ecd2", ink: "#526c3c" }, home: { bg: "#fbe5d4", ink: "#986d4f" } };
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  // 올릴 사진은 긴 변 1800px·JPEG로 줄여 보낸다(원본은 보관하지 않는다). 줄이지 못하거나 오히려 커지면 고른 파일 그대로 쓴다.
  // 월 1회 AI 점검 테스트 결과에 따라 이 두 값만 고치면 된다.
  const IMAGE_MAX_EDGE = 1800, IMAGE_QUALITY = 0.85;
  async function shrinkImage(file) {
    const pc = globalThis.PhotoCompress;
    if (!pc || !file || !/^image\//.test(file.type)) return file;
    try {
      const out = await pc.compress(file, { maxEdge: IMAGE_MAX_EDGE, quality: IMAGE_QUALITY });
      if (out.previewUrl && globalThis.URL) URL.revokeObjectURL(out.previewUrl);
      return out.blob && out.blob.size > 0 && out.blob.size < file.size ? out.blob : file;
    } catch (e) { return file; }
  }
  function eligible(p, months) { return !!p && p.stage !== "pregnant" && Number.isFinite(months) && months >= 36; }
  function prepare(input, scope, now) {
    const title = String(input.title || "").trim(), text = String(input.text || "").trim(), activity = String(input.activity || "").trim();
    if (!scope) throw new Error("아이 정보를 확인한 뒤 다시 시도해 주세요.");
    if (!GROUPS.some((g) => g.id === input.group)) throw new Error("활동 종류를 골라 주세요.");
    if (!activity || activity.length > 60) throw new Error("활동 이름을 60자 이내로 입력해 주세요.");
    if (!title || title.length > 100) throw new Error("기록 제목을 100자 이내로 입력해 주세요.");
    if (text.length > 10000) throw new Error("메시지와 메모는 10,000자 이내로 입력해 주세요.");
    const date = String(input.date || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date + "T00:00:00Z")) || new Date(date + "T00:00:00Z").toISOString().slice(0, 10) !== date) throw new Error("기록 날짜를 확인해 주세요.");
    if (!text && !input.image) throw new Error("메시지나 메모를 입력하거나 캡처 이미지를 넣어 주세요.");
    if (input.image && (!/^image\//.test(input.image.type) || input.image.size > 15 * 1024 * 1024)) throw new Error("15MB 이하의 이미지를 골라 주세요.");
    return { ...Evidence.fields(input), ...(input.activityId?{activityId:input.activityId}:{}), id: input.id || (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${now}-${Math.random().toString(36).slice(2)}`), scope, group: input.group, activity, title, text, date, image: input.image || null, createdAt: now };
  }
  function list(records, scope, group, activity) { return records.filter((r) => r.scope === scope && (!group || r.group === group) && (!activity || r.activity === activity)).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt); }
  function activities(records, scope, group) { return [...new Set(list(records, scope, group).map((r) => r.activity))]; }
  function linkedActivities(records, scope, group, lessons) { return [...new Set((group === "academy" ? (lessons || []).map((l) => l.title).filter(Boolean) : []).concat(activities(records, scope, group)))]; }
  function treeMarkup(records, scope, lessons, name, selected, activity) {
    const colors = ["#d8e7f6", "#e5d6fa", "#e3ecd2", "#fbe5d4"];
    const ink = ["#35587e", "#6c4696", "#526c3c", "#986d4f"];
    const positions = [[79, 68, -24], [275, 87, 22], [77, 191, -19], [276, 211, 25]];
    let paths = '', leaves = '';
    const defs = colors.map((c,i)=>`<linearGradient id="gr-leaf-${i}" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fff"/><stop offset=".4" stop-color="${c}"/><stop offset="1" stop-color="${c}" stop-opacity=".75"/></linearGradient>`).join('');
    GROUPS.forEach((g,i)=>{
      const count = list(records, scope, g.id).length;
      const scale = count ? Math.min(1.23, .82 + Math.sqrt(count) * .14) : .68;
      const w = 122 * scale, h = 82 * scale, [x,y,angle] = positions[i];
      paths += `<path d="M180 290 C${i%2?202:158} 243 ${i%2?218:142} ${y+64} ${x} ${y+23}" stroke-width="${i<2?5:3.5}"/>`;
      leaves += `<g data-gr-group="${g.id}" data-gr-record-count="${count}" data-gr-leaf-scale="${scale}" class="gr-svg-leaf${selected===g.id?' selected':''}" role="button" tabindex="0" aria-label="${esc(g.label)} ${count}개 기록"><g transform="translate(${x} ${y}) rotate(${angle})"><path class="gr-leaf-surface" d="M${-w/2} ${h/2} C${-w*.64} ${-h*.4} ${w*.03} ${-h*.62} ${w/2} ${-h/2} C${w*.64} ${h*.4} ${-w*.03} ${h*.62} ${-w/2} ${h/2}Z" fill="url(#gr-leaf-${i})"/><path class="gr-vein" d="M${-w*.42} ${h*.4} Q0 0 ${w*.4} ${-h*.4} M${-w*.12} ${h*.12} Q${-w*.3} ${-h*.02} ${-w*.33} ${-h*.23} M${w*.1} ${-h*.1} Q${w*.25} ${h*.05} ${w*.33} ${h*.14}" stroke="${ink[i]}"/></g><text x="${x}" y="${y-3}" text-anchor="middle" fill="${ink[i]}" class="gr-main-label">${esc(g.label)}</text><text x="${x}" y="${y+16}" text-anchor="middle" fill="${ink[i]}" class="gr-count">${count}개 기록</text></g>`;
    });
    const roots = `<path d="M180 290 C162 306 113 298 69 320 M180 291 C159 310 148 312 137 330 M180 292 C176 311 182 317 179 331 M180 290 C196 307 235 303 291 320 M180 292 C203 306 214 315 221 330" stroke-width="1.4"/>`;
    return `<div class="gr-line-tree"><svg viewBox="0 0 360 350" role="group" aria-label="${esc(name)}의 성장기록 지도"><defs>${defs}</defs><g class="gr-stems">${paths}${roots}</g>${leaves}<image href="icons/growth/sprout-child.png" x="153" y="245" width="54" height="60" aria-hidden="true"/><text x="180" y="345" text-anchor="middle" class="gr-child-name">${esc(name)}</text></svg><p class="gr-map-caption">남긴 성장기록 기준 · 잎을 눌러 기록을 보세요</p></div>`;
  }
  let dbPromise;
  function db() {
    if (!dbPromise) dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open("hannun-growth-records", 1);
      req.onupgradeneeded = () => req.result.createObjectStore("records", { keyPath: "id" }).createIndex("scope", "scope");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => { dbPromise = null; reject(req.error); };
    });
    return dbPromise;
  }
  async function removeLocal(id) { const database = await db(); return new Promise((resolve, reject) => { const tx = database.transaction("records", "readwrite"); tx.objectStore("records").delete(id); tx.oncomplete = () => resolve(); tx.onerror = tx.onabort = () => reject(tx.error); }); }
  // 일정에서 자동으로 붙는 활동 버튼: 반복 수업만 연결하고(1회성 일정은 활동이 아니다), 사용자가 지운 버튼은 이 기기에서 숨긴다.
  const hiddenKey = (scope, familyId) => "hn-growth-hidden-lessons|" + scope + "|" + (familyId || "");
  function hiddenTitles(scope, familyId) { try { const v = JSON.parse(localStorage.getItem(hiddenKey(scope, familyId)) || "[]"); return Array.isArray(v) ? v : []; } catch (e) { return []; } }
  function hideLesson(scope, familyId, title) { try { const v = hiddenTitles(scope, familyId); if (!v.includes(title)) localStorage.setItem(hiddenKey(scope, familyId), JSON.stringify(v.concat(title))); } catch (e) {} }
  function visibleLessons(lessons, scope, familyId) { const hidden = hiddenTitles(scope, familyId); return (lessons || []).filter((l) => l && l.weekly && !hidden.includes(l.title)); }
  async function read(scope) { const database = await db(); return new Promise((resolve, reject) => { const req = database.transaction("records").objectStore("records").index("scope").getAll(scope); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); }); }
  async function save(record) { const database = await db(); return new Promise((resolve, reject) => { const tx = database.transaction("records", "readwrite"); tx.objectStore("records").put(record); tx.oncomplete = () => resolve(); tx.onerror = tx.onabort = () => reject(tx.error || new Error("저장 실패")); }); }
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  // 기록 입력 폼(성장기록 탭과 홈이 함께 쓴다). slot 안에 그리고, 저장하면 c.onSaved(item, saved)를 부른다.
  function buildForm(slot, c) {
    const record = c.record;
      const editing = !!record?.id;
      const paper = !!record?.activity?.endsWith(" 교과 이해 확인");
      const r = record || { group: c.group || "academy", activity: c.activity || "", date: today(), title: "", text: "" };
      slot.innerHTML = `<form class="gr-editor">${c.sheet ? "" : `<div class="gr-section-head"><h3>${editing ? "성장기록 수정" : "성장기록 남기기"}</h3><button type="button" class="gr-edit" data-gr-cancel>닫기</button></div>`}<label for="gr-group">활동 종류</label><select id="gr-group" name="group">${GROUPS.map((g) => `<option value="${g.id}"${r.group === g.id ? " selected" : ""}>${g.label}</option>`).join("")}</select><label for="gr-activity">활동 이름</label><input id="gr-activity" name="activity" maxlength="60" required placeholder="예: 피아노, 학교생활, 숲 체험" value="${esc(r.activity)}"><label for="gr-date">기록 날짜</label><input id="gr-date" name="date" type="date" required value="${esc(r.date)}"><label for="gr-file">캡처·사진 넣기</label><input id="gr-file" name="image" type="file" accept="image/*"><p class="gr-form-note">${r.image ? "저장된 이미지가 있어요. 새 이미지를 고르면 교체돼요." : "안내문 캡처나 활동 사진을 넣어 주세요."} 이미지의 글자는 자동으로 해석하지 않아요.</p><div class="gr-preview"></div><label for="gr-text">선생님 메시지·부모 메모</label><textarea id="gr-text" name="text" maxlength="10000" rows="5" placeholder="${paper ? "실제 답·풀이와 받은 도움을 짧게 남겨요. 예: 문제를 읽어줌 / 처음 본 용어 / 확인하지 못함" : "받은 메시지를 그대로 붙여넣어도 좋아요."}">${esc(r.text)}</textarea><p class="gr-error" role="alert"></p><button type="submit" class="gr-primary">${editing ? "수정 저장" : "기록 저장"}</button>${editing && c.backend.remove ? '<div class="gr-del-row"><button type="button" class="gr-danger" data-gr-del>이 기록 삭제</button></div>' : ""}</form>`;
      const form = slot.querySelector("form");
      const activityField = form.elements.activity;
      activityField.setAttribute("list", "gr-known-activities");
      const choices = document.createElement("datalist"); choices.id = "gr-known-activities"; form.appendChild(choices);
      const updateChoices = () => { choices.innerHTML = linkedActivities(c.getRecords(), c.scope, form.elements.group.value, c.lessons).map((a) => `<option value="${esc(a)}"></option>`).join(""); };
      updateChoices(); form.elements.group.addEventListener("change", updateChoices);
      // 입력창 색 = 고른 분류의 잎 색(분류를 바꾸면 따라 바뀐다)
      const tint = (slot.closest && slot.closest(".hn-sheet")) || form;
      const paint = () => { const col = COLORS[form.elements.group.value]; if (col) { tint.style.setProperty("--hn-person-bg", col.bg); tint.style.setProperty("--gr-bg", col.bg); tint.style.setProperty("--gr-ink", col.ink); } };
      paint(); form.elements.group.addEventListener("change", paint);
      form.elements.image.addEventListener("change", () => { const f = form.elements.image.files[0]; const box = form.querySelector(".gr-preview"); box.innerHTML = ""; form._grImage = null; if (f && /^image\//.test(f.type)) { const pending = shrinkImage(f); form._grImage = pending; pending.then((blob) => { if (form._grImage !== pending) return; const u = URL.createObjectURL(blob); c.urls.push(u); box.innerHTML = `<img src="${u}" alt="첨부 이미지 미리보기">`; }); } });
      form.addEventListener("submit", async (e) => {
        e.preventDefault(); const button = form.querySelector('[type="submit"]'); const error = form.querySelector(".gr-error");
        try { const data = new FormData(form); const picked = form.elements.image.files[0]; const shrunk = picked && form._grImage ? await form._grImage : null; const item = { ...r, ...prepare({ id: r.id, group: data.get("group"), activity: data.get("activity"), date: data.get("date"), title: String(data.get("text") || "").trim().split(/\n/)[0].slice(0, 100) || r.title || (String(data.get("activity") || "").trim().slice(0, 90) + " 기록"), text: data.get("text"), image: shrunk || picked || r.image }, c.scope, r.createdAt || Date.now()), imageChanged: !!form.elements.image.files[0] }; button.disabled = true; button.classList.add("gr-busy"); button.setAttribute("aria-busy", "true"); button.textContent = "저장하는 중…"; error.textContent = ""; const saved = await c.backend.save(item); if (!c.isAlive()) return; c.onSaved(item, saved); }
        catch (err) { if (c.isAlive()) { error.textContent = err.name === "QuotaExceededError" ? "기기 저장 공간이 부족해요. 더 작은 이미지를 골라 주세요." : err.message || "기록을 저장하지 못했어요. 다시 시도해 주세요."; button.disabled = false; button.classList.remove("gr-busy"); button.removeAttribute("aria-busy"); button.textContent = editing ? "수정 저장" : "기록 저장"; } }
      });
      const delRow = form.querySelector(".gr-del-row");
      if (delRow) {
        const idle = delRow.innerHTML;
        delRow.addEventListener("click", async (e) => {
          const b = e.target.closest("button"); if (!b) return; e.preventDefault();
          if (b.hasAttribute("data-gr-del")) { delRow.innerHTML = '<p class="gr-del-ask">이 기록을 삭제할까요? 되돌릴 수 없어요.</p><div class="gr-manage-actions"><button type="button" class="gr-danger" data-gr-del-yes>삭제</button><button type="button" data-gr-del-no>취소</button></div>'; }
          else if (b.hasAttribute("data-gr-del-no")) { delRow.innerHTML = idle; }
          else if (b.hasAttribute("data-gr-del-yes")) {
            const error = form.querySelector(".gr-error"); delRow.querySelectorAll("button").forEach((x) => { x.disabled = true; }); b.classList.add("gr-busy"); b.textContent = "삭제하는 중…"; error.textContent = "";
            try { await c.backend.remove(r); if (!c.isAlive()) return; if (c.onDeleted) c.onDeleted(r); }
            catch (err) { if (c.isAlive()) { error.textContent = err.message || "기록을 삭제하지 못했어요. 다시 시도해 주세요."; delRow.innerHTML = idle; } }
          }
        });
      }
      if (c.onCancel) { const x = form.querySelector("[data-gr-cancel]"); if (x) x.addEventListener("click", (e) => { e.preventDefault(); c.onCancel(); }); }
      if (!c.sheet) slot.scrollIntoView({ block: "start" }); // 창으로 열 때는 자동 선택·키보드 없이 연다(목록이 저절로 펼쳐지지 않게)
  }
  let dispose = null;
  const recordCache = new Map();
  function mount(host, opts) {
    if (dispose) dispose();
    let alive = true, records = [], selected = "academy", activity = "", urls = [], loading = true, failed = false, recordsOpen = !opts.compact, manage = "", manageBusy = false, manageError = "";
    const scope = opts.scope;
    const shownLessons = () => visibleLessons(opts.lessons, scope, opts.familyId);
    const cacheKey = scope + "|" + (opts.familyId || "");
    const formOpen = () => host.querySelector(".gr-editor, .gr-manage-form");
    const backend = opts.backend || {read,save,remove:removeLocal};
    let localImport = [], importing = false, importMessage = "", loadGen = 0;
    function clearUrls() { urls.forEach((u) => URL.revokeObjectURL(u)); urls = []; }
    dispose = () => { alive = false; clearUrls(); };
    function imageMarkup(r) {
      if (r.image) { const u = URL.createObjectURL(r.image); urls.push(u); return `<a href="${u}" target="_blank" rel="noopener" class="gr-image-link"><img src="${u}" alt="${esc(r.title)} 첨부 이미지" loading="lazy"><span>캡처 크게 보기 ↗</span></a>`; }
      if (r.thumb) { const u = URL.createObjectURL(r.thumb); urls.push(u); return `<a href="#" class="gr-image-link" data-gr-full="${esc(r.id)}"><img src="${u}" alt="${esc(r.title)} 첨부 이미지" loading="lazy"><span>캡처 크게 보기 ↗</span></a>`; }
      if (r.attachment && !r.imageError && opts.backend && opts.backend.loadImage) return `<p class="gr-image-pending" data-gr-img="${esc(r.id)}">사진을 불러오고 있어요.</p>`;
      return "";
    }
    // 목록은 사진 없이 먼저 그리고, 사진은 3장씩 받아 그 자리만 바꾼다(열려 있는 입력창을 건드리지 않는다).
    async function hydrateImages(gen) {
      if (!opts.backend || !opts.backend.loadImage) return;
      const queue = list(records, scope, selected, activity).concat(records).filter((r, i, a) => r.attachment && !r.image && !r.thumb && !r.imageError && a.indexOf(r) === i);
      async function worker() {
        while (queue.length) {
          const r = queue.shift(); const got = await opts.backend.loadImage(r);
          if (!alive || gen !== loadGen) return;
          Object.assign(r, got);
          const slot = Array.from(host.querySelectorAll("[data-gr-img]")).find((n) => n.dataset.grImg === r.id);
          if (slot) { const tpl = document.createElement("template"); tpl.innerHTML = (r.image || r.thumb) ? imageMarkup(r) : '<p class="gr-error">사진을 불러오지 못했어요.</p><button type="button" class="gr-edit" data-gr-retry>사진 다시 불러오기</button>'; slot.replaceWith(tpl.content); }
        }
      }
      await Promise.all([worker(), worker(), worker()]);
    }
    function manageMarkup(n) {
      if (!activity) return "";
      const lessonOnly = !n && shownLessons().some((l) => l.title === activity), dis = manageBusy ? " disabled" : "";
      if (manage === "rename") return `<form class="gr-manage-form" data-gr-rename-form><label for="gr-rn-name">활동 이름</label><input id="gr-rn-name" name="name" maxlength="60" required value="${esc(activity)}"><label for="gr-rn-group">활동 종류</label><select id="gr-rn-group" name="group">${GROUPS.map((g) => `<option value="${g.id}"${g.id === selected ? " selected" : ""}>${g.label}</option>`).join("")}</select><p class="gr-form-note">이 활동의 기록 ${n}개가 함께 바뀌어요.</p><p class="gr-error" role="alert">${esc(manageError)}</p><div class="gr-manage-actions"><button type="submit" class="gr-manage-save${manageBusy ? " gr-busy" : ""}"${dis}>${manageBusy ? "바꾸는 중…" : "저장"}</button><button type="button" data-gr-manage-cancel${dis}>취소</button></div></form>`;
      if (manage === "delete") return `<div class="gr-manage-confirm"><p>${n ? `‘${esc(activity)}’ 활동과 기록 ${n}개를 삭제할까요? 되돌릴 수 없어요.` : `‘${esc(activity)}’ 버튼을 목록에서 지울까요? 캘린더 일정은 그대로 남아요.`}</p><p class="gr-error" role="alert">${esc(manageError)}</p><div class="gr-manage-actions"><button type="button" class="gr-danger${manageBusy ? " gr-busy" : ""}" data-gr-delete-confirm${dis}>${manageBusy ? "삭제하는 중…" : "삭제"}</button><button type="button" data-gr-manage-cancel${dis}>취소</button></div></div>`;
      return `<div class="gr-manage">${n ? '<button type="button" data-gr-manage="rename">이름·종류 바꾸기</button>' : ""}<button type="button" class="gr-danger" data-gr-manage="delete">${n ? "이 활동 삭제" : "목록에서 지우기"}</button></div>${lessonOnly ? '<p class="gr-form-note">캘린더 일정에서 자동으로 생긴 버튼이에요. 일정 이름은 캘린더에서 바꿀 수 있어요.</p>' : ""}`;
    }
    function render() {
      if (!alive) return;
      clearUrls();
      const lessons = shownLessons(), acts = linkedActivities(records, scope, selected, lessons).map((a, i) => [a, i]).sort((x, y) => list(records, scope, selected, y[0]).length - list(records, scope, selected, x[0]).length || x[1] - y[1]).map((x) => x[0]); // 기록이 많은 활동이 앞(기본 선택)
      if (!loading && (!activity || !acts.includes(activity))) activity = acts[0] || ""; // 분류를 고르면 첫 활동이 기본 선택
      const all = list(records, scope), current = list(records, scope, selected, activity), group = GROUPS.find((g) => g.id === selected), cnt = (g, a) => list(records, scope, g, a).length;
      const tabs = TAB_ORDER.map((id) => { const g = GROUPS.find((x) => x.id === id); return `<button type="button" role="tab" data-gr-group="${id}" aria-selected="${id === selected}" class="${id === selected ? "on" : ""}">${esc(g.short || g.label)}<small>${cnt(id)}</small></button>`; }).join("");
      const tags = acts.map((a) => `<button type="button" data-gr-activity="${esc(a)}" aria-pressed="${a === activity}">${esc(a)}<em>(${cnt(selected, a)})</em></button>`).join("");
      host.innerHTML = `<div class="gr-page gr-g-${selected}">${treeMarkup(records, scope, lessons, opts.name, selected, activity)}
      <div class="gr-folder"><div class="gr-fold" role="tablist" aria-label="활동 분류">${tabs}</div>
      <section class="gr-records gr-panel">${tags ? `<div class="gr-activities" role="group" aria-label="활동별 기록">${tags}</div>` : ""}
      <button type="button" class="gr-add-wide" data-gr-add${loading || failed ? " disabled" : ""}>＋ 성장기록 남기기</button>
      ${manageMarkup(current.length)}
      ${activity ? `<div class="gr-section-head"><h3>${esc(activity)}의 기록</h3><span>${current.length}개의 순간</span></div>` : ""}
      <div class="gr-timeline" aria-live="polite">${loading ? '<p class="gr-empty">기록을 불러오고 있어요.</p>' : failed ? '<p class="gr-empty">기록을 불러오지 못했어요. 저장 공간을 사용할 수 있는지 확인하고 다시 시도해 주세요.</p><button type="button" class="gr-secondary" data-gr-retry>다시 불러오기</button>' : current.length ? current.map((r) => {
        const image = imageMarkup(r);
        return `<article class="gr-record"><time datetime="${r.date}">${r.date.replace(/-/g, ".")}</time><span class="gr-activity-label">${esc(r.activity)}</span><h4>${esc(r.title)}</h4>${r.text ? `<p>${esc(r.text)}</p>` : ""}${image}${r.imageError ? '<p class="gr-error">사진을 불러오지 못했어요.</p><button type="button" class="gr-edit" data-gr-retry>사진 다시 불러오기</button>' : ""}<button type="button" class="gr-edit" data-gr-edit="${esc(r.id)}">기록 수정</button></article>`;
      }).join("") : `<div class="gr-empty"><strong>아직 ${esc(activity || group.label)} 기록이 없어요.</strong><p>선생님이 보내준 메시지나 캡처 한 장으로<br>첫 순간을 남겨보세요.</p></div>`}</div></section></div>
      ${!opts.compact && all.length ? `<section class="gr-story"><p class="gr-kicker">기록으로 이어지는 이야기</p><h3>${esc(opts.name)}의 ${esc(all[0].date.slice(0, 7).replace("-", "."))}</h3><p>${esc(all.filter((r) => r.date.slice(0, 7) === all[0].date.slice(0, 7)).slice(0, 3).map((r) => `${r.activity}에서 “${r.title}”`).join(" · "))}</p><small>남겨둔 기록 제목을 모았어요.</small></section>` : ""}
      <p class="gr-storage-note">${opts.backend ? "로그인한 가족과 아이별로 공유돼요. 기기 원본은 유지돼요." : "이 기기에 아이별로 저장돼요. 다른 기기·가족과 자동 공유되지 않아요."}</p>${opts.backend && (localImport.length || importMessage) ? `<div class="gr-import"><p>이 기기의 성장기록 ${localImport.length}개를 가족에게 공유할 수 있어요.</p>${localImport.length?`<button type="button" class="gr-secondary" data-gr-import ${importing?"disabled":""}>${importing?"이전 중…":"기기 기록 서버로 옮기기"}</button>`:""}<p role="status">${esc(importMessage)}</p></div>` : ""}<div class="gr-editor-slot"></div></div>`;
      opts.onRendered?.(host, {records:all,loading,failed});
    }
    function editor(record) {
      if (opts.onOpenForm) { opts.onOpenForm(record || null, { group: selected, activity }); return; } // 입력 폼을 메뉴 위 창으로 띄우는 화면(앱)에서는 안쪽 폼을 열지 않는다
      buildForm(host.querySelector(".gr-editor-slot"), { record, group: selected, activity, scope, backend, lessons: shownLessons(), urls, getRecords: () => records, isAlive: () => alive,
        onDeleted: (item) => { records = records.filter((x) => x.id !== item.id); if (opts.backend) recordCache.set(cacheKey, records); if (!records.some((x) => x.group === selected && x.activity === activity)) activity = ""; if (opts.onChanged) opts.onChanged(); render(); },
        onSaved: (item, saved) => { records = records.filter((x) => x.id !== item.id).concat(saved || item); if (opts.backend) recordCache.set(scope + "|" + (opts.familyId || ""), records); if (opts.onChanged) opts.onChanged(); selected = item.group; activity = item.activity; recordsOpen = true; render(); host.querySelector(".gr-records").scrollIntoView({ block: "start" }); } });
    }
    host.onclick = (e) => {
      const full = e.target.closest && e.target.closest("[data-gr-full]");
      if (full) { e.preventDefault(); openFull(records.find((r) => r.id === full.dataset.grFull)); return; }
      const b = e.target.closest("button,[data-gr-group],[data-gr-activity]"); if (!b || !alive) return;
      if (b.hasAttribute("data-gr-group") || b.hasAttribute("data-gr-activity")) { manage = ""; manageError = ""; }
      if (b.hasAttribute("data-gr-toggle")) { recordsOpen = !recordsOpen; render(); }
      else if (b.hasAttribute("data-gr-paper-record")) { if (!loading && !failed) editor({group:"home",activity:b.dataset.grPaperRecord + " 교과 이해 확인",date:today(),title:b.dataset.grPaperRecord + " 종이 답안",text:""}); }
      else if (b.hasAttribute("data-gr-group")) { recordsOpen = !opts.compact || selected !== b.dataset.grGroup || !recordsOpen; selected = b.dataset.grGroup; activity = ""; render(); }
      else if (b.hasAttribute("data-gr-activity")) { recordsOpen = !opts.compact || !b.dataset.grLeafGroup || activity !== b.dataset.grActivity || !recordsOpen; activity = b.dataset.grActivity; if (b.dataset.grLeafGroup) selected = b.dataset.grLeafGroup; render(); }
      else if (b.hasAttribute("data-gr-manage")) { manage = b.dataset.grManage; manageError = ""; render(); }
      else if (b.hasAttribute("data-gr-manage-cancel")) { if (!manageBusy) { manage = ""; manageError = ""; render(); } }
      else if (b.hasAttribute("data-gr-delete-confirm")) deleteActivity();
      else if (b.hasAttribute("data-gr-add")) editor();
      else if (b.hasAttribute("data-gr-edit")) openEditor(records.find((r) => r.id === b.dataset.grEdit));
      else if (b.hasAttribute("data-gr-cancel")) render();
      else if (b.hasAttribute("data-gr-retry")) load();
      else if (b.hasAttribute("data-gr-import")) importRecords();
      else if (b.hasAttribute("data-gr-calendar") && opts.onCalendar) opts.onCalendar();
    };
    host.onsubmit = (e) => { const f = e.target; if (f && f.matches && f.matches("[data-gr-rename-form]")) { e.preventDefault(); if (!manageBusy) renameActivity(f.elements.name.value, f.elements.group.value); } };
    const activityRecords = (group, name) => records.filter((r) => r.scope === scope && r.group === group && r.activity === name && !r.deletedAt);
    const syncCache = () => { if (opts.backend) recordCache.set(cacheKey, records); };
    // 활동 이름·종류 바꾸기: 그 활동의 기록을 모두 새 이름·종류로 다시 저장한다. 하나라도 실패하면 바뀐 것까지만 반영하고 알려 준다.
    async function renameActivity(rawName, toGroup) {
      const name = String(rawName || "").trim(), from = activity, fromGroup = selected;
      if (!name || name.length > 60) { manageError = "활동 이름을 60자 이내로 입력해 주세요."; render(); return; }
      if (!GROUPS.some((g) => g.id === toGroup)) { manageError = "활동 종류를 골라 주세요."; render(); return; }
      if (name === from && toGroup === fromGroup) { manage = ""; render(); return; }
      const targets = activityRecords(fromGroup, from), failures = [];
      manageBusy = true; manageError = ""; render();
      for (const r of targets) {
        try { const saved = await backend.save({ ...r, group: toGroup, activity: name, activityId: undefined, imageChanged: false }); if (!alive) return; records = records.filter((x) => x.id !== r.id).concat(saved || { ...r, group: toGroup, activity: name }); }
        catch (err) { if (!alive) return; failures.push(err.message || "저장 실패"); }
      }
      manageBusy = false; syncCache(); if (opts.onChanged) opts.onChanged();
      if (failures.length) { manageError = `${failures.length}개를 바꾸지 못했어요. ${failures[0]}`; if (failures.length < targets.length) { activity = name; selected = toGroup; } }
      else { activity = name; selected = toGroup; manage = ""; }
      render();
    }
    // 활동 삭제: 기록을 지우고, 일정에서 자동으로 생긴 버튼이면 이 기기의 목록에서도 숨긴다(캘린더 일정은 그대로).
    async function deleteActivity() {
      const from = activity, targets = activityRecords(selected, from), failures = [];
      if (targets.length && !backend.remove) { manageError = "이 저장소에서는 삭제할 수 없어요."; render(); return; }
      manageBusy = true; manageError = ""; render();
      for (const r of targets) {
        try { await backend.remove(r); if (!alive) return; records = records.filter((x) => x.id !== r.id); }
        catch (err) { if (!alive) return; failures.push(err.message || "삭제 실패"); }
      }
      manageBusy = false; syncCache(); if (targets.length && opts.onChanged) opts.onChanged();
      if (failures.length) manageError = `${failures.length}개를 지우지 못했어요. ${failures[0]}`;
      else { if (selected === "academy" && (opts.lessons || []).some((l) => l.title === from)) hideLesson(scope, opts.familyId, from); activity = ""; manage = ""; }
      render();
    }
    host.onkeydown = (e) => { if ((e.key === "Enter" || e.key === " ") && e.target.matches(".gr-svg-leaf")) { e.preventDefault(); e.target.dispatchEvent(new MouseEvent("click", { bubbles: true })); } };
    // 사진이 아직 안 내려온 기록은 사진을 받은 뒤에 열어야 저장할 때 첨부가 지워지지 않는다.
    async function openEditor(r) {
      if (r && r.attachment && !r.image && opts.backend && opts.backend.loadImage) { Object.assign(r, await opts.backend.loadImage(r, { full: true })); if (!alive) return; }
      editor(r);
    }
    // 목록에는 썸네일만 있다. 크게 보기를 누르면 원본을 받아 새 탭에 연다(팝업 차단을 피하려고 탭을 먼저 연다).
    async function openFull(r) {
      if (!r) return;
      if (r.image) { window.open(URL.createObjectURL(r.image), "_blank"); return; }
      const tab = window.open("", "_blank");
      const got = await opts.backend.loadImage(r, { full: true });
      if (got.image) { r.image = got.image; const u = URL.createObjectURL(got.image); if (tab) tab.location.href = u; else window.open(u, "_blank"); }
      else if (tab) { tab.close(); }
    }
    async function importRecords() {
      if(importing||!opts.backend)return;
      importing=true;importMessage="";render();
      try { const result=await backend.importLocal(localImport,scope);if(!alive)return;importMessage=`${result.done}개 이전 완료`+(result.failed.length?` · ${result.failed.length}개 실패: ${result.failed[0].message}`:"");localImport=localImport.filter(r=>result.failed.some(f=>f.id===r.id));records=await backend.read(scope,{attachments:false}); }
      catch(e){if(alive)importMessage=e.message;}
      finally{if(alive){importing=false;render();hydrateImages(loadGen);}}
    }
    async function load() {
      const gen = ++loadGen, key = opts.backend ? scope + "|" + (opts.familyId || "") : "", cached = key && recordCache.get(key);
      // 같은 아이를 다시 열면 지난 결과를 바로 보여 주고, 서버 결과는 뒤에서 받아 바꾼다.
      if (cached) { records = cached; loading = false; failed = false; } else { loading = true; failed = false; }
      render();
      try {
        const result = await backend.read(scope, { attachments: false });
        if (!alive || gen !== loadGen) return;
        if (cached) result.forEach((r) => { const old = cached.find((c) => c.id === r.id); if (old && (old.image || old.thumb) && r.attachment && old.attachment && old.attachment.storagePath === r.attachment.storagePath && (old.attachment.thumbPath || "") === (r.attachment.thumbPath || "")) { r.image = old.image || null; r.thumb = old.thumb || null; r.imageError = false; r.attachmentStatus = old.attachmentStatus; } });
        records = result; loading = false; if (key) recordCache.set(key, result);
        if (!cached || !formOpen()) render();
      } catch (e) { if (alive && gen === loadGen && !cached) { loading = false; failed = true; render(); } if (!cached) return; }
      hydrateImages(gen);
      if (opts.backend) {
        try { const pending = await backend.pendingLocal(await read(scope), scope); if (!alive || gen !== loadGen) return; localImport = pending; }
        catch (e) { if (!alive || gen !== loadGen) return; localImport = []; importMessage = e.message || "기기 기록을 확인하지 못했어요."; }
        if (!formOpen()) render();
      }
    }
    load();
  }
  // 홈 카드의 '총 N건' — 서버(backend)가 있으면 사진 없이 목록만 읽고, 없으면 이 기기 저장소를 센다.
  // 홈에서 바로 여는 '오늘의 성장 남기기' 폼 — 성장기록 탭을 거치지 않는다. o: { backend, scope, familyId, lessons, onSaved(record), onClose() }. 닫기 함수를 돌려준다.
  function openForm(host, o) {
    let alive = true; const urls = [], backend = o.backend || { read, save, remove: removeLocal }, key = o.scope + "|" + (o.familyId || ""); let records = recordCache.get(key) || [];
    host.innerHTML = '<div class="gr-editor-slot"></div>';
    const dispose = () => { alive = false; urls.forEach((u) => URL.revokeObjectURL(u)); urls.length = 0; };
    if (!records.length) Promise.resolve().then(() => backend.read(o.scope, { attachments: false })).then((rows) => { if (alive) records = rows; }).catch(() => {}); // 활동 이름 제안용(실패해도 입력에는 영향 없음)
    buildForm(host.querySelector(".gr-editor-slot"), { sheet: true, record: o.record || null, group: o.group || "academy", activity: o.activity || "", scope: o.scope, backend, lessons: visibleLessons(o.lessons, o.scope, o.familyId), urls, getRecords: () => records, isAlive: () => alive,
      onCancel: () => { dispose(); if (o.onClose) o.onClose(); },
      onDeleted: (item) => { const got = recordCache.get(key); if (got) recordCache.set(key, got.filter((x) => x.id !== item.id)); dispose(); if (o.onDeleted) o.onDeleted(item); },
      onSaved: (item, saved) => { const got = recordCache.get(key), rec = saved || item; if (got) recordCache.set(key, got.filter((x) => x.id !== rec.id).concat(rec)); dispose(); if (o.onSaved) o.onSaved(rec); } }); // 캐시를 지우지 않고 저장한 기록만 더한다 — 성장기록 탭이 지난 결과를 바로 보여 주고 서버 결과를 뒤에서 받는다
    return dispose;
  }
  const countInflight = new Map();
  async function count(scope, backend, familyId) {
    if (!backend) return (await read(scope)).filter((r) => !r.deletedAt).length;
    const key = scope + "|" + (familyId || ""), cached = recordCache.get(key);
    if (cached) return cached.filter((r) => !r.deletedAt).length; // 성장기록 탭이 이미 읽어 둔 결과가 있으면 서버를 다시 부르지 않는다
    if (!countInflight.has(key)) countInflight.set(key, backend.read(scope, { attachments: false }).then((rows) => { recordCache.set(key, rows); return rows; }).finally(() => countInflight.delete(key))); // 같은 읽기는 한 번만, 결과는 성장기록 탭도 그대로 쓴다
    return (await countInflight.get(key)).filter((r) => !r.deletedAt).length;
  }
  return { GROUPS, COLORS, eligible, prepare, list, activities, linkedActivities, visibleLessons, hideLesson, treeMarkup, mount, openForm, count, unmount: () => { if(dispose) dispose(); } };
});
