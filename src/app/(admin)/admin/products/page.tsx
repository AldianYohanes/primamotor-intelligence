import { Suspense } from "react";
import { ProductsModule } from "@/src/modules/products/Component";
import { SkeletonPage } from "@/src/components/ui/skeleton";

export default function ProductsPage() {
  return (
    <Suspense
      fallback={<SkeletonPage />}
    >
      <ProductsModule />
    </Suspense>
  );
}
