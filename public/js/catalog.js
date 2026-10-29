/* Catalog page (/): filters, sort and pagination, all kept in the URL query string. */
(function () {
  'use strict';

  var PAGE_SIZE = 12;
  var SORTS = ['featured', 'price-asc', 'price-desc', 'name-asc'];
  var el = MS.el;

  var products = [];
  var categories = [];
  var brands = [];

  var dom = {};

  /* ---------- URL state ---------- */

  // Parses a dollar amount from the URL or an input into cents, or null if blank/invalid.
  function parseMoney(value) {
    if (value === null || value === undefined) return null;
    var text = String(value).trim();
    if (!text || !/^\d+(\.\d{0,2})?$/.test(text)) return null;
    return MS.toCents(text);
  }

  function centsToParam(cents) {
    return cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2);
  }

  function readState() {
    var params = new URLSearchParams(location.search);
    var page = parseInt(params.get('page'), 10);
    var sort = params.get('sort');
    return {
      categories: params.getAll('category'),
      brands: params.getAll('brand'),
      min: parseMoney(params.get('min')),
      max: parseMoney(params.get('max')),
      inStock: params.get('instock') === '1',
      sort: SORTS.indexOf(sort) !== -1 ? sort : 'featured',
      page: Number.isInteger(page) && page > 0 ? page : 1,
    };
  }

  // Defaults are left out so URLs stay short.
  function stateToQuery(state) {
    var params = new URLSearchParams();
    state.categories.forEach(function (c) {
      params.append('category', c);
    });
    state.brands.forEach(function (b) {
      params.append('brand', b);
    });
    if (state.min !== null) params.set('min', centsToParam(state.min));
    if (state.max !== null) params.set('max', centsToParam(state.max));
    if (state.inStock) params.set('instock', '1');
    if (state.sort !== 'featured') params.set('sort', state.sort);
    if (state.page > 1) params.set('page', String(state.page));
    var query = params.toString();
    return query ? '?' + query : location.pathname;
  }

  // Filter and sort changes reset to page 1; page changes keep everything else.
  function navigate(changes, options) {
    var state = Object.assign(readState(), changes);
    if (!options || !options.keepPage) state.page = 1;
    history.pushState(null, '', stateToQuery(state));
    render();
  }

  /* ---------- Filtering and sorting ---------- */

  function applyFilters(state) {
    return products.filter(function (p) {
      var cents = MS.toCents(p.price);
      if (state.categories.length && state.categories.indexOf(p.category) === -1) return false;
      if (state.brands.length && state.brands.indexOf(p.brand) === -1) return false;
      if (state.min !== null && cents < state.min) return false;
      if (state.max !== null && cents > state.max) return false;
      if (state.inStock && p.stock <= 0) return false;
      return true;
    });
  }

  function sortProducts(list, sort) {
    var bySku = function (a, b) {
      return a.sku < b.sku ? -1 : a.sku > b.sku ? 1 : 0;
    };
    var compare = {
      featured: function (a, b) {
        return a.rank - b.rank || bySku(a, b);
      },
      'price-asc': function (a, b) {
        return MS.toCents(a.price) - MS.toCents(b.price) || bySku(a, b);
      },
      'price-desc': function (a, b) {
        return MS.toCents(b.price) - MS.toCents(a.price) || bySku(a, b);
      },
      'name-asc': function (a, b) {
        return a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }) || bySku(a, b);
      },
    }[sort];
    return list.slice().sort(compare);
  }

  /* ---------- Rendering ---------- */

  function uniqueSorted(key) {
    var seen = {};
    products.forEach(function (p) {
      seen[p[key]] = true;
    });
    return Object.keys(seen).sort();
  }

  function buildCheckboxes(container, name, values) {
    container.replaceChildren.apply(
      container,
      values.map(function (value) {
        return el('label', { class: 'check' }, [
          el('input', { type: 'checkbox', name: name, value: value, 'data-filter': name }),
          el('span', { text: value }),
        ]);
      })
    );
  }

  function syncControls(state) {
    dom.categoryOptions.querySelectorAll('input').forEach(function (input) {
      input.checked = state.categories.indexOf(input.value) !== -1;
    });
    dom.brandOptions.querySelectorAll('input').forEach(function (input) {
      input.checked = state.brands.indexOf(input.value) !== -1;
    });
    dom.priceMin.value = state.min === null ? '' : centsToParam(state.min);
    dom.priceMax.value = state.max === null ? '' : centsToParam(state.max);
    dom.inStock.checked = state.inStock;
    dom.sort.value = state.sort;
    clearPriceError();

    var active = state.categories.length + state.brands.length + (state.inStock ? 1 : 0) +
      (state.min !== null || state.max !== null ? 1 : 0);
    dom.filtersActive.textContent = active ? '(' + active + ')' : '';
  }

  function productCard(p) {
    var inStock = p.stock > 0;
    var button = el('button', {
      type: 'button',
      class: 'btn btn-primary add-to-cart',
      'data-testid': 'add-to-cart',
      'data-sku': p.sku,
      'aria-label': (inStock ? 'Add to cart: ' : 'Out of stock: ') + p.name,
      disabled: !inStock,
      text: inStock ? 'Add to cart' : 'Out of stock',
    });
    return el('li', { class: 'card', 'data-testid': 'product-card', 'data-sku': p.sku }, [
      el('span', { class: 'tag', 'data-testid': 'product-category', text: p.category }),
      el('h3', { class: 'card-name', 'data-testid': 'product-name', text: p.name }),
      el('p', { class: 'card-brand', 'data-testid': 'product-brand', text: p.brand }),
      el('p', { class: 'card-sku' }, ['SKU: ', el('span', { 'data-testid': 'product-sku', text: p.sku })]),
      el('div', { class: 'card-foot' }, [
        el('p', { class: 'card-price', 'data-testid': 'product-price', text: MS.formatCents(MS.toCents(p.price)) }),
        el('p', {
          class: 'card-stock' + (inStock ? '' : ' is-out'),
          text: inStock ? p.stock + ' in stock' : 'Out of stock',
        }),
      ]),
      button,
    ]);
  }

  function pageButton(label, page, options) {
    return el('button', {
      type: 'button',
      class: 'page-btn' + (options.current ? ' is-current' : ''),
      'data-page': page,
      'aria-label': options.ariaLabel,
      'aria-current': options.current ? 'page' : null,
      disabled: options.disabled,
      text: label,
    });
  }

  function renderPagination(page, totalPages) {
    if (totalPages <= 1) {
      dom.pagination.hidden = true;
      dom.pagination.replaceChildren();
      return;
    }
    var items = [pageButton('Previous', page - 1, { disabled: page === 1, ariaLabel: 'Previous page' })];
    for (var i = 1; i <= totalPages; i++) {
      items.push(pageButton(String(i), i, { current: i === page, ariaLabel: 'Page ' + i }));
    }
    items.push(pageButton('Next', page + 1, { disabled: page === totalPages, ariaLabel: 'Next page' }));
    dom.pagination.replaceChildren.apply(dom.pagination, items);
    dom.pagination.hidden = false;
  }

  function render() {
    var state = readState();
    syncControls(state);

    var filtered = sortProducts(applyFilters(state), state.sort);
    var totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    if (state.page > totalPages) {
      // Clamp out-of-range pages and keep the URL truthful.
      state.page = totalPages;
      history.replaceState(null, '', stateToQuery(state));
    }

    var start = (state.page - 1) * PAGE_SIZE;
    var pageItems = filtered.slice(start, start + PAGE_SIZE);

    dom.resultCount.textContent = filtered.length + (filtered.length === 1 ? ' product' : ' products');
    dom.grid.replaceChildren.apply(dom.grid, pageItems.map(productCard));
    dom.grid.hidden = filtered.length === 0;
    dom.emptyState.hidden = filtered.length !== 0;
    renderPagination(state.page, totalPages);
  }

  /* ---------- Loading ---------- */

  function load() {
    MS.renderStatus(dom.status, 'loading', { loadingText: 'Loading products…' });
    dom.grid.hidden = true;
    dom.emptyState.hidden = true;
    dom.pagination.hidden = true;
    dom.resultCount.textContent = '';
    MS.fetchProducts()
      .then(function (data) {
        products = data;
        categories = uniqueSorted('category');
        brands = uniqueSorted('brand');
        buildCheckboxes(dom.categoryOptions, 'category', categories);
        buildCheckboxes(dom.brandOptions, 'brand', brands);
        MS.renderStatus(dom.status, 'ready');
        render();
      })
      .catch(function () {
        MS.renderStatus(dom.status, 'error', {
          errorText: 'We couldn\'t load products. Check your connection and try again.',
          onRetry: load,
        });
      });
  }

  /* ---------- Events ---------- */

  function checkedValues(container) {
    return Array.prototype.map.call(container.querySelectorAll('input:checked'), function (input) {
      return input.value;
    });
  }

  function clearPriceError() {
    dom.priceError.hidden = true;
    dom.priceError.textContent = '';
    dom.priceMin.removeAttribute('aria-invalid');
    dom.priceMax.removeAttribute('aria-invalid');
  }

  function showPriceError(message, input) {
    dom.priceError.textContent = message;
    dom.priceError.hidden = false;
    input.setAttribute('aria-invalid', 'true');
    input.focus();
  }

  function onPriceApply(event) {
    event.preventDefault();
    clearPriceError();
    var minText = dom.priceMin.value.trim();
    var maxText = dom.priceMax.value.trim();
    var min = parseMoney(minText);
    var max = parseMoney(maxText);
    if (minText && min === null) return showPriceError('Enter a minimum price like 10 or 10.50.', dom.priceMin);
    if (maxText && max === null) return showPriceError('Enter a maximum price like 250 or 250.00.', dom.priceMax);
    if (min !== null && max !== null && min > max) {
      return showPriceError('Minimum price must be less than or equal to maximum price.', dom.priceMin);
    }
    navigate({ min: min, max: max });
  }

  function clearAll() {
    navigate({ categories: [], brands: [], min: null, max: null, inStock: false });
  }

  function setFiltersOpen(open) {
    dom.filtersToggle.setAttribute('aria-expanded', String(open));
    dom.filters.classList.toggle('is-open', open);
  }

  function onAddToCart(event) {
    var button = event.target.closest('[data-testid="add-to-cart"]');
    if (!button || button.disabled) return;
    var product = products.find(function (p) {
      return p.sku === button.dataset.sku;
    });
    if (!product) return;
    var result = MS.addToCart(product.sku, 1, product.stock);
    if (result.added === 0) {
      MS.showToast('You already have all ' + product.stock + ' in stock in your cart.');
    } else {
      MS.showToast('Added to cart: ' + product.name);
    }
  }

  function init() {
    dom.categoryOptions = document.getElementById('category-options');
    dom.brandOptions = document.getElementById('brand-options');
    dom.priceForm = document.getElementById('price-form');
    dom.priceMin = document.getElementById('price-min');
    dom.priceMax = document.getElementById('price-max');
    dom.priceError = document.getElementById('price-error');
    dom.inStock = document.getElementById('in-stock');
    dom.sort = document.getElementById('sort-select');
    dom.status = document.querySelector('[data-testid="catalog-status"]');
    dom.grid = document.querySelector('[data-testid="product-grid"]');
    dom.emptyState = document.querySelector('[data-testid="empty-state"]');
    dom.pagination = document.querySelector('[data-testid="pagination"]');
    dom.resultCount = document.querySelector('[data-testid="result-count"]');
    dom.filters = document.getElementById('filters');
    dom.filtersToggle = document.querySelector('[data-testid="filters-toggle"]');
    dom.filtersActive = document.getElementById('filters-active');
    dom.resultsHeading = document.getElementById('results-heading');

    dom.filters.addEventListener('change', function (event) {
      var filter = event.target.dataset.filter;
      if (filter === 'category') navigate({ categories: checkedValues(dom.categoryOptions) });
      else if (filter === 'brand') navigate({ brands: checkedValues(dom.brandOptions) });
    });
    dom.inStock.addEventListener('change', function () {
      navigate({ inStock: dom.inStock.checked });
    });
    dom.priceForm.addEventListener('submit', onPriceApply);
    dom.sort.addEventListener('change', function () {
      navigate({ sort: dom.sort.value });
    });
    document.querySelector('[data-testid="clear-filters"]').addEventListener('click', clearAll);
    document.getElementById('empty-clear').addEventListener('click', clearAll);

    dom.pagination.addEventListener('click', function (event) {
      var button = event.target.closest('button[data-page]');
      if (!button || button.disabled) return;
      navigate({ page: Number(button.dataset.page) }, { keepPage: true });
      dom.resultsHeading.focus({ preventScroll: true });
      dom.resultsHeading.closest('.results').scrollIntoView({ block: 'start' });
    });

    dom.grid.addEventListener('click', onAddToCart);

    dom.filtersToggle.addEventListener('click', function () {
      setFiltersOpen(dom.filtersToggle.getAttribute('aria-expanded') !== 'true');
    });

    window.addEventListener('popstate', function () {
      if (products.length) render();
    });

    load();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
