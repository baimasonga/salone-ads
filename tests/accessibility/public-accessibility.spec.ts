import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const journeys = [
  { name: 'landing page', path: '/' },
  { name: 'account creation', path: '/?auth=signup' },
  { name: 'tender discovery', path: '/tenders' },
];

for (const journey of journeys) {
  test(`${journey.name} has no serious or critical accessibility violations`, async ({ page }) => {
    await page.goto(journey.path);
    await expect(page.locator('h1, h2').first()).toBeVisible();
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    const blocking = results.violations.filter((violation) => violation.impact === 'critical' || violation.impact === 'serious');
    expect(blocking, blocking.map((violation) => `${violation.id}: ${violation.help}`).join('\n')).toEqual([]);
  });
}

test('keyboard users can bypass repeated landing-page navigation', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Tab');
  const skipLink = page.getByRole('link', { name: 'Skip to main content' });
  await expect(skipLink).toBeFocused();
  await skipLink.press('Enter');
  await expect(page.locator('#main-content')).toBeFocused();
});
