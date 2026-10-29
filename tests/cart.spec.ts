import { test, expect, type Page } from '@playwright/test';
import { seedCart, STANDARD_CART } from './helpers';

const THERMOSTAT = '7-Day Programmable Thermostat';
const BALL_VALVE = '1/2" Full-Port Ball Valve, Sweat';
const ELBOW = '1/2" Copper 90° Elbow';

async function expectSummary(
  page: Page,
  s: { subtotal: string; discount: string; shipping: string; tax: string; total: string }
) {
  await expect(page.getByTestId('summary-subtotal')).toHaveText(s.subtotal);
  await expect(page.getByTestId('summary-discount')).toHaveText(s.discount);
  await expect(page.getByTestId('summary-shipping')).toHaveText(s.shipping);
  await expect(page.getByTestId('summary-tax')).toHaveText(s.tax);
  await expect(page.getByTestId('summary-total')).toHaveText(s.total);
}

function line(page: Page, sku: string) {
  return page.getByTestId('cart-line').filter({ hasText: sku });
}

test.describe('cart', () => {
  test('shows each line and exact totals without a promo', async ({ page }) => {
    await seedCart(page, STANDARD_CART);
    await page.goto('/cart');
    await expect(page.getByTestId('cart-line')).toHaveCount(3);
    await expect(page.getByTestId('cart-count')).toHaveText('5');
    await expect(line(page, 'MS-THM-002').getByTestId('line-total')).toHaveText('$129.00');
    await expect(line(page, 'MS-VAL-001').getByTestId('line-total')).toHaveText('$14.95');
    await expect(line(page, 'MS-FIT-001').getByTestId('line-total')).toHaveText('$2.58');
    await expectSummary(page, {
      subtotal: '$146.53',
      discount: '$0.00',
      shipping: '$12.95',
      tax: '$11.72',
      total: '$171.20',
    });
  });

  test('quantity stepper and typed quantities update line totals and are clamped to 1..stock', async ({ page }) => {
    await seedCart(page, STANDARD_CART);
    await page.goto('/cart');
    const thermostat = line(page, 'MS-THM-002');
    const qty = page.getByRole('spinbutton', { name: `Quantity for ${THERMOSTAT}` });

    await page.getByRole('button', { name: `Increase quantity of ${THERMOSTAT}` }).click();
    await expect(qty).toHaveValue('3');
    await expect(thermostat.getByTestId('line-total')).toHaveText('$193.50');
    await expect(page.getByTestId('cart-count')).toHaveText('6');

    await page.getByRole('button', { name: `Decrease quantity of ${THERMOSTAT}` }).click();
    await expect(qty).toHaveValue('2');
    await expect(thermostat.getByTestId('line-total')).toHaveText('$129.00');

    // Stock for this product is 44.
    await qty.fill('999');
    await qty.press('Tab');
    await expect(qty).toHaveValue('44');
    await expect(page.getByRole('button', { name: `Increase quantity of ${THERMOSTAT}` })).toBeDisabled();

    await qty.fill('0');
    await qty.press('Tab');
    await expect(qty).toHaveValue('1');
    await expect(page.getByRole('button', { name: `Decrease quantity of ${THERMOSTAT}` })).toBeDisabled();
    await expect(thermostat.getByTestId('line-total')).toHaveText('$64.50');
  });

  test('TRADE10 gives exactly 10% off and can only be applied once', async ({ page }) => {
    await seedCart(page, STANDARD_CART);
    await page.goto('/cart');
    const input = page.getByLabel('Promo code', { exact: true });
    const message = page.getByTestId('promo-message');

    await input.fill(' trade10 ');
    await page.getByRole('button', { name: 'Apply' }).click();
    await expect(message).toHaveText('TRADE10 applied: 10% off your order.');
    await expect(message).toHaveAttribute('data-state', 'success');
    await expect(page.getByTestId('promo-applied')).toBeVisible();
    await expectSummary(page, {
      subtotal: '$146.53',
      discount: '-$14.65',
      shipping: '$12.95',
      tax: '$10.55',
      total: '$155.38',
    });

    await input.fill('TRADE10');
    await page.getByRole('button', { name: 'Apply' }).click();
    await expect(message).toHaveText('TRADE10 is already applied.');
    await expect(page.getByTestId('summary-total')).toHaveText('$155.38');

    await page.getByRole('button', { name: 'Remove promo code' }).click();
    await expect(message).toHaveText('Promo code removed.');
    await expect(page.getByTestId('promo-applied')).toBeHidden();
    await expect(page.getByTestId('summary-discount')).toHaveText('$0.00');
    await expect(page.getByTestId('summary-total')).toHaveText('$171.20');
  });

  test('an invalid promo code shows a clear error and changes nothing', async ({ page }) => {
    await seedCart(page, STANDARD_CART);
    await page.goto('/cart');
    await page.getByLabel('Promo code', { exact: true }).fill('SAVE50');
    await page.getByRole('button', { name: 'Apply' }).click();
    await expect(page.getByTestId('promo-message')).toHaveText('"SAVE50" isn\'t a valid promo code.');
    await expect(page.getByTestId('promo-message')).toHaveAttribute('data-state', 'error');
    await expect(page.getByLabel('Promo code', { exact: true })).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByTestId('summary-total')).toHaveText('$171.20');
  });

  test('removing lines updates the cart, and removing the last shows the empty state', async ({ page }) => {
    await seedCart(page, STANDARD_CART);
    await page.goto('/cart');
    await page.getByRole('button', { name: `Remove ${BALL_VALVE}` }).click();
    await expect(page.getByTestId('cart-line')).toHaveCount(2);
    await expect(page.getByTestId('summary-subtotal')).toHaveText('$131.58');
    await expect(page.getByTestId('cart-count')).toHaveText('4');

    await page.getByRole('button', { name: `Remove ${THERMOSTAT}` }).click();
    await page.getByRole('button', { name: `Remove ${ELBOW}` }).click();
    await expect(page.getByTestId('empty-state')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Browse the catalog' })).toHaveAttribute('href', '/');
    await expect(page.getByTestId('cart-count')).toHaveText('0');
  });

  test('standard shipping becomes free at a discounted subtotal of $199', async ({ page }) => {
    await seedCart(page, [{ sku: 'MS-THM-002', qty: 3 }]);
    await page.goto('/cart');
    await expectSummary(page, {
      subtotal: '$193.50',
      discount: '$0.00',
      shipping: '$12.95',
      tax: '$15.48',
      total: '$221.93',
    });
    await expect(page.getByTestId('shipping-hint')).toHaveText('Add $5.50 more for free standard shipping.');

    await page.getByRole('button', { name: `Increase quantity of ${THERMOSTAT}` }).click();
    await expectSummary(page, {
      subtotal: '$258.00',
      discount: '$0.00',
      shipping: 'Free',
      tax: '$20.64',
      total: '$278.64',
    });
    await expect(page.getByTestId('shipping-hint')).toHaveText('Your order qualifies for free standard shipping.');
  });

  test('the free-shipping threshold uses the discounted subtotal', async ({ page }) => {
    // $208.45 before the discount, $187.60 after: still pays shipping.
    await seedCart(page, [{ sku: 'MS-THM-002', qty: 3 }, { sku: 'MS-VAL-001', qty: 1 }], 'TRADE10');
    await page.goto('/cart');
    await expectSummary(page, {
      subtotal: '$208.45',
      discount: '-$20.85',
      shipping: '$12.95',
      tax: '$15.01',
      total: '$215.56',
    });
  });

  test('an empty cart links back to the catalog', async ({ page }) => {
    await page.goto('/cart');
    await expect(page.getByTestId('empty-state')).toBeVisible();
    await page.getByRole('link', { name: 'Browse the catalog' }).click();
    await expect(page).toHaveURL(/\/$/);
  });
});
