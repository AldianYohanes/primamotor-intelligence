import { AlertTriangle, RotateCcw } from "lucide-react";

/** Pembatas di chat saat pertanyaan staf tidak sempat dijawab (halaman dimuat ulang, internet atau GPU putus). */
export function InterruptedDivider({
  reason,
  onRetry,
  disabled,
}: {
  reason: string;
  onRetry: () => void;
  disabled?: boolean;
}) {
  return (
    <div role="status" className="my-2 flex items-center gap-3 text-xs text-amber-800">
      <span className="h-px flex-1 bg-amber-200" />
      <div className="flex max-w-xs flex-col items-center gap-1.5 text-center">
        <span className="flex items-center gap-1.5 font-medium">
          <AlertTriangle size={13} className="shrink-0" />
          Jawaban terputus
        </span>
        <span className="text-amber-700">{reason} Pertanyaan di atas belum terjawab.</span>
        <button
          type="button"
          onClick={onRetry}
          disabled={disabled}
          className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-white px-2.5 py-1 font-medium text-amber-800 hover:bg-amber-50 disabled:opacity-50"
        >
          <RotateCcw size={12} />
          Kirim ulang pertanyaan
        </button>
      </div>
      <span className="h-px flex-1 bg-amber-200" />
    </div>
  );
}
