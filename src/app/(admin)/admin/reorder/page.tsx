import { Suspense } from "react";
import { ReorderSuggestionsModule } from "@/src/modules/reorder-suggestions/Component";
import { SkeletonPage } from "@/src/components/ui/skeleton";

export default function ReorderSuggestionsPage() {
  return (
    <Suspense
      fallback={<SkeletonPage />}
    >
      <ReorderSuggestionsModule />
    </Suspense>
  );
}
