import { Suspense } from "react";
import { CustomersModule } from "@/src/modules/customers/Component";
import { SkeletonPage } from "@/src/components/ui/skeleton";

export default function PosCustomersPage() {
  return (
    <Suspense fallback={<SkeletonPage />}>
      <CustomersModule />
    </Suspense>
  );
}
