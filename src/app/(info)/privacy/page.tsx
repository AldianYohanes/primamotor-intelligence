import type { Metadata } from "next";
import { CONTACT_EMAIL, InfoShell, LAST_UPDATED, Section } from "@/src/components/info/InfoShell";

export const metadata: Metadata = {
  title: "Kebijakan Privasi | Prima Motor Volvo",
  description: "Data apa yang diproses aplikasi ini, ke mana datanya pergi, dan hak Anda.",
};

const DATA: [string, string, string][] = [
  ["Akun staf", "Nama, username, dan PIN (PIN disimpan sebagai hash oleh Supabase Auth, bukan teks asli)", "Database Supabase"],
  ["Data toko", "Produk, stok per lokasi, riwayat penjualan, serta pelanggan POS (nama dan nomor telepon bila diisi)", "Database Supabase"],
  ["Percakapan dengan asisten", "Pesan staf, jawaban asisten, dan langkah proses yang ditampilkan di Lihat proses", "Database Supabase"],
  ["Riwayat aksi", "Usulan perubahan stok, siapa yang mengonfirmasi, dan waktunya (audit log)", "Database Supabase"],
  ["Foto bon", "Foto yang Anda unggah di fitur impor bon", "Penyimpanan Supabase, lalu dikirim ke Google Gemini untuk dibaca"],
  ["Posisi perangkat", "Dibaca di perangkat untuk menyarankan lokasi toko terdekat saat mencatat barang", "Tidak dikirim ke server kami"],
  ["Langganan notifikasi", "Alamat langganan push dari browser Anda, bila Anda mengaktifkan notifikasi", "Database Supabase dan layanan push browser"],
  ["Data di perangkat", "Salinan stok untuk mode offline (IndexedDB), pilihan model AI, dan sesi login (cookie)", "Perangkat Anda"],
];

const THIRD_PARTIES: [string, string][] = [
  ["Supabase", "Database, login, dan penyimpanan foto bon."],
  ["Vercel", "Hosting aplikasi dan penjadwal pemantauan stok harian."],
  ["Google (Gemini API)", "Membaca foto bon. Hanya dipakai bila fitur impor bon dipakai, dan setelah persetujuan saat pendaftaran toko."],
  ["Hugging Face dan GitHub", "Sumber unduhan model AI dan pustaka WebGPU. Saat model diunduh, alamat IP perangkat terlihat oleh mereka."],
  ["Layanan push browser", "Mengantar notifikasi bila diaktifkan (misalnya milik Google, Mozilla, atau Apple, tergantung browser)."],
];

export default function PrivacyPage() {
  return (
    <InfoShell title="Kebijakan Privasi" updated={LAST_UPDATED}>
      <p>
        Aplikasi ini adalah prototipe penelitian untuk skripsi di Fakultas Teknologi Informasi, Universitas Tarumanagara,
        dengan toko suku cadang Prima Motor Volvo sebagai studi kasus. Halaman ini menjelaskan data yang diproses
        aplikasi berdasarkan cara kerjanya saat ini.
      </p>

      <Section title="Penanggung jawab">
        <p>
          Aldian Yohanes (penulis skripsi) mengelola aplikasi ini. Pertanyaan, permintaan data, dan keluhan:{" "}
          <a className="underline" href={`mailto:${CONTACT_EMAIL}`}>
            {CONTACT_EMAIL}
          </a>
          .
        </p>
      </Section>

      <Section title="Data yang diproses">
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full min-w-[560px] text-left">
            <thead className="bg-slate-50 text-slate-900">
              <tr>
                <th className="px-3 py-2 font-medium">Data</th>
                <th className="px-3 py-2 font-medium">Isi</th>
                <th className="px-3 py-2 font-medium">Disimpan di</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {DATA.map(([name, content, where]) => (
                <tr key={name} className="align-top">
                  <th scope="row" className="px-3 py-2 font-medium text-slate-900">
                    {name}
                  </th>
                  <td className="px-3 py-2">{content}</td>
                  <td className="px-3 py-2">{where}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Asisten AI">
        <p>
          Model bahasa berjalan di perangkat Anda lewat browser, jadi pesan ke asisten tidak dikirim ke penyedia AI.
          Model diunduh sekali dari internet lalu disimpan di perangkat. Satu-satunya fitur yang memakai layanan AI
          pihak ketiga adalah pembacaan foto bon (Google Gemini).
        </p>
      </Section>

      <Section title="Pihak ketiga">
        <ul className="list-disc space-y-1 pl-5">
          {THIRD_PARTIES.map(([name, use]) => (
            <li key={name}>
              <strong className="text-slate-900">{name}.</strong> {use}
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Cookie dan pelacakan">
        <p>
          Aplikasi hanya memakai cookie sesi login (diperlukan agar Anda tetap masuk). Tidak ada cookie iklan, pelacak
          pihak ketiga, atau analitik pengunjung.
        </p>
      </Section>

      <Section title="Keamanan">
        <ul className="list-disc space-y-1 pl-5">
          <li>Sambungan memakai HTTPS.</li>
          <li>Data dipisah per toko di database, dan staf hanya bisa membaca data tokonya sendiri.</li>
          <li>Setiap perubahan stok dari asisten menunggu konfirmasi PIN staf, dan model AI tidak bisa mengubah stok sendiri.</li>
        </ul>
      </Section>

      <Section title="Lama penyimpanan">
        <p>
          Lama penyimpanan data belum ditetapkan pada tahap prototipe. Anda bisa meminta penghapusan data kapan saja
          lewat email di atas.
        </p>
      </Section>

      <Section title="Hak Anda">
        <p>
          Sesuai Undang-Undang Pelindungan Data Pribadi (UU No. 27 Tahun 2022), Anda berhak meminta akses, perbaikan,
          dan penghapusan data pribadi Anda, serta menarik persetujuan yang pernah diberikan. Kirim permintaan ke{" "}
          <a className="underline" href={`mailto:${CONTACT_EMAIL}`}>
            {CONTACT_EMAIL}
          </a>
          .
        </p>
      </Section>

      <Section title="Perubahan">
        <p>Kebijakan ini diperbarui bila cara kerja aplikasi berubah. Tanggal pembaruan terakhir ada di bagian atas halaman.</p>
      </Section>
    </InfoShell>
  );
}
