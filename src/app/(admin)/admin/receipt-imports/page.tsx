import { Suspense } from "react";
import { ReceiptImportsModule } from "@/src/modules/receipt-imports/Component";

export default function ReceiptImportsPage() {
  return (
    <Suspense
      fallback={
        <div className="p-6 text-sm text-slate-400">
          Memuat halaman review bon…
        </div>
      }
    >
      <ReceiptImportsModule />
    </Suspense>
  );
}
