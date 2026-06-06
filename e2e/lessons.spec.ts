import { test, expect } from './fixtures/auth-bypass';

test.describe('LessonsPage', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/lessons');
  });

  test('renders Technique and Theory section headings', async ({ page }) => {
    await expect(page.getByRole('main', { name: 'Lessons' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Lessons' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Technique', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Theory', exact: true })).toBeVisible();
  });

  test('module cards link to /lessons/:moduleId paths', async ({ page }) => {
    const firstCard = page.locator('a.lesson-module-card').first();
    await expect(firstCard).toBeVisible();
    const href = await firstCard.getAttribute('href');
    expect(href).toMatch(/^\/lessons\//);
  });

  test('Favorites filter with no favorites shows empty state', async ({ page }) => {
    // The filter uses ToggleGroupItem with value "favorites"
    await page.getByRole('radio', { name: '★ Favorites' }).click();
    await expect(page.getByText('No modules with favorite lessons found.')).toBeVisible();
  });

  test('clicking a module card navigates to the module page', async ({ page }) => {
    const firstCard = page.locator('a.lesson-module-card').first();
    const href = await firstCard.getAttribute('href');
    await firstCard.click();
    await expect(page).toHaveURL(new RegExp(`^http://localhost:5173${href}`));
  });

  test('module cards display a progress bar element', async ({ page }) => {
    const firstCard = page.locator('a.lesson-module-card').first();
    await expect(firstCard.locator('.lesson-progress-bar')).toBeVisible();
  });
});
