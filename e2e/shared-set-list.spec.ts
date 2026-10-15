import { test, expect } from './fixtures/auth-bypass';

// The fixture blocks every AppSync call, so these cover the signed-out page frame and its failure
// state. The data paths (shared / not shared / forged rows) are covered by unit tests and by the
// sandbox check in scripts/bands-auth-check.mjs.
test.describe('Shared set list (signed out)', () => {
  test('/shared/:setListId renders without a sign-in gate and tries to load the list', async ({ page }) => {
    await page.goto('/shared/00000000-0000-0000-0000-000000000000');
    await expect(page.getByRole('main', { name: 'Shared set list' })).toBeVisible();
    await expect(page.getByText(/sign in to view/i)).toHaveCount(0);
    // Blocked network: the page reports a failed load with a retry instead of looking empty.
    await expect(page.getByRole('alert')).toContainText('Couldn’t load this set list');
    await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
  });
});
