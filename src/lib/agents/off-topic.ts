/**
 * Balasan untuk pesan di luar urusan stok. Pesan yang menyebut mobil atau
 * suku cadang tapi bukan soal stok toko ini (cara servis, ulasan mobil, harga
 * di toko lain) diarahkan ke internet / asisten AI lain, bukan sekadar ditolak
 * (keputusan Aldian 8 Okt 2026). Deteksinya kosakata otomotif umum, bukan
 * daftar soal uji.
 */
export const OFF_TOPIC_REPLY =
  "Maaf, saya hanya bisa membantu urusan stok & suku cadang toko ini. Contohnya:\n" +
  '- Cek stok: "stok radiator di toko berapa?"\n' +
  '- Catat barang masuk/keluar: "masuk 10 filter oli di gudang"\n' +
  '- Pindah barang: "pindahkan 2 busi dari gudang ke toko"\n' +
  '- Tren penjualan: "penjualan radiator 6 bulan terakhir"';

export const OFF_TOPIC_AUTOMOTIVE_REPLY =
  "Itu di luar data stok toko ini, jadi saya tidak bisa menjawabnya dengan pasti. " +
  "Untuk hal seperti cara servis, ulasan mobil, atau harga di toko lain, coba cari di internet atau tanya asisten AI lain.\n" +
  "Saya bisa bantu cek stok, catat barang masuk/keluar/pindah lokasi, dan lihat tren penjualan barang di toko ini.";

const AUTOMOTIVE_TERMS = [
  "mobil", "motor", "kendaraan", "volvo", "mesin", "servis", "service", "bengkel", "montir",
  "part", "sparepart", "spare part", "suku cadang", "onderdil",
  "oli", "rem", "kampas", "ban", "velg", "aki", "busi", "radiator", "karbu", "karburator", "filter",
  "saringan", "timing belt", "v-belt", "vbelt", "sabuk", "kopling", "gardan", "transmisi", "persneling",
  "lampu", "wiper", "knalpot", "shock", "sokbreker", "bushing", "gril", "grill", "bumper", "spion",
  "alternator", "dinamo", "starter", "kompresor", "injektor", "piston", "gasket", "packing", "bearing",
];

const AUTOMOTIVE_RE = new RegExp(
  `(^|[^a-z])(${AUTOMOTIVE_TERMS.map((t) => t.replace(/[-\s]/g, "[-\\s]?")).join("|")})([^a-z]|$)`,
  "i",
);

export function mentionsVehicleOrPart(message: string): boolean {
  return AUTOMOTIVE_RE.test(message);
}

export function offTopicReply(message: string): string {
  return mentionsVehicleOrPart(message) ? OFF_TOPIC_AUTOMOTIVE_REPLY : OFF_TOPIC_REPLY;
}
