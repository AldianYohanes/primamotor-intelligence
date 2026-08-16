import { Suspense } from "react";
import { SuppliersModule } from "@/src/modules/suppliers/Component";

export default function SuppliersPage() {
  return (
    <Suspense
      fallback={
        <div className="p-6 text-sm text-slate-400">
          Memuat halaman supplier…
        </div>
      }
    >
      <SuppliersModule />
    </Suspense>
  );
}
