import { PublicShell } from "@/src/components/info/PublicShell";
import Home from "@/src/modules/(main)/Home/Home";
import { createClient } from "../lib/supabase/server";

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <PublicShell>
      <div className="flex flex-1 flex-col justify-center py-8">
        <Home
          ctaLabel={user ? "Buka Aplikasi" : "Masuk ke Akun Toko"}
          ctaHref={user ? "/menu" : "/login"}
        />
      </div>
    </PublicShell>
  );
}
