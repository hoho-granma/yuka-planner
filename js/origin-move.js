/*
 * origin-move — 주소 변경(GitHub Pages → Firebase Hosting)에 따른 기기 로컬 데이터 전달.
 * 옛 주소의 moved.html 이 새 주소의 transfer.html(iframe)로 postMessage 를 보내고, 받는 쪽이 허용 목록의 키만 쓴다.
 * 데이터는 URL 에 싣지 않는다. 로그인 상태(Firebase Auth)는 옮기지 않는다 — 새 주소에서 다시 로그인한다.
 * 받는 쪽은 이미 있는 값을 덮어쓰지 않는다(여러 번 전달해도 안전).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.OriginMove = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";
  const OLD_ORIGIN = "https://hoho-granma.github.io";
  const NEW_ORIGIN = "https://yuka-planner.web.app";
  const KEY_RE = /^(hannun_(?!feature_)|hn_|hn-|yukjigi_)/;
  const IDB_NAMES = ["hannun-growth-records", "hannun-learning-checks"];

  function collectLocal(storage) {
    const out = {};
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i);
      if (k && KEY_RE.test(k)) out[k] = storage.getItem(k);
    }
    return out;
  }
  function applyLocal(storage, data) {
    let written = 0, skipped = 0;
    Object.keys(data && typeof data === "object" ? data : {}).forEach((k) => {
      const v = data[k];
      if (!KEY_RE.test(k) || typeof v !== "string" || storage.getItem(k) !== null) { skipped++; return; }
      storage.setItem(k, v); written++;
    });
    return { written, skipped };
  }

  const req = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  async function exportIdb(idb, names) {
    if (!idb || typeof idb.databases !== "function") return [];
    const have = (await idb.databases()).map((d) => d.name);
    const dumps = [];
    for (const name of names) {
      if (!have.includes(name)) continue;
      try {
        const db = await req(idb.open(name));
        const tx = db.transaction(Array.from(db.objectStoreNames), "readonly");
        const stores = [];
        for (const sn of Array.from(db.objectStoreNames)) {
          const s = tx.objectStore(sn);
          stores.push({
            name: sn, keyPath: s.keyPath, autoIncrement: s.autoIncrement,
            indexes: Array.from(s.indexNames).map((n) => { const ix = s.index(n); return { name: n, keyPath: ix.keyPath, unique: ix.unique, multiEntry: ix.multiEntry }; }),
            rows: await req(s.getAll()),
          });
        }
        dumps.push({ name, version: db.version, stores });
        db.close();
      } catch (e) { /* 한 DB 가 실패해도 나머지는 옮긴다 */ }
    }
    return dumps;
  }
  async function importIdb(idb, dumps, names) {
    let rows = 0;
    for (const d of Array.isArray(dumps) ? dumps : []) {
      if (!d || !(names || IDB_NAMES).includes(d.name) || !Array.isArray(d.stores)) continue;
      await new Promise((res) => { // 스토어 없는 빈 DB 가 있으면(버전만 올라간 상태) 지우고 원본 버전으로 다시 만든다
        const o = idb.open(d.name);
        o.onsuccess = () => { const empty = o.result.objectStoreNames.length === 0; o.result.close(); if (!empty) return res(); const q = idb.deleteDatabase(d.name); q.onsuccess = q.onerror = q.onblocked = () => res(); };
        o.onerror = () => res();
      });
      const db = await new Promise((res, rej) => {
        const r = idb.open(d.name, d.version || 1);
        r.onupgradeneeded = () => d.stores.forEach((s) => {
          if (r.result.objectStoreNames.contains(s.name)) return;
          const st = r.result.createObjectStore(s.name, { keyPath: s.keyPath, autoIncrement: !!s.autoIncrement });
          (s.indexes || []).forEach((ix) => st.createIndex(ix.name, ix.keyPath, { unique: !!ix.unique, multiEntry: !!ix.multiEntry }));
        });
        r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
      });
      for (const s of d.stores) {
        if (!db.objectStoreNames.contains(s.name)) continue;
        for (const row of s.rows || []) {
          await new Promise((res) => {
            const tx = db.transaction(s.name, "readwrite"), add = tx.objectStore(s.name).add(row);
            add.onsuccess = () => { rows++; };
            add.onerror = (e) => { e.preventDefault(); e.stopPropagation(); }; // 이미 있는 키는 덮어쓰지 않는다
            tx.oncomplete = res; tx.onerror = res; tx.onabort = res;
          });
        }
      }
      db.close();
    }
    return rows;
  }

  /**
   * 옛 주소 쪽. **사용자가 누른 클릭 안에서** 호출해야 한다(팝업 차단 방지).
   * 새 주소를 팝업(최상위 컨텍스트 = 첫 번째 당사자 저장소)으로 열어 메모리로만 전달한다. iframe 은 브라우저가 저장소를 분리해서 쓸 수 없다.
   * → Promise<{ok, reason?, ls?, idbRows?}>
   */
  function send(win, timeoutMs) {
    return new Promise((resolve) => {
      let done = false, popup = null;
      const finish = (r) => { if (done) return; done = true; win.removeEventListener("message", onMsg); clearTimeout(t); resolve(r); };
      const t = setTimeout(() => finish({ ok: false, reason: "timeout" }), timeoutMs || 15000);
      async function onMsg(e) {
        if (e.origin !== NEW_ORIGIN || !e.data || e.source !== popup) return;
        if (e.data.type === "hn-transfer-ready") {
          try {
            const idb = await exportIdb(win.indexedDB, IDB_NAMES);
            popup.postMessage({ type: "hn-transfer", ls: collectLocal(win.localStorage), idb }, NEW_ORIGIN);
          } catch (err) { finish({ ok: false, reason: "export" }); }
        } else if (e.data.type === "hn-transfer-done") finish({ ok: !!e.data.ok, ls: e.data.ls, idbRows: e.data.idbRows });
      }
      win.addEventListener("message", onMsg);
      popup = win.open(NEW_ORIGIN + "/transfer.html", "hn-transfer", "width=360,height=480");
      if (!popup) finish({ ok: false, reason: "blocked" });
    });
  }
  /** 새 주소 쪽(transfer.html, 팝업으로 열렸을 때): 옛 주소에서 온 메시지만 받고, 끝나면 스스로 닫는다. */
  function receive(win) {
    win.addEventListener("message", async (e) => {
      if (e.origin !== OLD_ORIGIN || !e.data || e.data.type !== "hn-transfer" || e.source !== win.opener) return;
      let ok = true, ls = null, idbRows = 0;
      try { ls = applyLocal(win.localStorage, e.data.ls); } catch (err) { ok = false; }
      try { idbRows = await importIdb(win.indexedDB, e.data.idb, IDB_NAMES); } catch (err) { /* 로컬 기록 일부만 옮겨질 수 있다 */ }
      e.source.postMessage({ type: "hn-transfer-done", ok, ls, idbRows }, OLD_ORIGIN);
      setTimeout(() => { try { win.close(); } catch (err) {} }, 300);
    });
    if (win.opener) win.opener.postMessage({ type: "hn-transfer-ready" }, OLD_ORIGIN);
  }
  return { OLD_ORIGIN, NEW_ORIGIN, KEY_RE, IDB_NAMES, collectLocal, applyLocal, exportIdb, importIdb, send, receive };
});
