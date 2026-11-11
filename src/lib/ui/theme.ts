"use client";

import { useCallback, useSyncExternalStore } from "react";
import { DEFAULT_THEME, THEME_STORAGE_KEY, isThemeMode, type ThemeMode } from "./theme-config";

export const THEME_OPTIONS: { value: ThemeMode; label: string; hint: string }[] = [
  { value: "light", label: "Terang", hint: "Selalu terang" },
  { value: "dark", label: "Gelap", hint: "Selalu gelap" },
  { value: "system", label: "Ikut sistem", hint: "Mengikuti pengaturan perangkat (bawaan)" },
];

function read(): ThemeMode {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return isThemeMode(stored) ? stored : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

function subscribe(cb: () => void) {
  window.addEventListener("pm-theme", cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener("pm-theme", cb);
    window.removeEventListener("storage", cb);
  };
}

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, read, () => DEFAULT_THEME);
  const setTheme = useCallback((next: ThemeMode) => {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Penyimpanan diblokir: tetap terapkan untuk sesi ini lewat event di bawah.
    }
    // Skrip di <head> yang menerapkan kelas "dark" dan mendengar event ini.
    window.dispatchEvent(new Event("pm-theme"));
  }, []);
  return [theme, setTheme] as const;
}
