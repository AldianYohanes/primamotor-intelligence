/**
 * Pembuat Google Form UAT Stokgent + spreadsheet jawaban + tab Rekap.
 *
 * Cara pakai:
 *   1. Buka https://script.google.com → Proyek baru.
 *   2. Hapus isi Code.gs, tempel seluruh file ini, simpan.
 *   3. Pilih fungsi `buatForm` di toolbar → Jalankan. Izinkan akses Forms, Sheets, dan Drive.
 *   4. Buka Log eksekusi: ada link form untuk responden, link edit, dan link spreadsheet.
 *
 * Tiap kali dijalankan, script membuat form dan spreadsheet BARU (nama diberi tanggal-jam).
 * Yang lama tidak disentuh; hapus sendiri dari Drive kalau tidak dipakai.
 * Tema dibiarkan bawaan Google (Apps Script memang tidak bisa mengatur tema).
 */

// Isi script ini disamakan dengan form final yang dipakai pada UAT 19 November 2026 (form itu sempat diedit manual).
const JUDUL = 'Uji Coba Aplikasi Stokgent';
const BERHASIL = 'Berhasil';
const KURANG = 'Kurang sesuai ekspektasi';
const GAGAL = 'Gagal atau terdapat error';
const PILIHAN_TUGAS = [BERHASIL, KURANG, GAGAL];
// Teks pilihan persetujuan juga dipakai rumus Rekap untuk menyaring kiriman yang setuju.
const SETUJU = 'Ya, saya bersedia ikut serta dan mengizinkan jawaban saya digunakan untuk penelitian ini';
const TIDAK_SETUJU = 'Tidak, saya tidak bersedia';
const PETUNJUK_TUGAS =
  'Disediakan beberapa skenario untuk dilakukan uji coba terhadap aplikasi yang dapat Bapak/Ibu lakukan. ' +
  'Setelah melakukan percobaan, Bapak/Ibu dapat memilih salah satu dari opsi jawaban:\n' +
  '- "Berhasil" bila Bapak/Ibu dapat menyelesaikannya dengan baik;\n' +
  '- "Kurang sesuai ekspektasi" bila Bapak/Ibu merasa ada yang kurang dengan fiturnya;\n' +
  '- "Gagal atau terdapat error" bila Bapak/Ibu mengalami kendala yang menyebabkan uji coba gagal.';
const PETUNJUK_SKALA =
  'Untuk setiap pernyataan, pilih satu angka yang paling sesuai dengan pengalaman Bapak/Ibu:\n' +
  '1 = sangat tidak setuju\n2 = tidak setuju\n3 = netral\n4 = setuju\n5 = sangat setuju';
// Teks form final memang menulis "Stockgent" (salah ketik dari nama aplikasi Stokgent); dibiarkan agar sama dengan data jawaban.
const KOMENTAR_TUGAS = 'Apakah terdapat hal yang membingungkan atau menyulitkan saat mencoba aplikasi Stockgent?';
const NAMA_TAB_JAWABAN = 'Jawaban';
const NAMA_TAB_REKAP = 'Rekap';
const BARIS_REKAP = 5; // slot responden di tab Rekap (UAT ini 2 orang, sisanya cadangan)

const TUGAS_PEMILIK = [
  ['Percobaan 1: Cek stok tali kipas', 'Bertanya ke asisten stok tali kipas di gudang, lalu bertanya hal di luar urusan toko (misalnya cuaca besok).'],
  ['Percobaan 2: Catat busi masuk', 'Mencatat 5 busi NGK yang baru datang ke gudang lewat asisten, lalu konfirmasi dengan PIN.'],
  ['Percobaan 3: Batalkan pencatatan', 'Mencatat 2 filter oli keluar dari toko, lalu membatalkannya saat diminta PIN.'],
  ['Percobaan 4: Cek stok saat internet mati', 'Mengecek stok tali kipas di toko saat internet dimatikan.'],
  ['Percobaan 5: Cari barang yang perlu dipesan lagi', 'Mencari daftar barang yang sebaiknya dipesan lagi di menu admin.'],
];

const TUGAS_STAF = [
  ['Percobaan 1: Cek stok sokbreker', 'Bertanya ke asisten stok sokbreker di toko, lalu bertanya hal di luar urusan toko (misalnya resep nasi goreng).'],
  ['Percobaan 2: Pindahkan kampas rem', 'Memindahkan 3 kampas rem dari gudang ke toko lewat asisten, lalu konfirmasi dengan PIN.'],
  ['Percobaan 3: Batalkan pencatatan', 'Mencatat 1 wiper keluar dari toko, lalu membatalkannya saat diminta PIN.'],
  ['Percobaan 4: Cek stok saat internet mati', 'Mengecek stok kampas rem di gudang saat internet dimatikan.'],
  ['Percobaan 5: Layani pembeli di kasir', 'Melayani pelanggan yang membeli 1 filter oli dan membayar tunai.'],
];

// Urutan dan arah mengikuti SUS asli (Brooke, 1996): ganjil positif, genap negatif. Jangan diubah urutannya.
const SOAL_SUS = [
  'Saya rasa saya akan sering memakai aplikasi ini.',
  'Saya merasa aplikasi ini rumit padahal sebenarnya bisa dibuat lebih sederhana.',
  'Saya merasa aplikasi ini mudah dipakai.',
  'Saya rasa saya butuh bantuan orang yang paham teknologi supaya bisa memakai aplikasi ini.',
  'Saya merasa fitur-fitur di aplikasi ini saling terhubung dengan baik.',
  'Saya merasa banyak hal di aplikasi ini yang tidak konsisten.',
  'Saya rasa kebanyakan orang bisa cepat belajar memakai aplikasi ini.',
  'Saya merasa aplikasi ini merepotkan untuk dipakai.',
  'Saya merasa percaya diri saat memakai aplikasi ini.',
  'Saya perlu belajar banyak hal dulu sebelum bisa memakai aplikasi ini.',
];

const SOAL_CHAT = [
  'Saya merasa asisten paham pertanyaan saya walaupun saya memakai bahasa sehari-hari / tidak baku',
  'Saya merasa jawaban dari asisten sesuai dengan yang saya butuhkan',
  'Saya merasa dapat mempercayai data yang diberikan asisten',
  'Saya merasa jawaban asisten tidak terlalu lama memberikan jawaban',
  'Saya merasa aman dengan data toko karena adanya konfirmasi PIN sebelum asisten melakukan perubahan stok',
  'Saya merasa bisa dengan mudah membatalkan pencatatan di langkah konfirmasi apabila berubah pikiran atau salah ketik',
  'Saya merasa asisten dapat menolak dengan sopan saat saya bertanya hal di luar urusan toko',
  'Saya merasa bahwa asisten tetap menemukan barang walaupun saya salah ketik atau mempersingkat nama barangnya',
  'Saya merasa mencari tahu stok lewat asisten lebih praktis daripada cara yang biasa saya pakai',
  'Saya berencana akan memakai asisten ini untuk operasional sehari-hari toko',
];

function buatForm() {
  const stempel = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH.mm');
  const form = FormApp.create(JUDUL + ' ' + stempel);
  // Terbitkan dulu: di akun tertentu form baru belum terbit, dan menyalakan "terima jawaban" sebelum terbit bisa ditolak.
  if (typeof form.setPublished === 'function') form.setPublished(true);
  form
    .setTitle(JUDUL)
    .setDescription(
      // Lembar penjelasan sebelum persetujuan (informed consent).
      'Selamat pagi, Bapak/Ibu perwakilan dari Prima Motor Volvo\n\n' +
        'Saya Aldian Yohanes (NIM 535230139), mahasiswa Program Studi Teknik Informatika, Fakultas Teknologi Informasi, ' +
        'Universitas Tarumanagara. Saat ini saya sedang menyusun skripsi berjudul "Implementasi Arsitektur Multi-Agent ' +
        'untuk Sistem Manajemen Suku Cadang Otomotif Menggunakan WebLLM" di bawah bimbingan Viny Christanti Mawardi, M.Kom. ' +
        'dan Daniel Jahja Surjawan, M.T. Sebelum memutuskan untuk ikut serta, mohon Bapak/Ibu membaca penjelasan berikut.\n\n' +
        '1. Tujuan penelitian\n' +
        'Penelitian ini menguji apakah Stokgent, aplikasi pengelolaan stok yang dilengkapi asisten percakapan, ' +
        'mudah digunakan dan sesuai dengan kebutuhan pekerjaan di toko suku cadang.\n\n' +
        '2. Kegiatan yang dilakukan\n' +
        'Bapak/Ibu akan mengerjakan lima tugas singkat pada perangkat peneliti dengan didampingi peneliti. ' +
        'Setelah itu, Bapak/Ibu mengisi kuesioner ini mengenai hasil tugas, pendapat tentang aplikasi, ' +
        'dan pendapat tentang asisten chat. Seluruh kegiatan memerlukan waktu sekitar 20 menit.\n\n' +
        '3. Risiko\n' +
        'Tidak ada risiko yang berarti. Aplikasi uji memakai data barang tiruan, sehingga tidak mengubah data toko yang sebenarnya.\n\n' +
        '4. Kerahasiaan data\n' +
        'Formulir ini tidak mengumpulkan alamat email. Jawaban hanya digunakan untuk keperluan penelitian ini ' +
        'dan disajikan dengan kode peserta (misalnya P1). Nama pendek dan foto hanya dicantumkan di skripsi ' +
        'apabila Bapak/Ibu mengizinkannya pada halaman berikutnya.\n\n' +
        '5. Kesukarelaan\n' +
        'Keikutsertaan bersifat sukarela. Bapak/Ibu boleh menolak atau berhenti kapan saja tanpa perlu memberi alasan ' +
        'dan tanpa akibat apa pun.\n\n' +
        '6. Pertanyaan\n' +
        'Bila ada hal yang kurang jelas, Bapak/Ibu dapat bertanya langsung kepada peneliti yang mendampingi.\n\n' +
        'Pengujian ini menilai aplikasi, bukan kemampuan Bapak/Ibu, sehingga tidak ada jawaban yang benar atau salah. ' +
        'Atas kesediaan dan waktu yang Bapak/Ibu berikan, saya mengucapkan terima kasih.\n\n' +
        'Hormat saya,\n' +
        'Aldian Yohanes'
    )
    .setProgressBar(true)
    .setCollectEmail(false)
    .setLimitOneResponsePerUser(false) // true memaksa responden login Google
    .setAllowResponseEdits(false)
    .setShowLinkToRespondAgain(false)
    .setPublishingSummary(false)
    .setShuffleQuestions(false)
    .setAcceptingResponses(true)
    .setConfirmationMessage('Terima kasih, Bapak/Ibu. Jawaban sudah tersimpan.');

  // Nomor kolom di sheet jawaban: A = stempel waktu, lalu tiap pertanyaan satu kolom sesuai urutan dibuat.
  let kolomBerikut = 2;
  const kolom = {};
  const catat = (kunci) => {
    kolom[kunci] = kolomBerikut++;
  };

  // Halaman 1: persetujuan. "Tidak" langsung mengakhiri form.
  const setuju = form
    .addMultipleChoiceItem()
    .setTitle('Pernyataan persetujuan')
    .setHelpText(
      'Saya telah membaca dan memahami penjelasan di atas serta telah diberi kesempatan untuk bertanya. ' +
        'Saya mengerti bahwa keikutsertaan ini sukarela dan dapat saya hentikan kapan saja.'
    )
    .setRequired(true);
  setuju.setChoices([
    setuju.createChoice(SETUJU, FormApp.PageNavigationType.CONTINUE),
    setuju.createChoice(TIDAK_SETUJU, FormApp.PageNavigationType.SUBMIT),
  ]);
  catat('setuju');

  // Halaman 2: identitas. Form final tidak memuat pertanyaan izin nama dan izin foto.
  form
    .addPageBreakItem()
    .setTitle('Izin dan identitas')
    .setHelpText('Bagian ini untuk mengisi identitas nama dan peran di toko');
  form.addTextItem().setTitle('Nama').setRequired(true);
  catat('nama');
  const peran = form.addMultipleChoiceItem().setTitle('Peran di toko').setRequired(true);
  catat('peran');

  // Halaman 3 (pemilik) dan 4 (staf): uji coba. Pilihan peran menentukan halaman mana yang dibuka.
  const halamanPemilik = form.addPageBreakItem().setTitle('Uji Coba').setHelpText(PETUNJUK_TUGAS);
  TUGAS_PEMILIK.forEach(([judul, bantuan], i) => {
    pilihanGanda(form, judul, PILIHAN_TUGAS, bantuan);
    catat('pemilik' + (i + 1));
  });
  komentar(form, KOMENTAR_TUGAS);
  catat('komentarPemilik');

  const halamanStaf = form.addPageBreakItem().setTitle('Uji Coba').setHelpText(PETUNJUK_TUGAS);
  TUGAS_STAF.forEach(([judul, bantuan], i) => {
    pilihanGanda(form, judul, PILIHAN_TUGAS, bantuan);
    catat('staf' + (i + 1));
  });
  komentar(form, KOMENTAR_TUGAS);
  catat('komentarStaf');

  // Halaman 5: SUS.
  const halamanSus = form.addPageBreakItem().setTitle('Pendapat tentang aplikasi').setHelpText(PETUNJUK_SKALA);
  SOAL_SUS.forEach((soal, i) => {
    skala(form, soal);
    catat('S' + (i + 1));
  });

  // Halaman 6: asisten chat + komentar akhir.
  form.addPageBreakItem().setTitle('Pendapat tentang asisten chat').setHelpText(PETUNJUK_SKALA);
  SOAL_CHAT.forEach((soal, i) => {
    skala(form, soal);
    catat('C' + (i + 1));
  });
  komentar(form, 'Saran atau komentar lain tentang aplikasi ini');
  catat('komentarAkhir');

  // Percabangan baru bisa dipasang setelah halaman tujuannya ada.
  peran.setChoices([peran.createChoice('Pemilik', halamanPemilik), peran.createChoice('Staf', halamanStaf)]);
  halamanStaf.setGoToPage(halamanSus); // pemilik selesai halaman 3A langsung lompat ke SUS, melewati 3B

  const ss = SpreadsheetApp.create('Jawaban ' + JUDUL + ' ' + stempel);
  form.setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());

  // Link dicetak sebelum langkah yang bisa gagal, supaya form yang sudah jadi tetap bisa ditemukan.
  const linkResponden = form.getPublishedUrl();
  Logger.log('Link untuk responden: ' + linkResponden);
  Logger.log('Link edit form: ' + form.getEditUrl());
  Logger.log('Spreadsheet jawaban: ' + ss.getUrl());
  try {
    Logger.log('Link pendek (lebih mudah dijadikan QR): ' + form.shortenFormUrl(linkResponden));
  } catch (e) {
    Logger.log('Link pendek gagal dibuat, pakai link lengkap di atas.');
  }

  siapkanSheet(ss.getId(), kolom);
  Logger.log('Tab Rekap sudah diisi rumus.');
}

function pilihanGanda(form, judul, pilihan, bantuan) {
  const item = form.addMultipleChoiceItem().setTitle(judul).setChoiceValues(pilihan).setRequired(true);
  if (bantuan) item.setHelpText(bantuan);
  return item;
}

function skala(form, soal) {
  return form.addScaleItem().setTitle(soal).setBounds(1, 5).setLabels('Sangat tidak setuju', 'Sangat setuju').setRequired(true);
}

function komentar(form, judul) {
  return form.addParagraphTextItem().setTitle(judul).setHelpText('Boleh dikosongkan.').setRequired(false);
}

/** Ganti nama tab jawaban jadi "Jawaban", ubah tab kosong bawaan jadi "Rekap", lalu isi rumusnya. */
function siapkanSheet(ssId, kolom) {
  let ss;
  let tabJawaban;
  // Tab jawaban kadang baru muncul beberapa detik setelah form ditautkan.
  for (let coba = 0; coba < 15 && !tabJawaban; coba++) {
    SpreadsheetApp.flush();
    ss = SpreadsheetApp.openById(ssId);
    tabJawaban = ss.getSheets().find((s) => s.getFormUrl());
    if (!tabJawaban) Utilities.sleep(1000);
  }
  if (!tabJawaban) {
    throw new Error('Tab jawaban belum muncul. Form sudah jadi; jalankan buatForm lagi, atau isi Rekap manual pakai rekap-sus.md.');
  }
  tabJawaban.setName(NAMA_TAB_JAWABAN);

  const rekap = ss.getSheets().find((s) => !s.getFormUrl()) || ss.insertSheet();
  rekap.setName(NAMA_TAB_REKAP);
  ss.setActiveSheet(rekap);
  ss.moveActiveSheet(1);
  isiRekap(rekap, kolom);
}

function isiRekap(rekap, kolom) {
  const judulKolom = ['Kode (isi sendiri)', 'Nama', 'Peran', 'Skor SUS', BERHASIL, KURANG, GAGAL];
  for (let i = 1; i <= 10; i++) judulKolom.push('C' + i);
  rekap.getRange(1, 1, 1, judulKolom.length).setValues([judulKolom]).setFontWeight('bold');
  rekap.setFrozenRows(1);

  const baris = [];
  for (let r = 2; r < 2 + BARIS_REKAP; r++) baris.push(rumusBaris(kolom)); // rumusnya sama, ROW() yang membedakan baris
  rekap.getRange(2, 2, BARIS_REKAP, baris[0].length).setFormulas(baris);

  const barisRata = 2 + BARIS_REKAP + 1;
  rekap.getRange(barisRata, 1).setValue('Rata-rata').setFontWeight('bold');
  [4].concat(rentang(8, 17)).forEach((c) => {
    const huruf = hurufKolom(c);
    rekap.getRange(barisRata, c).setFormula(`=IFERROR(AVERAGE(${huruf}2:${huruf}${1 + BARIS_REKAP}),"")`);
  });
  rekap.getRange(2, 4, barisRata - 1, 1).setNumberFormat('0.0');
  rekap.getRange(barisRata, 8, 1, 10).setNumberFormat('0.00');
  rekap
    .getRange(barisRata + 2, 1)
    .setValue('Skor SUS: soal ganjil (jawaban − 1), soal genap (5 − jawaban), dijumlah lalu × 2,5. C1-C10 tidak masuk SUS.');
  rekap.autoResizeColumns(1, judulKolom.length);
}

/**
 * Rumus kolom B sampai Q untuk satu baris Rekap. Baris kosong atau responden yang menolak dibiarkan kosong.
 * Baris Rekap ke-n membaca baris ke-n tab Jawaban lewat INDEX + ROW(), bukan sel langsung seperti Jawaban!E2.
 * Sel langsung jadi #REF! kalau baris jawaban dihapus, dan bisa bergeser saat Google Form menyisipkan jawaban baru.
 */
function rumusBaris(kolom) {
  const huruf = (kunci) => hurufKolom(kolom[kunci]);
  const sel = (kunci) => `INDEX(${NAMA_TAB_JAWABAN}!${huruf(kunci)}:${huruf(kunci)},ROW())`;
  const deret = (awal, akhir) => `INDEX(${NAMA_TAB_JAWABAN}!${huruf(awal)}:${huruf(akhir)},ROW(),0)`;
  const ikut = `${sel('setuju')}="${SETUJU}"`;
  const jika = (isi) => `=IF(${ikut},${isi},"")`;
  const hitung = (nilai) =>
    `COUNTIF(${deret('pemilik1', 'pemilik5')},"${nilai}")+COUNTIF(${deret('staf1', 'staf5')},"${nilai}")`;
  return [
    jika(sel('nama')),
    jika(sel('peran')),
    jika(rumusSus(sel)),
    jika(hitung(BERHASIL)),
    jika(hitung(KURANG)),
    jika(hitung(GAGAL)),
  ].concat(rentang(1, 10).map((i) => jika(sel('C' + i))));
}

function rumusSus(sel) {
  const bagian = rentang(1, 10).map((i) => (i % 2 === 1 ? `(${sel('S' + i)}-1)` : `(5-${sel('S' + i)})`));
  return `(${bagian.join('+')})*2.5`;
}

function hurufKolom(n) {
  let s = '';
  while (n > 0) {
    const sisa = (n - 1) % 26;
    s = String.fromCharCode(65 + sisa) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function rentang(dari, sampai) {
  const hasil = [];
  for (let i = dari; i <= sampai; i++) hasil.push(i);
  return hasil;
}

/** Cek cepat fungsi bantu. Bisa dijalankan di Apps Script (pilih cekScript → Jalankan). */
function cekScript() {
  const sama = (a, b, pesan) => {
    if (a !== b) throw new Error(pesan + ': dapat ' + a + ', harusnya ' + b);
  };
  sama(hurufKolom(1), 'A', 'kolom 1');
  sama(hurufKolom(26), 'Z', 'kolom 26');
  sama(hurufKolom(27), 'AA', 'kolom 27');
  sama(hurufKolom(37), 'AK', 'kolom 37 (komentar akhir pada form final)');
  const sel = (k) => 'X' + k;
  sama(
    rumusSus(sel),
    '((XS1-1)+(5-XS2)+(XS3-1)+(5-XS4)+(XS5-1)+(5-XS6)+(XS7-1)+(5-XS8)+(XS9-1)+(5-XS10))*2.5',
    'rumus SUS'
  );
  sama(
    rumusBaris({ setuju: 2, nama: 3 })[0],
    `=IF(INDEX(Jawaban!B:B,ROW())="${SETUJU}",INDEX(Jawaban!C:C,ROW()),"")`,
    'rumus nama (harus lewat INDEX + ROW, bukan sel langsung)'
  );
  Logger.log('cekScript lulus');
}
