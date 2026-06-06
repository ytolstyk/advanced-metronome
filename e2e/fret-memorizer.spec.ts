import { test, expect } from './fixtures/auth-bypass';

test.describe('FretMemorizerPage', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/fret-memorizer');
  });

  test('renders fretboard and Start Practice button', async ({ page }) => {
    await expect(page.getByRole('main', { name: 'Fret memorizer' })).toBeVisible();
    await expect(page.getByRole('button', { name: '▶ Start Practice' })).toBeVisible();
  });

  test('string count toggle switches between 6, 7, and 8 strings', async ({ page }) => {
    // Default is 6
    const six = page.getByRole('radio', { name: '6' }).first();
    await expect(six).toHaveAttribute('data-state', 'on');

    // Switch to 7
    const seven = page.getByRole('radio', { name: '7' }).first();
    await seven.click();
    await expect(seven).toHaveAttribute('data-state', 'on');
    await expect(six).toHaveAttribute('data-state', 'off');
  });

  test('clicking Start Practice shows the quiz banner', async ({ page }) => {
    await page.getByRole('button', { name: '▶ Start Practice' }).click();
    await expect(page.getByText('Find this note')).toBeVisible();
  });

  test('clicking a correct fret shows ✓ Correct! feedback', async ({ page }) => {
    await page.getByRole('button', { name: '▶ Start Practice' }).click();
    await page.waitForSelector('text=Find this note');

    // The question div text content is "NOTE on STRING string", e.g. "G on e string"
    const questionDiv = page.locator('.text-2xl.font-bold');
    await expect(questionDiv).toBeVisible();
    const questionText = await questionDiv.textContent();
    const match = questionText?.trim().match(/^(.+?) on (.+?) string/);

    if (match) {
      const [, note, string] = match;
      // Aria-label format: "${note} on ${string} string fret ${fret}"
      const correctFret = page.getByRole('button', {
        name: new RegExp(`^${note} on ${string} string fret `)
      }).first();
      await correctFret.click();
      await expect(page.getByText('✓ Correct!')).toBeVisible();
    }
  });

  test.skip('microphone mode — skipped because mic input cannot be simulated in tests', async () => {
    // Mic mode requires getUserMedia which cannot produce real audio in tests.
    // To test: use page.context().grantPermissions(['microphone']) then click 🎤 Microphone,
    // but we cannot feed audio data to the pitch detector.
  });
});
