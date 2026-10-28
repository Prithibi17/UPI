// --- STATE MANAGEMENT ---
let currentAmount = 1.00;
const photos = [
  {
    url: '/assets/gateway_pc_checkout.png?v=2',
    badge: 'Desktop 2-Column Checkout',
    title: 'Desktop 2-Column Checkout',
    desc: 'Authentic desktop 2-column checkout frame with real-time dynamic QR, clean card at counter, live order summary, and verified merchant branding.'
  },
  {
    url: '/assets/gateway_mobile_checkout.png?v=2',
    badge: 'Mobile Instant Sheet & UPI Intent',
    title: 'Mobile Instant Sheet & UPI Intent',
    desc: 'Native fluid mobile checkout bottom sheet with instant UPI app deep-linking (GPay, PhonePe, Paytm, CRED).'
  },
  {
    url: '/assets/gateway_merchant_operations.png?v=2',
    badge: 'Merchant Operations & Live Slots Hub',
    title: 'Merchant Operations & Live Slots Hub',
    desc: 'Crisp bright white operations dashboard with real-time slot allocation, floating cashier till dock, and observers status.'
  },
  {
    url: '/assets/gateway_developer_dark_hub.png?v=2',
    badge: 'Developer Hub (Real Dark Mode)',
    title: 'Developer Hub (Real Dark Mode)',
    desc: 'Authentic obsidian real dark mode with multi-service supervisor, live host ports, and aggregate streaming terminal.'
  },
  {
    url: '/assets/gateway_whitelabel_customizer.png?v=2',
    badge: 'White-Label Customizer & Mockup',
    title: 'White-Label Customizer & Mockup',
    desc: 'Live smartphone reflection with instant brand logo, custom color palette, trust seals, and conversion banners.'
  }
];
let currentPhotoIndex = 0;

// --- GALLERY CONTROLLER ---
function switchGalleryPhoto(index, url, title, desc) {
  currentPhotoIndex = index;
  const mainImg = document.getElementById('mainGalleryImg');
  const badgeText = document.getElementById('galleryBadgeText');

  if (mainImg) {
    mainImg.style.opacity = '0.3';
    mainImg.src = url;
    setTimeout(() => { mainImg.style.opacity = '1'; }, 100);
  }
  if (badgeText) badgeText.textContent = title;

  // Update thumbnails active state
  document.querySelectorAll('.thumb-card').forEach((el, i) => {
    el.classList.toggle('active', i === index);
  });
}

function openLightbox() {
  const modal = document.getElementById('lightboxModal');
  const img = document.getElementById('lightboxImg');
  if (modal && img) {
    img.src = photos[currentPhotoIndex].url;
    modal.classList.add('active');
  }
}

function closeLightbox() {
  const modal = document.getElementById('lightboxModal');
  if (modal) {
    modal.classList.remove('active');
  }
}

// --- AMOUNT MODIFIER & BUY BOX ---
function selectAmount(amt, chipEl) {
  currentAmount = Number(amt);
  updateAmountUI();

  document.querySelectorAll('.chip-btn').forEach(b => b.classList.remove('active'));
  if (chipEl) chipEl.classList.add('active');
  const customInput = document.getElementById('customAmountInput');
  if (customInput) customInput.value = currentAmount.toFixed(2);
}

function handleCustomAmountInput(val) {
  const num = parseFloat(val);
  if (!isNaN(num) && num >= 1) {
    currentAmount = num;
    updateAmountUI();
  }
  // Unset active chips if not exact match
  document.querySelectorAll('.chip-btn').forEach(b => {
    const chipVal = parseFloat(b.innerText.replace(/[^0-9.]/g, ''));
    b.classList.toggle('active', chipVal === currentAmount);
  });
}

function updateAmountUI() {
  const formatted = '₹' + currentAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const dispEl = document.getElementById('displayPrice');
  const btnDisp = document.getElementById('btnAmountDisplay');
  if (dispEl) dispEl.textContent = formatted;
  if (btnDisp) btnDisp.textContent = formatted;
}

// --- IN-APP TOAST NOTIFICATIONS (Zero Browser Popups) ---
function showStoreToast(msg, isSuccess = true) {
  let t = document.getElementById('storeLiveToast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'storeLiveToast';
    t.style.cssText = 'position:fixed; bottom:24px; right:24px; z-index:999999; padding:12px 20px; border-radius:8px; font-weight:700; font-size:13.5px; box-shadow:0 8px 24px rgba(0,0,0,0.5); display:flex; align-items:center; gap:8px; transition:all 0.25s ease; transform:translateY(100px); opacity:0; pointer-events:none; font-family:system-ui,sans-serif;';
    document.body.appendChild(t);
  }
  t.style.background = isSuccess ? '#065f46' : '#991b1b';
  t.style.color = '#ffffff';
  t.style.border = isSuccess ? '1px solid #10b981' : '1px solid #ef4444';
  const iconSvg = isSuccess
    ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle; margin-right:6px;"><polyline points="20 6 9 17 4 12"/></svg>'
    : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle; margin-right:6px;"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>';
  t.innerHTML = `${iconSvg}${msg}`;
  t.style.transform = 'translateY(0)';
  t.style.opacity = '1';
  clearTimeout(t._timer);
  t._timer = setTimeout(() => {
    t.style.transform = 'translateY(100px)';
    t.style.opacity = '0';
  }, 4000);
}

// Override global alert to prevent native browser popups
window.alert = function(msg) {
  showStoreToast(msg, false);
};

// --- PURCHASE INITIATION (Using Official Universal YouPI Integration) ---
async function startGatewayPurchase() {
  const btn = document.getElementById('btnInitiateCheckout');
  const oldHtml = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle; animation:spin 1s linear infinite; margin-right:4px;"><circle cx="12" cy="12" r="10" stroke-dasharray="32" stroke-dashoffset="12"/></svg>Preparing Gateway Session...</span>';

  try {
    const orderId = `COIN-ORD-${Date.now()}`;
    btn.setAttribute('data-amount', currentAmount.toFixed(2));
    btn.setAttribute('data-order-id', orderId);

    // 1. Create order on store backend via YoupiPaymentClient
    const res = await fetch('/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        price: currentAmount,
        productName: 'YOUPI PG Enterprise Gateway Suite',
        coins: Math.round(currentAmount)
      })
    });

    let data = null;
    try {
      data = await res.json();
    } catch (e) {
      data = null;
    }

    if (!res.ok || (!data || (!data.checkoutUrl && !data.paymentId))) {
      const errMsg = (data && data.error) || (res.status === 402 ? 'Vercel Deployment Paused (HTTP 402): Please unpause in your Vercel Dashboard.' : `Gateway request failed (HTTP ${res.status}).`);
      showStoreToast(errMsg, false);
      btn.disabled = false;
      btn.innerHTML = oldHtml;
      return;
    }

    let finalCheckoutUrl = data.checkoutUrl || `/checkout/${data.paymentId}`;
    if (finalCheckoutUrl.includes('services.vercel-infra.com')) {
      finalCheckoutUrl = `/checkout/${data.paymentId}`;
    }

    // 2. Launch checkout modal using official Youpi.pay() SDK
    window.Youpi.pay({
      checkoutUrl: finalCheckoutUrl,
      order_id: data.orderId,
      amount: currentAmount,
      currency: 'INR',
      name: 'YOUPI Store',
      description: 'YOUPI PG Enterprise Suite Top-Up',
      successUrl: `/order-success?order_id=${encodeURIComponent(data.orderId)}&amount=${encodeURIComponent(currentAmount)}`,
      failedUrl: `/order-failed?order_id=${encodeURIComponent(data.orderId)}`,
      suspiciousUrl: `/order-suspicious?order_id=${encodeURIComponent(data.orderId)}`,
      expiredUrl: `/order-expired?order_id=${encodeURIComponent(data.orderId)}`,
      cancelledUrl: `/order-cancelled?order_id=${encodeURIComponent(data.orderId)}`,
      handler: function(paymentResponse) {
        btn.disabled = false;
        btn.innerHTML = oldHtml;
        showCelebrationModal(data.orderId, paymentResponse.utr || paymentResponse.paymentId || data.paymentId, currentAmount);
      },
      onClose: function() {
        btn.disabled = false;
        btn.innerHTML = oldHtml;
      }
    });
  } catch (err) {
    showStoreToast('Error launching YOUPI Gateway: ' + err.message, false);
    btn.disabled = false;
    btn.innerHTML = oldHtml;
  }
}

// --- OFFICIAL BROWSER PAYMENT EVENT LISTENERS ---
window.addEventListener('youpi:payment:success', function(e) {
  console.log('[YOUPI PG Event] youpi:payment:success', e.detail);
  const res = e.detail;
  fetch('/api/verify-payment', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      orderId: res.order_id,
      amount: res.amount_received || currentAmount,
      coins: Math.round(res.amount_received || currentAmount),
      paymentId: res.utr || res.order_id
    })
  }).then(r => r.json()).then(d => {
    if (d.coins !== undefined) {
      const el = document.getElementById('topWalletBalance');
      if (el) el.textContent = d.coins;
    }
  }).catch(() => {});
});

window.addEventListener('youpi:payment:failed', function(e) {
  console.warn('[YOUPI PG Event] youpi:payment:failed', e.detail);
});

window.addEventListener('youpi:payment:suspicious', function(e) {
  console.warn('[YOUPI PG Event] youpi:payment:suspicious', e.detail);
});

window.addEventListener('youpi:payment:expired', function(e) {
  console.warn('[YOUPI PG Event] youpi:payment:expired', e.detail);
});

window.addEventListener('youpi:payment:cancelled', function(e) {
  console.log('[YOUPI PG Event] youpi:payment:cancelled', e.detail);
});

function showCelebrationModal(orderId, paymentId, amount) {
  const modal = document.getElementById('celebrationModal');
  const elOrder = document.getElementById('receiptOrderId');
  const elPayment = document.getElementById('receiptPaymentId');
  const elAmount = document.getElementById('receiptAmountPaid');

  if (elOrder) elOrder.textContent = orderId || 'YOUPI-ORD-LIVE';
  if (elPayment) elPayment.textContent = paymentId || 'pay_verified';
  if (elAmount) elAmount.textContent = '₹' + Number(amount).toFixed(2);
  if (modal) modal.classList.add('active');
}

function closeCelebrationModal() {
  const modal = document.getElementById('celebrationModal');
  if (modal) modal.classList.remove('active');
}

// Keydown ESC to close modals
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeLightbox();
    closeCelebrationModal();
  }
});

// Theme Switcher for Store
function toggleStoreTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'light';
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  try { localStorage.setItem('youpi-theme', next); } catch (e) {}
}

// Initialize UI on load
document.addEventListener('DOMContentLoaded', () => {
  updateAmountUI();
});
if (document.readyState === 'interactive' || document.readyState === 'complete') {
  updateAmountUI();
}
