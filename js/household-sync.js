/*
 * household-sync — 가구(household) Firestore I/O 의 유일한 창구(B1).
 * 설계: docs/한눈육아-확장설계-2단계-상세.md §2(구조), §11(동기화·오프라인), §11-3(규칙).
 *
 * 원칙
 *   - 플래그(FEATURES.household)가 꺼져 있으면 **Firestore 를 읽지도 쓰지도 않고** localStorage 도 건드리지 않는다.
 *     어댑터(firebase.firestore())는 켜진 뒤 첫 I/O 때에야 만든다(지연 생성).
 *   - 쓰기 경로는 householdCodes/** , households/** 로만 제한한다. families/**(아이 문서)에는 어떤 경우에도 쓰지 않는다.
 *   - 삭제 없음(소프트 삭제만). 쓰기는 문서 단위 + 로컬 미러 즉시 반영 + 실패 시 대기열(실패를 삼키지 않는다).
 *   - Firestore SDK 의 enablePersistence 는 쓰지 않는다(자체 미러+대기열).
 *   - 어댑터를 주입할 수 있어 Node 에서 가짜 어댑터로 테스트한다(test/household-sync.logic.test.js).
 *
 * 어댑터 계약(경로는 "a/b/c" 문자열; 짝수 세그먼트=문서, 홀수=컬렉션)
 *   get(path) → { exists, data }       set(path, data, { merge }) → Promise     update(path, data) → Promise
 *   list(collectionPath) → [{ id, data }]     listen(path, onData, onError) → unsubscribe
 *   쓰기 실패는 code 가 있는 Error("permission-denied", "unavailable" 등)로 던진다.
 */
(function (root, factory) {
  const mod = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = mod;
  else root.HouseholdSync = mod.create(); // 브라우저: 기본 인스턴스(플래그 FEATURES.household 가 꺼져 있으면 아무 I/O 도 하지 않는다)
})(typeof window !== "undefined" ? window : global, function () {
  "use strict";

  const CODE_KEY = "hannun_household_code";
  const MIRROR_PREFIX = "hannun_household:";
  const PENDING_PREFIX = "hannun_household_pending:";
  const CODE_CHARS = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"; // 0/O, 1/I/L 제외 (sync.js 와 동일)
  const CODE_LEN = 8;
  const WRITE_ROOTS = ["householdCodes", "households"];
  const DEFAULT_MEMBERS = [
    { role: "MOM", label: "엄마" },
    { role: "DAD", label: "아빠" },
  ];

  /** 실제 Firestore(compat SDK)를 어댑터 계약에 맞춘다. 호출될 때에만 firebase.firestore() 를 만든다. */
  function firestoreAdapter(getDb) {
    const refOf = (path) => {
      const parts = path.split("/");
      let ref = getDb();
      parts.forEach((seg, i) => {
        ref = i % 2 === 0 ? ref.collection(seg) : ref.doc(seg);
      });
      return ref;
    };
    return {
      async get(path) {
        const d = await refOf(path).get();
        return { exists: d.exists, data: d.exists ? d.data() : null };
      },
      set: (path, data, opts) => refOf(path).set(data, opts),
      // update 패치의 값이 null 이면 그 필드를 지운다(UserSchedule.buildPatch 계약). 값이 null 로 저장되지 않는다.
      update: (path, data) => {
        const out = {};
        for (const [k, v] of Object.entries(data)) out[k] = v === null ? firebase.firestore.FieldValue.delete() : v;
        return refOf(path).update(out);
      },
      async list(path) {
        const snap = await refOf(path).get();
        return snap.docs.map((d) => ({ id: d.id, data: d.data() }));
      },
      listen(path, onData, onError) {
        const isDoc = path.split("/").length % 2 === 0;
        return refOf(path).onSnapshot(
          (s) => (isDoc ? onData(s.exists ? { id: s.id, data: s.data() } : null) : onData(s.docs.map((d) => ({ id: d.id, data: d.data() })))),
          onError
        );
      },
    };
  }

  function create(opts) {
    opts = opts || {};
    const features = opts.features || (() => (typeof window !== "undefined" && window.FEATURES) || {});
    const storage = opts.storage || (typeof localStorage !== "undefined" ? localStorage : null);
    const now = opts.now || (() => Date.now());
    const rand = opts.rand || Math.random;
    const getAdapter = (() => {
      let a = opts.adapter || null;
      return () => {
        if (!a) a = firestoreAdapter(opts.getDb || (() => firebase.firestore()));
        return a;
      };
    })();

    const state = { permissionDenied: false, lastError: null };

    const enabled = () => !!features().household;
    const DISABLED = Object.freeze({ ok: false, reason: "disabled" });

    function newId(prefix) {
      let s = "";
      for (let i = 0; i < 6; i++) s += CODE_CHARS[Math.floor(rand() * CODE_CHARS.length)];
      return prefix + now().toString(36) + s.toLowerCase();
    }
    function newCode() {
      let s = "";
      for (let i = 0; i < CODE_LEN; i++) s += CODE_CHARS[Math.floor(rand() * CODE_CHARS.length)];
      return s;
    }

    // ── 로컬 저장소(미러·대기열·코드) ───────────────────────────────────
    function readJson(key, dflt) {
      try {
        const raw = storage && storage.getItem(key);
        return raw ? JSON.parse(raw) : dflt;
      } catch (e) {
        return dflt;
      }
    }
    function writeJson(key, v) {
      try {
        if (storage) storage.setItem(key, JSON.stringify(v));
      } catch (e) {
        state.lastError = e;
      }
    }
    const getSavedCode = () => (enabled() && storage ? storage.getItem(CODE_KEY) : null);
    const emptyMirror = (hid) => ({ householdId: hid, household: null, children: {}, members: {}, schedules: {} });
    const loadMirror = (hid) => {
      const m = readJson(MIRROR_PREFIX + hid, null) || emptyMirror(hid);
      if (!m.schedules) m.schedules = {}; // B3 까지 저장된 예전 미러에는 schedules 가 없다
      return m;
    };
    const saveMirror = (m) => writeJson(MIRROR_PREFIX + m.householdId, m);
    const loadPending = (hid) => readJson(PENDING_PREFIX + hid, []);
    const savePending = (hid, q) => writeJson(PENDING_PREFIX + hid, q);

    function assertWritablePath(path) {
      if (!WRITE_ROOTS.includes(path.split("/")[0])) throw new Error("household-sync 는 이 경로에 쓸 수 없다: " + path);
    }

    // 로컬 미러에 반영하는 변환(문서 단위). path 는 households/{hid}[/children|members/{id}]
    function applyToMirror(m, op) {
      const seg = op.path.split("/");
      if (seg[0] !== "households") return;
      const data = op.payload;
      if (seg.length === 2) m.household = { ...(m.household || {}), ...data };
      else if (seg[2] === "children") m.children[seg[3]] = { ...(m.children[seg[3]] || {}), ...data };
      else if (seg[2] === "members") m.members[seg[3]] = { ...(m.members[seg[3]] || {}), ...data };
      else if (seg[2] === "schedules") applyScheduleOp(m, seg[3], op);
    }

    /** 일정: set(전체 문서)는 통째로, update 는 "exceptions.2026-10-08" 같은 dot-path 와 null(=필드 삭제)을 Firestore 와 같은 규칙으로 반영한다. */
    function applyScheduleOp(m, id, op) {
      if (op.op === "set") {
        m.schedules[id] = op.merge ? { ...(m.schedules[id] || {}), ...op.payload } : { ...op.payload };
        return;
      }
      const cur = m.schedules[id];
      if (!cur) return; // 미러에 없는 문서의 update 는 서버 스냅샷이 채워 준다
      for (const [key, val] of Object.entries(op.payload)) {
        const parts = key.split(".");
        let o = cur;
        for (let i = 0; i < parts.length - 1; i++) {
          if (!o[parts[i]] || typeof o[parts[i]] !== "object") {
            if (val === null) {
              o = null;
              break;
            }
            o[parts[i]] = {};
          }
          o = o[parts[i]];
        }
        if (!o) continue;
        const last = parts[parts.length - 1];
        if (val === null) delete o[last];
        else o[last] = val;
      }
      if (cur.exceptions && Object.keys(cur.exceptions).length === 0) delete cur.exceptions;
    }

    async function run(op) {
      const a = getAdapter();
      if (op.op === "set") await a.set(op.path, op.payload, op.merge ? { merge: true } : undefined);
      else await a.update(op.path, op.payload);
    }

    function noteError(e) {
      state.lastError = e;
      if (e && e.code === "permission-denied") state.permissionDenied = true;
    }

    /**
     * 쓰기 하나: 로컬 미러 즉시 반영 → 서버 시도 → 실패하면 대기열(입력 순서 유지).
     * 대기열에 앞선 항목이 남아 있으면 순서를 지키기 위해 서버 시도 없이 뒤에 붙인다.
     */
    async function write(hid, op) {
      assertWritablePath(op.path);
      const m = loadMirror(hid);
      applyToMirror(m, op);
      saveMirror(m);
      const q = loadPending(hid);
      const entry = { op: op.op, path: op.path, payload: op.payload, merge: !!op.merge, ts: now() };
      if (q.length === 0 && !state.permissionDenied) {
        try {
          await run(entry);
          return { ok: true, pending: false };
        } catch (e) {
          noteError(e);
        }
      }
      q.push(entry);
      savePending(hid, q);
      return { ok: true, pending: true };
    }

    /** 대기열을 앞에서부터 보낸다. 실패하면 거기서 멈춘다(순서 보존). */
    async function flush(hid) {
      if (!enabled()) return DISABLED;
      let q = loadPending(hid);
      let sent = 0;
      while (q.length) {
        try {
          await run(q[0]);
        } catch (e) {
          noteError(e);
          break;
        }
        q = q.slice(1);
        savePending(hid, q);
        sent++;
        state.permissionDenied = false;
      }
      return { ok: true, sent, remaining: q.length };
    }

    // ── 가구 생성(지연) ────────────────────────────────────────────────
    async function createHousehold({ name, firstChild } = {}) {
      if (!enabled()) return DISABLED;
      const hid = newId("h");
      const t = now();
      let code = newCode();
      try {
        for (let i = 0; i < 8; i++) {
          const ex = await getAdapter().get("householdCodes/" + code);
          if (!ex.exists) break;
          code = newCode();
        }
      } catch (e) {
        noteError(e); // 오프라인이면 그대로 진행(충돌은 규칙이 덮어쓰기를 거부)
      }
      const hdoc = { v: 1, createdAt: t, updatedAt: t };
      if (name) hdoc.name = name;
      // 순서가 중요하다: 가구 문서 → 코드 → 아이 링크 → 담당자
      await write(hid, { op: "set", path: "households/" + hid, payload: hdoc });
      await write(hid, { op: "set", path: "householdCodes/" + code, payload: { householdId: hid, active: true, createdAt: t, revokedAt: null } });
      if (storage) storage.setItem(CODE_KEY, code);
      let childKey = null;
      if (firstChild) childKey = (await addChild(hid, { ...firstChild, order: 1 })).childKey;
      for (let i = 0; i < DEFAULT_MEMBERS.length; i++) await upsertMember(hid, { ...DEFAULT_MEMBERS[i], order: i + 1 });
      return { ok: true, householdId: hid, code, childKey };
    }

    /** 코드 사전 확인(D2 가입): 읽기만 한다 — 로컬 저장소·미러를 건드리지 않는다. { ok:true, householdId } | { ok:false, reason:"not-found" } (서버 오류는 던진다) */
    async function lookupHousehold(code) {
      if (!enabled()) return DISABLED;
      code = String(code || "").trim().toUpperCase();
      const a = getAdapter();
      const c = await a.get("householdCodes/" + code);
      if (!c.exists || !c.data || c.data.active !== true) return { ok: false, reason: "not-found" };
      const h = await a.get("households/" + c.data.householdId);
      if (!h.exists) return { ok: false, reason: "not-found" };
      return { ok: true, householdId: c.data.householdId };
    }

    /** 읽기 전용: 코드의 가구 구성원 목록만 가져온다(미러·저장된 코드는 건드리지 않는다). 합류 전 '누구로 합류하나요?' 용. */
    async function peekMembers(code) {
      if (!enabled()) return DISABLED;
      code = String(code || "").trim().toUpperCase();
      const a = getAdapter();
      const c = await a.get("householdCodes/" + code);
      if (!c.exists || !c.data || c.data.active !== true) return { ok: false, reason: "not-found" };
      const hid = c.data.householdId;
      const members = await a.list(`households/${hid}/members`);
      return { ok: true, householdId: hid, members: members.map((d) => ({ memberId: d.id, ...d.data })) };
    }

    // ── 참여(새 기기) ─────────────────────────────────────────────────
    async function joinHousehold(code) {
      if (!enabled()) return DISABLED;
      code = String(code || "").trim().toUpperCase();
      const a = getAdapter();
      const c = await a.get("householdCodes/" + code);
      if (!c.exists || !c.data || c.data.active !== true) return { ok: false, reason: "not-found" };
      const hid = c.data.householdId;
      const h = await a.get("households/" + hid);
      if (!h.exists) return { ok: false, reason: "not-found" };
      const [kids, members, schedules] = await Promise.all([a.list(`households/${hid}/children`), a.list(`households/${hid}/members`), a.list(`households/${hid}/schedules`)]);
      const m = loadMirror(hid);
      m.household = h.data;
      mergeCollection(m, "children", kids, hid);
      mergeCollection(m, "members", members, hid);
      mergeCollection(m, "schedules", schedules, hid);
      saveMirror(m);
      if (storage) storage.setItem(CODE_KEY, code);
      return { ok: true, householdId: hid, mirror: m };
    }

    /** 서버 스냅샷을 미러에 합친다. 대기열에 있는 문서는 로컬이 이긴다. */
    function mergeCollection(m, kind, docs, hid) {
      const pendingIds = new Set(
        loadPending(hid)
          .map((e) => e.path.split("/"))
          .filter((s) => s[2] === kind)
          .map((s) => s[3])
      );
      const next = {};
      docs.forEach((d) => {
        if (pendingIds.has(d.id)) next[d.id] = kind === "schedules" && m[kind][d.id] ? m[kind][d.id] : { ...d.data, ...(m[kind][d.id] || {}) };
        else next[d.id] = d.data;
      });
      pendingIds.forEach((id) => {
        if (!next[id] && m[kind][id]) next[id] = m[kind][id];
      });
      m[kind] = next;
    }

    // ── 아이 링크 / 담당자 ────────────────────────────────────────────
    async function addChild(hid, { familyCode, displayName, order, colorKey }) {
      if (!enabled()) return DISABLED;
      const childKey = newId("c");
      const payload = { v: 1, familyCode, displayName: displayName || "", order: order || 1, addedAt: now() };
      if (colorKey) payload.colorKey = colorKey;
      const r = await write(hid, { op: "set", path: `households/${hid}/children/${childKey}`, payload });
      return { ...r, childKey };
    }
    async function updateChild(hid, childKey, fields) {
      if (!enabled()) return DISABLED;
      return write(hid, { op: "set", merge: true, path: `households/${hid}/children/${childKey}`, payload: fields });
    }
    /** 소프트 분리 — 링크는 남기고 removedAt 만 표시(아이 문서는 그대로). */
    async function removeChild(hid, childKey) {
      if (!enabled()) return DISABLED;
      return write(hid, { op: "set", merge: true, path: `households/${hid}/children/${childKey}`, payload: { removedAt: now() } });
    }
    async function upsertMember(hid, { memberId, role, label, order, colorKey, uid }) {
      if (!enabled()) return DISABLED;
      const id = memberId || newId("m");
      const t = now();
      const existing = loadMirror(hid).members[id];
      const payload = { v: 1, role, label, order: order || 1, createdAt: existing ? existing.createdAt : t, updatedAt: t };
      if (colorKey) payload.colorKey = colorKey;
      if (uid) payload.uid = uid; // D2: 이 구성원을 맡은 계정(없으면 필드를 건드리지 않는다)
      const r = await write(hid, { op: "set", merge: true, path: `households/${hid}/members/${id}`, payload });
      return { ...r, memberId: id };
    }
    async function removeMember(hid, memberId) {
      if (!enabled()) return DISABLED;
      const t = now();
      return write(hid, { op: "set", merge: true, path: `households/${hid}/members/${memberId}`, payload: { deletedAt: t, updatedAt: t } });
    }

    // ── 사용자 일정(households/{hid}/schedules/{sid}) ────────────────────────
    // 문서 모양·검증은 UserSchedule(B2)이 정한다. 여기서는 저장 위치·미러·대기열만 맡는다(스키마를 다시 정의하지 않는다).
    /** doc: UserSchedule.buildCreateDoc 의 결과. 문서 ID 는 클라이언트가 만든다. */
    async function createSchedule(hid, doc) {
      if (!enabled()) return DISABLED;
      const scheduleId = newId("s");
      const r = await write(hid, { op: "set", path: `households/${hid}/schedules/${scheduleId}`, payload: { ...doc } });
      return { ...r, scheduleId };
    }
    /** patch: UserSchedule.buildPatch 의 patch(평탄 맵, "exceptions.<날짜>" dot-path, null=필드 삭제). 문서 단위 update. */
    async function patchSchedule(hid, scheduleId, patch) {
      if (!enabled()) return DISABLED;
      return write(hid, { op: "update", path: `households/${hid}/schedules/${scheduleId}`, payload: { ...patch } });
    }
    /** 미러의 일정 목록 [{id, ...문서}]. CalendarModel 의 user.schedules 입력 형태. */
    function getSchedules(hid) {
      if (!enabled() || !hid) return [];
      return Object.entries(loadMirror(hid).schedules).map(([id, d]) => ({ ...d, id }));
    }

    /** 가구 코드 재발급 — 새 코드 문서를 만들고 이전 코드를 비활성화한다(R3). */
    async function reissueCode(hid, oldCode) {
      if (!enabled()) return DISABLED;
      const t = now();
      let code = newCode();
      try {
        for (let i = 0; i < 8; i++) {
          const ex = await getAdapter().get("householdCodes/" + code);
          if (!ex.exists) break;
          code = newCode();
        }
      } catch (e) {
        noteError(e);
      }
      await write(hid, { op: "set", path: "householdCodes/" + code, payload: { householdId: hid, active: true, createdAt: t, revokedAt: null } });
      if (oldCode) await write(hid, { op: "update", path: "householdCodes/" + oldCode, payload: { active: false, revokedAt: t } });
      if (storage) storage.setItem(CODE_KEY, code);
      return { ok: true, code };
    }

    // ── 리스너(등록/해제를 한 곳에서) ─────────────────────────────────
    let unsubs = [];
    function startListening(hid, onChange) {
      if (!enabled()) return DISABLED;
      stopListening();
      const a = getAdapter();
      const apply = (fn) => {
        const m = loadMirror(hid);
        fn(m);
        saveMirror(m);
        if (onChange) onChange(m);
      };
      const err = (e) => noteError(e);
      unsubs = [
        a.listen("households/" + hid, (d) => d && apply((m) => (m.household = { ...d.data })), err),
        a.listen(`households/${hid}/children`, (docs) => apply((m) => mergeCollection(m, "children", docs, hid)), err),
        a.listen(`households/${hid}/members`, (docs) => apply((m) => mergeCollection(m, "members", docs, hid)), err),
        a.listen(`households/${hid}/schedules`, (docs) => apply((m) => mergeCollection(m, "schedules", docs, hid)), err),
      ];
      return { ok: true };
    }
    function stopListening() {
      unsubs.forEach((u) => {
        try {
          u();
        } catch (e) {}
      });
      unsubs = [];
    }

    /** 앱 시작·online·visibilitychange 에서 대기열을 보낸다. 플래그가 꺼져 있으면 아무것도 등록하지 않는다. */
    function attachLifecycle(win, getHid) {
      if (!enabled() || !win) return false;
      const go = () => {
        const hid = getHid();
        if (hid) flush(hid);
      };
      win.addEventListener("online", go);
      win.document.addEventListener("visibilitychange", () => {
        if (win.document.visibilityState === "visible") go();
      });
      go();
      return true;
    }

    /**
     * 이 기기에서만 가구를 나간다(N6). 서버에는 아무것도 쓰지 않는다(가구 문서·멤버·일정 그대로, 다른 가족 기기 영향 없음).
     * 리스너를 끄고 이 기기의 가구 코드·미러·대기열을 지운다. 대기열(서버에 못 보낸 변경)은 버려지므로
     * 호출 전에 getStatus(hid).pending 으로 건수를 알려 주는 건 호출부의 몫이다. 같은 코드로 다시 참여할 수 있다.
     */
    function leaveLocal(hid) {
      if (!enabled()) return DISABLED;
      const discarded = hid ? loadPending(hid).length : 0;
      stopListening();
      try {
        if (storage) {
          storage.removeItem(CODE_KEY);
          if (hid) {
            storage.removeItem(MIRROR_PREFIX + hid);
            storage.removeItem(PENDING_PREFIX + hid);
          }
        }
      } catch (e) {
        state.lastError = e;
        return { ok: false, reason: "storage" };
      }
      state.permissionDenied = false;
      return { ok: true, discarded };
    }

    function getStatus(hid) {
      return {
        enabled: enabled(),
        pending: enabled() && hid ? loadPending(hid).length : 0,
        permissionDenied: state.permissionDenied,
        lastError: state.lastError ? String(state.lastError.code || state.lastError.message || state.lastError) : null,
      };
    }
    const getMirror = (hid) => (enabled() ? loadMirror(hid) : null);

    return {
      isEnabled: enabled,
      getSavedCode,
      getMirror,
      getStatus,
      createHousehold,
      joinHousehold,
      lookupHousehold,
      firestoreAdapter, // 계정(D2)이 accounts 문서에 같은 어댑터를 쓴다(쓰기 경로 제한은 이 모듈의 write() 에만 적용된다)
      addChild,
      updateChild,
      removeChild,
      upsertMember,
      removeMember,
      createSchedule,
      patchSchedule,
      getSchedules,
      reissueCode,
      peekMembers,
      leaveLocal,
      flush,
      startListening,
      stopListening,
      attachLifecycle,
    };
  }

  return { create, firestoreAdapter, CODE_KEY, WRITE_ROOTS };
});
