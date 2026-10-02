"use client";

import { useCallback, useSyncExternalStore } from "react";
import { DEFAULT_DENSITY, DENSITY_STORAGE_KEY, isDensity, type Density } from "./density-config";

export const DENSITY_OPTIONS: { value: Density; label: string; hint: string }[] = [
  { value: "compact", label: "Padat", hint: "Lebih banyak data per layar" },
  { value: "medium", label: "Sedang", hint: "Seimbang (bawaan)" },
  { value: "spacious", label: "Lega", hint: "Jarak besar, mudah disentuh" },
];

const listeners = new Set<() => void>();

function read(): Density {
  try {
    const stored = localStorage.getItem(DENSITY_STORAGE_KEY);
    return isDensity(stored) ? stored : DEFAULT_DENSITY;
  } catch {
    return DEFAULT_DENSITY;
  }
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}

export function useDensity() {
  const density = useSyncExternalStore(subscribe, read, () => DEFAULT_DENSITY);
  const setDensity = useCallback((next: Density) => {
    try {
      localStorage.setItem(DENSITY_STORAGE_KEY, next);
    } catch {
      // Penyimpanan diblokir: tetap terapkan untuk sesi ini.
    }
    document.documentElement.dataset.density = next;
    listeners.forEach((cb) => cb());
  }, []);
  return [density, setDensity] as const;
}
