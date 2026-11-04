import { describe, it, expect } from "vitest";
import { applyCorrections, correctQuantity, correctToolCall, groundProductName, inferDirection, missingCallSuggestion, statedQuantity, transferCallFrom } from "@/src/lib/agents/tool-correction";
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

describe("statedQuantity dan correctQuantity", () => {
  it("memakai angka yang jelas dan mengabaikan kode model", () => {
    expect(statedQuantity("hella 240 laku 1 di toko")).toBe(1);
    expect(statedQuantity("Oli gardan 2 botol kejual barusan dari toko")).toBe(2);
    expect(statedQuantity("Pindahin 5 filter oli mahle dari gudang ke toko")).toBe(5);
  });

  it("null bila tidak ada angka jelas, ada dua angka berbeda, atau angka terlalu besar", () => {
    expect(statedQuantity("Kurangin stok lampu")).toBeNull();
    expect(statedQuantity("masuk 3 busi lalu keluar 1 aki")).toBeNull();
    expect(statedQuantity("Masuk 10000 filter oli mahle ke gudang")).toBeNull();
    expect(statedQuantity("Keluar -5 wiper bosch dari toko")).toBeNull();
    expect(statedQuantity("wiper bosch laku 3 bulan terakhir berapa")).toBeNull();
  });

  it("mengoreksi jumlah yang bertentangan dan membiarkan yang sudah sesuai", () => {
    const wrong = { name: "updateStock", arguments: { product: "hella 240", quantity: 240, direction: "keluar" } };
    expect(correctQuantity(wrong, "hella 240 laku 1 di toko").call.arguments.quantity).toBe(1);
    expect(correctQuantity(wrong, "hella 240 laku 1 di toko").note).toContain("1");
    const right = { name: "updateStock", arguments: { quantity: 1 } };
    expect(correctQuantity(right, "hella 240 laku 1 di toko").call).toBe(right);
    expect(correctQuantity({ name: "getStock", arguments: { query: "x" } }, "x laku 1").note).toBeNull();
  });
});

describe("transferCallFrom", () => {
  const names: [string, string] = ["Toko", "Gudang"];
  const update = { name: "updateStock", arguments: { product: "oli gardan", quantity: 2, direction: "keluar", location: "toko", reasoning: "r" } };

  it("mengubah updateStock menjadi pindah dari kata depan dari dan ke", () => {
    const fromGudang = transferCallFrom(update, "Stok toko kurang, tarik 2 oli gardan dari gudang", names);
    expect(fromGudang?.call).toEqual({
      name: "transferStock",
      arguments: { product: "oli gardan", quantity: 2, from_location: "Gudang", to_location: "Toko", reasoning: "r" },
    });
    expect(transferCallFrom(update, "Toko butuh 2 lampu belakang kiri, ambil dari gudang ya", names)?.call.arguments.from_location).toBe("Gudang");
    expect(transferCallFrom(update, "ambil 2 mud flap dari gudang buat dipajang di toko", names)?.call.arguments.to_location).toBe("Toko");
    expect(transferCallFrom(update, "naikin 3 filter ke toko dari stok", names)?.call.arguments.to_location).toBe("Toko");
  });

  it("tidak mengubah bila ada kata masuk atau keluar, arah tidak jelas, atau bukan updateStock", () => {
    expect(transferCallFrom(update, "keluar 2 oli gardan dari gudang buat toko", names)).toBeNull();
    expect(transferCallFrom(update, "oli gardan di toko dan gudang 2 biji", names)).toBeNull();
    expect(transferCallFrom({ name: "getStock", arguments: {} }, "ambil dari gudang untuk toko", names)).toBeNull();
  });
});

describe("applyCorrections", () => {
  it("menggabungkan koreksi arah dan jumlah", () => {
    const result = applyCorrections(
      { name: "updateStock", arguments: { product: "hella 240", quantity: 240, direction: "masuk" } },
      "hella 240 laku 1 di toko",
      TOOLS,
    );
    expect(result.call.arguments).toMatchObject({ quantity: 1, direction: "keluar" });
    expect(result.note).toContain("Arah");
    expect(result.note).toContain("Jumlah");
  });
});

describe("groundProductName", () => {
  it("membuang kata karangan dari nama barang (T-15)", () => {
    const fixed = groundProductName({ name: "updateStock", arguments: { product: "lampu sein", quantity: 1 } }, "Kurangin stok lampu");
    expect(fixed.call.arguments.product).toBe("lampu");
    expect(fixed.note).toContain("lampu sein");
  });

  it("membiarkan nama yang sesuai pesan, salah ketik wajar, atau terjemahan", () => {
    const same = { name: "updateStock", arguments: { product: "v-belt alternator" } };
    expect(groundProductName(same, "msk 6 v-belt alternatr ke gudng").call).toBe(same);
    const translated = { name: "updateStock", arguments: { product: "Lampu Belakang Kiri" } };
    expect(groundProductName(translated, "tail lamp kiri kosong").call).toBe(translated);
    const single = { name: "updateStock", arguments: { product: "lampu" } };
    expect(groundProductName(single, "kurangin lampu").call).toBe(single);
    expect(groundProductName({ name: "getStock", arguments: { product: "lampu sein" } }, "lampu").note).toBeNull();
  });
});

describe("missingCallSuggestion tanpa katalog (model non-Qwen3)", () => {
  it("pesan stok dengan nama barang jarang tetap ditegur", () => {
    expect(missingCallSuggestion("stok mud flap belakang berapa?")).not.toBeNull();
  });
});
