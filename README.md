# Kasir Warung – POS Offline untuk HP Android

Aplikasi kasir (Point of Sale) untuk warung, toko kelontong, dan minimarket kecil. Berjalan **100% offline** di HP Android, scan barcode kemasan langsung **pakai kamera HP** (tanpa alat scanner), dan bisa **cetak nota** ke printer thermal Bluetooth 58mm / 80mm.

**Buka & instal:** https://prasetyo44.github.io/POS-Warung/

## Fitur

**Kasir**
- Scan barcode kemasan pakai kamera belakang HP (EAN-13, EAN-8, UPC, Code 128, Code 39, QR), mode scan beruntun dengan bunyi bip + getar, tombol senter
- Cari barang lewat nama untuk barang tanpa barcode
- Keranjang otomatis terhitung: ubah jumlah, ubah harga per transaksi (harga grosir / nego), hapus
- Pembayaran Tunai (tombol uang pas / pecahan cepat + kembalian otomatis), QRIS, Transfer, dan **Kasbon** (utang pelanggan, bisa DP)
- Diskon per transaksi dan pajak/PPN opsional
- **Tunda transaksi** untuk melayani pembeli lain dulu
- Scan barcode yang belum terdaftar langsung bisa ditambahkan sebagai barang baru
- Mendukung scanner USB/Bluetooth model keyboard (ketik barcode + Enter)

**Cetak nota**
- Bluetooth langsung dari Chrome Android (printer thermal BLE, perintah ESC/POS)
- Lewat aplikasi **RawBT** (gratis di Play Store) untuk semua printer Bluetooth klasik / USB
- Cetak lewat dialog print / simpan PDF
- Cetak ulang nota, kirim nota lewat WhatsApp / aplikasi lain, cetak otomatis setelah bayar

**Barang & stok**
- Data barang: barcode, nama, kategori, satuan, harga modal, harga jual, untung per item, batas stok minimum
- Filter stok menipis / habis, nilai stok total
- **Barang masuk** dari supplier (stok bertambah, harga modal diperbarui, tercatat sebagai pengeluaran kas)
- **Stok opname** (sesuaikan stok dengan hitungan fisik)
- Riwayat pergerakan stok lengkap
- Impor / ekspor daftar barang dari file CSV (Excel)

**Pembukuan**
- Laporan omzet, laba kotor, laba bersih, rata-rata transaksi, belanja stok
- Grafik penjualan per jam / per hari, barang terlaris, ringkasan per metode bayar
- Periode: hari ini, kemarin, minggu ini, bulan ini, bulan lalu, atau tanggal bebas
- Buku kas: uang masuk, pengeluaran (listrik, gaji, sewa, ambil pribadi, dll), saldo kas
- Daftar kasbon per pelanggan + pelunasan bertahap
- Riwayat transaksi, batalkan transaksi (stok & kas otomatis dikoreksi)
- Ekspor laporan ke CSV (dibuka di Excel / Google Sheets)

**Data**
- Semua data tersimpan di HP (IndexedDB), tidak butuh internet / server
- Backup & pulihkan data ke file (untuk ganti HP)

## Cara memasang di HP Android

1. Buka https://prasetyo44.github.io/POS-Warung/ di **Google Chrome**
2. Ketuk menu **⋮** → **Instal aplikasi** (atau **Tambahkan ke layar utama**)
3. Ikon **Kasir Warung** muncul di layar utama. Setelah dibuka sekali, aplikasi jalan tanpa internet.
4. Saat pertama scan, izinkan akses **Kamera**.

## Cara menyambungkan printer thermal

- **Bluetooth langsung:** Menu → Pengaturan & Printer → pilih "Bluetooth langsung" → nyalakan printer → **Cari Printer** → pilih nama printer → **Tes Cetak**.
- **RawBT (jika printer tidak muncul):** pasang aplikasi *RawBT* dari Play Store, pasangkan printer di aplikasi itu, lalu di Kasir Warung pilih "Lewat aplikasi RawBT".

## Pengembangan

```bash
npm install
npm run dev      # server pengembangan
npm run build    # hasil build di folder dist/
```

Dibangun dengan Preact, Dexie (IndexedDB), dan ZXing. Setiap push ke `main` otomatis di-build dan dipublikasikan ke GitHub Pages (branch `gh-pages`) oleh GitHub Actions.
