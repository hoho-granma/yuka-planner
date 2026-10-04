/*
 * time-wheel — 시간 입력 UI(시안 g28-B): 한 줄 범위('오후 4:00 ~ 5:00')를 탭하면 아래 휠(오전/오후·시·분 15분 단위)로 조정한다.
 *   시작을 바꾸면 끝이 같은 길이로 따라오고, 끝이 시작보다 빠르거나 같으면 경고 한 줄 + 자동 값으로 되돌린다(계산은 TimeRange).
 * 순수 부분: initState · reduce · markup (DOM 없음). DOM 부분: bind(root, onChange) — 클릭(▲▼·칸 선택)·마우스 휠·세로 끌기를 reduce 로 모은다.
 * 상태 = { start:"HH:MM", end:"HH:MM", active:"start"|"end", warn:"" }. 저장 형식은 기존 그대로 'HH:MM' 두 필드.
 * 마크업 속성: data-tw="<prefix>", data-tw-field="start|end"(범위 줄 버튼), data-tw-step="mer|hour|min" + data-tw-dir="-1|1"(▲▼), 칸 본문 data-tw-col(끌기·휠 대상).
 */
(function (root, factory) {
  const TR = typeof module !== "undefined" && module.exports ? require("./time-range.js") : root.TimeRange;
  const mod = factory(TR);
  if (typeof module !== "undefined" && module.exports) module.exports = mod;
  else root.TimeWheel = mod;
})(typeof window !== "undefined" ? window : global, function (TR) {
  "use strict";

  const esc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const MSG = Object.freeze({ start: "시작", end: "끝", hint: "시작을 바꾸면 끝도 같은 길이로 따라와요", mer: "오전/오후", hour: "시", min: "분", up: "위로", down: "아래로" });
  const PARTS = ["mer", "hour", "min"];

  function initState(startTime, endTime, active) {
    const r = TR.initial(startTime, endTime);
    return { start: r.start, end: r.end, active: active === "end" ? "end" : "start", warn: "" };
  }

  /** 분(0~1439) ↔ 휠 칸 값 */
  const parts = (min) => ({ mer: min < 720 ? 0 : 1, hour: Math.floor(min / 60) % 12 === 0 ? 12 : Math.floor(min / 60) % 12, min: min % 60 });
  const compose = (p) => (p.mer * 12 + (p.hour % 12)) * 60 + p.min;
  /** 한 칸을 dir(±1)만큼 돌린 새 분 값. 오전/오후는 12시간, 시는 12시간 안에서 돌고(12→1), 분은 15분씩 돌되 시는 바꾸지 않는다. */
  function turn(min, part, dir) {
    const p = parts(min);
    if (part === "mer") p.mer = p.mer === 0 ? 1 : 0;
    else if (part === "hour") p.hour = ((p.hour - 1 + dir + 12) % 12) + 1;
    else if (part === "min") p.min = (p.min + dir * TR.STEP + 60) % 60;
    return compose(p);
  }

  /** 상태 전이(순수). action: { type:"field", field } | { type:"step", part, dir } | { type:"set", field, time } */
  function reduce(state, action) {
    const st = { start: state.start, end: state.end, active: state.active, warn: state.warn || "" };
    if (action.type === "field") return { ...st, active: action.field === "end" ? "end" : "start", warn: "" };
    if (action.type === "set") {
      const r = action.field === "end" ? TR.changeEnd(st, action.time) : TR.changeStart(st, action.time);
      return { start: r.start, end: r.end, active: action.field === "end" ? "end" : "start", warn: r.warn };
    }
    if (action.type === "step" && PARTS.includes(action.part)) {
      const cur = TR.toMin(st[st.active]);
      const next = TR.fromMin(turn(cur == null ? 540 : cur, action.part, action.dir < 0 ? -1 : 1));
      return reduce(st, { type: "set", field: st.active, time: next });
    }
    return st;
  }

  const rangeLabel = (state) => {
    const s = TR.toMin(state.start), e = TR.toMin(state.end);
    const sTxt = TR.clock12(state.start);
    const eFull = TR.clock12(state.end);
    const eTxt = s != null && e != null && (s < 720) === (e < 720) ? eFull.replace(/^(오전|오후) /, "") : eFull;
    return { sTxt, eTxt };
  };
  const colHtml = (state, part) => {
    const cur = TR.toMin(state[state.active]);
    const at = (d) => parts(turn(cur == null ? 540 : cur, part, d));
    const show = (p) => (part === "mer" ? (p.mer === 0 ? "오전" : "오후") : part === "hour" ? String(p.hour) : String(p.min).padStart(2, "0"));
    const c = parts(cur == null ? 540 : cur);
    const label = MSG[part];
    // 오전/오후는 두 칸뿐이라 위·아래가 서로 같다(눌러서 바꾼다)
    return `<div class="tw-col" data-tw-col="${part}" role="group" aria-label="${esc(label)}"><button type="button" class="tw-arr" data-tw-step="${part}" data-tw-dir="-1" aria-label="${esc(label + " " + MSG.up)}">▲</button><span class="tw-v dim">${esc(show(at(-1)))}</span><b class="tw-v cur" aria-live="polite">${esc(show(c))}</b><span class="tw-v dim">${esc(show(at(1)))}</span><button type="button" class="tw-arr" data-tw-step="${part}" data-tw-dir="1" aria-label="${esc(label + " " + MSG.down)}">▼</button></div>`;
  };
  /** 한 줄 범위 + 휠 마크업. prefix 는 폼 안에서 이 입력을 구분하는 이름(예: "us-time"). */
  function markup(prefix, state) {
    const { sTxt, eTxt } = rangeLabel(state);
    const f = (field, txt) => `<button type="button" class="tw-tm${state.active === field ? " on" : ""}" data-tw-field="${field}" aria-pressed="${state.active === field ? "true" : "false"}" aria-label="${esc((field === "start" ? MSG.start : MSG.end) + " " + txt)}">${esc(txt)}</button>`;
    return `<div class="tw" data-tw="${esc(prefix)}"><div class="tw-row">${f("start", sTxt)}<b>~</b>${f("end", eTxt)}</div><div class="tw-wheel">${PARTS.map((p) => colHtml(state, p)).join("")}</div>${state.warn ? `<p class="tw-warn" role="alert">${esc(state.warn)}</p>` : ""}<p class="tw-hint">${esc(MSG.hint)}</p></div>`;
  }

  /**
   * DOM 연결(브라우저). root 안의 클릭·마우스 휠·세로 끌기(28px 마다 한 칸)를 reduce 에 보내고, 새 상태를 onChange(state)로 알린다.
   * getState() 는 현재 상태를 돌려준다(호출부가 상태를 들고 있다). 이벤트는 root 에 한 번만 위임한다.
   */
  function bind(rootEl, getState, onChange) {
    const send = (a) => { const cur = getState(); if (cur) onChange(reduce(cur, a)); }; // 상태가 없으면(열린 폼 없음) 무시
    rootEl.addEventListener("click", (ev) => {
      const t = ev.target && ev.target.closest ? ev.target.closest("[data-tw-field],[data-tw-step]") : null;
      if (!t || !rootEl.contains(t)) return;
      ev.preventDefault();
      if (t.hasAttribute("data-tw-field")) return send({ type: "field", field: t.getAttribute("data-tw-field") });
      send({ type: "step", part: t.getAttribute("data-tw-step"), dir: Number(t.getAttribute("data-tw-dir")) });
    });
    rootEl.addEventListener("wheel", (ev) => {
      const col = ev.target && ev.target.closest ? ev.target.closest("[data-tw-col]") : null;
      if (!col) return;
      ev.preventDefault();
      send({ type: "step", part: col.getAttribute("data-tw-col"), dir: ev.deltaY < 0 ? -1 : 1 });
    }, { passive: false });
    let drag = null;
    rootEl.addEventListener("pointerdown", (ev) => {
      const col = ev.target && ev.target.closest ? ev.target.closest("[data-tw-col]") : null;
      if (!col || ev.target.closest("[data-tw-step]")) return;
      drag = { part: col.getAttribute("data-tw-col"), y: ev.clientY };
    });
    rootEl.addEventListener("pointermove", (ev) => {
      if (!drag) return;
      const dy = ev.clientY - drag.y;
      if (Math.abs(dy) < 28) return;
      drag.y = ev.clientY;
      send({ type: "step", part: drag.part, dir: dy < 0 ? 1 : -1 }); // 위로 끌면 다음 값(휠 감각)
    });
    const end = () => { drag = null; };
    rootEl.addEventListener("pointerup", end);
    rootEl.addEventListener("pointercancel", end);
  }

  return { MSG, initState, reduce, markup, bind, turn, parts };
});
