import { Suspense } from "react";
import { StaffModule } from "@/src/modules/staff/Component";

export default function StaffPage() {
  return (
    <Suspense
      fallback={
        <div className="p-6 text-sm text-slate-400">Memuat halaman staf…</div>
      }
    >
      <StaffModule />
    </Suspense>
  );
}
