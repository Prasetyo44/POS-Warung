import Dexie from 'dexie';

export const db = new Dexie('kasir-warung');

db.version(1).stores({
  products: '++id, &barcode, name, category, stock, updatedAt',
  sales: '++id, &no, date, method, status, customer',
  purchases: '++id, date, supplier',
  stockMoves: '++id, productId, date, type',
  cashflow: '++id, date, type, category',
  settings: 'key',
});

// v2: satu barang bisa punya beberapa barcode (misal barcode lama & baru, atau EAN + QR)
db.version(2)
  .stores({ products: '++id, &barcode, *codes, name, category, stock, updatedAt' })
  .upgrade((tx) =>
    tx.table('products').toCollection().modify((p) => {
      p.codes = [p.barcode, ...(p.altCodes || [])].filter(Boolean);
    })
  );

export const DEFAULT_SETTINGS = {
  storeName: 'Warung Saya',
  storeAddress: '',
  storePhone: '',
  receiptFooter: 'Terima kasih, selamat belanja kembali!',
  cashierName: 'Kasir',
  paperWidth: 32, // jumlah karakter per baris: 32 = 58mm, 48 = 80mm
  printMethod: 'bluetooth', // bluetooth | rawbt | browser
  autoPrint: false,
  taxPercent: 0,
  allowNegativeStock: true,
  scanBeep: true,
  scanQR: false, // QR Code ikut dibaca saat scan (bawaan: hanya barcode garis EAN/UPC/Code128)
  lowStockDefault: 5,
};

export async function getSettings() {
  const rows = await db.settings.toArray();
  const s = { ...DEFAULT_SETTINGS };
  for (const r of rows) s[r.key] = r.value;
  return s;
}

export async function saveSettings(obj) {
  await db.settings.bulkPut(Object.entries(obj).map(([key, value]) => ({ key, value })));
}

const pad = (n, l = 2) => String(n).padStart(l, '0');

async function nextSaleNo(date) {
  const d = new Date(date);
  const prefix = `${pad(d.getFullYear() % 100)}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const count = await db.sales.where('date').between(start, start + 86400000).count();
  let n = count + 1;
  // pastikan nomor unik walau ada transaksi yang dihapus
  while (await db.sales.where('no').equals(`${prefix}-${pad(n, 4)}`).count()) n++;
  return `${prefix}-${pad(n, 4)}`;
}

/** Cari barang dari barcode utama maupun barcode tambahan. UPC-A 12 digit = EAN-13 berawalan 0. */
export function findByBarcode(code) {
  const c = String(code).trim();
  const variants = [c];
  if (/^\d{12}$/.test(c)) variants.push('0' + c);
  if (/^0\d{12}$/.test(c)) variants.push(c.slice(1));
  return db.products.where('codes').anyOf(variants).first();
}

/** s sudah huruf kecil (dari kolom pencarian) */
export const matchesCode = (p, s) => (p.barcode || '').toLowerCase() === s || (p.altCodes || []).some((c) => c.toLowerCase() === s);

/**
 * Simpan transaksi penjualan, kurangi stok, catat riwayat stok dan arus kas.
 * items: [{ productId, name, barcode, price, buyPrice, qty, unit }]
 */
export async function checkout({ items, discount = 0, tax = 0, paid, method, customer = '', note = '', cashier = '' }) {
  return db.transaction('rw', db.products, db.sales, db.stockMoves, db.cashflow, async () => {
    const date = Date.now();
    const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);
    const total = Math.max(0, subtotal - discount + tax);
    const cost = items.reduce((s, i) => s + (i.buyPrice || 0) * i.qty, 0);
    const no = await nextSaleNo(date);
    const isDebt = method === 'kasbon';
    const paidAmount = isDebt ? (paid || 0) : paid;
    const sale = {
      no,
      date,
      items: items.map((i) => ({
        productId: i.productId,
        name: i.name,
        barcode: i.barcode || '',
        unit: i.unit || 'pcs',
        price: i.price,
        buyPrice: i.buyPrice || 0,
        qty: i.qty,
      })),
      subtotal,
      discount,
      tax,
      total,
      cost,
      profit: total - tax - cost,
      paid: paidAmount,
      change: isDebt ? 0 : Math.max(0, paidAmount - total),
      method,
      customer,
      note,
      cashier,
      status: isDebt && paidAmount < total ? 'utang' : 'lunas',
      debtPaid: isDebt ? paidAmount : 0,
    };
    const id = await db.sales.add(sale);
    for (const i of items) {
      if (!i.productId) continue;
      const p = await db.products.get(i.productId);
      if (!p) continue;
      await db.products.update(p.id, { stock: (p.stock || 0) - i.qty, updatedAt: date });
      await db.stockMoves.add({ productId: p.id, date, type: 'jual', qty: -i.qty, ref: no, note: '' });
    }
    const cashIn = isDebt ? paidAmount : total;
    if (cashIn > 0) {
      await db.cashflow.add({ date, type: 'masuk', category: 'Penjualan', amount: cashIn, note: `Nota ${no}`, ref: id, auto: true });
    }
    return { ...sale, id };
  });
}

/** Batalkan transaksi: stok dikembalikan, kas dikoreksi. */
export async function voidSale(id, reason = '') {
  return db.transaction('rw', db.products, db.sales, db.stockMoves, db.cashflow, async () => {
    const sale = await db.sales.get(id);
    if (!sale || sale.status === 'batal') return;
    const date = Date.now();
    for (const i of sale.items) {
      if (!i.productId) continue;
      const p = await db.products.get(i.productId);
      if (!p) continue;
      await db.products.update(p.id, { stock: (p.stock || 0) + i.qty, updatedAt: date });
      await db.stockMoves.add({ productId: p.id, date, type: 'batal', qty: i.qty, ref: sale.no, note: reason });
    }
    const received = sale.method === 'kasbon' ? sale.debtPaid || 0 : sale.total;
    if (received > 0) {
      await db.cashflow.add({ date, type: 'keluar', category: 'Pembatalan', amount: received, note: `Batal nota ${sale.no}`, ref: id, auto: true });
    }
    await db.sales.update(id, { status: 'batal', voidReason: reason, voidAt: date });
  });
}

/** Pelunasan kasbon (sebagian atau penuh). */
export async function payDebt(id, amount) {
  return db.transaction('rw', db.sales, db.cashflow, async () => {
    const sale = await db.sales.get(id);
    if (!sale) return;
    const paid = Math.min(sale.total, (sale.debtPaid || 0) + amount);
    const real = paid - (sale.debtPaid || 0);
    await db.sales.update(id, { debtPaid: paid, paid, status: paid >= sale.total ? 'lunas' : 'utang', paidOffAt: paid >= sale.total ? Date.now() : undefined });
    if (real > 0) {
      await db.cashflow.add({ date: Date.now(), type: 'masuk', category: 'Pelunasan Kasbon', amount: real, note: `${sale.customer || 'Pelanggan'} - ${sale.no}`, ref: id, auto: true });
    }
  });
}

/**
 * Pembelian / barang masuk dari supplier.
 * items: [{ productId, qty, buyPrice, updateSellPrice? }]
 */
export async function addPurchase({ supplier = '', items, note = '', paidFromCash = true }) {
  return db.transaction('rw', db.products, db.purchases, db.stockMoves, db.cashflow, async () => {
    const date = Date.now();
    const total = items.reduce((s, i) => s + i.buyPrice * i.qty, 0);
    const rows = [];
    for (const i of items) {
      const p = await db.products.get(i.productId);
      if (!p) continue;
      const upd = { stock: (p.stock || 0) + i.qty, buyPrice: i.buyPrice, updatedAt: date };
      if (i.sellPrice) upd.sellPrice = i.sellPrice;
      await db.products.update(p.id, upd);
      rows.push({ productId: p.id, name: p.name, qty: i.qty, buyPrice: i.buyPrice });
    }
    const id = await db.purchases.add({ date, supplier, items: rows, total, note, paidFromCash });
    for (const r of rows) {
      await db.stockMoves.add({ productId: r.productId, date, type: 'masuk', qty: r.qty, ref: `PB-${id}`, note: supplier });
    }
    if (paidFromCash && total > 0) {
      await db.cashflow.add({ date, type: 'keluar', category: 'Pembelian Stok', amount: total, note: supplier ? `Belanja ke ${supplier}` : 'Belanja stok', ref: id, auto: true });
    }
    return id;
  });
}

/** Stok opname: set stok sesuai hitungan fisik. */
export async function adjustStock(productId, newStock, note = '') {
  return db.transaction('rw', db.products, db.stockMoves, async () => {
    const p = await db.products.get(productId);
    if (!p) return;
    const diff = newStock - (p.stock || 0);
    if (diff === 0) return;
    const date = Date.now();
    await db.products.update(productId, { stock: newStock, updatedAt: date });
    await db.stockMoves.add({ productId, date, type: 'opname', qty: diff, ref: 'Opname', note });
  });
}

export async function saveProduct(p) {
  const data = {
    barcode: (p.barcode || '').trim() || undefined,
    name: p.name.trim(),
    category: (p.category || '').trim(),
    unit: (p.unit || 'pcs').trim(),
    buyPrice: Number(p.buyPrice) || 0,
    sellPrice: Number(p.sellPrice) || 0,
    minStock: Number(p.minStock) || 0,
    updatedAt: Date.now(),
  };
  if (!data.barcode) data.barcode = `NB${Date.now().toString(36).toUpperCase()}`;
  data.altCodes = [...new Set((p.altCodes || []).map((c) => String(c).trim()).filter((c) => c && c !== data.barcode))];
  data.codes = [data.barcode, ...data.altCodes];
  if (p.id) {
    await db.products.update(p.id, data);
    return p.id;
  }
  const stock = Number(p.stock) || 0;
  return db.transaction('rw', db.products, db.stockMoves, async () => {
    const id = await db.products.add({ ...data, stock, createdAt: Date.now() });
    if (stock) await db.stockMoves.add({ productId: id, date: Date.now(), type: 'awal', qty: stock, ref: 'Stok awal', note: '' });
    return id;
  });
}

export async function deleteProduct(id) {
  await db.transaction('rw', db.products, db.stockMoves, async () => {
    await db.products.delete(id);
    await db.stockMoves.where('productId').equals(id).delete();
  });
}

export async function exportAll() {
  const out = { app: 'kasir-warung', version: 1, exportedAt: Date.now() };
  for (const t of db.tables) out[t.name] = await t.toArray();
  return out;
}

export async function importAll(data) {
  if (!data || data.app !== 'kasir-warung') throw new Error('File backup tidak dikenali');
  await db.transaction('rw', db.tables, async () => {
    for (const t of db.tables) {
      await t.clear();
      if (Array.isArray(data[t.name])) await t.bulkAdd(data[t.name]);
    }
  });
}

export async function wipeAll() {
  await db.transaction('rw', db.tables, async () => {
    for (const t of db.tables) if (t.name !== 'settings') await t.clear();
  });
}

export async function loadDemo() {
  const demo = [
    ['8996001600269', 'Indomie Goreng Original', 'Mie Instan', 'pcs', 2700, 3500, 40],
    ['8996001600221', 'Indomie Soto Mie', 'Mie Instan', 'pcs', 2600, 3300, 30],
    ['8992388101061', 'Aqua Botol 600ml', 'Minuman', 'btl', 2800, 4000, 48],
    ['8999999195663', 'Teh Botol Sosro 450ml', 'Minuman', 'btl', 4200, 6000, 24],
    ['8998009010255', 'Kopi Kapal Api Special Mix', 'Minuman', 'sachet', 1300, 2000, 60],
    ['8992761002015', 'Gula Pasir 1kg', 'Sembako', 'kg', 15500, 18000, 10],
    ['8992628020152', 'Minyak Goreng Bimoli 1L', 'Sembako', 'pcs', 17500, 21000, 12],
    ['8999909028234', 'Sampoerna Mild 16', 'Rokok', 'bks', 30500, 33000, 20],
    ['8992753101207', 'Telur Ayam', 'Sembako', 'butir', 1800, 2500, 90],
    ['8998866200301', 'Sabun Lifebuoy 75g', 'Kebersihan', 'pcs', 3200, 4500, 3],
  ];
  for (const [barcode, name, category, unit, buyPrice, sellPrice, stock] of demo) {
    if (await findByBarcode(barcode)) continue;
    await saveProduct({ barcode, name, category, unit, buyPrice, sellPrice, stock, minStock: 5 });
  }
}
