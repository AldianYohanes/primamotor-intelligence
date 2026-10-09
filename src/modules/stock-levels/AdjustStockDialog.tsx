"use client";

import { useState } from "react";
import { AlertCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import { useAdjustStock } from "./hooks/use-adjust-stock";
import { formatDifference, validateAdjustment } from "./utils/utils";
import type { EditTarget } from "./data/coldef";

interface Props {
  target: EditTarget;
  onClose: () => void;
  onSaved: (message: string) => void | Promise<void>;
}

export function AdjustStockDialog({ target, onClose, onSaved }: Props) {
  const { product, cell } = target;
  const [quantity, setQuantity] = useState(String(cell.quantity));
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const { adjustStock, isAdjusting } = useAdjustStock();

  const validation = validateAdjustment({
    newQuantity: quantity,
    reservedQuantity: cell.reserved_quantity,
    reason,
  });
  const diff = validation.value != null ? validation.value - cell.quantity : null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    setServerError(null);
    if (!validation.ok || validation.value == null) return;
    try {
      await adjustStock({
        product_id: product.id,
        location_id: cell.location_id,
        counted_quantity: validation.value,
        notes: reason.trim(),
      });
      await onSaved(
        diff === 0
          ? `Stok ${product.name} di ${cell.name} sudah sesuai, tidak ada perubahan.`
          : `Stok ${product.name} di ${cell.name} diubah ke ${validation.value} (${formatDifference(diff ?? 0)}).`,
      );
    } catch (err) {
      setServerError(err instanceof Error ? err.message : "Gagal menyimpan perubahan stok");
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !isAdjusting) onClose(); }}>
      <DialogContent className="max-w-sm gap-4 p-5 sm:max-w-sm">
        <form onSubmit={handleSubmit} className="grid gap-4" noValidate>
          <DialogHeader>
            <DialogTitle className="text-base font-semibold text-slate-900">Ubah Stok</DialogTitle>
            <DialogDescription className="text-sm text-slate-600">
              {product.name} · {cell.name}
            </DialogDescription>
          </DialogHeader>

          <dl className="grid grid-cols-2 gap-3 rounded-lg bg-slate-50 p-3 text-sm">
            <div>
              <dt className="text-xs text-slate-500">Stok sistem</dt>
              <dd className="font-semibold tabular-nums text-slate-900">{cell.quantity} {product.unit}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Ditahan</dt>
              <dd className="font-semibold tabular-nums text-slate-900">{cell.reserved_quantity} {product.unit}</dd>
            </div>
          </dl>

          <div>
            <label htmlFor="new-qty" className="field-label">Jumlah baru</label>
            <input
              id="new-qty"
              type="number"
              inputMode="numeric"
              min={cell.reserved_quantity}
              step={1}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="field-input mt-1"
              autoFocus
            />
            {touched && validation.errors.quantity ? (
              <p className="mt-1 text-xs text-red-600">{validation.errors.quantity}</p>
            ) : (
              <p className="mt-1 text-xs text-slate-500">
                Minimal {cell.reserved_quantity}
                {diff != null && (
                  <>
                    {" · Selisih "}
                    <span
                      className={
                        diff > 0
                          ? "font-semibold text-emerald-600"
                          : diff < 0
                            ? "font-semibold text-red-600"
                            : "font-semibold text-slate-600"
                      }
                    >
                      {formatDifference(diff)}
                    </span>
                  </>
                )}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="reason" className="field-label">Alasan</label>
            <input
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Contoh: hasil hitung fisik"
              className="field-input mt-1"
            />
            {touched && validation.errors.reason && (
              <p className="mt-1 text-xs text-red-600">{validation.errors.reason}</p>
            )}
          </div>

          {serverError && (
            <div role="alert" className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              <AlertCircle size={15} className="mt-0.5 shrink-0" />
              <span>{serverError}</span>
            </div>
          )}

          <DialogFooter className="flex-row gap-2">
            <button type="button" onClick={onClose} disabled={isAdjusting} className="btn btn-secondary flex-1">
              Batal
            </button>
            <button type="submit" disabled={isAdjusting} className="btn btn-primary flex-1">
              {isAdjusting ? "Menyimpan…" : "Simpan"}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
