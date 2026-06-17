const puppeteer = require('../slides/node_modules/puppeteer');
const path = require('path');

(async () => {
  console.log('[PDF Generator] Memulai pembuatan PDF Artikel Ilmiah...');
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  const filePath = `file://${path.join(__dirname, 'artikel.html')}`;
  console.log(`[PDF Generator] Membuka file: ${filePath}`);
  
  await page.goto(filePath, { waitUntil: 'networkidle0' });
  
  const outPath = path.join(__dirname, '..', 'Artikel_Ilmiah_Client_Server_Ecommerce.pdf');
  await page.pdf({
    path: outPath,
    format: 'A4',
    printBackground: true,
    margin: {
      top: '0cm',
      bottom: '0cm',
      left: '0cm',
      right: '0cm'
    }
  });
  
  await browser.close();
  
  console.log('===================================================');
  console.log(' PDF Artikel Ilmiah Berhasil Dibuat!');
  console.log(` Lokasi file: Artikel_Ilmiah_Client_Server_Ecommerce.pdf`);
  console.log('===================================================');
})();
