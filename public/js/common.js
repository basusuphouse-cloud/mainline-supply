/* Shared helpers for every page: cart store, money maths, header badge, toast,
   product loading and status (loading/error/retry) rendering. Exposed as window.MS. */
(function () {
  'use strict';

  var CART_KEY = 'ms.cart';
  var LAST_ORDER_KEY = 'ms.lastOrder';
  var PROMO_CODE = 'TRADE10';
  var PROMO_PERCENT = 10;
  var TAX_PERCENT = 8;

  // Shipping rules, all in integer cents:
  // - Standard costs 1295, or 0 when the discounted subtotal is >= 19900.
  // - Next business day always costs 3495; the free-shipping threshold never applies.
  var SHIPPING = {
    standard: { label: 'Standard', cents: 1295, freeThresholdCents: 19900 },
    nextday: { label: 'Next business day', cents: 3495, freeThresholdCents: null },
  };

  /* ---------- Text and money ---------- */

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Product prices arrive as dollar numbers; convert once, then work in cents.
  function toCents(dollars) {
    return Math.round(Number(dollars) * 100);
  }

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

  function formatCents(cents) {
    return usd.format(cents / 100);
  }

  function percentOf(cents, percent) {
    return Math.round((cents * percent) / 100);
  }

  /**
   * Order totals in integer cents.
   * lines: [{ priceCents, qty }]; promo: 'TRADE10' or null; shippingMethod: 'standard' | 'nextday'.
   * Discount is 10% of the subtotal with TRADE10. Tax is 8% of the discounted subtotal.
   * Shipping follows the SHIPPING rules above (and is 0 for an empty cart).
   */
  function computeTotals(lines, promo, shippingMethod) {
    var subtotal = 0;
    var itemCount = 0;
    lines.forEach(function (line) {
      subtotal += line.priceCents * line.qty;
      itemCount += line.qty;
    });
    var discount = promo === PROMO_CODE ? percentOf(subtotal, PROMO_PERCENT) : 0;
    var discounted = subtotal - discount;
    var method = SHIPPING[shippingMethod] || SHIPPING.standard;
    var shipping = 0;
    if (itemCount > 0) {
      var isFree = method.freeThresholdCents !== null && discounted >= method.freeThresholdCents;
      shipping = isFree ? 0 : method.cents;
    }
    var tax = percentOf(discounted, TAX_PERCENT);
    return {
      itemCount: itemCount,
      subtotal: subtotal,
      discount: discount,
      discounted: discounted,
      shipping: shipping,
      tax: tax,
      total: discounted + shipping + tax,
    };
  }

  /* ---------- DOM helper ---------- */

  // el('p', { class: 'x', 'data-testid': 'y' }, ['text', childNode])
  // Text children always go in as text nodes, so product data is never parsed as HTML.
  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (key) {
        var value = attrs[key];
        if (value === null || value === undefined || value === false) return;
        if (key === 'text') node.textContent = value;
        else if (key.indexOf('on') === 0 && typeof value === 'function') node.addEventListener(key.slice(2), value);
        else node.setAttribute(key, value === true ? '' : String(value));
      });
    }
    (children || []).forEach(function (child) {
      if (child === null || child === undefined || child === false) return;
      node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
    });
    return node;
  }

  /* ---------- Cart store (localStorage "ms.cart") ---------- */

  var listeners = [];

  function emptyCart() {
    return { items: [], promo: null };
  }

  function readCart() {
    try {
      var parsed = JSON.parse(localStorage.getItem(CART_KEY));
      if (!parsed || !Array.isArray(parsed.items)) return emptyCart();
      var items = parsed.items
        .filter(function (item) {
          return item && typeof item.sku === 'string' && Number.isInteger(item.qty) && item.qty > 0;
        })
        .map(function (item) {
          return { sku: item.sku, qty: item.qty };
        });
      return { items: items, promo: parsed.promo === PROMO_CODE ? PROMO_CODE : null };
    } catch (err) {
      return emptyCart();
    }
  }

  function notify() {
    var cart = readCart();
    renderCartBadge(cart);
    listeners.forEach(function (fn) {
      fn(cart);
    });
  }

  function writeCart(cart) {
    // An emptied cart also drops its promo code.
    var data = cart.items.length ? { items: cart.items, promo: cart.promo } : emptyCart();
    try {
      localStorage.setItem(CART_KEY, JSON.stringify(data));
    } catch (err) {
      /* storage unavailable: the cart just won't persist */
    }
    notify();
  }

  function clearCart() {
    try {
      localStorage.removeItem(CART_KEY);
    } catch (err) {
      /* ignore */
    }
    notify();
  }

  function cartItemCount(cart) {
    return (cart || readCart()).items.reduce(function (sum, item) {
      return sum + item.qty;
    }, 0);
  }

  // Adds qty of a product, never going above maxQty (the product's stock).
  // Returns { qty, capped } where qty is the new quantity in the cart.
  function addToCart(sku, qty, maxQty) {
    var cart = readCart();
    var existing = cart.items.find(function (item) {
      return item.sku === sku;
    });
    var current = existing ? existing.qty : 0;
    var next = Math.min(current + qty, maxQty);
    var capped = current + qty > maxQty;
    if (next > current) {
      if (existing) existing.qty = next;
      else cart.items.push({ sku: sku, qty: next });
      writeCart(cart);
    }
    return { qty: next, added: next - current, capped: capped };
  }

  function setQty(sku, qty) {
    var cart = readCart();
    cart.items.forEach(function (item) {
      if (item.sku === sku) item.qty = qty;
    });
    writeCart(cart);
  }

  function removeFromCart(sku) {
    var cart = readCart();
    cart.items = cart.items.filter(function (item) {
      return item.sku !== sku;
    });
    writeCart(cart);
  }

  // Returns { ok, state: 'success' | 'error' | 'info', message }.
  function applyPromo(input) {
    var raw = String(input || '').trim();
    var code = raw.toUpperCase();
    if (!code) return { ok: false, state: 'error', message: 'Enter a promo code.' };
    if (code !== PROMO_CODE) {
      return { ok: false, state: 'error', message: '"' + raw + '" isn\'t a valid promo code.' };
    }
    var cart = readCart();
    if (cart.promo === PROMO_CODE) {
      return { ok: false, state: 'info', message: PROMO_CODE + ' is already applied.' };
    }
    cart.promo = PROMO_CODE;
    writeCart(cart);
    return { ok: true, state: 'success', message: PROMO_CODE + ' applied: ' + PROMO_PERCENT + '% off your order.' };
  }

  function removePromo() {
    var cart = readCart();
    cart.promo = null;
    writeCart(cart);
  }

  /**
   * Matches the stored cart against the product list and writes back a cleaned cart:
   * - SKUs that no longer exist are dropped.
   * - Items with stock 0 are dropped.
   * - Quantities are clamped to 1..stock.
   * Returns { cart, lines: [{ product, sku, qty, priceCents }], notices: [string] }.
   */
  function reconcileCart(products) {
    var bySku = {};
    products.forEach(function (product) {
      bySku[product.sku] = product;
    });
    var cart = readCart();
    var removedMissing = false;
    var removedOutOfStock = false;
    var reduced = false;
    var lines = [];

    cart.items.forEach(function (item) {
      var product = bySku[item.sku];
      if (!product) {
        removedMissing = true;
        return;
      }
      if (product.stock <= 0) {
        removedOutOfStock = true;
        return;
      }
      var qty = Math.max(1, Math.min(item.qty, product.stock));
      if (qty !== item.qty) reduced = true;
      lines.push({ product: product, sku: product.sku, qty: qty, priceCents: toCents(product.price) });
    });

    var changed = removedMissing || removedOutOfStock || reduced;
    var cleaned = {
      items: lines.map(function (line) {
        return { sku: line.sku, qty: line.qty };
      }),
      promo: cart.promo,
    };
    if (changed) writeCart(cleaned);

    var notices = [];
    if (removedOutOfStock) notices.push('Some items were removed because they\'re out of stock.');
    if (removedMissing) notices.push('Some items were removed because they\'re no longer available.');
    if (reduced) notices.push('Some quantities were reduced to match available stock.');
    return { cart: cleaned, lines: lines, notices: notices };
  }

  function onCartChange(fn) {
    listeners.push(fn);
  }

  // Keep every open tab in sync.
  window.addEventListener('storage', function (event) {
    if (event.key === CART_KEY || event.key === null) notify();
  });

  /* ---------- Header badge and toast ---------- */

  function renderCartBadge(cart) {
    var count = cartItemCount(cart);
    document.querySelectorAll('[data-testid="cart-count"]').forEach(function (badge) {
      badge.textContent = String(count);
    });
    document.querySelectorAll('[data-cart-count-label]').forEach(function (label) {
      label.textContent = count === 1 ? ' item' : ' items';
    });
  }

  var toastTimer = null;

  function showToast(message) {
    var toast = document.querySelector('[data-testid="toast"]');
    if (!toast) return;
    toast.textContent = message;
    toast.hidden = false;
    toast.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toast.classList.remove('is-visible');
      toast.hidden = true;
    }, 2500);
  }

  /* ---------- Products and status rendering ---------- */

  function fetchProducts() {
    return fetch('/api/products', { headers: { Accept: 'application/json' } }).then(function (res) {
      if (!res.ok) throw new Error('Products request failed: ' + res.status);
      return res.json();
    });
  }

  // state: 'loading' | 'error' | 'ready'
  function renderStatus(container, state, options) {
    container.dataset.state = state;
    if (state === 'ready') {
      container.hidden = true;
      container.replaceChildren();
      return;
    }
    container.hidden = false;
    if (state === 'loading') {
      container.replaceChildren(el('p', { class: 'status-text', text: options.loadingText }));
      return;
    }
    container.replaceChildren(
      el('p', { class: 'status-text status-error', text: options.errorText }),
      el('button', {
        type: 'button',
        class: 'btn btn-secondary',
        'data-testid': 'retry-button',
        text: 'Retry',
        onclick: options.onRetry,
      })
    );
  }

  /* ---------- Last order (for /confirmation) ---------- */

  function saveLastOrder(order) {
    try {
      sessionStorage.setItem(LAST_ORDER_KEY, JSON.stringify(order));
    } catch (err) {
      /* ignore */
    }
  }

  function readLastOrder() {
    try {
      return JSON.parse(sessionStorage.getItem(LAST_ORDER_KEY));
    } catch (err) {
      return null;
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    renderCartBadge(readCart());
  });

  window.MS = {
    PROMO_CODE: PROMO_CODE,
    SHIPPING: SHIPPING,
    escapeHtml: escapeHtml,
    toCents: toCents,
    formatCents: formatCents,
    computeTotals: computeTotals,
    el: el,
    readCart: readCart,
    clearCart: clearCart,
    cartItemCount: cartItemCount,
    addToCart: addToCart,
    setQty: setQty,
    removeFromCart: removeFromCart,
    applyPromo: applyPromo,
    removePromo: removePromo,
    reconcileCart: reconcileCart,
    onCartChange: onCartChange,
    showToast: showToast,
    fetchProducts: fetchProducts,
    renderStatus: renderStatus,
    saveLastOrder: saveLastOrder,
    readLastOrder: readLastOrder,
  };
})();
