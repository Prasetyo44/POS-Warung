import { rp, num, fmtDateTime } from './utils.js';

/* ================= Susun isi nota (teks monospace) ================= */

const ascii = (s) =>
  String(s ?? '')
    .normalize('NFKD')
    .replace(/[^\x20-\x7E]/g, '');

const padR = (s, w) => (s.length >= w ? s.slice(0, w) : s + ' '.repeat(w - s.length));
const padL = (s, w) => (s.length >= w ? s.slice(0, w) : ' '.repeat(w - s.length) + s);
const lr = (l, r, w) => {
  l = ascii(l);
  r = ascii(r);
  const space = w - r.length - 1;
  if (l.length > space) l = l.slice(0, space);
  return padR(l, w - r.length) + r;
};

function wrap(text, w) {
  const words = ascii(text).split(/\s+/);
  const out = [];
  let line = '';
  for (const word of words) {
    if (!line) line = word;
    else if ((line + ' ' + word).length <= w) line += ' ' + word;
    else {
      out.push(line);
      line = word;
    }
    while (line.length > w) {
      out.push(line.slice(0, w));
      line = line.slice(w);
    }
  }
  if (line) out.push(line);
  return out;
}

const METHOD = { tunai: 'Tunai', qris: 'QRIS', transfer: 'Transfer', kasbon: 'Kasbon' };

/** Hasil: [{ text, align: 'left'|'center', bold, big }] */
export function receiptLines(sale, s) {
  const W = Number(s.paperWidth) || 32;
  const L = [];
  const add = (text, o = {}) => L.push({ text, align: 'left', ...o });
  const hr = (c = '-') => add(c.repeat(W));

  for (const t of wrap(s.storeName || 'Toko', W)) add(t, { align: 'center', bold: true, big: W >= 32 && t.length <= W / 2 });
  for (const t of wrap(s.storeAddress || '', W)) add(t, { align: 'center' });
  if (s.storePhone) add(`Telp ${s.storePhone}`, { align: 'center' });
  hr('=');
  add(lr('No', sale.no, W));
  add(lr('Tgl', fmtDateTime(sale.date), W));
  if (sale.cashier) add(lr('Kasir', sale.cashier, W));
  if (sale.customer) add(lr('Pelanggan', sale.customer, W));
  hr();
  for (const i of sale.items) {
    for (const t of wrap(i.name, W)) add(t);
    add(lr(`  ${num(i.qty)} x ${num(i.price)}`, num(i.qty * i.price), W));
  }
  hr();
  const qty = sale.items.reduce((a, i) => a + i.qty, 0);
  add(lr(`Subtotal (${num(qty)} item)`, num(sale.subtotal), W));
  if (sale.discount) add(lr('Diskon', '-' + num(sale.discount), W));
  if (sale.tax) add(lr('Pajak', num(sale.tax), W));
  add(lr('TOTAL', rp(sale.total), W), { bold: true });
  if (sale.method === 'kasbon') {
    add(lr('Bayar (Kasbon)', num(sale.paid || 0), W));
    add(lr('Sisa utang', num(sale.total - (sale.paid || 0)), W), { bold: true });
  } else {
    add(lr(`Bayar (${METHOD[sale.method] || sale.method})`, num(sale.paid), W));
    if (sale.method === 'tunai') add(lr('Kembali', num(sale.change), W), { bold: true });
  }
  if (sale.status === 'batal') {
    hr();
    add('*** TRANSAKSI DIBATALKAN ***', { align: 'center', bold: true });
  }
  hr('=');
  for (const t of wrap(s.receiptFooter || '', W)) add(t, { align: 'center' });
  return L;
}

export function receiptText(sale, s) {
  const W = Number(s.paperWidth) || 32;
  return receiptLines(sale, s)
    .map((l) => (l.align === 'center' ? padL(l.text, Math.floor((W + l.text.length) / 2)) : l.text))
    .join('\n');
}

/* ================= ESC/POS ================= */

export function escpos(lines, { feed = 4, cut = true } = {}) {
  const out = [];
  const push = (...b) => out.push(...b);
  const text = (s) => {
    for (const ch of ascii(s)) out.push(ch.charCodeAt(0));
  };
  push(0x1b, 0x40); // init
  push(0x1b, 0x74, 0x00); // code page PC437
  for (const l of lines) {
    push(0x1b, 0x61, l.align === 'center' ? 1 : 0);
    push(0x1b, 0x45, l.bold ? 1 : 0);
    push(0x1d, 0x21, l.big ? 0x11 : 0x00);
    text(l.text);
    push(0x0a);
  }
  push(0x1b, 0x45, 0, 0x1d, 0x21, 0, 0x1b, 0x61, 0);
  push(0x1b, 0x64, feed); // feed n lines
  if (cut) push(0x1d, 0x56, 0x42, 0x00); // partial cut (diabaikan oleh printer tanpa pemotong)
  return new Uint8Array(out);
}

/* ================= Web Bluetooth (printer BLE) ================= */

// UUID layanan yang umum dipakai printer thermal murah (58mm/80mm)
const SERVICES = [
  '000018f0-0000-1000-8000-00805f9b34fb',
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
  '49535343-fe7d-4ae5-8fa9-9fafd205e455',
  '0000ff00-0000-1000-8000-00805f9b34fb',
  '0000ffe0-0000-1000-8000-00805f9b34fb',
  '0000fee7-0000-1000-8000-00805f9b34fb',
  '0000ae30-0000-1000-8000-00805f9b34fb',
  '0000af30-0000-1000-8000-00805f9b34fb',
  '000018f1-0000-1000-8000-00805f9b34fb',
];

let bt = { device: null, char: null };

export const bluetoothSupported = () => typeof navigator !== 'undefined' && !!navigator.bluetooth;
export const connectedPrinterName = () => (bt.device && bt.device.gatt.connected ? bt.device.name || 'Printer' : null);

async function findWritable(server) {
  const services = await server.getPrimaryServices();
  for (const svc of services) {
    let chars = [];
    try {
      chars = await svc.getCharacteristics();
    } catch {
      continue;
    }
    for (const c of chars) {
      if (c.properties.write || c.properties.writeWithoutResponse) return c;
    }
  }
  throw new Error('Printer tidak punya jalur tulis. Coba metode RawBT.');
}

async function connect(device) {
  const server = await device.gatt.connect();
  const char = await findWritable(server);
  bt = { device, char };
  device.addEventListener('gattserverdisconnected', () => {
    bt.char = null;
  });
  return device.name || 'Printer';
}

export async function pairBluetooth() {
  if (!bluetoothSupported()) throw new Error('Browser ini tidak mendukung Bluetooth. Gunakan Chrome di Android, atau pilih metode RawBT.');
  const device = await navigator.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: SERVICES });
  localStorage.setItem('pos.btName', device.name || '');
  return connect(device);
}

async function ensureConnected() {
  if (bt.device && bt.char && bt.device.gatt.connected) return;
  if (bt.device) return void (await connect(bt.device));
  // coba sambung ulang ke printer yang pernah dipasangkan (jika browser mendukung)
  if (navigator.bluetooth?.getDevices) {
    const name = localStorage.getItem('pos.btName');
    const list = await navigator.bluetooth.getDevices();
    const d = list.find((x) => x.name === name) || list[0];
    if (d) return void (await connect(d));
  }
  await pairBluetooth();
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function sendBluetooth(bytes) {
  await ensureConnected();
  const c = bt.char;
  const size = 100;
  for (let i = 0; i < bytes.length; i += size) {
    const chunk = bytes.slice(i, i + size);
    if (c.properties.writeWithoutResponse && c.writeValueWithoutResponse) {
      await c.writeValueWithoutResponse(chunk);
      await sleep(25);
    } else if (c.writeValueWithResponse) await c.writeValueWithResponse(chunk);
    else await c.writeValue(chunk);
  }
}

/* ================= RawBT (printer Bluetooth klasik / USB lewat aplikasi RawBT) ================= */

function sendRawBT(bytes) {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  const b64 = btoa(bin);
  window.location.href = `intent:base64,${b64}#Intent;scheme=rawbt;package=ru.a402d.rawbtprinter;end;`;
}

/* ================= Cetak lewat dialog print browser / simpan PDF ================= */

export function printBrowser(text, widthMm = 58) {
  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
  document.body.appendChild(frame);
  const esc = text.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  frame.contentDocument.write(`<!doctype html><html><head><meta charset="utf-8"><title>Nota</title><style>
    @page { size: ${widthMm}mm auto; margin: 2mm; }
    body { margin: 0; font: 11px/1.25 'Courier New', monospace; }
    pre { margin: 0; white-space: pre; font: inherit; }
  </style></head><body><pre>${esc}</pre></body></html>`);
  frame.contentDocument.close();
  setTimeout(() => {
    frame.contentWindow.focus();
    frame.contentWindow.print();
    setTimeout(() => frame.remove(), 2000);
  }, 200);
}

/** Cetak nota sesuai metode di pengaturan. */
export async function printReceipt(sale, settings, method = settings.printMethod) {
  const lines = receiptLines(sale, settings);
  if (method === 'browser') return printBrowser(receiptText(sale, settings), Number(settings.paperWidth) >= 48 ? 80 : 58);
  const bytes = escpos(lines);
  if (method === 'rawbt') return sendRawBT(bytes);
  return sendBluetooth(bytes);
}

export async function printTest(settings) {
  const W = Number(settings.paperWidth) || 32;
  const lines = [
    { text: settings.storeName || 'Toko', align: 'center', bold: true, big: true },
    { text: 'Tes printer berhasil', align: 'center' },
    { text: '-'.repeat(W), align: 'left' },
    { text: lr('Lebar kertas', `${W} karakter`, W), align: 'left' },
    { text: '1234567890'.repeat(5).slice(0, W), align: 'left' },
  ];
  if (settings.printMethod === 'browser') return printBrowser(lines.map((l) => l.text).join('\n'));
  const bytes = escpos(lines);
  if (settings.printMethod === 'rawbt') return sendRawBT(bytes);
  return sendBluetooth(bytes);
}
