import { Suspense } from "react";
import { ReceiptImportsModule } from "@/src/modules/receipt-imports/Component";
import { SkeletonPage } from "@/src/components/ui/skeleton";

export default function ReceiptImportsPage() {
  return (
    <Suspense
      fallback={<SkeletonPage />}
    >
      <ReceiptImportsModule />
    </Suspense>
  );
}
