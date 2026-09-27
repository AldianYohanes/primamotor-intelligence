import { describe, it, expect } from "vitest";
import {
  buildLocationChoice,
  formatDistance,
  haversineMeters,
  locationChoiceMessage,
  mentionedLocations,
  nearestLocation,
  requiresLocationChoice,
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

describe("requiresLocationChoice", () => {
  it("lolos bila lokasi valid dan disebut staf", () => {
    expect(requiresLocationChoice({ location_id: "lg" }, "masuk ke gudng", locations)).toBe(false);
  });

  it("menahan bila staf tidak menyebut lokasi walau model memilih lokasi valid", () => {
    expect(requiresLocationChoice({ location_id: "lt" }, "Masuk 5 filter udara", locations)).toBe(true);
  });

  it("menahan bila model memakai lokasi berbeda dari yang disebut", () => {
    expect(requiresLocationChoice({ location_id: "lt" }, "masuk ke gudang", locations)).toBe(true);
  });

  it("menahan bila location_id kosong atau bukan milik tenant", () => {
    expect(requiresLocationChoice({}, "masuk ke gudang", locations)).toBe(true);
    expect(requiresLocationChoice({ location_id: "asing" }, "masuk ke gudang", locations)).toBe(true);
  });

  it("lolos bila tenant hanya punya satu lokasi dan id-nya valid", () => {
    expect(requiresLocationChoice({ location_id: "lt" }, "masuk 5", [toko])).toBe(false);
  });

  it("tidak menahan bila daftar lokasi tidak tersedia (server tetap memvalidasi)", () => {
    expect(requiresLocationChoice({}, "masuk 5", [])).toBe(false);
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
