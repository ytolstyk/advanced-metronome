import { test, expect } from './fixtures/auth-bypass';

test.describe('DrumMachinePage', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/drums');
    await page.waitForLoadState('networkidle');
  });

  test('renders all 7 instrument rows', async ({ page }) => {
    const instruments = ['Kick', 'Snare', 'Hi-Hat', 'Open Hat', 'Clap', 'Rim', 'Tom'];
    for (const name of instruments) {
      await expect(page.getByText(name, { exact: true })).toBeVisible();
    }
  });

  test('clicking a beat cell toggles it on', async ({ page }) => {
    const offCell = page.getByRole('button', { name: /Kick, beat 1, off/ });
    await expect(offCell).toBeVisible();
    await offCell.click();
    await expect(page.getByRole('button', { name: /Kick, beat 1, on/ })).toBeVisible();
  });

  test('clicking Play changes button label to Pause', async ({ page }) => {
    const playBtn = page.getByRole('button', { name: 'Play' });
    await expect(playBtn).toBeVisible();
    await playBtn.click();
    await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
    // Clean up: stop playback
    await page.getByRole('button', { name: 'Stop' }).click();
  });

  test('clicking Stop after Play returns to Play state', async ({ page }) => {
    await page.getByRole('button', { name: 'Play' }).click();
    await page.getByRole('button', { name: 'Stop' }).click();
    await expect(page.getByRole('button', { name: 'Play' })).toBeVisible();
  });

  test('Show Piano button reveals the piano keyboard', async ({ page }) => {
    const showBtn = page.getByRole('button', { name: 'Show Piano' });
    await expect(showBtn).toBeVisible();
    await showBtn.click();
    await expect(page.getByRole('button', { name: 'Hide Piano' })).toBeVisible();
  });
});
