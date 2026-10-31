import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { Header, Icon, Sheet, MoneyInput, Empty, Field, Segmented, useLive } from '../components/ui.jsx';
import { Scanner } from '../components/Scanner.jsx';
import { ProductForm } from '../components/ProductForm.jsx';
import { db, checkout } from '../lib/db.js';
import { rp, num, toast, beep, confirmDialog, fmtTime, shareText } from '../lib/utils.js';
import { printReceipt, receiptText, effectiveMethod } from '../lib/printer.js';

const CART_KEY = 'pos.cart';
const HOLD_KEY = 'pos.held';
const load = (k, d) => {
  try {
    return JSON.parse(localStorage.getItem(k)) ?? d;
  } catch {
    return d;
  }
};

/** UPC-A (12 digit) dan EAN-13 berawalan 0 dianggap sama. */
async function lookupBarcode(code) {
  const c = String(code).trim();
  const variants = [c];
  if (/^\d{12}$/.test(c)) variants.push('0' + c);
  if (/^0\d{12}$/.test(c)) variants.push(c.slice(1));
  return db.products.where('barcode').anyOf(variants).first();
}

export function Kasir({ settings }) {
  const [cart, setCart] = useState(() => load(CART_KEY, []));
  const [held, setHeld] = useState(() => load(HOLD_KEY, []));
  const [q, setQ] = useState('');
  const [scanning, setScanning] = useState(false);
  const [paying, setPaying] = useState(false);
  const [done, setDone] = useState(null);
  const [editItem, setEditItem] = useState(null);
  const [newCode, setNewCode] = useState(null);
  const [showHeld, setShowHeld] = useState(false);
  const [flash, setFlash] = useState(null);
  const searchRef = useRef();

  useEffect(() => localStorage.setItem(CART_KEY, JSON.stringify(cart)), [cart]);
  useEffect(() => localStorage.setItem(HOLD_KEY, JSON.stringify(held)), [held]);

  const results = useLive(
    async () => {
      const s = q.trim().toLowerCase();
      if (!s) return [];
      const words = s.split(/\s+/);
      return db.products
        .filter((p) => p.barcode === s || words.every((w) => p.name.toLowerCase().includes(w) || (p.category || '').toLowerCase().includes(w)))
        .limit(30)
        .toArray();
    },
    [q],
    []
  );

  const totalQty = cart.reduce((a, i) => a + i.qty, 0);
  const subtotal = cart.reduce((a, i) => a + i.qty * i.price, 0);

  const addProduct = (p, qty = 1) => {
    if (!settings.allowNegativeStock) {
      const inCart = cart.find((i) => i.productId === p.id)?.qty || 0;
      if ((p.stock || 0) < inCart + qty) {
        toast(`Stok ${p.name} tinggal ${p.stock}`, 'err');
        return false;
      }
    }
    setCart((c) => {
      const idx = c.findIndex((i) => i.productId === p.id);
      if (idx >= 0) {
        const copy = [...c];
        const item = copy.splice(idx, 1)[0];
        return [{ ...item, qty: item.qty + qty }, ...copy];
      }
      return [{ productId: p.id, name: p.name, barcode: p.barcode, unit: p.unit, price: p.sellPrice, buyPrice: p.buyPrice, qty, stock: p.stock }, ...c];
    });
    setFlash(p.id);
    setTimeout(() => setFlash(null), 600);
    return true;
  };

  const onScan = async (code) => {
    const p = await lookupBarcode(code);
    if (p) {
      if (settings.scanBeep) beep();
      if (addProduct(p)) toast(`+1 ${p.name}`, 'ok', 1200);
    } else {
      if (navigator.vibrate) navigator.vibrate([80, 60, 80]);
      setScanning(false);
      const ok = await confirmDialog({ title: 'Barang belum terdaftar', text: `Barcode ${code} belum ada di daftar barang. Tambahkan sekarang?`, ok: 'Tambah Barang' });
      if (ok) setNewCode(code);
    }
  };

  const onSearchEnter = async (e) => {
    e.preventDefault();
    const s = q.trim();
    if (!s) return;
    // scanner USB/Bluetooth model keyboard juga didukung: ketik barcode + Enter
    const p = await lookupBarcode(s);
    if (p) {
      addProduct(p);
      setQ('');
      return;
    }
    if (results.length === 1) {
      addProduct(results[0]);
      setQ('');
    }
  };

  const setQty = (id, qty) => setCart((c) => (qty <= 0 ? c.filter((i) => i.productId !== id) : c.map((i) => (i.productId === id ? { ...i, qty } : i))));

  const clearCart = async () => {
    if (!cart.length) return;
    if (await confirmDialog({ title: 'Kosongkan keranjang?', ok: 'Kosongkan', danger: true })) setCart([]);
  };

  const holdCart = () => {
    if (!cart.length) return;
    setHeld((h) => [...h, { id: Date.now(), at: Date.now(), items: cart }]);
    setCart([]);
    toast('Transaksi ditunda');
  };

  const resume = (h) => {
    if (cart.length) setHeld((x) => [...x.filter((y) => y.id !== h.id), { id: Date.now(), at: Date.now(), items: cart }]);
    else setHeld((x) => x.filter((y) => y.id !== h.id));
    setCart(h.items);
    setShowHeld(false);
  };

  return (
    <div class="page kasir">
      <Header
        title={settings.storeName || 'Kasir'}
        actions={
          <>
            <button class="icon-btn light badge-wrap" onClick={() => setShowHeld(true)} aria-label="Transaksi ditunda">
              <Icon name="pause" />
              {held.length > 0 && <span class="badge">{held.length}</span>}
            </button>
          </>
        }
      />

      <form class="searchbar" onSubmit={onSearchEnter}>
        <div class="search-input">
          <Icon name="search" size={18} />
          <input ref={searchRef} type="search" placeholder="Cari nama / ketik barcode" value={q} onInput={(e) => setQ(e.currentTarget.value)} enterKeyHint="search" />
          {q && (
            <button type="button" class="clear" onClick={() => setQ('')} aria-label="Hapus pencarian">
              <Icon name="x" size={16} />
            </button>
          )}
        </div>
        <button type="button" class="btn primary scan-btn" onClick={() => setScanning(true)}>
          <Icon name="scan" /> Scan
        </button>
      </form>

      {q.trim() ? (
        <div class="list results">
          {results.length === 0 && (
            <Empty icon="search" title="Barang tidak ditemukan" text={`Tidak ada barang dengan kata "${q}".`}>
              <button class="btn secondary" onClick={() => setNewCode(/^\d{6,}$/.test(q.trim()) ? q.trim() : '')}>
                <Icon name="plus" /> Tambah barang baru
              </button>
            </Empty>
          )}
          {results.map((p) => (
            <button
              class="list-item tap"
              key={p.id}
              onClick={() => {
                if (addProduct(p)) {
                  setQ('');
                  toast(`+1 ${p.name}`, 'ok', 1000);
                }
              }}
            >
              <div class="grow">
                <div class="item-name">{p.name}</div>
                <div class="item-sub">
                  Stok {num(p.stock)} {p.unit} {p.category ? `· ${p.category}` : ''}
                </div>
              </div>
              <div class="item-price">{rp(p.sellPrice)}</div>
              <span class="add-dot">
                <Icon name="plus" size={18} />
              </span>
            </button>
          ))}
        </div>
      ) : cart.length === 0 ? (
        <Empty icon="cart" title="Keranjang masih kosong" text="Tekan tombol Scan lalu arahkan kamera ke barcode kemasan, atau cari barang lewat nama.">
          <button class="btn primary lg" onClick={() => setScanning(true)}>
            <Icon name="scan" /> Mulai Scan
          </button>
        </Empty>
      ) : (
        <div class="list cart">
          <div class="cart-head">
            <span>
              {cart.length} jenis · {num(totalQty)} item
            </span>
            <div class="row gap-s">
              <button class="link" onClick={holdCart}>
                Tunda
              </button>
              <button class="link danger-text" onClick={clearCart}>
                Kosongkan
              </button>
            </div>
          </div>
          {cart.map((i) => (
            <div class={`cart-item ${flash === i.productId ? 'flash' : ''}`} key={i.productId}>
              <button class="grow cart-info" onClick={() => setEditItem(i)}>
                <div class="item-name">{i.name}</div>
                <div class="item-sub">
                  {rp(i.price)} / {i.unit}
                </div>
                <div class="item-total">{rp(i.price * i.qty)}</div>
              </button>
              <div class="stepper">
                <button onClick={() => setQty(i.productId, i.qty - 1)} aria-label="Kurangi">
                  <Icon name={i.qty === 1 ? 'trash' : 'minus'} size={18} />
                </button>
                <span>{num(i.qty)}</span>
                <button onClick={() => setQty(i.productId, i.qty + 1)} aria-label="Tambah">
                  <Icon name="plus" size={18} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {cart.length > 0 && !q.trim() && (
        <div class="paybar">
          <div class="grow">
            <div class="muted small">Total ({num(totalQty)} item)</div>
            <div class="paybar-total">{rp(subtotal)}</div>
          </div>
          <button class="btn accent lg" onClick={() => setPaying(true)}>
            Bayar <Icon name="chevron" size={18} />
          </button>
        </div>
      )}

      {scanning && <Scanner continuous title="Scan barang" onDetected={onScan} onClose={() => setScanning(false)} />}

      {editItem && (
        <EditItem
          item={editItem}
          onClose={() => setEditItem(null)}
          onSave={(it) => {
            setCart((c) => (it.qty <= 0 ? c.filter((x) => x.productId !== it.productId) : c.map((x) => (x.productId === it.productId ? it : x))));
            setEditItem(null);
          }}
        />
      )}

      {newCode !== null && (
        <ProductForm
          initialBarcode={newCode}
          onClose={() => setNewCode(null)}
          onSaved={(p) => {
            addProduct(p);
            setQ('');
          }}
        />
      )}

      {paying && (
        <PaySheet
          cart={cart}
          subtotal={subtotal}
          settings={settings}
          onClose={() => setPaying(false)}
          onPaid={(sale) => {
            setPaying(false);
            setCart([]);
            setDone(sale);
            if (settings.autoPrint) printReceipt(sale, settings).catch((e) => toast(e.message, 'err', 4000));
          }}
        />
      )}

      {done && <DoneSheet sale={done} settings={settings} onClose={() => setDone(null)} />}

      {showHeld && (
        <Sheet title="Transaksi Ditunda" onClose={() => setShowHeld(false)}>
          {held.length === 0 && <Empty icon="pause" title="Tidak ada transaksi ditunda" text="Gunakan tombol Tunda di keranjang untuk melayani pembeli lain dulu." />}
          {held.map((h) => (
            <div class="list-item" key={h.id}>
              <div class="grow">
                <div class="item-name">
                  {h.items.length} jenis barang · {rp(h.items.reduce((a, i) => a + i.qty * i.price, 0))}
                </div>
                <div class="item-sub">
                  Ditunda {fmtTime(h.at)} · {h.items.map((i) => i.name).slice(0, 3).join(', ')}
                </div>
              </div>
              <button class="icon-btn danger-text" onClick={() => setHeld((x) => x.filter((y) => y.id !== h.id))} aria-label="Hapus">
                <Icon name="trash" size={18} />
              </button>
              <button class="btn secondary sm" onClick={() => resume(h)}>
                Lanjut
              </button>
            </div>
          ))}
        </Sheet>
      )}
    </div>
  );
}

function EditItem({ item, onClose, onSave }) {
  const [it, setIt] = useState(item);
  return (
    <Sheet
      title={item.name}
      onClose={onClose}
      footer={
        <div class="row gap">
          <button class="btn ghost danger-text" onClick={() => onSave({ ...it, qty: 0 })}>
            <Icon name="trash" /> Hapus
          </button>
          <button class="btn primary grow" onClick={() => onSave(it)}>
            Simpan
          </button>
        </div>
      }
    >
      <div class="form">
        <Field label={`Jumlah (${it.unit})`}>
          <div class="stepper big">
            <button onClick={() => setIt({ ...it, qty: Math.max(0, it.qty - 1) })} aria-label="Kurangi">
              <Icon name="minus" />
            </button>
            <input type="number" inputMode="decimal" value={it.qty} onInput={(e) => setIt({ ...it, qty: Number(e.currentTarget.value) || 0 })} onFocus={(e) => e.currentTarget.select()} />
            <button onClick={() => setIt({ ...it, qty: it.qty + 1 })} aria-label="Tambah">
              <Icon name="plus" />
            </button>
          </div>
        </Field>
        <Field label="Harga satuan" hint="Ubah harga hanya untuk transaksi ini (misal harga grosir / nego).">
          <MoneyInput value={it.price} onChange={(v) => setIt({ ...it, price: v })} />
        </Field>
        <div class="note">
          Subtotal: <b>{rp(it.price * it.qty)}</b>
        </div>
      </div>
    </Sheet>
  );
}

function quickCash(total) {
  const notes = [2000, 5000, 10000, 20000, 50000, 100000];
  const out = new Set([total]);
  for (const n of [1000, 5000, 10000, 50000, 100000]) {
    const r = Math.ceil(total / n) * n;
    if (r > total) out.add(r);
  }
  for (const n of notes) if (n > total) out.add(n);
  return [...out].sort((a, b) => a - b).slice(0, 6);
}

function PaySheet({ cart, subtotal, settings, onClose, onPaid }) {
  const [method, setMethod] = useState('tunai');
  const [discount, setDiscount] = useState(0);
  const [paid, setPaid] = useState(0);
  const [customer, setCustomer] = useState('');
  const [busy, setBusy] = useState(false);
  const tax = Math.round(((subtotal - discount) * (Number(settings.taxPercent) || 0)) / 100);
  const total = Math.max(0, subtotal - discount + tax);
  const change = paid - total;
  const quick = useMemo(() => quickCash(total), [total]);

  const canPay = method === 'tunai' ? paid >= total : method === 'kasbon' ? customer.trim().length > 0 : true;

  const submit = async () => {
    if (!canPay || busy) return;
    setBusy(true);
    try {
      const sale = await checkout({
        items: cart,
        discount,
        tax,
        paid: method === 'tunai' ? paid : method === 'kasbon' ? paid : total,
        method,
        customer: customer.trim(),
        cashier: settings.cashierName,
      });
      onPaid(sale);
    } catch (e) {
      toast('Gagal menyimpan transaksi: ' + e.message, 'err', 4000);
      setBusy(false);
    }
  };

  return (
    <Sheet
      title="Pembayaran"
      onClose={onClose}
      full
      footer={
        <button class="btn accent lg block" disabled={!canPay || busy} onClick={submit}>
          <Icon name="check" />{' '}
          {method === 'tunai'
            ? paid >= total
              ? `Selesai · Kembali ${rp(change)}`
              : `Kurang ${rp(total - paid)}`
            : method === 'kasbon'
              ? customer.trim()
                ? 'Simpan sebagai Kasbon'
                : 'Isi nama pelanggan'
              : `Konfirmasi ${rp(total)} diterima`}
        </button>
      }
    >
      <div class="pay-total">
        <div class="muted">Total belanja</div>
        <div class="big-money">{rp(total)}</div>
        {(discount > 0 || tax > 0) && (
          <div class="muted small">
            Subtotal {rp(subtotal)}
            {discount > 0 && ` · Diskon ${rp(discount)}`}
            {tax > 0 && ` · Pajak ${rp(tax)}`}
          </div>
        )}
      </div>

      <Segmented
        value={method}
        onChange={(m) => {
          setMethod(m);
          setPaid(0);
        }}
        options={[
          ['tunai', 'Tunai'],
          ['qris', 'QRIS'],
          ['transfer', 'Transfer'],
          ['kasbon', 'Kasbon'],
        ]}
      />

      <div class="form">
        {method === 'tunai' && (
          <>
            <Field label="Uang diterima">
              <MoneyInput value={paid} onChange={setPaid} autoFocus />
            </Field>
            <div class="chips">
              {quick.map((v) => (
                <button class={`chip ${paid === v ? 'active' : ''}`} onClick={() => setPaid(v)}>
                  {v === total ? 'Uang pas' : num(v)}
                </button>
              ))}
            </div>
            {paid > 0 && (
              <div class={`change ${change >= 0 ? 'good' : 'bad'}`}>
                <span>{change >= 0 ? 'Kembalian' : 'Kurang'}</span>
                <b>{rp(Math.abs(change))}</b>
              </div>
            )}
          </>
        )}
        {method === 'kasbon' && (
          <>
            <Field label="Nama pelanggan *">
              <input class="input" value={customer} onInput={(e) => setCustomer(e.currentTarget.value)} placeholder="Contoh: Bu Siti RT 03" />
            </Field>
            <Field label="Dibayar sekarang (DP)" hint="Kosongkan jika belum bayar sama sekali.">
              <MoneyInput value={paid} onChange={(v) => setPaid(Math.min(v, total))} />
            </Field>
            <div class="note bad">Sisa utang: {rp(total - paid)}</div>
          </>
        )}
        {(method === 'qris' || method === 'transfer') && <div class="note">Pastikan dana {rp(total)} sudah masuk sebelum konfirmasi.</div>}
        <Field label="Diskon (Rp)">
          <MoneyInput value={discount} onChange={(v) => setDiscount(Math.min(v, subtotal))} />
        </Field>
      </div>
    </Sheet>
  );
}

function DoneSheet({ sale, settings, onClose }) {
  const [printing, setPrinting] = useState(false);
  const doPrint = async (method) => {
    setPrinting(true);
    try {
      await printReceipt(sale, settings, method);
      if (['bluetooth', 'native'].includes(effectiveMethod(method || settings.printMethod))) toast('Nota dicetak');
    } catch (e) {
      if (e.name !== 'NotFoundError') toast(e.message || 'Gagal mencetak', 'err', 4500);
    }
    setPrinting(false);
  };
  const share = () => shareText(`Nota ${sale.no}`, receiptText(sale, settings));
  return (
    <Sheet title="Transaksi Berhasil" onClose={onClose}>
      <div class="done">
        <div class="done-icon">
          <Icon name="check" size={40} stroke={3} />
        </div>
        {sale.method === 'tunai' ? (
          <>
            <div class="muted">Kembalian</div>
            <div class="big-money">{rp(sale.change)}</div>
          </>
        ) : sale.method === 'kasbon' ? (
          <>
            <div class="muted">Kasbon {sale.customer}</div>
            <div class="big-money">{rp(sale.total - sale.paid)}</div>
          </>
        ) : (
          <>
            <div class="muted">Diterima via {sale.method.toUpperCase()}</div>
            <div class="big-money">{rp(sale.total)}</div>
          </>
        )}
        <div class="muted small">
          No. {sale.no} · Total {rp(sale.total)}
        </div>
        <pre class="receipt-preview">{receiptText(sale, settings)}</pre>
      </div>
      <div class="col gap">
        <button class="btn primary lg block" onClick={() => doPrint()} disabled={printing}>
          <Icon name="printer" /> {printing ? 'Mencetak...' : 'Cetak Nota'}
        </button>
        <div class="row gap">
          <button class="btn secondary grow" onClick={share}>
            <Icon name="share" /> Kirim Nota
          </button>
          <button class="btn ghost grow" onClick={onClose}>
            Transaksi Baru
          </button>
        </div>
      </div>
    </Sheet>
  );
}
