/// <reference lib="esnext" />
/// <reference lib="webworker" />
import type { PrecacheEntry, RuntimeCaching, SerwistGlobalConfig } from "serwist";
import { CacheFirst, ExpirationPlugin, NetworkFirst, NetworkOnly, Serwist, StaleWhileRevalidate } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

/**
 * Sengaja tidak memakai `defaultCache` bawaan Serwist:
 * - defaultCache meng-cache /api/* (NetworkFirst). Data stok/transaksi harus
 *   selalu segar, dan cache offline stok sudah ditangani IndexedDB (Dexie).
 * - defaultCache meng-cache semua request lintas origin. Shard model WebLLM
 *   (beberapa GB dari huggingface.co) sudah disimpan web-llm sendiri di Cache
 *   Storage; kalau ikut di-cache service worker, ukurannya jadi dua kali lipat.
 * Request yang tidak cocok aturan mana pun (lintas origin, /api) tidak
 * disentuh service worker sama sekali.
 */
const sameOrigin = (url: URL) => url.origin === self.location.origin;

const runtimeCaching: RuntimeCaching[] =
  process.env.NODE_ENV !== "production"
    ? [{ matcher: ({ url }) => sameOrigin(url), handler: new NetworkOnly() }]
    : [
        {
          matcher: ({ url }) => sameOrigin(url) && url.pathname.startsWith("/_next/static/"),
          handler: new CacheFirst({
            cacheName: "next-static",
            plugins: [new ExpirationPlugin({ maxEntries: 256, maxAgeSeconds: 30 * 24 * 60 * 60 })],
          }),
        },
        {
          matcher: ({ url, request }) =>
            sameOrigin(url) && (request.destination === "image" || request.destination === "font"),
          handler: new StaleWhileRevalidate({
            cacheName: "static-media",
            plugins: [new ExpirationPlugin({ maxEntries: 64, maxAgeSeconds: 30 * 24 * 60 * 60 })],
          }),
        },
        {
          // Payload RSC untuk navigasi client-side.
          matcher: ({ url, request }) =>
            sameOrigin(url) && !url.pathname.startsWith("/api/") && request.headers.get("RSC") === "1",
          handler: new NetworkFirst({
            cacheName: "pages-rsc",
            networkTimeoutSeconds: 4,
            plugins: [new ExpirationPlugin({ maxEntries: 64, maxAgeSeconds: 24 * 60 * 60 })],
          }),
        },
        {
          // Halaman HTML: jaringan dulu (data selalu berubah), cache saat offline.
          matcher: ({ url, request }) =>
            sameOrigin(url) && !url.pathname.startsWith("/api/") && request.mode === "navigate",
          handler: new NetworkFirst({
            cacheName: "pages",
            networkTimeoutSeconds: 4,
            plugins: [new ExpirationPlugin({ maxEntries: 32, maxAgeSeconds: 7 * 24 * 60 * 60 })],
          }),
        },
      ];

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  // Versi baru menunggu sampai staf menekan "Muat ulang" di notifikasi update,
  // supaya tidak mengganti aset di tengah transaksi atau unduhan model.
  skipWaiting: false,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching,
  fallbacks: {
    entries: [
      {
        url: "/~offline",
        matcher: ({ request }) => request.destination === "document",
      },
    ],
  },
});

serwist.addEventListeners();

self.addEventListener("push", (event) => {
  if (!event.data) return;
  const payload = event.data.json();
  event.waitUntil(
    self.registration.showNotification(payload.title ?? "Prima Motor Volvo", {
      body: payload.body,
      icon: "/icons/icon-192.png",
      badge: "/icons/badge-96.png",
      data: { url: payload.url ?? "/chat" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url: string = event.notification.data?.url ?? "/chat";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      // Fokuskan tab yang sudah terbuka lalu minta app pindah halaman lewat
      // router client-side. client.navigate() me-reload dokumen, dan itu akan
      // membuang model AI yang sudah dimuat di memori.
      const existing = clients.find((c) => new URL(c.url).origin === self.location.origin);
      if (existing) {
        existing.postMessage({ type: "NAVIGATE", url });
        return existing.focus();
      }
      return self.clients.openWindow(url);
    }),
  );
});
