// Membuat ikon PNG aplikasi dari SVG (jalankan: node scripts/icons.cjs)
const { chromium } = require('playwright');
const svg = (pad) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
<rect width="512" height="512" rx="${pad ? 0 : 112}" fill="#0f766e"/>
<g transform="translate(256 256) scale(${pad ? 0.72 : 0.9}) translate(-256 -256)">
<rect x="96" y="150" width="320" height="230" rx="28" fill="#fff"/>
<g fill="#0f766e">${[130,158,176,214,236,262,300,322,350].map((x,i)=>`<rect x="${x}" y="190" width="${[14,8,22,10,16,24,8,14,20][i]}" height="120"/>`).join('')}</g>
<rect x="120" y="330" width="272" height="24" rx="6" fill="#ea580c"/>
<rect x="70" y="248" width="372" height="10" rx="5" fill="#f43f5e"/>
</g></svg>`;
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  for (const [file, size, pad] of [['icon-192.png',192,false],['icon-512.png',512,false],['maskable-512.png',512,true]]) {
    await p.setViewportSize({ width: size, height: size });
    await p.setContent(`<style>body{margin:0}</style>${svg(pad).replace('<svg ', `<svg width="${size}" height="${size}" `)}`);
    await p.screenshot({ path: `public/icons/${file}`, omitBackground: true });
  }
  await b.close();
})();
