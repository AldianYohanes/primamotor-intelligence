type WakeLockSentinelLike = { release: () => Promise<void> };
type WakeLockNavigator = Navigator & {
  wakeLock?: { request: (type: "screen") => Promise<WakeLockSentinelLike> };
};

let holders = 0;
let sentinel: WakeLockSentinelLike | null = null;
let requesting = false;
let listening = false;

async function request() {
  const nav = navigator as WakeLockNavigator;
  if (!nav.wakeLock || sentinel || requesting || holders === 0) return;
  // Browser melepas lock sendiri saat tab disembunyikan; diminta lagi saat kembali.
  if (document.visibilityState !== "visible") return;
  requesting = true;
  try {
    const acquired = await nav.wakeLock.request("screen");
    if (holders === 0) {
      acquired.release().catch(() => {});
    } else {
      sentinel = acquired;
    }
  } catch {
    sentinel = null;
  } finally {
    requesting = false;
  }
}

function listen() {
  if (listening) return;
  listening = true;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      sentinel = null;
      void request();
    }
  });
}

/**
 * Menjaga layar dan sistem tetap menyala selama pekerjaan panjang (unduh/muat
 * model, inferensi, run /eval). Beberapa pemanggil boleh menahan bersamaan;
 * lock dilepas setelah semuanya memanggil fungsi pelepas yang dikembalikan.
 */
export function holdWakeLock(): () => void {
  if (typeof navigator === "undefined" || typeof document === "undefined") return () => {};
  holders += 1;
  listen();
  void request();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    holders -= 1;
    if (holders === 0 && sentinel) {
      sentinel.release().catch(() => {});
      sentinel = null;
    }
  };
}
