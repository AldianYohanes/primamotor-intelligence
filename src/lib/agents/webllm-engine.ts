"use client";

import * as webllm from "@mlc-ai/web-llm";

/**
 * Model kecil (~1-2GB) agar realistis di-load di browser staf toko lewat WiFi
 * biasa. Ganti MODEL_ID kalau mau model lain yang didukung web-llm — daftar
 * lengkap ada di webllm.prebuiltAppConfig.model_list.
 */
export const MODEL_ID = "Llama-3.2-3B-Instruct-q4f16_1-MLC";

let enginePromise: Promise<webllm.MLCEngineInterface> | null = null;

export function getWebLLMEngine(
  onProgress?: (report: webllm.InitProgressReport) => void,
) {
  if (!enginePromise) {
    enginePromise = webllm.CreateMLCEngine(MODEL_ID, {
      initProgressCallback: onProgress,
    });
  }
  return enginePromise;
}

export function isWebGPUAvailable(): boolean {
  return typeof navigator !== "undefined" && "gpu" in navigator;
}
