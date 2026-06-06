import { test, expect } from './fixtures/auth-bypass';

test.describe('WelcomePage', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('renders the hero title "Drumma Llama"', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Drumma Llama' })).toBeVisible();
  });

  test('renders 15 feature cards', async ({ page }) => {
    const cards = page.locator('button.welcome-card');
    await expect(cards).toHaveCount(15);
  });

  test('clicking "Drum Machine" card navigates to /drums', async ({ page }) => {
    await page.getByRole('button', { name: /Drum Machine/ }).click();
    await expect(page).toHaveURL(/\/drums/);
  });

  test('clicking "Metronome" card navigates to /metronome', async ({ page }) => {
    // Find the card by its unique route — the onClick calls navigate('/metronome')
    // Use has-text with the unique description text to avoid matching other cards
    await page.locator('button.welcome-card').filter({
      has: page.locator('.welcome-card-title').filter({ hasText: /^Metronome$/ })
    }).click();
    await expect(page).toHaveURL(/\/metronome/);
  });

  test('clicking "Circle of 5ths" card navigates to /circle', async ({ page }) => {
    await page.getByRole('button', { name: /Circle of 5ths/ }).click();
    await expect(page).toHaveURL(/\/circle/);
  });
});
