"use client";

import clsx from "clsx";
import { MapPin, Package, Store, Warehouse } from "lucide-react";
import { formatDistance } from "@/src/lib/agents/location-choice";
import type { MutationChoice } from "@/src/lib/agents/orchestrator";

interface Props {
  choice: MutationChoice;
  busy: boolean;
  onSelect: (id: string) => void;
  onCancel: () => void;
}

export function MutationChoiceCard({ choice, busy, onSelect, onCancel }: Props) {
  const buttonClass = "btn rounded-full !px-3 !py-1.5 !text-xs";
  return (
    <div className="flex justify-start">
      <div className="card w-full max-w-[80%] space-y-2 p-3">
        <p className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
          {choice.kind === "product" ? <Package size={13} /> : <MapPin size={13} />}
          {choice.kind === "product" ? "Pilih barang yang dimaksud" : "Pilih lokasi transaksi"}
        </p>
        <div className="flex flex-wrap gap-2">
          {choice.kind === "product"
            ? choice.options.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  disabled={busy}
                  onClick={() => onSelect(option.id)}
                  className={clsx(buttonClass, "btn-secondary flex-col !items-start !gap-0 text-left")}
                >
                  <span className="font-medium">{option.name}</span>
                  <span className="text-[11px] opacity-70">{option.detail}</span>
                </button>
              ))
            : choice.options.map((option) => {
                const suggested = option.id === choice.suggestedLocationId;
                const Icon = option.type === "gudang" ? Warehouse : Store;
                return (
                  <button
                    key={option.id}
                    type="button"
                    disabled={busy}
                    onClick={() => onSelect(option.id)}
                    className={clsx(buttonClass, suggested ? "btn-primary" : "btn-secondary")}
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
            className={clsx(buttonClass, "text-slate-500 hover:text-slate-900")}
          >
            Batal
          </button>
        </div>
      </div>
    </div>
  );
}
