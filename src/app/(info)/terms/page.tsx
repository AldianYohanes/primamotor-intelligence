import type { Metadata } from "next";
import { CONTACT_EMAIL, InfoShell, LAST_UPDATED, Section } from "@/src/components/info/InfoShell";

export const metadata: Metadata = {
  title: "Syarat Penggunaan | Prima Motor Volvo",
  description: "Ketentuan memakai prototipe penelitian ini.",
};

export default function TermsPage() {
  return (
    <InfoShell title="Syarat Penggunaan" updated={LAST_UPDATED}>
      <p>
        Dengan memakai aplikasi ini, Anda setuju dengan ketentuan berikut. Aplikasi ini prototipe penelitian untuk
        skripsi di Fakultas Teknologi Informasi, Universitas Tarumanagara, bukan layanan komersial.
      </p>

      <Section title="Sifat layanan">
        <ul className="list-disc space-y-1 pl-5">
          <li>Aplikasi diberikan apa adanya untuk keperluan penelitian dan uji coba, tanpa jaminan ketersediaan.</li>
          <li>Fitur bisa berubah atau dihentikan, dan data uji bisa direset, tanpa pemberitahuan sebelumnya.</li>
        </ul>
      </Section>

      <Section title="Asisten AI bisa keliru">
        <ul className="list-disc space-y-1 pl-5">
          <li>Jawaban model bahasa tidak selalu benar. Periksa angka stok penting sebelum mengambil keputusan.</li>
          <li>
            Perubahan stok lewat asisten baru berlaku setelah Anda mengonfirmasi dengan PIN. Periksa barang, jumlah,
            dan lokasi di layar konfirmasi sebelum memasukkan PIN.
          </li>
        </ul>
      </Section>

      <Section title="Tanggung jawab pengguna">
        <ul className="list-disc space-y-1 pl-5">
          <li>Jaga kerahasiaan PIN dan jangan membagikan akun.</li>
          <li>Isi data seperlunya. Jangan memasukkan data pribadi yang tidak diperlukan ke pesan, catatan, atau foto bon.</li>
          <li>Jangan mencoba menembus keamanan, membebani layanan, atau mengakses data toko lain.</li>
          <li>Bila Anda mengunggah foto bon, Anda menyetujui foto itu diproses oleh Google Gemini untuk dibaca.</li>
        </ul>
      </Section>

      <Section title="Hak kekayaan intelektual">
        <p>
          Kode dan rancangan aplikasi adalah bagian dari karya skripsi penulis. Logo Universitas Tarumanagara dan FTI
          adalah milik institusinya dan dipakai untuk keperluan akademik. Data toko tetap milik toko yang bersangkutan.
        </p>
      </Section>

      <Section title="Batas tanggung jawab">
        <p>
          Sejauh diizinkan hukum, penulis tidak bertanggung jawab atas kerugian yang timbul dari penggunaan prototipe
          ini, termasuk karena jawaban AI yang keliru atau data yang hilang.
        </p>
      </Section>

      <Section title="Hukum yang berlaku dan kontak">
        <p>
          Ketentuan ini tunduk pada hukum Republik Indonesia. Pertanyaan atau keluhan:{" "}
          <a className="underline" href={`mailto:${CONTACT_EMAIL}`}>
            {CONTACT_EMAIL}
          </a>
          . Data pribadi dijelaskan di Kebijakan Privasi.
        </p>
      </Section>
    </InfoShell>
  );
}
