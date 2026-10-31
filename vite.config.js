import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { readFileSync } from 'node:fs';

// Membuat service worker berisi daftar semua file hasil build agar aplikasi jalan offline.
function serviceWorker() {
  return {
    name: 'pos-service-worker',
    apply: 'build',
    generateBundle(_, bundle) {
      const files = Object.keys(bundle).filter((f) => !f.endsWith('.map'));
      const extra = ['./', 'index.html', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png', 'beep.wav'];
      const list = [...new Set([...extra, ...files])];
      const version = Date.now().toString(36);
      const tpl = readFileSync('src/sw-template.js', 'utf8')
        .replace('__VERSION__', version)
        .replace('__FILES__', JSON.stringify(list));
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: tpl });
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [preact(), serviceWorker()],
  build: { target: 'es2019', chunkSizeWarningLimit: 900 },
});
