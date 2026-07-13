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

test.describe('PracticeSessionPage – tags', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.removeItem('practice-active-session');
      localStorage.removeItem('practice-session.history');
    });
    await page.goto('/practice');
    await page.waitForLoadState('networkidle');
  });

  test('preset tag chips are visible in the setup form', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Technique' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Theory' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Song' })).toBeVisible();
  });

  test('clicking a preset tag toggles it on and off', async ({ page }) => {
    const techniqueBtn = page.getByRole('button', { name: 'Technique' });
    // Click to select
    await techniqueBtn.click();
    await expect(techniqueBtn).toHaveClass(/active|selected|ps-tag-chip--active/);
    // Click again to deselect
    await techniqueBtn.click();
    await expect(techniqueBtn).not.toHaveClass(/active|selected|ps-tag-chip--active/);
  });

  test('adding a custom tag via input appears as a chip', async ({ page }) => {
    const input = page.getByPlaceholder('Add custom tag…');
    await input.fill('Sweep Picking');
    await page.getByRole('button', { name: 'Add' }).click();
    // Input should clear after adding
    await expect(input).toHaveValue('');
    // Custom tag chip should appear
    await expect(page.getByText('Sweep Picking')).toBeVisible();
  });

  test('custom tag can be removed by clicking its × button', async ({ page }) => {
    const input = page.getByPlaceholder('Add custom tag…');
    await input.fill('Legato');
    await page.getByRole('button', { name: 'Add' }).click();
    // Remove it
    await page.getByRole('button', { name: '×' }).first().click();
    await expect(page.getByText('Legato')).not.toBeVisible();
  });

  test('selected tag appears in the session summary', async ({ page }) => {
    // Select a tag
    await page.getByRole('button', { name: 'Theory' }).click();
    // Start session and wait for active phase to render
    await page.getByRole('button', { name: 'Start Session' }).click();
    await expect(page.getByRole('button', { name: 'End Session' })).toBeVisible();
    // End session and verify summary appears
    await page.getByRole('button', { name: 'End Session' }).click();
    await expect(page.getByText('Session complete')).toBeVisible();
    // The Theory tag should appear at least once in the page (summary chip + history chip)
    await expect(page.locator('.ps-tag-chip').filter({ hasText: 'Theory' }).first()).toBeVisible();
  });
});
