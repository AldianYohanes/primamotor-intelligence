"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import { BellRing, Smartphone } from "lucide-react";
import { enablePushNotifications, getPushSupportStatus } from "@/src/lib/notifications/subscribe-client";
import { isStandalone, useInstallPrompt } from "@/src/lib/pwa/install-prompt";
import { useModelStore } from "@/src/lib/stores/model-store";
import { formatBytes } from "@/src/lib/agents/model-progress";
import { ModelPicker } from "@/src/components/model/ModelPicker";

function DeviceRow({ title, detail, action }: { title: string; detail: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-xs font-medium text-slate-800">{title}</p>
        <p className="text-xs text-slate-500">{detail}</p>
      </div>
      {action}
    </div>
  );
}

const smallBtn = "btn btn-secondary shrink-0 !px-2.5 !py-1 !text-xs";

/** Notifikasi, pasang aplikasi, dan model AI di perangkat ini. Dipakai di halaman Pengaturan. */
export function DeviceSettings() {
  // Panel baru di-mount saat dibuka, jadi aman membaca API browser di initializer.
  const [push, setPush] = useState(() => getPushSupportStatus());
  const [pushBusy, setPushBusy] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);
  const [standalone] = useState(() => isStandalone());
  const deferred = useInstallPrompt((s) => s.deferred);
  const install = useInstallPrompt((s) => s.install);

  const modelStatus = useModelStore((s) => s.status);
  const modelId = useModelStore((s) => s.modelId);
  const cachedBytes = useModelStore((s) => s.cachedBytes);
  const totalBytes = useModelStore((s) => s.totalBytes);
  const refreshInfo = useModelStore((s) => s.refreshInfo);
  const removeFromDevice = useModelStore((s) => s.removeFromDevice);
  const setModelId = useModelStore((s) => s.setModelId);
  const [removing, setRemoving] = useState(false);
  const [switchingModel, setSwitchingModel] = useState(false);

  useEffect(() => {
    refreshInfo().catch(() => {});
  }, [refreshInfo]);

  async function enablePush() {
    setPushBusy(true);
    setPushError(null);
    const result = await enablePushNotifications();
    setPushBusy(false);
    if (!result.ok) setPushError(result.reason);
    setPush(getPushSupportStatus());
  }

  const pushDetail =
    push === "granted" || push === "subscribed"
      ? "Aktif: kabar stok menipis & saran restock"
      : push === "denied"
        ? "Diblokir. Izinkan lewat pengaturan situs di browser."
        : push === "unsupported"
          ? "Tidak didukung browser/perangkat ini"
          : "Belum aktif";

  const modelBusy = modelStatus === "loading";
  const modelDetail =
    modelStatus === "ready"
      ? `Siap dipakai${cachedBytes ? ` · ${formatBytes(cachedBytes)} tersimpan` : ""}`
      : modelBusy
        ? "Sedang diunduh / dimuat"
        : cachedBytes > 0
          ? `${formatBytes(cachedBytes)}${totalBytes ? ` dari ${formatBytes(totalBytes)}` : ""} tersimpan`
          : "Belum diunduh";

  return (
    <>
      <DeviceRow
        title="Notifikasi"
        detail={pushError ?? pushDetail}
        action={
          push === "default" ? (
            <button onClick={enablePush} disabled={pushBusy} className={smallBtn}>
              <BellRing size={12} />
              {pushBusy ? "…" : "Aktifkan"}
            </button>
          ) : undefined
        }
      />
      <DeviceRow
        title="Aplikasi"
        detail={
          standalone
            ? "Sudah terpasang di perangkat ini"
            : deferred
              ? "Bisa dipasang ke layar utama"
              : "Pasang lewat menu browser → Tambahkan ke layar utama"
        }
        action={
          !standalone && deferred ? (
            <button onClick={() => install()} className={smallBtn}>
              <Smartphone size={12} />
              Pasang
            </button>
          ) : undefined
        }
      />
      <DeviceRow
        title="Model asisten AI"
        detail={modelDetail}
        action={
          !modelBusy && cachedBytes > 0 ? (
            <button
              onClick={async () => {
                if (!window.confirm("Hapus model AI dari perangkat ini? Asisten perlu diunduh ulang sebelum dipakai lagi.")) return;
                setRemoving(true);
                await removeFromDevice().catch(() => {});
                setRemoving(false);
              }}
              disabled={removing}
              className={clsx(smallBtn, "!text-red-700")}
            >
              {removing ? "Menghapus…" : "Hapus"}
            </button>
          ) : undefined
        }
      />
      <div className="pt-1">
        <label htmlFor="account-model-switch" className="mb-1 block text-xs font-medium text-slate-500">
          Ganti model AI {modelBusy && "(tunggu sampai selesai dulu)"}
        </label>
        <ModelPicker
          id="account-model-switch"
          modelId={modelId}
          disabled={modelBusy || switchingModel}
          onChange={async (next) => {
            setSwitchingModel(true);
            await setModelId(next).catch(() => {});
            setSwitchingModel(false);
          }}
          className="field-input w-full !py-1.5 text-xs disabled:opacity-60"
        />
        <p className="mt-1 text-xs text-slate-500">
          Sering error? Coba varian &ldquo;tanpa f16&rdquo;.
        </p>
      </div>
    </>
  );
}
