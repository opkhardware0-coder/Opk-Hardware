const CACHE_NAME = 'opk-pos-shell-v3';
const APP_SHELL = [
  '/login.html',
  '/dashboard.html',
  '/settings.html',
  '/pos.html',
  '/products.html',
  '/inventory.html',
  '/sales.html',
  '/reports.html',
  '/assets/css/main.css',
  '/assets/js/pwa.js',
  '/assets/js/settings.js',
  '/assets/js/login.js',
  '/assets/js/dashboard.js',
  '/assets/js/modules.js',
  '/assets/js/shell.js',
  '/assets/js/auth.js',
  '/assets/js/ui.js',
  '/assets/js/supabase.js',
  '/assets/js/stub.js',
  '/assets/images/opk-logo.png',
  '/assets/images/opk-hardware-banner.png',
  '/assets/images/opk-icon-192.png',
  '/assets/images/opk-icon-512.png',
  '/manifest.webmanifest'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) => Promise.all(
      names.filter((name) => name.startsWith('opk-pos-shell-') && name !== CACHE_NAME)
        .map((name) => caches.delete(name))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.endsWith('/assets/js/env.js') || url.pathname.includes('/auth/v1/') || url.pathname.includes('/rest/v1/')) return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request);
      const update = fetch(request).then(async (response) => {
        if (response.ok) await cache.put(request, response.clone());
        return response;
      });
      if (cached) {
        event.waitUntil(update.catch(() => {}));
        return cached;
      }
      try {
        return await update;
      } catch {
        const pathname = url.pathname === '/' ? '/index.html' : `${url.pathname.replace(/\/$/, '')}.html`;
        return (await cache.match(pathname)) || (await cache.match('/login.html')) || Response.error();
      }
    })());
    return;
  }

  if (url.pathname.startsWith('/assets/')) {
    event.respondWith((async () => {
      const cached = await caches.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok) {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(request, response.clone());
      }
      return response;
    })());
  }
});
