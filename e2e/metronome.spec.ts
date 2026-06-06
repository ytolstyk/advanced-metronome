import { test, expect } from './fixtures/auth-bypass';

test.describe('MetronomePage', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/metronome');
    await page.waitForLoadState('networkidle');
  });

  test('renders in simple mode with BPM=120 by default', async ({ page }) => {
    await expect(page.locator('.metronome-bpm-value')).toHaveText('120');
  });

  test('Start/Stop button toggles its aria-label', async ({ page }) => {
    const startBtn = page.getByRole('button', { name: 'Start metronome' });
    await expect(startBtn).toBeVisible();
    await startBtn.click();
    await expect(page.getByRole('button', { name: 'Stop metronome' })).toBeVisible();
    await page.getByRole('button', { name: 'Stop metronome' }).click();
    await expect(page.getByRole('button', { name: 'Start metronome' })).toBeVisible();
  });

  test('switching to Advanced mode shows measure cards', async ({ page }) => {
    await page.getByRole('button', { name: 'Advanced' }).click();
    await expect(page.getByText('Measure 1')).toBeVisible();
  });

  test('Add Measure button adds a second measure in advanced mode', async ({ page }) => {
    await page.getByRole('button', { name: 'Advanced' }).click();
    await page.getByRole('button', { name: '+ Add Measure' }).click();
    await expect(page.getByText('Measure 2')).toBeVisible();
  });

  test('BPM slider is present with correct range', async ({ page }) => {
    // The Radix Slider renders as role="slider" — find it within the BPM row
    const slider = page.locator('.metronome-bpm-row [role="slider"]');
    await expect(slider).toBeVisible();
    await expect(slider).toHaveAttribute('aria-valuemin', '40');
    await expect(slider).toHaveAttribute('aria-valuemax', '300');
  });
});
