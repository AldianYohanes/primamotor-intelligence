import { Skeleton, SkeletonList } from "@/src/components/ui/skeleton";

/** Menu, Akun, Pengaturan, Notifikasi: satu kolom sempit berisi judul dan daftar kartu. */
export default function AppLoading() {
  return (
    <div className="flex min-h-dvh justify-center px-4 py-10">
      <div className="w-full max-w-md space-y-5">
        <Skeleton className="h-7 w-40" />
        <div className="card p-4">
          <SkeletonList rows={4} label="Memuat halaman" />
        </div>
      </div>
    </div>
  );
}
