// Service worker lama (sebelum Serwist). Service worker aktif sekarang ada di
// /serwist/sw.js (sumber: src/app/sw.ts). File ini dibiarkan ada hanya untuk
// browser yang masih memegang registrasi lama: begitu versi ini terpasang, ia
// menghapus cache lamanya lalu melepas diri, dan halaman berikutnya
// mendaftarkan service worker Serwist.
self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .delete('prima-motor-v1')
      .then(() => self.registration.unregister())
      .catch(() => {})
  )
})
