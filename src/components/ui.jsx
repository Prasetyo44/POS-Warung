import { useEffect, useState, useRef } from 'preact/hooks';
import { liveQuery } from 'dexie';
import { subscribeUI, ui, num, parseNum } from '../lib/utils.js';
import { getSettings } from '../lib/db.js';

/* ---------- data reaktif dari IndexedDB ---------- */
export function useLive(fn, deps = [], initial) {
  const [val, setVal] = useState(initial);
  useEffect(() => {
    const sub = liveQuery(fn).subscribe({ next: setVal, error: (e) => console.error(e) });
    return () => sub.unsubscribe();
  }, deps);
  return val;
}

export function useSettings() {
  return useLive(getSettings, [], null);
}

/* ---------- ikon ---------- */
const P = {
  cart: 'M3 4h2l2.4 10.2a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 1.9-1.4L21 8H6.2M10 20.5a1 1 0 1 1-2 0 1 1 0 0 1 2 0zm9 0a1 1 0 1 1-2 0 1 1 0 0 1 2 0z',
  box: 'M21 8 12 3 3 8v8l9 5 9-5V8zM3 8l9 5 9-5M12 13v8',
  layers: 'M12 3 2 8l10 5 10-5-10-5zM2 13l10 5 10-5M2 17.5l10 5 10-5',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  menu: 'M4 6h16M4 12h16M4 18h16',
  scan: 'M3 8V5a2 2 0 0 1 2-2h3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M8 21H5a2 2 0 0 1-2-2v-3M7 8v8M10 8v8M13 8v8M17 8v8',
  x: 'M18 6 6 18M6 6l12 12',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zm10 2-4.3-4.3',
  trash: 'M3 6h18M8 6V4h8v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6',
  edit: 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z',
  printer: 'M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z',
  flash: 'M13 2 3 14h9l-1 8 10-12h-9l1-8z',
  receipt: 'M5 2v20l3-2 2 2 2-2 2 2 2-2 3 2V2l-3 2-2-2-2 2-2-2-2 2-3-2zM9 8h6M9 12h6M9 16h4',
  wallet: 'M20 7H5a2 2 0 0 1 0-4h13v4M3 5v14a2 2 0 0 0 2 2h15V7M16 14h.01',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  users: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8',
  download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3',
  upload: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12',
  check: 'M20 6 9 17l-5-5',
  alert: 'M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
  back: 'M15 18l-6-6 6-6',
  chevron: 'M9 18l6-6-6-6',
  pause: 'M10 4H6v16h4zM18 4h-4v16h4z',
  history: 'M3 3v5h5M3.05 13A9 9 0 1 0 6 5.3L3 8M12 7v5l4 2',
  bluetooth: 'm7 7 10 10-5 5V2l5 5L7 17',
  share: 'M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M16 6l-4-4-4 4M12 2v13',
  cash: 'M2 6h20v12H2zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 12h.01M18 12h.01',
  tag: 'M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L2 12V2h10l8.6 8.6a2 2 0 0 1 0 2.8zM7 7h.01',
};

export function Icon({ name, size = 22, stroke = 2 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width={stroke} stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d={P[name]} />
    </svg>
  );
}

/* ---------- bottom sheet ---------- */
export function Sheet({ title, onClose, children, footer, full }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return (
    <div class="sheet-backdrop" onClick={(e) => e.target === e.currentTarget && onClose?.()}>
      <div class={`sheet ${full ? 'full' : ''}`} role="dialog" aria-label={title}>
        <div class="sheet-head">
          <div class="sheet-title">{title}</div>
          {onClose && (
            <button class="icon-btn" onClick={onClose} aria-label="Tutup">
              <Icon name="x" />
            </button>
          )}
        </div>
        <div class="sheet-body">{children}</div>
        {footer && <div class="sheet-foot">{footer}</div>}
      </div>
    </div>
  );
}

/* ---------- toast & konfirmasi global ---------- */
export function UIHost() {
  const [state, set] = useState({ ...ui });
  useEffect(() => subscribeUI(set), []);
  const d = state.dialog;
  return (
    <>
      <div class="toasts">
        {state.toasts.map((t) => (
          <div key={t.id} class={`toast ${t.type}`}>
            {t.text}
          </div>
        ))}
      </div>
      {d && (
        <div class="sheet-backdrop center" onClick={(e) => e.target === e.currentTarget && d.resolve(false)}>
          <div class="dialog">
            <div class="dialog-title">{d.title}</div>
            {d.text && <div class="dialog-text">{d.text}</div>}
            <div class="row gap end">
              <button class="btn ghost" onClick={() => d.resolve(false)}>
                {d.cancel || 'Batal'}
              </button>
              <button class={`btn ${d.danger ? 'danger' : 'primary'}`} onClick={() => d.resolve(true)}>
                {d.ok || 'Ya'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ---------- input uang dengan pemisah ribuan ---------- */
export function MoneyInput({ value, onChange, placeholder = '0', autoFocus, ...rest }) {
  const ref = useRef();
  useEffect(() => {
    if (autoFocus) setTimeout(() => ref.current?.focus(), 50);
  }, []);
  return (
    <div class="money">
      <span>Rp</span>
      <input
        ref={ref}
        class="input"
        inputMode="numeric"
        placeholder={placeholder}
        value={value ? num(value) : ''}
        onInput={(e) => {
          const v = parseNum(e.currentTarget.value);
          onChange(v);
          e.currentTarget.value = v ? num(v) : '';
        }}
        onFocus={(e) => e.currentTarget.select()}
        {...rest}
      />
    </div>
  );
}

export function Field({ label, hint, children }) {
  return (
    <label class="field">
      <span class="field-label">{label}</span>
      {children}
      {hint && <span class="field-hint">{hint}</span>}
    </label>
  );
}

export function Empty({ icon = 'box', title, text, children }) {
  return (
    <div class="empty">
      <div class="empty-icon">
        <Icon name={icon} size={36} />
      </div>
      <div class="empty-title">{title}</div>
      {text && <div class="empty-text">{text}</div>}
      {children}
    </div>
  );
}

export function Header({ title, back, actions }) {
  return (
    <header class="topbar">
      {back && (
        <button class="icon-btn light" onClick={back} aria-label="Kembali">
          <Icon name="back" />
        </button>
      )}
      <h1>{title}</h1>
      <div class="topbar-actions">{actions}</div>
    </header>
  );
}

export function Segmented({ value, onChange, options }) {
  return (
    <div class="segmented">
      {options.map(([v, label]) => (
        <button key={v} class={value === v ? 'active' : ''} onClick={() => onChange(v)} type="button">
          {label}
        </button>
      ))}
    </div>
  );
}
