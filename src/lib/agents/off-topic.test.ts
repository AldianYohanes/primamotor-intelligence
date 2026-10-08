import { describe, it, expect } from "vitest";
import {
  OFF_TOPIC_AUTOMOTIVE_REPLY,
  OFF_TOPIC_REPLY,
  mentionsVehicleOrPart,
  offTopicReply,
} from "@/src/lib/agents/off-topic";

describe("mentionsVehicleOrPart", () => {
  it.each<[string]>([
    ["Gimana cara ganti kopling mobil tua?"],
    ["Mobil sedan bekas bagus buat harian gak?"],
    ["Harga aki di bengkel depan berapa ya?"],
    ["Spare part apa yang cocok buat mesin bensin?"],
    ["Ganti v belt tiap berapa km?"],
  ])("mengenali pesan otomotif: %s", (text: string) => {
    expect(mentionsVehicleOrPart(text)).toBe(true);
  });

  it.each<[string]>([
    ["Halo, selamat pagi"],
    ["Cuaca hari ini hujan gak"],
    ["Tolong buatin caption instagram"],
    ["Brembo itu merek apa sih"], // merek saja tidak dihitung
    ["Siapa presiden sekarang?"],
  ])("tidak menganggap pesan umum sebagai otomotif: %s", (text: string) => {
    expect(mentionsVehicleOrPart(text)).toBe(false);
  });
});

describe("offTopicReply", () => {
  it("mengarahkan ke internet / AI lain untuk pertanyaan otomotif", () => {
    expect(offTopicReply("cara pasang busi yang benar")).toBe(OFF_TOPIC_AUTOMOTIVE_REPLY);
  });

  it("tetap memakai balasan kemampuan untuk pesan umum", () => {
    expect(offTopicReply("Halo, selamat pagi")).toBe(OFF_TOPIC_REPLY);
  });
});
