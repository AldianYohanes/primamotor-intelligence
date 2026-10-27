import Image from "next/image";
import type { Metadata } from "next";
import { InfoShell, Section } from "@/src/components/info/InfoShell";

export const metadata: Metadata = {
  title: "Tentang | Prima Motor Volvo",
  description: "Aplikasi ini dibuat untuk skripsi di Fakultas Teknologi Informasi, Universitas Tarumanagara.",
};

const THESIS_TITLE = "Implementasi Arsitektur Multi-Agent untuk Sistem Manajemen Suku Cadang Otomotif Menggunakan WebLLM";

// Dikutip persis dari naskah proposal (Bab I, rumusan masalah).
const RESEARCH_QUESTIONS = [
  "Bagaimana merancang arsitektur multi-agent berbasis WebLLM yang menjalankan inferensi model bahasa secara on-device untuk mendukung pengelolaan persediaan suku cadang?",
  "Bagaimana merancang pembagian peran agent, pengelolaan konteks, dan routing dua tahap agar permintaan pengguna diarahkan ke agent serta tool yang sesuai?",
  "Bagaimana merancang alur eksekusi tool yang memisahkan penafsiran bahasa alami oleh LLM dari validasi deterministik, otorisasi, dan konfirmasi pengguna untuk operasi yang mengubah data?",
  "Bagaimana mengintegrasikan akses baca offline-first dan pemantauan persediaan berbasis aturan ke dalam arsitektur tersebut tanpa menjadikan LLM sebagai sumber kebenaran data atau pengambil keputusan transaksi?",
];

const FACTS: [string, string][] = [
  ["Penulis", "Aldian Yohanes"],
  ["NIM", "535230139"],
  ["Program studi", "Teknik Informatika"],
  ["Fakultas", "Fakultas Teknologi Informasi (FTI)"],
  ["Universitas", "Universitas Tarumanagara, Jakarta"],
  ["Dosen pembimbing", "Viny Christanti Mawardi dan Daniel Jahja Surjawan"],
  ["Studi kasus", "Prima Motor Volvo, toko suku cadang Volvo di Blok M Square, Jakarta Selatan"],
  ["Tahun", "2026"],
];

export default function AboutPage() {
  return (
    <InfoShell title="Tentang aplikasi ini">
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <Image
          src="/about/logo-fti-untar.png"
          width={848}
          height={324}
          alt="Logo Universitas Tarumanagara, Fakultas Teknologi Informasi"
          className="h-auto w-64 max-w-full"
          unoptimized
          priority
        />
        <p className="mt-4 text-base text-slate-900">
          Aplikasi ini adalah <strong>prototipe penelitian untuk skripsi</strong>, bukan produk komersial.
        </p>
      </div>

      <Section title="Judul skripsi">
        <p className="text-base font-medium text-slate-900">{THESIS_TITLE}</p>
        <p>
          Nama konsep sistemnya <strong>Stokgent</strong>: asisten stok yang berjalan langsung di browser perangkat
          pengguna, tanpa mengirim pesan staf ke penyedia AI di internet.
        </p>
      </Section>

      <Section title="Identitas">
        <dl className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
          {FACTS.map(([label, value]) => (
            <div key={label} className="grid gap-1 px-4 py-3 sm:grid-cols-[10rem_1fr]">
              <dt className="font-medium text-slate-900">{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section title="Yang dibuktikan skripsi ini">
        <p>Rumusan masalah penelitian, seperti pada naskah proposal:</p>
        <ol className="list-decimal space-y-2 pl-5">
          {RESEARCH_QUESTIONS.map((q) => (
            <li key={q}>{q}</li>
          ))}
        </ol>
      </Section>

      <Section title="Cara kerja singkat">
        <ul className="list-disc space-y-1 pl-5">
          <li>Staf bertanya atau mencatat barang lewat chat. Model bahasa berjalan di perangkat (WebLLM dan WebGPU).</li>
          <li>Pesan dipilah ke Query Agent (hanya membaca stok dan tren) atau Transaction Agent (mengusulkan perubahan stok).</li>
          <li>Model hanya menafsirkan bahasa. Validasi, otorisasi, dan perubahan stok dilakukan kode di server, dan setiap perubahan stok menunggu konfirmasi PIN staf.</li>
          <li>Saran pemesanan ulang dihitung dengan aturan terjadwal, bukan oleh model bahasa.</li>
        </ul>
      </Section>

      <Section title="Batasan">
        <ul className="list-disc space-y-1 pl-5">
          <li>Jawaban model bahasa bisa keliru. Periksa angka stok penting sebelum bertindak.</li>
          <li>Hasil evaluasi dibahas di naskah skripsi, bukan di halaman ini.</li>
          <li>Logo Universitas Tarumanagara dan FTI adalah milik institusinya dan dipakai untuk keperluan akademik.</li>
        </ul>
      </Section>
    </InfoShell>
  );
}
