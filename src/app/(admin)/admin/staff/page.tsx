import { Suspense } from "react";
import { StaffModule } from "@/src/modules/staff/Component";
import { SkeletonPage } from "@/src/components/ui/skeleton";

export default function StaffPage() {
  return (
    <Suspense
      fallback={<SkeletonPage />}
    >
      <StaffModule />
    </Suspense>
  );
}
