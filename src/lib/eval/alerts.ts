/**
 * Suara + notifikasi saat run evaluasi selesai atau berhenti karena error,
 * supaya evaluator tidak perlu menunggui tab selama run yang bisa ~30 menit.
 * Tidak memakai Web Push (server): notifikasi lokal cukup karena halamannya
 * tetap terbuka selama run.
 */

type AlertKind = "done" | "error";

let audioCtx: AudioContext | null = null;
const originalTitle = typeof document !== "undefined" ? document.title : "";

/**
 * Harus dipanggil langsung dari handler klik (sebelum ada `await`): browser
 * hanya mengizinkan AudioContext dan permintaan izin notifikasi dari aksi user.
 */
export function primeAlerts() {
  try {
    audioCtx ??= new AudioContext();
    void audioCtx.resume();
  } catch {
    audioCtx = null;
  }
  if (typeof Notification !== "undefined" && Notification.permission === "default") {
    void Notification.requestPermission().catch(() => {});
  }
}

export function notificationPermission(): NotificationPermission | "unsupported" {
  return typeof Notification === "undefined" ? "unsupported" : Notification.permission;
}

function playTones(kind: AlertKind) {
  if (!audioCtx) return;
  // Selesai: dua nada naik. Error: tiga nada turun, lebih rendah.
  const notes = kind === "done" ? [660, 880] : [520, 390, 260];
  const start = audioCtx.currentTime + 0.05;
  notes.forEach((freq, i) => {
    const osc = audioCtx!.createOscillator();
    const gain = audioCtx!.createGain();
    osc.type = kind === "done" ? "sine" : "square";
    osc.frequency.value = freq;
    const t = start + i * 0.22;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    osc.connect(gain).connect(audioCtx!.destination);
    osc.start(t);
    osc.stop(t + 0.21);
  });
}

async function showNotification(title: string, body: string) {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  const options = { body, tag: "eval-run", requireInteraction: true };
  try {
    // Android Chrome menolak `new Notification()`; lewat service worker kalau ada.
    const registration = await navigator.serviceWorker?.getRegistration();
    if (registration) {
      await registration.showNotification(title, options);
      return;
    }
    new Notification(title, options);
  } catch {
    // Notifikasi hanya pelengkap; suara & status di halaman tetap ada.
  }
}

function markTitle(kind: AlertKind) {
  if (typeof document === "undefined" || document.hasFocus()) return;
  document.title = `${kind === "done" ? "[Selesai]" : "[ERROR]"} ${originalTitle}`;
  const restore = () => {
    if (document.visibilityState === "visible") {
      document.title = originalTitle;
      document.removeEventListener("visibilitychange", restore);
      window.removeEventListener("focus", restore);
    }
  };
  document.addEventListener("visibilitychange", restore);
  window.addEventListener("focus", restore);
}

export function alertUser(kind: AlertKind, title: string, body: string) {
  playTones(kind);
  markTitle(kind);
  void showNotification(title, body);
}
