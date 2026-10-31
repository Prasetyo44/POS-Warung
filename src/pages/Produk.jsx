import { useState } from 'preact/hooks';
import { Header, Icon, Empty, useLive } from '../components/ui.jsx';
import { ProductForm } from '../components/ProductForm.jsx';
import { Scanner } from '../components/Scanner.jsx';
import { db, findByBarcode, matchesCode } from '../lib/db.js';
import { rp, num, beep, toast } from '../lib/utils.js';

const PAGE = 60;

export function Produk() {
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState('name');
  const [limit, setLimit] = useState(PAGE);
  const [edit, setEdit] = useState(null);
  const [scan, setScan] = useState(false);

  const all = useLive(() => db.products.toArray(), [], null);
  if (!all) return <div class="page" />;

  const cats = [...new Set(all.map((p) => p.category).filter(Boolean))].sort();
  const s = q.trim().toLowerCase();
  const words = s.split(/\s+/).filter(Boolean);
  let list = all.filter(
    (p) =>
      (!cat || p.category === cat) &&
      (filter === 'all' || (filter === 'low' ? p.stock <= (p.minStock || 0) && p.stock > 0 : p.stock <= 0)) &&
      (!s || matchesCode(p, s) || words.every((w) => p.name.toLowerCase().includes(w)))
  );
  const sorters = {
    name: (a, b) => a.name.localeCompare(b.name),
    stock: (a, b) => a.stock - b.stock,
    price: (a, b) => b.sellPrice - a.sellPrice,
    new: (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0),
  };
  list = list.sort(sorters[sort]);
  const low = all.filter((p) => p.stock <= (p.minStock || 0) && p.stock > 0).length;
  const out = all.filter((p) => p.stock <= 0).length;
  const value = all.reduce((a, p) => a + Math.max(0, p.stock) * (p.buyPrice || 0), 0);

  const onScan = async (code) => {
    beep();
    setScan(false);
    const p = await findByBarcode(code);
    if (p) setEdit(p);
    else {
      toast('Barcode baru, silakan lengkapi data barang');
      setEdit({ __new: code });
    }
  };

  return (
    <div class="page">
      <Header
        title="Daftar Barang"
        actions={
          <button class="icon-btn light" onClick={() => setScan(true)} aria-label="Scan untuk cari / tambah">
            <Icon name="scan" />
          </button>
        }
      />
      <div class="stats3">
        <div class="stat">
          <b>{num(all.length)}</b>
          <span>Jenis barang</span>
        </div>
        <button class={`stat ${filter === 'low' ? 'sel' : ''}`} onClick={() => setFilter(filter === 'low' ? 'all' : 'low')}>
          <b class="warn">{low}</b>
          <span>Stok menipis</span>
        </button>
        <button class={`stat ${filter === 'out' ? 'sel' : ''}`} onClick={() => setFilter(filter === 'out' ? 'all' : 'out')}>
          <b class="bad">{out}</b>
          <span>Stok habis</span>
        </button>
      </div>
      <div class="muted small pad-x">Nilai stok (harga modal): {rp(value)}</div>

      <div class="searchbar">
        <div class="search-input">
          <Icon name="search" size={18} />
          <input type="search" placeholder="Cari barang..." value={q} onInput={(e) => setQ(e.currentTarget.value)} />
        </div>
        <select class="select" value={sort} onChange={(e) => setSort(e.currentTarget.value)} aria-label="Urutkan">
          <option value="name">A-Z</option>
          <option value="stock">Stok sedikit</option>
          <option value="price">Harga tinggi</option>
          <option value="new">Terbaru</option>
        </select>
      </div>
      {cats.length > 0 && (
        <div class="chips scroll pad-x">
          <button class={`chip ${!cat ? 'active' : ''}`} onClick={() => setCat('')}>
            Semua
          </button>
          {cats.map((c) => (
            <button class={`chip ${cat === c ? 'active' : ''}`} onClick={() => setCat(cat === c ? '' : c)}>
              {c}
            </button>
          ))}
        </div>
      )}

      <div class="list">
        {all.length === 0 && (
          <Empty icon="box" title="Belum ada barang" text="Tambahkan barang satu per satu dengan scan barcode kemasannya, atau isi data contoh di menu Pengaturan." />
        )}
        {all.length > 0 && list.length === 0 && <Empty icon="search" title="Tidak ada yang cocok" />}
        {list.slice(0, limit).map((p) => (
          <button class="list-item tap" key={p.id} onClick={() => setEdit(p)}>
            <div class="grow">
              <div class="item-name">{p.name}</div>
              <div class="item-sub">
                {p.barcode?.startsWith('NB') ? 'Tanpa barcode' : p.barcode}
                {p.category ? ` · ${p.category}` : ''}
              </div>
            </div>
            <div class="right">
              <div class="item-price">{rp(p.sellPrice)}</div>
              <span class={`stock-pill ${p.stock <= 0 ? 'bad' : p.stock <= (p.minStock || 0) ? 'warn' : ''}`}>
                {num(p.stock)} {p.unit}
              </span>
            </div>
          </button>
        ))}
        {list.length > limit && (
          <button class="btn ghost block" onClick={() => setLimit(limit + PAGE)}>
            Tampilkan lebih banyak ({list.length - limit} lagi)
          </button>
        )}
      </div>

      <button class="fab" onClick={() => setEdit({ __new: '' })} aria-label="Tambah barang">
        <Icon name="plus" size={28} />
      </button>

      {edit && <ProductForm product={edit.__new === undefined ? edit : null} initialBarcode={edit.__new || ''} onClose={() => setEdit(null)} />}
      {scan && <Scanner title="Scan untuk cari / tambah" onDetected={onScan} onClose={() => setScan(false)} />}
    </div>
  );
}
