const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
  try {
    console.log('[PDF Generator] Memulai pembuatan PDF presentasi...');
    
    // Launch browser
    const browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    
    // Resolve absolute path to slides.html
    const filePath = path.resolve(__dirname, 'slides.html');
    const fileUrl = `file://${filePath}`;
    
    console.log(`[PDF Generator] Membuka file: ${fileUrl}`);
    await page.goto(fileUrl, {
      waitUntil: 'networkidle0'
    });
    
    // Set viewport to A4 Landscape ratio (approx 1414 x 1000)
    await page.setViewport({
      width: 1414,
      height: 1000,
      deviceScaleFactor: 2 // High resolution scale
    });
    
    // Path output PDF
    const outputPath = path.resolve(__dirname, '..', 'Tugas_Akhir_Client_Server_Programming.pdf');
    console.log(`[PDF Generator] Mencetak slide ke PDF di: ${outputPath}`);
    
    // Print to PDF
    await page.pdf({
      path: outputPath,
      format: 'A4',
      landscape: true,
      printBackground: true,
      margin: {
        top: '0mm',
        right: '0mm',
        bottom: '0mm',
        left: '0mm'
      }
    });
    
    await browser.close();
    console.log('===================================================');
    console.log(' PDF Presentasi Berhasil Dibuat!');
    console.log(` Lokasi file: Tugas_Akhir_Client_Server_Programming.pdf`);
    console.log('===================================================');
  } catch (error) {
    console.error('[PDF Generator] Terjadi kesalahan:', error);
    process.exit(1);
  }
})();
