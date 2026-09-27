import { AppModules } from "@/src/modules/AppModules";
import { lighten } from "@/src/utils/colorUtils";
import { getRandomInt } from "@/src/utils/mathUtils";
import Link from "next/link";

export const Navigation = () => {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
      {AppModules.map((mod) => {
        const Icon = mod.Icon;
        const card = (
          <div
            className={`relative overflow-hidden rounded-lg border border-slate-200 bg-white p-4 shadow-sm ${
              mod.href ? "cursor-pointer" : "cursor-default"
            }`}
          >
            <div
              className="pointer-events-none absolute h-[250px] w-[350px] rounded-full opacity-10"
              style={{
                top: `${getRandomInt(0, 100)}%`,
                left: `${getRandomInt(0, 100)}%`,
                background: mod.accentColor,
              }}
            />
            <div
              className="pointer-events-none absolute h-[250px] w-[350px] rounded-full opacity-20"
              style={{
                bottom: `${getRandomInt(0, 100)}%`,
                right: `${getRandomInt(0, 100)}%`,
                background: mod.accentColor && lighten(mod.accentColor, 50),
              }}
            />
            <div className="relative z-10 flex flex-nowrap items-center gap-3 text-left">
              <Icon color={mod.iconColor} size={20} />
              <div className="flex flex-col gap-0">
                <span className="text-sm font-bold text-slate-900">
                  {mod.label}
                </span>
                <span className="text-xs font-light text-slate-600">
                  {mod.description}
                </span>
              </div>
            </div>
          </div>
        );

        // PENTING: Home/Navigation adalah Server Component. Jangan pakai
        // pola yang melempar referensi fungsi (mis. sebuah komponen) sebagai
        // PROP lewat batas server→client — bisa gagal di-serialize React.
        // Membungkus sebagai children (seperti di bawah) aman karena
        // children punya jalur serialisasi RSC sendiri.
        if (!mod.href) return <div key={mod.key}>{card}</div>;
        return (
          <Link key={mod.key} href={mod.href} className="no-underline text-inherit">
            {card}
          </Link>
        );
      })}
    </div>
  );
};
