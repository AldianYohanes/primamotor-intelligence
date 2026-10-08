import { describe, it, expect, vi } from "vitest";
import {
  ProcessRecorder,
  formatArgs,
  liveStatusLabel,
  mutationOutcomeStep,
  toolResultStep,
  toolStartStep,
} from "@/src/lib/agents/process-trace";

describe("formatArgs", () => {
  it("menulis argumen dalam satu baris dan melewati nilai kosong", () => {
    expect(formatArgs({ query: "filter udara", limit: 5, location: null, x: "" })).toBe(
      'query: "filter udara", limit: 5',
    );
  });

  it("memotong argumen yang sangat panjang", () => {
    expect(formatArgs({ reasoning: "x".repeat(500) }).length).toBeLessThanOrEqual(240);
  });
});

describe("toolStartStep", () => {
  it("getStock menampilkan kata yang dicari", () => {
    const step = toolStartStep("getStock", { query: "filter udara", limit: 5 });
    expect(step.label).toBe('Mencari "filter udara"…');
    expect(step.detail).toBe('getStock(query: "filter udara", limit: 5)');
    expect(step.status).toBe("running");
  });

  it("updateStock menyebut arah dan barang", () => {
    expect(toolStartStep("updateStock", { product: "busi", direction: "keluar", quantity: 2 }).label).toBe(
      "Mencatat keluar busi…",
    );
  });
});

describe("toolResultStep", () => {
  it("meringkas hasil getStock tanpa menyimpan seluruh respons", () => {
    const step = toolResultStep("getStock", {
      results: [
        { product_id: "p1", name: "Filter Udara 240", stock_by_location: [{ location_id: "l1", location_name: "Toko", available_quantity: 2 }] },
        { product_id: "p2", name: "Filter Oli", stock_by_location: [] },
        { product_id: "p3", name: "Filter Solar" },
        { product_id: "p4", name: "Filter Kabin" },
      ],
    });
    expect(step.label).toBe("getStock: 4 hasil");
    expect(step.detail).toContain("Filter Udara 240 — Toko 2");
    expect(step.detail).not.toContain("Filter Kabin");
    expect(step.detail?.endsWith("…")).toBe(true);
  });

  it("menandai hasil dari cache perangkat", () => {
    expect(toolResultStep("getStock", { results: [], source: "offline_cache" }).label).toContain("cache perangkat");
  });

  it("error alat menjadi langkah gagal", () => {
    const step = toolResultStep("getSalesTrend", { error: "Produk tidak ditemukan" });
    expect(step.status).toBe("failed");
    expect(step.detail).toBe("Produk tidak ditemukan");
  });

  it("meringkas tren penjualan", () => {
    const step = toolResultStep("getSalesTrend", {
      product_name: "Radiator",
      trend: [{ total_keluar: 3 }, { total_keluar: 4 }],
    });
    expect(step.label).toBe("getSalesTrend: 2 bulan data");
    expect(step.detail).toBe("Radiator: total keluar 7");
  });

  it("menandai tren penjualan yang barangnya ambigu", () => {
    const step = toolResultStep("getSalesTrend", {
      status: "product_ambiguous",
      candidates: ["Lampu Depan Hella", "Lampu Belakang Kiri"],
    });
    expect(step.label).toBe("getSalesTrend: 2 barang mirip, perlu ditanyakan ke staf");
    expect(step.detail).toBe("Lampu Depan Hella; Lampu Belakang Kiri");
  });

  it("menyebut nama barang saat mulai mengambil tren", () => {
    expect(toolStartStep("getSalesTrend", { product: "wiper bosch" }).label).toBe(
      'Mengambil tren penjualan "wiper bosch"…',
    );
  });
});

describe("mutationOutcomeStep", () => {
  it("menunggu PIN", () => {
    expect(mutationOutcomeStep({ status: "pending_confirmation" }).label).toContain("menunggu PIN");
  });

  it("penolakan server membawa pesan error", () => {
    const step = mutationOutcomeStep({ status: "rejected", error: "Stok tidak mencukupi" });
    expect(step.status).toBe("failed");
    expect(step.detail).toBe("Stok tidak mencukupi");
  });

  it("menyebut saran lokasi terdekat", () => {
    expect(mutationOutcomeStep({ status: "location_choice_required", suggestion_reason: "nearest" }).label).toContain(
      "terdekat",
    );
  });

  it("status tak dikenal tetap terbaca", () => {
    expect(mutationOutcomeStep({ status: "aneh" }).label).toBe("Status: aneh");
  });
});

describe("liveStatusLabel", () => {
  it("belum ada langkah", () => {
    expect(liveStatusLabel([])).toBe("Asisten sedang berpikir…");
  });

  it("menampilkan langkah yang sedang berjalan", () => {
    expect(liveStatusLabel([{ kind: "tool", label: 'Mencari "busi"…', status: "running" }])).toBe('Mencari "busi"…');
  });

  it("setelah langkah terakhir selesai, model sedang menulis", () => {
    expect(liveStatusLabel([{ kind: "tool", label: "getStock: 2 hasil", status: "done" }])).toBe("Menyusun jawaban…");
  });
});

describe("ProcessRecorder", () => {
  it("mengirim salinan daftar setiap ada perubahan", () => {
    const onChange = vi.fn();
    const rec = new ProcessRecorder(onChange);
    const i = rec.add({ kind: "tool", label: "a", status: "running" });
    rec.finish(i, { kind: "tool", label: "b", status: "done" });
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(onChange.mock.calls[0][0][0].label).toBe("a");
    expect(rec.steps[0].label).toBe("b");
  });

  it("failRunning menandai langkah yang belum selesai", () => {
    const rec = new ProcessRecorder();
    rec.add({ kind: "tool", label: "a", status: "running" });
    rec.add({ kind: "route", label: "r", status: "done" });
    rec.failRunning();
    expect(rec.steps.map((s) => s.status)).toEqual(["failed", "done"]);
  });

  it("error di onChange tidak merusak giliran", () => {
    const rec = new ProcessRecorder(() => {
      throw new Error("render gagal");
    });
    expect(() => rec.add({ kind: "answer", label: "x", status: "done" })).not.toThrow();
  });
});
