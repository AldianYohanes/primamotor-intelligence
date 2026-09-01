import { Suspense } from "react";
import { CustomersModule } from "@/src/modules/customers/Component";

export default function PosCustomersPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-slate-400">Memuat pelanggan…</div>}>
      <CustomersModule />
    </Suspense>
  );
}
