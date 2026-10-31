import { useState } from 'preact/hooks';
import { Header, Empty, useLive } from '../components/ui.jsx';
import { SaleDetail } from './Transaksi.jsx';
import { db } from '../lib/db.js';
import { rp, fmtDate } from '../lib/utils.js';

export function Kasbon({ settings, back }) {
  const [sel, setSel] = useState(null);
  const [open, setOpen] = useState(null);
  const debts = useLive(() => db.sales.where('status').equals('utang').toArray(), [], null);
  if (!debts) return <div class="page" />;

  const byCust = {};
  for (const d of debts) {
    const k = d.customer || 'Tanpa nama';
    byCust[k] ??= { name: k, total: 0, list: [] };
    byCust[k].total += d.total - (d.debtPaid || 0);
    byCust[k].list.push(d);
  }
  const custs = Object.values(byCust).sort((a, b) => b.total - a.total);
  const total = custs.reduce((a, c) => a + c.total, 0);

  return (
    <div class="page">
      <Header title="Kasbon Pelanggan" back={back} />
      <div class="kpis">
        <div class="kpi main">
          <span>Total kasbon belum lunas</span>
          <b>{rp(total)}</b>
          <small>{custs.length} pelanggan</small>
        </div>
      </div>
      <div class="list">
        {custs.length === 0 && <Empty icon="users" title="Tidak ada kasbon" text="Pilih metode bayar Kasbon saat transaksi untuk mencatat utang pelanggan." />}
        {custs.map((c) => (
          <>
            <button class="list-item tap" onClick={() => setOpen(open === c.name ? null : c.name)}>
              <div class="avatar">{c.name.slice(0, 1).toUpperCase()}</div>
              <div class="grow">
                <div class="item-name">{c.name}</div>
                <div class="item-sub">{c.list.length} nota</div>
              </div>
              <b class="warn">{rp(c.total)}</b>
            </button>
            {open === c.name &&
              c.list.map((d) => (
                <button class="list-item tap sub" key={d.id} onClick={() => setSel(d)}>
                  <div class="grow">
                    <div class="item-name">{d.no}</div>
                    <div class="item-sub">
                      {fmtDate(d.date)} · total {rp(d.total)}
                    </div>
                  </div>
                  <b>{rp(d.total - (d.debtPaid || 0))}</b>
                </button>
              ))}
          </>
        ))}
      </div>
      {sel && <SaleDetail sale={sel} settings={settings} onClose={() => setSel(null)} />}
    </div>
  );
}
