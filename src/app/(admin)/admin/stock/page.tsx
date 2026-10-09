import { Suspense } from "react";
import { StockLevelsModule } from "@/src/modules/stock-levels/Component";

export default function StockLevelsPage() {
  return (
    <Suspense
      fallback={
        <div className="p-6 text-sm text-slate-400">
          Memuat stok per lokasi…
        </div>
      }
    >
      <StockLevelsModule />
    </Suspense>
  );
}
