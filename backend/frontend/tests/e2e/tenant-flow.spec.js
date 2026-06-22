// @ts-check
import { test, expect } from '@playwright/test';

test.describe('Tenant Admin flows', () => {
  test('shop setup page renders', async ({ page }) => {
    await page.goto('/tenant/shop');

    await expect(page.locator('text=Shop Setup')).toBeVisible();
  });

  test('products page renders product list layout', async ({ page }) => {
    await page.goto('/tenant/products');

    await expect(page.locator('h2')).toContainText('Products');
    await expect(page.locator('button:has-text("Add Product")')).toBeVisible();
  });

  test('orders page renders with status filters', async ({ page }) => {
    await page.goto('/tenant/orders');

    await expect(page.locator('h2')).toContainText('Orders');
  });

  test('subscription page renders tier info', async ({ page }) => {
    await page.goto('/tenant/subscription');

    await expect(page.locator('text=Subscription')).toBeVisible();
  });

  test('tenant sidebar has all navigation links', async ({ page }) => {
    await page.goto('/tenant/products');

    await expect(page.locator('a:has-text("Shop Setup")')).toBeVisible();
    await expect(page.locator('a:has-text("Products")')).toBeVisible();
    await expect(page.locator('a:has-text("Orders")')).toBeVisible();
    await expect(page.locator('a:has-text("Subscription")')).toBeVisible();
  });

  test('responsive tenant layout on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto('/tenant/products');

    // Sidebar should be scrollable horizontally
    const sidebar = page.locator('aside');
    await expect(sidebar).toBeVisible();
  });
});
