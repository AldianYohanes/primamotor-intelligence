import { Suspense } from "react";
import { PosShiftsModule } from "@/src/modules/pos-shifts/Component";
import { SkeletonPage } from "@/src/components/ui/skeleton";

export default function PosShiftsPage() {
  return (
    <Suspense fallback={<SkeletonPage />}>
      <PosShiftsModule />
    </Suspense>
  );
}
