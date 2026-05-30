// ĐÃ LÊN V3 - Bản vá lỗi không bị sập nếu thiếu file ảnh
const CACHE_NAME = 'study-space-v11'; 

const urlsToCache = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './manifest.json'
  // Đã tạm ẩn các icon để tránh lỗi 404 làm sập hệ thống
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      // Cách tải an toàn: Tải từng file, lỗi file nào bỏ qua file đó
      return Promise.all(
        urlsToCache.map(url => {
          return cache.add(url).catch(err => console.log('Bỏ qua file không tồn tại:', url));
        })
      );
    })
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('Đã dọn dẹp rác cũ:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  event.respondWith(
    fetch(event.request)
      .then(response => {
        if (response && response.status === 200 && response.type === 'basic') {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseClone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
