import { Cog } from "lucide-react";
import clsx from "clsx";

/** Dua roda gigi yang saling berputar; berhenti saat `paused`. */
export function GearAnimation({ paused = false, size = 56 }: { paused?: boolean; size?: number }) {
  const small = Math.round(size * 0.55);
  return (
    <div className="relative" style={{ width: size + small * 0.6, height: size }} aria-hidden>
      <span
        className={clsx("absolute left-0 top-0 text-brand-600 animate-gear", paused && "animate-gear-paused")}
      >
        <Cog size={size} strokeWidth={1.6} />
      </span>
      <span
        className={clsx(
          "absolute right-0 bottom-0 text-slate-400 animate-gear-reverse",
          paused && "animate-gear-paused",
        )}
      >
        <Cog size={small} strokeWidth={1.8} />
      </span>
    </div>
  );
}
