import { test, expect } from './fixtures/auth-bypass';

test.describe('Legal pages', () => {
  test('footer links navigate to privacy policy and terms of service', async ({ page }) => {
    await page.goto('/');
    const legal = page.getByRole('navigation', { name: 'Legal' });

    await legal.getByRole('link', { name: 'Privacy Policy' }).click();
    await expect(page).toHaveURL(/\/privacy$/);
    await expect(page.getByRole('heading', { name: 'Privacy Policy', level: 1 })).toBeVisible();

    await legal.getByRole('link', { name: 'Terms of Service' }).click();
    await expect(page).toHaveURL(/\/terms$/);
    await expect(page.getByRole('heading', { name: 'Terms of Service', level: 1 })).toBeVisible();
  });
});
