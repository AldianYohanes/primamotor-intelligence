export type ThemeMode = "light" | "dark" | "system";

export const THEME_STORAGE_KEY = "pm-theme";
export const DEFAULT_THEME: ThemeMode = "system";

export function isThemeMode(value: unknown): value is ThemeMode {
  return value === "light" || value === "dark" || value === "system";
}

/**
 * Dijalankan inline di <head> (lihat layout.tsx) sebelum halaman digambar, supaya
 * tidak ada kilatan tema salah. Juga memantau perubahan tema sistem selama
 * pilihannya "ikut sistem". Sengaja di file tanpa "use client" agar bisa
 * diimpor dari Server Component.
 */
export const themeBootScript = `(function(){var k="${THEME_STORAGE_KEY}",r=document.documentElement,m=matchMedia("(prefers-color-scheme: dark)");function a(){var t;try{t=localStorage.getItem(k)}catch(e){}var d=t==="dark"||(t!=="light"&&m.matches);r.classList.toggle("dark",d);r.style.colorScheme=d?"dark":"light"}a();m.addEventListener("change",a);window.addEventListener("pm-theme",a);window.addEventListener("storage",a)})()`;
