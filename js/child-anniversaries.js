/*
 * child-anniversaries — 2-5 아이 100일·돌·매년 생일을 출생일로 '계산만' 한다(저장 없음, Firestore·필드 변경 없음). 순수 함수.
 * 근거: docs/한눈육아-디자인명세-생일계산일정.md §2. 날짜를 추측하지 않는다: 출생일 하나로 정해지는 날만.
 *   100일 = 출생일 + 99일(출생일을 1일째로 센다) / 돌 = 1년 뒤 같은 월·일 / 생일 = 2년째부터 매년 같은 월·일.
 *   2월 29일생은 평년에 2월 28일로 표시(feb29 표시를 달아 안내 한 줄에 쓴다). 나이 표기("N세"·"N번째")는 만들지 않는다.
 */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else root.ChildAnniversaries = factory();
})(typeof window !== "undefined" ? window : global, function () {
  "use strict";

  const pad = (n) => String(n).padStart(2, "0");
  const iso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
  const isLeap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const KIND_LABEL = Object.freeze({ d100: "100일", first: "돌", birthday: "생일" });
  const MSG = Object.freeze({
    sourceLine: "자동 계산 · 출생일 기준",
    feb29Note: "2월 29일생 · 평년은 2월 28일로 표시",
    toggleLabel: "아이 생일·100일·돌 보기",
    sheetBody: (birthKo) => `출생일(${birthKo})로 계산한 날이에요. 저장되지 않아요.`,
    addDay: "이 날 일정 추가",
    turnOff: "생일·기념일 끄기",
  });

  /** 출생일 B(Date) 의 해당 연도 같은 월·일. 2/29 는 평년에 2/28. */
  function sameDayIn(b, year) {
    const m = b.getMonth() + 1, d = b.getDate();
    if (m === 2 && d === 29 && !isLeap(year)) return { iso: iso(year, 2, 28), feb29: true };
    return { iso: iso(year, m, d), feb29: m === 2 && d === 29 };
  }
  /** B + 99일(100일째) — 기기 현지 날짜, 시간 없음. */
  function day100(b) {
    const d = new Date(b.getFullYear(), b.getMonth(), b.getDate() + 99);
    return iso(d.getFullYear(), d.getMonth() + 1, d.getDate());
  }
  /**
   * 구간 [startIso, endIso] 안의 계산 일정들. child = { key, name, birthDate(Date), pregnant? } — 임신 중이면 없음.
   * 반환 [{ id, kind, label, title, iso, feb29, childKey }] (날짜순). 구간은 최대 수년이어도 연 단위 계산이라 가볍다.
   */
  function compute(child, startIso, endIso) {
    if (!child || !(child.birthDate instanceof Date) || isNaN(child.birthDate.getTime()) || child.pregnant) return [];
    const b = child.birthDate, by = b.getFullYear();
    const name = String(child.name || "").trim();
    const out = [];
    const add = (kind, d, feb29) => {
      if (d < startIso || d > endIso) return;
      out.push({ id: `ANNIV__${child.key || "c"}__${kind}__${d}`, kind, label: KIND_LABEL[kind], title: `${name ? name + " " : ""}${KIND_LABEL[kind]}`, iso: d, feb29: !!feb29, childKey: child.key == null ? null : child.key });
    };
    add("d100", day100(b), false);
    const sy = Number(startIso.slice(0, 4)), ey = Number(endIso.slice(0, 4));
    for (let y = Math.max(sy, by + 1); y <= ey; y++) {
      const s = sameDayIn(b, y);
      add(y === by + 1 ? "first" : "birthday", s.iso, s.feb29 && s.iso.slice(5) === "02-28");
    }
    return out.sort((a, c) => (a.iso < c.iso ? -1 : a.iso > c.iso ? 1 : 0));
  }
  /**
   * 직접 입력 우선(결정 3): 같은 아이·같은 날짜에 '가족' 분류의 직접 일정(해당 아이 대상)이 있으면 그날의 자동 항목을 숨긴다. 제목 문자열은 비교하지 않는다.
   * direct: [{ date, scope, childKeys, category }](그날 사용자 일정 occurrence).
   */
  function hiddenByDirect(item, direct) {
    return (direct || []).some((o) => o && o.date === item.iso && o.category === "FAMILY" && o.scope === "CHILD" && (o.childKeys || []).includes(item.childKey));
  }
  /** 전체 토글(기기 저장): 기본 켜짐. 저장소 접근이 막혀도 켜짐. */
  const KEY = "hannun_cal_anniv";
  function isOn(storage) { try { return !storage || storage.getItem(KEY) !== "0"; } catch (e) { return true; } }
  function setOn(storage, on) { try { if (storage) storage.setItem(KEY, on ? "1" : "0"); } catch (e) {} }

  return { compute, hiddenByDirect, isOn, setOn, KEY, MSG, KIND_LABEL, sameDayIn, day100 };
});
