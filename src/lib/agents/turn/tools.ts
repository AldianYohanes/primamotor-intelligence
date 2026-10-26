import { searchCachedStock } from "@/src/lib/cache/indexeddb";
import type { TenantLocation } from "@/src/lib/agents/location-choice";
import { pickProduct, type ProductSearchResult } from "@/src/lib/agents/product-resolution";
import { MAX_TREND_MONTHS, parseSalesPeriod, stripSalesPeriod } from "@/src/lib/agents/sales-period";
import type { MutationTool } from "@/src/lib/agents/turn/types";

/**
 * Eksekusi tool memanggil Route Handler kita sendiri (bukan langsung Supabase dari
 * browser) — supaya validasi Zod + RLS + audit log server-side selalu jadi lapisan
 * terakhir, terlepas dari apa pun yang "diputuskan" model di browser.
 *
 * businessId dibutuhkan di sini (bukan cuma di route) supaya getStock bisa
 * fallback ke cache IndexedDB (`searchCachedStock`) saat offline — read-only,
 * jadi aman disajikan dari cache yang mungkin sedikit basi. updateStock/
 * transferStock SENGAJA TIDAK dapat fallback offline: HITL butuh verifikasi PIN
 * ke server (auth.signInWithPassword), yang secara mendasar tidak bisa dilakukan
 * offline tanpa menyimpan kredensial di client — itu downgrade keamanan yang
 * tidak sepadan dengan kenyamanan "bisa transaksi offline".
 */
export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  conversationId: string,
  businessId: string,
): Promise<unknown> {
  switch (name) {
    case "getStock": {
      try {
        const params = new URLSearchParams({
          query: String(args.query),
          limit: String(args.limit ?? 5),
        });
        const res = await fetch(`/api/agent/tools/get-stock?${params}`);
        if (!res.ok) {
          // Isi pesan error server ikut dicatat: ekspor /eval hanya menyimpan jejak alat,
          // dan tanpa ini penyebab fallback ke cache tidak bisa dilacak.
          const body = (await res.json().catch(() => null)) as { error?: unknown } | null;
          throw new Error(`HTTP ${res.status}${typeof body?.error === "string" ? `: ${body.error}` : ""}`);
        }
        return await res.json();
      } catch (err) {
        // Offline atau server tak terjangkau — fallback ke cache lokal (disinkron
        // terakhir kali online, lihat syncStockCache). Hasilnya ditandai supaya
        // Query Agent bisa memberi tahu staf datanya mungkin tidak paling baru.
        const fallbackReason = err instanceof Error ? err.message : String(err);
        const cached = await searchCachedStock(String(args.query), businessId);
        if (cached.length === 0) {
          return {
            results: [],
            source: "offline_cache",
            status: "no_cached_match",
            fallback_reason: fallbackReason,
            cache_note:
              "Server tidak bisa dihubungi (offline atau gangguan) dan part ini tidak ada di cache. Ini BUKAN berarti stok nol — sampaikan ke staf bahwa stok belum bisa dicek, coba lagi sebentar lagi.",
          };
        }
        const lastSyncedAt = cached.reduce(
          (oldest, c) => (c.last_synced_at < oldest ? c.last_synced_at : oldest),
          cached[0].last_synced_at,
        );
        return {
          last_synced_at: lastSyncedAt,
          results: cached.map((c) => ({
            product_id: c.product_id,
            name: c.product_name,
            stock_by_location: [
              {
                location_id: c.location_id,
                location_name: c.location_name,
                quantity: c.quantity,
                available_quantity: c.available_quantity,
              },
            ],
          })),
          source: "offline_cache",
          fallback_reason: fallbackReason,
          cache_note:
            "Server tidak bisa dihubungi, jadi data ini dari cache perangkat dan bisa saja tidak 100% terbaru — sampaikan ini ke staf.",
        };
      }
    }
    case "updateStock":
    case "transferStock": {
      if (!navigator.onLine) {
        return {
          error:
            "Sedang offline — perubahan stok butuh koneksi internet untuk verifikasi PIN dan mencatat transaksi dengan aman. Coba lagi setelah tersambung.",
        };
      }
      const endpoint =
        name === "updateStock"
          ? "/api/agent/tools/update-stock"
          : "/api/agent/tools/transfer-stock";
      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // Route mewajibkan business_id dan mencocokkannya dengan sesi staf (403 bila beda).
          body: JSON.stringify({ ...args, business_id: businessId, conversation_id: conversationId }),
        });
        return await res.json();
      } catch {
        return {
          error: "Gagal terhubung ke server. Coba lagi setelah koneksi stabil.",
        };
      }
    }
    case "getSalesTrend": {
      const params = new URLSearchParams({
        product_id: String(args.product_id),
        months: String(args.months ?? 6),
      });
      const res = await fetch(`/api/agent/tools/get-sales-trend?${params}`);
      return res.json();
    }
    default:
      return { error: `Tool tidak dikenal: ${name}` };
  }
}

export async function fetchTenantLocations(): Promise<TenantLocation[] | null> {
  try {
    const res = await fetch("/api/agent/tools/locations");
    if (!res.ok) return null;
    const body = (await res.json()) as { locations?: TenantLocation[] };
    return body.locations ?? null;
  } catch {
    return null;
  }
}

export function isMutationTool(name: string): name is MutationTool {
  return name === "updateStock" || name === "transferStock";
}

export async function searchProducts(query: string, conversationId: string, businessId: string) {
  const res = (await executeTool("getStock", { query, limit: 5 }, conversationId, businessId)) as {
    results?: ProductSearchResult[];
    source?: string;
  } | null;
  // getStock jatuh ke cache offline bila request ke server gagal; saat online
  // itu berarti server bermasalah, bukan barangnya tidak ada.
  return { results: res?.results ?? [], fromCache: res?.source === "offline_cache" };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * getSalesTrend satu langkah: model menulis nama barang, kode yang mencari
 * produknya (pola yang sama dengan alat transaksi). Run 30: model 3B tidak
 * merangkai getStock → getSalesTrend; multi melewatkan getSalesTrend, single
 * mengarang product_id ("wiper_bosch").
 */
export async function runSalesTrend(
  args: Record<string, unknown>,
  conversationId: string,
  businessId: string,
  userMessage = "",
  /** Periode yang disebut jelas di pesan staf menang atas angka tulisan model (profil model kecil). */
  messagePeriodWins = false,
): Promise<{ result: unknown; resolvedArgs?: Record<string, unknown> }> {
  const rawMonths = Number(args.months);
  const rawProduct = String(args.product ?? args.product_name ?? "");
  // Q-14: model menaruh "3 bln" di nama barang dan mengosongkan months. Bila months
  // tidak valid, dibaca dari nama barang lalu dari pesan staf; baru default 6.
  // H-02, H-27: "setahun" ditulis model months=1; dengan messagePeriodWins kata staf yang dipakai.
  const stated = messagePeriodWins ? parseSalesPeriod(userMessage)?.months : undefined;
  const months =
    stated ??
    (Number.isInteger(rawMonths) && rawMonths >= 1 && rawMonths <= MAX_TREND_MONTHS
      ? rawMonths
      : (parseSalesPeriod(rawProduct)?.months ?? parseSalesPeriod(userMessage)?.months ?? 6));
  const given = typeof args.product_id === "string" ? args.product_id : null;
  if (given && UUID_RE.test(given)) {
    return {
      result: await executeTool("getSalesTrend", { product_id: given, months }, conversationId, businessId),
      resolvedArgs: { product_id: given, months },
    };
  }
  // product_id karangan model ("mahle-filtro-oli") diperlakukan sebagai nama barang.
  const query = stripSalesPeriod(
    String(args.product ?? args.product_name ?? given ?? "")
      .replace(/[_-]+/g, " ")
      .trim(),
  );
  if (!query) return { result: { error: "Nama barang belum disebut. Tanyakan ke staf barang apa yang dimaksud." } };

  const search = await searchProducts(query, conversationId, businessId);
  if (search.fromCache) {
    return { result: { error: "Server tidak bisa dihubungi, tren penjualan belum bisa dicek. Sampaikan ke staf untuk coba lagi." } };
  }
  const pick = pickProduct(search.results);
  if (pick.status === "none") {
    return {
      result: { error: `Barang "${query}" tidak ditemukan di data toko. Minta staf menyebut nama lain atau nomor part.` },
    };
  }
  if (pick.status === "ambiguous") {
    return {
      result: {
        status: "product_ambiguous",
        candidates: pick.candidates.map((c) => c.name),
        note: "Ada beberapa barang yang mirip. Tanyakan ke staf barang mana yang dimaksud, jangan memilih sendiri.",
      },
    };
  }
  const productId = pick.product.product_id;
  return {
    result: await executeTool("getSalesTrend", { product_id: productId, months }, conversationId, businessId),
    resolvedArgs: { product_id: productId, months },
  };
}
