import { useState } from 'preact/hooks';
import { Header, Icon, Empty, useLive } from '../components/ui.jsx';
import { db } from '../lib/db.js';
import { rp, num, rangeFor, isoDate, download, toCSV, fmtDateTime, startOfDay } from '../lib/utils.js';

const PERIODS = [
  ['today', 'Hari ini'],
  ['yesterday', 'Kemarin'],
  ['week', 'Minggu ini'],
  ['month', 'Bulan ini'],
  ['lastmonth', 'Bulan lalu'],
  ['custom', 'Pilih tanggal'],
];

export function PeriodPicker({ period, setPeriod, from, setFrom, to, setTo }) {
  return (
    <>
      <div class="chips scroll pad-x">
        {PERIODS.map(([k, l]) => (
          <button class={`chip ${period === k ? 'active' : ''}`} onClick={() => setPeriod(k)}>
            {l}
          </button>
        ))}
      </div>
      {period === 'custom' && (
        <div class="grid2 pad-x">
          <input class="input" type="date" value={from} onInput={(e) => setFrom(e.currentTarget.value)} aria-label="Dari tanggal" />
          <input class="input" type="date" value={to} onInput={(e) => setTo(e.currentTarget.value)} aria-label="Sampai tanggal" />
        </div>
      )}
    </>
  );
}

export function usePeriod(initial = 'today') {
  const [period, setPeriod] = useState(initial);
  const [from, setFrom] = useState(isoDate(Date.now() - 6 * 86400000));
  const [to, setTo] = useState(isoDate(Date.now()));
  const [a, b, label] = rangeFor(period, from, to);
  return { period, setPeriod, from, setFrom, to, setTo, a, b, label };
}

export function Laporan() {
  const P = usePeriod('today');
  const { a, b, label } = P;

  const data = useLive(
    async () => {
      const sales = (await db.sales.where('date').between(a, b, true, false).toArray()).filter((s) => s.status !== 'batal');
      const cash = await db.cashflow.where('date').between(a, b, true, false).toArray();
      const purchases = await db.purchases.where('date').between(a, b, true, false).toArray();
      const debtOpen = (await db.sales.where('status').equals('utang').toArray()).reduce((s, x) => s + x.total - (x.debtPaid || 0), 0);
      const allCash = await db.cashflow.toArray();
      return { sales, cash, purchases, debtOpen, balance: allCash.reduce((s, c) => s + (c.type === 'masuk' ? c.amount : -c.amount), 0) };
    },
    [a, b],
    null
  );

  if (!data) return <div class="page" />;
  const { sales, cash, purchases } = data;
  const omzet = sales.reduce((s, x) => s + x.total, 0);
  const profit = sales.reduce((s, x) => s + (x.profit || 0), 0);
  const count = sales.length;
  const itemsSold = sales.reduce((s, x) => s + x.items.reduce((q, i) => q + i.qty, 0), 0);
  const byMethod = {};
  for (const s of sales) byMethod[s.method] = (byMethod[s.method] || 0) + s.total;
  const cashIn = cash.filter((c) => c.type === 'masuk').reduce((s, c) => s + c.amount, 0);
  const cashOut = cash.filter((c) => c.type === 'keluar').reduce((s, c) => s + c.amount, 0);
  const expenses = cash.filter((c) => c.type === 'keluar' && !c.auto && c.category !== 'Ambil Pribadi').reduce((s, c) => s + c.amount, 0);
  const buy = purchases.reduce((s, p) => s + p.total, 0);

  // barang terlaris
  const prod = {};
  for (const s of sales)
    for (const i of s.items) {
      const k = i.productId || i.name;
      prod[k] ??= { name: i.name, qty: 0, total: 0, profit: 0 };
      prod[k].qty += i.qty;
      prod[k].total += i.qty * i.price;
      prod[k].profit += i.qty * (i.price - (i.buyPrice || 0));
    }
  const top = Object.values(prod).sort((x, y) => y.qty - x.qty).slice(0, 10);

  // grafik per hari (atau per jam untuk 1 hari)
  const oneDay = b - a <= 86400000;
  const buckets = [];
  if (oneDay) {
    for (let h = 6; h <= 22; h++) buckets.push({ label: String(h), v: 0 });
    for (const s of sales) {
      const h = Math.min(22, Math.max(6, new Date(s.date).getHours()));
      buckets[h - 6].v += s.total;
    }
  } else {
    const days = Math.min(62, Math.round((b - a) / 86400000));
    for (let d = 0; d < days; d++) buckets.push({ label: String(new Date(a + d * 86400000).getDate()), v: 0, t: a + d * 86400000 });
    for (const s of sales) {
      const idx = Math.floor((startOfDay(s.date) - a) / 86400000);
      if (buckets[idx]) buckets[idx].v += s.total;
    }
  }
  const max = Math.max(1, ...buckets.map((x) => x.v));

  const exportCSV = () => {
    const rows = [['No Nota', 'Tanggal', 'Barang', 'Qty', 'Harga', 'Subtotal', 'Modal', 'Laba', 'Metode', 'Pelanggan']];
    for (const s of sales)
      for (const i of s.items)
        rows.push([s.no, fmtDateTime(s.date), i.name, i.qty, i.price, i.qty * i.price, i.qty * (i.buyPrice || 0), i.qty * (i.price - (i.buyPrice || 0)), s.method, s.customer || '']);
    rows.push([]);
    rows.push(['Ringkasan', label]);
    rows.push(['Omzet', omzet]);
    rows.push(['Diskon', sales.reduce((x, s) => x + (s.discount || 0), 0)]);
    rows.push(['Laba kotor', profit]);
    rows.push(['Pengeluaran operasional', expenses]);
    rows.push(['Laba bersih', profit - expenses]);
    download(`laporan-penjualan-${isoDate(a)}_${isoDate(b - 1)}.csv`, toCSV(rows), 'text/csv');
  };

  const M = { tunai: 'Tunai', qris: 'QRIS', transfer: 'Transfer', kasbon: 'Kasbon' };

  return (
    <div class="page">
      <Header
        title="Laporan"
        actions={
          <button class="icon-btn light" onClick={exportCSV} aria-label="Ekspor CSV (Excel)">
            <Icon name="download" />
          </button>
        }
      />
      <PeriodPicker {...P} />
      <div class="muted small pad-x">{label}</div>

      <div class="kpis">
        <div class="kpi main">
          <span>Omzet penjualan</span>
          <b>{rp(omzet)}</b>
          <small>
            {count} transaksi · {num(itemsSold)} item
          </small>
        </div>
        <div class="kpi">
          <span>Laba kotor</span>
          <b class="good">{rp(profit)}</b>
          <small>{omzet ? Math.round((profit / omzet) * 100) : 0}% dari omzet</small>
        </div>
        <div class="kpi">
          <span>Laba bersih</span>
          <b class={profit - expenses >= 0 ? 'good' : 'bad'}>{rp(profit - expenses)}</b>
          <small>setelah biaya {rp(expenses)}</small>
        </div>
        <div class="kpi">
          <span>Rata-rata / transaksi</span>
          <b>{rp(count ? omzet / count : 0)}</b>
        </div>
        <div class="kpi">
          <span>Belanja stok</span>
          <b>{rp(buy)}</b>
          <small>{purchases.length} kali</small>
        </div>
      </div>

      <div class="card mx">
        <div class="card-title">Grafik penjualan {oneDay ? 'per jam' : 'per hari'}</div>
        {omzet === 0 ? (
          <div class="muted small">Belum ada penjualan di periode ini.</div>
        ) : (
          <div class="bars" role="img" aria-label="Grafik penjualan">
            {buckets.map((x) => (
              <div class="bar-col" title={`${x.label}: ${rp(x.v)}`}>
                <div class="bar" style={{ height: `${(x.v / max) * 100}%` }} />
                <span>{buckets.length > 16 && Number(x.label) % 5 !== 1 ? '' : x.label}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div class="card mx">
        <div class="card-title">Arus kas periode ini</div>
        <div class="kv">
          <span>Uang masuk</span>
          <b class="good">{rp(cashIn)}</b>
        </div>
        <div class="kv">
          <span>Uang keluar</span>
          <b class="bad">{rp(cashOut)}</b>
        </div>
        <div class="kv">
          <span>Selisih</span>
          <b>{rp(cashIn - cashOut)}</b>
        </div>
        <hr />
        <div class="kv">
          <span>Saldo kas sekarang</span>
          <b>{rp(data.balance)}</b>
        </div>
        <div class="kv">
          <span>Total kasbon belum lunas</span>
          <b class="warn">{rp(data.debtOpen)}</b>
        </div>
      </div>

      <div class="card mx">
        <div class="card-title">Per metode bayar</div>
        {Object.keys(byMethod).length === 0 && <div class="muted small">-</div>}
        {Object.entries(byMethod).map(([k, v]) => (
          <div class="kv">
            <span>{M[k] || k}</span>
            <b>{rp(v)}</b>
          </div>
        ))}
      </div>

      <div class="card mx">
        <div class="card-title">Barang terlaris</div>
        {top.length === 0 && <Empty icon="chart" title="Belum ada data" />}
        {top.map((t, i) => (
          <div class="rank">
            <span class="rank-no">{i + 1}</span>
            <div class="grow">
              <div class="item-name">{t.name}</div>
              <div class="item-sub">
                {num(t.qty)} terjual · laba {rp(t.profit)}
              </div>
            </div>
            <b>{rp(t.total)}</b>
          </div>
        ))}
      </div>
      <div class="muted small pad-x center">Laba dihitung dari harga jual dikurangi harga modal saat transaksi.</div>
      <div style="height:16px" />
    </div>
  );
}

