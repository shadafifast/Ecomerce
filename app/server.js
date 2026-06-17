const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ========================================================
// SERVER-SENT EVENTS (SSE) - Live Activity Feed
// Menyimpan semua koneksi SSE yang aktif dari clients
// ========================================================
let sseClients = [];

function broadcastEvent(eventName, data) {
  const payload = `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
  sseClients.forEach(client => {
    try {
      client.res.write(payload);
    } catch (e) {
      // client mungkin sudah disconnect
    }
  });
  console.log(`[SSE Broadcast] Event: "${eventName}" -> ${sseClients.length} client(s) terhubung.`);
}

// Custom Logging Middleware
app.use((req, res, next) => {
  if (req.url.startsWith('/api')) {
    let details = '';
    if (req.method === 'POST' && req.body && req.body.quantity) {
      details = `- Qty: ${req.body.quantity}`;
    }
    if (req.url !== '/api/events') {
      console.log(`[HTTP Request] ${req.method} ${req.url} ${details}`);
    }

    const originalSend = res.json;
    res.json = function (body) {
      if (req.url !== '/api/events') {
        console.log(`[HTTP Response] ${res.statusCode} OK`);
      }
      return originalSend.call(this, body);
    };
  }
  next();
});

// ========================================================
// IN-MEMORY DATABASE
// ========================================================
let products = [
  {
    id: 1,
    name: "ApexPro Mechanical Keyboard",
    description: "Keyboard mekanik RGB dengan switch linier respons cepat dan keycap PBT double-shot.",
    price: 1250000,
    image: "images/keyboard.jpg",
    stock: 15
  },
  {
    id: 2,
    name: "Zenith X15 Gaming Laptop",
    description: "Laptop gaming performa tinggi dengan prosesor Intel i7 generasi terbaru dan grafis RTX 4060.",
    price: 18500000,
    image: "images/laptop.jpg",
    stock: 5
  },
  {
    id: 3,
    name: "AeroSound H3 Wireless Headphones",
    description: "Headphone nirkabel dengan Active Noise Cancellation (ANC) dan daya tahan baterai hingga 40 jam.",
    price: 1890000,
    image: "images/headphone.jpg",
    stock: 20
  },
  {
    id: 4,
    name: "Chronos Active Smartwatch",
    description: "Smartwatch dengan monitor kesehatan detak jantung, SpO2, pelacakan tidur, dan GPS bawaan.",
    price: 950000,
    image: "images/smartwatch.jpg",
    stock: 12
  },
  {
    id: 5,
    name: "Velocity G-Wireless Mouse",
    description: "Mouse gaming nirkabel ultra-ringan dengan sensor 26K DPI dan switch optik tahan lama.",
    price: 780000,
    image: "images/mouse.jpg",
    stock: 8
  }
];

let cart = [];
let transactions = [];
let wishlist = [];

// ========================================================
// REST API ENDPOINTS
// ========================================================

// ---- PRODUCTS ----

// 1. Get all products
app.get('/api/products', (req, res) => {
  res.json({ status: 'success', data: products });
});

// ---- CART ----

// 2. Get cart items
app.get('/api/cart', (req, res) => {
  const items = cart.map(item => {
    const product = products.find(p => p.id === item.productId);
    return {
      ...item,
      productName: product ? product.name : 'Unknown Product',
      price: product ? product.price : 0,
      image: product ? product.image : '',
      subtotal: (product ? product.price : 0) * item.quantity
    };
  });
  const totalAmount = items.reduce((acc, curr) => acc + curr.subtotal, 0);
  const totalQuantity = items.reduce((acc, curr) => acc + curr.quantity, 0);
  res.json({ status: 'success', data: { items, totalAmount, totalQuantity } });
});

// 3. Add to cart
app.post('/api/cart', (req, res) => {
  const { productId, quantity } = req.body;
  if (!productId || !quantity || quantity <= 0) {
    return res.status(400).json({ status: 'error', message: 'Invalid product ID or quantity.' });
  }
  const product = products.find(p => p.id === parseInt(productId));
  if (!product) return res.status(404).json({ status: 'error', message: 'Product not found.' });
  if (product.stock < quantity) {
    return res.status(400).json({ status: 'error', message: `Only ${product.stock} items left in stock.` });
  }
  const cartIndex = cart.findIndex(item => item.productId === parseInt(productId));
  if (cartIndex > -1) {
    const newQuantity = cart[cartIndex].quantity + parseInt(quantity);
    if (product.stock < newQuantity) {
      return res.status(400).json({ status: 'error', message: `Stock limit reached. You have ${cart[cartIndex].quantity} in cart, only ${product.stock} available.` });
    }
    cart[cartIndex].quantity = newQuantity;
  } else {
    cart.push({ productId: parseInt(productId), quantity: parseInt(quantity) });
  }

  broadcastEvent('cart_updated', {
    message: `Produk "${product.name}" ditambahkan ke keranjang.`,
    icon: 'fa-cart-plus',
    type: 'cart'
  });

  res.json({ status: 'success', message: 'Product added to cart successfully.' });
});

// 4. Update cart item quantity
app.put('/api/cart/:productId', (req, res) => {
  const productId = parseInt(req.params.productId);
  const { quantity } = req.body;
  if (quantity === undefined || quantity <= 0) {
    return res.status(400).json({ status: 'error', message: 'Quantity must be at least 1.' });
  }
  const product = products.find(p => p.id === productId);
  if (!product) return res.status(404).json({ status: 'error', message: 'Product not found.' });
  if (product.stock < quantity) {
    return res.status(400).json({ status: 'error', message: `Only ${product.stock} items left in stock.` });
  }
  const cartIndex = cart.findIndex(item => item.productId === productId);
  if (cartIndex === -1) return res.status(404).json({ status: 'error', message: 'Item not found in cart.' });
  cart[cartIndex].quantity = parseInt(quantity);
  res.json({ status: 'success', message: 'Cart updated successfully.' });
});

// 5. Delete item from cart
app.delete('/api/cart/:productId', (req, res) => {
  const productId = parseInt(req.params.productId);
  const cartIndex = cart.findIndex(item => item.productId === productId);
  if (cartIndex === -1) return res.status(404).json({ status: 'error', message: 'Item not found in cart.' });
  cart.splice(cartIndex, 1);
  res.json({ status: 'success', message: 'Item removed from cart.' });
});

// ---- WISHLIST ----

// 6. Get wishlist
app.get('/api/wishlist', (req, res) => {
  const items = wishlist.map(item => {
    const product = products.find(p => p.id === item.productId);
    if (!product) return null;
    return { ...item, ...product };
  }).filter(Boolean);
  res.json({ status: 'success', data: items });
});

// 7. Add to wishlist
app.post('/api/wishlist', (req, res) => {
  const { productId } = req.body;
  if (!productId) return res.status(400).json({ status: 'error', message: 'Product ID is required.' });

  const product = products.find(p => p.id === parseInt(productId));
  if (!product) return res.status(404).json({ status: 'error', message: 'Product not found.' });

  // Server-side validasi: Cegah duplikasi di wishlist
  const alreadyExists = wishlist.find(item => item.productId === parseInt(productId));
  if (alreadyExists) {
    return res.status(409).json({ status: 'error', message: 'Produk sudah ada di wishlist.' });
  }

  wishlist.push({ productId: parseInt(productId), addedAt: new Date().toISOString() });

  broadcastEvent('wishlist_updated', {
    message: `Produk "${product.name}" ditambahkan ke wishlist.`,
    icon: 'fa-heart',
    type: 'wishlist'
  });

  res.json({ status: 'success', message: 'Produk berhasil ditambahkan ke wishlist.' });
});

// 8. Remove from wishlist
app.delete('/api/wishlist/:productId', (req, res) => {
  const productId = parseInt(req.params.productId);
  const index = wishlist.findIndex(item => item.productId === productId);
  if (index === -1) return res.status(404).json({ status: 'error', message: 'Produk tidak ada di wishlist.' });
  wishlist.splice(index, 1);
  res.json({ status: 'success', message: 'Produk dihapus dari wishlist.' });
});

// ---- CHECKOUT & PAYMENT ----

// 9. Checkout - Creates a PENDING transaction (does NOT cut stock yet)
app.post('/api/checkout', (req, res) => {
  if (cart.length === 0) {
    return res.status(400).json({ status: 'error', message: 'Keranjang kosong. Tidak dapat checkout.' });
  }

  let itemsToCheckout = [];
  let totalBill = 0;

  // Validasi stok sebelum membuat tagihan
  for (let item of cart) {
    const product = products.find(p => p.id === item.productId);
    if (!product || product.stock < item.quantity) {
      return res.status(400).json({
        status: 'error',
        message: `Stok konflik: Produk "${product ? product.name : 'Unknown'}" stok tidak mencukupi.`
      });
    }
    // Harga diambil murni dari database server, BUKAN dari client (mencegah price tampering)
    itemsToCheckout.push({
      productId: item.productId,
      name: product.name,
      price: product.price,
      quantity: item.quantity,
      subtotal: product.price * item.quantity
    });
    totalBill += product.price * item.quantity;
  }

  const transactionId = 'TRX-' + Date.now();
  const transaction = {
    id: transactionId,
    date: new Date().toISOString(),
    items: itemsToCheckout,
    total: totalBill,
    status: 'PENDING',    // Menunggu Pembayaran
    paidAt: null,
    amountPaid: null,
    changeAmount: null,
    trackingStatus: null  // akan diisi setelah PAID
  };

  transactions.push(transaction);
  cart = []; // Kosongkan keranjang setelah checkout

  broadcastEvent('new_order', {
    message: `Tagihan baru #${transactionId} dibuat. Menunggu pembayaran.`,
    icon: 'fa-file-invoice',
    type: 'order'
  });

  res.json({
    status: 'success',
    message: 'Tagihan berhasil dibuat! Silakan selesaikan pembayaran.',
    data: transaction
  });
});

// 10. Payment - Validates amount and marks transaction as PAID
app.post('/api/payment', (req, res) => {
  const { transactionId, amount } = req.body;

  if (!transactionId || amount === undefined) {
    return res.status(400).json({ status: 'error', message: 'Transaction ID dan nominal pembayaran wajib diisi.' });
  }

  const transaction = transactions.find(t => t.id === transactionId);
  if (!transaction) {
    return res.status(404).json({ status: 'error', message: 'Transaksi tidak ditemukan.' });
  }

  if (transaction.status !== 'PENDING') {
    return res.status(400).json({ status: 'error', message: 'Transaksi ini sudah diproses sebelumnya.' });
  }

  const amountPaid = parseFloat(amount);

  // === VALIDASI KRITIS DI SISI SERVER ===
  // Server memastikan jumlah uang yang dikirim client CUKUP.
  // Client tidak bisa memanipulasi total tagihan karena server menghitung sendiri.
  if (amountPaid < transaction.total) {
    const kekurangan = transaction.total - amountPaid;
    return res.status(400).json({
      status: 'error',
      message: `Pembayaran kurang sebesar Rp ${kekurangan.toLocaleString('id-ID')}. Tagihan: Rp ${transaction.total.toLocaleString('id-ID')}, Dibayar: Rp ${amountPaid.toLocaleString('id-ID')}.`
    });
  }

  // Stok dipotong HANYA setelah pembayaran valid diterima server
  for (let item of transaction.items) {
    const product = products.find(p => p.id === item.productId);
    if (product) {
      product.stock -= item.quantity;
    }
  }

  // Update status transaksi
  transaction.status = 'PAID';
  transaction.paidAt = new Date().toISOString();
  transaction.amountPaid = amountPaid;
  transaction.changeAmount = amountPaid - transaction.total;
  transaction.trackingStatus = 'PROCESSING'; // Mulai diproses setelah dibayar

  broadcastEvent('payment_received', {
    message: `Pembayaran untuk #${transactionId} diterima. Pesanan sedang diproses.`,
    icon: 'fa-circle-check',
    type: 'payment'
  });

  res.json({
    status: 'success',
    message: 'Pembayaran berhasil! Pesanan sedang diproses.',
    data: {
      transactionId: transaction.id,
      total: transaction.total,
      amountPaid: transaction.amountPaid,
      changeAmount: transaction.changeAmount,
      status: transaction.status,
      trackingStatus: transaction.trackingStatus
    }
  });
});

// ---- ORDER TRACKING ----

// 11. Advance order tracking status
app.put('/api/transactions/:id/status', (req, res) => {
  const { id } = req.params;
  const transaction = transactions.find(t => t.id === id);

  if (!transaction) return res.status(404).json({ status: 'error', message: 'Transaksi tidak ditemukan.' });
  if (transaction.status !== 'PAID') {
    return res.status(400).json({ status: 'error', message: 'Pesanan harus sudah dibayar sebelum diupdate statusnya.' });
  }

  const trackingFlow = ['PROCESSING', 'SHIPPED', 'DELIVERED'];
  const currentIndex = trackingFlow.indexOf(transaction.trackingStatus);

  if (currentIndex === -1 || currentIndex >= trackingFlow.length - 1) {
    return res.status(400).json({ status: 'error', message: 'Pesanan sudah berada di status akhir (DELIVERED).' });
  }

  const nextStatus = trackingFlow[currentIndex + 1];
  transaction.trackingStatus = nextStatus;

  const statusLabels = {
    SHIPPED: 'Sedang Dikirim',
    DELIVERED: 'Pesanan Selesai'
  };

  broadcastEvent('order_status_updated', {
    message: `Pesanan #${id} diperbarui: ${statusLabels[nextStatus] || nextStatus}.`,
    icon: nextStatus === 'SHIPPED' ? 'fa-truck' : 'fa-box-open',
    type: 'tracking'
  });

  res.json({
    status: 'success',
    message: `Status pesanan berhasil diperbarui menjadi: ${nextStatus}`,
    data: { transactionId: id, trackingStatus: nextStatus }
  });
});

// 12. Get all transactions
app.get('/api/transactions', (req, res) => {
  res.json({ status: 'success', data: transactions });
});

// ---- SERVER-SENT EVENTS (SSE) ----

// 13. SSE - Live Activity Feed
// Client membuka koneksi persistent dan server PUSH event secara real-time
app.get('/api/events', (req, res) => {
  // Set headers untuk SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const clientId = Date.now();
  const newClient = { id: clientId, res };
  sseClients.push(newClient);

  console.log(`[SSE] Client #${clientId} terhubung. Total klien: ${sseClients.length}`);

  // Kirim event sambutan saat client pertama kali terhubung
  res.write(`event: connected\ndata: ${JSON.stringify({ message: `Anda terhubung ke Live Feed. Client ID: ${clientId}` })}\n\n`);

  // Hapus client dari list jika koneksi terputus
  req.on('close', () => {
    sseClients = sseClients.filter(c => c.id !== clientId);
    console.log(`[SSE] Client #${clientId} terputus. Sisa klien: ${sseClients.length}`);
  });
});

// Start Server
app.listen(PORT, () => {
  console.log(`===================================================`);
  console.log(` E-Commerce Client-Server App is running!`);
  console.log(` REST API URL:    http://localhost:${PORT}/api`);
  console.log(` Web Client URL:  http://localhost:${PORT}/index.html`);
  console.log(` SSE Live Feed:   http://localhost:${PORT}/api/events`);
  console.log(`===================================================`);
});
