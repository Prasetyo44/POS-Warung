import { useEffect, useState } from 'preact/hooks';
import { Icon, UIHost, useSettings } from './components/ui.jsx';
import { Kasir } from './pages/Kasir.jsx';
import { Produk } from './pages/Produk.jsx';
import { Stok } from './pages/Stok.jsx';
import { Laporan } from './pages/Laporan.jsx';
import { Menu, Pengaturan } from './pages/Menu.jsx';
import { Transaksi } from './pages/Transaksi.jsx';
import { Kasbon } from './pages/Kasbon.jsx';
import { Kas } from './pages/Kas.jsx';

const TABS = [
  ['kasir', 'cart', 'Kasir'],
  ['produk', 'box', 'Barang'],
  ['stok', 'layers', 'Stok'],
  ['laporan', 'chart', 'Laporan'],
  ['menu', 'menu', 'Menu'],
];
const SUB = { transaksi: Transaksi, kasbon: Kasbon, kas: Kas, pengaturan: Pengaturan };

const readHash = () => location.hash.replace(/^#\/?/, '') || 'kasir';

export function App() {
  const [route, setRoute] = useState(readHash);
  const settings = useSettings();

  useEffect(() => {
    const on = () => setRoute(readHash());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [route]);

  const go = (r) => (location.hash = '/' + r);
  if (!settings) return <div class="splash">Memuat...</div>;

  const [main, sub] = route.split('/');
  const back = () => history.back();
  let page;
  if (main === 'menu' && SUB[sub]) {
    const P = SUB[sub];
    page = <P settings={settings} back={back} key={sub} />;
  } else if (main === 'kasir') page = <Kasir settings={settings} />;
  else if (main === 'produk') page = <Produk />;
  else if (main === 'stok') page = <Stok />;
  else if (main === 'laporan') page = <Laporan />;
  else page = <Menu go={(k) => go('menu/' + k)} />;

  return (
    <div class="app">
      <main>{page}</main>
      <nav class="tabbar">
        {TABS.map(([k, icon, label]) => (
          <button class={main === k ? 'active' : ''} onClick={() => go(k)} aria-label={label}>
            <Icon name={icon} />
            <span>{label}</span>
          </button>
        ))}
      </nav>
      <UIHost />
    </div>
  );
}
