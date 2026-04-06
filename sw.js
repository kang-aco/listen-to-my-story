const CACHE_NAME = 'listen-to-my-story-v2';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

// 설치: 핵심 파일 캐시
// skipWaiting() 제거 → 사용자가 새로고침 확인 전까지 대기
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

// 활성화: 이전 캐시 제거
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// 앱에서 SKIP_WAITING 메시지를 받으면 즉시 새 버전으로 전환
self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// 요청 처리: 캐시 우선, 없으면 네트워크
self.addEventListener('fetch', (e) => {
  // API 요청은 캐시하지 않음
  if (
    e.request.url.includes('generativelanguage.googleapis.com') ||
    e.request.url.includes('typecast.ai')
  ) {
    return;
  }
  e.respondWith(
    caches.match(e.request).then((cached) => cached || fetch(e.request))
  );
});
