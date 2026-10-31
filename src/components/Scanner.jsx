import { useEffect, useRef, useState } from 'preact/hooks';
import { Icon } from './ui.jsx';
import { getSettings } from '../lib/db.js';

// Urutan = prioritas. Barcode produk (EAN/UPC) didahulukan bila satu kemasan punya beberapa kode.
const LINEAR = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'code_93', 'itf', 'codabar'];

async function makeNativeDetector(allowQR) {
  if (!('BarcodeDetector' in window)) return null;
  try {
    const supported = await window.BarcodeDetector.getSupportedFormats();
    const wanted = allowQR ? [...LINEAR, 'qr_code'] : LINEAR;
    const formats = wanted.filter((f) => supported.includes(f));
    if (!formats.length) return null;
    const det = new window.BarcodeDetector({ formats });
    return async (video) => {
      const res = await det.detect(video);
      if (!res.length) return null;
      res.sort((a, b) => wanted.indexOf(a.format) - wanted.indexOf(b.format));
      return res[0].rawValue ? { code: res[0].rawValue, format: res[0].format } : null;
    };
  } catch {
    return null;
  }
}

async function makeZxingDetector(canvas, allowQR) {
  const Z = await import('@zxing/library');
  const makeReader = (formats) => {
    const hints = new Map();
    hints.set(Z.DecodeHintType.POSSIBLE_FORMATS, formats);
    hints.set(Z.DecodeHintType.TRY_HARDER, true);
    const r = new Z.MultiFormatReader();
    r.setHints(hints);
    return r;
  };
  // Dua pembaca terpisah: barcode garis selalu dicoba dulu, QR hanya jika garis tidak terbaca
  // (MultiFormatReader dengan TRY_HARDER justru mencoba QR lebih dulu).
  const linear = makeReader([
    Z.BarcodeFormat.EAN_13, Z.BarcodeFormat.EAN_8, Z.BarcodeFormat.UPC_A, Z.BarcodeFormat.UPC_E,
    Z.BarcodeFormat.CODE_128, Z.BarcodeFormat.CODE_39, Z.BarcodeFormat.ITF,
  ]);
  const qr = allowQR ? makeReader([Z.BarcodeFormat.QR_CODE]) : null;
  // bitmap dibuat baru untuk tiap pembaca karena pembaca 1D memutar (mengubah) sumber gambar
  const tryRead = (reader, format) => {
    try {
      const bitmap = new Z.BinaryBitmap(new Z.HybridBinarizer(new Z.HTMLCanvasElementLuminanceSource(canvas)));
      return { code: reader.decodeWithState(bitmap).getText(), format };
    } catch {
      return null;
    } finally {
      reader.reset();
    }
  };
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  return async (video) => {
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw) return null;
    // ambil area tengah (sesuai kotak bidik) dan perkecil supaya cepat
    const cw = Math.min(vw, Math.round(vw * 0.9));
    const ch = Math.round(Math.min(vh, cw * 0.55));
    const scale = Math.min(1, 720 / cw);
    canvas.width = Math.round(cw * scale);
    canvas.height = Math.round(ch * scale);
    ctx.drawImage(video, (vw - cw) / 2, (vh - ch) / 2, cw, ch, 0, 0, canvas.width, canvas.height);
    return tryRead(linear, 'linear') || (qr && tryRead(qr, 'qr_code'));
  };
}

/**
 * Pemindai barcode pakai kamera HP.
 * continuous: tetap terbuka setelah berhasil scan (mode kasir).
 */
export function Scanner({ onDetected, onClose, continuous = false, title = 'Scan Barcode', allowQR }) {
  const videoRef = useRef();
  const canvasRef = useRef();
  const [error, setError] = useState('');
  const [torch, setTorch] = useState(false);
  const [torchOk, setTorchOk] = useState(false);
  const [last, setLast] = useState('');
  const [manual, setManual] = useState('');
  const trackRef = useRef();
  const cbRef = useRef(onDetected);
  cbRef.current = onDetected;

  useEffect(() => {
    let stream;
    let stopped = false;
    let timer;
    let lastCode = '';
    let lastTime = 0;

    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('Kamera tidak tersedia di browser ini.');
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (stopped) return stream.getTracks().forEach((t) => t.stop());
        const video = videoRef.current;
        video.srcObject = stream;
        await video.play();
        const track = stream.getVideoTracks()[0];
        trackRef.current = track;
        try {
          const caps = track.getCapabilities?.() || {};
          setTorchOk(!!caps.torch);
          if (caps.focusMode?.includes('continuous')) await track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] });
        } catch {}

        const qr = allowQR ?? (await getSettings()).scanQR;
        const detect = (await makeNativeDetector(qr)) || (await makeZxingDetector(canvasRef.current, qr));
        const loop = async () => {
          if (stopped) return;
          let hit = null;
          try {
            if (video.readyState >= 2) hit = await detect(video);
          } catch {}
          if (hit) {
            const code = hit.code;
            const now = Date.now();
            if (code !== lastCode || now - lastTime > 1800) {
              lastCode = code;
              lastTime = now;
              setLast(code);
              cbRef.current(code, hit.format);
              if (!continuous) return;
            }
          }
          timer = setTimeout(loop, 90);
        };
        loop();
      } catch (e) {
        const msg =
          e.name === 'NotAllowedError'
            ? 'Izin kamera ditolak. Buka pengaturan situs di Chrome dan izinkan Kamera.'
            : e.name === 'NotFoundError'
              ? 'Kamera tidak ditemukan.'
              : e.message || 'Kamera gagal dibuka.';
        setError(msg);
      }
    })();

    return () => {
      stopped = true;
      clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const toggleTorch = async () => {
    try {
      await trackRef.current.applyConstraints({ advanced: [{ torch: !torch }] });
      setTorch(!torch);
    } catch {}
  };

  const submitManual = (e) => {
    e.preventDefault();
    if (!manual.trim()) return;
    onDetected(manual.trim());
    setManual('');
  };

  return (
    <div class="scanner">
      <div class="scanner-top">
        <button class="icon-btn light" onClick={onClose} aria-label="Tutup">
          <Icon name="x" />
        </button>
        <div class="scanner-title">{title}</div>
        {torchOk ? (
          <button class={`icon-btn light ${torch ? 'on' : ''}`} onClick={toggleTorch} aria-label="Senter">
            <Icon name="flash" />
          </button>
        ) : (
          <span style="width:44px" />
        )}
      </div>
      <div class="scanner-view">
        <video ref={videoRef} playsInline muted />
        <canvas ref={canvasRef} hidden />
        <div class="scan-frame">
          <span class="scan-line" />
        </div>
        {error && <div class="scanner-error">{error}</div>}
      </div>
      <div class="scanner-bottom">
        <div class="scanner-hint">{last ? `Terbaca: ${last}` : 'Arahkan barcode kemasan ke dalam kotak'}</div>
        <form class="row gap" onSubmit={submitManual}>
          <input
            class="input dark"
            inputMode="numeric"
            placeholder="Atau ketik kode barcode"
            value={manual}
            onInput={(e) => setManual(e.currentTarget.value)}
          />
          <button class="btn primary" type="submit">
            OK
          </button>
        </form>
        {continuous && (
          <button class="btn block ghost-light" onClick={onClose}>
            Selesai Scan
          </button>
        )}
      </div>
    </div>
  );
}
