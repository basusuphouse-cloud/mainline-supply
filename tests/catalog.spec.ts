import { test, expect, type Page } from '@playwright/test';
import { openFilters } from './helpers';

// Expected SKU order for each sort, computed once from data/products.json.
const ORDER = {
  featured: [
    'MS-THM-002', 'MS-VAL-001', 'MS-PMP-001', 'MS-FIT-001', 'MS-WTH-001', 'MS-TOL-001', 'MS-VAL-004', 'MS-WTH-003',
    'MS-FIT-003', 'MS-PMP-002', 'MS-VAL-002', 'MS-WTH-002', 'MS-VAL-006', 'MS-TOL-002', 'MS-FIT-002', 'MS-PMP-003',
    'MS-THM-001', 'MS-FIT-007', 'MS-VAL-003', 'MS-TOL-003', 'MS-FIT-004', 'MS-PMP-004', 'MS-THM-003', 'MS-VAL-005',
    'MS-TOL-004', 'MS-WTH-004', 'MS-FIT-005', 'MS-PMP-005', 'MS-THM-004', 'MS-FIT-006', 'MS-TOL-005', 'MS-THM-005',
  ],
  'price-asc': [
    'MS-TOL-005', 'MS-FIT-001', 'MS-FIT-002', 'MS-FIT-003', 'MS-FIT-007', 'MS-FIT-006', 'MS-FIT-004', 'MS-FIT-005',
    'MS-VAL-001', 'MS-TOL-001', 'MS-THM-001', 'MS-VAL-002', 'MS-THM-004', 'MS-TOL-003', 'MS-VAL-003', 'MS-THM-002',
    'MS-PMP-004', 'MS-VAL-005', 'MS-TOL-002', 'MS-VAL-004', 'MS-VAL-006', 'MS-THM-005', 'MS-THM-003', 'MS-PMP-001',
    'MS-PMP-003', 'MS-WTH-004', 'MS-PMP-002', 'MS-TOL-004', 'MS-PMP-005', 'MS-WTH-002', 'MS-WTH-001', 'MS-WTH-003',
  ],
  'price-desc': [
    'MS-WTH-003', 'MS-WTH-001', 'MS-WTH-002', 'MS-PMP-005', 'MS-TOL-004', 'MS-PMP-002', 'MS-WTH-004', 'MS-PMP-003',
    'MS-PMP-001', 'MS-THM-003', 'MS-THM-005', 'MS-VAL-006', 'MS-VAL-004', 'MS-TOL-002', 'MS-VAL-005', 'MS-PMP-004',
    'MS-THM-002', 'MS-VAL-003', 'MS-TOL-003', 'MS-THM-004', 'MS-VAL-002', 'MS-THM-001', 'MS-TOL-001', 'MS-VAL-001',
    'MS-FIT-005', 'MS-FIT-004', 'MS-FIT-006', 'MS-FIT-007', 'MS-FIT-003', 'MS-FIT-002', 'MS-FIT-001', 'MS-TOL-005',
  ],
  'name-asc': [
    'MS-PMP-005', 'MS-FIT-005', 'MS-VAL-003', 'MS-FIT-007', 'MS-FIT-001', 'MS-VAL-001', 'MS-FIT-003', 'MS-VAL-005',
    'MS-PMP-003', 'MS-TOL-003', 'MS-FIT-006', 'MS-VAL-002', 'MS-FIT-002', 'MS-FIT-004', 'MS-VAL-004', 'MS-VAL-006',
    'MS-WTH-004', 'MS-WTH-001', 'MS-WTH-002', 'MS-THM-002', 'MS-PMP-004', 'MS-TOL-001', 'MS-TOL-004', 'MS-PMP-002',
    'MS-PMP-001', 'MS-THM-004', 'MS-THM-001', 'MS-THM-005', 'MS-TOL-002', 'MS-WTH-003', 'MS-TOL-005', 'MS-THM-003',
  ],
} as const;

const SORT_LABELS = {
  featured: 'Featured',
  'price-asc': 'Price: low to high',
  'price-desc': 'Price: high to low',
  'name-asc': 'Name: A to Z',
} as const;

async function expectAllPages(page: Page, expected: readonly string[]) {
  const skus = page.getByTestId('product-sku');
  for (let start = 0, pageNumber = 1; start < expected.length; start += 12, pageNumber++) {
    if (pageNumber > 1) await page.getByRole('button', { name: 'Next page' }).click();
    await expect(page.getByRole('button', { name: `Page ${pageNumber}` })).toHaveAttribute('aria-current', 'page');
    await expect(skus).toHaveText(expected.slice(start, start + 12) as string[]);
  }
}

test.describe('catalog', () => {
  test('loads all 32 products, 12 on the first page', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('result-count')).toHaveText('32 products');
    await expect(page.getByTestId('product-card')).toHaveCount(12);
    await expect(page.getByTestId('catalog-status')).toBeHidden();
    await expect(page.getByTestId('cart-count')).toHaveText('0');
  });

  test('category, brand, price and stock filters narrow the results and update the URL', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('result-count')).toHaveText('32 products');
    await openFilters(page);

    await page.getByRole('checkbox', { name: 'Valves', exact: true }).check();
    await expect(page.getByTestId('result-count')).toHaveText('6 products');
    await expect(page).toHaveURL(/\?category=Valves$/);

    await page.getByRole('checkbox', { name: 'Halvard Thermal', exact: true }).check();
    await expect(page.getByTestId('result-count')).toHaveText('2 products');
    await expect(page.getByTestId('product-sku')).toHaveText(['MS-VAL-004', 'MS-VAL-006']);

    await page.getByTestId('clear-filters').click();
    await expect(page.getByTestId('result-count')).toHaveText('32 products');
    await expect(page).toHaveURL(/\/$/);

    await page.getByTestId('price-min').fill('100');
    await page.getByTestId('price-max').fill('500');
    await page.getByTestId('price-apply').click();
    await expect(page.getByTestId('result-count')).toHaveText('10 products');
    await expect(page).toHaveURL(/\?min=100&max=500$/);

    await page.getByTestId('in-stock').check();
    await expect(page.getByTestId('result-count')).toHaveText('9 products');
    await expect(page).toHaveURL(/instock=1/);
  });

  for (const [sort, expected] of Object.entries(ORDER)) {
    test(`sort "${SORT_LABELS[sort as keyof typeof ORDER]}" orders every product across all pages`, async ({ page }) => {
      await page.goto('/?page=2');
      await expect(page.getByTestId('result-count')).toHaveText('32 products');
      await page.getByTestId('sort-select').selectOption(sort);
      // A sort change resets to page 1.
      await expect(page.getByRole('button', { name: 'Page 1' })).toHaveAttribute('aria-current', 'page');
      await expectAllPages(page, expected);
    });
  }

  test('paginates 12 / 12 / 8 with Previous and Next disabled at the ends', async ({ page }) => {
    await page.goto('/');
    const pagination = page.getByTestId('pagination');
    await expect(pagination.getByRole('button', { name: 'Previous page' })).toBeDisabled();
    await expect(page.getByTestId('product-card')).toHaveCount(12);

    await pagination.getByRole('button', { name: 'Page 2' }).click();
    await expect(page).toHaveURL(/\?page=2$/);
    await expect(page.getByTestId('product-card')).toHaveCount(12);

    await pagination.getByRole('button', { name: 'Next page' }).click();
    await expect(page).toHaveURL(/\?page=3$/);
    await expect(page.getByTestId('product-card')).toHaveCount(8);
    await expect(pagination.getByRole('button', { name: 'Next page' })).toBeDisabled();

    await pagination.getByRole('button', { name: 'Previous page' }).click();
    await expect(page).toHaveURL(/\?page=2$/);
  });

  test('an out-of-range page number clamps to the last page', async ({ page }) => {
    await page.goto('/?page=9');
    await expect(page.getByTestId('product-card')).toHaveCount(8);
    await expect(page).toHaveURL(/\?page=3$/);
  });

  test('shows the empty state, and its Clear all filters button resets the catalog', async ({ page }) => {
    await page.goto('/?category=Pumps&max=5');
    const empty = page.getByTestId('empty-state');
    await expect(empty).toBeVisible();
    await expect(page.getByTestId('result-count')).toHaveText('0 products');
    await expect(page.getByTestId('product-card')).toHaveCount(0);

    await empty.getByRole('button', { name: 'Clear all filters' }).click();
    await expect(page.getByTestId('result-count')).toHaveText('32 products');
    await expect(empty).toBeHidden();
    await expect(page).toHaveURL(/\/$/);
  });

  test('adding to cart shows a toast and updates the header badge', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Add to cart: 7-Day Programmable Thermostat' }).click();
    await expect(page.getByTestId('toast')).toHaveText('Added to cart: 7-Day Programmable Thermostat');
    await expect(page.getByTestId('cart-count')).toHaveText('1');

    await page.getByRole('button', { name: 'Add to cart: 1/2" Full-Port Ball Valve, Sweat' }).click();
    await expect(page.getByTestId('toast')).toHaveText('Added to cart: 1/2" Full-Port Ball Valve, Sweat');
    await expect(page.getByTestId('cart-count')).toHaveText('2');
  });

  test('out-of-stock products have a disabled "Out of stock" button', async ({ page }) => {
    await page.goto('/?category=Fittings');
    const button = page.getByRole('button', { name: 'Out of stock: 2" PVC Sanitary Tee' });
    await expect(button).toBeDisabled();
    await expect(button).toHaveText('Out of stock');
  });
});
