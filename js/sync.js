(function () {
  const firebaseConfig = {
    apiKey: "AIzaSyC0KGZxGXLTwssoDukMON0sZS5nUvNdOGs",
    authDomain: "yuka-planner.firebaseapp.com",
    projectId: "yuka-planner",
    storageBucket: "yuka-planner.firebasestorage.app",
    messagingSenderId: "840177586261",
    appId: "1:840177586261:web:ac4c70affbe8a8517a04dc",
    measurementId: "G-P243WMXHJ4",
  };

  firebase.initializeApp(firebaseConfig);
  const db = firebase.firestore();

  const CODE_KEY = "hannun_family_code";

  function getSavedCode() {
    return localStorage.getItem(CODE_KEY);
  }
  function saveCode(code) {
    localStorage.setItem(CODE_KEY, code);
  }
  function clearCode() {
    localStorage.removeItem(CODE_KEY);
  }

  async function createFamily(profileData, completedData) {
    const api=FamilyAccess.create(),state=await api.status();
    if(state.status!=="ACTIVE")throw new Error("가족 연결을 확인해 주세요.");
    const r=await api.createChild({householdId:state.householdId,profile:profileData});
    if(completedData&&Object.keys(completedData).length)await updateCompleted(r.code,completedData);
    saveCode(r.code);return r.code;
  }

  async function fetchFamily(code) {
    const doc = await db.collection("children").doc(code.toUpperCase()).get();
    if (!doc.exists) return null;
    return doc.data();
  }

  async function updateProfile(code, profileData) {
    await db
      .collection("children")
      .doc(code)
      .set({ profile: profileData, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
  }

  async function updateCompleted(code, completedData) {
    // set({merge:true})는 completed 맵을 필드 단위로 병합해서, 완료 취소로 지운 키가 서버에 그대로
    // 남아 다시 완료로 되돌아온다. update()는 completed 필드를 통째로 교체하므로 삭제가 반영된다.
    const ref = db.collection("children").doc(code);
    const payload = { completed: completedData, updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
    try {
      await ref.update(payload);
    } catch (e) {
      if (e && e.code === "not-found") await ref.set(payload, { merge: true });
      else throw e;
    }
  }

  /**
   * 완료 상태를 키 단위로 갱신한다(C1) — completed 맵 전체를 교체하지 않고 바뀐 키만 `completed` 안의 필드 경로로 쓴다.
   * 두 기기가 서로 다른 키를 체크해도 서로 덮어쓰지 않는다. 키에 하이픈·`__`가 있어(`VX-DTAP__dose-5`) "completed."+key 문자열을
   * 이어 붙이지 않고 FieldPath 객체를 쓴다. 한 번의 update 로 set·remove 를 함께 보낸다(원자적, 호출부당 쓰기 1회).
   *   changes = { set: { 키: 값 }, remove: [키, …] }
   * - 빈 변경(set·remove 모두 비어 있음)은 아무것도 보내지 않는다.
   * - 같은 키가 set 과 remove 에 모두 있으면 거부한다(어느 쪽이 맞는지 알 수 없다). 키는 비어 있지 않은 문자열, 값은 undefined 가 아니어야 한다.
   * 문서가 아직 없으면 update 가 not-found 로 실패하므로 set({merge:true})로 만든다(updateRecord 와 같은 방식, 이때 삭제할 키는 없다).
   * 기존 updateCompleted(맵 통째 교체)는 옛 호출 호환을 위해 그대로 둔다.
   */
  async function updateCompletedEntries(code, changes) {
    const setMap = (changes && changes.set) || {};
    const removeList = (changes && changes.remove) || [];
    const setKeys = Object.keys(setMap);
    const isKey = (k) => typeof k === "string" && k.length > 0;
    if (!setKeys.every(isKey) || !removeList.every(isKey)) throw new Error("completed 키는 비어 있지 않은 문자열이어야 합니다");
    if (setKeys.some((k) => setMap[k] === undefined)) throw new Error("completed 값은 undefined 일 수 없습니다");
    const overlap = removeList.filter((k) => Object.prototype.hasOwnProperty.call(setMap, k));
    if (overlap.length) throw new Error("같은 키를 set 과 remove 에 함께 둘 수 없습니다: " + overlap.join(","));
    const removeKeys = Array.from(new Set(removeList));
    if (!setKeys.length && !removeKeys.length) return;
    const ref = db.collection("children").doc(code);
    const stamp = firebase.firestore.FieldValue.serverTimestamp();
    const del = firebase.firestore.FieldValue.delete();
    const args = [];
    for (const k of setKeys) args.push(new firebase.firestore.FieldPath("completed", k), setMap[k]);
    for (const k of removeKeys) args.push(new firebase.firestore.FieldPath("completed", k), del);
    args.push("updatedAt", stamp);
    try {
      await ref.update(...args);
    } catch (e) {
      if (e && e.code === "not-found") await ref.set({ completed: { ...setMap }, updatedAt: stamp }, { merge: true });
      else throw e;
    }
  }
  /**
   * 변경 전·후 completed 맵을 비교해 실제 바뀐 키만 { set, remove } 로 돌려준다(순수 함수, 서버 호출 없음).
   * set = 값이 새로 생겼거나 다른 객체로 바뀐 키, remove = 변경 후 사라진 키. updateCompletedEntries 에 그대로 넘긴다.
   */
  function diffCompleted(before, after) {
    const b = before || {};
    const a = after || {};
    const set = {};
    const remove = [];
    for (const k of Object.keys(a)) if (b[k] !== a[k]) set[k] = a[k];
    for (const k of Object.keys(b)) if (!Object.prototype.hasOwnProperty.call(a, k)) remove.push(k);
    return { set, remove };
  }
  function setCompletedEntry(code, key, entry) {
    return updateCompletedEntries(code, { set: { [key]: entry } });
  }
  function removeCompletedEntry(code, key) {
    return updateCompletedEntries(code, { remove: [key] });
  }

  /**
   * 직접 작성한 기록 하나만 갱신한다 — records 맵 전체를 교체하지 않고 "records.<id>" 필드 하나만 쓰므로
   * 두 기기가 서로 다른 기록을 동시에 써도 서로 덮어쓰지 않는다(completed 맵과 다른 점).
   * id에는 점(.)이 들어가지 않는다(js/records.js newId).
   */
  async function updateRecord(code, id, record) {
    const ref = db.collection("children").doc(code);
    const stamp = firebase.firestore.FieldValue.serverTimestamp();
    try {
      await ref.update({ ["records." + id]: record, updatedAt: stamp });
    } catch (e) {
      if (e && e.code === "not-found") await ref.set({ records: { [id]: record }, updatedAt: stamp }, { merge: true });
      else throw e;
    }
  }

  /**
   * 아이 문서(children/{코드}: 프로필·완료·직접 기록 전부)를 서버에서 지운다. 거부되면 던진다(호출부가 재시도·안내). 이미 없는 문서는 성공으로 본다.
   * 하위 컬렉션은 쓰지 않는다(v1 구조는 한 문서에 다 들어 있다).
   */
  async function deleteFamily(code) {
    const api=FamilyAccess.create(),state=await api.status();
    if(state.status!=="ACTIVE")throw new Error("가족 연결을 확인해 주세요.");
    await api.removeChild({householdId:state.householdId,code});
  }

  function listen(code, onChange) {
    return db
      .collection("children")
      .doc(code)
      .onSnapshot(
        (doc) => {
          if (doc.exists) onChange(doc.data());
        },
        (err) => console.error("가족코드 동기화 오류", err)
      );
  }

  window.FamilySync = {
    getSavedCode,
    saveCode,
    clearCode,
    createFamily,
    fetchFamily,
    updateProfile,
    updateCompleted,
    updateCompletedEntries,
    diffCompleted,
    setCompletedEntry,
    removeCompletedEntry,
    updateRecord,
    deleteFamily,
    listen,
  };
})();
