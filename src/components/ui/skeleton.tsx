import { cn } from "@/src/lib/utils";

/**
 * Skeleton bersama: kotak abu berdenyut yang bentuknya meniru isi halaman.
 * Semua varian dibangun dari <Skeleton>; pasang sebagai fallback Suspense,
 * loading.tsx, atau pengganti teks "Memuat…". Animasi `animate-pulse` hanya
 * mengubah opacity (murah) dan mati otomatis bila pengguna memilih kurangi gerakan.
 */
export function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return <div aria-hidden className={cn("animate-pulse rounded-md bg-slate-200/80", className)} {...props} />;
}

/** Pembungkus a11y: pembaca layar mendengar "Memuat" sekali, bukan tiap kotak. */
function Region({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <div role="status" aria-busy="true" aria-label={label} className={className}>
      {children}
    </div>
  );
}

/** Judul halaman + subjudul (bentuk AppHeader / kepala modul). */
export function SkeletonHeading() {
  return (
    <div className="space-y-2">
      <Skeleton className="h-6 w-48" />
      <Skeleton className="h-3.5 w-72 max-w-full" />
    </div>
  );
}

/** Daftar baris sederhana (riwayat, notifikasi, saran). */
export function SkeletonList({ rows = 5, label = "Memuat daftar" }: { rows?: number; label?: string }) {
  return (
    <Region label={label} className="space-y-3">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-3.5 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
      ))}
    </Region>
  );
}

/** Tabel dalam kartu: baris kepala + beberapa baris isi. Tinggi baris ikut kerapatan. */
export function SkeletonTable({ rows = 6, cols = 5, label = "Memuat tabel" }: { rows?: number; cols?: number; label?: string }) {
  return (
    <Region label={label} className="card overflow-hidden">
      <div className="dt-head flex gap-4 border-b border-slate-200 bg-slate-50/80">
        {Array.from({ length: cols }, (_, c) => (
          <Skeleton key={c} className="h-3 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="dt-cell flex gap-4 border-b border-slate-100 last:border-0">
          {Array.from({ length: cols }, (_, c) => (
            <Skeleton key={c} className={cn("h-4 flex-1", c === 0 && "flex-[2]")} />
          ))}
        </div>
      ))}
    </Region>
  );
}

/** Deretan kartu angka (ringkasan dashboard). */
export function SkeletonCards({ count = 4, label = "Memuat ringkasan" }: { count?: number; label?: string }) {
  return (
    <Region label={label} className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="card space-y-3 p-4">
          <Skeleton className="h-3 w-1/2" />
          <Skeleton className="h-7 w-2/3" />
        </div>
      ))}
    </Region>
  );
}

/** Dashboard: kartu angka + grafik + tabel kecil. */
export function SkeletonDashboard({ label = "Memuat dashboard" }: { label?: string }) {
  return (
    <Region label={label} className="space-y-5">
      <SkeletonHeading />
      <SkeletonCards />
      <div className="card p-4">
        <Skeleton className="mb-4 h-4 w-40" />
        <Skeleton className="h-56 w-full" />
      </div>
      <SkeletonTable rows={4} cols={4} />
    </Region>
  );
}

/** Halaman modul admin: judul + kotak filter + tabel. Dipakai sebagai loading/fallback standar. */
export function SkeletonPage({ label = "Memuat halaman" }: { label?: string }) {
  return (
    <Region label={label} className="space-y-5 p-4 sm:p-6">
      <SkeletonHeading />
      <div className="flex gap-2">
        <Skeleton className="h-9 w-56 max-w-full" />
        <Skeleton className="h-9 w-28" />
      </div>
      <SkeletonTable />
    </Region>
  );
}

/** Percakapan chat: gelembung asisten (kiri) dan pengguna (kanan) bergantian. */
export function SkeletonChat({ label = "Memuat percakapan" }: { label?: string }) {
  const widths = ["w-3/5", "w-2/5", "w-1/2", "w-2/3"];
  return (
    <Region label={label} className="space-y-4">
      {widths.map((w, i) => (
        <div key={i} className={cn("flex", i % 2 === 1 && "justify-end")}>
          <Skeleton className={cn("h-12 max-w-[85%] rounded-2xl", w)} />
        </div>
      ))}
    </Region>
  );
}

/** Kasir: daftar produk (kiri) + keranjang (kanan). */
export function SkeletonPos({ label = "Memuat kasir" }: { label?: string }) {
  return (
    <Region label={label} className="grid grid-cols-1 gap-4 p-4 lg:grid-cols-[1fr_400px]">
      <div className="space-y-3">
        <Skeleton className="h-10 w-full" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {Array.from({ length: 9 }, (_, i) => (
            <div key={i} className="card space-y-2 p-3">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
              <Skeleton className="h-4 w-1/3" />
            </div>
          ))}
        </div>
      </div>
      <div className="card hidden space-y-3 p-4 lg:block">
        <Skeleton className="h-5 w-1/3" />
        <SkeletonList rows={3} />
        <Skeleton className="h-10 w-full" />
      </div>
    </Region>
  );
}
