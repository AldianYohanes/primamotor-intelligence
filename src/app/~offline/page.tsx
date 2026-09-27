import type { Metadata } from "next";
import { OfflineActions } from "./OfflineActions";

export const metadata: Metadata = {
  title: "Sedang offline — Prima Motor Volvo",
};

/**
 * Ditampilkan service worker saat halaman yang dibuka belum pernah tersimpan
 * dan tidak ada koneksi. Di-precache, jadi harus statis (tanpa data user).
 */
export default function OfflinePage() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-[#f7f8fa] p-6 text-center">
      <div className="card max-w-sm space-y-3 p-6">
        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-500">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M12 20h.01" />
            <path d="M8.5 16.429a5 5 0 0 1 7 0" />
            <path d="M5 12.859a10 10 0 0 1 5.17-2.69" />
            <path d="M19 12.859a10 10 0 0 0-2.007-1.523" />
            <path d="M2 8.82a15 15 0 0 1 4.177-2.643" />
            <path d="M22 8.82a15 15 0 0 0-11.288-3.764" />
            <path d="m2 2 20 20" />
          </svg>
        </div>
        <p className="text-sm font-semibold text-slate-900">Tidak ada koneksi internet</p>
        <p className="text-sm text-slate-600">
          Halaman ini belum tersimpan di perangkat. Chat asisten stok tetap bisa dibuka dan mencari
          stok dari data terakhir yang tersimpan.
        </p>
        <OfflineActions />
      </div>
    </main>
  );
}
