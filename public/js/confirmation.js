/* Confirmation page (/confirmation?order=MS-100001). */
(function () {
  'use strict';

  function init() {
    var orderNumber = new URLSearchParams(location.search).get('order');
    if (!orderNumber) {
      document.getElementById('no-order').hidden = false;
      return;
    }

    document.querySelector('[data-testid="order-number"]').textContent = orderNumber;

    // Item count and total come from the session that placed the order; on a
    // direct visit (or another tab) they aren't available, so those rows are hidden.
    var order = MS.readLastOrder();
    var hasDetails = order && order.orderNumber === orderNumber;
    document.getElementById('order-items-row').hidden = !hasDetails;
    document.getElementById('order-total-row').hidden = !hasDetails;
    if (hasDetails) {
      document.querySelector('[data-testid="order-item-count"]').textContent =
        order.itemCount + (order.itemCount === 1 ? ' item' : ' items');
      document.querySelector('[data-testid="order-total"]').textContent = MS.formatCents(order.totalCents);
    }

    document.getElementById('confirmation').hidden = false;
  }

  document.addEventListener('DOMContentLoaded', init);
})();
