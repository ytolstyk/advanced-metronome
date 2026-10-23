import { test, expect } from './fixtures/auth-bypass';

// Everything here runs signed out (the fixture blocks Amplify/Cognito). Create/join/vote flows
// need a real account and are covered by `npm run test:auth` against a sandbox plus manual checks.

test.describe('BandsPage (signed out)', () => {
  test('shows the page heading and a sign-in gate instead of band actions', async ({ page }) => {
    await page.goto('/bands');
    await expect(page.getByRole('main', { name: 'Bands' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Bands', level: 1 })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Bands are for signed-in users' })).toBeVisible();
    await expect(page.getByRole('main', { name: 'Bands' }).getByRole('button', { name: 'Sign in or create an account' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create a band' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Join with a code' })).toHaveCount(0);
  });

  test('a shared join link is stripped from the URL and kept only in session storage', async ({ page }) => {
    await page.goto('/bands?join=ABCDE-FGHJK');
    await expect(page.getByRole('heading', { name: 'Bands are for signed-in users' })).toBeVisible();
    await expect(page).toHaveURL(/\/bands$/);
    const stored = await page.evaluate(() => sessionStorage.getItem('band-join-code'));
    expect(stored).toBe('ABCDE-FGHJK');
    const inLocal = await page.evaluate(() => localStorage.getItem('band-join-code'));
    expect(inLocal).toBeNull();
  });

  test('the Nav "Bands" link navigates to /bands', async ({ page }) => {
    await page.goto('/');
    // Links live in the "Track" dropdown on desktop widths.
    await page.getByRole('button', { name: 'Track', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Bands' }).click();
    await expect(page).toHaveURL(/\/bands$/);
    await expect(page.getByRole('heading', { name: 'Bands', level: 1 })).toBeVisible();
  });

  test('the welcome-screen "Bands" card navigates to /bands', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Bands/ }).click();
    await expect(page).toHaveURL(/\/bands$/);
  });
});

test.describe('Band detail routes (signed out)', () => {
  test('/bands/:bandId shows a sign-in gate', async ({ page }) => {
    await page.goto('/bands/00000000-0000-0000-0000-000000000000');
    await expect(page.getByRole('main', { name: 'Band' })).toBeVisible();
    await expect(page.getByText('Sign in to view this band')).toBeVisible();
    await expect(page.getByRole('link', { name: '← All bands' })).toHaveAttribute('href', '/bands');
  });

  test('/bands/:bandId/setlists/:setListId shows a sign-in gate and links back to the band', async ({ page }) => {
    await page.goto('/bands/band-1/setlists/list-1');
    await expect(page.getByRole('main', { name: 'Set list' })).toBeVisible();
    await expect(page.getByText('Sign in to view this set list')).toBeVisible();
    await expect(page.getByRole('link', { name: '← Back to band' })).toHaveAttribute('href', '/bands/band-1');
  });

  test('makes no data requests while signed out', async ({ page }) => {
    const appsyncCalls: string[] = [];
    page.on('request', (req) => {
      if (req.url().includes('appsync')) appsyncCalls.push(req.url());
    });
    await page.goto('/bands/band-1/setlists/list-1');
    await expect(page.getByText('Sign in to view this set list')).toBeVisible();
    expect(appsyncCalls).toEqual([]);
  });

  test('/bands/:bandId/availability shows a sign-in gate and links back to the band', async ({ page }) => {
    await page.goto('/bands/band-1/availability');
    await expect(page.getByRole('main', { name: 'Availability' })).toBeVisible();
    await expect(page.getByText('Sign in to share your availability')).toBeVisible();
    await expect(page.getByRole('link', { name: '← Back to band' })).toHaveAttribute('href', '/bands/band-1');
  });

  test('the availability page makes no data requests while signed out', async ({ page }) => {
    const appsyncCalls: string[] = [];
    page.on('request', (req) => {
      if (req.url().includes('appsync')) appsyncCalls.push(req.url());
    });
    await page.goto('/bands/band-1/availability');
    await expect(page.getByText('Sign in to share your availability')).toBeVisible();
    expect(appsyncCalls).toEqual([]);
  });

  test('the availability page fits a phone screen without sideways scrolling', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 700 });
    await page.goto('/bands/band-1/availability');
    await expect(page.getByText('Sign in to share your availability')).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
