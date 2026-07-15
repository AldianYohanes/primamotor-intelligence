import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "./database.types";

/**
 * Server Component / Route Handler / Server Action usage only.
 * Must be called fresh inside each request scope (do NOT hoist into a
 * module-level singleton) because it reads cookies() per-request.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // setAll called from a Server Component — safe to ignore
            // because middleware.ts already refreshes the session on
            // every request. Only Route Handlers/Server Actions can
            // actually write cookies.
          }
        },
      },
    },
  );
}
