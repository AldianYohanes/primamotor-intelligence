import { Suspense } from "react";
import { StockOpnameModule } from "@/src/modules/stock-opname/Component";
import { SkeletonPage } from "@/src/components/ui/skeleton";

export default function StockOpnamePage() {
  return (
    <Suspense
      fallback={<SkeletonPage />}
    >
      <StockOpnameModule />
    </Suspense>
  );
}
