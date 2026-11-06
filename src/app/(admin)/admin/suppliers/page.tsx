import { Suspense } from "react";
import { SuppliersModule } from "@/src/modules/suppliers/Component";
import { SkeletonPage } from "@/src/components/ui/skeleton";

export default function SuppliersPage() {
  return (
    <Suspense
      fallback={<SkeletonPage />}
    >
      <SuppliersModule />
    </Suspense>
  );
}
