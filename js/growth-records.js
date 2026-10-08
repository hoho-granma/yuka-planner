(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else root.GrowthRecords = factory();
})(typeof window !== "undefined" ? window : global, function () {
  "use strict";
  const GROUPS = [{ id: "school", label: "학교", hint: "학교에서의 하루" }, { id: "academy", label: "학원", hint: "배우는 즐거움" }, { id: "activity", label: "그 외 활동", hint: "새로운 경험" }, { id: "home", label: "가정 활동", hint: "함께하는 일상" }];
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
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
    return { id: input.id || (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${now}-${Math.random().toString(36).slice(2)}`), scope, group: input.group, activity, title, text, date, image: input.image || null, createdAt: now };
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
  async function read(scope) { const database = await db(); return new Promise((resolve, reject) => { const req = database.transaction("records").objectStore("records").index("scope").getAll(scope); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); }); }
  async function save(record) { const database = await db(); return new Promise((resolve, reject) => { const tx = database.transaction("records", "readwrite"); tx.objectStore("records").put(record); tx.oncomplete = () => resolve(); tx.onerror = tx.onabort = () => reject(tx.error || new Error("저장 실패")); }); }
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  let dispose = null;
  function mount(host, opts) {
    if (dispose) dispose();
    let alive = true, records = [], selected = "academy", activity = "", urls = [], loading = true, failed = false;
    const scope = opts.scope;
    const backend = opts.backend || {read,save};
    let localImport = [], importing = false, importMessage = "";
    function clearUrls() { urls.forEach((u) => URL.revokeObjectURL(u)); urls = []; }
    dispose = () => { alive = false; clearUrls(); };
    function render() {
      if (!alive) return;
      clearUrls();
      const all = list(records, scope), current = list(records, scope, selected, activity), group = GROUPS.find((g) => g.id === selected), lessons = opts.lessons || [];
      host.innerHTML = `<div class="gr-page">${treeMarkup(records, scope, lessons, opts.name, selected, activity)}
      <section class="gr-records"><div class="gr-section-head"><h3>${esc(activity || group.label)}의 기록</h3><span>${current.length}개의 순간</span></div><div class="gr-activities" role="group" aria-label="활동별 기록"><button type="button" data-gr-activity="" aria-pressed="${!activity}">전체</button>${linkedActivities(records, scope, selected, lessons).map((a) => `<button type="button" data-gr-activity="${esc(a)}" aria-pressed="${a === activity}">${esc(a)}</button>`).join("")}</div>
      ${selected === "academy" && lessons.length ? `<div class="gr-linked"><strong>교육트렌드에 등록한 학원 일정</strong>${lessons.filter((l) => !activity || l.title === activity).map((l) => `<p>${esc(l.title)} <small>${l.weekly ? `주 ${l.weekly}회` : "반복 없음"}</small></p>`).join("")}<button type="button" class="gr-edit" data-gr-calendar>캘린더에서 일정 보기 →</button><small>수업 일정이 활동으로 연결돼요. 활동 기록은 직접 남겨 주세요.</small></div>` : ""}
      <div class="gr-timeline" aria-live="polite">${loading ? '<p class="gr-empty">기록을 불러오고 있어요.</p>' : failed ? '<p class="gr-empty">기록을 불러오지 못했어요. 저장 공간을 사용할 수 있는지 확인하고 다시 시도해 주세요.</p><button type="button" class="gr-secondary" data-gr-retry>다시 불러오기</button>' : current.length ? current.map((r) => {
        let image = ""; if (r.image) { const u = URL.createObjectURL(r.image); urls.push(u); image = `<a href="${u}" target="_blank" rel="noopener" class="gr-image-link"><img src="${u}" alt="${esc(r.title)} 첨부 이미지" loading="lazy"><span>캡처 크게 보기 ↗</span></a>`; }
        return `<article class="gr-record"><time datetime="${r.date}">${r.date.replace(/-/g, ".")}</time><span class="gr-activity-label">${esc(r.activity)}</span><h4>${esc(r.title)}</h4>${r.text ? `<p>${esc(r.text)}</p>` : ""}${image}${r.imageError ? '<p class="gr-error">사진을 불러오지 못했어요.</p><button type="button" class="gr-edit" data-gr-retry>사진 다시 불러오기</button>' : ""}<button type="button" class="gr-edit" data-gr-edit="${esc(r.id)}">기록 수정</button></article>`;
      }).join("") : `<div class="gr-empty"><strong>아직 ${esc(group.label)} 기록이 없어요.</strong><p>선생님이 보내준 메시지나 캡처 한 장으로<br>첫 순간을 남겨보세요.</p></div>`}</div></section>
      ${all.length ? `<section class="gr-story"><p class="gr-kicker">기록으로 이어지는 이야기</p><h3>${esc(opts.name)}의 ${esc(all[0].date.slice(0, 7).replace("-", "."))}</h3><p>${esc(all.filter((r) => r.date.slice(0, 7) === all[0].date.slice(0, 7)).slice(0, 3).map((r) => `${r.activity}에서 “${r.title}”`).join(" · "))}</p><small>남겨둔 기록 제목을 모았어요.</small></section>` : ""}
      <button type="button" class="gr-primary" data-gr-add${loading || failed ? " disabled" : ""}>＋ 오늘의 성장 남기기</button><p class="gr-storage-note">${opts.backend ? "로그인한 가족과 아이별로 공유돼요. 기기 원본은 유지돼요." : "이 기기에 아이별로 저장돼요. 다른 기기·가족과 자동 공유되지 않아요."}</p>${opts.backend && (localImport.length || importMessage) ? `<div class="gr-import"><p>이 기기의 성장기록 ${localImport.length}개를 가족에게 공유할 수 있어요.</p>${localImport.length?`<button type="button" class="gr-secondary" data-gr-import ${importing?"disabled":""}>${importing?"이전 중…":"기기 기록 서버로 옮기기"}</button>`:""}<p role="status">${esc(importMessage)}</p></div>` : ""}<div class="gr-editor-slot"></div></div>`;
    }
    function editor(record) {
      const r = record || { group: selected, activity, date: today(), title: "", text: "" };
      const slot = host.querySelector(".gr-editor-slot");
      slot.innerHTML = `<form class="gr-editor"><div class="gr-section-head"><h3>${record ? "성장기록 수정" : "성장기록 남기기"}</h3><button type="button" class="gr-edit" data-gr-cancel>닫기</button></div><label for="gr-group">활동 종류</label><select id="gr-group" name="group">${GROUPS.map((g) => `<option value="${g.id}"${r.group === g.id ? " selected" : ""}>${g.label}</option>`).join("")}</select><label for="gr-activity">활동 이름</label><input id="gr-activity" name="activity" maxlength="60" required placeholder="예: 피아노, 학교생활, 숲 체험" value="${esc(r.activity)}"><label for="gr-date">기록 날짜</label><input id="gr-date" name="date" type="date" required value="${esc(r.date)}"><label for="gr-file">캡처·사진 넣기</label><input id="gr-file" name="image" type="file" accept="image/*"><p class="gr-form-note">${r.image ? "저장된 이미지가 있어요. 새 이미지를 고르면 교체돼요." : "안내문 캡처나 활동 사진을 넣어 주세요."} 이미지의 글자는 자동으로 해석하지 않아요.</p><div class="gr-preview"></div><label for="gr-text">선생님 메시지·부모 메모</label><textarea id="gr-text" name="text" maxlength="10000" rows="5" placeholder="받은 메시지를 그대로 붙여넣어도 좋아요.">${esc(r.text)}</textarea><label for="gr-title">기억할 순간</label><input id="gr-title" name="title" maxlength="100" required placeholder="예: 두 손으로 끝까지 연주했어요" value="${esc(r.title)}"><p class="gr-error" role="alert"></p><button type="submit" class="gr-primary">${record ? "수정 저장" : "기록 저장"}</button></form>`;
      const form = slot.querySelector("form");
      const activityField = form.elements.activity;
      activityField.setAttribute("list", "gr-known-activities");
      const choices = document.createElement("datalist"); choices.id = "gr-known-activities"; form.appendChild(choices);
      const updateChoices = () => { choices.innerHTML = linkedActivities(records, scope, form.elements.group.value, opts.lessons).map((a) => `<option value="${esc(a)}"></option>`).join(""); };
      updateChoices(); form.elements.group.addEventListener("change", updateChoices);
      form.querySelector('[name="text"]').addEventListener("blur", () => { const title = form.elements.title; if (!title.value.trim()) title.value = form.elements.text.value.trim().split(/\n/)[0].slice(0, 100); });
      form.elements.image.addEventListener("change", () => { const f = form.elements.image.files[0]; const box = form.querySelector(".gr-preview"); box.innerHTML = ""; if (f && /^image\//.test(f.type)) { const u = URL.createObjectURL(f); urls.push(u); box.innerHTML = `<img src="${u}" alt="첨부 이미지 미리보기">`; } });
      form.addEventListener("submit", async (e) => {
        e.preventDefault(); const button = form.querySelector('[type="submit"]'); const error = form.querySelector(".gr-error");
        try { const data = new FormData(form); const item = { ...r, ...prepare({ id: r.id, group: data.get("group"), activity: data.get("activity"), date: data.get("date"), title: data.get("title"), text: data.get("text"), image: form.elements.image.files[0] || r.image }, scope, r.createdAt || Date.now()), imageChanged: !!form.elements.image.files[0] }; button.disabled = true; error.textContent = ""; const saved = await backend.save(item); if (!alive) return; records = records.filter((x) => x.id !== item.id).concat(saved || item); selected = item.group; activity = item.activity; render(); host.querySelector(".gr-records").scrollIntoView({ block: "start" }); }
        catch (err) { if (alive) { error.textContent = err.name === "QuotaExceededError" ? "기기 저장 공간이 부족해요. 더 작은 이미지를 골라 주세요." : err.message || "기록을 저장하지 못했어요. 다시 시도해 주세요."; button.disabled = false; } }
      });
      slot.scrollIntoView({ block: "start" }); form.elements.activity.focus();
    }
    host.onclick = (e) => {
      const b = e.target.closest("button,[data-gr-group],[data-gr-activity]"); if (!b || !alive) return;
      if (b.hasAttribute("data-gr-group")) { selected = b.dataset.grGroup; activity = ""; render(); }
      else if (b.hasAttribute("data-gr-activity")) { activity = b.dataset.grActivity; if (b.dataset.grLeafGroup) selected = b.dataset.grLeafGroup; render(); }
      else if (b.hasAttribute("data-gr-add")) editor();
      else if (b.hasAttribute("data-gr-edit")) editor(records.find((r) => r.id === b.dataset.grEdit));
      else if (b.hasAttribute("data-gr-cancel")) render();
      else if (b.hasAttribute("data-gr-retry")) load();
      else if (b.hasAttribute("data-gr-import")) importRecords();
      else if (b.hasAttribute("data-gr-calendar") && opts.onCalendar) opts.onCalendar();
    };
    host.onkeydown = (e) => { if ((e.key === "Enter" || e.key === " ") && e.target.matches(".gr-svg-leaf")) { e.preventDefault(); e.target.dispatchEvent(new MouseEvent("click", { bubbles: true })); } };
    async function importRecords() {
      if(importing||!opts.backend)return;
      importing=true;importMessage="";render();
      try { const result=await backend.importLocal(localImport,scope);if(!alive)return;importMessage=`${result.done}개 이전 완료`+(result.failed.length?` · ${result.failed.length}개 실패: ${result.failed[0].message}`:"");localImport=localImport.filter(r=>result.failed.some(f=>f.id===r.id));records=await backend.read(scope); }
      catch(e){if(alive)importMessage=e.message;}
      finally{if(alive){importing=false;render();}}
    }
    async function load() { loading = true; failed = false; render(); try { const result = await backend.read(scope); if(opts.backend) { try { localImport = await backend.pendingLocal(await read(scope),scope); } catch(e) { localImport=[];importMessage=e.message || "기기 기록을 확인하지 못했어요."; } } if (!alive) return; records = result; loading = false; render(); } catch (e) { if (alive) { loading = false; failed = true; render(); } } }
    load();
  }
  return { GROUPS, eligible, prepare, list, activities, linkedActivities, treeMarkup, mount };
});
