import { Suspense } from "react";
import { CarModelsModule } from "@/src/modules/car-models/Component";

export default function CarModelsPage() {
  return (
    <Suspense
      fallback={
        <div className="p-6 text-sm text-slate-400">
          Memuat referensi model mobil…
        </div>
      }
    >
      <CarModelsModule />
    </Suspense>
  );
}
