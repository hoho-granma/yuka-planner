/*
 * pregnancy-basis — 임신 정보 입력 방식(예정일 / 지금 몇 주 / 임신 확인일)과 출산 예정일 계산(순수 모듈: DOM·저장소·네트워크 없음).
 *   출산 예정일(profile.birthDate)은 계속 '파생 값'이다: 예정일 = 기준일 + (280 − 임신일수). 그래서 pregnancyInfo·단계 판정·일정 엔진은 전부 그대로 동작한다.
 *   입력 방식(basis)은 기기 로컬에만 저장한다(서버 공유 없음 — 규칙 변경 없음): { kind:"WEEKS", weeks, days, asOf } | { kind:"CONFIRM", confirmDate, weeks, days } (weeks·days = 확인 당시 주수).
 *   예정일로 입력(DUE)하면 basis 는 지운다 — 마지막에 입력한 방식이 우선이고, 언제든 예정일로 되돌릴 수 있다.
 *   확인일(CONFIRM)은 일정 엔진의 '확인 후' 항목(data/policy/pregnancy-timing.json 의 startFrom:"confirmDate")이 시작 기준으로 쓴다.
 */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else root.PregnancyBasis = factory();
})(typeof window !== "undefined" ? window : global, function () {
  "use strict";

  const GESTATION_DAYS = 280;
  const MIN_WEEKS = 4, MAX_WEEKS = 42;
  const KINDS = Object.freeze(["DUE", "WEEKS", "CONFIRM"]);
  const MSG = Object.freeze({
    kindLabel: Object.freeze({ DUE: "예정일로 입력", WEEKS: "지금 몇 주예요", CONFIRM: "임신 확인일로 입력" }),
    inputLabel: "입력 방식",
    weeksNow: "지금 임신 주수", weeksAtConfirm: "확인한 날의 임신 주수", confirmDate: "임신 확인일",
    weekUnit: "주", dayUnit: "일",
    preview: (due) => `출산 예정일은 ${due} 로 계산돼요`,
    backToDue: "예정일을 직접 입력하려면 '예정일로 입력'을 눌러 주세요",
    errDue: "출산 예정일을 선택해 주세요.", errWeeks: `임신 주수는 ${MIN_WEEKS}~${MAX_WEEKS}주 사이로 골라 주세요.`, errConfirm: "임신 확인일을 오늘 이전 날짜로 선택해 주세요.", errRange: "계산한 출산 예정일이 너무 멀거나 지났어요. 날짜와 주수를 다시 확인해 주세요.",
  });

  const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
  const toDate = (iso) => { const m = ISO_RE.exec(String(iso || "")); if (!m) return null; const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])); return d.getUTCMonth() === +m[2] - 1 ? d : null; };
  const toIso = (d) => d.toISOString().slice(0, 10);
  const addDays = (iso, n) => { const d = toDate(iso); return d ? toIso(new Date(d.getTime() + n * 86400000)) : ""; };
  const diffDays = (a, b) => Math.round((toDate(b) - toDate(a)) / 86400000); // b − a
  const isIso = (v) => !!toDate(v);
  const int = (v) => (typeof v === "number" ? v : Number(v));

  /** 오늘 기준 임신 주수·일수(출산 예정일에서 거꾸로). 0~42주로 자른다 — 앱의 pregnancyInfo 와 같은 규칙. */
  function gestationNow(dueIso, todayIso) {
    const elapsed = GESTATION_DAYS - diffDays(todayIso, dueIso);
    return { weeks: Math.max(0, Math.min(MAX_WEEKS, Math.floor(elapsed / 7))), days: Math.max(0, elapsed % 7) };
  }

  /**
   * 입력 → 출산 예정일. in = { kind, dueIso, weeks, days, confirmIso, todayIso }.
   * 반환 { ok:true, dueIso, basis(null=예정일 직접 입력) } | { ok:false, error:"due"|"weeks"|"confirm"|"range" }.
   */
  function resolve(inp) {
    const kind = KINDS.includes(inp && inp.kind) ? inp.kind : "DUE";
    const today = inp && inp.todayIso;
    if (!isIso(today)) return { ok: false, error: "range" };
    if (kind === "DUE") return isIso(inp.dueIso) ? { ok: true, dueIso: inp.dueIso, basis: null } : { ok: false, error: "due" };
    const weeks = int(inp.weeks), days = inp.days == null || inp.days === "" ? 0 : int(inp.days);
    if (!Number.isInteger(weeks) || weeks < MIN_WEEKS || weeks > MAX_WEEKS || !Number.isInteger(days) || days < 0 || days > 6) return { ok: false, error: "weeks" };
    const gest = weeks * 7 + days;
    let anchor = today, basis = { kind: "WEEKS", weeks, days, asOf: today };
    if (kind === "CONFIRM") {
      if (!isIso(inp.confirmIso) || inp.confirmIso > today) return { ok: false, error: "confirm" };
      anchor = inp.confirmIso;
      basis = { kind: "CONFIRM", confirmDate: inp.confirmIso, weeks, days };
    }
    const dueIso = addDays(anchor, GESTATION_DAYS - gest);
    const fromToday = diffDays(today, dueIso);
    if (fromToday < -14 || fromToday > GESTATION_DAYS) return { ok: false, error: "range" };
    return { ok: true, dueIso, basis };
  }

  /** 저장된 값(localStorage 등) → 올바른 basis 또는 null. 형식이 틀리면 버린다. */
  function normalizeBasis(raw) {
    if (!raw || typeof raw !== "object") return null;
    const w = int(raw.weeks), d = raw.days == null ? 0 : int(raw.days);
    if (!Number.isInteger(w) || w < MIN_WEEKS || w > MAX_WEEKS || !Number.isInteger(d) || d < 0 || d > 6) return null;
    if (raw.kind === "WEEKS" && isIso(raw.asOf)) return { kind: "WEEKS", weeks: w, days: d, asOf: raw.asOf };
    if (raw.kind === "CONFIRM" && isIso(raw.confirmDate)) return { kind: "CONFIRM", confirmDate: raw.confirmDate, weeks: w, days: d };
    return null;
  }
  /** 일정 엔진에 넘길 임신 확인일(YYYY-MM-DD) — 확인일 방식일 때만. */
  const confirmDateOf = (basis) => { const b = normalizeBasis(basis); return b && b.kind === "CONFIRM" ? b.confirmDate : null; };

  return { GESTATION_DAYS, MIN_WEEKS, MAX_WEEKS, KINDS, MSG, gestationNow, resolve, normalizeBasis, confirmDateOf, addDays, diffDays, isIso };
});
