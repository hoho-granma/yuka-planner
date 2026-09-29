// 한눈육아 서비스워커 — 테스트 버전.
//
// 캐시 정책은 일부러 보수적으로 잡았다: 의료/정책 데이터가 오래된 캐시로 보여지는 게
// 오프라인 지원보다 훨씬 위험하기 때문이다.
//   - data/*.json (73개 Todo 정의, 지원금, 지역 데이터)은 절대 캐시하지 않는다.
//     항상 네트워크로만 가져오고, 실패하면 그냥 실패시킨다(오래된 정책을 보여주는 것보다 낫다).
//   - 앱 셸(HTML/CSS/JS/아이콘)만 "네트워크 우선, 실패 시 캐시" 전략으로 캐시한다 —
//     온라인이면 항상 최신 코드를 받고, 오프라인일 때만 캐시로 대체한다.
//   - CACHE_NAME을 올릴 때마다 이전 캐시를 전부 지운다(activate 단계) — 배포 후에도
//     예전 코드가 남아있는 걸 방지한다.

const CACHE_NAME = "hannun-shell-v17";

const SHELL_ASSETS = [
  "./",
  "./index.html",
  "./css/style.css",
  "./js/sync.js",
  "./js/todo-engine.js",
  "./js/schedule.js",
  "./js/app.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

function isDataRequest(url) {
  return url.pathname.includes("/data/") && url.pathname.endsWith(".json");
}

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // 같은 출처가 아니면(Firebase, 폰트 등) 서비스워커가 관여하지 않는다.
  if (url.origin !== self.location.origin) return;

  // 데이터 파일은 절대 캐시하지 않는다 — 항상 네트워크에서만 받는다.
  if (isDataRequest(url)) {
    event.respondWith(fetch(event.request));
    return;
  }

  // 앱 셸: 네트워크 우선, 실패하면(오프라인) 캐시로 대체.
  event.respondWith(
    fetch(event.request, { cache: "no-cache" })
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return res;
      })
      .catch(() => caches.match(event.request))
  );
});
