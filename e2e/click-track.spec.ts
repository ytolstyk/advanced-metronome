import { test, expect } from './fixtures/auth-bypass';

test.describe('ClickTrackPage', () => {
  test.beforeEach(async ({ page }) => {
    // Clear persisted state so we always start from a clean track. Init scripts re-run on every
    // navigation, so a sessionStorage marker makes the clear happen once and a reload keeps state.
    await page.addInitScript(() => {
      if (sessionStorage.getItem('e2e-click-track-cleared')) return;
      localStorage.removeItem('click-track-state');
      sessionStorage.setItem('e2e-click-track-cleared', '1');
    });
    await page.goto('/click-track');
    await page.waitForLoadState('networkidle');
  });

  test('renders Add Segment form with BPM and time sig fields', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Add Segment' })).toBeVisible();
    await expect(page.locator('.ct-form-label', { hasText: 'BPM' })).toBeVisible();
    await expect(page.locator('.ct-form-label', { hasText: 'Time sig' })).toBeVisible();
  });

  test('Play button is disabled when no segments exist', async ({ page }) => {
    const playBtn = page.getByRole('button', { name: /Play/ });
    await expect(playBtn).toBeDisabled();
  });

  test('adding a segment creates a card in the segment list', async ({ page }) => {
    // The empty state message should be visible
    await expect(page.getByText('No segments yet')).toBeVisible();

    // Submit the default draft (which has valid defaults)
    await page.getByRole('button', { name: '+ Add' }).click();

    // Empty state should be gone and a piece card should appear
    await expect(page.getByText('No segments yet')).not.toBeVisible();
    await expect(page.locator('.ct-piece-card')).toBeVisible();
  });

  test('Play button becomes enabled after adding a segment', async ({ page }) => {
    await page.getByRole('button', { name: '+ Add' }).click();
    const playBtn = page.getByRole('button', { name: /Play/ });
    await expect(playBtn).toBeEnabled();
  });

  test('Speed slider is present and shows percentage label', async ({ page }) => {
    await expect(page.getByText(/Speed:/)).toBeVisible();
    // Default is 100%
    await expect(page.locator('.ct-speed-label')).toContainText('100%');
  });

  test.describe('import tempo map', () => {
    const SONG = '\\tempo 120\n.\n\\ts 4 4\n:4 1.1*4 | 1.1*4 |\n\\ts 3 4 \\tempo 90 1.1*3';
    const upload = (page: import('@playwright/test').Page, content: string, name = 'song.alphatex') =>
      page.getByLabel('Guitar Pro or AlphaTex file').setInputFiles({ name, mimeType: 'text/plain', buffer: Buffer.from(content) });

    test('the Import tempo map button opens an explainer first, and Cancel closes it', async ({ page }) => {
      await page.getByRole('button', { name: /Import tempo map/ }).click();
      const dialog = page.getByRole('dialog', { name: 'Import tempo map' });
      await expect(dialog).toBeVisible();
      await expect(dialog.getByText('Files it accepts')).toBeVisible();
      await expect(dialog.getByText(/\.gpx\) aren't supported/)).toBeVisible();
      await expect(dialog.getByRole('button', { name: /Choose file/ })).toBeVisible();
      await dialog.getByRole('button', { name: 'Cancel' }).click();
      await expect(dialog).toBeHidden();
    });

    test('dropping a file on the explainer closes it and opens the import preview', async ({ page }) => {
      await page.getByRole('button', { name: /Import tempo map/ }).click();
      const explainer = page.getByRole('dialog', { name: 'Import tempo map' });
      await expect(explainer.getByText('Drag a .gp or .alphatex file here')).toBeVisible();

      // Playwright has no native file drag, so build the DataTransfer in the page and dispatch the events.
      const handle = await explainer.elementHandle();
      await page.evaluate(
        ({ el, content }) => {
          const transfer = new DataTransfer();
          transfer.items.add(new File([content], 'song.alphatex', { type: 'text/plain' }));
          el!.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: transfer }));
          el!.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }));
        },
        { el: handle, content: SONG },
      );

      await expect(explainer.getByText('Files it accepts')).toBeHidden();
      const dialog = page.getByRole('dialog');
      await expect(dialog.getByText(/3 bars, 2 segments/)).toBeVisible();
      await expect(dialog.getByRole('list', { name: 'First segments' })).toContainText('4/4 ♩=120');
      await dialog.getByRole('button', { name: 'Import' }).click();
      await expect(dialog).toBeHidden();
      await expect(page.locator('.ct-piece-card')).toHaveCount(2);
    });

    test('imports a song, shows the preview first, and keeps the track after a reload', async ({ page }) => {
      await upload(page, SONG);
      const dialog = page.getByRole('dialog');
      await expect(dialog.getByText(/3 bars, 2 segments/)).toBeVisible();
      await expect(dialog.getByRole('list', { name: 'First segments' })).toContainText('4/4 ♩=120');
      await dialog.getByRole('button', { name: 'Import' }).click();

      await expect(dialog).toBeHidden();
      await expect(page.locator('.ct-piece-card')).toHaveCount(2);
      await page.reload();
      await expect(page.locator('.ct-piece-card')).toHaveCount(2);
    });

    test('asks before replacing a track that already has segments', async ({ page }) => {
      await page.getByRole('button', { name: '+ Add' }).click();
      await expect(page.locator('.ct-piece-card')).toHaveCount(1);

      let confirmations = 0;
      page.on('dialog', async (native) => {
        confirmations++;
        await (confirmations === 1 ? native.dismiss() : native.accept());
      });
      await upload(page, SONG);
      const dialog = page.getByRole('dialog');
      await dialog.getByRole('button', { name: 'Replace track' }).click();
      await expect(dialog).toBeVisible(); // cancelled: nothing replaced yet
      await expect(page.locator('.ct-piece-card')).toHaveCount(1);

      await dialog.getByRole('button', { name: 'Replace track' }).click();
      await expect(dialog).toBeHidden();
      await expect(page.locator('.ct-piece-card')).toHaveCount(2);
    });

    test('shows an error for a file that is not a score', async ({ page }) => {
      await upload(page, 'this is not a score');
      await expect(page.getByRole('dialog').getByRole('alert')).toContainText('readable Guitar Pro');
      await expect(page.getByRole('dialog').getByRole('button', { name: 'Import' })).toHaveCount(0);
    });

    test('fits a 375px phone screen without sideways scrolling', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 700 });
      await upload(page, SONG);
      const dialog = page.getByRole('dialog');
      await expect(dialog.getByRole('button', { name: 'Import' })).toBeVisible();
      await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeVisible();
      const overflows = await dialog.evaluate((el) => el.scrollWidth > el.clientWidth);
      expect(overflows).toBe(false);
    });
  });
  test('Save to Band is only offered to signed-in users', async ({ page }) => {
    await page.getByRole('button', { name: '+ Add' }).click();
    await expect(page.locator('.ct-piece-card')).toBeVisible();
    // Signed out, the cloud actions are replaced by a sign-in prompt, and band saving is one of them.
    await expect(page.getByRole('button', { name: /Save to Band/ })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Save to Cloud/ })).toHaveCount(0);
  });

  test('a stale or invalid band hand-off is ignored and does not load a track', async ({ page }) => {
    await page.evaluate(() => {
      sessionStorage.setItem('band-to-click-import', JSON.stringify({ pieces: [{ id: 'x' }], groups: [], title: 'Bad', at: Date.now() }));
    });
    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(page.getByText('No segments yet')).toBeVisible();
    await expect(page.getByText(/click track from your band/)).toHaveCount(0);
    expect(await page.evaluate(() => sessionStorage.getItem('band-to-click-import'))).toBeNull();
  });
});
