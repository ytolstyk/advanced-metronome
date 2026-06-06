import { test, expect } from './fixtures/auth-bypass';

test.describe('PracticeSessionPage', () => {
  test.beforeEach(async ({ page }) => {
    // Clear any persisted active session so we always start in setup phase
    await page.addInitScript(() => {
      localStorage.removeItem('practice-active-session');
    });
    await page.goto('/practice');
    await page.waitForLoadState('networkidle');
  });

  test('renders setup phase with "Start Session" button', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Practice Tracker' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Start Session' })).toBeVisible();
  });

  test('duration toggle has "30m" selected by default', async ({ page }) => {
    const thirtyBtn = page.getByRole('radio', { name: '30m' });
    await expect(thirtyBtn).toHaveAttribute('data-state', 'on');
  });

  test('selecting "15m" duration switches the active toggle', async ({ page }) => {
    const fifteenBtn = page.getByRole('radio', { name: '15m' });
    await fifteenBtn.click();
    await expect(fifteenBtn).toHaveAttribute('data-state', 'on');
    await expect(page.getByRole('radio', { name: '30m' })).toHaveAttribute('data-state', 'off');
  });

  test('BPM input accepts numeric input', async ({ page }) => {
    const bpmInput = page.locator('#ps-bpm');
    await bpmInput.fill('140');
    await expect(bpmInput).toHaveValue('140');
  });

  test('clicking Start Session transitions to active phase with a timer', async ({ page }) => {
    await page.getByRole('button', { name: 'Start Session' }).click();
    await expect(page.getByRole('button', { name: 'End Session' })).toBeVisible();
    // End the session to clean up
    await page.getByRole('button', { name: 'End Session' }).click();
  });
});
