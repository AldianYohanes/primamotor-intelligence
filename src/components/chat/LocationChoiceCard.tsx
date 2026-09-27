"use client";

import clsx from "clsx";
import { MapPin, Store, Warehouse } from "lucide-react";
import { formatDistance, type LocationChoice } from "@/src/lib/agents/location-choice";

interface Props {
  choice: LocationChoice;
  busy: boolean;
  onSelect: (locationId: string) => void;
  onCancel: () => void;
}

export function LocationChoiceCard({ choice, busy, onSelect, onCancel }: Props) {
  return (
    <div className="flex justify-start">
      <div className="card w-full max-w-[80%] space-y-2 p-3">
        <p className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
          <MapPin size={13} />
          Pilih lokasi transaksi
        </p>
        <div className="flex flex-wrap gap-2">
          {choice.options.map((option) => {
            const suggested = option.id === choice.suggestedLocationId;
            const Icon = option.type === "gudang" ? Warehouse : Store;
            return (
              <button
                key={option.id}
                type="button"
                disabled={busy}
                onClick={() => onSelect(option.id)}
                className={clsx("btn rounded-full !px-3 !py-1.5 !text-xs", suggested ? "btn-primary" : "btn-secondary")}
              >
                <Icon size={13} />
                {option.name}
                {suggested && choice.suggestionReason === "nearest" && choice.distanceMeters !== null && (
                  <span className="opacity-80">· terdekat {formatDistance(choice.distanceMeters)}</span>
                )}
              </button>
            );
          })}
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="btn rounded-full !px-3 !py-1.5 !text-xs text-slate-500 hover:text-slate-900"
          >
            Batal
          </button>
        </div>
      </div>
    </div>
  );
}
