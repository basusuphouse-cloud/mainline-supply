# Mainline Supply

A small demo storefront for a fictional plumbing and HVAC distributor, built to be easy to test with Playwright.
Plain HTML, CSS and JavaScript, served by a zero-dependency Node server. No framework, no build step, nothing to install.

All companies, brands, products and prices are made up.

## Requirements

- Node.js 20 or newer (`package.json` declares `engines: >=20`). The server only uses core modules (`http`, `fs`, `path`), and it also runs on older Node versions. Playwright itself needs Node 18+.

## Run

```bash
npm start
```

Then open http://localhost:4173.

To use a different port:

```bash
PORT=8080 npm start
```

## Pages

| Route | What it does |
| --- | --- |
| `/` | Catalog: filters, sort, pagination (12 per page) |
| `/cart` | Cart lines, quantity steppers, promo code, order summary |
| `/checkout` | Shipping form, validation, order placement (redirects to `/cart` if the cart is empty) |
| `/confirmation?order=MS-100001` | Order number, item count and total |

## API

| Method and path | Behaviour |
| --- | --- |
| `GET /api/products` | All 32 products from `data/products.json`, after about 150 ms |
| `POST /api/orders` | Body `{ items: [{ sku, qty }], shipping, promo }`. After about 300 ms: `201 { orderNumber: "MS-100001" }` (incrementing), or `400 { error }` if `items` is missing/empty or the body isn't JSON |

The order counter lives in memory and resets to `MS-100001` whenever the server restarts.
The server doesn't validate SKUs, stock or prices. It's a stub.

## Behaviour worth knowing for tests

**Catalog URL state.** Every filter, sort and page change is a `pushState`, so Back and Forward restore earlier states and URLs can be shared.

| Param | Example | Notes |
| --- | --- | --- |
| `category` | `?category=Valves&category=Pumps` | repeatable |
| `brand` | `?brand=Ridgeline` | repeatable |
| `min`, `max` | `?min=100&max=500` | dollars; applied with the Apply button |
| `instock` | `?instock=1` | |
| `sort` | `price-asc`, `price-desc`, `name-asc` | `featured` (by `rank`) is the default and is left out of the URL |
| `page` | `?page=2` | any filter or sort change resets to page 1; out-of-range pages are clamped to the last page (the URL is rewritten with `replaceState`) |

**Cart storage.** `localStorage["ms.cart"]` = `{ "items": [{ "sku": "MS-FIT-001", "qty": 2 }], "promo": "TRADE10" | null }`.
Only SKUs and quantities are stored. Names, prices and stock always come from `/api/products`.
Other open tabs update through the `storage` event.

When the cart is loaded against the product list (on `/cart` and `/checkout`):
- SKUs that no longer exist are removed.
- Items with stock 0 are removed.
- Quantities are clamped to `1..stock`.

The cleaned cart is written back, and a notice is shown (`cart-notice` / `checkout-notice`).
Removing the last item also clears the promo code.

**Money.** All maths is in integer cents (`Math.round` on each percentage).
- Discount: `TRADE10` = 10% of subtotal (case-insensitive, one use).
- Tax: 8% of the discounted subtotal.
- Standard shipping: $12.95, free when the discounted subtotal is $199.00 or more.
- Next business day: always $34.95. It never gets free shipping.
- A free shipping row shows the text `Free`. A discount shows as `-$x.xx`, and no discount as `$0.00`.

**Checkout.** Validation runs on submit only.
- Errors appear in an `error-summary` (`role="alert"`, focused, with links to fields) and under each field (`aria-describedby`, `aria-invalid`).
- ZIP accepts `12345` or `12345-6789`.
- While the request is in flight, `place-order` is disabled with `aria-busy="true"`.
- If the order fails, `order-error` shows "We couldn't place your order. Try again in a moment.", the button is re-enabled, and the form and cart are kept.
- On success, `sessionStorage["ms.lastOrder"]` stores the count and total for the confirmation page, the cart is cleared, and the browser goes to `/confirmation?order=…`.

**Copy.** User-facing messages use straight apostrophes and quotes, so exact-text assertions are simple to write.

## Test IDs

| Area | `data-testid` |
| --- | --- |
| Header (every page) | `cart-count`, `toast` |
| Catalog | `catalog-status`, `retry-button`, `result-count`, `sort-select`, `filters-toggle`, `category-filters`, `brand-filters`, `price-min`, `price-max`, `price-apply`, `price-error`, `in-stock`, `clear-filters`, `product-grid`, `product-card` (+ `data-sku`), `product-name`, `product-brand`, `product-sku`, `product-category`, `product-price`, `add-to-cart` (+ `data-sku`), `empty-state`, `pagination` |
| Cart | `cart-status`, `retry-button`, `cart-notice`, `empty-state`, `cart-lines`, `cart-line` (+ `data-sku`), `line-name`, `line-sku`, `unit-price`, `qty-decrease`, `qty-input`, `qty-increase`, `line-total`, `remove-line`, `promo-input`, `promo-apply`, `promo-message` (+ `data-state` = `success`/`error`/`info`), `promo-applied`, `promo-remove`, `summary-subtotal`, `summary-discount`, `summary-shipping`, `summary-tax`, `summary-total`, `shipping-hint`, `go-to-checkout` |
| Checkout | `checkout-status`, `retry-button`, `checkout-notice`, `error-summary`, `place-order`, `order-error`, `summary-lines`, `summary-line`, `summary-*` (as on cart) |
| Confirmation | `order-number`, `order-item-count`, `order-total`, `continue-shopping`, `no-order` |

Form fields have no test IDs on purpose. Use `getByLabel('Email')`, `getByLabel('ZIP code')` and so on.
Product data with stock 0: `MS-FIT-006`, `MS-VAL-005`, `MS-WTH-004`.

## Project layout

```
server.js            static files + JSON API
data/products.json   32 products, 6 categories, 4 brands
public/
  index.html, cart.html, checkout.html, confirmation.html
  css/styles.css
  js/common.js       cart store, money maths, toast, badge, shared status UI
  js/catalog.js, cart.js, checkout.js, confirmation.js
```
