"use client";

import * as webllm from "@mlc-ai/web-llm";

/**
 * Model kecil (~1-2GB) agar realistis di-load di browser staf toko lewat WiFi
 * biasa. Ganti MODEL_ID kalau mau model lain yang didukung web-llm — daftar
 * lengkap ada di webllm.prebuiltAppConfig.model_list.
 *
 * PENTING soal pemilihan model: error WebGPU
 * "Binding size (...) is larger than the maximum ..." yang muncul di console
 * bukan soal RAM/VRAM habis, tapi soal `maxStorageBufferBindingSize` yang
 * dinegosiasikan browser dengan GPU. web-llm minta 1GB ke adapter; kalau GPU
 * device tidak mendukungnya, web-llm diam-diam fallback ke limit default
 * WebGPU (128MB) — lihat `detectGPUDevice()` di package ini. Kalau bobot
 * embedding/lm_head model (vocab_size * hidden_size, terkuantisasi 4-bit)
 * lebih besar dari 128MB, `createBindGroup` gagal saat inference dan
 * melempar `GPUValidationError` yang TIDAK bisa ditangkap lewat try/catch
 * biasa (makanya nongol sebagai "uncaptured error" di console, bukan
 * exception yang bisa di-catch).
 *
 * Llama-3.2 (1B maupun 3B) pakai vocab besar (128,256 token). Untuk 3B
 * (hidden_size 3072) buffer embedding-nya ~188MB — pasti melebihi fallback
 * 128MB, persis error yang muncul. Untuk 1B (hidden_size 2048) turun ke
 * ~125MB — masih terlalu mepet ke limit 128MB, gampang gagal lagi di device
 * lain yang limitnya sedikit di bawah 128MB. SmolLM2-1.7B pakai vocab jauh
 * lebih kecil (49,152 token) sehingga buffer embedding-nya hanya ~48MB —
 * muat nyaman di hampir semua GPU/browser yang mendukung WebGPU, termasuk
 * yang limit-nya jatuh ke fallback 128MB.
 */
export const MODEL_ID = "Hermes-3-Llama-3.1-8B-q4f16_1-MLC";

let enginePromise: Promise<webllm.MLCEngineInterface> | null = null;

/**
 * Dipanggil kalau GPUDevice yang sedang dipakai engine melempar error yang
 * tidak tertangkap (mis. validation error saat createBindGroup) atau device-
 * nya hilang (device lost — bisa karena driver crash, tab di-background
 * terlalu lama di beberapa browser, dsb). Tanpa listener ini, error-error
 * tsb cuma nyangkut di console browser tanpa ada cara bagi UI untuk bereaksi.
 */
export type WebLLMDeviceErrorHandler = (error: Error) => void;

let activeDeviceErrorHandler: WebLLMDeviceErrorHandler | null = null;

/**
 * Bungkus `navigator.gpu.requestDevice` sekali saja untuk "menyadap" GPUDevice
 * yang dibuat web-llm secara internal (API publik web-llm tidak mengekspos
 * device-nya), lalu pasang listener `uncapturederror` dan `lost` di situ.
 * Setelah device pertama tertangkap, method asli langsung dikembalikan —
 * tidak mengubah perilaku pemanggilan WebGPU lain di halaman.
 */
function interceptNextGPUDevice(onError: (error: Error) => void) {
  if (
    typeof navigator === "undefined" ||
    !navigator.gpu ||
    typeof navigator.gpu.requestDevice !== "function"
  ) {
    return;
  }
  const originalRequestDevice = navigator.gpu.requestDevice.bind(navigator.gpu);

  navigator.gpu.requestDevice = (async (
    ...args: Parameters<typeof originalRequestDevice>
  ) => {
    const device = await originalRequestDevice(...args);

    device.addEventListener("uncapturederror", (event) => {
      const message = event.error?.message ?? "Unknown WebGPU error";
      console.error("WebGPU uncaptured error:", message);
      onError(
        new Error(`Model AI berhenti merespons karena error GPU: ${message}`),
      );
    });

    device.lost.then((info) => {
      if (info.reason === "destroyed") return; // unload/cleanup normal
      console.error("WebGPU device lost:", info.message);
      onError(
        new Error(
          "Koneksi ke GPU perangkat terputus. Muat ulang halaman untuk memakai asisten AI lagi.",
        ),
      );
    });

    // Balikin ke method asli — cukup sadap device pertama yang dibuat
    // untuk engine ini.
    navigator.gpu.requestDevice = originalRequestDevice;

    return device;
  }) as typeof originalRequestDevice;
}

export function getWebLLMEngine(
  onProgress?: (report: webllm.InitProgressReport) => void,
  onDeviceError?: WebLLMDeviceErrorHandler,
) {
  if (onDeviceError) {
    activeDeviceErrorHandler = onDeviceError;
  }

  if (!enginePromise) {
    interceptNextGPUDevice((error) => activeDeviceErrorHandler?.(error));
    enginePromise = webllm
      .CreateMLCEngine(MODEL_ID, {
        initProgressCallback: onProgress,
      })
      .catch((err) => {
        // Reset supaya percobaan berikutnya (mis. setelah user pencet tombol
        // "coba lagi" di UI) tidak nyangkut di promise yang sudah gagal
        // selamanya.
        enginePromise = null;
        throw err;
      });
  }
  return enginePromise;
}

/**
 * Reset instance engine yang sedang di-cache, dipakai UI setelah menerima
 * device error supaya tombol "coba lagi" benar-benar membuat engine baru,
 * bukan mengembalikan promise lama yang device-nya sudah rusak/hilang.
 */
export function resetWebLLMEngine() {
  enginePromise = null;
  activeDeviceErrorHandler = null;
}
