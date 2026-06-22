// @ts-check
import { test, expect } from '@playwright/test';

test.describe('Customer flows', () => {
  test('orders page renders order list layout', async ({ page }) => {
    await page.goto('/customer/orders');

    await expect(page.locator('h2')).toContainText('Orders');
  });

  test('profile page renders', async ({ page }) => {
    await page.goto('/customer/profile');

    await expect(page.locator('text=Profile')).toBeVisible();
  });

  test('order detail page renders', async ({ page }) => {
    // This would normally need a real order ID, but we can check the route renders
    await page.goto('/customer/orders/dummy-id');

    // Should show some content (Back button, status info, etc.)
    await expect(page.locator('text=Back')).toBeVisible();
  });

  test('customer sidebar has navigation links', async ({ page }) => {
    await page.goto('/customer/orders');

    await expect(page.locator('a:has-text("My Orders")')).toBeVisible();
    await expect(page.locator('a:has-text("Profile")')).toBeVisible();
  });
});
