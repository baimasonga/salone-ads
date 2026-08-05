import { expect, test } from '@playwright/test';

test.describe('public critical journeys', () => {
  test('visitor can reach tender discovery without authentication', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Manohub/i);
    const browse = page.getByRole('link', { name: /browse live tenders/i });
    await expect(browse).toBeVisible();
    await browse.click();
    await expect(page).toHaveURL(/\/tenders/);
    await expect(page.getByPlaceholder(/search by keyword/i)).toBeVisible();
  });

  test('visitor can move between account creation and sign in', async ({ page }) => {
    await page.goto('/?auth=signup');
    await expect(page.getByRole('heading', { name: 'Create Account' })).toBeVisible();
    await expect(page.getByPlaceholder('Alhassan Kamara')).toBeVisible();
    await expect(page.getByPlaceholder('name@salonemail.com')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toHaveAttribute('minlength', '8');
    await page.getByRole('button', { name: /sign in to your portal/i }).click();
    await expect(page.getByRole('heading', { name: 'Sign In' })).toBeVisible();
  });

  test('deep links load their intended public workspace', async ({ page }) => {
    await page.goto('/tenders?country=Sierra%20Leone');
    await expect(page).toHaveURL(/country=Sierra%20Leone/);
    await expect(page.getByPlaceholder(/search by keyword/i)).toBeVisible();
    await expect(page.locator('body')).not.toContainText('Missing VITE_SUPABASE');
  });
});
