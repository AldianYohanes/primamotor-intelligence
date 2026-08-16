import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/src/lib/db/types";

/**
 * Client server (Server Component / Route Handler) dengan identitas staf yang
 * sedang login — RLS berlaku sesuai auth.uid() staf tersebut, BUKAN bypass.
 * Pakai ini untuk semua Route Handler admin yang mengandalkan RLS sebagai
 * lapisan otorisasi utama (lihat §8 dokumentasi backend).
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // set() dipanggil dari Server Component (bukan Route Handler/Action) — aman diabaikan
            // karena middleware yang akan me-refresh session di request berikutnya.
          }
        },
      },
    },
  );
}
