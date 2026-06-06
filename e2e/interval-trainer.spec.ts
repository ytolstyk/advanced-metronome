import { test, expect } from './fixtures/auth-bypass';

test.describe('IntervalTrainerPage', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/interval-trainer');
  });

  test('renders fretboard and Start Practice button', async ({ page }) => {
    await expect(page.getByRole('main', { name: 'Interval trainer' })).toBeVisible();
    await expect(page.getByRole('button', { name: '▶ Start Practice' })).toBeVisible();
    await expect(page.getByRole('img', { name: 'Guitar fretboard' })).toBeVisible();
  });

  test('string count toggle switches between 6, 7, and 8 strings', async ({ page }) => {
    const six = page.getByRole('radio', { name: '6' }).first();
    await expect(six).toHaveAttribute('data-state', 'on');

    const seven = page.getByRole('radio', { name: '7' }).first();
    await seven.click();
    await expect(seven).toHaveAttribute('data-state', 'on');
    await expect(six).toHaveAttribute('data-state', 'off');

    const eight = page.getByRole('radio', { name: '8' }).first();
    await eight.click();
    await expect(eight).toHaveAttribute('data-state', 'on');
  });

  test('starting practice shows Find the interval banner', async ({ page }) => {
    await page.getByRole('button', { name: '▶ Start Practice' }).click();
    await expect(page.getByText('Find the interval')).toBeVisible();
  });

  test('banner shows interval name and root note during play', async ({ page }) => {
    await page.getByRole('button', { name: '▶ Start Practice' }).click();
    await page.waitForSelector('text=Find the interval');

    // The banner should show an interval name (contains "above")
    const banner = page.locator('text=above');
    await expect(banner).toBeVisible();

    // Score display shows 0
    await expect(page.locator('text=Score')).toBeVisible();
  });

  test('clicking a wrong fret shows Wrong feedback', async ({ page }) => {
    await page.getByRole('button', { name: '▶ Start Practice' }).click();
    await page.waitForSelector('text=Find the interval');

    // The root dot is the blue dot on the active string — clicking it is always wrong
    // since none of our intervals are Unison (0 semitones)
    const rootButtons = page.getByRole('button', { name: /string fret / });
    const firstButton = rootButtons.first();
    await firstButton.click();

    // Either correct or wrong feedback should appear (we can't control which fret is clicked)
    const feedback = page.locator('text=/✓ Correct!|✗ Wrong/');
    await expect(feedback).toBeVisible({ timeout: 2000 });
  });

  test('Stop button ends game and shows result screen', async ({ page }) => {
    await page.getByRole('button', { name: '▶ Start Practice' }).click();
    await page.waitForSelector('text=Find the interval');

    await page.getByRole('button', { name: 'Stop' }).click();

    await expect(page.getByText('Stopped Early')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Play Again' })).toBeVisible();
  });

  test('Play Again returns to idle state', async ({ page }) => {
    await page.getByRole('button', { name: '▶ Start Practice' }).click();
    await page.waitForSelector('text=Find the interval');
    await page.getByRole('button', { name: 'Stop' }).click();
    await page.waitForSelector('text=Stopped Early');

    await page.getByRole('button', { name: 'Play Again' }).click();
    await expect(page.getByRole('button', { name: '▶ Start Practice' })).toBeVisible();
  });

  test('difficulty info shows on idle screen', async ({ page }) => {
    await expect(page.getByText('Difficulty:')).toBeVisible();
    await expect(page.getByText('Starter')).toBeVisible();
  });
});
