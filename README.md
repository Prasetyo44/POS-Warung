# Kasir Warung – POS Offline untuk HP Android

Aplikasi kasir (Point of Sale) untuk warung, toko kelontong, dan minimarket kecil. Berjalan **100% offline** di HP Android, scan barcode kemasan langsung **pakai kamera HP** (tanpa alat scanner), dan bisa **cetak nota** ke printer thermal Bluetooth 58mm / 80mm.

**Unduh APK Android:** https://github.com/Prasetyo44/POS-Warung/releases/latest
**Versi web (tanpa instal APK):** https://prasetyo44.github.io/POS-Warung/

## Fitur

**Kasir**
- Scan barcode kemasan pakai kamera belakang HP (EAN-13, EAN-8, UPC, Code 128, Code 39, QR), mode scan beruntun dengan bunyi bip + getar, tombol senter
- Cari barang lewat nama untuk barang tanpa barcode
- Keranjang otomatis terhitung: ubah jumlah, ubah harga per transaksi (harga grosir / nego), hapus
- Pembayaran Tunai (tombol uang pas / pecahan cepat + kembalian otomatis), QRIS, Transfer, dan **Kasbon** (utang pelanggan, bisa DP)
- Diskon per transaksi dan pajak/PPN opsional
- **Tunda transaksi** untuk melayani pembeli lain dulu
- Scan barcode yang belum terdaftar langsung bisa ditambahkan sebagai barang baru
- Kemasan dengan barcode garis + QR Code: barcode garis (EAN/UPC) selalu diutamakan, QR Code bawaannya tidak dibaca (bisa dinyalakan di Pengaturan)
- Satu barang bisa punya beberapa barcode (barcode tambahan), misalnya QR Code kemasan atau barcode kemasan lama/baru
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

## Cara memasang APK di HP Android

1. Buka https://github.com/Prasetyo44/POS-Warung/releases/latest di HP
2. Di bagian **Assets**, ketuk file `KasirWarung-v1.0.x.apk` untuk mengunduh
3. Buka file yang terunduh. Jika muncul peringatan, izinkan **Instal aplikasi tidak dikenal** untuk Chrome / File Manager
4. Buka **Kasir Warung**, izinkan **Kamera** saat pertama scan dan **Perangkat sekitar** (Bluetooth) saat memilih printer

Setiap perubahan kode di branch `main` otomatis membuat APK baru di halaman Releases.

### Kunci tanda tangan APK (agar update bisa menimpa versi lama)

Tanpa pengaturan ini, APK ditandatangani dengan kunci sementara, sehingga untuk memasang versi baru aplikasi lama harus dihapus dulu (lakukan **Backup** data sebelumnya). Untuk kunci permanen, buat keystore lalu isi di *Settings → Secrets and variables → Actions*:

- `ANDROID_KEYSTORE_BASE64`: isi file `.jks` dalam format base64
- `ANDROID_KEYSTORE_PASSWORD`: password keystore
- `ANDROID_KEY_ALIAS`: alias kunci

## Cara memasang versi web di HP Android

1. Buka https://prasetyo44.github.io/POS-Warung/ di **Google Chrome**
2. Ketuk menu **⋮** → **Instal aplikasi** (atau **Tambahkan ke layar utama**)
3. Ikon **Kasir Warung** muncul di layar utama. Setelah dibuka sekali, aplikasi jalan tanpa internet.
4. Saat pertama scan, izinkan akses **Kamera**.

## Cara menyambungkan printer thermal

- **APK (disarankan):** pasangkan printer di Pengaturan HP → Bluetooth (PIN biasanya 0000 atau 1234). Lalu di Kasir Warung buka Menu → Pengaturan & Printer → **Pilih Printer** → **Tes Cetak**.
- **Bluetooth langsung:** Menu → Pengaturan & Printer → pilih "Bluetooth langsung" → nyalakan printer → **Cari Printer** → pilih nama printer → **Tes Cetak**.
- **RawBT (jika printer tidak muncul):** pasang aplikasi *RawBT* dari Play Store, pasangkan printer di aplikasi itu, lalu di Kasir Warung pilih "Lewat aplikasi RawBT".

## Pengembangan

```bash
npm install
npm run dev      # server pengembangan
npm run build    # hasil build di folder dist/
```

Dibangun dengan Preact, Dexie (IndexedDB), ZXing, dan Capacitor (APK Android, folder `android/`). Plugin printer native ada di `android/app/src/main/java/id/warung/kasir/PosPrinterPlugin.java`. Setiap push ke `main` otomatis di-build dan dipublikasikan ke GitHub Pages (branch `gh-pages`) oleh GitHub Actions.
