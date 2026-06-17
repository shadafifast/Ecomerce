const puppeteer = require('puppeteer');

(async () => {
  console.log('Capturing screenshots...');
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  await page.setViewport({ width: 1280, height: 800 });
  
  // 1. Main Page
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle0' });
  await page.screenshot({ path: 'demo_browser.png' });
  
  // 2. Add to Cart and Open Sidebar
  // Evaluate click on first "Tambah Ke Keranjang" button
  await page.evaluate(() => {
    document.querySelector('.product-actions button').click();
  });
  
  // Wait a moment for the toast and cart API call
  await new Promise(resolve => setTimeout(resolve, 500));
  
  // Open Cart sidebar
  await page.evaluate(() => {
    document.getElementById('cart-toggle-btn').click();
  });
  await new Promise(resolve => setTimeout(resolve, 500)); // wait for animation
  await page.screenshot({ path: 'demo_cart.png' });
  
  // 3. Checkout and Show History
  await page.evaluate(() => {
    document.getElementById('checkout-btn').click();
  });
  
  // Wait for checkout API, toast, and auto-open history modal
  await new Promise(resolve => setTimeout(resolve, 1500));
  await page.screenshot({ path: 'demo_checkout.png' });
  
  await browser.close();
  console.log('Screenshots captured successfully!');
})();
