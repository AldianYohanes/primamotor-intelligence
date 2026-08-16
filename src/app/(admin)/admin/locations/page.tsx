import { Suspense } from "react";
import { LocationsModule } from "@/src/modules/locations/Component";

export default function LocationsPage() {
  return (
    <Suspense
      fallback={
        <div className="p-6 text-sm text-slate-400">Memuat lokasi…</div>
      }
    >
      <LocationsModule />
    </Suspense>
  );
}
