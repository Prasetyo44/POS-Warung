import { render } from 'preact';
import { App } from './app.jsx';
import './styles.css';

render(<App />, document.getElementById('app'));

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  window.__installPrompt = e;
});

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

// minta penyimpanan permanen supaya data tidak dihapus otomatis oleh browser
navigator.storage?.persist?.().catch(() => {});
