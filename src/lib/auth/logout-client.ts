"use client";

import { createClient } from "@/src/lib/supabase/client";
import { clearStockCache } from "@/src/lib/cache/indexeddb";

// Nama cache runtime di src/app/sw.ts yang berisi HTML/RSC ber-login.
const AUTHENTICATED_PAGE_CACHES = ["pages", "pages-rsc"];

/**
 * Keluar dan membersihkan semua jejak sesi di perangkat. Perangkat toko
 * sering dipakai bergantian, jadi cache stok (IndexedDB), halaman yang
 * disimpan service worker, dan unduhan model yang sedang berjalan ikut
 * dibersihkan supaya staf berikutnya tidak melihat data sesi sebelumnya.
 */
export async function logoutAndClear() {
  await clearStockCache().catch(() => {});
  if (typeof caches !== "undefined") {
    await Promise.all(AUTHENTICATED_PAGE_CACHES.map((name) => caches.delete(name))).catch(() => {});
  }
  await import("@/src/lib/agents/webllm-engine")
    .then((m) => m.cancelWebLLMEngineLoad())
    .catch(() => {});
  await createClient().auth.signOut();
  // Navigasi penuh (bukan router.push) supaya state client (store model,
  // engine WebLLM di memori, SWR cache) ikut dibuang.
  window.location.replace("/login");
}
