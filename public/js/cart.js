/* Cart page (/cart): line items, quantity steppers, promo code and order summary. */
(function () {
  'use strict';

  var el = MS.el;
  var products = null;
  var dom = {};

  function renderTotals(lines, promo) {
    var totals = MS.computeTotals(lines, promo, 'standard');
    dom.subtotal.textContent = MS.formatCents(totals.subtotal);
    dom.discount.textContent = totals.discount ? '-' + MS.formatCents(totals.discount) : MS.formatCents(0);
    dom.shipping.textContent = totals.shipping === 0 ? 'Free' : MS.formatCents(totals.shipping);
    dom.tax.textContent = MS.formatCents(totals.tax);
    dom.total.textContent = MS.formatCents(totals.total);

    var threshold = MS.SHIPPING.standard.freeThresholdCents;
    dom.shippingHint.textContent = totals.discounted >= threshold
      ? 'Your order qualifies for free standard shipping.'
      : 'Add ' + MS.formatCents(threshold - totals.discounted) + ' more for free standard shipping.';
  }

  function cartLine(line) {
    var p = line.product;
    var id = 'qty-' + p.sku;
    return el('li', { class: 'cart-line', 'data-testid': 'cart-line', 'data-sku': p.sku }, [
      el('div', { class: 'line-info' }, [
        el('h3', { class: 'line-name', 'data-testid': 'line-name', text: p.name }),
        el('p', { class: 'line-sku' }, ['SKU: ', el('span', { 'data-testid': 'line-sku', text: p.sku })]),
        el('p', { class: 'line-unit' }, [
          el('span', { 'data-testid': 'unit-price', text: MS.formatCents(line.priceCents) }),
          ' each',
        ]),
      ]),
      el('div', { class: 'line-qty' }, [
        el('label', { for: id, class: 'visually-hidden', text: 'Quantity for ' + p.name }),
        el('div', { class: 'stepper' }, [
          el('button', {
            type: 'button',
            class: 'stepper-btn',
            'data-action': 'decrease',
            'data-focus-key': 'dec-' + p.sku,
            'data-testid': 'qty-decrease',
            'aria-label': 'Decrease quantity of ' + p.name,
            disabled: line.qty <= 1,
            text: '−',
          }),
          el('input', {
            id: id,
            class: 'qty-input',
            type: 'number',
            inputmode: 'numeric',
            min: 1,
            max: p.stock,
            step: 1,
            value: line.qty,
            'data-testid': 'qty-input',
            'data-focus-key': 'qty-' + p.sku,
          }),
          el('button', {
            type: 'button',
            class: 'stepper-btn',
            'data-action': 'increase',
            'data-focus-key': 'inc-' + p.sku,
            'data-testid': 'qty-increase',
            'aria-label': 'Increase quantity of ' + p.name,
            disabled: line.qty >= p.stock,
            text: '+',
          }),
        ]),
        el('p', { class: 'qty-hint', text: 'Max ' + p.stock }),
      ]),
      el('div', { class: 'line-total-wrap' }, [
        el('span', { class: 'line-total-label', text: 'Line total' }),
        el('p', { class: 'line-total', 'data-testid': 'line-total', text: MS.formatCents(line.priceCents * line.qty) }),
      ]),
      el('button', {
        type: 'button',
        class: 'btn btn-link remove-line',
        'data-action': 'remove',
        'data-testid': 'remove-line',
        'aria-label': 'Remove ' + p.name,
        text: 'Remove',
      }),
    ]);
  }

  function render() {
    if (!products) return;
    var result = MS.reconcileCart(products);

    if (result.notices.length) {
      dom.notice.textContent = result.notices.join(' ');
      dom.notice.hidden = false;
    }

    var isEmpty = result.lines.length === 0;
    dom.empty.hidden = !isEmpty;
    dom.content.hidden = isEmpty;
    if (isEmpty) return;

    // Rebuilding the list loses focus, so restore it to the same control afterwards.
    var active = document.activeElement;
    var focusKey = active && active.dataset ? active.dataset.focusKey : null;

    dom.lines.replaceChildren.apply(dom.lines, result.lines.map(cartLine));
    renderTotals(result.lines, result.cart.promo);

    dom.promoApplied.hidden = !result.cart.promo;
    dom.promoAppliedCode.textContent = result.cart.promo || '';

    if (focusKey) {
      var target = dom.lines.querySelector('[data-focus-key="' + focusKey + '"]');
      if (target && !target.disabled) target.focus();
      else if (target) target.closest('.stepper').querySelector('.qty-input').focus();
    }
  }

  function findProduct(sku) {
    return products.find(function (p) {
      return p.sku === sku;
    });
  }

  function currentQty(sku) {
    var item = MS.readCart().items.find(function (i) {
      return i.sku === sku;
    });
    return item ? item.qty : 0;
  }

  function onLinesClick(event) {
    var button = event.target.closest('button[data-action]');
    if (!button || button.disabled) return;
    var sku = button.closest('[data-testid="cart-line"]').dataset.sku;
    var product = findProduct(sku);
    var action = button.dataset.action;
    if (action === 'remove') {
      MS.removeFromCart(sku);
      MS.showToast('Removed from cart: ' + product.name);
      var first = dom.lines.querySelector('.qty-input');
      (first || dom.empty.querySelector('a')).focus();
      return;
    }
    var qty = currentQty(sku) + (action === 'increase' ? 1 : -1);
    MS.setQty(sku, Math.max(1, Math.min(qty, product.stock)));
  }

  function onQtyChange(event) {
    var input = event.target;
    if (!input.classList.contains('qty-input')) return;
    var sku = input.closest('[data-testid="cart-line"]').dataset.sku;
    var product = findProduct(sku);
    var qty = parseInt(input.value, 10);
    if (!Number.isInteger(qty)) {
      input.value = currentQty(sku); // revert invalid input
      return;
    }
    MS.setQty(sku, Math.max(1, Math.min(qty, product.stock)));
    render(); // re-render even if the clamped value matches what was stored
  }

  function onPromoSubmit(event) {
    event.preventDefault();
    var result = MS.applyPromo(dom.promoInput.value);
    dom.promoMessage.textContent = result.message;
    dom.promoMessage.dataset.state = result.state;
    if (result.ok) {
      dom.promoInput.value = '';
      dom.promoInput.removeAttribute('aria-invalid');
    } else if (result.state === 'error') {
      dom.promoInput.setAttribute('aria-invalid', 'true');
    }
  }

  function onPromoRemove() {
    MS.removePromo();
    dom.promoMessage.textContent = 'Promo code removed.';
    dom.promoMessage.dataset.state = 'info';
    dom.promoInput.focus();
  }

  function load() {
    MS.renderStatus(dom.status, 'loading', { loadingText: 'Loading your cart…' });
    dom.empty.hidden = true;
    dom.content.hidden = true;
    MS.fetchProducts()
      .then(function (data) {
        products = data;
        MS.renderStatus(dom.status, 'ready');
        render();
      })
      .catch(function () {
        MS.renderStatus(dom.status, 'error', {
          errorText: 'We couldn\'t load your cart. Check your connection and try again.',
          onRetry: load,
        });
      });
  }

  function init() {
    dom.status = document.querySelector('[data-testid="cart-status"]');
    dom.notice = document.querySelector('[data-testid="cart-notice"]');
    dom.empty = document.querySelector('[data-testid="empty-state"]');
    dom.content = document.getElementById('cart-content');
    dom.lines = document.querySelector('[data-testid="cart-lines"]');
    dom.subtotal = document.querySelector('[data-testid="summary-subtotal"]');
    dom.discount = document.querySelector('[data-testid="summary-discount"]');
    dom.shipping = document.querySelector('[data-testid="summary-shipping"]');
    dom.tax = document.querySelector('[data-testid="summary-tax"]');
    dom.total = document.querySelector('[data-testid="summary-total"]');
    dom.shippingHint = document.getElementById('shipping-hint');
    dom.promoInput = document.getElementById('promo-input');
    dom.promoMessage = document.getElementById('promo-message');
    dom.promoApplied = document.getElementById('promo-applied');
    dom.promoAppliedCode = document.getElementById('promo-applied-code');

    dom.lines.addEventListener('click', onLinesClick);
    dom.lines.addEventListener('change', onQtyChange);
    document.getElementById('promo-form').addEventListener('submit', onPromoSubmit);
    document.getElementById('promo-remove').addEventListener('click', onPromoRemove);

    MS.onCartChange(render);
    load();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
