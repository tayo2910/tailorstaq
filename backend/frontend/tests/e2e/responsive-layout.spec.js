// @ts-check
import { test, expect } from '@playwright/test';

test.describe('Responsive layout across viewports', () => {
  const VIEWPORTS = [
    { width: 320, height: 568, name: 'mobile 320px' },
    { width: 768, height: 1024, name: 'tablet 768px' },
    { width: 1280, height: 800, name: 'desktop 1280px' },
    { width: 1920, height: 1080, name: 'desktop 1920px' },
  ];

  for (const vp of VIEWPORTS) {
    test(`landing page has no horizontal scroll at ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/');

      // Check for horizontal overflow
      const overflowX = await page.evaluate(() => {
        return document.documentElement.scrollWidth <= document.documentElement.clientWidth;
      });
      expect(overflowX).toBe(true);
    });

    test(`login page has no horizontal scroll at ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/login');

      const overflowX = await page.evaluate(() => {
        return document.documentElement.scrollWidth <= document.documentElement.clientWidth;
      });
      expect(overflowX).toBe(true);
    });

    test(`admin metrics page has no horizontal scroll at ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/admin/metrics');

      const overflowX = await page.evaluate(() => {
        return document.documentElement.scrollWidth <= document.documentElement.clientWidth;
      });
      expect(overflowX).toBe(true);
    });

    test(`tenant products page has no horizontal scroll at ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto('/tenant/products');

      const overflowX = await page.evaluate(() => {
        return document.documentElement.scrollWidth <= document.documentElement.clientWidth;
      });
      expect(overflowX).toBe(true);
    });
  }

  test('brand colors are applied across the application', async ({ page }) => {
    await page.goto('/');

    // NavBar should have dark blue background
    const nav = page.locator('nav');
    await expect(nav).toHaveCSS('background-color', 'rgb(27, 42, 74)'); // #1B2A4A
  });
});
