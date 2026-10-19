import type { AgentExecutionMetricPayload } from "@/src/lib/agents/metrics-schema";

/**
 * Kirim satu baris metrics ke /api/agent/metrics — fire-and-forget murni.
 * `keepalive: true` supaya request tetap sempat terkirim walau dipanggil pas
 * runAgentTurn sudah resolve dan komponen pemanggil re-render/unmount duluan.
 * Sengaja tidak pernah throw ke pemanggil: kegagalan endpoint metrics adalah
 * masalah observability, bukan alasan untuk mengganggu pengalaman chat staf.
 */
export function reportAgentExecutionMetric(payload: AgentExecutionMetricPayload) {
  fetch("/api/agent/metrics", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    keepalive: true,
  }).catch(() => {
    // Diamkan — lihat catatan di atas fungsi.
  });
}
