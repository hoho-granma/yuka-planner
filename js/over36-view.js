/*
 * over36-view — 36개월 이상 아이의 메뉴(G22): 홈 · 할 일(메모장형 체크리스트) · 날짜 하프 시트의 마크업(순수 모듈: DOM·저장소·네트워크 없음).
 * 이벤트 연결·저장은 app.js 가 한다. 버튼은 data-a36 속성으로 의도를 표시한다:
 *   data-a36="todos | add-home | add | hide-done | day-add | day-prev | day-next | quick | menu-edit | menu-top | menu-del | menu-close"
 *   data-a36-toggle="<todoId>" · data-a36-row="<todoId>"(길게 눌러 메뉴) · data-a36-quick="<제목>" · data-a36-ev="<scheduleId>|<key>"
 */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else root.Over36View = factory();
})(typeof window !== "undefined" ? window : global, function () {
  "use strict";

  const esc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  const MSG = Object.freeze({
    navTodo: "할 일",
    todoTitle: (name) => `${name} 체크리스트`,
    homeTodoTitle: (name) => `${name} 할 일`,
    homeTodoMore: "할 일 ›",
    familyMore: "캘린더 ›",
    hideDone: "완료 숨기기",
    add: "체크리스트 추가 +",
    inputPlaceholder: "할 일을 적고 엔터",
    emptyHint: "할 일을 한 줄씩 적어 보세요. 완료하면 줄이 그어져요.",
    pressHint: "완료한 줄은 제자리에서 줄이 그어져요. 길게 누르면 메뉴가 떠요.",
    menuEdit: "고치기", menuTop: "맨 위로", menuDel: "삭제", menuClose: "닫기",
    doneLabel: "완료",
    noHousehold: "가족 캘린더가 만들어지면 할 일을 적을 수 있어요.",
    preparing: "준비 중이에요… 잠시만 기다려 주세요.",
    tooLong: "100자 이내로 적어 주세요.",
    quickTitle: "자주 쓰는 일정",
    quick: Object.freeze(["학원", "숙제", "준비물"]),
    dayAdd: "+ 추가",
    dayEmpty: (m, d) => `${m}월 ${d}일은 비어 있어요.`,
    dayEmptyAdd: "이 날 일정 추가",
    daySwipeHint: "좌우로 넘겨 다른 날 보기",
    dayPrev: (p) => `‹ ${p}일`,
    dayNext: (n) => `${n}일 ›`,
    allDay: "종일",
    weekdays: Object.freeze(["일", "월", "화", "수", "목", "금", "토"]),
  });

  /** 'HH:MM' → ["오후","3:30"] (시트 왼쪽 시간 열은 두 줄) */
  function clockParts(t) {
    const m = /^(\d{2}):(\d{2})$/.exec(String(t || ""));
    if (!m) return null;
    const h = Number(m[1]);
    return [h < 12 ? "오전" : "오후", `${h % 12 === 0 ? 12 : h % 12}:${m[2]}`];
  }
  const timeCell = (r) => {
    if (r.allDay || !r.startTime) return `<span class="a36-tm">${esc(MSG.allDay)}</span>`;
    const p = clockParts(r.startTime);
    return p ? `<span class="a36-tm">${esc(p[0])}<br>${esc(p[1])}</span>` : `<span class="a36-tm">${esc(MSG.allDay)}</span>`;
  };

  const check = (id, done) => `<button type="button" class="a36-cb${done ? " on" : ""}" data-a36-toggle="${esc(id)}" role="checkbox" aria-checked="${done ? "true" : "false"}" aria-label="${esc(MSG.doneLabel)}"></button>`;

  /** 홈(36개월 이상): 아이 칩 → 오늘·이번 주 우리 가족 카드(familyHtml) → [아이] 할 일 카드 → 자주 쓰는 일정 칩.
   *  st: { kids:[{code,name,ageText,current}], name, familyHtml, todos:{open,done,openTotal}, canTodo } */
  function renderHome(st) {
    const kids = st.kids || [];
    const chips = kids.length >= 2
      ? `<div class="home-child-chips a36-chips" role="tablist">${kids.map((c) => `<button type="button" role="tab" aria-selected="${c.current ? "true" : "false"}" class="home-child-chip${c.current ? " active" : ""}" data-home-child="${esc(c.code)}">${esc(c.name)}${c.ageText ? ` <small>${esc(c.ageText)}</small>` : ""}</button>`).join("")}</div>`
      : "";
    const t = st.todos || { open: [], done: [] };
    const rows = [...t.open, ...t.done]
      .map((d) => `<div class="a36-row${d.done ? " done" : ""}" data-a36-row="${esc(d.id)}">${check(d.id, d.done)}<span class="a36-t">${esc(d.title)}</span>${d.done ? `<small>${esc(MSG.doneLabel)}</small>` : ""}</div>`)
      .join("");
    const todo = `<section class="home-sec a36-card" id="a36-home-todo"><div class="home-sec-head"><h3>${esc(MSG.homeTodoTitle(st.name || ""))}</h3><button type="button" class="a36-more" data-a36="todos">${esc(MSG.homeTodoMore)}</button></div>${st.canTodo === false ? `<p class="home-empty-line" data-a36-preparing>${esc(MSG.preparing)}</p>` : `${rows || `<p class="home-empty-line">${esc(MSG.emptyHint)}</p>`}<button type="button" class="a36-add" data-a36="add-home">${esc(MSG.add)}</button>`}</section>`;
    const quick = `<div class="a36-quick"><small>${esc(MSG.quickTitle)}</small>${MSG.quick.map((q) => `<button type="button" data-a36="quick" data-a36-quick="${esc(q)}">${esc(q)}</button>`).join("")}</div>`;
    return `${chips}${st.familyHtml || ""}${todo}${quick}`;
  }

  /** 할 일 탭(메모장형). st: { name, list:[{id,title,done}], hideDone, canTodo, adding, editId } — 입력 줄은 app 이 열고 닫는다(adding=true 면 맨 아래에 입력 줄). */
  function renderTodoTab(st) {
    const head = `<div class="a36-head"><h2>${esc(MSG.todoTitle(st.name || ""))}</h2><button type="button" class="a36-sw" role="switch" aria-checked="${st.hideDone ? "true" : "false"}" data-a36="hide-done"><span>${esc(MSG.hideDone)}</span><i></i></button></div>`;
    if (st.canTodo === false) return `${head}<p class="a36-hint" data-a36-preparing>${esc(MSG.preparing)}</p>`; // 가구·아이 연결이 준비되면 앱이 다시 그린다
    const rows = (st.list || [])
      .map((d) => {
        const body = st.editId === d.id
          ? `<input type="text" class="a36-in" maxlength="100" data-a36-input="edit" data-a36-id="${esc(d.id)}" value="${esc(d.title)}" enterkeyhint="done" />`
          : `<span class="a36-t${d.done ? " done" : ""}">${esc(d.title)}</span>`;
        return `<div class="a36-row${d.done ? " done" : ""}" data-a36-row="${esc(d.id)}">${check(d.id, d.done)}${body}</div>`;
      })
      .join("");
    const input = st.adding ? `<div class="a36-row a36-inrow"><i class="a36-cb"></i><input type="text" class="a36-in" maxlength="100" data-a36-input="add" placeholder="${esc(MSG.inputPlaceholder)}" enterkeyhint="next" /></div>` : "";
    const add = st.adding ? "" : `<button type="button" class="a36-row a36-addrow" data-a36="add">${esc(MSG.add)}</button>`;
    const empty = !(st.list || []).length && !st.adding ? `<p class="a36-hint">${esc(MSG.emptyHint)}</p>` : "";
    return `${head}<div class="a36-list" id="a36-list">${rows}${input}${add}</div>${empty}<p class="a36-hint">${esc(MSG.pressHint)}</p><p class="a36-err hidden" id="a36-err" role="alert">${esc(MSG.tooLong)}</p>`;
  }

  /** 길게 누르면 뜨는 메뉴(고치기·맨 위로·삭제) — 줄 id 를 data-a36-id 로 들고 있다. */
  function renderTodoMenu(id) {
    return `<div class="a36-menu" role="menu" data-a36-id="${esc(id)}"><button type="button" role="menuitem" data-a36="menu-edit">${esc(MSG.menuEdit)}</button><button type="button" role="menuitem" data-a36="menu-top">${esc(MSG.menuTop)}</button><button type="button" role="menuitem" class="del" data-a36="menu-del">${esc(MSG.menuDel)}</button><button type="button" role="menuitem" data-a36="menu-close">${esc(MSG.menuClose)}</button></div>`;
  }

  /** 날짜 하프 시트. st: { iso, month, day, weekday(0~6), prevDay, nextDay, rows:[{scheduleId,key,title,allDay,startTime,sub,color,done}] } */
  function renderDaySheet(st) {
    const head = `<div class="a36-dhead"><b>${esc(`${st.month}월 ${st.day}일 ${MSG.weekdays[st.weekday]}요일`)}</b><button type="button" class="a36-dadd" data-a36="day-add">${esc(MSG.dayAdd)}</button></div>`;
    const rows = (st.rows || [])
      .map((r) => `<button type="button" class="a36-tlr${r.done ? " done" : ""}" data-a36-ev="${esc(r.scheduleId)}|${esc(r.key)}">${timeCell(r)}<i style="background:${esc(r.color || "#c9b8ff")}"></i><span class="a36-ti"><b>${esc(r.title)}</b>${r.sub ? `<small>${esc(r.sub)}</small>` : ""}</span></button>`)
      .join("");
    const body = rows || `<div class="a36-dempty"><p>${esc(MSG.dayEmpty(st.month, st.day))}</p><button type="button" class="a36-dadd2" data-a36="day-add">${esc(MSG.dayEmptyAdd)}</button></div>`;
    const nav = `<div class="a36-dnav"><button type="button" data-a36="day-prev" aria-label="이전 날">${esc(MSG.dayPrev(st.prevDay))}</button><span>${esc(MSG.daySwipeHint)}</span><button type="button" data-a36="day-next" aria-label="다음 날">${esc(MSG.dayNext(st.nextDay))}</button></div>`;
    return `<div class="a36-day" data-a36-day="${esc(st.iso)}">${head}<div class="a36-dlist">${body}</div>${nav}</div>`;
  }

  return { MSG, clockParts, renderHome, renderTodoTab, renderTodoMenu, renderDaySheet, esc };
});
