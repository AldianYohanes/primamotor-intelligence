import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PosSalesModule } from "@/src/modules/pos-sales/Component";

export default async function PosSalesPage() {
  // Beda dari page.tsx lain di admin (murni Suspense shell) — halaman ini
  // butuh role staf saat ini untuk menentukan apakah tombol "Batalkan Nota"
  // ditampilkan di dialog detail. Ini murni UX (tombol disembunyikan lebih awal
  // supaya staf non-admin tidak coba lalu kena 403); penegakan sesungguhnya
  // tetap di server (§12, POST .../void mengecek role ulang).
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: staffRow } = await supabase
    .from("staff")
    .select("role")
    .eq("auth_user_id", user.id)
    .single();

  const canVoid = staffRow?.role === "owner" || staffRow?.role === "admin";

  return (
    <Suspense fallback={<div className="p-6 text-sm text-slate-400">Memuat riwayat penjualan…</div>}>
      <PosSalesModule canVoid={canVoid} />
    </Suspense>
  );
}
