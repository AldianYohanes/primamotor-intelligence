# Spesifikasi perangkat (minimal dan rekomendasi)

Asisten chat menjalankan model bahasa langsung di browser staf lewat WebGPU, jadi yang menentukan bisa-tidaknya jalan adalah GPU, memori, dan browser perangkat itu. Server hanya mengurus data (Supabase), bukan model.

Label: **terverifikasi** = dibaca dari kode/konfigurasi paket atau diukur di run proyek ini. **tidak terverifikasi** = dari sumber luar atau perkiraan.

## Ringkasan

| | Minimal (jalan, lambat) | Rekomendasi (nyaman) |
|---|---|---|
| Model | Qwen3 1.7B `q4f16_1` | Qwen3 1.7B `q4f16_1` (Qwen2.5 3B bila GPU kuat) |
| Browser | Chrome atau Edge versi 113 ke atas (WebGPU aktif) | Chrome/Edge terbaru (uji: Edge 156) |
| GPU | WebGPU dengan fitur `shader-f16`, memori GPU (atau memori bersama) ≥ 3 GB kosong | `shader-f16`, ≥ 4 GB memori GPU kosong |
| RAM | 8 GB | 16 GB |
| Batas buffer | `maxStorageBufferBindingSize` 256 MB (nilai yang terbukti jalan) | ≥ 256 MB |
| Waktu per giliran | beberapa menit | ±1 menit atau kurang |
| Jaringan | unduh model sekali, lalu bisa offline untuk cache stok | sama |

## Kebutuhan memori GPU per model (terverifikasi)

Dibaca dari `prebuiltAppConfig` paket `@mlc-ai/web-llm` 0.2.84 (jendela konteks 4096 token).

| Model | VRAM menurut WebLLM | Catatan |
|---|---|---|
| Qwen3 1.7B `q4f16_1` | 2.037 MB | Rekomendasi proyek ini |
| Qwen3 1.7B `q4f32_1` | 2.635 MB | Untuk GPU tanpa `shader-f16` |
| Qwen2.5 3B `q4f16_1` | 2.505 MB | Model pembanding utama |
| Qwen2.5 3B `q4f32_1` | 2.894 MB | Tanpa `shader-f16` |
| Qwen3 0.6B `q4f16_1` | 1.403 MB | Paling ringan, akurasi belum diuji |

Angka itu hanya bobot dan buffer model. Browser, tab lain, dan sistem juga memakai memori, jadi sisakan kira-kira 1 GB di atasnya. Itulah dasar minimal ≥ 3 GB (perkiraan, tidak terverifikasi).

## Yang terbukti jalan di proyek ini (terverifikasi)

Perangkat uji: laptop Windows 11, Snapdragon X (GPU Qualcomm Adreno), RAM 16 GB, 8 thread, Edge 156, `shader-f16` tersedia, `maxStorageBufferBindingSize` 256 MB, `maxBufferSize` 2.048 MB.

- Qwen2.5 3B: baca *prompt* 18-21 token/detik, tulis 6-8 token/detik; satu giliran 1-2 menit (Router sekitar 27 detik, agent sekitar 1 menit 8 detik pada satu giliran uji).
- Qwen3 1.7B (run 26 Okt 2026, 62 skenario held-out): median satu giliran 52 detik (multi-agent) dan 97 detik (single-agent).
- GPU sempat terputus (`DXGI_ERROR_DEVICE_HUNG`) 4 kali dalam satu run penuh sekitar 2 jam. Setelah itu fitur `shader-f16` hilang sampai Edge dimulai ulang. Run `/eval` otomatis berhenti dan bisa dilanjutkan.

## Saran agar stabil

1. Tutup tab dan aplikasi lain yang memakai GPU (video, game, tab WebGPU lain) selama run.
2. Colok charger dan pakai mode performa; jangan sampai laptop tidur.
3. Bila muncul "Koneksi ke GPU terputus", mulai ulang browser lalu muat ulang halaman; jangan hanya refresh.
4. GPU tanpa `shader-f16`: pakai varian `q4f32_1` (butuh kira-kira 0,4-0,6 GB lebih banyak).
5. Untuk HP: pilih model ringan (Qwen3 0.6B atau Llama 3.2 1B); akurasinya belum diuji di proyek ini.

## Dukungan browser (sumber luar, tidak terverifikasi)

- Chrome dan Edge 113 ke atas mendukung WebGPU; Safari 18 ke atas masih eksperimental; Firefox belum ([GitStarRecall docs](https://www.mintlify.com/Abhinandan-Khurana/GitStarRecall/features/local-llm)).
- `shader-f16` adalah fitur opsional adapter WebGPU, dipakai lewat `requiredFeatures` dengan cadangan f32 ([Chrome for Developers](https://developer.chrome.com/blog/new-in-webgpu-120)).
- Panduan produk lain menyebut inferensi WebGPU butuh GPU dengan minimal 1 GB memori kosong, dan model 1B-3B paling andal lintas perangkat ([webAI](https://developers.webai.com/getting-started/system-requirements), [tianpan.co](https://tianpan.co/blog/2026/04/17/browser-native-llm-inference-webgpu)). Itu bukan angka WebLLM; pakai tabel VRAM di atas.

## Untuk pengembang

- Bun 1.3.9 (`packageManager`), Next.js 16.2.10, React 19.2.4, `@mlc-ai/web-llm` ^0.2.84; Node 22 dipakai di mesin uji.
- Server dev: `bun run dev`; model dimuat di browser, bukan di server.
