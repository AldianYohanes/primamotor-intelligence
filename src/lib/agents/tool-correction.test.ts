import { describe, it, expect } from "vitest";
import { correctToolCall, inferDirection, missingCallSuggestion } from "@/src/lib/agents/tool-correction";
import { parseFunctionStyleCall } from "@/src/lib/agents/tool-protocol";
import { asksSalesTrend } from "@/src/lib/agents/route-guard";

const TOOLS = new Set(["getStock", "getSalesTrend", "updateStock", "transferStock"]);

describe("inferDirection", () => {
  it("mengenali kata keluar dan masuk", () => {
    expect(inferDirection("Oli gardan 2 botol kejual barusan dari toko")).toBe("keluar");
    expect(inferDirection("Kiriman supplier dateng, bushing 20 biji taruh gudang")).toBe("masuk");
    expect(inferDirection("Tadi kejual 1 radiator, tolong dikurangin")).toBe("keluar");
  });

  it("null bila tidak ada kata arah atau keduanya muncul", () => {
    expect(inferDirection("Toko butuh 2 lampu, ambil dari gudang")).toBeNull();
    expect(inferDirection("masuk 3 busi lalu keluar 1")).toBeNull();
    expect(inferDirection("Stok toko kurang, tarik 2 oli gardan")).toBeNull();
  });
});

describe("correctToolCall", () => {
  it("memperbaiki arah updateStock yang bertentangan dengan pesan", () => {
    const fixed = correctToolCall(
      { name: "updateStock", arguments: { product: "oli gardan", quantity: 2, direction: "masuk", location: "toko" } },
      "Oli gardan 2 botol kejual barusan dari toko",
      TOOLS,
    );
    expect(fixed.call.arguments.direction).toBe("keluar");
    expect(fixed.note).toContain("keluar");
  });

  it("membiarkan arah yang sudah sesuai atau pesan tanpa kata arah", () => {
    const call = { name: "updateStock", arguments: { product: "x", quantity: 1, direction: "keluar" } };
    expect(correctToolCall(call, "keluar 1 x dari toko", TOOLS).note).toBeNull();
    expect(correctToolCall(call, "catat 1 x di toko", TOOLS).call).toBe(call);
  });

  it("mengganti getStock menjadi getSalesTrend untuk pertanyaan penjualan", () => {
    const fixed = correctToolCall({ name: "getStock", arguments: { query: "wiper bosch" } }, "Wiper bosch lagi rame gak belakangan ini?", TOOLS);
    expect(fixed.call).toEqual({ name: "getSalesTrend", arguments: { product: "wiper bosch" } });
  });

  it("tidak mengganti getStock untuk pertanyaan stok atau bila getSalesTrend tidak tersedia", () => {
    const stock = { name: "getStock", arguments: { query: "radiator" } };
    expect(correctToolCall(stock, "penjualan radiator dan sisa stoknya berapa", TOOLS).call).toBe(stock);
    expect(correctToolCall(stock, "radiator lagi rame gak", new Set(["getStock"])).call).toBe(stock);
  });
});

describe("asksSalesTrend", () => {
  it("membedakan penjualan dari stok", () => {
    expect(asksSalesTrend("wiper bosch lagi laris gak")).toBe(true);
    expect(asksSalesTrend("stok wiper bosch brp")).toBe(false);
    expect(asksSalesTrend("masih ada wiper bosch? lagi laku banget")).toBe(false);
  });

  it("jumlah terjual yang dicatat bukan pertanyaan tren", () => {
    expect(asksSalesTrend("hella 240 laku 1 di toko")).toBe(false);
    expect(asksSalesTrend("wiper bosch laku 3 bulan terakhir berapa?")).toBe(true);
  });
});

describe("missingCallSuggestion", () => {
  it("null untuk pesan di luar topik", () => {
    expect(missingCallSuggestion("Halo, selamat pagi")).toBeNull();
    expect(missingCallSuggestion("Siapa presiden Indonesia sekarang?")).toBeNull();
  });

  it("getStock untuk pertanyaan stok, updateStock untuk pencatatan", () => {
    expect(missingCallSuggestion("Saringan udara masih cukup buat seminggu?")?.suggestion ?? "default").toBe("default");
    expect(missingCallSuggestion("keluar 2 busi dari toko")?.suggestion?.name).toBe("updateStock");
  });
});

describe("parseFunctionStyleCall", () => {
  it("membaca panggilan gaya fungsi dengan argumen bernama", () => {
    expect(parseFunctionStyleCall('getStock(query="wipr bosch")', TOOLS)).toEqual({ name: "getStock", arguments: { query: "wipr bosch" } });
    expect(parseFunctionStyleCall("getSalesTrend(product='oli gardan', months=12)", TOOLS)).toEqual({
      name: "getSalesTrend",
      arguments: { product: "oli gardan", months: 12 },
    });
  });

  it("menolak kalimat biasa, alat tak dikenal, dan argumen yang tidak terbaca", () => {
    expect(parseFunctionStyleCall("Stok busi (NGK) ada 3 di toko", TOOLS)).toBeNull();
    expect(parseFunctionStyleCall('deleteProduct(id="1")', TOOLS)).toBeNull();
    expect(parseFunctionStyleCall("getStock()", TOOLS)).toBeNull();
    expect(parseFunctionStyleCall('getStock(query="belum ditutup)', TOOLS)).toBeNull();
    expect(parseFunctionStyleCall("getStock(wipr bosch)", TOOLS)).toBeNull();
  });
});
