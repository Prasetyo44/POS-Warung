const nf = new Intl.NumberFormat('id-ID');

export const rp = (n) => `Rp${nf.format(Math.round(n || 0))}`;
export const num = (n) => nf.format(Math.round(n || 0));

/** "12.500" / "12500" / "Rp 12.500" -> 12500 */
export const parseNum = (s) => {
  if (typeof s === 'number') return s;
  const v = String(s || '').replace(/[^\d,-]/g, '').replace(',', '.');
  return Number(v) || 0;
};

const DAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const p2 = (n) => String(n).padStart(2, '0');

export const fmtDate = (t) => {
  const d = new Date(t);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
};
export const fmtTime = (t) => {
  const d = new Date(t);
  return `${p2(d.getHours())}:${p2(d.getMinutes())}`;
};
export const fmtDateTime = (t) => `${fmtDate(t)} ${fmtTime(t)}`;
export const fmtDay = (t) => `${DAYS[new Date(t).getDay()]}, ${fmtDate(t)}`;
export const isoDate = (t) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
};
export const startOfDay = (t = Date.now()) => {
  const d = new Date(t);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
};

export function rangeFor(key, from, to) {
  const now = new Date();
  const today = startOfDay();
  switch (key) {
    case 'today':
      return [today, today + 86400000, 'Hari ini'];
    case 'yesterday':
      return [today - 86400000, today, 'Kemarin'];
    case 'week': {
      const dow = (now.getDay() + 6) % 7; // Senin = 0
      return [today - dow * 86400000, today + 86400000, 'Minggu ini'];
    }
    case 'month':
      return [new Date(now.getFullYear(), now.getMonth(), 1).getTime(), today + 86400000, 'Bulan ini'];
    case 'lastmonth':
      return [new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime(), new Date(now.getFullYear(), now.getMonth(), 1).getTime(), 'Bulan lalu'];
    case 'custom': {
      const a = from ? new Date(from + 'T00:00:00').getTime() : today;
      const b = to ? new Date(to + 'T00:00:00').getTime() + 86400000 : today + 86400000;
      return [a, b, `${fmtDate(a)} - ${fmtDate(b - 1)}`];
    }
    default:
      return [0, today + 86400000, 'Semua'];
  }
}

/* ---------- toast & dialog sederhana ---------- */
const listeners = new Set();
export const ui = { toasts: [], dialog: null };
const emit = () => listeners.forEach((f) => f({ ...ui }));
export const subscribeUI = (f) => {
  listeners.add(f);
  return () => listeners.delete(f);
};

let tid = 0;
export function toast(text, type = 'ok', ms = 2200) {
  const id = ++tid;
  ui.toasts = [...ui.toasts.slice(-1), { id, text, type }];
  emit();
  setTimeout(() => {
    ui.toasts = ui.toasts.filter((t) => t.id !== id);
    emit();
  }, ms);
}

/** confirmDialog({title, text, ok, danger}) -> Promise<boolean> */
export function confirmDialog(opts) {
  return new Promise((resolve) => {
    ui.dialog = {
      ...opts,
      resolve: (v) => {
        ui.dialog = null;
        emit();
        resolve(v);
      },
    };
    emit();
  });
}

/* ---------- suara & getar ---------- */
let beepAudio;
export function beep() {
  try {
    if (!beepAudio) beepAudio = new Audio('beep.wav');
    beepAudio.currentTime = 0;
    beepAudio.play().catch(() => {});
  } catch {}
  if (navigator.vibrate) navigator.vibrate(60);
}

export function download(filename, content, type = 'application/json') {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 1000);
}

export function toCSV(rows) {
  const esc = (v) => {
    const s = v == null ? '' : String(v);
    return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '﻿' + rows.map((r) => r.map(esc).join(';')).join('\n');
}

export const debounce = (fn, ms = 200) => {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
};
