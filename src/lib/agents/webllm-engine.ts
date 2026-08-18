"use client";

import * as webllm from "@mlc-ai/web-llm";

/**
 * Model kecil (~1-2GB) agar realistis di-load di browser staf toko lewat WiFi
 * biasa. Ganti MODEL_ID kalau mau model lain yang didukung web-llm — daftar
 * lengkap ada di webllm.prebuiltAppConfig.model_list
 */

// export const MODEL_ID = "SmolLM2-1.7B-Instruct-q4f16_1-MLC";
export const MODEL_ID = "Hermes-3-Llama-3.1-8B-q4f16_1-MLC";

let enginePromise: Promise<webllm.MLCEngineInterface> | null = null;

export type WebLLMDeviceErrorHandler = (error: Error) => void;

let activeDeviceErrorHandler: WebLLMDeviceErrorHandler | null = null;

function interceptNextGPUDevice(onError: (error: Error) => void) {
  if (typeof navigator === "undefined" || !navigator.gpu) return;
  const gpu = navigator.gpu as any;

  if (typeof gpu.requestDevice !== "function") return;

  const originalRequestDevice = gpu.requestDevice.bind(gpu);

  gpu.requestDevice = (async (
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

    gpu.requestDevice = originalRequestDevice;

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
        enginePromise = null;
        throw err;
      });
  }
  return enginePromise;
}

export function resetWebLLMEngine() {
  enginePromise = null;
  activeDeviceErrorHandler = null;
}
