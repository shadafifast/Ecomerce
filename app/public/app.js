// ============================================================
// API BASE URL (relative - served from same domain/port)
// ============================================================
const API_BASE = '/api';

// ============================================================
// UTILITY
// ============================================================
const formatRupiah = (number) => new Intl.NumberFormat('id-ID', {
  style: 'currency', currency: 'IDR', minimumFractionDigits: 0, maximumFractionDigits: 0
}).format(number);

// ============================================================
// STATE
// ============================================================
let currentTransactionId = null;
let currentTransactionTotal = 0;
let selectedPaymentMethod = 'Tunai';
let wishlistIds = new Set(); // client-side cache for heart button toggle
let liveFeedCount = 0;

// ============================================================
// DOM ELEMENTS
// ============================================================
const productsGrid = document.getElementById('products-grid');
const cartItemsContainer = document.getElementById('cart-items-container');
const cartBadge = document.getElementById('cart-badge');
const cartTotalQty = document.getElementById('cart-total-qty');
const cartTotalPrice = document.getElementById('cart-total-price');
const checkoutBtn = document.getElementById('checkout-btn');

const cartSidebar = document.getElementById('cart-sidebar');
const cartToggleBtn = document.getElementById('cart-toggle-btn');
const closeCartBtn = document.getElementById('close-cart-btn');
const cartBackdrop = document.getElementById('cart-backdrop');

const wishlistSidebar = document.getElementById('wishlist-sidebar');
const wishlistToggleBtn = document.getElementById('wishlist-toggle-btn');
const closeWishlistBtn = document.getElementById('close-wishlist-btn');
const wishlistBackdrop = document.getElementById('wishlist-backdrop');
const wishlistBadge = document.getElementById('wishlist-badge');
const wishlistItemsContainer = document.getElementById('wishlist-items-container');

const transactionsModal = document.getElementById('transactions-modal');
const viewTransactionsBtn = document.getElementById('view-transactions-btn');
const closeTransactionsBtn = document.getElementById('close-transactions-btn');
const transactionsBackdrop = document.getElementById('transactions-backdrop');
const transactionsContainer = document.getElementById('transactions-container');

const paymentModal = document.getElementById('payment-modal');
const closePaymentBtn = document.getElementById('close-payment-btn');
const payNowBtn = document.getElementById('pay-now-btn');
const paymentAmountInput = document.getElementById('payment-amount-input');
const paymentErrorMsg = document.getElementById('payment-error-msg');
const paymentChangePreview = document.getElementById('payment-change-preview');

const paymentSuccessModal = document.getElementById('payment-success-modal');
const closeSuccessBtn = document.getElementById('close-success-btn');

const liveFeedPanel = document.getElementById('live-feed-panel');
const liveFeedEventsEl = document.getElementById('live-feed-events');
const liveFeedBadge = document.getElementById('live-feed-badge');
const viewLiveFeedBtn = document.getElementById('view-live-feed-btn');
const closeLiveFeedBtn = document.getElementById('close-live-feed-btn');
const sseStatus = document.getElementById('sse-status');
const toastContainer = document.getElementById('toast-container');

// ============================================================
// INIT
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  console.log('[Client] Aplikasi dimulai, menghubungi REST API...');
  fetchProducts();
  fetchCart();
  fetchWishlist();
  initSSE();   // Server-Sent Events
});

// ============================================================
// EVENT LISTENERS
// ============================================================
cartToggleBtn.addEventListener('click', () => toggleCart(true));
closeCartBtn.addEventListener('click', () => toggleCart(false));
cartBackdrop.addEventListener('click', () => toggleCart(false));

wishlistToggleBtn.addEventListener('click', () => toggleWishlistSidebar(true));
closeWishlistBtn.addEventListener('click', () => toggleWishlistSidebar(false));
wishlistBackdrop.addEventListener('click', () => toggleWishlistSidebar(false));

viewTransactionsBtn.addEventListener('click', () => {
  toggleTransactions(true);
  fetchTransactions();
});
closeTransactionsBtn.addEventListener('click', () => toggleTransactions(false));
transactionsBackdrop.addEventListener('click', () => toggleTransactions(false));

checkoutBtn.addEventListener('click', checkout);
payNowBtn.addEventListener('click', processPayment);
closePaymentBtn.addEventListener('click', () => {
  paymentModal.classList.remove('active');
  // Show toast to inform invoice is still pending
  showToast('Tagihan masih menunggu pembayaran. Cek Riwayat Pesanan.', 'info');
});

closeSuccessBtn.addEventListener('click', () => {
  paymentSuccessModal.classList.remove('active');
  toggleTransactions(true);
  fetchTransactions();
});

viewLiveFeedBtn.addEventListener('click', () => {
  liveFeedPanel.classList.toggle('active');
  liveFeedBadge.style.display = 'none';
  liveFeedBadge.textContent = '0';
  liveFeedCount = 0;
});
closeLiveFeedBtn.addEventListener('click', () => liveFeedPanel.classList.remove('active'));

// Payment amount live preview
paymentAmountInput.addEventListener('input', () => {
  const amount = parseFloat(paymentAmountInput.value) || 0;
  if (amount > 0 && currentTransactionTotal > 0) {
    const change = amount - currentTransactionTotal;
    if (change >= 0) {
      paymentChangePreview.style.display = 'block';
      paymentChangePreview.innerHTML = `<i class="fa-solid fa-coins"></i> Kembalian: <strong>${formatRupiah(change)}</strong>`;
      paymentChangePreview.className = 'payment-change-preview success';
      paymentErrorMsg.style.display = 'none';
    } else {
      paymentChangePreview.style.display = 'block';
      paymentChangePreview.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> Kurang: <strong>${formatRupiah(Math.abs(change))}</strong>`;
      paymentChangePreview.className = 'payment-change-preview error-preview';
    }
  } else {
    paymentChangePreview.style.display = 'none';
  }
});

// ============================================================
// TOAST
// ============================================================
function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  let iconClass = 'fa-circle-info';
  if (type === 'success') iconClass = 'fa-circle-check';
  if (type === 'error') iconClass = 'fa-circle-exclamation';
  toast.innerHTML = `
    <i class="fa-solid ${iconClass} toast-icon"></i>
    <div class="toast-body">${message}</div>
  `;
  toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(-20px)';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// ============================================================
// TOGGLE HELPERS
// ============================================================
function toggleCart(show) {
  cartSidebar.classList.toggle('active', show);
  if (show) toggleWishlistSidebar(false);
}
function toggleWishlistSidebar(show) {
  wishlistSidebar.classList.toggle('active', show);
  if (show) { toggleCart(false); fetchWishlist(); }
}
function toggleTransactions(show) {
  transactionsModal.classList.toggle('active', show);
}

// ============================================================
// SERVER-SENT EVENTS (SSE) — LIVE ACTIVITY FEED
// Client membuka persistent connection ke server.
// Server PUSH data secara real-time tanpa client polling.
// ============================================================
function initSSE() {
  console.log('[SSE] Membuka koneksi ke /api/events...');
  const eventSource = new EventSource(`${API_BASE}/events`);

  eventSource.addEventListener('connected', (e) => {
    const data = JSON.parse(e.data);
    sseStatus.className = 'sse-indicator online';
    console.log('[SSE] Terhubung!', data.message);
    addLiveFeedItem('connected', data.message, 'fa-plug', 'system');
  });

  const sseEvents = ['cart_updated', 'wishlist_updated', 'new_order', 'payment_received', 'order_status_updated'];
  sseEvents.forEach(eventName => {
    eventSource.addEventListener(eventName, (e) => {
      const data = JSON.parse(e.data);
      console.log(`[SSE Event Received] "${eventName}":`, data);
      addLiveFeedItem(eventName, data.message, data.icon, data.type);
      // Auto-refresh transaksi jika modal terbuka
      if (transactionsModal.classList.contains('active')) fetchTransactions();
      // Auto-refresh produk saat payment diterima (stok berubah)
      if (eventName === 'payment_received') fetchProducts();
    });
  });

  eventSource.onerror = () => {
    sseStatus.className = 'sse-indicator offline';
    console.warn('[SSE] Koneksi terputus. Mencoba reconnect...');
  };
}

function addLiveFeedItem(eventName, message, icon, type) {
  // Hapus placeholder jika ada
  const empty = liveFeedEventsEl.querySelector('.live-feed-empty');
  if (empty) empty.remove();

  const now = new Date().toLocaleTimeString('id-ID');
  const item = document.createElement('div');
  item.className = `live-event-item live-event-${type}`;
  item.innerHTML = `
    <div class="live-event-icon"><i class="fa-solid ${icon || 'fa-bolt'}"></i></div>
    <div class="live-event-body">
      <span class="live-event-msg">${message}</span>
      <span class="live-event-time">${now}</span>
    </div>
  `;

  // Prepend so latest is on top
  liveFeedEventsEl.insertBefore(item, liveFeedEventsEl.firstChild);

  // Badge counter jika panel tidak terlihat
  if (!liveFeedPanel.classList.contains('active')) {
    liveFeedCount++;
    liveFeedBadge.textContent = liveFeedCount;
    liveFeedBadge.style.display = 'inline-flex';
  }
}

function clearLiveFeed() {
  liveFeedEventsEl.innerHTML = `
    <div class="live-feed-empty">
      <i class="fa-solid fa-satellite-dish"></i>
      <p>Feed dibersihkan. Menunggu event baru...</p>
    </div>
  `;
}

// ============================================================
// 1. FETCH PRODUCTS
// ============================================================
async function fetchProducts() {
  console.log('[HTTP Request] GET /api/products');
  try {
    const response = await fetch(`${API_BASE}/products`);
    const result = await response.json();
    if (result.status === 'success') renderProducts(result.data);
    else showToast('Gagal memuat produk.', 'error');
  } catch (error) {
    console.error('[Client Error] fetchProducts:', error);
    showToast('Koneksi server gagal.', 'error');
    productsGrid.innerHTML = `<div class="loading-spinner"><i class="fa-solid fa-triangle-exclamation" style="color:var(--accent)"></i><p>Gagal terhubung ke server API.</p></div>`;
  }
}

function renderProducts(products) {
  if (products.length === 0) {
    productsGrid.innerHTML = '<p class="loading-spinner">Tidak ada produk tersedia.</p>';
    return;
  }
  productsGrid.innerHTML = products.map(product => {
    const isOutOfStock = product.stock <= 0;
    const isLowStock = product.stock > 0 && product.stock <= 5;
    const isWishlisted = wishlistIds.has(product.id);
    return `
      <div class="product-card">
        <div class="product-img-wrapper">
          <img src="${product.image}" alt="${product.name}" onerror="this.src='https://via.placeholder.com/300x200?text=${encodeURIComponent(product.name)}'">
          <button class="wishlist-heart-btn ${isWishlisted ? 'wishlisted' : ''}" onclick="toggleWishlist(${product.id})" title="${isWishlisted ? 'Hapus dari Wishlist' : 'Tambah ke Wishlist'}">
            <i class="fa-${isWishlisted ? 'solid' : 'regular'} fa-heart"></i>
          </button>
          ${isLowStock ? '<span class="stock-badge low">Stok Terbatas</span>' : ''}
          ${isOutOfStock ? '<span class="stock-badge out">Habis</span>' : ''}
        </div>
        <div class="product-info">
          <h3 class="product-name">${product.name}</h3>
          <p class="product-desc">${product.description}</p>
          <div class="product-meta">
            <span class="product-price">${formatRupiah(product.price)}</span>
            <span class="product-stock ${isLowStock || isOutOfStock ? 'low-stock' : ''}">
              ${isOutOfStock ? 'Stok Habis' : `Stok: ${product.stock}`}
            </span>
          </div>
          <div class="product-actions">
            <button class="btn btn-primary btn-block" onclick="addToCart(${product.id})" ${isOutOfStock ? 'disabled' : ''}>
              <i class="fa-solid fa-cart-plus"></i> ${isOutOfStock ? 'Stok Habis' : 'Tambah Ke Keranjang'}
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// ============================================================
// 2. CART
// ============================================================
async function fetchCart() {
  try {
    const response = await fetch(`${API_BASE}/cart`);
    const result = await response.json();
    if (result.status === 'success') renderCart(result.data);
  } catch (error) {
    console.error('[Client Error] fetchCart:', error);
  }
}

function renderCart(cartData) {
  const { items, totalAmount, totalQuantity } = cartData;
  cartBadge.innerText = totalQuantity;
  cartTotalQty.innerText = totalQuantity;
  cartTotalPrice.innerText = formatRupiah(totalAmount);

  if (items.length === 0) {
    cartItemsContainer.innerHTML = `
      <div class="empty-cart-message">
        <i class="fa-solid fa-basket-shopping"></i>
        <p>Keranjang belanja kosong</p>
      </div>
    `;
    checkoutBtn.disabled = true;
    return;
  }
  checkoutBtn.disabled = false;
  cartItemsContainer.innerHTML = items.map(item => `
    <div class="cart-item">
      <img src="${item.image}" alt="${item.productName}" class="cart-item-img" onerror="this.src='https://via.placeholder.com/60x60?text=Prod'">
      <div class="cart-item-info">
        <div class="cart-item-name">${item.productName}</div>
        <div class="cart-item-price">${formatRupiah(item.price)}</div>
        <div class="cart-item-subtotal">Subtotal: ${formatRupiah(item.subtotal)}</div>
      </div>
      <div class="cart-item-actions">
        <button class="remove-item-btn" onclick="removeFromCart(${item.productId})">
          <i class="fa-regular fa-trash-can"></i>
        </button>
        <div class="quantity-control">
          <button class="quantity-btn" onclick="updateQuantity(${item.productId}, ${item.quantity - 1})">-</button>
          <span class="quantity-val">${item.quantity}</span>
          <button class="quantity-btn" onclick="updateQuantity(${item.productId}, ${item.quantity + 1})">+</button>
        </div>
      </div>
    </div>
  `).join('');
}

async function addToCart(productId) {
  console.log(`[HTTP Request] POST /api/cart - productId: ${productId}`);
  try {
    const response = await fetch(`${API_BASE}/cart`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId, quantity: 1 })
    });
    const result = await response.json();
    if (result.status === 'success') {
      showToast('Berhasil dimasukkan ke keranjang!', 'success');
      fetchCart();
    } else {
      showToast(result.message || 'Gagal menambahkan ke keranjang.', 'error');
    }
  } catch (error) {
    showToast('Gagal terhubung ke server.', 'error');
  }
}

async function updateQuantity(productId, quantity) {
  if (quantity <= 0) { removeFromCart(productId); return; }
  try {
    const response = await fetch(`${API_BASE}/cart/${productId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quantity })
    });
    const result = await response.json();
    if (result.status === 'success') fetchCart();
    else showToast(result.message || 'Gagal mengubah kuantitas.', 'error');
  } catch (error) { console.error(error); }
}

async function removeFromCart(productId) {
  try {
    const response = await fetch(`${API_BASE}/cart/${productId}`, { method: 'DELETE' });
    const result = await response.json();
    if (result.status === 'success') { showToast('Item dihapus dari keranjang.', 'info'); fetchCart(); }
    else showToast(result.message || 'Gagal menghapus item.', 'error');
  } catch (error) { console.error(error); }
}

// ============================================================
// 3. WISHLIST
// ============================================================
async function fetchWishlist() {
  console.log('[HTTP Request] GET /api/wishlist');
  try {
    const response = await fetch(`${API_BASE}/wishlist`);
    const result = await response.json();
    if (result.status === 'success') {
      wishlistIds = new Set(result.data.map(item => item.id));
      wishlistBadge.innerText = result.data.length;
      renderWishlist(result.data);
    }
  } catch (error) { console.error('[Client Error] fetchWishlist:', error); }
}

function renderWishlist(items) {
  if (items.length === 0) {
    wishlistItemsContainer.innerHTML = `
      <div class="empty-cart-message">
        <i class="fa-regular fa-heart" style="color: var(--accent);"></i>
        <p>Wishlist Anda masih kosong</p>
      </div>
    `;
    return;
  }
  wishlistItemsContainer.innerHTML = items.map(item => `
    <div class="wishlist-item">
      <img src="${item.image}" alt="${item.name}" class="cart-item-img" onerror="this.src='https://via.placeholder.com/60x60?text=Prod'">
      <div class="cart-item-info">
        <div class="cart-item-name">${item.name}</div>
        <div class="cart-item-price">${formatRupiah(item.price)}</div>
        <span class="product-stock ${item.stock <= 0 ? 'low-stock' : ''}">${item.stock <= 0 ? 'Stok Habis' : `Stok: ${item.stock}`}</span>
      </div>
      <div class="wishlist-item-actions">
        <button class="btn btn-sm btn-primary" onclick="moveToCart(${item.id})" ${item.stock <= 0 ? 'disabled' : ''} title="Pindah ke Keranjang">
          <i class="fa-solid fa-cart-plus"></i>
        </button>
        <button class="remove-item-btn" onclick="toggleWishlist(${item.id})" title="Hapus dari Wishlist">
          <i class="fa-solid fa-heart-crack"></i>
        </button>
      </div>
    </div>
  `).join('');
}

async function toggleWishlist(productId) {
  if (wishlistIds.has(productId)) {
    // Remove from wishlist
    console.log(`[HTTP Request] DELETE /api/wishlist/${productId}`);
    try {
      const response = await fetch(`${API_BASE}/wishlist/${productId}`, { method: 'DELETE' });
      const result = await response.json();
      if (result.status === 'success') {
        showToast('Dihapus dari wishlist.', 'info');
        fetchWishlist();
        fetchProducts(); // re-render heart buttons
      } else showToast(result.message, 'error');
    } catch (e) { showToast('Gagal menghubungi server.', 'error'); }
  } else {
    // Add to wishlist
    console.log(`[HTTP Request] POST /api/wishlist - productId: ${productId}`);
    try {
      const response = await fetch(`${API_BASE}/wishlist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId })
      });
      const result = await response.json();
      if (result.status === 'success') {
        showToast('Ditambahkan ke wishlist! ❤️', 'success');
        fetchWishlist();
        fetchProducts();
      } else {
        showToast(result.message, 'error'); // e.g. "Sudah ada di wishlist" from server
      }
    } catch (e) { showToast('Gagal menghubungi server.', 'error'); }
  }
}

async function moveToCart(productId) {
  // First add to cart
  try {
    const res = await fetch(`${API_BASE}/cart`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId, quantity: 1 })
    });
    const result = await res.json();
    if (result.status === 'success') {
      showToast('Dipindahkan ke keranjang!', 'success');
      fetchCart();
      toggleWishlistSidebar(false);
      toggleCart(true);
    } else showToast(result.message, 'error');
  } catch (e) { showToast('Gagal menghubungi server.', 'error'); }
}

// ============================================================
// 4. CHECKOUT — Membuat tagihan PENDING (belum potong stok)
// ============================================================
async function checkout() {
  checkoutBtn.disabled = true;
  console.log('[HTTP Request] POST /api/checkout - Membuat tagihan...');
  try {
    const response = await fetch(`${API_BASE}/checkout`, { method: 'POST' });
    const result = await response.json();
    console.log('[HTTP Response] POST /api/checkout:', result);

    if (result.status === 'success') {
      const trx = result.data;
      currentTransactionId = trx.id;
      currentTransactionTotal = trx.total;

      // Populate payment modal
      document.getElementById('payment-trx-id').textContent = trx.id;
      document.getElementById('payment-total').textContent = formatRupiah(trx.total);
      document.getElementById('payment-items-list').innerHTML = trx.items.map(item =>
        `<div class="invoice-item-row">
          <span>${item.name} x${item.quantity}</span>
          <span>${formatRupiah(item.subtotal)}</span>
        </div>`
      ).join('');

      paymentAmountInput.value = '';
      paymentErrorMsg.style.display = 'none';
      paymentChangePreview.style.display = 'none';

      toggleCart(false);
      fetchCart(); // Cart is now empty
      paymentModal.classList.add('active'); // Open payment modal
    } else {
      showToast(result.message || 'Checkout gagal.', 'error');
      checkoutBtn.disabled = false;
    }
  } catch (error) {
    console.error('[Client Error] checkout:', error);
    showToast('Terjadi kesalahan pada server.', 'error');
    checkoutBtn.disabled = false;
  }
}

// ============================================================
// 5. PAYMENT — Server validasi nominal, lalu potong stok
// ============================================================
async function processPayment() {
  const amount = parseFloat(paymentAmountInput.value);
  if (!amount || amount <= 0) {
    paymentErrorMsg.textContent = 'Masukkan nominal pembayaran yang valid.';
    paymentErrorMsg.style.display = 'block';
    return;
  }

  payNowBtn.disabled = true;
  payNowBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Memproses...';
  console.log(`[HTTP Request] POST /api/payment - TRX: ${currentTransactionId}, Amount: ${amount}`);

  try {
    const response = await fetch(`${API_BASE}/payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transactionId: currentTransactionId, amount })
    });
    const result = await response.json();
    console.log('[HTTP Response] POST /api/payment:', result);

    if (result.status === 'success') {
      paymentModal.classList.remove('active');
      paymentErrorMsg.style.display = 'none';

      // Show success modal
      document.getElementById('success-trx-info').textContent = `No. Transaksi: ${result.data.transactionId} | Metode: ${selectedPaymentMethod}`;
      document.getElementById('success-total').textContent = formatRupiah(result.data.total);
      document.getElementById('success-paid').textContent = formatRupiah(result.data.amountPaid);
      document.getElementById('success-change').textContent = formatRupiah(result.data.changeAmount);
      paymentSuccessModal.classList.add('active');

      fetchProducts(); // Stok sudah berubah di server
    } else {
      // Server rejection — ini yang paling penting untuk demonstrasi client-server!
      paymentErrorMsg.textContent = `❌ Server menolak: ${result.message}`;
      paymentErrorMsg.style.display = 'block';
    }
  } catch (error) {
    paymentErrorMsg.textContent = 'Gagal terhubung ke server pembayaran.';
    paymentErrorMsg.style.display = 'block';
  } finally {
    payNowBtn.disabled = false;
    payNowBtn.innerHTML = '<i class="fa-solid fa-lock"></i> Bayar Sekarang (POST /api/payment)';
  }
}

function selectPaymentMethod(btn, method) {
  selectedPaymentMethod = method;
  document.querySelectorAll('.payment-method-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
}

// ============================================================
// 6. TRANSACTIONS & ORDER TRACKING
// ============================================================
async function fetchTransactions() {
  console.log('[HTTP Request] GET /api/transactions');
  try {
    const response = await fetch(`${API_BASE}/transactions`);
    const result = await response.json();
    if (result.status === 'success') renderTransactions(result.data);
  } catch (error) { console.error('[Client Error] fetchTransactions:', error); }
}

function renderTransactions(transactions) {
  if (transactions.length === 0) {
    transactionsContainer.innerHTML = `
      <div class="empty-cart-message">
        <i class="fa-solid fa-receipt"></i>
        <p>Belum ada riwayat transaksi</p>
      </div>
    `;
    return;
  }

  const statusInfo = {
    PENDING: { label: 'Menunggu Pembayaran', cls: 'badge-pending', icon: 'fa-clock' },
    PAID: { label: 'Dibayar', cls: 'badge-paid', icon: 'fa-circle-check' },
  };
  const trackingInfo = {
    PROCESSING: { label: 'Sedang Diproses', cls: 'track-processing', icon: 'fa-gear', step: 1 },
    SHIPPED: { label: 'Sedang Dikirim', cls: 'track-shipped', icon: 'fa-truck', step: 2 },
    DELIVERED: { label: 'Pesanan Selesai', cls: 'track-delivered', icon: 'fa-box-open', step: 3 },
  };

  transactionsContainer.innerHTML = [...transactions].reverse().map(trx => {
    const formattedDate = new Date(trx.date).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
    const sInfo = statusInfo[trx.status] || statusInfo.PENDING;
    const itemListHTML = trx.items.map(item => `
      <li>
        <span class="trx-item-name">${item.name} (x${item.quantity})</span>
        <span>${formatRupiah(item.subtotal)}</span>
      </li>
    `).join('');

    let trackingHTML = '';
    let actionHTML = '';

    if (trx.status === 'PENDING') {
      actionHTML = `
        <button class="btn btn-warning btn-sm btn-block" onclick="reopenPayment('${trx.id}', ${trx.total})">
          <i class="fa-solid fa-money-bill-wave"></i> Lanjutkan Pembayaran
        </button>
      `;
    }

    if (trx.status === 'PAID' && trx.trackingStatus) {
      const tInfo = trackingInfo[trx.trackingStatus];
      const steps = ['PROCESSING', 'SHIPPED', 'DELIVERED'];
      const currentStep = steps.indexOf(trx.trackingStatus);

      trackingHTML = `
        <div class="tracking-section">
          <div class="tracking-label"><i class="fa-solid fa-map-location-dot"></i> Status Pengiriman</div>
          <div class="tracking-steps">
            ${steps.map((step, i) => {
              const ti = trackingInfo[step];
              const isActive = i <= currentStep;
              return `<div class="tracking-step ${isActive ? 'active' : ''} ${i < currentStep ? 'done' : ''}">
                <div class="tracking-dot"><i class="fa-solid ${ti.icon}"></i></div>
                <div class="tracking-step-label">${ti.label}</div>
              </div>`;
            }).join('<div class="tracking-line"></div>')}
          </div>
          ${trx.trackingStatus !== 'DELIVERED' ? `
            <button class="btn btn-shipping btn-sm btn-block" onclick="advanceOrderStatus('${trx.id}')">
              <i class="fa-solid fa-arrow-right"></i>
              ${trx.trackingStatus === 'PROCESSING' ? 'Simulasikan: Kirim Paket' : 'Simulasikan: Paket Diterima'}
              <span class="api-hint">PUT /api/transactions/${trx.id}/status</span>
            </button>
          ` : `<div class="delivered-badge"><i class="fa-solid fa-medal"></i> Pesanan Selesai Diterima</div>`}
        </div>
      `;

      if (trx.amountPaid !== null) {
        actionHTML = `
          <div class="payment-detail-row">
            <span>Dibayar (${trx.paymentMethod || 'Tunai'})</span>
            <span>${formatRupiah(trx.amountPaid)}</span>
          </div>
          <div class="payment-detail-row">
            <span>Kembalian</span>
            <span>${formatRupiah(trx.changeAmount)}</span>
          </div>
        `;
      }
    }

    return `
      <div class="trx-card">
        <div class="trx-header">
          <div>
            <span class="trx-id">${trx.id}</span>
            <span class="trx-date">${formattedDate}</span>
          </div>
          <span class="status-badge ${sInfo.cls}">
            <i class="fa-solid ${sInfo.icon}"></i> ${sInfo.label}
          </span>
        </div>
        <ul class="trx-item-list">${itemListHTML}</ul>
        <div class="trx-total">
          <span>Total Tagihan</span>
          <span>${formatRupiah(trx.total)}</span>
        </div>
        ${actionHTML}
        ${trackingHTML}
      </div>
    `;
  }).join('');
}

function reopenPayment(transactionId, total) {
  currentTransactionId = transactionId;
  currentTransactionTotal = total;
  document.getElementById('payment-trx-id').textContent = transactionId;
  document.getElementById('payment-total').textContent = formatRupiah(total);
  document.getElementById('payment-items-list').innerHTML = '<p style="color:var(--text-secondary); font-size:0.85rem;">Detail item tersimpan di server.</p>';
  paymentAmountInput.value = '';
  paymentErrorMsg.style.display = 'none';
  paymentChangePreview.style.display = 'none';
  toggleTransactions(false);
  paymentModal.classList.add('active');
}

async function advanceOrderStatus(transactionId) {
  console.log(`[HTTP Request] PUT /api/transactions/${transactionId}/status`);
  try {
    const response = await fetch(`${API_BASE}/transactions/${transactionId}/status`, { method: 'PUT' });
    const result = await response.json();
    console.log('[HTTP Response]', result);
    if (result.status === 'success') {
      showToast(`Status pesanan: ${result.data.trackingStatus}`, 'success');
      fetchTransactions();
    } else {
      showToast(result.message, 'error');
    }
  } catch (e) {
    showToast('Gagal menghubungi server.', 'error');
  }
}
