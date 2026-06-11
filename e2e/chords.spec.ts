import { test, expect } from './fixtures/auth-bypass';

test.describe('ChordsPage', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/chords');
    await page.waitForLoadState('networkidle');
  });

  test('renders chord grid with chord cards on load', async ({ page }) => {
    const main = page.getByRole('main', { name: 'Chord library' });
    await expect(main).toBeVisible();
    // Chord cards are div[role="button"] within the chord library
    const cards = main.locator('div[role="button"]');
    await expect(cards.first()).toBeVisible();
  });

  test('filtering by key "C" reduces visible chord cards', async ({ page }) => {
    const main = page.getByRole('main', { name: 'Chord library' });
    const cards = main.locator('div[role="button"]');

    // Get unfiltered count
    const countAll = await cards.count();
    expect(countAll).toBeGreaterThan(0);

    // Click "C" key filter (use exact to avoid partial matches)
    await page.getByRole('radio', { name: 'C', exact: true }).first().click();

    const countFiltered = await cards.count();
    expect(countFiltered).toBeLessThan(countAll);
  });

  test('switching to Tab view activates the Tab toggle', async ({ page }) => {
    const tabToggle = page.getByRole('radio', { name: 'Tab' });
    await tabToggle.click();
    await expect(tabToggle).toHaveAttribute('data-state', 'on');
  });

  test('switching back to Diagram view activates the Diagram toggle', async ({ page }) => {
    // Switch to Tab first
    await page.getByRole('radio', { name: 'Tab' }).click();
    // Switch back to Diagram
    const diagramToggle = page.getByRole('radio', { name: 'Diagram' });
    await diagramToggle.click();
    await expect(diagramToggle).toHaveAttribute('data-state', 'on');
  });

  test('Favorites filter with no favorites shows empty state', async ({ page }) => {
    await page.getByRole('radio', { name: '★ Favorites' }).click();
    await expect(page.getByText(/No favorites yet/)).toBeVisible();
  });
});

test.describe('ChordsPage - custom chords (unauthenticated)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/chords');
    await page.evaluate(() => localStorage.removeItem('custom-chords-v1'));
    await page.reload();
    await page.waitForLoadState('networkidle');
  });

  test('Community toggle is hidden when not signed in', async ({ page }) => {
    await expect(page.getByRole('radio', { name: /community/i })).toHaveCount(0);
  });

  test('Create Chord button opens modal with sign-in prompt instead of save button', async ({ page }) => {
    await page.getByRole('button', { name: '+ Create Chord' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'Create Custom Chord' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'C', exact: true })).toBeVisible();
    await expect(dialog.getByRole('combobox')).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Save Chord' })).toHaveCount(0);
    await expect(dialog.getByText('Sign in to save')).toBeVisible();
  });
});
