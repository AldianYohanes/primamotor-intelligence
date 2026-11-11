import { Suspense } from "react";
import { requirePage } from "@/src/lib/auth/staff-context";
import { can } from "@/src/lib/auth/rbac";
import { PosSalesModule } from "@/src/modules/pos-sales/Component";
import { SkeletonPage } from "@/src/components/ui/skeleton";

export default async function PosSalesPage() {
  // Beda dari page.tsx lain di admin (murni Suspense shell) — halaman ini
  // butuh role staf saat ini untuk menentukan apakah tombol "Batalkan Nota"
  // ditampilkan di dialog detail. Ini murni UX (tombol disembunyikan lebih awal
  // supaya staf non-admin tidak coba lalu kena 403); penegakan sesungguhnya
  // tetap di server (§12, POST .../void mengecek role ulang).
  const { staff } = await requirePage("portal.access");
  const canVoid = can(staff.role, "pos.manage");

  return (
    <Suspense
      fallback={<SkeletonPage />}
    >
      <PosSalesModule canVoid={canVoid} />
    </Suspense>
  );
}
