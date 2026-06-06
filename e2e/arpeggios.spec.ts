import { test, expect } from './fixtures/auth-bypass';

test.describe('ArpeggiosPage', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/arpeggios');
    await page.waitForLoadState('networkidle');
  });

  test('renders arpeggio grid with cards on load', async ({ page }) => {
    const main = page.getByRole('main', { name: 'Arpeggio library' });
    await expect(main).toBeVisible();
    const cards = main.locator('div[role="button"]');
    await expect(cards.first()).toBeVisible();
    const count = await cards.count();
    // Default is C root: 8 qualities × 3 shapes = 24 cards
    expect(count).toBeGreaterThan(0);
  });

  test('filtering by key "All" shows more cards than a single-key filter', async ({ page }) => {
    const main = page.getByRole('main', { name: 'Arpeggio library' });
    const cards = main.locator('div[role="button"]');

    // Default is C; count cards for C
    const countC = await cards.count();
    expect(countC).toBeGreaterThan(0);

    // Switch to All — should show many more
    await page.getByRole('radio', { name: 'All', exact: true }).first().click();
    const countAll = await cards.count();
    expect(countAll).toBeGreaterThan(countC);
  });

  test('filtering by quality reduces visible cards', async ({ page }) => {
    const main = page.getByRole('main', { name: 'Arpeggio library' });
    const cards = main.locator('div[role="button"]');
    const countAll = await cards.count();

    await page.getByRole('radio', { name: 'Major', exact: true }).first().click();
    const countFiltered = await cards.count();
    expect(countFiltered).toBeLessThan(countAll);
    expect(countFiltered).toBeGreaterThan(0);
  });

  test('clicking a card does not throw errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));

    const main = page.getByRole('main', { name: 'Arpeggio library' });
    // Filter to C major (C is already the default key)
    await page.getByRole('radio', { name: 'Major', exact: true }).first().click();

    const firstCard = main.locator('div[role="button"]').first();
    await firstCard.click();

    expect(errors).toHaveLength(0);
  });

  test('sweep direction toggles update active state', async ({ page }) => {
    const downToggle = page.getByRole('radio', { name: '↓ Down' });
    await downToggle.click();
    await expect(downToggle).toHaveAttribute('data-state', 'on');

    const upToggle = page.getByRole('radio', { name: '↑ Up' });
    await upToggle.click();
    await expect(upToggle).toHaveAttribute('data-state', 'on');
  });

  test('navigating away and back preserves filter selection', async ({ page }) => {
    await page.getByRole('radio', { name: 'Minor', exact: true }).first().click();
    await page.goto('/');
    await page.goto('/arpeggios');
    await page.waitForLoadState('networkidle');

    const minorToggle = page.getByRole('radio', { name: 'Minor', exact: true }).first();
    await expect(minorToggle).toHaveAttribute('data-state', 'on');
  });
});
