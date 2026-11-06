import { Suspense } from "react";
import { ReportsModule } from "@/src/modules/reports/Component";
import { SkeletonPage } from "@/src/components/ui/skeleton";

export default function ReportsPage() {
  return (
    <Suspense
      fallback={<SkeletonPage />}
    >
      <ReportsModule />
    </Suspense>
  );
}
