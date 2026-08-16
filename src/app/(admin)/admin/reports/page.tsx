import { Suspense } from "react";
import { ReportsModule } from "@/src/modules/reports/Component";

export default function ReportsPage() {
  return (
    <Suspense
      fallback={
        <div className="p-6 text-sm text-slate-400">
          Memuat halaman laporan…
        </div>
      }
    >
      <ReportsModule />
    </Suspense>
  );
}
