import Link from "next/link";
import { Footer } from "@/src/components/Layout";
import Home from "@/src/modules/(main)/Home/Home";
import { createClient } from "../lib/supabase/server";

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="flex min-h-dvh flex-col gap-0 pb-[10dvh]">
      <div className="flex items-center justify-between px-4 py-3">
        <span className="text-sm font-bold text-slate-900">
          Prima Motor Volvo
        </span>
        <div className="flex items-center gap-2">
          {user ? (
            <Link href="/menu" className="no-underline">
              <span className="rounded-full bg-slate-900 px-3 py-1.5 text-xs font-medium text-white">
                Buka Aplikasi
              </span>
            </Link>
          ) : (
            <>
              <Link href="/login" className="no-underline">
                <span className="rounded-full px-3 py-1.5 text-xs font-medium text-slate-700">
                  Masuk
                </span>
              </Link>
              <Link href="/signup" className="no-underline">
                <span className="rounded-full bg-slate-900 px-3 py-1.5 text-xs font-medium text-white">
                  Daftar
                </span>
              </Link>
            </>
          )}
        </div>
      </div>

      <Home
        ctaLabel={user ? "Buka Aplikasi" : "Masuk ke Akun Toko"}
        ctaHref={user ? "/menu" : "/login"}
      />

      <Footer />
    </div>
  );
}
