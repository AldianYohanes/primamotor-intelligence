"use client";

import {
  MODEL_TIERS,
  OTHER_MODEL_OPTIONS,
  isF32Model,
  tierModelId,
  tierOfModel,
} from "@/src/lib/agents/model-options";
import { Select } from "@/src/components/ui/select";

/**
 * Pilihan model untuk staf: tiga tingkat (Saga, Ballad, Tanka) dan sisanya di "Lainnya".
 * Varian f16/f32 tidak ditampilkan; tingkat yang dipilih mengikuti varian yang sedang dipakai.
 */
export function ModelPicker({
  id,
  modelId,
  disabled,
  title,
  className,
  onChange,
}: {
  id: string;
  modelId: string;
  disabled?: boolean;
  title?: string;
  className?: string;
  onChange: (modelId: string) => void;
}) {
  const current = tierOfModel(modelId);
  // f32 dipertahankan bila perangkat sudah memakainya (GPU menolak f16).
  const f32 = isF32Model(modelId);
  return (
    <Select
      id={id}
      value={current ? current.id : modelId}
      disabled={disabled}
      title={title}
      className={className}
      onValueChange={(value) => {
        const tier = MODEL_TIERS.find((t) => t.id === value);
        onChange(tier ? tierModelId(tier, f32) : value);
      }}
    >
      {MODEL_TIERS.map((t) => (
        <option key={t.id} value={t.id}>
          {t.name} · {t.note}
        </option>
      ))}
      <optgroup label="Lainnya">
        {OTHER_MODEL_OPTIONS.map((m) => (
          <option key={m.id} value={m.id}>
            {m.label}
          </option>
        ))}
      </optgroup>
    </Select>
  );
}
