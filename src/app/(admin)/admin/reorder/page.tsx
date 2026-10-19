import { Suspense } from "react";
import { ReorderSuggestionsModule } from "@/src/modules/reorder-suggestions/Component";

export default function ReorderSuggestionsPage() {
  return (
    <Suspense
      fallback={
        <div className="p-6 text-sm text-slate-400">
          Memuat saran belanja ulang…
        </div>
      }
    >
      <ReorderSuggestionsModule />
    </Suspense>
  );
}
