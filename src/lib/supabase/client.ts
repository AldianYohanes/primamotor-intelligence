import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./database.types";

/**
 * Client Component usage only (hooks, event handlers, 'use client' files).
 * Do NOT import this into Server Components or Route Handlers — use
 * lib/supabase/server.ts there instead, since cookie handling differs
 * between browser and server contexts.
 *
 * Safe to call multiple times per component tree — @supabase/ssr manages
 * the singleton internally.
 */
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
