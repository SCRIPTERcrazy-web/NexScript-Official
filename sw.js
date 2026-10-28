const CACHE_NAME = 'nexscript-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/favicon.ico',
  '/favicon-32x32.png',
  '/favicon-48x48.png',
  '/apple-touch-icon.png',
  '/android-chrome-192x192.png',
  '/android-chrome-512x512.png'
];

// 1. Install: Simpan file utama ke cache
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
  self.skipWaiting();
});

// 2. Activate: Hapus cache lama kalau ada update
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) return caches.delete(key);
        })
      );
    })
  );
});

// 3. Fetch: Ambil dari cache dulu, kalau nggak ada baru ambil dari internet
self.addEventListener('fetch', (e) => {
  // Jangan cache request API (biar data script selalu update)
  if (e.request.url.includes('/api/')) return;

  e.respondWith(
    caches.match(e.request).then((cached) => {
      return cached || fetch(e.request).catch(() => {
        // Kalau offline dan nggak ada di cache, tampilin halaman utama
        if (e.request.mode === 'navigate') return caches.match('/index.html');
      });
    })
  );
});
