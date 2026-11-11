"use client";

import { ToggleGroup, ToggleGroupItem } from "@/src/components/ui/toggle-group";
import { THEME_OPTIONS, useTheme } from "@/src/lib/ui/theme";
import { isThemeMode } from "@/src/lib/ui/theme-config";

/** Pilihan tema: Terang / Gelap / Ikut sistem. Disimpan per perangkat. */
export function ThemeSetting() {
  const [theme, setTheme] = useTheme();
  const current = THEME_OPTIONS.find((o) => o.value === theme);

  return (
    <div className="space-y-2">
      <ToggleGroup
        type="single"
        variant="outline"
        value={theme}
        onValueChange={(next) => {
          // Radix mengirim "" saat item aktif diklik lagi; abaikan supaya selalu ada pilihan.
          if (isThemeMode(next)) setTheme(next);
        }}
        aria-label="Tema tampilan"
        className="w-full"
      >
        {THEME_OPTIONS.map((opt) => (
          <ToggleGroupItem key={opt.value} value={opt.value} className="flex-1 text-xs">
            {opt.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <p className="text-[11px] text-slate-400">{current?.hint}. Berlaku di perangkat ini.</p>
    </div>
  );
}
