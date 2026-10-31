import { useState } from 'preact/hooks';
import { Sheet, Field, MoneyInput, Icon, useLive } from './ui.jsx';
import { Scanner } from './Scanner.jsx';
import { db, saveProduct, deleteProduct } from '../lib/db.js';
import { toast, confirmDialog, rp, beep } from '../lib/utils.js';

const UNITS = ['pcs', 'bks', 'btl', 'dus', 'sachet', 'kg', 'gr', 'liter', 'butir', 'renceng', 'pak', 'lusin'];

export function ProductForm({ product, initialBarcode = '', onClose, onSaved }) {
  const [p, setP] = useState(() =>
    product
      ? { ...product, barcode: product.barcode?.startsWith('NB') ? '' : product.barcode }
      : { barcode: initialBarcode, altCodes: [], name: '', category: '', unit: 'pcs', buyPrice: 0, sellPrice: 0, stock: 0, minStock: 5 }
  );
  const [scan, setScan] = useState(false); // false | 'main' | 'alt'
  const [altInput, setAltInput] = useState('');
  const [busy, setBusy] = useState(false);
  const cats = useLive(async () => [...new Set((await db.products.orderBy('category').uniqueKeys()).filter(Boolean))], [], []);
  const set = (k) => (v) => setP((x) => ({ ...x, [k]: v }));
  const addAlt = (code) => {
    const c = String(code || '').trim();
    if (!c) return;
    if (c === (p.barcode || '').trim() || (p.altCodes || []).includes(c)) toast('Barcode itu sudah ada di barang ini', 'err');
    else setP((x) => ({ ...x, altCodes: [...(x.altCodes || []), c] }));
    setAltInput('');
  };
  const margin = p.sellPrice - p.buyPrice;
  const pct = p.buyPrice ? Math.round((margin / p.buyPrice) * 100) : 0;

  const save = async (e) => {
    e?.preventDefault();
    if (!p.name.trim()) return toast('Nama barang wajib diisi', 'err');
    if (!p.sellPrice) return toast('Harga jual wajib diisi', 'err');
    setBusy(true);
    try {
      for (const code of [p.barcode, ...(p.altCodes || [])].map((c) => (c || '').trim()).filter(Boolean)) {
        const dupe = await db.products.where('codes').equals(code).first();
        if (dupe && dupe.id !== p.id) {
          setBusy(false);
          return toast(`Barcode ${code} sudah dipakai "${dupe.name}"`, 'err', 3500);
        }
      }
      const id = await saveProduct(p);
      toast(product ? 'Barang diperbarui' : 'Barang ditambahkan');
      onSaved?.(await db.products.get(id));
      onClose();
    } catch (err) {
      toast('Gagal menyimpan: ' + err.message, 'err', 3500);
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!(await confirmDialog({ title: 'Hapus barang?', text: `"${product.name}" akan dihapus. Riwayat penjualan tetap tersimpan.`, ok: 'Hapus', danger: true }))) return;
    await deleteProduct(product.id);
    toast('Barang dihapus');
    onClose();
  };

  return (
    <Sheet
      title={product ? 'Ubah Barang' : 'Tambah Barang'}
      onClose={onClose}
      full
      footer={
        <div class="row gap">
          {product && (
            <button class="btn ghost danger-text" onClick={remove} type="button" aria-label="Hapus barang">
              <Icon name="trash" />
            </button>
          )}
          <button class="btn primary grow" onClick={save} disabled={busy}>
            Simpan
          </button>
        </div>
      }
    >
      <form onSubmit={save} class="form">
        <Field label="Barcode" hint="Kosongkan jika barang tidak punya barcode (dicari lewat nama).">
          <div class="row gap">
            <input class="input grow" inputMode="numeric" value={p.barcode} onInput={(e) => set('barcode')(e.currentTarget.value)} placeholder="Scan atau ketik" />
            <button type="button" class="btn secondary" onClick={() => setScan('main')} aria-label="Scan barcode">
              <Icon name="scan" />
            </button>
          </div>
        </Field>
        <Field label="Barcode tambahan" hint="Untuk barang dengan lebih dari satu kode: QR Code di kemasan, barcode lama/baru, atau varian kemasan dengan harga sama.">
          {(p.altCodes || []).length > 0 && (
            <div class="chips">
              {p.altCodes.map((c) => (
                <span class="chip code-chip">
                  {c.length > 24 ? c.slice(0, 22) + '…' : c}
                  <button type="button" aria-label={`Hapus ${c}`} onClick={() => set('altCodes')(p.altCodes.filter((x) => x !== c))}>
                    <Icon name="x" size={14} />
                  </button>
                </span>
              ))}
            </div>
          )}
          <div class="row gap">
            <input
              class="input grow"
              value={altInput}
              onInput={(e) => setAltInput(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addAlt(altInput);
                }
              }}
              placeholder="Ketik lalu tekan +"
            />
            <button type="button" class="btn ghost" onClick={() => addAlt(altInput)} aria-label="Tambah barcode">
              <Icon name="plus" />
            </button>
            <button type="button" class="btn secondary" onClick={() => setScan('alt')} aria-label="Scan barcode tambahan">
              <Icon name="scan" />
            </button>
          </div>
        </Field>
        <Field label="Nama barang *">
          <input class="input" value={p.name} onInput={(e) => set('name')(e.currentTarget.value)} placeholder="Contoh: Indomie Goreng" autoFocus={!!initialBarcode} />
        </Field>
        <div class="grid2">
          <Field label="Kategori">
            <input class="input" list="cats" value={p.category} onInput={(e) => set('category')(e.currentTarget.value)} placeholder="Sembako" />
            <datalist id="cats">
              {cats.map((c) => (
                <option value={c} />
              ))}
            </datalist>
          </Field>
          <Field label="Satuan">
            <input class="input" list="units" value={p.unit} onInput={(e) => set('unit')(e.currentTarget.value)} />
            <datalist id="units">
              {UNITS.map((u) => (
                <option value={u} />
              ))}
            </datalist>
          </Field>
        </div>
        <div class="grid2">
          <Field label="Harga beli (modal)">
            <MoneyInput value={p.buyPrice} onChange={set('buyPrice')} />
          </Field>
          <Field label="Harga jual *">
            <MoneyInput value={p.sellPrice} onChange={set('sellPrice')} />
          </Field>
        </div>
        {p.sellPrice > 0 && p.buyPrice > 0 && (
          <div class={`note ${margin < 0 ? 'bad' : 'good'}`}>
            Untung per {p.unit || 'pcs'}: <b>{rp(margin)}</b> ({pct}%)
          </div>
        )}
        <div class="grid2">
          {!product && (
            <Field label="Stok awal">
              <input class="input" type="number" inputMode="decimal" value={p.stock} onInput={(e) => set('stock')(Number(e.currentTarget.value))} />
            </Field>
          )}
          <Field label="Batas stok menipis">
            <input class="input" type="number" inputMode="numeric" value={p.minStock} onInput={(e) => set('minStock')(Number(e.currentTarget.value))} />
          </Field>
        </div>
        {product && <div class="muted small">Stok sekarang: {product.stock} {product.unit}. Ubah stok lewat menu Stok (barang masuk / opname).</div>}
        <button type="submit" hidden />
      </form>
      {scan && (
        <Scanner
          allowQR={scan === 'alt' ? true : undefined}
          title={scan === 'alt' ? 'Scan barcode tambahan' : 'Scan Barcode'}
          onClose={() => setScan(false)}
          onDetected={(code) => {
            beep();
            if (scan === 'alt') addAlt(code);
            else set('barcode')(code);
            setScan(false);
          }}
        />
      )}
    </Sheet>
  );
}
