export const ROUTER_SYSTEM_PROMPT = `Kamu adalah Router/Orchestrator Agent untuk aplikasi manajemen suku cadang otomotif Prima Motor Volvo.

Tugasmu HANYA menentukan agent tujuan berdasarkan pesan staf, bukan menjawab langsung:
- Jika staf bertanya soal stok/ketersediaan part ("ada radiator 240 gak?", "sisa berapa bohlam sein?") → arahkan ke QUERY_AGENT
- Jika staf ingin mencatat perubahan stok ("masuk barang 10 pcs filter oli", "keluar 2 unit karbu", "pindahkan ke gudang") → arahkan ke TRANSACTION_AGENT
- Jika staf bertanya soal tren/laporan ("part apa yang paling laku bulan ini?") → arahkan ke QUERY_AGENT (getSalesTrend)
- Pesan yang tidak berkaitan dengan stok/part → OFF_TOPIC.

Cara membedakan:
- Pesan berisi kata pergerakan barang (masuk, keluar, kejual, laku, pindah, transfer, kurangi, tambah) beserta nama barang
  → TRANSACTION_AGENT, walau pesannya sangat singkat, tanpa lokasi, atau nama barangnya tidak kamu kenal.
  Contoh: "masuk 3 busi bosch" → TRANSACTION_AGENT.
- Pertanyaan ada/sisa/berapa/stok sebuah barang di toko ini, atau penjualannya → QUERY_AGENT, termasuk istilah part
  yang tidak kamu kenal.
- Pertanyaan barang apa saja yang dijual/tersedia di toko ini ("di toko ada produk apa aja?") → QUERY_AGENT.
- Pertanyaan lanjutan soal stok atau transaksi yang baru dibahas ("kenapa stoknya berubah?", "yang tadi sisa berapa?")
  → QUERY_AGENT. Lihat "Balasan asisten sebelumnya" bila ada untuk memahami konteksnya.
- OFF_TOPIC untuk pesan yang tidak meminta data stok/penjualan toko ini dan tidak meminta pencatatan barang,
  termasuk sapaan dan pertanyaan soal kemampuanmu.

Staf sering pakai istilah informal/typo (karbu = karburator, bohlam sein = lampu sein, dll) —
jangan koreksi mereka, teruskan apa adanya ke agent tujuan yang akan melakukan fuzzy search.

Balas HANYA dengan salah satu token: QUERY_AGENT, TRANSACTION_AGENT, atau OFF_TOPIC.`

import { stripThinking } from "@/src/lib/agents/tool-protocol";

const ROUTER_CONTEXT_MAX_CHARS = 300;

/**
 * Router tidak menerima riwayat penuh (hemat token), tapi pesan lanjutan seperti
 * "kenapa stoknya berubah?" tidak bisa diklasifikasi tanpa balasan terakhir.
 */
export function buildRouterInput(userMessage: string, lastAssistantText?: string): string {
  const context = lastAssistantText?.trim().slice(0, ROUTER_CONTEXT_MAX_CHARS);
  return context ? `Balasan asisten sebelumnya: "${context}"\nPesan staf: ${userMessage}` : userMessage;
}

const ROUTER_LABEL = /transaction|query|off[_\s-]?topic/i;

/**
 * Toleran terhadap variasi keluaran model ("TRANSACTION", "transaction_agent",
 * "QUERY AGENT."): Llama 3.2 sering memotong akhiran "_AGENT".
 *
 * Teks "berpikir" (<think>…</think>) dibuang dulu, lalu label diambil dari kata
 * label pertama di balasan, bukan dari kata mana pun: pikiran model yang menyebut
 * "transaction" tidak boleh menentukan rute.
 */
export function parseRouterReply(text: string): "query" | "transaction" | "off_topic" {
  return parseRouterReplyOrNull(text) ?? "off_topic";
}

/**
 * Sama dengan parseRouterReply, tapi null bila balasan tidak memuat label sama
 * sekali (model menyalin pesan staf atau menulis kata acak). Dipakai profil model
 * kecil supaya balasan rusak tidak otomatis dianggap OFF_TOPIC.
 */
export function parseRouterReplyOrNull(text: string): "query" | "transaction" | "off_topic" | null {
  const label = ROUTER_LABEL.exec(stripThinking(text))?.[0].toLowerCase();
  if (label?.startsWith("transaction")) return "transaction";
  if (label?.startsWith("query")) return "query";
  if (label) return "off_topic";
  return null;
}

/**
 * Tata bahasa untuk response_format WebLLM: Router hanya boleh menulis salah satu
 * dari tiga label. Pada run 23 Okt 2026, Router Qwen3 1.7B menyalin pesan staf atau
 * menulis kata acak ("KEJAUSTAN_AGENT") pada 11 dari 32 pesan stok dan transaksi.
 */
export const ROUTER_GRAMMAR = `root ::= "QUERY_AGENT" | "TRANSACTION_AGENT" | "OFF_TOPIC"`;

/**
 * Prompt Router versi ringkas untuk model sangat kecil (Qwen3 1.7B): satu aturan per
 * kelas dan contoh berpasangan, tanpa penjelasan panjang. Contoh sengaja memakai barang
 * dan kalimat yang tidak ada di skenario evaluasi supaya tidak membocorkan jawaban.
 */
export const ROUTER_COMPACT_SYSTEM_PROMPT = `Kamu Router untuk toko suku cadang Volvo. Pilih satu label untuk pesan staf. Jangan menjawab pesannya.

QUERY_AGENT: tanya stok, sisa, ketersediaan, atau penjualan/tren sebuah barang.
TRANSACTION_AGENT: mencatat pergerakan barang (masuk, keluar, kejual, pindah, transfer, kurangi, tambah).
OFF_TOPIC: selain itu (sapaan, umum, cara/harga/rekomendasi, kemampuanmu).

Contoh:
"aki gs 70ah masih ada ga?" -> QUERY_AGENT
"sisa busi ngk tinggal berapa" -> QUERY_AGENT
"penjualan oli mesin 3 bulan terakhir" -> QUERY_AGENT
"bearing roda belakang ready gk" -> QUERY_AGENT
"masuk 6 busi ngk ke gudang" -> TRANSACTION_AGENT
"klr 2 aki gs dr toko" -> TRANSACTION_AGENT
"pindahin 4 seal klep dari gudang ke toko" -> TRANSACTION_AGENT
"kurangin 1 kampas kopling" -> TRANSACTION_AGENT
"halo, kamu siapa?" -> OFF_TOPIC
"apa itu inflasi?" -> OFF_TOPIC
"cara pasang aki baru gimana?" -> OFF_TOPIC
"toko seberang jual aki berapa?" -> OFF_TOPIC

Pesan dengan nama barang dan kata pergerakan adalah TRANSACTION_AGENT, walau singkat atau salah ketik.
Balas HANYA satu label.`

/**
 * Prompt Router untuk Qwen3.5 0.8B. Prompt ringkas sebelumnya berakhir dengan "nama barang dan kata
 * pergerakan adalah TRANSACTION_AGENT", dan Router 0.8B memilih TRANSACTION_AGENT untuk hampir semua
 * pesan berisi nama barang (Q-01..Q-16: benar 6 dari 16). Di sini transaksi harus punya jumlah dan
 * kata pergerakan, dan contoh diselang-seling per kelas. Contoh bukan pesan skenario evaluasi.
 */
export const ROUTER_TINY_SYSTEM_PROMPT = `Kamu Router untuk toko suku cadang Volvo. Baca pesan staf, lalu pilih SATU label. Jangan menjawab pesannya.

QUERY_AGENT: staf BERTANYA soal sebuah barang: ada atau tidak, sisa, berapa, ready, laku, atau tren penjualan.
TRANSACTION_AGENT: staf MEMINTA mencatat perubahan stok: ada jumlah dan kata masuk, keluar, kejual, pindah, kurangi, tambah.
OFF_TOPIC: bukan urusan stok toko: sapaan, pertanyaan umum, harga, cara memasang, rekomendasi, kemampuanmu.

Menyebut nama barang saja BUKAN transaksi. Tanpa jumlah dan kata pergerakan, jangan pilih TRANSACTION_AGENT.

Contoh:
"aki gs 70ah masih ada ga?" -> QUERY_AGENT
"masuk 6 busi ngk ke gudang" -> TRANSACTION_AGENT
"halo, kamu siapa?" -> OFF_TOPIC
"bearing roda belakang ready gk" -> QUERY_AGENT
"klr 2 aki gs dr toko" -> TRANSACTION_AGENT
"cara pasang aki baru gimana?" -> OFF_TOPIC
"penjualan oli mesin 3 bulan terakhir" -> QUERY_AGENT
"pindahin 4 seal klep dari gudang ke toko" -> TRANSACTION_AGENT
"toko seberang jual aki berapa?" -> OFF_TOPIC
"seal klep ada stok?" -> QUERY_AGENT
"kurangin 1 kampas kopling" -> TRANSACTION_AGENT
"apa itu inflasi?" -> OFF_TOPIC

Balas HANYA satu label.`

/**
 * Router dua pertanyaan ya/tidak untuk Qwen3.5 0.8B. Satu pertanyaan tiga pilihan membuat Router
 * 0.8B menjawab hampir selalu sama (TRANSACTION_AGENT dengan prompt ringkas, OFF_TOPIC dengan
 * prompt baru; Router saja benar 50% lalu 28% di Q/T/O/S/H, 26 Okt 2026). Dua pertanyaan
 * ya/tidak lebih sempit. Contoh bukan pesan skenario evaluasi (dijaga model-profile.test.ts).
 */
export const ROUTER_TOPIC_PROMPT = `Kamu penyaring pesan untuk toko suku cadang Volvo. Jawab YA bila pesan staf soal stok, ketersediaan, penjualan, atau pencatatan barang toko. Jawab TIDAK bila soal lain: sapaan, pertanyaan umum, harga, cara memasang, rekomendasi, atau kemampuanmu.

Contoh:
"aki gs 70ah masih ada ga?" -> YA
"halo, kamu siapa?" -> TIDAK
"masuk 6 busi ngk ke gudang" -> YA
"cara pasang aki baru gimana?" -> TIDAK
"penjualan oli mesin 3 bulan terakhir" -> YA
"apa itu inflasi?" -> TIDAK
"klr 2 aki gs dr toko" -> YA
"toko seberang jual aki berapa?" -> TIDAK

Balas HANYA YA atau TIDAK.`

export const ROUTER_RECORD_PROMPT = `Jawab YA hanya bila staf MEMINTA mencatat perubahan stok: ada jumlah dan kata masuk, keluar, kejual, pindah, kurangi, atau tambah. Jawab TIDAK bila staf cuma bertanya (ada atau tidak, sisa, berapa, laku, tren).

Contoh:
"seal klep ada stok?" -> TIDAK
"masuk 6 busi ngk ke gudang" -> YA
"sisa busi ngk tinggal berapa" -> TIDAK
"klr 2 aki gs dr toko" -> YA
"penjualan oli mesin 3 bulan terakhir" -> TIDAK
"pindahin 4 seal klep dari gudang ke toko" -> YA
"bearing roda belakang ready gk" -> TIDAK
"kurangin 1 kampas kopling" -> YA

Balas HANYA YA atau TIDAK.`

export const ROUTER_YESNO_GRAMMAR = `root ::= "YA" | "TIDAK"`;

/** YA / TIDAK di awal balasan (sesudah blok <think> kosong); null bila tidak terbaca. */
export function parseYesNo(text: string): boolean | null {
  const body = text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  const m = /^\W*(ya|tidak)\b/i.exec(body);
  return m ? m[1].toLowerCase() === "ya" : null;
}
