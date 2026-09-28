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
  const CODE_CHARS = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"; // 0/O, 1/I/L 등 헷갈리는 문자 제외

  function randomCode(len = 6) {
    let s = "";
    for (let i = 0; i < len; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    return s;
  }

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
    let code = randomCode();
    for (let i = 0; i < 3; i++) {
      const doc = await db.collection("families").doc(code).get();
      if (!doc.exists) break;
      code = randomCode();
    }
    await db
      .collection("families")
      .doc(code)
      .set({
        profile: profileData,
        completed: completedData || {},
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
    saveCode(code);
    return code;
  }

  async function fetchFamily(code) {
    const doc = await db.collection("families").doc(code.toUpperCase()).get();
    if (!doc.exists) return null;
    return doc.data();
  }

  async function updateProfile(code, profileData) {
    await db
      .collection("families")
      .doc(code)
      .set({ profile: profileData, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
  }

  async function updateCompleted(code, completedData) {
    await db
      .collection("families")
      .doc(code)
      .set({ completed: completedData, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
  }

  function listen(code, onChange) {
    return db
      .collection("families")
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
    listen,
  };
})();
