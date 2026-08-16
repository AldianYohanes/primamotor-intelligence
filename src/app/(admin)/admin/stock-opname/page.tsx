import { Suspense } from "react";
import { StockOpnameModule } from "@/src/modules/stock-opname/Component";

export default function StockOpnamePage() {
  return (
    <Suspense
      fallback={
        <div className="p-6 text-sm text-slate-400">
          Memuat halaman stock opname…
        </div>
      }
    >
      <StockOpnameModule />
    </Suspense>
  );
}
