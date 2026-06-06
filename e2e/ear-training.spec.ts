import { test, expect } from './fixtures/auth-bypass';

test.describe('EarTrainingPage', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/ear-training');
  });

  test('renders with Intervals tab active by default', async ({ page }) => {
    await expect(page.getByRole('main', { name: 'Ear Training' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Ear Training' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Intervals' })).toBeVisible();
  });

  test('all three tabs are visible', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Intervals' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Chords' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Scales' })).toBeVisible();
  });

  test('Intervals idle state shows ▶ Start button', async ({ page }) => {
    // In idle state, the settings panel has a "▶ Start" button
    await expect(page.getByRole('button', { name: '▶ Start' })).toBeVisible();
  });

  test('switching to Chords tab shows chords idle state with ▶ Start button', async ({ page }) => {
    await page.getByRole('button', { name: 'Chords' }).click();
    await expect(page.getByRole('button', { name: '▶ Start' })).toBeVisible();
  });

  test('clicking ▶ Start on Intervals begins the game and shows the question banner', async ({ page }) => {
    await page.getByRole('button', { name: '▶ Start' }).click();
    // Playing phase shows "Listen and identify" label and "♪ Play Again" button
    await expect(page.getByText('Listen and identify')).toBeVisible();
    await expect(page.getByRole('button', { name: '♪ Play Again' })).toBeVisible();
  });
});
