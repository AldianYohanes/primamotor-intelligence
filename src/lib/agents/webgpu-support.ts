// Checks WebGPU availability WebGPU without waiting for rendering
export function isWebGPUAvailable(): boolean {
  return typeof navigator !== "undefined" && "gpu" in navigator;
}
