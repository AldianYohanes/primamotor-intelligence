import { describe, it, expect } from "vitest";
import {
  buildLocationChoice,
  formatDistance,
  haversineMeters,
  locationChoiceMessage,
  mentionedLocations,
  nearestLocation,
  resolveLocationRef,
  resolveUpdateLocation,
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
