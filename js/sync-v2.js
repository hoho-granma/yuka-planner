/*
 * Firestore 구조 v2 — familyCodes/{code} -> families/{familyId}/children/{childId}/completions/{completionId}
 *
 * 이 파일은 아직 index.html에서 로드하지 않는다(의도적).
 * app.js는 여전히 js/sync.js(레거시 families/{code} 단일 문서 구조)만 사용하며,
 * 이 파일이 존재한다고 해서 지금 서비스 동작은 전혀 바뀌지 않는다.
 *
 * 다음 단계(Todo 계산 엔진 연결)에서:
 *   1) index.html에 <script src="js/sync-v2.js"></script> 추가
 *   2) js/app.js가 FamilySync 대신 FamilySyncV2를 사용하도록 전환
 *   3) 최초 진입 시 migrateLegacyFamilyIfNeeded()로 레거시 데이터를 지연 마이그레이션
 * 를 진행한다. 상세 계획은 docs/Firestore-마이그레이션-계획.md 참고.
 */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) {
    // Node 환경(단위 테스트용) — Firestore I/O 없는 순수 로직만 export한다.
    module.exports = factory(null);
  } else {
    root.FamilySyncV2 = factory(root.firebase);
  }
})(typeof window !== "undefined" ? window : global, function (firebaseSdk) {
  "use strict";

  const CODES_COL = "familyCodes";
  const FAMILIES_COL = "families";
  const CODE_CHARS = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
  const VALID_RECORD_TYPES = ["MILESTONE_REPORTED", "TODO_COMPLETED"];

  // ---------------------------------------------------------------------
  // 순수 로직 (Firestore 의존 없음 — Node에서 그대로 단위 테스트 가능)
  // ---------------------------------------------------------------------

  function randomCode(len = 6) {
    let s = "";
    for (let i = 0; i < len; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    return s;
  }

  /** CompletionRecord의 document ID. 같은 조합이면 항상 같은 ID → 자연 중복방지(upsert). */
  function buildCompletionId(todoId, occurrenceKey, recordType) {
    if (!todoId || !occurrenceKey || !recordType) {
      throw new Error("buildCompletionId: todoId/occurrenceKey/recordType 모두 필요");
    }
    if (VALID_RECORD_TYPES.indexOf(recordType) === -1) {
      throw new Error(`buildCompletionId: 알 수 없는 recordType "${recordType}"`);
    }
    return `${todoId}__${occurrenceKey}__${recordType}`;
  }

  /** families/{id} 문서가 v1(레거시, 코드=문서ID, profile+completed 통짜) 형태인지 판별. */
  function isLegacyFamilyDoc(data) {
    if (!data) return false;
    if (data.archived) return false; // 이미 마이그레이션 완료됨
    // v1 문서는 profile 필드를 가진다. v2 문서는 currentCode/province/district를 최상위에 직접 가진다.
    return !!data.profile && typeof data.profile === "object";
  }

  /** 레거시 문서(profile+completed)를 v2 3계층(family/child/completions 페이로드)으로 변환 계획만 세운다. Firestore 쓰기는 하지 않는다. */
  function planLegacyMigration(legacyCode, legacyData) {
    if (!isLegacyFamilyDoc(legacyData)) {
      throw new Error("planLegacyMigration: v1 형태가 아닌 문서입니다");
    }
    const profile = legacyData.profile;
    const completedMap = legacyData.completed || {};
    const completionWrites = Object.keys(completedMap)
      .filter((k) => completedMap[k])
      .map((legacyEventId) => ({
        // 주의: 레거시 일정 id ↔ v2 todo_id 매핑표는 Todo 엔진 단계에서 확정한다.
        // 지금은 "그대로 옮겨 적는다"는 자리만 마련해둔다.
        todoId: legacyEventId,
        occurrenceKey: "default",
        recordType: "TODO_COMPLETED",
      }));

    return {
      familyPayload: {
        province: profile.province,
        district: profile.district,
        familyDeclaredAttributes: {},
      },
      childPayload: {
        birthDate: profile.birthDate,
        gender: profile.gender || null,
        childDeclaredAttributes: {},
      },
      completionWrites,
      legacyCode,
    };
  }

  // ---------------------------------------------------------------------
  // Firestore I/O (브라우저 전용 — firebase가 없으면(=Node 테스트) 아래는 정의하지 않는다)
  // ---------------------------------------------------------------------

  if (!firebaseSdk || typeof firebaseSdk.firestore !== "function") {
    return { buildCompletionId, isLegacyFamilyDoc, planLegacyMigration, randomCode };
  }

  const db = firebaseSdk.firestore();
  const FieldValue = firebaseSdk.firestore.FieldValue;

  async function reserveFamilyCode(familyId) {
    let code = randomCode();
    for (let i = 0; i < 5; i++) {
      const ref = db.collection(CODES_COL).doc(code);
      const existing = await ref.get();
      if (!existing.exists) {
        await ref.set({
          familyId,
          active: true,
          createdAt: FieldValue.serverTimestamp(),
          revokedAt: null,
        });
        return code;
      }
      code = randomCode();
    }
    throw new Error("가족코드 발급 실패 — 재시도 초과(5회)");
  }

  async function resolveFamilyId(code) {
    const doc = await db.collection(CODES_COL).doc(code.toUpperCase()).get();
    if (!doc.exists) return null;
    const data = doc.data();
    if (data.active === false) return null;
    return data.familyId;
  }

  async function createFamilyV2(familyInput, childInput) {
    const familyRef = db.collection(FAMILIES_COL).doc(); // auto-id — 6자리 코드와 절대 겹치지 않는 길이/문자셋
    const code = await reserveFamilyCode(familyRef.id);
    await familyRef.set({
      currentCode: code,
      province: familyInput.province,
      district: familyInput.district,
      familyDeclaredAttributes: familyInput.familyDeclaredAttributes || {},
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    const childRef = familyRef.collection("children").doc();
    await childRef.set({
      birthDate: childInput.birthDate,
      gender: childInput.gender || null,
      childDeclaredAttributes: childInput.childDeclaredAttributes || {},
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return { code, familyId: familyRef.id, childId: childRef.id };
  }

  async function getFamilyByCode(code) {
    const familyId = await resolveFamilyId(code);
    if (!familyId) return null;
    const familyDoc = await db.collection(FAMILIES_COL).doc(familyId).get();
    if (!familyDoc.exists) return null;
    const childrenSnap = await familyDoc.ref.collection("children").get();
    const children = childrenSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    return { familyId, family: familyDoc.data(), children };
  }

  async function getCompletions(familyId, childId) {
    const snap = await db
      .collection(FAMILIES_COL)
      .doc(familyId)
      .collection("children")
      .doc(childId)
      .collection("completions")
      .get();
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  }

  async function upsertCompletion(familyId, childId, { todoId, occurrenceKey = "default", recordType, recordedAt }) {
    const id = buildCompletionId(todoId, occurrenceKey, recordType);
    await db
      .collection(FAMILIES_COL)
      .doc(familyId)
      .collection("children")
      .doc(childId)
      .collection("completions")
      .doc(id)
      .set(
        {
          todo_id: todoId,
          occurrenceKey,
          recordType,
          recordedAt: recordedAt || FieldValue.serverTimestamp(),
          createdAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    return id;
  }

  async function reissueFamilyCode(familyId, oldCode) {
    const newCode = await reserveFamilyCode(familyId);
    await db.collection(FAMILIES_COL).doc(familyId).update({
      currentCode: newCode,
      updatedAt: FieldValue.serverTimestamp(),
    });
    if (oldCode) {
      await db.collection(CODES_COL).doc(oldCode.toUpperCase()).update({
        active: false,
        revokedAt: FieldValue.serverTimestamp(),
      });
    }
    return newCode;
  }

  /**
   * 레거시 families/{code} 문서(v1)가 있으면 v2로 1회 이관한다.
   * 원본 문서는 삭제하지 않고 archived:true만 남긴다(요청사항: 기존 데이터 보존).
   * 아직 어디에서도 호출하지 않는다 — 다음 단계에서 app.js 초기화 로직에 연결 예정.
   */
  async function migrateLegacyFamilyIfNeeded(code) {
    const legacyRef = db.collection(FAMILIES_COL).doc(code.toUpperCase());
    const legacyDoc = await legacyRef.get();
    if (!legacyDoc.exists) return null;
    const data = legacyDoc.data();
    if (!isLegacyFamilyDoc(data)) return null; // 이미 v2거나, v1이 아닌 문서

    const plan = planLegacyMigration(code, data);
    const { code: newCode, familyId, childId } = await createFamilyV2(plan.familyPayload, plan.childPayload);
    for (const w of plan.completionWrites) {
      await upsertCompletion(familyId, childId, w);
    }
    await legacyRef.update({
      archived: true,
      migratedTo: familyId,
      migratedAt: FieldValue.serverTimestamp(),
    });
    return { oldCode: code, newCode, familyId, childId };
  }

  return {
    buildCompletionId,
    isLegacyFamilyDoc,
    planLegacyMigration,
    randomCode,
    reserveFamilyCode,
    resolveFamilyId,
    createFamilyV2,
    getFamilyByCode,
    getCompletions,
    upsertCompletion,
    reissueFamilyCode,
    migrateLegacyFamilyIfNeeded,
  };
});
