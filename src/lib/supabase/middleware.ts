import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import type { Database } from "./database.types";

/**
 * Called from root middleware.ts on every request. Refreshes the auth
 * token before it expires and keeps Server Components' cookies() in sync
 * with the browser — without this, sessions silently go stale mid-visit.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Required — do not remove. This triggers the token refresh; skipping
  // it means expired sessions won't be renewed until the next full reload.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Rute publik yang boleh diakses tanpa login. Sebelumnya hanya
  // `/login` dan `/auth` yang dikecualikan — akibatnya landing page ("/"),
  // halaman daftar ("/signup"), DAN endpoint API yang justru dipakai untuk
  // proses login/daftar itu sendiri ("/api/auth/*") ikut di-redirect paksa
  // ke /login sebelum sempat dijalankan. Form login yang fetch ke
  // /api/auth/login jadi gagal total untuk pengunjung yang belum punya sesi.
  const isPublicPath =
    request.nextUrl.pathname === "/" ||
    request.nextUrl.pathname.startsWith("/login") ||
    request.nextUrl.pathname.startsWith("/signup") ||
    request.nextUrl.pathname.startsWith("/auth") ||
    request.nextUrl.pathname.startsWith("/api/auth") ||
    request.nextUrl.pathname === "/manifest.json" ||
    request.nextUrl.pathname === "/sw.js";

  if (!user && !isPublicPath) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
