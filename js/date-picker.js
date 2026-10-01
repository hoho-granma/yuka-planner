/*
 * date-picker — 온보딩과 "아이 정보 수정"이 함께 쓰는 커스텀 달력 팝업(앱 테마).
 * 예전에는 온보딩 전용 코드가 app.js 안에 있었고, 수정 화면은 브라우저 기본 <input type="date"> 였다. 한 곳으로 모아 두 화면이 같은 동작·모양을 쓴다.
 *
 * 구성
 *   - 순수 함수(Node 테스트: test/date-picker.logic.test.js): birthYears · isSelectable
 *   - markup(prefix): 팝업 마크업(수정 화면이 주입). 온보딩은 index.html 의 기존 마크업을 그대로 쓴다.
 *   - bind(els, opts): 요소에 동작을 연결하고 { set, reset, get } 을 돌려준다(브라우저 전용).
 *
 * 선택 범위(stage)
 *   - "born"      태어난 아이: 오늘까지, 연도 하한 = 올해 − yearsBack (ChildTimeline.SERVICE_RANGE.pickerYearsBack — 올해 초등 6학년의 출생연도).
 *   - "pregnant"  임신 중(출산 예정일): 오늘 ~ 오늘+300일, 연도는 올해와 내년.
 *   - "schedule"  가족 일정 날짜(B4): 작년 1월 1일 ~ 후년 12월 31일(과거·미래 모두 선택 가능). 연도 목록은 내림차순 [올해+2 … 올해−1].
 *   - 어느 stage 든 opts.getMinDate 가 있으면 그 날짜 이전은 막는다(예: 연속 일정의 마지막 날은 시작일 이후).
 */
(function (root, factory) {
  const mod = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = mod;
  else root.HNDatePicker = mod;
})(typeof window !== "undefined" ? window : global, function () {
  "use strict";

  const DAY = 86400000;
  const SCHEDULE_YEARS_BACK = 1; // 작년
  const SCHEDULE_YEARS_FORWARD = 2; // 후년
  const sod = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  /** 연도 드롭다운 목록(내림차순). */
  function birthYears(stage, today, yearsBack) {
    const y = today.getFullYear();
    if (stage === "pregnant") return [y + 1, y];
    if (stage === "schedule") {
      const ys = [];
      for (let i = y + SCHEDULE_YEARS_FORWARD; i >= y - SCHEDULE_YEARS_BACK; i--) ys.push(i);
      return ys;
    }
    const out = [];
    for (let i = y; i >= y - yearsBack; i--) out.push(i);
    return out;
  }

  /** 그 날짜를 고를 수 있는가. 오늘 기준(시각은 무시). minDate(선택)가 있으면 그 날짜 이전은 막는다. */
  function isSelectable(date, stage, today, yearsBack, minDate) {
    const t = sod(today);
    if (minDate && date < sod(minDate)) return false;
    if (stage === "schedule") {
      const y = t.getFullYear();
      return date.getFullYear() >= y - SCHEDULE_YEARS_BACK && date.getFullYear() <= y + SCHEDULE_YEARS_FORWARD;
    }
    if (stage === "pregnant") return !(date < t || date > new Date(t.getTime() + 300 * DAY));
    if (date > t) return false;
    return yearsBack === undefined || date.getFullYear() >= t.getFullYear() - yearsBack;
  }

  /** 팝업 요소 ID 규칙(수정 화면용): prefix 가 ep 이면 ep-dp-btn, ep-dp-popup, … 해당 hidden 입력은 `${prefix}-date`. */
  function elementIds(prefix) {
    return {
      btn: `${prefix}-dp-btn`, display: `${prefix}-dp-display`, hidden: `${prefix}-date`, popup: `${prefix}-dp-popup`,
      prevYear: `${prefix}-dp-prev-year`, prevMonth: `${prefix}-dp-prev-month`, nextMonth: `${prefix}-dp-next-month`, nextYear: `${prefix}-dp-next-year`,
      yearSel: `${prefix}-dp-year`, monthSel: `${prefix}-dp-month`, grid: `${prefix}-dp-grid`,
    };
  }

  /** 온보딩(index.html)과 같은 구조·클래스의 마크업. 값은 hidden 입력(`${prefix}-date`)에 YYYY-MM-DD 로 들어간다. */
  function markup(prefix, placeholder) {
    const i = elementIds(prefix);
    return `<div class="date-picker-wrap">
      <button type="button" id="${i.btn}" class="date-picker-trigger"><span id="${i.display}" class="placeholder">${placeholder || "날짜를 선택해주세요"}</span><span class="date-picker-icon">📅</span></button>
      <input type="hidden" id="${i.hidden}" />
      <div id="${i.popup}" class="date-popup hidden">
        <div class="date-popup-header">
          <button type="button" class="btn-icon" id="${i.prevYear}">«</button>
          <button type="button" class="btn-icon" id="${i.prevMonth}">‹</button>
          <select id="${i.yearSel}"></select>
          <select id="${i.monthSel}"></select>
          <button type="button" class="btn-icon" id="${i.nextMonth}">›</button>
          <button type="button" class="btn-icon" id="${i.nextYear}">»</button>
        </div>
        <div class="date-popup-weekdays"><span>일</span><span>월</span><span>화</span><span>수</span><span>목</span><span>금</span><span>토</span></div>
        <div class="date-popup-grid" id="${i.grid}"></div>
      </div>
    </div>`;
  }

  /**
   * 요소에 동작을 연결한다. els: { btn, display, hidden, popup, prevYear, prevMonth, nextMonth, nextYear, yearSel, monthSel, grid } (DOM 요소)
   * opts: { getStage: () => "born"|"pregnant"|"schedule", yearsBack, format: (Date) => string, placeholder, onChange?: (Date) => void, getMinDate?: () => Date|null }
   */
  function bind(els, opts) {
    const o = { placeholder: "날짜를 선택해주세요", ...opts };
    let view = new Date();
    view.setDate(1);
    let selected = null;
    const stage = () => (o.getStage ? o.getStage() : "born");
    const today = () => new Date();

    function set(date) {
      selected = date;
      view = new Date(date.getFullYear(), date.getMonth(), 1);
      els.hidden.value = iso(date);
      els.display.textContent = o.format(date);
      els.display.classList.remove("placeholder");
    }
    function reset() {
      selected = null;
      els.hidden.value = "";
      els.display.textContent = o.placeholder;
      els.display.classList.add("placeholder");
    }
    const get = () => selected;

    function populate() {
      els.yearSel.innerHTML = "";
      for (const y of birthYears(stage(), today(), o.yearsBack)) {
        const opt = document.createElement("option");
        opt.value = y;
        opt.textContent = `${y}년`;
        els.yearSel.appendChild(opt);
      }
      els.monthSel.innerHTML = "";
      for (let m = 1; m <= 12; m++) {
        const opt = document.createElement("option");
        opt.value = m - 1;
        opt.textContent = `${m}월`;
        els.monthSel.appendChild(opt);
      }
    }
    const yearBounds = () => {
      const ys = birthYears(stage(), today(), o.yearsBack);
      return [Math.min(...ys), Math.max(...ys)];
    };
    /** 보이는 연도를 드롭다운 범위 안으로 맞춘다(« » 로 범위를 넘어가 드롭다운과 어긋나는 것을 막는다). */
    function clampView() {
      const [lo, hi] = yearBounds();
      if (view.getFullYear() < lo) view = new Date(lo, view.getMonth(), 1);
      if (view.getFullYear() > hi) view = new Date(hi, view.getMonth(), 1);
    }
    function syncSelects() {
      els.yearSel.value = view.getFullYear();
      els.monthSel.value = view.getMonth();
    }
    function renderGrid() {
      const year = view.getFullYear();
      const month = view.getMonth();
      const firstDay = new Date(year, month, 1).getDay();
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const t = today();
      els.grid.innerHTML = "";
      for (let i = 0; i < firstDay; i++) {
        const cell = document.createElement("span");
        cell.className = "dp-cell dp-empty";
        els.grid.appendChild(cell);
      }
      for (let d = 1; d <= daysInMonth; d++) {
        const date = new Date(year, month, d);
        const cell = document.createElement("button");
        cell.type = "button";
        cell.className = "dp-cell dp-day";
        cell.textContent = d;
        if (!isSelectable(date, stage(), t, o.yearsBack, o.getMinDate ? o.getMinDate() : null)) {
          cell.disabled = true;
          cell.classList.add("dp-disabled");
        }
        if (selected && sameDay(date, selected)) cell.classList.add("dp-selected");
        cell.addEventListener("click", () => {
          set(date);
          close();
          if (o.onChange) o.onChange(date);
        });
        els.grid.appendChild(cell);
      }
    }
    function open() {
      populate();
      clampView();
      syncSelects();
      renderGrid();
      els.popup.classList.remove("hidden");
    }
    function close() {
      els.popup.classList.add("hidden");
    }
    const refresh = () => {
      clampView();
      syncSelects();
      renderGrid();
    };

    els.btn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      if (els.popup.classList.contains("hidden")) open();
      else close();
    });
    const onDocClick = (ev) => {
      if (!els.popup.isConnected) return document.removeEventListener("click", onDocClick); // 수정 화면이 닫혀 사라지면 스스로 해제
      if (!els.popup.classList.contains("hidden") && !els.popup.contains(ev.target) && ev.target !== els.btn) close();
    };
    document.addEventListener("click", onDocClick);
    els.prevMonth.addEventListener("click", () => {
      view.setMonth(view.getMonth() - 1);
      refresh();
    });
    els.nextMonth.addEventListener("click", () => {
      view.setMonth(view.getMonth() + 1);
      refresh();
    });
    els.prevYear.addEventListener("click", () => {
      view.setFullYear(view.getFullYear() - 1);
      refresh();
    });
    els.nextYear.addEventListener("click", () => {
      view.setFullYear(view.getFullYear() + 1);
      refresh();
    });
    els.yearSel.addEventListener("change", (ev) => {
      view.setFullYear(Number(ev.target.value));
      renderGrid();
    });
    els.monthSel.addEventListener("change", (ev) => {
      view.setMonth(Number(ev.target.value));
      renderGrid();
    });

    return { set, reset, get, open, close };
  }

  /** 수정 화면: markup(prefix) 로 주입한 요소를 ID 규칙으로 찾아 bind 한다. */
  function bindById(prefix, opts) {
    const ids = elementIds(prefix);
    const els = {};
    for (const [k, id] of Object.entries(ids)) els[k] = document.getElementById(id);
    return bind(els, opts);
  }

  return { birthYears, isSelectable, elementIds, markup, bind, bindById };
});
