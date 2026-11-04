# Fitur POS — Prima Motor Volvo

Kondisi terkini modul kasir. Riwayat pengembangan per putaran (alasan tiap perubahan, temuan audit) ada di `docs/pos-changelog.md`; audit UX kasir di `docs/ux-audit-pos.md`.

## Halaman

| Rute | Isi |
|---|---|
| `/pos` | terminal kasir layar penuh: cari produk (keyboard dan scanner barcode), keranjang, diskon per nota, metode bayar tunggal atau terpisah, pelanggan piutang, tahan transaksi, shift, struk |
| `/admin/pos/sales` | riwayat penjualan, detail nota, void, klaim garansi per item |
| `/admin/pos/shifts` | riwayat shift semua kasir, laporan X/Z |
| `/admin/pos/customers` | pelanggan piutang, saldo, pelunasan |

## Database (migrasi 0025–0030, dijalankan berurutan)

| Migrasi | Isi |
|---|---|
| `0025_pos_sales.sql` | tabel `sales`, `sale_items`; RPC `record_sale` (checkout atomik, kunci stok terurut, idempotency key) dan `void_sale` (kembalikan stok lewat transaksi `retur`) |
| `0026_pos_security_hardening.sql` | harga selalu diambil dari `products.selling_price` di dalam RPC; nomor nota `INV/<tahun>/<urut>` per tenant; void maksimal 24 jam untuk admin, owner kapan saja |
| `0027_pos_cashier_workflow.sql` | `sale_payments` (bayar terpisah), `customers` + `customer_payments` (piutang dengan `credit_limit`) |
| `0028_pos_warranty_claims.sql` | `products.warranty_days`, `warranty_claims`, RPC `claim_warranty_return` |
| `0029_pos_shifts.sql` | tabel `shifts` (laporan X/Z berbasis rentang waktu) |
| `0030_pos_audit_fixes.sql` | validasi `customer_id` milik tenant untuk semua metode bayar; pesan error kelebihan bayar dipisah |

## Aturan yang perlu diketahui

- **Harga tidak pernah dipercaya dari client.** Route checkout tidak menerima `unit_price`; RPC membaca harga dari tabel produk.
- **Checkout** boleh untuk role staf biasa. **Void** hanya admin/owner, wajib konfirmasi ulang PIN.
- **Kembalian** hanya untuk bayar tunai tunggal. Bayar terpisah harus pas; kelebihan bayar non-tunai ditolak.
- **Piutang** hanya untuk pelanggan dengan `credit_limit` lebih dari 0 (default 0, harus diatur admin/owner).
- **Klaim garansi** terpisah dari void: menangani satu item dalam masa garansi, mengembalikan stok untuk resolusi `replaced`/`refunded`, tidak menyentuh pembayaran. Pengembalian uang untuk `refunded` dilakukan manual di luar sistem.
- **Shift** opsional, bukan syarat checkout. Shift yang sudah ditutup terkunci; tidak ada endpoint buka ulang. Karena berbasis waktu, void di shift yang berbeda dari shift pembuatan nota bisa membuat rekonsiliasi kas shift sedikit meleset.
- **Transaksi yang ditahan** disimpan di memori komponen dan hilang saat halaman dimuat ulang.
- **Struk** dicetak lewat `window.print()` dengan tata letak 58 mm / 80 mm untuk printer thermal yang terpasang sebagai printer biasa. Belum ada ESC/POS langsung (WebUSB/WebSerial).

## Belum ada

- Diskon per item (kolom `sale_items.discount_amount` sudah ada, frontend selalu mengirim 0).
- Input pajak di kasir (kolom `tax_amount` sudah ada di skema dan RPC).
- Laporan penjualan harian/bulanan khusus POS selain grafik di dashboard admin.
- Pengujian dengan scanner barcode dan printer thermal fisik.

## Test

RLS tabel POS: `supabase/tests/rls_pos.test.sql` (pgTAP). Test unit: `bunx vitest run`.
