import { describe, it, expect } from "vitest";
import scenarioFile from "@/src/lib/eval/scenarios.json";
import {
  buildLocationChoice,
  formatDistance,
  haversineMeters,
  locationChoiceMessage,
  mentionedLocations,
  mentionedTwoStoreLocations,
  nearestLocation,
  resolveLocationRef,
  resolveTransferLocations,
  resolveUpdateLocation,
  twoLocationsFeedback,
  twoLocationsSuggestion,
  type TenantLocation,
} from "@/src/lib/agents/location-choice";

const toko: TenantLocation = { id: "lt", name: "Toko", type: "toko", latitude: -6.2441, longitude: 106.8 };
const gudang: TenantLocation = { id: "lg", name: "Gudang", type: "gudang", latitude: -6.2665, longitude: 106.804 };
const tanpaKoordinat: TenantLocation = { id: "lx", name: "Gudang Kapuk", type: "gudang", latitude: null, longitude: null };
const locations = [toko, gudang];

describe("haversineMeters & nearestLocation", () => {
  it("menghitung jarak dua titik Jakarta dalam orde kilometer", () => {
    const d = haversineMeters({ latitude: -6.2441, longitude: 106.8 }, { latitude: -6.2665, longitude: 106.804 });
    expect(d).toBeGreaterThan(2400);
    expect(d).toBeLessThan(2600);
  });

  it("memilih lokasi terdekat dan melewati lokasi tanpa koordinat", () => {
    const near = nearestLocation({ latitude: -6.265, longitude: 106.8035 }, [tanpaKoordinat, toko, gudang]);
    expect(near?.location.id).toBe("lg");
  });

  it("null bila tidak ada lokasi berkoordinat", () => {
    expect(nearestLocation({ latitude: 0, longitude: 0 }, [tanpaKoordinat])).toBeNull();
  });
});

describe("mentionedLocations", () => {
  it.each<[string, string[]]>([
    ["Barang masuk 10 filter oli mahle ke gudang", ["lg"]],
    ["msk 6 v-belt alternatr ke gudng", ["lg"]],
    ["taruh di gdg aja", ["lg"]],
    ["klr 1 timng belt 240 dr toko", ["lt"]],
    ["transfr 3 saringan udara gudang -> toko", ["lt", "lg"]],
    ["Masuk 5 filter udara", []],
    ["Kurangin stok lampu", []],
    ["tolong catat ya gan", []],
  ])("%s", (message: string, expected: string[]) => {
    expect(mentionedLocations(message, locations).map((l) => l.id).sort()).toEqual([...expected].sort());
  });

  it("mencocokkan kata dari nama lokasi", () => {
    expect(mentionedLocations("masuk ke kapuk", [toko, tanpaKoordinat]).map((l) => l.id)).toEqual(["lx"]);
  });
});

describe("resolveLocationRef", () => {
  it("menerima UUID lokasi tenant atau nama/jenis lokasi yang ditulis model", () => {
    expect(resolveLocationRef("lg", locations)?.id).toBe("lg");
    expect(resolveLocationRef("TOKO", locations)?.id).toBe("lt");
    expect(resolveLocationRef("gudang", locations)?.id).toBe("lg");
  });

  it("null untuk nilai kosong, UUID asing, atau yang menunjuk lebih dari satu lokasi", () => {
    expect(resolveLocationRef("", locations)).toBeNull();
    expect(resolveLocationRef(undefined, locations)).toBeNull();
    expect(resolveLocationRef("1234567890abcdef", locations)).toBeNull();
    expect(resolveLocationRef("toko gudang", locations)).toBeNull();
  });
});

describe("resolveUpdateLocation", () => {
  it("mengisi lokasi yang disebut staf walau location_id model kosong, salah tulis, atau asing", () => {
    expect(resolveUpdateLocation({ location_id: "" }, "masuk 10 filter ke gudang", locations)).toEqual({ locationId: "lg" });
    expect(resolveUpdateLocation({ location_id: "TOKO" }, "keluar 2 dari toko", locations)).toEqual({ locationId: "lt" });
    expect(resolveUpdateLocation({ location_id: "fake-uuid" }, "msk 6 ke gudng", locations)).toEqual({ locationId: "lg" });
  });

  it("kata staf menang atas pilihan model yang berbeda", () => {
    expect(resolveUpdateLocation({ location_id: "lt" }, "masuk ke gudang", locations)).toEqual({ locationId: "lg" });
  });

  it("minta staf memilih bila lokasi tidak disebut, walau model menebak lokasi valid", () => {
    expect(resolveUpdateLocation({ location_id: "lt" }, "Masuk 5 filter udara", locations)).toBe("choose");
    expect(resolveUpdateLocation({}, "Masuk 5 filter udara", locations)).toBe("choose");
  });

  it("memakai pilihan model bila staf menyebut beberapa lokasi dan pilihan itu salah satunya", () => {
    expect(resolveUpdateLocation({ location_id: "toko" }, "dari gudang atau toko ya, toko aja", locations)).toEqual({
      locationId: "lt",
    });
    expect(resolveUpdateLocation({}, "gudang atau toko?", locations)).toBe("choose");
  });

  it("memakai satu-satunya lokasi tenant", () => {
    expect(resolveUpdateLocation({}, "masuk 5", [toko])).toEqual({ locationId: "lt" });
  });

  it("meneruskan apa adanya bila daftar lokasi tidak tersedia (server tetap memvalidasi)", () => {
    expect(resolveUpdateLocation({}, "masuk 5", [])).toBe("passthrough");
  });
});

describe("resolveTransferLocations", () => {
  it("memakai asal & tujuan tulisan model", () => {
    expect(resolveTransferLocations({ from_location: "gudang", to_location: "toko" }, "pindah", locations)).toEqual({
      from: "lg",
      to: "lt",
    });
  });

  it("mengisi tujuan yang dikosongkan model dari lokasi lain yang disebut staf (pola T-07)", () => {
    expect(
      resolveTransferLocations(
        { from_location: "gudang", to_location: "" },
        "Toko butuh 2 lampu belakang kiri, ambil dari gudang ya",
        locations,
      ),
    ).toEqual({ from: "lg", to: "lt" });
  });

  it("mengisi asal yang kosong dengan cara yang sama", () => {
    expect(resolveTransferLocations({ to_location: "toko" }, "dari gudang ke toko", locations)).toEqual({
      from: "lg",
      to: "lt",
    });
  });

  it("tidak menebak bila staf hanya menyebut satu lokasi atau keduanya kosong", () => {
    expect(resolveTransferLocations({ to_location: "gudang" }, "Pindahin gril depan 240 ke gudang 2 biji", locations)).toEqual({
      from: null,
      to: "lg",
    });
    expect(resolveTransferLocations({}, "pindahin gudang ke toko", locations)).toEqual({ from: null, to: null });
  });
});

describe("buildLocationChoice", () => {
  const args = { product_id: "p7", location_id: "lt", quantity: 5, direction: "masuk", reasoning: "r" };

  it("menyarankan lokasi terdekat dari perangkat bila staf tidak menyebut lokasi", () => {
    const choice = buildLocationChoice(args, "Masuk 5 filter udara", locations, {
      latitude: -6.2442,
      longitude: 106.8001,
    });
    expect(choice.suggestedLocationId).toBe("lt");
    expect(choice.suggestionReason).toBe("nearest");
    expect(choice.distanceMeters).toBeLessThan(50);
    expect(choice.args).not.toHaveProperty("location_id");
    expect(choice.options.map((o) => o.id)).toEqual(["lt", "lg"]);
  });

  it("mengutamakan lokasi yang disebut staf dan menaruhnya di urutan pertama", () => {
    const choice = buildLocationChoice(args, "masuk ke gudang", locations, { latitude: -6.2441, longitude: 106.8 });
    expect(choice.suggestedLocationId).toBe("lg");
    expect(choice.suggestionReason).toBe("mentioned");
    expect(choice.options[0].id).toBe("lg");
  });

  it("tanpa saran bila posisi perangkat tidak tersedia", () => {
    const choice = buildLocationChoice(args, "Masuk 5 filter udara", locations, null);
    expect(choice.suggestedLocationId).toBeNull();
    expect(locationChoiceMessage(choice, "Filter Udara")).toContain("di mana");
  });

  it("pesan menyebut lokasi terdekat dan jaraknya", () => {
    const choice = buildLocationChoice(args, "Masuk 5 filter udara", locations, { latitude: -6.2665, longitude: 106.804 });
    expect(locationChoiceMessage(choice, "Filter Udara Mann")).toBe(
      "Lokasinya belum disebut. Mau dicatat masuk 5 unit Filter Udara Mann di Gudang? Itu lokasi terdekat dari posisimu sekarang (±0 m). Kalau bukan, pilih lokasi lain di bawah.",
    );
  });
});

describe("formatDistance", () => {
  it("meter di bawah 1 km, kilometer dengan koma di atasnya", () => {
    expect(formatDistance(120)).toBe("±120 m");
    expect(formatDistance(2480)).toBe("±2,5 km");
  });
});

describe("mentionedTwoStoreLocations", () => {
  it.each<[string]>([
    ["Toko butuh 2 lampu belakang kiri, ambil dari gudang ya"],
    ["Gudang kirim 3 filter udara ke toko"],
    ["pindahin 4 wiper dr toko ke gdg"],
    ["Stok toko kurang, tarik 2 oli gardan dari gudang"],
  ])("dua lokasi toko disebut: %s", (message) => {
    expect(mentionedTwoStoreLocations(message, locations)).toEqual(["Toko", "Gudang"]);
  });

  it.each<[string]>([
    ["Masuk 5 bilah wiper bosch dari supplier ke toko"],
    ["Keluar 2 kampas rem depan brembo dari toko, laku ke bengkel"],
    ["Kiriman supplier dateng, bushing arm depan 20 biji taruh gudang"],
    ["Masuk 5 filter udara"],
  ])("satu lokasi atau tempat lain tidak memicu: %s", (message) => {
    expect(mentionedTwoStoreLocations(message, locations)).toBeNull();
  });

  it("dua lokasi sejenis (dua toko) tidak dihitung", () => {
    const toko2: TenantLocation = { id: "lt2", name: "Toko Cabang", type: "toko", latitude: null, longitude: null };
    expect(mentionedTwoStoreLocations("keluar 2 busi dari toko", [toko, toko2, gudang])).toBeNull();
  });

  it("tidak memicu pada skenario updateStock di /eval", () => {
    const wrong = scenarioFile.scenarios
      .filter((s) => (s as { expected_action?: { tool: string } }).expected_action?.tool === "updateStock")
      .filter((s) => mentionedTwoStoreLocations(s.message, locations) !== null)
      .map((s) => s.id);
    expect(wrong).toEqual([]);
  });
});

describe("twoLocationsFeedback", () => {
  it("menyebut transferStock dan kedua lokasi", () => {
    const text = twoLocationsFeedback(["Toko", "Gudang"]);
    expect(text).toContain("transferStock");
    expect(text).toContain("Toko");
    expect(text).toContain("Gudang");
    expect(text.startsWith("<tool_response>")).toBe(true);
  });
});

describe("twoLocationsSuggestion", () => {
  it("T-07: updateStock keluar di gudang + pesan menyebut toko & gudang -> saran transferStock gudang ke toko", () => {
    const suggestion = twoLocationsSuggestion(
      { product: "lampu belakang kiri", quantity: 2, direction: "keluar", location: "gudang", reasoning: "x" },
      ["Toko", "Gudang"],
    );
    expect(suggestion).toEqual({
      name: "transferStock",
      arguments: {
        product: "lampu belakang kiri",
        quantity: 2,
        from_location: "Gudang",
        to_location: "Toko",
        reasoning: expect.any(String),
      },
    });
  });

  it("lokasi yang ditulis model menentukan asal; lokasi satunya jadi tujuan", () => {
    const s = twoLocationsSuggestion({ product: "busi", quantity: 1, location: "Toko" }, ["Toko", "Gudang"]);
    expect(s.arguments).toMatchObject({ from_location: "Toko", to_location: "Gudang" });
  });

  it("lokasi kosong atau tidak cocok: asal/tujuan diberi tanda isian, bukan ditebak", () => {
    const s = twoLocationsSuggestion({ product: "busi", quantity: 1 }, ["Toko", "Gudang"]);
    expect(s.arguments.from_location).toBe("<lokasi asal>");
    expect(s.arguments.to_location).toBe("<lokasi tujuan>");
  });

  it("argumen model yang aneh tidak bikin error", () => {
    const s = twoLocationsSuggestion({ product: 5, quantity: "dua" }, ["Toko", "Gudang"]);
    expect(s.name).toBe("transferStock");
    expect(s.arguments.product).toBe("<nama barang>");
    expect(s.arguments.quantity).toBe("<jumlah>");
  });
});
