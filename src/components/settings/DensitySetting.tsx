"use client";

import { ToggleGroup, ToggleGroupItem } from "@/src/components/ui/toggle-group";
import { DENSITY_OPTIONS, useDensity } from "@/src/lib/ui/density";
import { isDensity } from "@/src/lib/ui/density-config";

/** Pilihan kepadatan tampilan: Padat / Sedang / Lega. Disimpan per perangkat. */
export function DensitySetting() {
  const [density, setDensity] = useDensity();
  const current = DENSITY_OPTIONS.find((o) => o.value === density);

  return (
    <div className="space-y-2">
      <ToggleGroup
        type="single"
        variant="outline"
        value={density}
        onValueChange={(next) => {
          // Radix mengirim "" saat item aktif diklik lagi; abaikan supaya selalu ada pilihan.
          if (isDensity(next)) setDensity(next);
        }}
        aria-label="Kepadatan tampilan"
        className="w-full"
      >
        {DENSITY_OPTIONS.map((opt) => (
          <ToggleGroupItem key={opt.value} value={opt.value} className="flex-1 text-xs">
            {opt.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <p className="text-[11px] text-slate-400">
        {current?.hint}. Berlaku untuk tombol, kolom isian, tabel, dan jarak halaman di perangkat ini.
      </p>
    </div>
  );
}
