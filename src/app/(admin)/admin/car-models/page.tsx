import { Suspense } from "react";
import { CarModelsModule } from "@/src/modules/car-models/Component";
import { SkeletonPage } from "@/src/components/ui/skeleton";

export default function CarModelsPage() {
  return (
    <Suspense
      fallback={<SkeletonPage />}
    >
      <CarModelsModule />
    </Suspense>
  );
}
