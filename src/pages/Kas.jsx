import { useState } from 'preact/hooks';
import { Header, Icon, Empty, Sheet, Field, MoneyInput, Segmented, useLive } from '../components/ui.jsx';
import { PeriodPicker, usePeriod } from './Laporan.jsx';
import { db } from '../lib/db.js';
import { rp, fmtDateTime, toast, confirmDialog } from '../lib/utils.js';

const CATS = {
  masuk: ['Modal Awal', 'Tambahan Modal', 'Pendapatan Lain'],
  keluar: ['Operasional', 'Listrik & Air', 'Gaji Karyawan', 'Sewa', 'Transport', 'Plastik & Perlengkapan', 'Ambil Pribadi', 'Lainnya'],
};

export function Kas({ back }) {
  const P = usePeriod('month');
  const [form, setForm] = useState(null);
  const rows = useLive(() => db.cashflow.where('date').between(P.a, P.b, true, false).reverse().toArray(), [P.a, P.b], null);
  const balance = useLive(async () => (await db.cashflow.toArray()).reduce((s, c) => s + (c.type === 'masuk' ? c.amount : -c.amount), 0), [], 0);
  if (!rows) return <div class="page" />;
  const inn = rows.filter((r) => r.type === 'masuk').reduce((a, r) => a + r.amount, 0);
  const out = rows.filter((r) => r.type === 'keluar').reduce((a, r) => a + r.amount, 0);

  const remove = async (r) => {
    if (r.auto) return toast('Catatan otomatis dari transaksi tidak bisa dihapus di sini', 'err', 3000);
    if (await confirmDialog({ title: 'Hapus catatan kas?', text: `${r.category} ${rp(r.amount)}`, ok: 'Hapus', danger: true })) {
      await db.cashflow.delete(r.id);
      toast('Catatan dihapus');
    }
  };

  return (
    <div class="page">
      <Header title="Buku Kas" back={back} />
      <div class="kpis">
        <div class="kpi main">
          <span>Saldo kas sekarang</span>
          <b>{rp(balance)}</b>
          <small>Semua uang masuk dikurangi uang keluar</small>
        </div>
      </div>
      <PeriodPicker {...P} />
      <div class="grid2 pad-x">
        <div class="kpi">
          <span>Masuk</span>
          <b class="good">{rp(inn)}</b>
        </div>
        <div class="kpi">
          <span>Keluar</span>
          <b class="bad">{rp(out)}</b>
        </div>
      </div>
      <div class="row gap pad-x" style="margin-top:12px">
        <button class="btn secondary grow" onClick={() => setForm({ type: 'masuk', category: CATS.masuk[0], amount: 0, note: '' })}>
          <Icon name="plus" /> Uang Masuk
        </button>
        <button class="btn secondary grow" onClick={() => setForm({ type: 'keluar', category: CATS.keluar[0], amount: 0, note: '' })}>
          <Icon name="minus" /> Pengeluaran
        </button>
      </div>
      <div class="list">
        {rows.length === 0 && <Empty icon="wallet" title="Belum ada catatan kas" text="Penjualan, pembelian stok, dan pengeluaran tercatat otomatis di sini." />}
        {rows.map((r) => (
          <button class="list-item tap" key={r.id} onClick={() => remove(r)}>
            <div class="grow">
              <div class="item-name">{r.category}</div>
              <div class="item-sub">
                {fmtDateTime(r.date)}
                {r.note ? ` · ${r.note}` : ''}
              </div>
            </div>
            <b class={r.type === 'masuk' ? 'good' : 'bad'}>
              {r.type === 'masuk' ? '+' : '-'}
              {rp(r.amount)}
            </b>
          </button>
        ))}
      </div>
      {form && (
        <Sheet
          title={form.type === 'masuk' ? 'Catat Uang Masuk' : 'Catat Pengeluaran'}
          onClose={() => setForm(null)}
          footer={
            <button
              class="btn primary block lg"
              disabled={!form.amount}
              onClick={async () => {
                await db.cashflow.add({ date: Date.now(), type: form.type, category: form.category, amount: form.amount, note: form.note.trim(), auto: false });
                toast('Tersimpan');
                setForm(null);
              }}
            >
              Simpan
            </button>
          }
        >
          <div class="form">
            <Segmented
              value={form.type}
              onChange={(t) => setForm({ ...form, type: t, category: CATS[t][0] })}
              options={[
                ['masuk', 'Uang Masuk'],
                ['keluar', 'Pengeluaran'],
              ]}
            />
            <Field label="Jumlah">
              <MoneyInput value={form.amount} onChange={(v) => setForm({ ...form, amount: v })} autoFocus />
            </Field>
            <Field label="Kategori">
              <div class="chips wrap">
                {CATS[form.type].map((c) => (
                  <button class={`chip ${form.category === c ? 'active' : ''}`} onClick={() => setForm({ ...form, category: c })}>
                    {c}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Keterangan (opsional)">
              <input class="input" value={form.note} onInput={(e) => setForm({ ...form, note: e.currentTarget.value })} />
            </Field>
          </div>
        </Sheet>
      )}
    </div>
  );
}
