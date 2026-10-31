import { useState } from 'preact/hooks';
import { Icon, useLive } from './ui.jsx';
import { Scanner } from './Scanner.jsx';
import { ProductForm } from './ProductForm.jsx';
import { db, findByBarcode, matchesCode } from '../lib/db.js';
import { rp, num, beep, toast } from '../lib/utils.js';

/** Cari barang lewat nama atau scan barcode, lalu panggil onPick(product). */
export function ProductPicker({ onPick, placeholder = 'Cari / scan barang' }) {
  const [q, setQ] = useState('');
  const [scan, setScan] = useState(false);
  const [newCode, setNewCode] = useState(null);
  const results = useLive(
    async () => {
      const s = q.trim().toLowerCase();
      if (!s) return [];
      const words = s.split(/\s+/);
      return db.products.filter((p) => matchesCode(p, s) || words.every((w) => p.name.toLowerCase().includes(w))).limit(20).toArray();
    },
    [q],
    []
  );

  const pick = (p) => {
    onPick(p);
    setQ('');
  };

  const onScan = async (code) => {
    beep();
    setScan(false);
    const p = await findByBarcode(code);
    if (p) pick(p);
    else {
      toast('Barcode belum terdaftar, lengkapi data barang');
      setNewCode(code);
    }
  };

  return (
    <div class="picker">
      <div class="searchbar flush">
        <div class="search-input">
          <Icon name="search" size={18} />
          <input type="search" placeholder={placeholder} value={q} onInput={(e) => setQ(e.currentTarget.value)} />
        </div>
        <button type="button" class="btn primary scan-btn" onClick={() => setScan(true)} aria-label="Scan">
          <Icon name="scan" />
        </button>
      </div>
      {q.trim() && (
        <div class="picker-results">
          {results.length === 0 && (
            <button class="list-item tap" onClick={() => setNewCode('')}>
              <Icon name="plus" /> <span class="grow">Barang tidak ada. Tambah barang baru</span>
            </button>
          )}
          {results.map((p) => (
            <button class="list-item tap" key={p.id} onClick={() => pick(p)}>
              <div class="grow">
                <div class="item-name">{p.name}</div>
                <div class="item-sub">
                  Stok {num(p.stock)} {p.unit} · modal {rp(p.buyPrice)}
                </div>
              </div>
              <Icon name="plus" />
            </button>
          ))}
        </div>
      )}
      {scan && <Scanner onDetected={onScan} onClose={() => setScan(false)} />}
      {newCode !== null && <ProductForm initialBarcode={newCode} onClose={() => setNewCode(null)} onSaved={pick} />}
    </div>
  );
}
