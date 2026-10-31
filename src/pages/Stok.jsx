import { useState } from 'preact/hooks';
import { Header, Icon, Empty, Field, MoneyInput, Segmented, Sheet, useLive } from '../components/ui.jsx';
import { ProductPicker } from '../components/ProductPicker.jsx';
import { db, addPurchase, adjustStock } from '../lib/db.js';
import { rp, num, toast, fmtDateTime, confirmDialog } from '../lib/utils.js';

export function Stok() {
  const [tab, setTab] = useState('masuk');
  return (
    <div class="page">
      <Header title="Stok Barang" />
      <div class="pad-x">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            ['masuk', 'Barang Masuk'],
            ['opname', 'Stok Opname'],
            ['riwayat', 'Riwayat'],
          ]}
        />
      </div>
      {tab === 'masuk' && <BarangMasuk />}
      {tab === 'opname' && <Opname />}
      {tab === 'riwayat' && <Riwayat />}
    </div>
  );
}

function BarangMasuk() {
  const [items, setItems] = useState([]);
  const [supplier, setSupplier] = useState('');
  const [fromCash, setFromCash] = useState(true);
  const [busy, setBusy] = useState(false);
  const total = items.reduce((a, i) => a + i.qty * i.buyPrice, 0);
  const suppliers = useLive(async () => [...new Set((await db.purchases.toArray()).map((p) => p.supplier).filter(Boolean))], [], []);

  const add = (p) =>
    setItems((list) => {
      const i = list.findIndex((x) => x.productId === p.id);
      if (i >= 0) return list.map((x, k) => (k === i ? { ...x, qty: x.qty + 1 } : x));
      return [{ productId: p.id, name: p.name, unit: p.unit, qty: 1, buyPrice: p.buyPrice || 0, sellPrice: p.sellPrice, oldSell: p.sellPrice }, ...list];
    });
  const upd = (id, k, v) => setItems((l) => l.map((x) => (x.productId === id ? { ...x, [k]: v } : x)));

  const save = async () => {
    if (!items.length) return;
    if (items.some((i) => !(i.qty > 0))) return toast('Jumlah barang harus lebih dari 0', 'err');
    setBusy(true);
    await addPurchase({
      supplier: supplier.trim(),
      paidFromCash: fromCash,
      items: items.map((i) => ({ productId: i.productId, qty: i.qty, buyPrice: i.buyPrice, sellPrice: i.sellPrice !== i.oldSell ? i.sellPrice : undefined })),
    });
    toast(`Stok ${items.length} barang bertambah`);
    setItems([]);
    setSupplier('');
    setBusy(false);
  };

  return (
    <div class="pad">
      <div class="note">Catat belanja stok dari supplier / grosir. Stok bertambah dan harga modal diperbarui otomatis.</div>
      <ProductPicker onPick={add} />
      {items.length === 0 ? (
        <Empty icon="layers" title="Belum ada barang" text="Scan barcode atau cari barang yang baru datang." />
      ) : (
        <div class="col gap">
          {items.map((i) => (
            <div class="card" key={i.productId}>
              <div class="row">
                <div class="item-name grow">{i.name}</div>
                <button class="icon-btn danger-text" onClick={() => setItems((l) => l.filter((x) => x.productId !== i.productId))} aria-label="Hapus">
                  <Icon name="trash" size={18} />
                </button>
              </div>
              <div class="grid3">
                <Field label={`Jumlah (${i.unit})`}>
                  <input class="input" type="number" inputMode="decimal" value={i.qty} onInput={(e) => upd(i.productId, 'qty', Number(e.currentTarget.value))} onFocus={(e) => e.currentTarget.select()} />
                </Field>
                <Field label="Modal / satuan">
                  <MoneyInput value={i.buyPrice} onChange={(v) => upd(i.productId, 'buyPrice', v)} />
                </Field>
                <Field label="Harga jual">
                  <MoneyInput value={i.sellPrice} onChange={(v) => upd(i.productId, 'sellPrice', v)} />
                </Field>
              </div>
              <div class="muted small">Subtotal {rp(i.qty * i.buyPrice)}</div>
            </div>
          ))}
          <Field label="Supplier (opsional)">
            <input class="input" list="suppliers" value={supplier} onInput={(e) => setSupplier(e.currentTarget.value)} placeholder="Contoh: Grosir Makmur" />
            <datalist id="suppliers">
              {suppliers.map((s) => (
                <option value={s} />
              ))}
            </datalist>
          </Field>
          <label class="check">
            <input type="checkbox" checked={fromCash} onChange={(e) => setFromCash(e.currentTarget.checked)} />
            Dibayar dari kas toko (dicatat sebagai pengeluaran)
          </label>
          <button class="btn accent lg block" onClick={save} disabled={busy}>
            Simpan Barang Masuk · {rp(total)}
          </button>
        </div>
      )}
    </div>
  );
}

function Opname() {
  const [sel, setSel] = useState(null);
  const [count, setCount] = useState('');
  const [note, setNote] = useState('');

  const save = async () => {
    const n = Number(count);
    if (count === '' || isNaN(n)) return toast('Isi jumlah stok fisik', 'err');
    const diff = n - sel.stock;
    if (diff !== 0 && !(await confirmDialog({ title: 'Simpan stok opname?', text: `${sel.name}: ${num(sel.stock)} → ${num(n)} (${diff > 0 ? '+' : ''}${num(diff)})`, ok: 'Simpan' }))) return;
    await adjustStock(sel.id, n, note);
    toast(diff === 0 ? 'Stok sudah sesuai' : 'Stok diperbarui');
    setSel(null);
    setCount('');
    setNote('');
  };

  return (
    <div class="pad">
      <div class="note">Cocokkan stok di aplikasi dengan jumlah barang di rak. Selisih tercatat di riwayat.</div>
      <ProductPicker
        onPick={(p) => {
          setSel(p);
          setCount('');
        }}
      />
      {!sel && <LowStockList onPick={setSel} />}
      {sel && (
        <Sheet
          title={sel.name}
          onClose={() => setSel(null)}
          footer={
            <button class="btn primary block lg" onClick={save}>
              Simpan
            </button>
          }
        >
          <div class="form">
            <div class="note">
              Stok di aplikasi: <b>{num(sel.stock)} {sel.unit}</b>
            </div>
            <Field label="Stok fisik (hasil hitung)">
              <input class="input" type="number" inputMode="decimal" value={count} onInput={(e) => setCount(e.currentTarget.value)} autoFocus />
            </Field>
            {count !== '' && (
              <div class={`note ${Number(count) - sel.stock < 0 ? 'bad' : 'good'}`}>
                Selisih: {Number(count) - sel.stock > 0 ? '+' : ''}
                {num(Number(count) - sel.stock)} {sel.unit}
              </div>
            )}
            <Field label="Catatan (opsional)">
              <input class="input" value={note} onInput={(e) => setNote(e.currentTarget.value)} placeholder="Rusak, kadaluarsa, hilang..." />
            </Field>
          </div>
        </Sheet>
      )}
    </div>
  );
}

function LowStockList({ onPick }) {
  const low = useLive(() => db.products.filter((p) => p.stock <= (p.minStock || 0)).toArray(), [], []);
  if (!low.length) return null;
  return (
    <>
      <div class="section-title">Perlu dicek / dibelanjakan ({low.length})</div>
      <div class="list flush">
        {low
          .sort((a, b) => a.stock - b.stock)
          .map((p) => (
            <button class="list-item tap" key={p.id} onClick={() => onPick(p)}>
              <div class="grow">
                <div class="item-name">{p.name}</div>
                <div class="item-sub">Batas minimum {p.minStock}</div>
              </div>
              <span class={`stock-pill ${p.stock <= 0 ? 'bad' : 'warn'}`}>
                {num(p.stock)} {p.unit}
              </span>
            </button>
          ))}
      </div>
    </>
  );
}

const TYPE = { jual: 'Terjual', masuk: 'Barang masuk', opname: 'Opname', batal: 'Batal jual', awal: 'Stok awal' };

function Riwayat() {
  const [limit, setLimit] = useState(100);
  const moves = useLive(async () => {
    const list = await db.stockMoves.orderBy('date').reverse().limit(limit).toArray();
    const ids = [...new Set(list.map((m) => m.productId))];
    const prods = await db.products.bulkGet(ids);
    const map = Object.fromEntries(prods.filter(Boolean).map((p) => [p.id, p]));
    return list.map((m) => ({ ...m, p: map[m.productId] }));
  }, [limit], null);
  if (!moves) return null;
  if (!moves.length) return <Empty icon="history" title="Belum ada riwayat stok" />;
  return (
    <div class="list">
      {moves.map((m) => (
        <div class="list-item" key={m.id}>
          <div class="grow">
            <div class="item-name">{m.p?.name || '(barang dihapus)'}</div>
            <div class="item-sub">
              {TYPE[m.type] || m.type} · {m.ref} · {fmtDateTime(m.date)}
              {m.note ? ` · ${m.note}` : ''}
            </div>
          </div>
          <b class={m.qty < 0 ? 'bad' : 'good'}>
            {m.qty > 0 ? '+' : ''}
            {num(m.qty)}
          </b>
        </div>
      ))}
      {moves.length >= limit && (
        <button class="btn ghost block" onClick={() => setLimit(limit + 100)}>
          Muat lebih banyak
        </button>
      )}
    </div>
  );
}
