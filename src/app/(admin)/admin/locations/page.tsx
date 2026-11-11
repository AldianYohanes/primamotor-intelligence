import { Suspense } from "react";
import { LocationsModule } from "@/src/modules/locations/Component";
import { SkeletonPage } from "@/src/components/ui/skeleton";

export default function LocationsPage() {
  return (
    <Suspense
      fallback={<SkeletonPage />}
    >
      <LocationsModule />
    </Suspense>
  );
}
