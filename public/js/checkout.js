/* Checkout page (/checkout): shipping form, validation, order summary and order placement. */
(function () {
  'use strict';

  var el = MS.el;
  var ORDER_ERROR = 'We couldn\'t place your order. Try again in a moment.';
  var EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  var ZIP_PATTERN = /^\d{5}(-\d{4})?$/;

  var products = null;
  var current = null; // latest reconciled cart: { cart, lines, notices }
  var submitting = false;
  var dom = {};

  // Each rule returns an error message, or '' when the value is valid.
  var FIELDS = [
    {
      id: 'email',
      validate: function (v) {
        if (!v) return 'Enter your email address';
        if (!EMAIL_PATTERN.test(v)) return 'Enter an email address in the correct format, like test.buyer@example.com';
        return '';
      },
    },
    { id: 'full-name', validate: function (v) { return v ? '' : 'Enter your full name'; } },
    { id: 'address', validate: function (v) { return v ? '' : 'Enter your street address'; } },
    { id: 'city', validate: function (v) { return v ? '' : 'Enter your city'; } },
    { id: 'state', validate: function (v) { return v ? '' : 'Select your state'; } },
    {
      id: 'zip',
      validate: function (v) {
        if (!v) return 'Enter your ZIP code';
        if (!ZIP_PATTERN.test(v)) return 'Enter a 5-digit ZIP code, or ZIP+4 like 12345-6789';
        return '';
      },
    },
  ];

  function shippingMethod() {
    var checked = dom.form.querySelector('input[name="shippingMethod"]:checked');
    return checked ? checked.value : '';
  }

  /* ---------- Summary ---------- */

  function renderSummary() {
    var method = shippingMethod() || 'standard';
    var totals = MS.computeTotals(current.lines, current.cart.promo, method);

    dom.summaryLines.replaceChildren.apply(
      dom.summaryLines,
      current.lines.map(function (line) {
        return el('li', { class: 'summary-line', 'data-testid': 'summary-line', 'data-sku': line.sku }, [
          el('span', { class: 'summary-line-name' }, [line.product.name + ' × ' + line.qty]),
          el('span', { class: 'summary-line-total', text: MS.formatCents(line.priceCents * line.qty) }),
        ]);
      })
    );

    dom.promoNote.hidden = !current.cart.promo;
    dom.promoNote.textContent = current.cart.promo ? 'Promo ' + current.cart.promo + ' applied (10% off)' : '';

    dom.subtotal.textContent = MS.formatCents(totals.subtotal);
    dom.discount.textContent = totals.discount ? '-' + MS.formatCents(totals.discount) : MS.formatCents(0);
    dom.shippingLabel.textContent = 'Shipping (' + MS.SHIPPING[method].label + ')';
    dom.shipping.textContent = totals.shipping === 0 ? 'Free' : MS.formatCents(totals.shipping);
    dom.tax.textContent = MS.formatCents(totals.tax);
    dom.total.textContent = MS.formatCents(totals.total);

    // Show the real Standard price for this cart next to the radio button.
    var standard = MS.computeTotals(current.lines, current.cart.promo, 'standard').shipping;
    dom.standardPrice.textContent = standard === 0 ? 'Free' : MS.formatCents(standard);
    return totals;
  }

  // Re-read the cart (it may change in another tab). Returns false if we redirected.
  function refresh() {
    current = MS.reconcileCart(products);
    if (current.lines.length === 0) {
      location.replace('/cart');
      return false;
    }
    if (current.notices.length) {
      dom.notice.textContent = current.notices.join(' ');
      dom.notice.hidden = false;
    }
    renderSummary();
    return true;
  }

  /* ---------- Validation ---------- */

  function setFieldError(input, errorEl, hintId, message) {
    var describedBy = [];
    if (hintId) describedBy.push(hintId);
    if (message) {
      errorEl.textContent = message;
      errorEl.hidden = false;
      input.setAttribute('aria-invalid', 'true');
      describedBy.push(errorEl.id);
    } else {
      errorEl.textContent = '';
      errorEl.hidden = true;
      input.removeAttribute('aria-invalid');
    }
    if (describedBy.length) input.setAttribute('aria-describedby', describedBy.join(' '));
    else input.removeAttribute('aria-describedby');
  }

  function validate() {
    var errors = [];
    FIELDS.forEach(function (field) {
      var input = document.getElementById(field.id);
      var hint = document.getElementById(field.id + '-hint');
      var message = field.validate(input.value.trim());
      setFieldError(input, document.getElementById(field.id + '-error'), hint ? hint.id : null, message);
      if (message) errors.push({ id: field.id, message: message });
    });

    var methodError = document.getElementById('shipping-method-error');
    if (!MS.SHIPPING[shippingMethod()]) {
      methodError.textContent = 'Choose a shipping method';
      methodError.hidden = false;
      errors.push({ id: 'ship-standard', message: 'Choose a shipping method' });
    } else {
      methodError.textContent = '';
      methodError.hidden = true;
    }
    return errors;
  }

  function showErrorSummary(errors) {
    dom.errorList.replaceChildren.apply(
      dom.errorList,
      errors.map(function (error) {
        return el('li', {}, [el('a', { href: '#' + error.id, 'data-field': error.id, text: error.message })]);
      })
    );
    dom.errorSummary.hidden = false;
    dom.errorSummary.focus();
  }

  function hideErrorSummary() {
    dom.errorSummary.hidden = true;
    dom.errorList.replaceChildren();
  }

  /* ---------- Submit ---------- */

  function setSubmitting(value) {
    submitting = value;
    dom.placeOrder.disabled = value;
    if (value) dom.placeOrder.setAttribute('aria-busy', 'true');
    else dom.placeOrder.removeAttribute('aria-busy');
    dom.placeOrder.textContent = value ? 'Placing order…' : 'Place order';
  }

  function value(id) {
    return document.getElementById(id).value.trim();
  }

  function onSubmit(event) {
    event.preventDefault();
    if (submitting) return;

    dom.orderError.hidden = true;
    var errors = validate();
    if (errors.length) {
      showErrorSummary(errors);
      return;
    }
    hideErrorSummary();
    if (!refresh()) return;

    setSubmitting(true);
    var totals = renderSummary();
    var payload = {
      items: current.cart.items.map(function (item) {
        return { sku: item.sku, qty: item.qty };
      }),
      shipping: {
        method: shippingMethod(),
        email: value('email'),
        fullName: value('full-name'),
        company: value('company'),
        address: value('address'),
        city: value('city'),
        state: value('state'),
        zip: value('zip'),
        poNumber: value('po-number'),
      },
      promo: current.cart.promo,
    };

    fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
    })
      .then(function (res) {
        if (res.status !== 201) throw new Error('Order request failed: ' + res.status);
        return res.json();
      })
      .then(function (data) {
        if (!data || !data.orderNumber) throw new Error('Missing order number');
        MS.saveLastOrder({ orderNumber: data.orderNumber, itemCount: totals.itemCount, totalCents: totals.total });
        MS.clearCart();
        location.assign('/confirmation?order=' + encodeURIComponent(data.orderNumber));
      })
      .catch(function () {
        // Keep the form values and the cart so the buyer can simply try again.
        dom.orderError.textContent = ORDER_ERROR;
        dom.orderError.hidden = false;
        setSubmitting(false);
      });
  }

  /* ---------- Loading ---------- */

  function load() {
    MS.renderStatus(dom.status, 'loading', { loadingText: 'Loading checkout…' });
    dom.content.hidden = true;
    MS.fetchProducts()
      .then(function (data) {
        products = data;
        if (!refresh()) return;
        MS.renderStatus(dom.status, 'ready');
        dom.content.hidden = false;
      })
      .catch(function () {
        MS.renderStatus(dom.status, 'error', {
          errorText: 'We couldn\'t load checkout. Check your connection and try again.',
          onRetry: load,
        });
      });
  }

  function init() {
    // Nothing to check out: go straight back to the cart.
    if (MS.readCart().items.length === 0) {
      location.replace('/cart');
      return;
    }

    dom.status = document.querySelector('[data-testid="checkout-status"]');
    dom.notice = document.querySelector('[data-testid="checkout-notice"]');
    dom.content = document.getElementById('checkout-content');
    dom.form = document.getElementById('checkout-form');
    dom.errorSummary = document.querySelector('[data-testid="error-summary"]');
    dom.errorList = document.getElementById('error-summary-list');
    dom.orderError = document.querySelector('[data-testid="order-error"]');
    dom.placeOrder = document.querySelector('[data-testid="place-order"]');
    dom.summaryLines = document.querySelector('[data-testid="summary-lines"]');
    dom.promoNote = document.getElementById('promo-note');
    dom.subtotal = document.querySelector('[data-testid="summary-subtotal"]');
    dom.discount = document.querySelector('[data-testid="summary-discount"]');
    dom.shippingLabel = document.getElementById('summary-shipping-label');
    dom.shipping = document.querySelector('[data-testid="summary-shipping"]');
    dom.tax = document.querySelector('[data-testid="summary-tax"]');
    dom.total = document.querySelector('[data-testid="summary-total"]');
    dom.standardPrice = document.getElementById('ship-standard-price');

    dom.form.addEventListener('submit', onSubmit);
    dom.form.addEventListener('change', function (event) {
      if (event.target.name === 'shippingMethod' && current) renderSummary();
    });

    // Error summary links move focus to the field without changing the URL hash.
    dom.errorList.addEventListener('click', function (event) {
      var link = event.target.closest('a[data-field]');
      if (!link) return;
      event.preventDefault();
      var input = document.getElementById(link.dataset.field);
      input.focus();
      input.scrollIntoView({ block: 'center' });
    });

    MS.onCartChange(function () {
      if (products && !submitting) refresh();
    });

    load();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
