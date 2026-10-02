export type Density = "compact" | "medium" | "spacious";

export const DENSITY_STORAGE_KEY = "pm-density";
export const DEFAULT_DENSITY: Density = "medium";

export function isDensity(value: unknown): value is Density {
  return value === "compact" || value === "medium" || value === "spacious";
}

/**
 * Dijalankan inline di <head> (lihat layout.tsx) sebelum React hidrasi supaya
 * halaman tidak berkedip dari "sedang" ke pilihan pengguna. Sengaja di file
 * tanpa "use client" supaya bisa diimpor dari Server Component.
 */
export const densityBootScript = `try{var d=localStorage.getItem("${DENSITY_STORAGE_KEY}");if(d==="compact"||d==="spacious")document.documentElement.dataset.density=d}catch(e){}`;
