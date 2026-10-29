import { test, expect } from '@playwright/test';
import { fillCheckout, seedCart, STANDARD_CART } from './helpers';

test.describe('checkout', () => {
  test('redirects to /cart when the cart is empty', async ({ page }) => {
    await page.goto('/checkout');
    await expect(page).toHaveURL(/\/cart$/);
    await expect(page.getByTestId('empty-state')).toBeVisible();
  });

  test('validation errors show a focused summary with links and messages linked to each field', async ({ page }) => {
    await seedCart(page, STANDARD_CART);
    await page.goto('/checkout');
    await page.getByTestId('place-order').click();

    const summary = page.getByTestId('error-summary');
    await expect(summary).toBeVisible();
    await expect(summary).toBeFocused();
    await expect(summary).toHaveAttribute('role', 'alert');
    await expect(summary.getByRole('link')).toHaveText([
      'Enter your email address',
      'Enter your full name',
      'Enter your street address',
      'Enter your city',
      'Select your state',
      'Enter your ZIP code',
    ]);

    const email = page.getByLabel('Email', { exact: true });
    await expect(email).toHaveAttribute('aria-invalid', 'true');
    await expect(email).toHaveAccessibleDescription(/Enter your email address/);
    await expect(page.getByLabel('City', { exact: true })).toHaveAccessibleDescription('Enter your city');

    await summary.getByRole('link', { name: 'Enter your city' }).click();
    await expect(page.getByLabel('City', { exact: true })).toBeFocused();
    await expect(page).toHaveURL(/\/checkout$/);
  });

  test('ZIP must be 5 digits or ZIP+4', async ({ page }) => {
    await seedCart(page, STANDARD_CART);
    await page.goto('/checkout');
    const zip = page.getByLabel('ZIP code', { exact: true });
    const zipError = 'Enter a 5-digit ZIP code, or ZIP+4 like 12345-6789';

    for (const bad of ['6270', '62701-12', 'ABCDE']) {
      await fillCheckout(page, { zip: bad });
      await page.getByTestId('place-order').click();
      await expect(page.getByTestId('error-summary').getByRole('link')).toHaveText([zipError]);
      await expect(zip).toHaveAccessibleDescription(/Enter a 5-digit ZIP code/);
    }

    await fillCheckout(page, { zip: '62701-1234' });
    await page.getByTestId('place-order').click();
    await expect(page).toHaveURL(/\/confirmation\?order=MS-\d{6}$/);
  });

  test('next business day shipping is always $34.95 and updates the total', async ({ page }) => {
    await seedCart(page, STANDARD_CART, 'TRADE10');
    await page.goto('/checkout');
    await expect(page.getByTestId('summary-shipping')).toHaveText('$12.95');
    await expect(page.getByTestId('summary-total')).toHaveText('$155.38');

    await page.getByRole('radio', { name: /Next business day/ }).check();
    await expect(page.getByTestId('summary-shipping')).toHaveText('$34.95');
    await expect(page.getByTestId('summary-total')).toHaveText('$177.38');
    await expect(page.getByTestId('summary-subtotal')).toHaveText('$146.53');
    await expect(page.getByTestId('summary-discount')).toHaveText('-$14.65');
    await expect(page.getByTestId('summary-tax')).toHaveText('$10.55');
  });

  test('placing an order shows the confirmation and clears the cart', async ({ page }) => {
    await seedCart(page, STANDARD_CART, 'TRADE10');
    await page.goto('/checkout');
    await fillCheckout(page);
    await page.getByTestId('place-order').click();

    await expect(page).toHaveURL(/\/confirmation\?order=MS-\d{6}$/);
    const orderNumber = page.getByTestId('order-number');
    await expect(orderNumber).toHaveText(/^MS-\d{6}$/);
    expect(new URL(page.url()).searchParams.get('order')).toBe(await orderNumber.textContent());
    await expect(page.getByTestId('order-item-count')).toHaveText('5 items');
    await expect(page.getByTestId('order-total')).toHaveText('$155.38');
    await expect(page.getByTestId('cart-count')).toHaveText('0');

    await page.getByRole('link', { name: 'Continue shopping' }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByTestId('cart-count')).toHaveText('0');
  });
});
