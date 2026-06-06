import { test, expect } from './fixtures/auth-bypass';

test.describe('CircleOfFifthsPage', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/circle');
  });

  test('renders SVG circle and orientation toolbar', async ({ page }) => {
    await expect(page.getByRole('main', { name: 'Circle of fifths' })).toBeVisible();
    await expect(page.locator('svg[aria-label="Circle of Fifths"]')).toBeVisible();
    await expect(page.getByText('Root at top')).toBeVisible();
  });

  test('orientation toolbar contains all 12 major key labels', async ({ page }) => {
    const keys = ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'Db', 'Ab', 'Eb', 'Bb', 'F'];
    for (const key of keys) {
      await expect(page.getByRole('radio', { name: key, exact: true })).toBeVisible();
    }
  });

  test('clicking a ToggleGroupItem changes root at top', async ({ page }) => {
    const gBtn = page.getByRole('radio', { name: 'G' });
    await gBtn.click();
    await expect(gBtn).toHaveAttribute('data-state', 'on');
  });

  test('clicking a segment (C major) shows info panel', async ({ page }) => {
    const cSegment = page.getByRole('button', { name: /C major/ });
    await cSegment.click();
    // Center circle should show selected key's major name
    await expect(page.locator('svg[aria-label="Circle of Fifths"]')).toContainText('C');
    // The selected segment should be pressed
    await expect(cSegment).toHaveAttribute('aria-pressed', 'true');
  });

  test('clicking the same segment again deselects it', async ({ page }) => {
    const cSegment = page.getByRole('button', { name: /C major/ });
    await cSegment.click();
    await expect(cSegment).toHaveAttribute('aria-pressed', 'true');
    await cSegment.click();
    await expect(cSegment).toHaveAttribute('aria-pressed', 'false');
  });
});
