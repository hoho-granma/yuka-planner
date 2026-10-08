/* Accounts restore self-owned profiles; signup/join and membership linking are handled only by the approval server. */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else root.AccountSync = factory();
})(typeof window !== "undefined" ? window : global, function () {
  "use strict";

  const ACCOUNT_ROLES = Object.freeze(["MOM", "DAD", "CHILD", "CAREGIVER"]);
  const SEED_ROLES = Object.freeze(["MOM", "DAD"]);
  const pathOf = (uid) => "accounts/" + uid;
  const isDenied = (e) => !!e && (e.code === "permission-denied" || e.reason === "permission-denied");

  /**
   * 이 계정이 맡을 구성원을 고른다(순수). members: { memberId: doc } 또는 [{memberId,...}].
   * ① 이미 내 uid 가 달린 구성원 → 그대로 ② 엄마/아빠이고 같은 role 의 시드(uid 없음·삭제 안 됨) → 확보(라벨·순서 유지) ③ 새 구성원(라벨=표시 이름, 순서=최대+1)
   * 반환 { memberId|null, role, label, order, claimed: boolean }
   */
  /** 아직 가입하지 않은 자리(uid 없음·삭제 안 됨). 합류 시트의 '누구로 합류하나요?' 목록. 순서대로. */
  function openSlots(members) {
    const list = Array.isArray(members) ? members : Object.entries(members || {}).map(([memberId, m]) => ({ memberId, ...m }));
    return list.filter((m) => m && m.memberId && !m.deletedAt && !m.uid).sort((a, b) => (a.order || 0) - (b.order || 0));
  }
  /** 구성원 role → accounts 문서 role(규칙은 MOM·DAD·CHILD·CAREGIVER 만 허용). */
  const accountRoleOf = (role) => (ACCOUNT_ROLES.includes(role) ? role : "CAREGIVER");
  function chooseMember(members, { role, uid, displayName, slotMemberId, claimRole }) {
    const list = (Array.isArray(members) ? members : Object.entries(members || {}).map(([memberId, m]) => ({ memberId, ...m }))).filter((m) => m && !m.deletedAt);
    const mine = list.find((m) => m.uid === uid);
    if (mine) return { memberId: mine.memberId, role: mine.role, label: mine.label, order: mine.order || 1, claimed: true };
    if (slotMemberId) { // 합류하는 사람이 고른 자리(아직 uid 가 없는 것만) — 역할·이름은 자리의 것을 쓴다
      const slot = list.find((m) => m.memberId === slotMemberId && !m.uid);
      if (slot) return { memberId: slot.memberId, role: slot.role, label: slot.label, order: slot.order || 1, claimed: true };
    }
    if (claimRole) { // 초대 링크로 가입: 초대한 사람이 만들어 둔 그 역할의 빈 자리(uid 없음)를 차지한다
      const open = list.filter((m) => m.role === role && !m.uid).sort((a, b) => (a.order || 0) - (b.order || 0))[0];
      if (open) return { memberId: open.memberId, role: open.role, label: open.label, order: open.order || 1, claimed: true };
    }
    if (SEED_ROLES.includes(role)) {
      const seed = list.filter((m) => m.role === role && !m.uid).sort((a, b) => (a.order || 0) - (b.order || 0))[0];
      if (seed) return { memberId: seed.memberId, role: seed.role, label: seed.label, order: seed.order || 1, claimed: true };
    }
    const order = list.reduce((mx, m) => Math.max(mx, m.order || 0), 0) + 1;
    return { memberId: null, role, label: String(displayName || "").trim().slice(0, 20), order, claimed: false };
  }

  function create(opts) {
    const adapter = opts.adapter;
    const household = opts.household;
    const now = opts.now || (() => Date.now());

    async function getAccount(uid) {
      const d = await adapter.get(pathOf(uid));
      return d.exists ? d.data : null;
    }

    /** 가입 마무리. user = { uid, displayName }, intent = AccountView.validateSignup 의 intent. */
    async function completeSignup({ user, intent }) {
      const uid = user.uid;
      if (opts.access) {
        try {
          if (intent.joiningCode) return {...await opts.access.requestJoin({code:intent.joiningCode,displayName:intent.displayName}),pending:true};
          const r=await opts.access.createFamily(intent);
          if(r.ok)await household.joinHousehold(r.householdId,{metadataOnly:true});
          return {...r,householdCode:r.householdId};
        } catch(e) {return {ok:false,reason:e.code?.replace("functions/","")||"network",message:e.message};}
      }
      return {ok:false,reason:"approval-service-required"};
    }

    /** 로그인 후 계정 문서 조회(다른 기기 복원용). { ok, account|null } — 규칙이 없거나 오프라인이면 account:null 로 조용히 넘어간다. */
    async function restore(uid, email) {
      try {
        const account = await getAccount(uid);
        if (account && email && account.email !== email) {
          await adapter.set(pathOf(uid), {email, updatedAt:now()}, {merge:true});
          account.email = email;
        }
        return { ok: true, account };
      } catch (e) {
        return { ok: false, account: null, reason: isDenied(e) ? "rules-unavailable" : "network" };
      }
    }

    /** 가족코드를 다시 만든 뒤 내 계정 문서의 코드를 새 코드로 바꾼다(다른 기기 로그인 때 새 코드로 복원되게). */
    async function setHouseholdCode() {
      // Invitation expiry must never replace the account's stable family ID.
      return {ok:true};
    }

    /** 내 구성원의 이름·역할을 바꿨을 때 계정 문서도 같이 갱신한다(role 은 규칙이 허용하는 4종으로 변환). */
    async function updateProfile(uid, { displayName, role }) {
      try {
        const patch = { updatedAt: now() };
        if (displayName) patch.displayName = String(displayName).slice(0, 20);
        if (role) patch.role = accountRoleOf(role);
        await adapter.set(pathOf(uid), patch, { merge: true });
        return { ok: true, patch };
      } catch (e) {
        return { ok: false, reason: isDenied(e) ? "rules-unavailable" : "network" };
      }
    }

    return { completeSignup, restore, getAccount, setHouseholdCode, updateProfile };
  }

  return { create, chooseMember, openSlots, accountRoleOf, ACCOUNT_ROLES };
});
