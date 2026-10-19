

export const OFFLINE_MUTATION_MESSAGE =
  "Sedang offline — perubahan stok butuh koneksi internet untuk verifikasi PIN dan mencatat transaksi dengan aman. Coba lagi setelah tersambung.";


export const UNBACKED_STOCK_REPLY =
  "Maaf, stoknya belum bisa saya cek. Coba sebutkan lagi nama barangnya, misalnya \"stok filter oli di toko\".";

export const UNAVAILABLE_TOOL_REPLY =
  "Maaf, permintaan itu di luar kemampuan saya. Saya hanya bisa cek stok, melihat tren penjualan, " +
  "dan mencatat barang masuk/keluar/pindah lokasi (dengan konfirmasi PIN).";

/** Balasan kode milik orchestrator; tidak dipakai sebagai konteks Router maupun agent. */
export const CODE_REPLIES = [UNAVAILABLE_TOOL_REPLY, UNBACKED_STOCK_REPLY, OFFLINE_MUTATION_MESSAGE];
