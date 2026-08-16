import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/src/lib/db/types";

/**
 * Client browser (anon key). Tunduk penuh pada RLS — dipakai di client component
 * untuk baca data yang memang boleh diakses langsung sesuai kebijakan tenant staf
 * yang sedang login (mis. baca stok, riwayat percakapan miliknya).
 */
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
