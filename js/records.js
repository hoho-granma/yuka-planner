/*
 * 기록 저장소 — 부모가 직접 쓴 성장·활동 기록(records).
 *
 * 저장 원칙 (docs/UX-개편-분석-및-설계.md §2-4)
 *  - 완료 내역에서 만들어지는 "자동 기록"은 여기서 저장하지 않는다(completed 맵에서 그때그때 파생 → js/hn-logic.js).
 *  - 직접 기록은 localStorage("hannun_records:<가족코드|local>")에 두고, 가족코드가 있으면 Firestore
 *    families/{코드}.records.<id> 필드 단위로 동기화한다(FamilySync.updateRecord). 충돌은 updatedAt이 새로운 쪽이 이긴다.
 *  - 삭제는 deletedAt 표시(소프트 삭제) — 다른 기기에서 부활하지 않게.
 *  - 동기화가 실패해도(배포된 Firestore 규칙이 records 필드를 막고 있을 수 있다) 기록은 이 기기에 남고,
 *    화면에는 "이 기기에만 저장됨"이 표시된다 — 실패를 조용히 삼키지 않는다.
 */
(function () {
  "use strict";
  const PREFIX = "hannun_records:";
  const AUTHOR_KEY = "hannun_author_label";
  let code = null;
  let map = {};
  let syncError = null;
  const listeners = [];

  const key = () => PREFIX + (code || "local");
  function load() {
    try {
      const m = JSON.parse(localStorage.getItem(key()));
      return m && typeof m === "object" ? m : {};
    } catch (e) {
      return {};
    }
  }
  function persist() {
    try {
      localStorage.setItem(key(), JSON.stringify(map));
    } catch (e) {
      console.error("기록 저장 실패(저장 공간)", e);
    }
  }
  function emit() {
    listeners.forEach((fn) => {
      try {
        fn();
      } catch (e) {
        console.error(e);
      }
    });
  }
  function newId() {
    return "r" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function canSync() {
    return !!code && typeof FamilySync !== "undefined" && typeof FamilySync.updateRecord === "function";
  }

  async function push(id) {
    if (!canSync()) return false;
    try {
      await FamilySync.updateRecord(code, id, map[id]);
      if (syncError) {
        syncError = null;
        emit();
      }
      return true;
    } catch (e) {
      console.error("기록 동기화 실패", e);
      syncError = (e && (e.code || e.message)) || "unknown";
      emit();
      return false;
    }
  }

  /** 활성 아이(가족코드)를 바꾼다. remote가 있으면 서버 기록과 병합한다. code가 null이면 코드 없는 임시 저장소. */
  function use(newCode, remote) {
    code = newCode || null;
    map = load();
    syncError = null;
    if (remote) mergeRemote(remote);
  }

  /** 서버 기록과 병합 — 더 새로운 updatedAt이 이기고, 서버에 없거나 서버보다 새로운 로컬 기록은 다시 올린다. */
  function mergeRemote(remote) {
    if (!remote || typeof remote !== "object") return;
    const before = JSON.stringify(map);
    map = HNLogic.mergeRecordMaps(map, remote);
    if (JSON.stringify(map) !== before) {
      persist();
      emit();
    }
    if (canSync()) {
      Object.keys(map).forEach((id) => {
        const r = remote[id];
        if (!r || (r.updatedAt || 0) < (map[id].updatedAt || 0)) push(id);
      });
    }
  }

  /** 코드 없이 쌓인 기록을 새로 발급된 가족코드로 옮기고 서버에 올린다. */
  function adopt(newCode) {
    const local = map;
    code = newCode;
    map = HNLogic.mergeRecordMaps(load(), local);
    persist();
    try {
      localStorage.removeItem(PREFIX + "local");
    } catch (e) {}
    Object.keys(map).forEach(push);
  }

  function clearLocal() {
    try {
      localStorage.removeItem(PREFIX + "local");
    } catch (e) {}
    if (!code) map = {};
  }

  /** 기록을 만들거나 고친다. rec = { id?, category, title, date(YYYY-MM-DD), memo, authorLabel } */
  async function save(rec) {
    const id = rec.id || newId();
    const prev = map[id] || {};
    const now = Date.now();
    const next = {
      category: rec.category,
      title: String(rec.title || "").trim(),
      date: rec.date,
      memo: String(rec.memo || "").trim(),
      authorLabel: String(rec.authorLabel || "").trim(),
      createdAt: prev.createdAt || now,
      updatedAt: now,
    };
    map[id] = next; // deletedAt 필드를 넣지 않으므로 삭제된 기록을 같은 id로 고치면 되살아난다
    persist();
    emit();
    const synced = await push(id);
    return { id, synced };
  }

  async function remove(id) {
    if (!map[id]) return;
    const now = Date.now();
    map[id] = { ...map[id], deletedAt: now, updatedAt: now };
    persist();
    emit();
    return push(id);
  }

  window.HNRecords = {
    use,
    mergeRemote,
    adopt,
    clearLocal,
    save,
    remove,
    getMap: () => map,
    onChange: (fn) => listeners.push(fn),
    hasCode: () => !!code,
    /** null이면 정상, 문자열이면 마지막 동기화 실패 사유. */
    syncError: () => syncError,
    authorLabel: () => {
      try {
        return localStorage.getItem(AUTHOR_KEY) || "";
      } catch (e) {
        return "";
      }
    },
    setAuthorLabel: (v) => {
      try {
        localStorage.setItem(AUTHOR_KEY, String(v || "").trim());
      } catch (e) {}
    },
  };
})();
