import { Suspense } from "react";
import { StockLevelsModule } from "@/src/modules/stock-levels/Component";
import { SkeletonPage } from "@/src/components/ui/skeleton";

export default function StockLevelsPage() {
  return (
    <Suspense
      fallback={<SkeletonPage />}
    >
      <StockLevelsModule />
    </Suspense>
  );
}
