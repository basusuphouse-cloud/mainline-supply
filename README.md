# Mainline Supply

A small demo storefront for a fictional plumbing and HVAC distributor, built to be easy to test with Playwright.
Plain HTML, CSS and JavaScript, served by a zero-dependency Node server. No framework, no build step, and no runtime dependencies. Playwright is a dev dependency, used only for testing.

All companies, brands, products and prices are made up.

## Setup: pnpm and the pinned Node runtime

The project pins its own Node runtime, so it doesn't depend on (or change) the Node installed on your machine.

- `package.json` → `devEngines.runtime` pins **Node 24.22.0** with `onFail: "download"`. `pnpm install` downloads it into `node_modules`, and pnpm scripts and `pnpm exec` run on it.
- `packageManager` is `pnpm@12.16.1`. Use the standalone pnpm (`~/Library/pnpm/bin/pnpm`), which doesn't need a system Node.
- All dependencies are exact versions at least 14 days old. `pnpm-workspace.yaml` sets `minimumReleaseAge: 20160` (minutes).
- **Run everything through pnpm.** Bare `node`, `npm` or `npx` use the system Node instead (16.20.1 on the original dev machine).

```bash
pnpm install
```

```bash
pnpm exec playwright install chromium
```

Check the project runtime (prints v24.22.0):

```bash
pnpm run node:version
```

## Run

```bash
pnpm start
```

Then open http://localhost:4173.

To use a different port:

```bash
PORT=8080 pnpm start
```

## Scripts

| Script | What it does |
| --- | --- |
| `pnpm start` | Serve the app (port 4173, or `PORT`) |
| `pnpm run node:version` | Print the project's Node version |
| `pnpm test` | Run all tests on the desktop, tablet-768, phone-393 and phone-360 Chromium projects |
| `pnpm run test:ui` | Playwright UI mode |
| `pnpm run test:headed` | Run tests in visible browsers |
| `pnpm run test:debug` | Debug tests with the Playwright Inspector |
| `pnpm run test:slow` | Watch tests in slow motion: desktop, visible browser, one at a time, 500 ms after each action (`SLOWMO=1000 pnpm run test:slow` for slower; add a file such as `tests/checkout.spec.ts` to watch one area) |
| `pnpm run test:all-browsers` | Also run the Firefox and WebKit desktop projects (`ALL_BROWSERS=1`) |
| `pnpm run report` | Open the last HTML report (`playwright-report/`) |
| `pnpm run codegen` | Record a test against http://localhost:4173 |
| `pnpm run trace <trace.zip>` | Open a trace; failed tests keep one in `test-results/` |

## Running the tests

```bash
pnpm test
```

- Playwright starts the server itself, or reuses one already running on the port.
- Flags pass straight through, for example `pnpm test --project=phone-360`, `pnpm test tests/cart.spec.ts` or `pnpm test --repeat-each=5`.
- For Firefox and WebKit, install them once with `pnpm exec playwright install firefox webkit`, then run `pnpm run test:all-browsers`.

| Project | Browser | Viewport |
| --- | --- | --- |
| `desktop` | Chromium | 1280×800 |
| `tablet-768` | Chromium | 768×1024 |
| `phone-393` | Chromium (`isMobile`, `hasTouch`) | 393×852 |
| `phone-360` | Chromium (`isMobile`, `hasTouch`) | 360×780 |
| `firefox`, `webkit` | Desktop, only with `ALL_BROWSERS=1` | 1280×800 |

Test files:
- **`tests/catalog.spec.ts`, `tests/cart.spec.ts`, `tests/checkout.spec.ts`:** smoke tests for the main flows, with exact money values.
- **`tests/showcase.spec.ts`:** one test per Playwright capability (network mocking, slow responses, mocked data, API failure, multiple tabs, history, request counting, layout).
- **`tests/helpers.ts`:** `seedCart`, `openFilters` and `fillCheckout`.

Known issue: Playwright's Firefox 157 build (1555) doesn't launch on macOS 27.0.1 ("Could not find profile folder"), so `test:all-browsers` currently fails every Firefox test at browser launch. WebKit passes.

## Browser access for Claude Code

- **playwright-cli** (`@playwright/cli`, recommended by the Playwright docs for coding agents):
  - pnpm links its skill into `.claude/skills/`. The permission is recorded in `pnpm-workspace.yaml`.
  - Run it as `pnpm exec playwright-cli …`.
  - `.playwright/cli.config.json` makes it use Playwright's Chromium.
- **Playwright MCP** (`@playwright/mcp`):
  - registered as `playwright` in `.mcp.json`, running `pnpm exec playwright-mcp` on the project's Node.
  - If your Claude Code session's PATH finds Homebrew's pnpm first, add a local override with the full path:

```bash
claude mcp add -s local playwright -- ~/Library/pnpm/bin/pnpm exec playwright-mcp --browser chromium --isolated
```

See `CLAUDE.md` for the dev-test workflow used for bug tickets.

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
tests/               Playwright tests and helpers
playwright.config.ts projects, webServer, reporters
.mcp.json            Playwright MCP server for Claude Code
.playwright/         playwright-cli config
CLAUDE.md            instructions for Claude Code, incl. the bug-ticket workflow
```
