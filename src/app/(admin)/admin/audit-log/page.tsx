import { Suspense } from "react";
import { AuditLogModule } from "@/src/modules/audit-log/Component";
import { SkeletonPage } from "@/src/components/ui/skeleton";

export default function AuditLogPage() {
  return (
    <Suspense
      fallback={<SkeletonPage />}
    >
      <AuditLogModule />
    </Suspense>
  );
}
