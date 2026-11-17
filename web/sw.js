// 서비스워커: 게임 파일을 폰에 저장해 두고 인터넷이 없어도 혼자 하기가 되게 한다.
// 파일을 바꿔서 배포할 때마다 CACHE_VERSION을 올린다 (그래야 폰이 새 파일을 받음).
const CACHE_VERSION = 'v2';
const CACHE = `sky-squad-${CACHE_VERSION}`;

const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/style.css',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './js/main.js',
  './js/config.js',
  './js/net/api.js',
  './js/net/lobby.js',
  './js/ui/screens.js',
  './js/ui/friends.js',
  './js/ui/install-guide.js',
  './js/game/rules.js',
  './js/game/engine.js',
  './js/game/input.js',
  './js/game/player.js',
  './js/game/bullets.js',
  './js/game/enemies.js',
  './js/game/boss.js',
  './js/game/powerups.js',
  './js/game/collision.js',
  './js/game/stage1.js',
  './js/game/render.js',
  './js/game/sound.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

// 예전 버전 저장분 정리
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('sky-squad-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// 같은 사이트 파일은 저장본 먼저, 없으면 인터넷에서. (?inv= 같은 주소 뒤 값은 무시)
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => {
      if (hit) return hit;
      return fetch(req).catch(() => (req.mode === 'navigate' ? caches.match('./index.html') : Response.error()));
    }),
  );
});
