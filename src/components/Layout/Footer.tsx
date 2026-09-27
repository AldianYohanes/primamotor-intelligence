import Image from "next/image";

export const Footer = () => {
  return (
    <div
      className="fixed inset-x-0 bottom-0 z-10 flex h-[7dvh] items-center border-t border-slate-700/25 bg-slate-900 px-3"
    >
      <div className="flex w-full items-center justify-between">
        <div className="flex max-w-[40%] flex-col gap-0">
          <span className="text-[10px] leading-none text-slate-300">
            Prima Motor Volvo
          </span>
          <span className="text-[8px] text-slate-300">
            Lantai 3A, Blok M Square, Jakarta Selatan
          </span>
        </div>

        <Image
          src="/logos/prima-motor.png"
          width={24}
          height={24}
          alt="Logo Prima Motor Volvo"
        />
      </div>
    </div>
  );
};
