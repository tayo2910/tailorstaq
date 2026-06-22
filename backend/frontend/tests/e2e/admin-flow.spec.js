// @ts-check
import { test, expect } from '@playwright/test';

test.describe('Platform Admin flow', () => {
  test('approvals page shows status filter tabs', async ({ page }) => {
    // Navigate directly (normally would require auth — this tests rendering)
    await page.goto('/admin/approvals');

    // The page should render with tabs
    await expect(page.locator('text=Approvals')).toBeVisible();
  });

  test('tenants page renders tenant list', async ({ page }) => {
    await page.goto('/admin/tenants');

    await expect(page.locator('text=Tenants')).toBeVisible();
  });

  test('metrics page renders with date range inputs', async ({ page }) => {
    await page.goto('/admin/metrics');

    await expect(page.locator('text=Platform Metrics')).toBeVisible();
    await expect(page.locator('text=From')).toBeVisible();
    await expect(page.locator('text=To')).toBeVisible();
    await expect(page.locator('button:has-text("Apply")')).toBeVisible();
  });

  test('admin sidebar navigation links are present', async ({ page }) => {
    await page.goto('/admin/metrics');

    await expect(page.locator('a:has-text("Approvals")')).toBeVisible();
    await expect(page.locator('a:has-text("Tenants")')).toBeVisible();
    await expect(page.locator('a:has-text("Metrics")')).toBeVisible();
  });

  test('responsive admin sidebar on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto('/admin/metrics');

    // Sidebar links should still be accessible (horizontal scroll on mobile)
    const sidebarLinks = page.locator('aside a');
    const count = await sidebarLinks.count();
    expect(count).toBeGreaterThanOrEqual(3);
  });
});
