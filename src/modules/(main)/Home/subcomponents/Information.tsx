import { ChevronRight } from "lucide-react";
import Link from "next/link";

interface Props {
  /** Teks tombol CTA utama. */
  ctaLabel?: string;
  /** Tujuan tombol CTA utama. */
  ctaHref?: string;
}

export const Information = ({
  ctaLabel = "Pelajari Lebih Lanjut",
  ctaHref = "/login",
}: Props) => {
  return (
    <div className="mt-[5vh] flex flex-col items-center justify-center gap-2">
      <h1 className="text-4xl font-bold leading-none text-slate-900">
        Prima Motor Volvo
      </h1>
      <h6 className="max-w-[80%] text-sm font-medium text-slate-600">
        Sistem Manajemen Suku Cadang Otomotif Berbasis WebLLM
      </h6>

      <Link href={ctaHref} className="no-underline">
        <span className="mt-2 inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-xs font-medium text-white">
          {ctaLabel}
          <span className="flex h-4 w-4 items-center justify-center rounded-full bg-white">
            <ChevronRight size={12} color="black" />
          </span>
        </span>
      </Link>
    </div>
  );
};
