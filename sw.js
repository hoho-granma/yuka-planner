// 한눈육아 서비스워커.
//
// 목표는 "앱을 열 때 네트워크를 거의 안 쓰는 것"이다. 정책은 파일 종류별로 다르다:
//   - data/*.json (지원금·Todo 정의·지역 데이터): 절대 캐시하지 않는다. 오래된 정책·의료 정보를 보여 주는 것보다 실패가 낫다.
//   - index.html·페이지 이동: 저장해 둔 것을 바로 보여 주고(네트워크를 기다리지 않는다) 뒤에서 최신으로 갱신한다. 저장된 게 없으면 네트워크.
//     새 버전이 배포되면 서비스워커가 교체되고, 페이지(index.html)가 그걸 감지해 한 번 새로고침한다.
//   - css/·js/ 중 주소에 ?v=번호가 붙은 파일: 캐시 우선. 파일이 바뀌면 index.html 이 번호를 올리므로 주소가 달라져 새로 받는다.
//     (번호를 올리지 않고 파일만 고치면 같은 앱 버전 안에서는 예전 파일이 남는다 — 배포 때 번호·APP_VERSION 을 같이 올린다.)
//   - 글꼴·아이콘: 캐시 우선. 그 밖(manifest, version.js, 별도 html 등): 네트워크 우선, 실패하면 캐시.
//   - CACHE_NAME 에 APP_VERSION 이 들어 있어서 버전이 바뀌면 이전 캐시를 전부 지운다(activate).
//   - 설치할 때 index.html 이 가리키는 파일을 미리 받아 둔다(첫 배포 뒤 두 번째 방문부터 바로 뜬다).

// 버전은 js/version.js 한 곳에서만 올린다 — 캐시 이름도 거기서 만든다(버전이 바뀌면 이전 캐시를 전부 지운다).
importScripts("js/version.js");
const CACHE_NAME = `hannun-shell-v${self.APP_VERSION}`;
const OCR_CACHE_PREFIX = "hannun-ocr-"; // js/capture/ocr-tesseract.js 의 CACHE_NAME 과 같은 접두
const OCR_CACHE = "hannun-ocr-v1";

const SHELL_ASSETS = [
  "./",
  "./index.html",
  "./css/style.css",
  "./fonts/Pretendard-Regular.subset.woff2",
  "./fonts/Pretendard-Medium.subset.woff2",
  "./fonts/Pretendard-SemiBold.subset.woff2",
  "./fonts/Pretendard-Bold.subset.woff2",
  "./css/character-ui.css",
  "./js/character-ui.js",
  "./icons/family/boy-1.webp",
  "./icons/family/boy-2.webp",
  "./icons/family/boy-3.webp",
  "./icons/family/girl-1.webp",
  "./icons/family/girl-2.webp",
  "./icons/family/girl-3.webp",
  "./icons/family/mom-1.webp",
  "./icons/family/mom-2.webp",
  "./icons/family/mom-3.webp",
  "./icons/family/dad-1.webp",
  "./icons/family/dad-2.webp",
  "./icons/family/dad-3.webp",
  "./css/places.css",
  "./css/growth-records.css",
  "./js/growth-records.js",
  "./css/learning-check.css",
  "./js/learning-check-bank.js",
  "./js/learning-check.js",
  "./js/education-info.js",
  "./js/education-directory.js",
  "./js/education-public-programs.js",
  "./js/education-interests.js",
  "./learning-check-paper.html",
  "./curriculum-map.html",
  "./js/curriculum-map-data.js",
  "./js/education-reference.js",
  "./js/education-reference-view.js",
  "./js/growth-learning-view.js",
  "./js/version.js",
  "./js/date-calc.js",
  "./js/child-timeline.js",
  "./js/school-policy.js",
  "./js/auto-after36.js",
  "./js/auto-steps.js",
  "./js/next-stage-card.js",
  "./js/capture/parse-ko.js",
  "./js/capture/draft-view.js",
  "./js/capture/capture-model.js",
  "./js/capture/text-recognition.js",
  "./js/capture/photo-compress.js",
  "./js/capture/photo-crop.js",
  "./js/capture/ocr-tesseract.js",
  "./js/capture/photo-view.js",
  "./js/capture/ai-parser.js",
  "./js/capture/schedule-review.js",
  "./js/capture/source-photo.js",
  "./css/schedule-review.css",
  "./css/motion.css",
  "./js/capture/voice.js",
  "./css/capture.css",
  "./js/next-stage.js",
  "./js/db-paths.js",
  "./js/growth-evidence.js",
  "./js/growth-sync.js",
  "./js/sync.js",
  "./js/feature-flags.js",
  "./js/household-sync.js",
  "./js/household-view.js",
  "./js/kakao-login.js",
  "./js/auth-service.js",
  "./js/account-view.js",
  "./js/account-sync.js",
  "./js/app-access.js",
  "./js/family-access.js",
  "./js/family-access-view.js",
  "./css/family-access.css",
  "./js/todo-engine.js",
  "./js/schedule.js",
  "./js/hn-logic.js",
  "./js/home.js",
  "./js/subsidy-tiers.js",
  "./js/subsidy-view.js",
  "./js/date-picker.js",
  "./js/user-schedule.js",
  "./js/calendar-model.js",
  "./js/calendar-week.js",
  "./js/apply-channel-view.js",
  "./js/apply-links.js",
  "./js/home-order.js",
  "./js/places.js",
  "./js/places-view.js",
  "./js/schedule-kinds.js",
  "./js/child-todos.js",
  "./js/over36-view.js",
  "./js/edu-3to5-view.js",
  "./js/tab-swipe.js",
  "./js/edu-trend.js",
  "./js/pregnancy-basis.js",
  "./js/time-range.js",
  "./js/time-wheel.js",
  "./js/user-schedule-view.js",
  "./js/child-anniversaries.js",
  "./js/korean-holidays.js",
  "./js/tab-child-bar.js",
  "./js/home-must.js",
  "./js/curation.js",
  "./js/month-tiers.js",
  "./js/motion.js",
  "./js/app.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-180.png",
];

const NAV_TIMEOUT_MS = 3000;

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    try {
      const res = await fetch("./index.html", { cache: "no-cache" });
      const html = await res.clone().text();
      await cache.put("./index.html", res);
      // index.html 이 실제로 요청하는 주소(?v=번호 포함)를 그대로 받아 둔다.
      const urls = [...html.matchAll(/(?:src|href)="((?:css|js|fonts|icons)\/[^"#]+)"/g)].map((m) => "./" + m[1]);
      const rest = SHELL_ASSETS.filter((u) => !/^\.\/(js|css)\//.test(u) && u !== "./index.html" && u !== "./");
      await Promise.allSettled([...new Set([...urls, ...rest])].map((u) => cache.add(u)));
    } catch (e) { /* 오프라인 설치: 다음 방문 때 런타임 캐시로 채운다 */ }
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((n) => n !== CACHE_NAME && !n.startsWith(OCR_CACHE_PREFIX)).map((n) => caches.delete(n)))) // D37: 글자 인식 데이터 캐시는 버전이 바뀌어도 지우지 않는다(다시 받지 않게)
      .then(() => self.clients.claim())
  );
});

function isDataRequest(url) {
  return url.pathname.includes("/data/") && url.pathname.endsWith(".json");
}
// 주소가 바뀌어야만 내용이 바뀌는 파일: ?v=번호가 붙은 css/js, 글꼴, 아이콘.
function isImmutableAsset(url) {
  if (/^\/(fonts|icons)\//.test(url.pathname)) return true;
  return /^\/(css|js)\//.test(url.pathname) && url.searchParams.has("v"); // 버전 확인용 version.js?ts=… 는 ?v 가 없어 여기에 걸리지 않는다
}
function isNavigation(request, url) {
  return request.mode === "navigate" || url.pathname === "/" || url.pathname === "/index.html" || url.pathname === "/oauth";
}

function putCopy(request, res) {
  if (!res || !res.ok) return;
  const copy = res.clone();
  caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => {});
}

// 네트워크 우선: 실패하면 캐시. timeoutMs 가 있으면 그 시간 안에 응답이 없을 때 캐시를 먼저 내주고 네트워크 응답으로 캐시를 갱신한다.
function networkFirst(event, request, cacheKey, timeoutMs) {
  const net = fetch(request, { cache: "no-cache" }).then((res) => { putCopy(cacheKey || request, res); return res; });
  const fallback = () => caches.match(cacheKey || request).then((hit) => hit || net);
  if (!timeoutMs) return net.catch(fallback);
  const slow = new Promise((resolve) => setTimeout(() => resolve(null), timeoutMs));
  event.waitUntil(net.catch(() => {}));
  return Promise.race([net, slow]).then((res) => res || fallback()).catch(fallback);
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  // 같은 출처가 아니면(Firebase, 폰트 등) 서비스워커가 관여하지 않는다.
  if (url.origin !== self.location.origin) return;

  // 데이터 파일은 절대 캐시하지 않는다 — 항상 네트워크에서만 받는다.
  if (isDataRequest(url)) {
    event.respondWith(fetch(request));
    return;
  }

  // 업데이트 확인용 요청(?ts=…)은 항상 네트워크로 — 캐시에 쌓지도 않는다.
  if (url.searchParams.has("ts")) {
    event.respondWith(fetch(request));
    return;
  }

  // D37 글자 인식 파일(vendor/ocr/, 수 MB): 캐시 우선 — 처음 한 번만 받고 이후 네트워크를 쓰지 않는다(파일은 바뀌면 vendor/ocr/ 경로째로 새로 둔다).
  if (url.pathname.includes("/vendor/ocr/")) {
    event.respondWith(caches.open(OCR_CACHE).then((c) => c.match(request).then((hit) => hit || fetch(request).then((res) => { if (res && res.ok) c.put(request, res.clone()); return res; }))));
    return;
  }

  // 페이지 이동: 저장해 둔 index.html 을 바로 내주고 뒤에서 갱신한다(첫 방문·저장 없음이면 네트워크 우선, 느리면 3초 뒤 캐시).
  if (isNavigation(request, url)) {
    event.respondWith(caches.match("./index.html").then((hit) => {
      if (!hit) return networkFirst(event, request, "./index.html", NAV_TIMEOUT_MS);
      event.waitUntil(fetch(request, { cache: "no-cache" }).then((res) => putCopy("./index.html", res)).catch(() => {}));
      return hit;
    }));
    return;
  }

  // 주소가 곧 버전인 파일: 캐시 우선 — 있으면 네트워크를 쓰지 않는다.
  if (isImmutableAsset(url)) {
    event.respondWith(caches.match(request).then((hit) => hit || fetch(request).then((res) => { putCopy(request, res); return res; })));
    return;
  }

  // 그 밖: 네트워크 우선, 실패하면(오프라인) 캐시로 대체.
  event.respondWith(networkFirst(event, request, null, 0));
});
