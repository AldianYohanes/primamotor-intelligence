import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Auth guard + role gating untuk /chat dan /admin.
 *
 * Optimisasi: role & business_id dibaca dari custom JWT claim (app_metadata) lewat
 * Supabase Auth Hook "Custom Access Token" (lihat README bagian Auth Hook Setup),
 * BUKAN query tabel `staff` di setiap request — supaya middleware tidak menambah
 * round-trip database di setiap navigasi.
 */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isProtected =
    pathname.startsWith("/chat") || pathname.startsWith("/admin");

  if (isProtected && !user) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // if (pathname.startsWith('/admin') && user) {
  //   // app_metadata.role diisi Auth Hook saat token diterbitkan/direfresh — lihat README.
  //   const role = (user.app_metadata as { role?: string } | undefined)?.role
  //   if (role !== 'admin' && role !== 'owner') {
  //     return NextResponse.redirect(new URL('/chat', request.url))
  //   }
  // }

  // Staf yang sudah login tidak perlu melihat halaman login/signup lagi
  if (
    (pathname.startsWith("/login") || pathname.startsWith("/signup")) &&
    user
  ) {
    return NextResponse.redirect(new URL("/chat", request.url));
  }

  return response;
}

export const config = {
  matcher: ["/chat/:path*", "/admin/:path*", "/login/:path*", "/signup/:path*"],
};
