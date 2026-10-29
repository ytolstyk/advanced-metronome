import { test, expect } from './fixtures/auth-bypass';

// Everything here runs signed out: the gate is what an unauthenticated visitor sees. Editing and
// saving a rig need a signed-in user and are covered by the component tests and `npm run test:auth`.
test.describe('Gear and rigs (signed out)', () => {
  test('/bands/:bandId/rig shows a sign-in gate and links back to the band', async ({ page }) => {
    await page.goto('/bands/band-1/rig');
    await expect(page.getByRole('main', { name: 'Gear and rigs' })).toBeVisible();
    await expect(page.getByText('Sign in to see your band’s gear and rigs')).toBeVisible();
    await expect(page.getByRole('link', { name: '← Back to band' })).toHaveAttribute('href', '/bands/band-1');
  });

  test('makes no data requests while signed out', async ({ page }) => {
    const appsyncCalls: string[] = [];
    page.on('request', (req) => {
      if (req.url().includes('appsync')) appsyncCalls.push(req.url());
    });
    await page.goto('/bands/band-1/rig');
    await expect(page.getByText('Sign in to see your band’s gear and rigs')).toBeVisible();
    expect(appsyncCalls).toEqual([]);
  });

  test('fits a phone screen without sideways scrolling', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 700 });
    await page.goto('/bands/band-1/rig');
    await expect(page.getByText('Sign in to see your band’s gear and rigs')).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
