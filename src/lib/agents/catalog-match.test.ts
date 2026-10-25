import { afterEach, describe, expect, it } from "vitest";
import { catalogSize, mentionsCatalogProduct, setCatalogTerms } from "@/src/lib/agents/catalog-match";
import { guardRoute } from "@/src/lib/agents/route-guard";
import { missingCallSuggestion } from "@/src/lib/agents/tool-correction";

const CATALOG = [
  "Radiator Volvo 240", "rediator", "Lampu Belakang Kiri Depo", "tail lamp kiri", "Bushing Arm Suspensi Depan",
  "Mud Flap Belakang", "Stoplamp Volvo 740", "Filter Oli Mahle", "Sabuk Multi-Rib Continental",
];

afterEach(() => setCatalogTerms([]));

describe("mentionsCatalogProduct", () => {
  it("katalog kosong tidak pernah cocok", () => {
    expect(catalogSize()).toBe(0);
    expect(mentionsCatalogProduct("radiator ada gak")).toBe(false);
  });

  it("cocok dengan nama, alias, dan salah ketik wajar", () => {
    setCatalogTerms(CATALOG);
    expect(mentionsCatalogProduct("Tail lamp kiri kosong ya di depan?")).toBe(true);
    expect(mentionsCatalogProduct("rediator 240 ada ga")).toBe(true);
    expect(mentionsCatalogProduct("bushng arm depan msh ada?")).toBe(true);
    expect(mentionsCatalogProduct("mud flap ready gak")).toBe(true);
  });

  it("kata umum dan pesan tanpa barang tidak cocok", () => {
    setCatalogTerms(CATALOG);
    expect(mentionsCatalogProduct("Siapa presiden Indonesia sekarang?")).toBe(false);
    expect(mentionsCatalogProduct("kiri depan belakang kanan volvo")).toBe(false);
    expect(mentionsCatalogProduct("jam segini macet gak ya ke arah Tebet?")).toBe(false);
  });

  it("kata pendek harus persis, supaya 'oli' tidak cocok dengan kata lain", () => {
    setCatalogTerms(["Oli Mahle"]);
    expect(mentionsCatalogProduct("ada ola nggak")).toBe(false);
  });
});

describe("guardRoute dengan katalog", () => {
  it("tanpa opsi katalog, perilaku lama tetap (nama di luar daftar kata tidak ditolong)", () => {
    setCatalogTerms(CATALOG);
    expect(guardRoute("off_topic", "Tail lamp kiri kosong ya di depan?").agentType).toBe("off_topic");
  });

  it("dengan opsi katalog, pertanyaan ketersediaan barang katalog dialihkan ke query", () => {
    setCatalogTerms(CATALOG);
    expect(guardRoute("off_topic", "Tail lamp kiri kosong ya di depan?", { catalog: true }).agentType).toBe("query");
    expect(guardRoute("off_topic", "bushng arm depan msh ada?", { catalog: true }).agentType).toBe("query");
  });

  it("pesan di luar topik tetap off_topic walau katalog dipakai", () => {
    setCatalogTerms(CATALOG);
    expect(guardRoute("off_topic", "Halo, selamat pagi", { catalog: true }).agentType).toBe("off_topic");
    expect(guardRoute("off_topic", "Harga radiator 240 di toko sebelah berapa ya?", { catalog: true }).agentType).toBe("off_topic");
  });

  it("teguran alat yang hilang ikut memakai katalog", () => {
    setCatalogTerms(CATALOG);
    expect(missingCallSuggestion("mud flap belakang ready gak di gudang?")).toBeNull();
    expect(missingCallSuggestion("mud flap belakang ready gak di gudang?", { catalog: true })).not.toBeNull();
  });
});
