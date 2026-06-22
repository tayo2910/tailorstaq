// @ts-check
import { test, expect } from '@playwright/test';

test.describe('Landing page and auth flow', () => {
  test('landing page shows TAILORSTAQ brand and navigation links', async ({ page }) => {
    await page.goto('/');

    await expect(page.locator('text=TAILORSTAQ')).toBeVisible();
    await expect(page.locator('text=Register Your Shop')).toBeVisible();
    await expect(page.locator('text=Sign In')).toBeVisible();
  });

  test('login page renders and shows form fields', async ({ page }) => {
    await page.goto('/login');

    await expect(page.locator('text=Sign In')).toBeVisible();
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.locator('button:has-text("Sign In")')).toBeVisible();
  });

  test('customer registration page renders', async ({ page }) => {
    await page.goto('/register/customer');

    await expect(page.locator('text=Create Account')).toBeVisible();
  });

  test('tenant registration page renders', async ({ page }) => {
    await page.goto('/register/tenant');

    await expect(page.locator('text=Register Your Shop')).toBeVisible();
  });

  test('landing page nav links to login and register', async ({ page }) => {
    await page.goto('/');

    await page.click('text=Sign In');
    await expect(page).toHaveURL(/\/login/);

    await page.goto('/');

    await page.click('text=Register Your Shop');
    await expect(page).toHaveURL(/\/register\/tenant/);
  });

  test('NavBar shows Login and Register Shop when unauthenticated', async ({ page }) => {
    await page.goto('/');

    await expect(page.locator('nav')).toContainText('Login');
    await expect(page.locator('nav')).toContainText('Register Shop');
  });

  test('responsive layout on mobile 320px viewport', async ({ page }) => {
    // Mobile viewport
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto('/');

    // Heading should be visible and not overflow
    const heading = page.locator('h1');
    await expect(heading).toBeVisible();
    const box = await heading.boundingBox();
    expect(box.width).toBeGreaterThan(0);
    expect(box.width).toBeLessThanOrEqual(320);

    // Buttons should stack vertically
    const buttons = page.locator('a:has-text("Register Your Shop"), a:has-text("Sign In")');
    await expect(buttons.first()).toBeVisible();
  });

  test('responsive layout on desktop 1920px viewport', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/');

    // Heading should be large and centered
    const heading = page.locator('h1');
    await expect(heading).toBeVisible();
    expect(await heading.textContent()).toBe('TAILORSTAQ');

    // Buttons should be side by side
    const registerBtn = page.locator('text=Register Your Shop');
    const signInBtn = page.locator('text=Sign In');
    await expect(registerBtn).toBeVisible();
    await expect(signInBtn).toBeVisible();
  });
});
