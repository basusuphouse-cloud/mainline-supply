import { expect, type Page } from '@playwright/test';

export type CartItem = { sku: string; qty: number };

/**
 * Seeds localStorage["ms.cart"] before the app's scripts run, in the same shape the app uses:
 * { items: [{ sku, qty }], promo: "TRADE10" | null }.
 * Seeds once per tab, so later navigations in the same page see the app's own changes.
 */
export async function seedCart(page: Page, items: CartItem[], promo: string | null = null) {
  await page.addInitScript(
    ({ cart }) => {
      if (sessionStorage.getItem('__msTestSeeded')) return;
      localStorage.setItem('ms.cart', JSON.stringify(cart));
      sessionStorage.setItem('__msTestSeeded', '1');
    },
    { cart: { items, promo } }
  );
}

/** Opens the collapsed filter panel on narrow viewports; does nothing on desktop. */
export async function openFilters(page: Page) {
  const toggle = page.getByTestId('filters-toggle');
  if ((await toggle.isVisible()) && (await toggle.getAttribute('aria-expanded')) !== 'true') {
    await toggle.click();
  }
  await expect(page.getByRole('complementary', { name: 'Product filters' })).toBeVisible();
}

export type CheckoutDetails = {
  email: string;
  fullName: string;
  address: string;
  city: string;
  state: string;
  zip: string;
};

export const TEST_BUYER: CheckoutDetails = {
  email: 'test.buyer@example.com',
  fullName: 'Test Buyer',
  address: '100 Example St',
  city: 'Springfield',
  state: 'IL',
  zip: '62701',
};

/** Fills the checkout form with obviously fake data. */
export async function fillCheckout(page: Page, overrides: Partial<CheckoutDetails> = {}) {
  const details = { ...TEST_BUYER, ...overrides };
  await page.getByLabel('Email', { exact: true }).fill(details.email);
  await page.getByLabel('Full name', { exact: true }).fill(details.fullName);
  await page.getByLabel('Street address', { exact: true }).fill(details.address);
  await page.getByLabel('City', { exact: true }).fill(details.city);
  await page.getByLabel('State', { exact: true }).selectOption(details.state);
  await page.getByLabel('ZIP code', { exact: true }).fill(details.zip);
}

/** A cart whose totals are asserted exactly: subtotal $146.53 without a promo. */
export const STANDARD_CART: CartItem[] = [
  { sku: 'MS-THM-002', qty: 2 }, // 7-Day Programmable Thermostat, $64.50
  { sku: 'MS-VAL-001', qty: 1 }, // 1/2" Full-Port Ball Valve, Sweat, $14.95
  { sku: 'MS-FIT-001', qty: 2 }, // 1/2" Copper 90° Elbow, $1.29
];

/** Four lines, used for layout checks at narrow widths. */
export const FOUR_ITEM_CART: CartItem[] = [
  { sku: 'MS-WTH-003', qty: 2 },
  { sku: 'MS-TOL-001', qty: 12 },
  { sku: 'MS-PMP-002', qty: 1 },
  { sku: 'MS-VAL-002', qty: 3 },
];
