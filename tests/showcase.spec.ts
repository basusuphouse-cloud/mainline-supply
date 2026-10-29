import { test, expect } from '@playwright/test';
import { fillCheckout, FOUR_ITEM_CART, openFilters, seedCart, STANDARD_CART } from './helpers';

test.describe('showcase', () => {
  // Network mocking: page.route() makes the products API fail, then unroute() lets Retry succeed.
  test('products API error shows Retry, and Retry recovers', async ({ page }) => {
    await page.route('**/api/products', (route) => route.fulfill({ status: 500, body: '{"error":"boom"}' }));
    await page.goto('/');
    const status = page.getByTestId('catalog-status');
    await expect(status).toContainText("We couldn't load products.");
    await expect(page.getByTestId('product-grid')).toBeHidden();

    await page.unroute('**/api/products');
    await status.getByTestId('retry-button').click();
    await expect(page.getByTestId('result-count')).toHaveText('32 products');
    await expect(status).toBeHidden();
  });

  // Slow network: a route handler holds the response until the loading state has been asserted.
  test('loading state shows while products are on their way', async ({ page }) => {
    let release!: () => void;
    const released = new Promise<void>((resolve) => (release = resolve));
    await page.route('**/api/products', async (route) => {
      await released;
      await route.continue();
    });

    await page.goto('/');
    await expect(page.getByTestId('catalog-status')).toHaveText('Loading products…');
    await expect(page.getByTestId('result-count')).toHaveText('');

    release();
    await expect(page.getByTestId('result-count')).toHaveText('32 products');
    await expect(page.getByTestId('catalog-status')).toBeHidden();
  });

  // Mocked data: route.fulfill() replaces the API response with custom JSON.
  test('catalog renders whatever products the API returns', async ({ page }) => {
    await page.route('**/api/products', (route) =>
      route.fulfill({
        json: [
          { sku: 'TEST-001', name: 'Test Widget', brand: 'Test Brand', category: 'Tools', price: 10, stock: 5, rank: 1 },
          { sku: 'TEST-002', name: '<b>Escaped</b> Gadget', brand: 'Test Brand', category: 'Valves', price: 2.5, stock: 0, rank: 2 },
        ],
      })
    );
    await page.goto('/');
    await expect(page.getByTestId('result-count')).toHaveText('2 products');
    await expect(page.getByTestId('product-name')).toHaveText(['Test Widget', '<b>Escaped</b> Gadget']);
    await expect(page.getByTestId('product-price')).toHaveText(['$10.00', '$2.50']);
    await expect(page.getByRole('button', { name: 'Out of stock: <b>Escaped</b> Gadget' })).toBeDisabled();
    await expect(page.getByTestId('pagination')).toBeHidden();

    await openFilters(page);
    await expect(page.getByRole('checkbox', { name: 'Test Brand' })).toBeVisible();
  });

  // Error-path mocking: /api/orders returns 500; the form and cart must survive.
  test('order API failure keeps the form values and the cart', async ({ page }) => {
    await page.route('**/api/orders', (route) => route.fulfill({ status: 500, body: '{"error":"boom"}' }));
    await seedCart(page, STANDARD_CART);
    await page.goto('/checkout');
    await fillCheckout(page, { zip: '62701-1234' });
    await page.getByLabel('PO number').fill('PO-TEST-001');
    await page.getByTestId('place-order').click();

    await expect(page.getByTestId('order-error')).toHaveText("We couldn't place your order. Try again in a moment.");
    await expect(page.getByTestId('place-order')).toBeEnabled();
    await expect(page.getByTestId('place-order')).not.toHaveAttribute('aria-busy');
    await expect(page).toHaveURL(/\/checkout$/);
    await expect(page.getByLabel('Email', { exact: true })).toHaveValue('test.buyer@example.com');
    await expect(page.getByLabel('ZIP code', { exact: true })).toHaveValue('62701-1234');
    await expect(page.getByLabel('State', { exact: true })).toHaveValue('IL');
    await expect(page.getByLabel('PO number')).toHaveValue('PO-TEST-001');
    await expect(page.getByTestId('cart-count')).toHaveText('5');
    await expect(page.getByTestId('summary-line')).toHaveCount(3);

    // The same form succeeds once the API recovers.
    await page.unroute('**/api/orders');
    await page.getByTestId('place-order').click();
    await expect(page).toHaveURL(/\/confirmation\?order=MS-\d{6}$/);
  });

  // Multiple tabs: two pages in one browser context share localStorage and its storage events.
  test('adding to the cart in one tab updates the badge in another', async ({ context }) => {
    const shop = await context.newPage();
    const other = await context.newPage();
    await other.goto('/cart');
    await expect(other.getByTestId('empty-state')).toBeVisible();
    await shop.goto('/');

    await shop.getByRole('button', { name: 'Add to cart: Hydronic Circulator Pump, 3-Speed' }).click();
    await expect(shop.getByTestId('cart-count')).toHaveText('1');
    await expect(other.getByTestId('cart-count')).toHaveText('1');
    await expect(other.getByTestId('cart-line')).toHaveCount(1);
  });

  // Browser history: goBack() and goForward() restore filter state kept in the URL.
  test('Back and Forward restore the filter state', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('result-count')).toHaveText('32 products');
    await openFilters(page);
    await page.getByRole('checkbox', { name: 'Pumps', exact: true }).check();
    await expect(page.getByTestId('result-count')).toHaveText('5 products');
    await page.getByTestId('sort-select').selectOption('price-desc');
    await expect(page).toHaveURL(/\?category=Pumps&sort=price-desc$/);

    await page.goBack();
    await expect(page).toHaveURL(/\?category=Pumps$/);
    await expect(page.getByTestId('sort-select')).toHaveValue('featured');
    await expect(page.getByTestId('result-count')).toHaveText('5 products');

    await page.goBack();
    await expect(page.getByTestId('result-count')).toHaveText('32 products');
    await openFilters(page);
    await expect(page.getByRole('checkbox', { name: 'Pumps', exact: true })).not.toBeChecked();

    await page.goForward();
    await expect(page.getByTestId('result-count')).toHaveText('5 products');
    await expect(page.getByRole('checkbox', { name: 'Pumps', exact: true })).toBeChecked();
  });

  // Request counting: a route handler counts POSTs while still passing them to the real server.
  test('double-clicking Place order sends exactly one order request', async ({ page }) => {
    let orderPosts = 0;
    await page.route('**/api/orders', async (route) => {
      if (route.request().method() === 'POST') orderPosts++;
      await route.continue();
    });
    await seedCart(page, STANDARD_CART);
    await page.goto('/checkout');
    await fillCheckout(page);
    await page.getByTestId('place-order').dblclick();

    await expect(page).toHaveURL(/\/confirmation\?order=MS-\d{6}$/);
    expect(orderPosts).toBe(1);
  });

  // Layout: evaluate scrollWidth in the page at every viewport project.
  for (const path of ['/', '/cart', '/checkout']) {
    test(`no horizontal scroll on ${path} with 4 items in the cart`, async ({ page }) => {
      await seedCart(page, FOUR_ITEM_CART);
      await page.goto(path);
      if (path === '/') await expect(page.getByTestId('product-card')).toHaveCount(12);
      if (path === '/cart') await expect(page.getByTestId('cart-line')).toHaveCount(4);
      if (path === '/checkout') await expect(page.getByTestId('summary-line')).toHaveCount(4);

      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth))
        .toBeLessThanOrEqual(0);
    });
  }
});
