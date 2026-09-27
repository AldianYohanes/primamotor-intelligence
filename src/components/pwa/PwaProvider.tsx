"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { SerwistProvider } from "@serwist/turbopack/react";
import { InstallAppPrompt } from "./InstallAppPrompt";
import { UpdateAvailableToast } from "./UpdateAvailableToast";

/** Pindah halaman lewat router saat notifikasi diklik (lihat notificationclick di sw.ts). */
function ServiceWorkerNavigation() {
  const router = useRouter();
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === "NAVIGATE" && typeof event.data.url === "string") {
        router.push(event.data.url);
      }
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [router]);
  return null;
}

export function PwaProvider({ children }: { children: ReactNode }) {
  return (
    // reloadOnOnline dimatikan: default Serwist me-reload halaman begitu
    // online kembali, yang akan memutus unduhan model dan chat yang sedang
    // berjalan. Sinkron ulang saat online sudah ditangani ChatWindow.
    <SerwistProvider swUrl="/serwist/sw.js" reloadOnOnline={false}>
      {children}
      <ServiceWorkerNavigation />
      {/* Di bawah header/dock (kanan atas) supaya tidak menutupi navigasi. */}
      <div className="pointer-events-none fixed inset-x-0 top-16 z-50 flex flex-col items-center gap-2 px-3">
        <UpdateAvailableToast />
        <InstallAppPrompt />
      </div>
    </SerwistProvider>
  );
}
