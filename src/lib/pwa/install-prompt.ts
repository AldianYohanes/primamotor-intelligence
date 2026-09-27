"use client";

import { create } from "zustand";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

interface InstallState {
  /** Event install yang ditahan; null = belum ditawarkan browser / sudah dipakai. */
  deferred: BeforeInstallPromptEvent | null;
  installed: boolean;
  install: () => Promise<"accepted" | "dismissed" | "unavailable">;
}

/**
 * `beforeinstallprompt` hanya ditembakkan sekali per muat halaman, jadi
 * ditangkap di level modul (bukan di komponen) supaya banner install dan panel
 * Account sama-sama bisa memakainya.
 */
export const useInstallPrompt = create<InstallState>((set, get) => ({
  deferred: null,
  installed: false,
  install: async () => {
    const event = get().deferred;
    if (!event) return "unavailable";
    await event.prompt();
    const { outcome } = await event.userChoice;
    set({ deferred: null });
    return outcome;
  },
}));

export function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    useInstallPrompt.setState({ deferred: event as BeforeInstallPromptEvent });
  });
  window.addEventListener("appinstalled", () => {
    useInstallPrompt.setState({ deferred: null, installed: true });
  });
}
