import { Suspense } from "react";
import { PosShiftsModule } from "@/src/modules/pos-shifts/Component";

export default function PosShiftsPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-slate-400">Memuat riwayat shift…</div>}>
      <PosShiftsModule />
    </Suspense>
  );
}
