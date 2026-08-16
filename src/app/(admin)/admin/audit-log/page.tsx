import { Suspense } from "react";
import { AuditLogModule } from "@/src/modules/audit-log/Component";

export default function AuditLogPage() {
  return (
    <Suspense
      fallback={
        <div className="p-6 text-sm text-slate-400">
          Memuat riwayat aksi agent…
        </div>
      }
    >
      <AuditLogModule />
    </Suspense>
  );
}
