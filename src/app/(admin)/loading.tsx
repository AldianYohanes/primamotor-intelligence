import { SkeletonPage } from "@/src/components/ui/skeleton";

export default function AdminLoading() {
  return (
    <div className="min-h-dvh">
      <SkeletonPage label="Memuat Portal Admin" />
    </div>
  );
}
