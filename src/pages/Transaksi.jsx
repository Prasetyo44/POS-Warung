import { useState } from 'preact/hooks';
import { Header, Icon, Empty, Sheet, Field, MoneyInput, useLive } from '../components/ui.jsx';
import { PeriodPicker, usePeriod } from './Laporan.jsx';
import { db, voidSale, payDebt } from '../lib/db.js';
import { rp, num, fmtDateTime, fmtTime, fmtDay, startOfDay, toast, confirmDialog, shareText } from '../lib/utils.js';
import { printReceipt, receiptText } from '../lib/printer.js';

const M = { tunai: 'Tunai', qris: 'QRIS', transfer: 'Transfer', kasbon: 'Kasbon' };

export function Transaksi({ settings, back }) {
  const P = usePeriod('today');
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(null);
  const sales = useLive(() => db.sales.where('date').between(P.a, P.b, true, false).reverse().toArray(), [P.a, P.b], null);
  if (!sales) return <div class="page" />;

  const s = q.trim().toLowerCase();
  const list = s ? sales.filter((x) => x.no.includes(s) || (x.customer || '').toLowerCase().includes(s) || x.items.some((i) => i.name.toLowerCase().includes(s))) : sales;
  const valid = list.filter((x) => x.status !== 'batal');
  const groups = [];
  for (const x of list) {
    const d = startOfDay(x.date);
    if (!groups.length || groups[groups.length - 1].d !== d) groups.push({ d, items: [] });
    groups[groups.length - 1].items.push(x);
  }

  return (
    <div class="page">
      <Header title="Riwayat Transaksi" back={back} />
      <PeriodPicker {...P} />
      <div class="searchbar">
        <div class="search-input">
          <Icon name="search" size={18} />
          <input type="search" placeholder="Cari no. nota, barang, pelanggan" value={q} onInput={(e) => setQ(e.currentTarget.value)} />
        </div>
      </div>
      <div class="muted small pad-x">
        {valid.length} transaksi · {rp(valid.reduce((a, x) => a + x.total, 0))}
      </div>
      <div class="list">
        {list.length === 0 && <Empty icon="receipt" title="Belum ada transaksi" text="Transaksi pada periode ini akan muncul di sini." />}
        {groups.map((g) => (
          <>
            <div class="section-title">{fmtDay(g.d)}</div>
            {g.items.map((x) => (
              <button class={`list-item tap ${x.status === 'batal' ? 'void' : ''}`} key={x.id} onClick={() => setSel(x)}>
                <div class="grow">
                  <div class="item-name">
                    {x.no}
                    {x.status === 'batal' && <span class="tag bad">Batal</span>}
                    {x.status === 'utang' && <span class="tag warn">Kasbon</span>}
                  </div>
                  <div class="item-sub">
                    {fmtTime(x.date)} · {M[x.method]} · {x.items.length} jenis
                    {x.customer ? ` · ${x.customer}` : ''}
                  </div>
                </div>
                <b>{rp(x.total)}</b>
              </button>
            ))}
          </>
        ))}
      </div>
      {sel && <SaleDetail sale={sel} settings={settings} onClose={() => setSel(null)} />}
    </div>
  );
}

export function SaleDetail({ sale: initial, settings, onClose }) {
  const sale = useLive(() => db.sales.get(initial.id), [initial.id], initial) || initial;
  const [payOpen, setPayOpen] = useState(false);
  const [amount, setAmount] = useState(0);

  const doPrint = async () => {
    try {
      await printReceipt(sale, settings);
    } catch (e) {
      if (e.name !== 'NotFoundError') toast(e.message || 'Gagal mencetak', 'err', 4500);
    }
  };
  const share = () => shareText(`Nota ${sale.no}`, receiptText(sale, settings));
  const cancel = async () => {
    const ok = await confirmDialog({
      title: 'Batalkan transaksi?',
      text: `Nota ${sale.no} (${rp(sale.total)}) dibatalkan. Stok barang dikembalikan dan uang dicatat keluar dari kas.`,
      ok: 'Batalkan Transaksi',
      danger: true,
    });
    if (!ok) return;
    await voidSale(sale.id, 'Dibatalkan kasir');
    toast('Transaksi dibatalkan');
  };
  const rest = sale.total - (sale.debtPaid || 0);

  return (
    <Sheet title={`Nota ${sale.no}`} onClose={onClose} full>
      <div class="kv">
        <span>Waktu</span>
        <b>{fmtDateTime(sale.date)}</b>
      </div>
      <div class="kv">
        <span>Pembayaran</span>
        <b>{M[sale.method]}</b>
      </div>
      <div class="kv">
        <span>Laba transaksi</span>
        <b class="good">{rp(sale.profit)}</b>
      </div>
      {sale.status === 'utang' && (
        <div class="kv">
          <span>Sisa kasbon</span>
          <b class="warn">{rp(rest)}</b>
        </div>
      )}
      <pre class="receipt-preview">{receiptText(sale, settings)}</pre>
      <div class="col gap">
        <button class="btn primary block" onClick={doPrint}>
          <Icon name="printer" /> Cetak Ulang Nota
        </button>
        <div class="row gap">
          <button class="btn secondary grow" onClick={share}>
            <Icon name="share" /> Kirim
          </button>
          {sale.status !== 'batal' && (
            <button class="btn ghost danger-text grow" onClick={cancel}>
              Batalkan
            </button>
          )}
        </div>
        {sale.status === 'utang' && (
          <button class="btn accent block" onClick={() => setPayOpen(true)}>
            <Icon name="cash" /> Terima Pembayaran Kasbon
          </button>
        )}
      </div>
      {payOpen && (
        <Sheet
          title={`Bayar kasbon ${sale.customer}`}
          onClose={() => setPayOpen(false)}
          footer={
            <button
              class="btn accent block lg"
              disabled={!amount}
              onClick={async () => {
                await payDebt(sale.id, amount);
                toast(amount >= rest ? 'Kasbon lunas' : `Diterima ${rp(amount)}`);
                setPayOpen(false);
                setAmount(0);
              }}
            >
              Simpan Pembayaran
            </button>
          }
        >
          <div class="form">
            <div class="note">Sisa utang: {rp(rest)}</div>
            <Field label="Jumlah dibayar">
              <MoneyInput value={amount} onChange={(v) => setAmount(Math.min(v, rest))} autoFocus />
            </Field>
            <button class="chip" onClick={() => setAmount(rest)}>
              Lunasi semua ({num(rest)})
            </button>
          </div>
        </Sheet>
      )}
    </Sheet>
  );
}
