import { useState } from 'preact/hooks';
import { Header, Icon, Field, Segmented, Sheet, Empty, useLive } from '../components/ui.jsx';
import { db, saveSettings, exportAll, importAll, loadDemo, wipeAll, saveProduct, findByBarcode } from '../lib/db.js';
import { rp, toast, confirmDialog, download, toCSV, isoDate, parseNum } from '../lib/utils.js';
import { pairBluetooth, printTest, bluetoothSupported, connectedPrinterName, effectiveMethod } from '../lib/printer.js';
import { isNative, PosPrinter } from '../lib/native.js';

export function Menu({ go }) {
  const debt = useLive(async () => (await db.sales.where('status').equals('utang').toArray()).reduce((s, x) => s + x.total - (x.debtPaid || 0), 0), [], 0);
  const items = [
    ['transaksi', 'receipt', 'Riwayat Transaksi', 'Lihat, cetak ulang, atau batalkan nota'],
    ['kasbon', 'users', 'Kasbon Pelanggan', debt ? `Belum lunas ${rp(debt)}` : 'Catatan utang pelanggan'],
    ['kas', 'wallet', 'Buku Kas', 'Uang masuk, pengeluaran, saldo kas'],
    ['pengaturan', 'settings', 'Pengaturan & Printer', 'Info toko, printer nota, backup data'],
  ];
  return (
    <div class="page">
      <Header title="Menu" />
      <div class="list">
        {items.map(([k, icon, title, sub]) => (
          <button class="list-item tap menu-item" onClick={() => go(k)}>
            <span class="menu-icon">
              <Icon name={icon} />
            </span>
            <div class="grow">
              <div class="item-name">{title}</div>
              <div class="item-sub">{sub}</div>
            </div>
            <Icon name="chevron" size={18} />
          </button>
        ))}
      </div>
      <InstallHint />
      <div class="muted small center" style="margin:24px 0">Kasir Warung v1.0 · data tersimpan di HP ini, tanpa internet</div>
    </div>
  );
}

function InstallHint() {
  const standalone = isNative || window.matchMedia?.('(display-mode: standalone)').matches;
  const [prompt, setPrompt] = useState(() => window.__installPrompt);
  if (standalone) return null;
  return (
    <div class="card mx">
      <div class="card-title">Pasang sebagai aplikasi</div>
      <div class="muted small">Supaya muncul di layar utama dan bisa dibuka tanpa internet.</div>
      {prompt ? (
        <button
          class="btn primary block"
          style="margin-top:10px"
          onClick={async () => {
            prompt.prompt();
            await prompt.userChoice;
            window.__installPrompt = null;
            setPrompt(null);
          }}
        >
          <Icon name="download" /> Instal Aplikasi
        </button>
      ) : (
        <div class="small" style="margin-top:8px">
          Di Chrome: ketuk menu <b>⋮</b> lalu pilih <b>Instal aplikasi</b> / <b>Tambahkan ke layar utama</b>.
        </div>
      )}
    </div>
  );
}

export function Pengaturan({ settings, back }) {
  const [s, setS] = useState(settings);
  const [printer, setPrinter] = useState(connectedPrinterName());
  const [paired, setPaired] = useState(null);
  const method = effectiveMethod(s.printMethod);

  const choosePrinter = async () => {
    try {
      const { devices } = await PosPrinter.listPaired();
      setPaired(devices);
    } catch (e) {
      toast(e.message, 'err', 4500);
    }
  };
  const set = (k) => (v) => setS((x) => ({ ...x, [k]: v }));
  const dirty = JSON.stringify(s) !== JSON.stringify(settings);

  const save = async () => {
    await saveSettings(s);
    toast('Pengaturan disimpan');
  };

  const pair = async () => {
    try {
      const name = await pairBluetooth();
      setPrinter(name);
      toast(`Terhubung ke ${name}`);
    } catch (e) {
      if (e.name !== 'NotFoundError') toast(e.message, 'err', 4500);
    }
  };

  const test = async () => {
    try {
      await saveSettings(s);
      await printTest(s);
      setPrinter(connectedPrinterName());
    } catch (e) {
      if (e.name !== 'NotFoundError') toast(e.message, 'err', 4500);
    }
  };

  const backup = async () => {
    const data = await exportAll();
    download(`backup-kasir-${isoDate(Date.now())}.json`, JSON.stringify(data));
    localStorage.setItem('pos.lastBackup', String(Date.now()));
    toast('File backup diunduh');
  };

  const restore = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = async () => {
      const f = input.files[0];
      if (!f) return;
      try {
        const data = JSON.parse(await f.text());
        if (!(await confirmDialog({ title: 'Pulihkan data?', text: 'Semua data di HP ini akan diganti dengan isi file backup.', ok: 'Pulihkan', danger: true }))) return;
        await importAll(data);
        toast('Data berhasil dipulihkan');
        setTimeout(() => location.reload(), 800);
      } catch (e) {
        toast('Gagal: ' + e.message, 'err', 4000);
      }
    };
    input.click();
  };

  const exportProducts = async () => {
    const list = await db.products.orderBy('name').toArray();
    const rows = [['Barcode', 'Nama', 'Kategori', 'Satuan', 'Harga Beli', 'Harga Jual', 'Stok', 'Stok Minimum', 'Barcode Tambahan']];
    for (const p of list)
      rows.push([p.barcode?.startsWith('NB') ? '' : p.barcode, p.name, p.category, p.unit, p.buyPrice, p.sellPrice, p.stock, p.minStock, (p.altCodes || []).join(' | ')]);
    download(`daftar-barang-${isoDate(Date.now())}.csv`, toCSV(rows), 'text/csv');
  };

  const importProducts = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv,text/csv';
    input.onchange = async () => {
      const f = input.files[0];
      if (!f) return;
      const text = (await f.text()).replace(/^﻿/, '');
      const lines = text.split(/\r?\n/).filter((l) => l.trim());
      const sep = (lines[0].match(/;/g) || []).length >= (lines[0].match(/,/g) || []).length ? ';' : ',';
      const parse = (l) => {
        const out = [];
        let cur = '';
        let q = false;
        for (let i = 0; i < l.length; i++) {
          const ch = l[i];
          if (q) {
            if (ch === '"' && l[i + 1] === '"') (cur += '"'), i++;
            else if (ch === '"') q = false;
            else cur += ch;
          } else if (ch === '"') q = true;
          else if (ch === sep) out.push(cur), (cur = '');
          else cur += ch;
        }
        out.push(cur);
        return out.map((x) => x.trim());
      };
      let added = 0;
      let updated = 0;
      for (const l of lines.slice(1)) {
        const [barcode, name, category, unit, buy, sell, stock, min, alt] = parse(l);
        if (!name) continue;
        const altCodes = (alt || '').split('|').map((x) => x.trim()).filter(Boolean);
        const existing = barcode ? await findByBarcode(barcode) : null;
        if (existing) {
          await saveProduct({ ...existing, name, category, unit: unit || existing.unit, buyPrice: parseNum(buy), sellPrice: parseNum(sell), minStock: parseNum(min) || existing.minStock, altCodes: altCodes.length ? altCodes : existing.altCodes });
          updated++;
        } else {
          await saveProduct({ barcode, name, category, unit: unit || 'pcs', buyPrice: parseNum(buy), sellPrice: parseNum(sell), stock: parseNum(stock), minStock: parseNum(min) || s.lowStockDefault, altCodes });
          added++;
        }
      }
      toast(`${added} barang ditambahkan, ${updated} diperbarui`, 'ok', 3500);
    };
    input.click();
  };

  const lastBackup = Number(localStorage.getItem('pos.lastBackup') || 0);

  return (
    <div class="page">
      <Header title="Pengaturan" back={back} />
      <div class="pad col gap">
        <div class="card">
          <div class="card-title">Info toko (tampil di nota)</div>
          <div class="form">
            <Field label="Nama toko">
              <input class="input" value={s.storeName} onInput={(e) => set('storeName')(e.currentTarget.value)} />
            </Field>
            <Field label="Alamat">
              <input class="input" value={s.storeAddress} onInput={(e) => set('storeAddress')(e.currentTarget.value)} />
            </Field>
            <Field label="No. telepon / WA">
              <input class="input" inputMode="tel" value={s.storePhone} onInput={(e) => set('storePhone')(e.currentTarget.value)} />
            </Field>
            <Field label="Pesan di bawah nota">
              <input class="input" value={s.receiptFooter} onInput={(e) => set('receiptFooter')(e.currentTarget.value)} />
            </Field>
            <Field label="Nama kasir">
              <input class="input" value={s.cashierName} onInput={(e) => set('cashierName')(e.currentTarget.value)} />
            </Field>
          </div>
        </div>

        <div class="card">
          <div class="card-title">Printer nota</div>
          <div class="form">
            <Field label="Ukuran kertas">
              <Segmented
                value={Number(s.paperWidth)}
                onChange={set('paperWidth')}
                options={[
                  [32, '58 mm'],
                  [48, '80 mm'],
                ]}
              />
            </Field>
            <Field label="Cara mencetak">
              <div class="col gap-s">
                {(isNative
                  ? [
                      ['native', 'Printer Bluetooth', 'Untuk printer thermal Bluetooth. Pasangkan (pairing) printer dulu di Pengaturan Bluetooth HP, lalu pilih di sini.'],
                      ['rawbt', 'Lewat aplikasi RawBT', 'Cadangan jika printer tidak mau tersambung. Pasang "RawBT" dari Play Store.'],
                    ]
                  : [
                      ['bluetooth', 'Bluetooth langsung', 'Untuk printer thermal Bluetooth (BLE). Paling praktis di Chrome Android.'],
                      ['rawbt', 'Lewat aplikasi RawBT', 'Untuk semua printer Bluetooth/USB. Pasang "RawBT" dari Play Store, pasangkan printer di sana.'],
                      ['browser', 'Cetak / simpan PDF', 'Pakai dialog cetak bawaan HP (printer WiFi atau simpan PDF).'],
                    ]
                ).map(([v, t, d]) => (
                  <label class={`radio-card ${method === v ? 'active' : ''}`}>
                    <input type="radio" name="pm" checked={method === v} onChange={() => set('printMethod')(v)} />
                    <div>
                      <b>{t}</b>
                      <div class="muted small">{d}</div>
                    </div>
                  </label>
                ))}
              </div>
            </Field>
            {method === 'native' && (
              <div class="note">{s.printerName ? `Printer dipilih: ${s.printerName}` : 'Belum ada printer dipilih. Tekan "Pilih Printer".'}</div>
            )}
            {method === 'bluetooth' && (
              <div class="note">
                {!bluetoothSupported()
                  ? 'Browser ini belum mendukung Bluetooth. Buka di Chrome Android, atau pilih RawBT.'
                  : printer
                    ? `Terhubung: ${printer}`
                    : 'Nyalakan printer & Bluetooth HP, lalu tekan "Cari Printer".'}
              </div>
            )}
            <div class="row gap">
              {method === 'native' && (
                <button class="btn secondary grow" onClick={choosePrinter}>
                  <Icon name="bluetooth" /> Pilih Printer
                </button>
              )}
              {method === 'bluetooth' && (
                <button class="btn secondary grow" onClick={pair}>
                  <Icon name="bluetooth" /> Cari Printer
                </button>
              )}
              <button class="btn secondary grow" onClick={test}>
                <Icon name="printer" /> Tes Cetak
              </button>
            </div>
            <label class="check">
              <input type="checkbox" checked={s.autoPrint} onChange={(e) => set('autoPrint')(e.currentTarget.checked)} />
              Cetak nota otomatis setelah bayar
            </label>
          </div>
        </div>

        <div class="card">
          <div class="card-title">Kasir</div>
          <div class="form">
            <label class="check">
              <input type="checkbox" checked={s.scanBeep} onChange={(e) => set('scanBeep')(e.currentTarget.checked)} />
              Bunyi "bip" saat scan berhasil
            </label>
            <label class="check">
              <input type="checkbox" checked={s.scanQR} onChange={(e) => set('scanQR')(e.currentTarget.checked)} />
              Baca QR Code juga (matikan jika kemasan punya barcode garis + QR)
            </label>
            <label class="check">
              <input type="checkbox" checked={s.allowNegativeStock} onChange={(e) => set('allowNegativeStock')(e.currentTarget.checked)} />
              Boleh jual walau stok di aplikasi habis
            </label>
            <Field label="Pajak / PPN (%)" hint="Isi 0 jika tidak memungut pajak.">
              <input class="input" type="number" inputMode="decimal" value={s.taxPercent} onInput={(e) => set('taxPercent')(Number(e.currentTarget.value))} />
            </Field>
          </div>
        </div>

        {dirty && (
          <button class="btn accent lg block sticky-save" onClick={save}>
            Simpan Pengaturan
          </button>
        )}

        <div class="card">
          <div class="card-title">Data & backup</div>
          <div class="muted small">
            Data hanya tersimpan di HP ini. Rutin backup supaya aman jika HP rusak / ganti HP.
            {lastBackup ? ` Backup terakhir: ${new Date(lastBackup).toLocaleDateString('id-ID')}.` : ' Belum pernah backup.'}
          </div>
          <div class="grid2" style="margin-top:10px">
            <button class="btn secondary" onClick={backup}>
              <Icon name="download" /> Backup
            </button>
            <button class="btn secondary" onClick={restore}>
              <Icon name="upload" /> Pulihkan
            </button>
            <button class="btn secondary" onClick={exportProducts}>
              <Icon name="download" /> Ekspor Barang
            </button>
            <button class="btn secondary" onClick={importProducts}>
              <Icon name="upload" /> Impor Barang
            </button>
          </div>
          <div class="muted small" style="margin-top:8px">
            Format impor CSV (Excel): Barcode; Nama; Kategori; Satuan; Harga Beli; Harga Jual; Stok; Stok Minimum; Barcode Tambahan (pisahkan dengan |). Ekspor dulu untuk contoh formatnya.
          </div>
          <div class="grid2" style="margin-top:10px">
            <button
              class="btn ghost"
              onClick={async () => {
                await loadDemo();
                toast('Data contoh ditambahkan');
              }}
            >
              Isi data contoh
            </button>
            <button
              class="btn ghost danger-text"
              onClick={async () => {
                if (!(await confirmDialog({ title: 'Hapus semua data?', text: 'Barang, transaksi, stok, dan kas akan dihapus permanen. Backup dulu jika perlu.', ok: 'Hapus Semua', danger: true }))) return;
                await wipeAll();
                localStorage.removeItem('pos.cart');
                localStorage.removeItem('pos.held');
                toast('Semua data dihapus');
              }}
            >
              Hapus semua data
            </button>
          </div>
        </div>
      </div>
      {paired && (
        <Sheet title="Pilih Printer" onClose={() => setPaired(null)}>
          {paired.length === 0 && (
            <Empty icon="bluetooth" title="Belum ada perangkat dipasangkan" text="Buka Pengaturan HP > Bluetooth, nyalakan printer, lalu pasangkan (PIN biasanya 0000 atau 1234). Setelah itu kembali ke sini." />
          )}
          {paired.map((d) => (
            <button
              class={`list-item tap ${s.printerAddress === d.address ? 'sel' : ''}`}
              key={d.address}
              onClick={async () => {
                const next = { ...s, printerAddress: d.address, printerName: d.name, printMethod: 'native' };
                setS(next);
                await saveSettings({ printerAddress: d.address, printerName: d.name, printMethod: 'native' });
                setPaired(null);
                toast(`Printer ${d.name} dipilih`);
              }}
            >
              <span class="menu-icon">
                <Icon name="printer" />
              </span>
              <div class="grow">
                <div class="item-name">{d.name}</div>
                <div class="item-sub">{d.address}</div>
              </div>
              {s.printerAddress === d.address && <Icon name="check" />}
            </button>
          ))}
        </Sheet>
      )}
    </div>
  );
}
