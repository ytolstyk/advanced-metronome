import { test, expect } from './fixtures/auth-bypass';

test.describe('ClickTrackPage', () => {
  test.beforeEach(async ({ page }) => {
    // Clear persisted state so we always start from a clean track
    await page.addInitScript(() => {
      localStorage.removeItem('ct-state');
    });
    await page.goto('/click-track');
    await page.waitForLoadState('networkidle');
  });

  test('renders Add Segment form with BPM and time sig fields', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Add Segment' })).toBeVisible();
    await expect(page.locator('.ct-form-label', { hasText: 'BPM' })).toBeVisible();
    await expect(page.locator('.ct-form-label', { hasText: 'Time sig' })).toBeVisible();
  });

  test('Play button is disabled when no segments exist', async ({ page }) => {
    const playBtn = page.getByRole('button', { name: /Play/ });
    await expect(playBtn).toBeDisabled();
  });

  test('adding a segment creates a card in the segment list', async ({ page }) => {
    // The empty state message should be visible
    await expect(page.getByText('No segments yet')).toBeVisible();

    // Submit the default draft (which has valid defaults)
    await page.getByRole('button', { name: '+ Add' }).click();

    // Empty state should be gone and a piece card should appear
    await expect(page.getByText('No segments yet')).not.toBeVisible();
    await expect(page.locator('.ct-piece-card')).toBeVisible();
  });

  test('Play button becomes enabled after adding a segment', async ({ page }) => {
    await page.getByRole('button', { name: '+ Add' }).click();
    const playBtn = page.getByRole('button', { name: /Play/ });
    await expect(playBtn).toBeEnabled();
  });

  test('Speed slider is present and shows percentage label', async ({ page }) => {
    await expect(page.getByText(/Speed:/)).toBeVisible();
    // Default is 100%
    await expect(page.locator('.ct-speed-label')).toContainText('100%');
  });
});
