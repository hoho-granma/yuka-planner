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
  // 칩·일정 막대의 대표색 키(p1~p10). 색 값은 user-schedule-view.js 의 PALETTE 와 같은 순서다. 만들 때 한 번 정해 문서에 남기면 이후 바뀌지 않는다.
  const COLOR_KEYS = Object.freeze(Array.from({ length: 10 }, (_, i) => "p" + (i + 1)));
  const LEGACY_ROLE_KEY = Object.freeze({ MOM: "p5", DAD: "p4" });
  /** 아직 가장 적게 쓰인 색 키(같으면 앞 번호). 삭제됐거나 분리된 아이·구성원은 세지 않는다. */
  function pickColorKey(m) {
    const live = [...Object.values((m && m.children) || {}).filter((d) => d && !d.removedAt), ...Object.values((m && m.members) || {}).filter((d) => d && !d.deletedAt)];
    const count = Object.fromEntries(COLOR_KEYS.map((k) => [k, 0]));
    // colorKey 가 없는 엄마·아빠(옛 가구)는 옛 고정색(엄마 #ff9ec4=p5, 아빠 #7fb8ff≈p4)을 그대로 쓰므로 그 칸을 이미 쓰는 것으로 센다 — 새 구성원 색이 겹치지 않게.
    live.forEach((d) => { const k = d.colorKey || LEGACY_ROLE_KEY[d.role]; if (count[k] != null) count[k]++; });
    return COLOR_KEYS.reduce((best, k) => (count[k] < count[best] ? k : best), COLOR_KEYS[0]);
  }
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
      delete: (path) => refOf(path).delete(),
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
    const emptyMirror = (hid) => ({ householdId: hid, household: null, children: {}, members: {}, schedules: {}, todos: {} });
    const loadMirror = (hid) => {
      const m = readJson(MIRROR_PREFIX + hid, null) || emptyMirror(hid);
      if (!m.schedules) m.schedules = {}; // B3 까지 저장된 예전 미러에는 schedules 가 없다
      if (!m.todos) m.todos = {}; // G22 이전 미러에는 todos(36개월 이상 아이의 할 일)가 없다
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
      else if (seg[2] === "todos") m.todos[seg[3]] = op.merge ? mergeNulls(m.todos[seg[3]], op.payload) : { ...data };
    }

    /** merge 패치를 미러 문서에 얹는다: null 값은 그 필드를 지운다(Firestore 의 필드 삭제와 같은 의미). */
    function mergeNulls(cur, patch) {
      const o = { ...(cur || {}) };
      for (const [k, v] of Object.entries(patch || {})) {
        if (v === null) delete o[k];
        else o[k] = v;
      }
      return o;
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
    /** members: 처음 만들 구성원 시드(기본 엄마·아빠). 계정 모드는 [] 를 넘겨 구성원을 '나' 하나로 시작한다. */
    async function createHousehold({ name, firstChild, members } = {}) {
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
      const seeds = Array.isArray(members) ? members : DEFAULT_MEMBERS;
      for (let i = 0; i < seeds.length; i++) await upsertMember(hid, { ...seeds[i], order: i + 1, ...(seeds === DEFAULT_MEMBERS ? { legacyColor: true } : {}) }); // 기본 엄마·아빠 시드는 colorKey 없이 — 옛 고정색(엄마 분홍·아빠 파랑) 그대로
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
      const todos = await a.list(`households/${hid}/todos`).catch(() => []); // G22: 규칙 미배포(permission-denied)여도 합류는 계속한다
      const m = loadMirror(hid);
      m.household = h.data;
      mergeCollection(m, "children", kids, hid);
      mergeCollection(m, "members", members, hid);
      mergeCollection(m, "schedules", schedules, hid);
      mergeCollection(m, "todos", todos, hid);
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
    /** createdByUid: 이 아이를 만든 계정(로그인한 계정 모드에서만. 규칙이 request.auth.uid 와 같을 때만 허용한다). colorKey 를 주지 않으면 가장 덜 쓰인 색을 정해 남긴다. */
    async function addChild(hid, { familyCode, displayName, order, colorKey, createdByUid }) {
      if (!enabled()) return DISABLED;
      const childKey = newId("c");
      const payload = { v: 1, familyCode, displayName: displayName || "", order: order || 1, addedAt: now() };
      payload.colorKey = colorKey || pickColorKey(loadMirror(hid));
      if (createdByUid) payload.createdByUid = String(createdByUid);
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
    async function upsertMember(hid, { memberId, role, label, order, colorKey, uid, legacyColor }) {
      if (!enabled()) return DISABLED;
      const id = memberId || newId("m");
      const t = now();
      const existing = loadMirror(hid).members[id];
      const payload = { v: 1, role, label, order: order || 1, createdAt: existing ? existing.createdAt : t, updatedAt: t };
      if (colorKey) payload.colorKey = colorKey;
      else if (legacyColor && LEGACY_ROLE_KEY[role]) { /* 옛 고정색 유지: colorKey 를 남기지 않는다 */ } else if (!existing || (!existing.colorKey && !LEGACY_ROLE_KEY[existing.role])) payload.colorKey = pickColorKey(loadMirror(hid)); // 새 구성원(또는 색이 없는 엄마·아빠 외 기존 구성원)만 정한다 — 이미 있는 색, 옛 엄마·아빠의 고정색은 건드리지 않는다
      if (uid) payload.uid = uid; // D2: 이 구성원을 맡은 계정(없으면 필드를 건드리지 않는다)
      const r = await write(hid, { op: "set", merge: true, path: `households/${hid}/members/${id}`, payload });
      return { ...r, memberId: id };
    }
    /**
     * 진짜 삭제(서버 문서 삭제). 일반 쓰기와 달리 대기열에 넣지 않는다 — 거부되면(규칙 미배포·권한 없음·네트워크) 바로 { ok:false, reason } 로 돌려주고
     * 미러·대기열은 그대로 둔다(다시 시도할 수 있다). 성공하면 미러에서 빼고, 그 문서를 향한 대기열 쓰기도 버린다(나중에 되살리지 않게).
     * 이미 없는 문서의 삭제는 서버도 성공으로 본다. reason: "permission-denied" | "network".
     */
    async function hardDelete(hid, path) {
      if (!enabled()) return DISABLED;
      assertWritablePath(path);
      try {
        await getAdapter().delete(path);
      } catch (e) {
        return { ok: false, reason: e && e.code === "permission-denied" ? "permission-denied" : "network" };
      }
      const seg = path.split("/");
      const m = loadMirror(hid);
      if (seg[0] === "households" && seg.length === 4 && m[seg[2]] && typeof m[seg[2]] === "object") delete m[seg[2]][seg[3]];
      saveMirror(m);
      const q = loadPending(hid);
      const kept = q.filter((e) => e.path !== path);
      if (kept.length !== q.length) savePending(hid, kept);
      return { ok: true };
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
    // ── 할 일(households/{hid}/todos/{tid}) — 36개월 이상 아이의 체크리스트(G22). 문서 모양·검증은 ChildTodos 가 정한다. 같은 미러·대기열을 쓴다(오프라인에서 추가하면 대기열에 들어간다).
    /** doc: ChildTodos.buildCreate 의 doc. 문서 ID 는 클라이언트가 만든다. */
    async function createTodo(hid, doc) {
      if (!enabled()) return DISABLED;
      const todoId = newId("t");
      const r = await write(hid, { op: "set", path: `households/${hid}/todos/${todoId}`, payload: { ...doc } });
      return { ...r, todoId };
    }
    /** patch: ChildTodos.patch* 의 결과. 문서 하나에 set+merge(null 값은 미러에서 필드 삭제로 반영). */
    async function patchTodo(hid, todoId, patch) {
      if (!enabled()) return DISABLED;
      return write(hid, { op: "set", merge: true, path: `households/${hid}/todos/${todoId}`, payload: { ...patch } });
    }
    /** 미러의 할 일 목록 [{id, ...문서}] */
    function getTodos(hid) {
      if (!enabled() || !hid) return [];
      return Object.entries(loadMirror(hid).todos || {}).map(([id, d]) => ({ ...d, id }));
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
        a.listen(`households/${hid}/todos`, (docs) => apply((m) => mergeCollection(m, "todos", docs, hid)), err),
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
      hardDelete,
      pickColorKey,
      upsertMember,
      removeMember,
      createSchedule,
      patchSchedule,
      getSchedules,
      createTodo,
      patchTodo,
      getTodos,
      reissueCode,
      peekMembers,
      leaveLocal,
      flush,
      startListening,
      stopListening,
      attachLifecycle,
    };
  }

  return { create, firestoreAdapter, CODE_KEY, WRITE_ROOTS, COLOR_KEYS };
});
